import { applyNameFixPlan as computeNameFixPlan } from "@shared/physical-name";
import type {
  NameFixConflict,
  NameFixDecisionTrace,
  NameFixPreviewRequest,
  NameFixPreviewResponse,
  NameFixScope,
  NameFixTableMapping,
  TableInfo,
} from "@shared/schema";
import { runParseWorkbookBundle } from "../excel-executor";
import type { NameFixCellChange } from "../excel-writeback";
import { storage } from "../../storage";
import {
  cleanupExpiredPreviewPlans,
  computePlanHash,
  PREVIEW_TTL_MS,
  previewPlanCache,
  randomId,
  type StoredFilePreviewPlan,
} from "./shared";

function resolveSelectedSheets(
  scope: NameFixScope,
  request: NameFixPreviewRequest,
  availableSheets: string[],
): string[] {
  const available = new Set(availableSheets);

  if (scope === "all_sheets") {
    return availableSheets;
  }

  if (scope === "current_sheet") {
    if (!request.currentSheetName) {
      return [];
    }
    return available.has(request.currentSheetName) ? [request.currentSheetName] : [];
  }

  const selected = new Set<string>();
  for (const sheetName of request.selectedSheetNames ?? []) {
    if (available.has(sheetName)) {
      selected.add(sheetName);
    }
  }
  if (selected.size === 0 && request.currentSheetName && available.has(request.currentSheetName)) {
    selected.add(request.currentSheetName);
  }
  return Array.from(selected);
}

function normalizeSelectedTableIndexes(indexes?: number[]): number[] {
  if (!indexes || indexes.length === 0) {
    return [];
  }
  const normalized = new Set<number>();
  indexes.forEach((value) => {
    if (Number.isInteger(value) && value >= 0) {
      normalized.add(value);
    }
  });
  return Array.from(normalized).sort((a, b) => a - b);
}

function buildTableMappings(
  selectedTables: Array<{ sheetName: string; tableIndex: number; table: TableInfo }>,
  fixedTables: TableInfo[],
): {
  mappings: NameFixTableMapping[];
  changedTableCount: number;
  changedColumnCount: number;
  unresolvedSourceRefCount: number;
  cellChanges: NameFixCellChange[];
} {
  const mappings: NameFixTableMapping[] = [];
  const cellChanges: NameFixCellChange[] = [];
  let changedTableCount = 0;
  let changedColumnCount = 0;
  let unresolvedSourceRefCount = 0;

  selectedTables.forEach((context, index) => {
    const sourceTable = context.table;
    const fixedTable = fixedTables[index];
    const tableChanged = sourceTable.physicalTableName !== fixedTable.physicalTableName;
    if (tableChanged) {
      changedTableCount += 1;
    }

    const tableSourceRef = sourceTable.sourceRef?.physicalName;
    const tableSourceRefExists = Boolean(tableSourceRef);
    if (tableChanged && !tableSourceRefExists) {
      unresolvedSourceRefCount += 1;
    }
    if (tableChanged && tableSourceRef) {
      cellChanges.push({
        sheetName: tableSourceRef.sheetName || context.sheetName,
        row: tableSourceRef.row,
        col: tableSourceRef.col,
        sourceAddress: tableSourceRef.address,
        beforeName: sourceTable.physicalTableName,
        afterName: fixedTable.physicalTableName,
        tableIndex: index,
        target: "table",
      });
    }

    const columnMappings = sourceTable.columns.map((column, columnIndex) => {
      const fixedColumn = fixedTable.columns[columnIndex];
      const columnChanged = (column.physicalName ?? "") !== (fixedColumn?.physicalName ?? "");
      if (columnChanged) {
        changedColumnCount += 1;
      }

      const sourceRefExists = Boolean(column.sourceRef);
      if (columnChanged && !sourceRefExists) {
        unresolvedSourceRefCount += 1;
      }
      if (columnChanged && column.sourceRef) {
        cellChanges.push({
          sheetName: column.sourceRef.sheetName || context.sheetName,
          row: column.sourceRef.row,
          col: column.sourceRef.col,
          sourceAddress: column.sourceRef.address,
          beforeName: column.physicalName ?? "",
          afterName: fixedColumn?.physicalName ?? "",
          tableIndex: index,
          columnIndex,
          target: "column",
        });
      }

      return {
        columnIndex,
        logicalName: column.logicalName,
        physicalNameBefore: column.physicalName ?? "",
        physicalNameAfter: fixedColumn?.physicalName ?? "",
        sourceRef: column.sourceRef,
        sourceRefExists,
      };
    });

    mappings.push({
      sheetName: context.sheetName,
      tableIndex: context.tableIndex,
      logicalTableName: sourceTable.logicalTableName,
      physicalTableNameBefore: sourceTable.physicalTableName,
      physicalTableNameAfter: fixedTable.physicalTableName,
      sourceRef: sourceTable.sourceRef,
      sourceRefExists: tableSourceRefExists,
      unresolvedSourceRefs:
        (tableChanged && !tableSourceRefExists ? 1 : 0) +
        columnMappings.filter(
          (column) =>
            column.physicalNameBefore !== column.physicalNameAfter && !column.sourceRefExists,
        ).length,
      columns: columnMappings,
    });
  });

  return {
    mappings,
    changedTableCount,
    changedColumnCount,
    unresolvedSourceRefCount,
    cellChanges,
  };
}

