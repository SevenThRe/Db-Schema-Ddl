import crypto from "crypto";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import path from "path";
import os from "os";
import archiver from "archiver";
import {
  type NameFixPreviewRequest,
  type NameFixPreviewResponse,
  type NameFixApplyRequest,
  type NameFixApplyResponse,
  type NameFixRollbackRequest,
  type NameFixRollbackResponse,
  type NameFixJob,
  type NameFixJobItem,
  type NameFixBackup,
  type NameFixConflict,
  type NameFixDecisionTrace,
  type NameFixTableMapping,
  type NameFixMode,
  type NameFixScope,
} from "@shared/schema";
import { applyNameFixPlan as computeNameFixPlan } from "@shared/physical-name";
import type { TableInfo } from "@shared/schema";
import { storage } from "../storage";
import { runParseWorkbookBundle } from "./excel-executor";
import { applyExcelNameChanges, type NameFixCellChange } from "./excel-writeback";

const PREVIEW_TTL_MS = 30 * 60 * 1000;
const BACKUP_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_BACKUP_HISTORY_PER_SOURCE = 20;
const DOWNLOAD_TOKEN_TTL_MS = 30 * 60 * 1000;

interface StoredFilePreviewPlan {
  fileId: number;
  originalName: string;
  sourcePath: string;
  selectedSheets: string[];
  changedTableCount: number;
  changedColumnCount: number;
  blockingConflictCount: number;
  unresolvedSourceRefCount: number;
  conflicts: NameFixConflict[];
  decisionTrace: NameFixDecisionTrace[];
  tableMappings: NameFixTableMapping[];
  cellChanges: NameFixCellChange[];
}

interface StoredPreviewPlan {
  planId: string;
  planHash: string;
  createdAt: number;
  expiresAt: number;
  scope: NameFixScope;
  conflictStrategy: NameFixPreviewRequest["conflictStrategy"];
  reservedWordStrategy: NameFixPreviewRequest["reservedWordStrategy"];
  lengthOverflowStrategy: NameFixPreviewRequest["lengthOverflowStrategy"];
  maxIdentifierLength: number;
  files: StoredFilePreviewPlan[];
}

interface NameFixDownloadTicket {
  token: string;
  outputPath: string;
  downloadFilename: string;
  createdAt: number;
  expiresAt: number;
  deleteOnExpire?: boolean;
}

const previewPlanCache = new Map<string, StoredPreviewPlan>();
const downloadTokenCache = new Map<string, NameFixDownloadTicket>();
const fileLocks = new Map<string, string>();
let maintenanceStarted = false;