function augmentConflictsAndTrace(
  selectedTables: Array<{ sheetName: string; tableIndex: number; table: TableInfo }>,
  conflicts: NameFixConflict[],
  decisionTrace: NameFixDecisionTrace[],
): {
  conflicts: NameFixConflict[];
  decisionTrace: NameFixDecisionTrace[];
} {
  const mappedConflicts = conflicts.map((conflict) => {
    const context = selectedTables[conflict.tableIndex];
    return {
      ...conflict,
      sheetName: context?.sheetName,
      tableName: context?.table.physicalTableName,
    };
  });

  const mappedTrace = decisionTrace.map((item) => {
    const context = selectedTables[item.tableIndex];
    return {
      ...item,
      sheetName: context?.sheetName,
      tableName: context?.table.physicalTableName,
    };
  });

  return {
    conflicts: mappedConflicts,
    decisionTrace: mappedTrace,
  };
}

async function buildFilePreviewPlan(
  request: NameFixPreviewRequest,
  fileId: number,
): Promise<StoredFilePreviewPlan> {
  const file = await storage.getUploadedFile(fileId);
  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  const settings = await storage.getSettings();
  const bundle = await runParseWorkbookBundle(
    file.filePath,
    {
      maxConsecutiveEmptyRows: settings.maxConsecutiveEmptyRows,
      pkMarkers: settings.pkMarkers,
    },
    file.fileHash,
  );

  const selectedSheets = resolveSelectedSheets(request.scope, request, Object.keys(bundle.tablesBySheet));
  const selectedCurrentSheetTableIndexes = request.scope === "current_sheet"
    ? normalizeSelectedTableIndexes(request.selectedTableIndexes)
    : [];
  const selectedCurrentSheetTableIndexSet = selectedCurrentSheetTableIndexes.length > 0
    ? new Set(selectedCurrentSheetTableIndexes)
    : null;
  const selectedTables: Array<{ sheetName: string; tableIndex: number; table: TableInfo }> = [];
  for (const sheetName of selectedSheets) {
    const tables = bundle.tablesBySheet[sheetName] ?? [];
    tables.forEach((table, tableIndex) => {
      if (
        selectedCurrentSheetTableIndexSet
        && request.currentSheetName
        && sheetName === request.currentSheetName
        && !selectedCurrentSheetTableIndexSet.has(tableIndex)
      ) {
        return;
      }
      selectedTables.push({ sheetName, tableIndex, table });
    });
  }

  if (
    request.scope === "current_sheet"
    && selectedCurrentSheetTableIndexSet
    && selectedTables.length === 0
  ) {
    throw new Error("No tables matched selectedTableIndexes in current sheet.");
  }

  const fixed = computeNameFixPlan(selectedTables.map((item) => item.table), {
    conflictStrategy: request.conflictStrategy,
    reservedWordStrategy: request.reservedWordStrategy,
    lengthOverflowStrategy: request.lengthOverflowStrategy,
    maxIdentifierLength: request.maxIdentifierLength,
  });

  const { conflicts, decisionTrace } = augmentConflictsAndTrace(
    selectedTables,
    fixed.conflicts as NameFixConflict[],
    fixed.decisionTrace as NameFixDecisionTrace[],
  );

  const mappingsSummary = buildTableMappings(selectedTables, fixed.fixedTables as TableInfo[]);

  return {
    fileId,
    originalName: file.originalName,
    sourcePath: file.filePath,
    selectedSheets,
    changedTableCount: mappingsSummary.changedTableCount,
    changedColumnCount: mappingsSummary.changedColumnCount,
    blockingConflictCount: conflicts.filter((conflict) => conflict.blocking).length,
    unresolvedSourceRefCount: mappingsSummary.unresolvedSourceRefCount,
    conflicts,
    decisionTrace,
    tableMappings: mappingsSummary.mappings,
    cellChanges: mappingsSummary.cellChanges,
  };
}