function computePlanHash(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function computeBufferHash(payload: Buffer): string {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
}

function cleanupExpiredPreviewPlans(): void {
  const now = Date.now();
  for (const [planId, plan] of Array.from(previewPlanCache.entries())) {
    if (plan.expiresAt <= now) {
      previewPlanCache.delete(planId);
    }
  }
}

function cleanupExpiredDownloadTokens(): void {
  const now = Date.now();
  for (const [token, ticket] of Array.from(downloadTokenCache.entries())) {
    if (ticket.expiresAt <= now) {
      downloadTokenCache.delete(token);
      if (ticket.deleteOnExpire) {
        void fs.rm(ticket.outputPath, { force: true }).catch(() => {
          // best effort cleanup for ephemeral bundle files
        });
      }
    }
  }
}

function createDownloadTicket(
  outputPath: string,
  preferredName: string,
  options?: { deleteOnExpire?: boolean; preserveFilename?: boolean },
): NameFixDownloadTicket {
  const token = randomId("name_fix_download");
  const now = Date.now();
  const ext = path.extname(outputPath) || ".xlsx";
  const safeName = path.basename(preferredName || path.basename(outputPath));
  const filenameBase = safeName.replace(/\.[^.]+$/, "");
  const downloadFilename = options?.preserveFilename
    ? safeName
    : `${filenameBase}_fixed${ext}`;
  const ticket: NameFixDownloadTicket = {
    token,
    outputPath,
    downloadFilename,
    createdAt: now,
    expiresAt: now + DOWNLOAD_TOKEN_TTL_MS,
    deleteOnExpire: options?.deleteOnExpire,
  };
  downloadTokenCache.set(token, ticket);
  return ticket;
}

async function createNameFixBundleArchive(
  jobId: string,
  successfulFiles: Array<{
    originalName: string;
    outputPath: string;
    reportJsonPath?: string;
    reportTextPath?: string;
  }>,
): Promise<{ archivePath: string; archiveFilename: string }> {
  const bundleDir = path.join(os.tmpdir(), "name-fix-download-bundles");
  await fs.mkdir(bundleDir, { recursive: true });

  const archiveFilename = `name_fix_bundle_${jobId}.zip`;
  const archivePath = path.join(bundleDir, archiveFilename);

  await new Promise<void>((resolve, reject) => {
    const output = fsSync.createWriteStream(archivePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", (error) => reject(error));
    archive.on("error", (error) => reject(error));

    archive.pipe(output);
    for (const file of successfulFiles) {
      const ext = path.extname(file.outputPath) || ".xlsx";
      const safeBaseName = path.basename(file.originalName).replace(/\.[^.]+$/, "");
      archive.file(file.outputPath, { name: `${safeBaseName}${ext}` });
      if (file.reportJsonPath) {
        archive.file(file.reportJsonPath, { name: `${safeBaseName}__name_fix_report.json` });
      }
      if (file.reportTextPath) {
        archive.file(file.reportTextPath, { name: `${safeBaseName}__name_fix_report.txt` });
      }
    }

    void archive.finalize();
  });

  return { archivePath, archiveFilename };
}

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
  const selectedTables: Array<{ sheetName: string; tableIndex: number; table: TableInfo }> = [];
  for (const sheetName of selectedSheets) {
    const tables = bundle.tablesBySheet[sheetName] ?? [];
    tables.forEach((table, tableIndex) => {
      selectedTables.push({ sheetName, tableIndex, table });
    });
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

function makePlainTextReport(payload: {
  jobId: string;
  planId: string;
  sourcePath: string;
  outputPath?: string;
  backupPath?: string;
  changedTableCount: number;
  changedColumnCount: number;
  skippedCount: number;
  issues: Array<{ sheetName: string; sourceAddress: string; reason: string }>;
}): string {
  const lines: string[] = [];
  lines.push("Name fix execution report");
  lines.push(`jobId: ${payload.jobId}`);
  lines.push(`planId: ${payload.planId}`);
  lines.push(`sourcePath: ${payload.sourcePath}`);
  lines.push(`outputPath: ${payload.outputPath ?? ""}`);
  lines.push(`backupPath: ${payload.backupPath ?? ""}`);
  lines.push(`changedTableCount: ${payload.changedTableCount}`);
  lines.push(`changedColumnCount: ${payload.changedColumnCount}`);
  lines.push(`skippedCount: ${payload.skippedCount}`);
  lines.push("");
  if (payload.issues.length > 0) {
    lines.push("issues:");
    payload.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. [${issue.sheetName} ${issue.sourceAddress}] ${issue.reason}`);
    });
  }
  return lines.join("\n");
}

async function writeExecutionReport(
  includeReport: boolean,
  outputPath: string,
  payload: Record<string, unknown>,
): Promise<{ reportJsonPath?: string; reportTextPath?: string }> {
  if (!includeReport) {
    return {};
  }
  const ext = path.extname(outputPath);
  const baseName = path.basename(outputPath, ext);
  const reportDir = path.join(path.dirname(outputPath), "name-fix-reports");
  await fs.mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportJsonPath = path.join(reportDir, `${baseName}_${stamp}.json`);
  const reportTextPath = path.join(reportDir, `${baseName}_${stamp}.txt`);
  await fs.writeFile(reportJsonPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.writeFile(
    reportTextPath,
    makePlainTextReport({
      jobId: String(payload.jobId ?? ""),
      planId: String(payload.planId ?? ""),
      sourcePath: String(payload.sourcePath ?? ""),
      outputPath: payload.outputPath ? String(payload.outputPath) : undefined,
      backupPath: payload.backupPath ? String(payload.backupPath) : undefined,
      changedTableCount: Number(payload.changedTableCount ?? 0),
      changedColumnCount: Number(payload.changedColumnCount ?? 0),
      skippedCount: Number(payload.skippedCount ?? 0),
      issues: Array.isArray(payload.issues)
        ? payload.issues.map((item) => ({
            sheetName: String((item as any).sheetName ?? ""),
            sourceAddress: String((item as any).sourceAddress ?? ""),
            reason: String((item as any).reason ?? ""),
          }))
        : [],
    }),
    "utf-8",
  );
  return { reportJsonPath, reportTextPath };
}

function collectChangedItemRecords(jobId: string, filePlan: StoredFilePreviewPlan): Omit<NameFixJobItem, "id" | "createdAt">[] {
  const records: Omit<NameFixJobItem, "id" | "createdAt">[] = [];
  filePlan.tableMappings.forEach((mapping) => {
    if (mapping.physicalTableNameBefore !== mapping.physicalTableNameAfter) {
      records.push({
        jobId,
        fileId: filePlan.fileId,
        sheetName: mapping.sheetName,
        tableIndex: mapping.tableIndex,
        target: "table",
        beforeName: mapping.physicalTableNameBefore,
        afterName: mapping.physicalTableNameAfter,
        action: "rename",
        sourceAddress: mapping.sourceRef?.physicalName?.address,
        blocking: !mapping.sourceRefExists,
        reason: !mapping.sourceRefExists ? "Missing sourceRef for table physical name." : undefined,
      });
    }

    mapping.columns.forEach((column) => {
      if (column.physicalNameBefore === column.physicalNameAfter) {
        return;
      }
      records.push({
        jobId,
        fileId: filePlan.fileId,
        sheetName: mapping.sheetName,
        tableIndex: mapping.tableIndex,
        columnIndex: column.columnIndex,
        target: "column",
        beforeName: column.physicalNameBefore,
        afterName: column.physicalNameAfter,
        action: "rename",
        sourceAddress: column.sourceRef?.address,
        blocking: !column.sourceRefExists,
        reason: !column.sourceRefExists ? "Missing sourceRef for column physical name." : undefined,
      });
    });
  });
  return records;
}

function isPathWithin(basePath: string, candidatePath: string): boolean {
  const normalizedBase = path.resolve(basePath);
  const normalizedCandidate = path.resolve(candidatePath);
  const compareBase = process.platform === "win32" ? normalizedBase.toLowerCase() : normalizedBase;
  const compareCandidate = process.platform === "win32" ? normalizedCandidate.toLowerCase() : normalizedCandidate;
  const relative = path.relative(compareBase, compareCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateTargetDirectory(targetDirectory: string | undefined, allowExternalPathWrite: boolean): void {
  const allowExternalWriteForCurrentRuntime = allowExternalPathWrite && process.env.ELECTRON_MODE === "true";
  if (!targetDirectory || allowExternalWriteForCurrentRuntime) {
    return;
  }
  const uploadsRoot = path.resolve(process.env.UPLOADS_DIR || "uploads");
  if (!isPathWithin(uploadsRoot, targetDirectory)) {
    throw new Error("targetDirectory is outside allowed uploads directory.");
  }
}

type NameFixApplyFileResult = NameFixApplyResponse["files"][number];

interface FilePlanApplyOutcome {
  fileResult: NameFixApplyFileResult;
  success: boolean;
  outputPath?: string;
  backupPath?: string;
  reportJsonPath?: string;
  reportTextPath?: string;
  downloadableFile?: {
    originalName: string;
    outputPath: string;
    reportJsonPath?: string;
    reportTextPath?: string;
  };
}

async function executeFilePlanApply(
  params: {
    filePlan: StoredFilePreviewPlan;
    jobId: string;
    planId: string;
    planHash: string;
    mode: NameFixMode;
    targetDirectory?: string;
    includeReport: boolean;
    backupRetentionDays: number;
  },
): Promise<FilePlanApplyOutcome> {
  const {
    filePlan,
    jobId,
    planId,
    planHash,
    mode,
    targetDirectory,
    includeReport,
    backupRetentionDays,
  } = params;

  if (fileLocks.has(filePlan.sourcePath)) {
    return {
      success: false,
      fileResult: {
        fileId: filePlan.fileId,
        sourcePath: filePlan.sourcePath,
        success: false,
        changedTableCount: filePlan.changedTableCount,
        changedColumnCount: filePlan.changedColumnCount,
        skippedChanges: filePlan.cellChanges.length,
        error: "File is currently locked by another name-fix operation.",
      },
    };
  }

  if (filePlan.blockingConflictCount > 0 || filePlan.unresolvedSourceRefCount > 0) {
    return {
      success: false,
      fileResult: {
        fileId: filePlan.fileId,
        sourcePath: filePlan.sourcePath,
        success: false,
        changedTableCount: filePlan.changedTableCount,
        changedColumnCount: filePlan.changedColumnCount,
        skippedChanges: filePlan.cellChanges.length,
        error:
          filePlan.blockingConflictCount > 0
            ? "Blocking naming conflicts detected. Please adjust strategy and preview again."
            : "Missing sourceRef detected. Apply operation is blocked for this file.",
      },
    };
  }

  fileLocks.set(filePlan.sourcePath, jobId);
  try {
    const writeResult = await applyExcelNameChanges(filePlan.sourcePath, filePlan.cellChanges, {
      mode,
      targetDirectory,
    });

    const reportPayload = {
      jobId,
      planId,
      planHash,
      fileId: filePlan.fileId,
      sourcePath: filePlan.sourcePath,
      outputPath: writeResult.outputPath,
      backupPath: writeResult.backupPath,
      changedTableCount: filePlan.changedTableCount,
      changedColumnCount: filePlan.changedColumnCount,
      skippedCount: writeResult.skippedCount,
      issues: writeResult.issues,
      conflicts: filePlan.conflicts,
      decisionTrace: filePlan.decisionTrace,
      tableMappings: filePlan.tableMappings,
    };
    const reportPaths = await writeExecutionReport(
      includeReport,
      writeResult.outputPath,
      reportPayload,
    );

    if (writeResult.backupPath && writeResult.backupHash) {
      const expiresAt = new Date(
        Date.now() + backupRetentionDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      await storage.createNameFixBackup({
        jobId,
        fileId: filePlan.fileId,
        sourcePath: filePlan.sourcePath,
        backupPath: writeResult.backupPath,
        backupHash: writeResult.backupHash,
        restorable: true,
        expiresAt,
      });
    }

    const downloadTicket =
      mode === "replace_download"
        ? createDownloadTicket(writeResult.outputPath, filePlan.originalName)
        : undefined;
    return {
      success: true,
      outputPath: writeResult.outputPath,
      backupPath: writeResult.backupPath,
      reportJsonPath: reportPaths.reportJsonPath,
      reportTextPath: reportPaths.reportTextPath,
      downloadableFile: {
        originalName: filePlan.originalName,
        outputPath: writeResult.outputPath,
        reportJsonPath: reportPaths.reportJsonPath,
        reportTextPath: reportPaths.reportTextPath,
      },
      fileResult: {
        fileId: filePlan.fileId,
        sourcePath: filePlan.sourcePath,
        outputPath: writeResult.outputPath,
        backupPath: writeResult.backupPath,
        reportJsonPath: reportPaths.reportJsonPath,
        reportTextPath: reportPaths.reportTextPath,
        downloadToken: downloadTicket?.token,
        downloadFilename: downloadTicket?.downloadFilename,
        success: true,
        changedTableCount: filePlan.changedTableCount,
        changedColumnCount: filePlan.changedColumnCount,
        skippedChanges: writeResult.skippedCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      fileResult: {
        fileId: filePlan.fileId,
        sourcePath: filePlan.sourcePath,
        success: false,
        changedTableCount: filePlan.changedTableCount,
        changedColumnCount: filePlan.changedColumnCount,
        skippedChanges: filePlan.cellChanges.length,
        error: (error as Error).message,
      },
    };
  } finally {
    fileLocks.delete(filePlan.sourcePath);
  }
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

async function createJobRecord(
  plan: StoredPreviewPlan,
  mode: NameFixMode,
): Promise<NameFixJob> {
  const jobId = randomId("name_fix_job");
  const sourcePath = plan.files.length === 1 ? plan.files[0].sourcePath : "[multiple]";
  const fileId = plan.files.length === 1 ? plan.files[0].fileId : 0;
  return storage.createNameFixJob({
    id: jobId,
    fileId,
    planId: plan.planId,
    planHash: plan.planHash,
    mode,
    scope: plan.scope,
    status: "pending",
    sourcePath,
    outputPath: undefined,
    backupPath: undefined,
    reportJsonPath: undefined,
    reportTextPath: undefined,
    conflictStrategy: plan.conflictStrategy,
    reservedWordStrategy: plan.reservedWordStrategy,
    lengthOverflowStrategy: plan.lengthOverflowStrategy,
    maxIdentifierLength: plan.maxIdentifierLength,
    changedTableCount: 0,
    changedColumnCount: 0,
    blockingConflictCount: 0,
    unresolvedSourceRefCount: 0,
    error: undefined,
  });
}

export async function applyNameFixPlanById(
  request: NameFixApplyRequest,
): Promise<NameFixApplyResponse> {
  cleanupExpiredPreviewPlans();
  cleanupExpiredDownloadTokens();
  const plan = previewPlanCache.get(request.planId);
  if (!plan) {
    throw new Error("Preview plan expired or not found. Please run preview again.");
  }
  if (plan.expiresAt <= Date.now()) {
    previewPlanCache.delete(plan.planId);
    throw new Error("Preview plan has expired. Please run preview again.");
  }

  const settings = await storage.getSettings();
  const mode = request.mode;
  if (mode === "overwrite" && process.env.ELECTRON_MODE !== "true") {
    throw new Error("Overwrite mode is only available in Electron.");
  }
  if (mode === "overwrite" && !settings.allowOverwriteInElectron) {
    throw new Error("Overwrite mode is disabled by current settings.");
  }
  validateTargetDirectory(request.targetDirectory, settings.allowExternalPathWrite);

  const job = await createJobRecord(plan, mode);
  await storage.updateNameFixJob(job.id, { status: "processing" });

  const fileResults: NameFixApplyResponse["files"] = [];
  const changedItemRecords: Omit<NameFixJobItem, "id" | "createdAt">[] = [];
  let successCount = 0;
  let failedCount = 0;
  let changedTableCount = 0;
  let changedColumnCount = 0;
  let blockingConflictCount = 0;
  let unresolvedSourceRefCount = 0;
  let firstOutputPath: string | undefined;
  let firstBackupPath: string | undefined;
  let firstReportJsonPath: string | undefined;
  let firstReportTextPath: string | undefined;
  const successfulDownloadFiles: Array<{
    originalName: string;
    outputPath: string;
    reportJsonPath?: string;
    reportTextPath?: string;
  }> = [];

  for (const filePlan of plan.files) {
    changedTableCount += filePlan.changedTableCount;
    changedColumnCount += filePlan.changedColumnCount;
    blockingConflictCount += filePlan.blockingConflictCount;
    unresolvedSourceRefCount += filePlan.unresolvedSourceRefCount;
  }

  const fileApplyResults: FilePlanApplyOutcome[] = new Array(plan.files.length);
  const maxBatchConcurrency = Math.max(
    1,
    Math.min(settings.nameFixMaxBatchConcurrency || 1, plan.files.length || 1),
  );
  let nextFileIndex = 0;
  await Promise.all(
    Array.from({ length: maxBatchConcurrency }, async () => {
      while (true) {
        const currentIndex = nextFileIndex;
        nextFileIndex += 1;
        if (currentIndex >= plan.files.length) {
          return;
        }
        const filePlan = plan.files[currentIndex];
        fileApplyResults[currentIndex] = await executeFilePlanApply({
          filePlan,
          jobId: job.id,
          planId: plan.planId,
          planHash: plan.planHash,
          mode,
          targetDirectory: request.targetDirectory,
          includeReport: request.includeReport,
          backupRetentionDays: settings.nameFixBackupRetentionDays,
        });
      }
    }),
  );

  fileApplyResults.forEach((result, index) => {
    fileResults.push(result.fileResult);
    if (!result.success) {
      failedCount += 1;
      return;
    }

    const appliedFilePlan = plan.files[index];
    if (appliedFilePlan) {
      changedItemRecords.push(...collectChangedItemRecords(job.id, appliedFilePlan));
    }

    successCount += 1;
    if (!firstOutputPath && result.outputPath) {
      firstOutputPath = result.outputPath;
    }
    if (!firstBackupPath && result.backupPath) {
      firstBackupPath = result.backupPath;
    }
    if (!firstReportJsonPath && result.reportJsonPath) {
      firstReportJsonPath = result.reportJsonPath;
    }
    if (!firstReportTextPath && result.reportTextPath) {
      firstReportTextPath = result.reportTextPath;
    }
    if (result.downloadableFile) {
      successfulDownloadFiles.push(result.downloadableFile);
    }
  });

  await storage.createNameFixJobItems(changedItemRecords);

  const status: NameFixApplyResponse["status"] = failedCount > 0 ? "failed" : "completed";
  await storage.updateNameFixJob(job.id, {
    status,
    outputPath: firstOutputPath,
    backupPath: firstBackupPath,
    reportJsonPath: firstReportJsonPath,
    reportTextPath: firstReportTextPath,
    changedTableCount,
    changedColumnCount,
    blockingConflictCount,
    unresolvedSourceRefCount,
    error: failedCount > 0 ? `${failedCount} file(s) failed during apply.` : undefined,
  });

  let downloadBundleToken: string | undefined;
  let downloadBundleFilename: string | undefined;
  if (mode === "replace_download" && successfulDownloadFiles.length > 1) {
    const bundle = await createNameFixBundleArchive(job.id, successfulDownloadFiles);
    const bundleTicket = createDownloadTicket(bundle.archivePath, bundle.archiveFilename, {
      deleteOnExpire: true,
      preserveFilename: true,
    });
    downloadBundleToken = bundleTicket.token;
    downloadBundleFilename = bundleTicket.downloadFilename;
  }

  return {
    jobId: job.id,
    planId: plan.planId,
    planHash: plan.planHash,
    status,
    downloadBundleToken,
    downloadBundleFilename,
    summary: {
      fileCount: plan.files.length,
      successCount,
      failedCount,
      changedTableCount,
      changedColumnCount,
    },
    files: fileResults,
  };
}

export async function rollbackNameFixJobById(
  request: NameFixRollbackRequest,
): Promise<NameFixRollbackResponse> {
  const job = await storage.getNameFixJob(request.jobId);
  if (!job) {
    throw new Error("Name-fix job not found.");
  }
  const backups = await storage.getNameFixBackupsByJob(request.jobId);
  if (backups.length === 0) {
    throw new Error("No backup found for this job.");
  }

  let restoredPath: string | undefined;
  let restoredHash: string | undefined;
  for (const backup of backups) {
    if (!backup.restorable) {
      continue;
    }
    await fs.copyFile(backup.backupPath, backup.sourcePath);
    restoredPath = backup.sourcePath;
    restoredHash = computeBufferHash(await fs.readFile(backup.sourcePath));
    await storage.updateNameFixBackup(backup.id, { restorable: false });
  }

  await storage.updateNameFixJob(job.id, {
    status: "rolled_back",
  });

  return {
    jobId: job.id,
    success: Boolean(restoredPath),
    restoredPath,
    backupPath: backups[0]?.backupPath,
    restoredHash,
    message: restoredPath ? "Rollback completed." : "No restorable backup found.",
  };
}

export async function getNameFixJobDetail(jobId: string): Promise<{ job: NameFixJob; items: NameFixJobItem[] }> {
  const job = await storage.getNameFixJob(jobId);
  if (!job) {
    throw new Error("Name-fix job not found.");
  }
  const items = await storage.listNameFixJobItems(jobId);
  return { job, items };
}

export async function resolveNameFixDownloadTicket(
  token: string,
): Promise<{ outputPath: string; downloadFilename: string }> {
  cleanupExpiredDownloadTokens();
  const ticket = downloadTokenCache.get(token);
  if (!ticket) {
    throw new Error("Download token not found or expired.");
  }
  if (ticket.expiresAt <= Date.now()) {
    downloadTokenCache.delete(token);
    throw new Error("Download token has expired.");
  }
  await fs.access(ticket.outputPath);
  return {
    outputPath: ticket.outputPath,
    downloadFilename: ticket.downloadFilename,
  };
}

async function cleanupExpiredBackups(): Promise<void> {
  const backups = await storage.listNameFixBackups();
  const now = Date.now();

  const groupedBySource = new Map<string, NameFixBackup[]>();
  backups.forEach((backup) => {
    const list = groupedBySource.get(backup.sourcePath) ?? [];
    list.push(backup);
    groupedBySource.set(backup.sourcePath, list);
  });

  for (const backup of backups) {
    if (!backup.restorable) {
      continue;
    }
    const expiresAt = Date.parse(backup.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt <= now) {
      await fs.rm(backup.backupPath, { force: true });
      await storage.updateNameFixBackup(backup.id, { restorable: false });
    }
  }

  for (const [, sourceBackups] of Array.from(groupedBySource.entries())) {
    const sorted = [...sourceBackups].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const overflow = sorted.slice(MAX_BACKUP_HISTORY_PER_SOURCE);
    for (const backup of overflow) {
      if (!backup.restorable) {
        continue;
      }
      await fs.rm(backup.backupPath, { force: true });
      await storage.updateNameFixBackup(backup.id, { restorable: false });
    }
  }
}

export function startNameFixMaintenance(): void {
  if (maintenanceStarted) {
    return;
  }
  maintenanceStarted = true;
  setInterval(() => {
    cleanupExpiredPreviewPlans();
    cleanupExpiredDownloadTokens();
    void cleanupExpiredBackups().catch((error) => {
      console.warn("[name-fix] backup cleanup failed:", (error as Error).message);
    });
  }, BACKUP_CLEANUP_INTERVAL_MS);
}