export async function previewNameFixPlan(
  request: NameFixPreviewRequest,
): Promise<NameFixPreviewResponse> {
  cleanupExpiredPreviewPlans();

  const filePlans: StoredFilePreviewPlan[] = [];
  for (const fileId of request.fileIds) {
    filePlans.push(await buildFilePreviewPlan(request, fileId));
  }

  const summary = {
    fileCount: filePlans.length,
    tableCount: filePlans.reduce((acc, item) => acc + item.tableMappings.length, 0),
    changedTableCount: filePlans.reduce((acc, item) => acc + item.changedTableCount, 0),
    changedColumnCount: filePlans.reduce((acc, item) => acc + item.changedColumnCount, 0),
    blockingConflictCount: filePlans.reduce((acc, item) => acc + item.blockingConflictCount, 0),
    unresolvedSourceRefCount: filePlans.reduce((acc, item) => acc + item.unresolvedSourceRefCount, 0),
  };

  const hashPayload = {
    request: {
      fileIds: request.fileIds,
      scope: request.scope,
      currentSheetName: request.currentSheetName,
      selectedSheetNames: request.selectedSheetNames,
      selectedTableIndexes: normalizeSelectedTableIndexes(request.selectedTableIndexes),
      conflictStrategy: request.conflictStrategy,
      reservedWordStrategy: request.reservedWordStrategy,
      lengthOverflowStrategy: request.lengthOverflowStrategy,
      maxIdentifierLength: request.maxIdentifierLength,
    },
    files: filePlans.map((filePlan) => ({
      fileId: filePlan.fileId,
      sourcePath: filePlan.sourcePath,
      selectedSheets: filePlan.selectedSheets,
      tableMappings: filePlan.tableMappings,
      conflicts: filePlan.conflicts,
    })),
  };

  const planHash = computePlanHash(hashPayload);
  const planId = randomId("name_fix_plan");
  const createdAt = Date.now();
  const expiresAt = createdAt + PREVIEW_TTL_MS;

  previewPlanCache.set(planId, {
    planId,
    planHash,
    createdAt,
    expiresAt,
    scope: request.scope,
    conflictStrategy: request.conflictStrategy,
    reservedWordStrategy: request.reservedWordStrategy,
    lengthOverflowStrategy: request.lengthOverflowStrategy,
    maxIdentifierLength: request.maxIdentifierLength,
    files: filePlans,
  });

  return {
    planId,
    planHash,
    expiresAt: new Date(expiresAt).toISOString(),
    summary,
    files: filePlans.map((filePlan) => ({
      fileId: filePlan.fileId,
      originalName: filePlan.originalName,
      sourcePath: filePlan.sourcePath,
      selectedSheets: filePlan.selectedSheets,
      tableCount: filePlan.tableMappings.length,
      changedTableCount: filePlan.changedTableCount,
      changedColumnCount: filePlan.changedColumnCount,
      blockingConflictCount: filePlan.blockingConflictCount,
      unresolvedSourceRefCount: filePlan.unresolvedSourceRefCount,
      conflicts: filePlan.conflicts,
      decisionTrace: filePlan.decisionTrace,
      tableMappings: filePlan.tableMappings,
    })),
  };
}
