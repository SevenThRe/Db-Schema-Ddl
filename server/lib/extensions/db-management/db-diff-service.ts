import { normalizeDataTypeAndSize } from "../../ddl-validation";
import { generateDDL } from "../../ddl";
import { runParseWorkbookBundle } from "../../excel-executor";
import { storage } from "../../../storage";
import {
  type ColumnInfo,
  type DbColumn,
  type DbConnectionSummary,
  type DbDiffAction,
  type DbDiffBlocker,
  type DbDiffBlockerCode,
  type DbDiffColumnChange,
  type DbDiffConfirmRenamesRequest,
  type DbDiffPreviewRequest,
  type DbDiffPreviewResponse,
  type DbDiffSummary,
  type DbDiffTableChange,
  type DbDryRunRequest,
  type DbDryRunResponse,
  type DbFileColumn,
  type DbFileTable,
  type DbRenameDecision,
  type DbRenameDecisionItem,
  type DbRenameSuggestion,
  type DbSchemaCatalog,
  type DbSchemaSnapshot,
  type DbSqlPreviewArtifact,
  type DbSqlPreviewRequest,
  type DbSqlPreviewResponse,
  type DbSqlPreviewStatement,
  type DbVsDbCompareResponse,
  type DbVsDbPreviewRequest,
  type DbVsDbPreviewResponse,
  type TableInfo,
  type UploadedFile,
} from "@shared/schema";
import { introspectMySqlDatabase } from "./mysql-introspection";
import { normalizeMySqlSchema } from "./schema-normalizer";
import { persistDbSchemaSnapshot } from "./snapshot-service";
import { selectDatabaseForConnection } from "./connection-service";

const TABLE_RENAME_THRESHOLD = 0.9;
const COLUMN_RENAME_THRESHOLD = 0.92;
const AMBIGUITY_GAP = 0.08;

interface ResolvedLiveSchema {
  connection: DbConnectionSummary;
  selectedDatabase: string;
  snapshot: DbSchemaSnapshot;
  schema: DbSchemaCatalog;
  cacheHit: boolean;
}

function normalizeName(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function bigramSimilarity(left?: string | null, right?: string | null): number {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (input: string): string[] => {
    if (input.length < 2) return [input];
    const values: string[] = [];
    for (let index = 0; index < input.length - 1; index += 1) {
      values.push(input.slice(index, index + 2));
    }
    return values;
  };
  const aGrams = grams(a);
  const bGrams = grams(b);
  const counts = new Map<string, number>();
  aGrams.forEach((gram) => counts.set(gram, (counts.get(gram) ?? 0) + 1));
  let overlap = 0;
  bGrams.forEach((gram) => {
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(gram, count - 1);
    }
  });
  return (2 * overlap) / (aGrams.length + bGrams.length);
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  const intersection = Array.from(left).filter((value) => right.has(value)).length;
  const union = new Set([...Array.from(left), ...Array.from(right)]).size;
  return union === 0 ? 0 : intersection / union;
}

function fileColumnName(column: DbFileColumn): string {
  return column.physicalName || column.logicalName || "unknown_column";
}

function fileTableName(table: DbFileTable): string {
  return table.physicalTableName || table.logicalTableName || "unknown_table";
}

function buildEntityKey(parts: Array<string | undefined>): string {
  return parts.map((part) => normalizeName(part)).join(":");
}

function buildTableRenameEntityKey(sheetName: string, beforeName: string, afterName: string): string {
  return buildEntityKey(["table", sheetName, beforeName, afterName]);
}

function buildColumnRenameEntityKey(sheetName: string, tableName: string, beforeName: string, afterName: string): string {
  return buildEntityKey(["column", sheetName, tableName, beforeName, afterName]);
}

function resolveDbColumnSize(column: DbColumn): string | undefined {
  if (column.characterMaxLength) return String(column.characterMaxLength);
  if (column.numericPrecision != null && column.numericScale != null) {
    return `${column.numericPrecision},${column.numericScale}`;
  }
  if (column.numericPrecision != null) return String(column.numericPrecision);
  return undefined;
}

function toDbFileColumn(column: TableInfo["columns"][number]): DbFileColumn {
  return {
    logicalName: column.logicalName,
    physicalName: column.physicalName,
    dataType: column.dataType,
    size: column.size,
    nullable: typeof column.notNull === "boolean" ? !column.notNull : undefined,
    isPk: column.isPk,
    autoIncrement: column.autoIncrement,
    comment: column.comment,
  };
}

function toDbFileTable(sheetName: string, table: TableInfo): DbFileTable {
  return {
    sheetName,
    logicalTableName: table.logicalTableName,
    physicalTableName: table.physicalTableName,
    columns: table.columns.map((column) => toDbFileColumn(column)),
  };
}

async function loadFileTables(compare: DbDiffPreviewRequest): Promise<{ file: UploadedFile; tables: DbFileTable[] }> {
  const file = await storage.getUploadedFile(compare.fileId);
  if (!file) throw new Error("Target file not found.");
  const settings = await storage.getSettings();
  const bundle = await runParseWorkbookBundle(
    file.filePath,
    { maxConsecutiveEmptyRows: settings.maxConsecutiveEmptyRows, pkMarkers: settings.pkMarkers },
    file.fileHash,
  );
  const sheetTables = bundle.tablesBySheet[compare.sheetName];
  if (!sheetTables || sheetTables.length === 0) {
    throw new Error(`Sheet "${compare.sheetName}" has no table definitions.`);
  }
  const tables = sheetTables.map((table) => toDbFileTable(compare.sheetName, table));
  if (compare.scope === "table") {
    const selected = tables.find((table) => normalizeName(fileTableName(table)) === normalizeName(compare.tableName));
    if (!selected) {
      throw new Error(`Table "${compare.tableName}" was not found in sheet "${compare.sheetName}".`);
    }
    return { file, tables: [selected] };
  }
  return { file, tables };
}

async function resolveLiveSchema(connectionId: number, compare: DbDiffPreviewRequest): Promise<ResolvedLiveSchema> {
  const connection = await storage.getDbConnection(connectionId);
  if (!connection) throw new Error("DB connection not found.");
  const selectedDatabase = compare.databaseName ?? connection.lastSelectedDatabase;
  if (!selectedDatabase) throw new Error("Select a database before running compare.");
  if (!compare.refreshLiveSchema) {
    const latest = await storage.getLatestDbSchemaSnapshot(connectionId, selectedDatabase);
    if (latest) {
      const summary = await selectDatabaseForConnection(connectionId, selectedDatabase);
      return {
        connection: summary,
        selectedDatabase,
        snapshot: latest,
        schema: JSON.parse(latest.schemaJson) as DbSchemaCatalog,
        cacheHit: true,
      };
    }
  }
  const rawSchema = await introspectMySqlDatabase(connectionId, selectedDatabase);
  const schema = normalizeMySqlSchema(rawSchema);
  const persisted = await persistDbSchemaSnapshot(connectionId, schema);
  const summary = await selectDatabaseForConnection(connectionId, selectedDatabase);
  return {
    connection: summary,
    selectedDatabase,
    snapshot: persisted.snapshot,
    schema,
    cacheHit: persisted.cacheHit,
  };
}

function createBlocker(
  code: DbDiffBlockerCode,
  entityType: "table" | "column",
  entityKey: string,
  message: string,
  options: Partial<Omit<DbDiffBlocker, "code" | "entityType" | "entityKey" | "message">> = {},
): DbDiffBlocker {
  return { code, severity: "blocking", entityType, entityKey, message, ...options };
}

function fileColumnNameSet(table: DbFileTable): Set<string> {
  return new Set(table.columns.map((column) => normalizeName(fileColumnName(column))).filter(Boolean));
}

function dbColumnNameSet(table: DbSchemaCatalog["tables"][number]): Set<string> {
  return new Set(table.columns.map((column) => normalizeName(column.name)).filter(Boolean));
}

function scoreTableSimilarity(fileTable: DbFileTable, dbTable: DbSchemaCatalog["tables"][number]): number {
  return (
    0.45 * bigramSimilarity(fileTable.physicalTableName, dbTable.name) +
    0.2 * bigramSimilarity(fileTable.logicalTableName, dbTable.comment) +
    0.35 * jaccardSimilarity(fileColumnNameSet(fileTable), dbColumnNameSet(dbTable))
  );
}

function scoreColumnSimilarity(fileColumn: DbFileColumn, dbColumn: DbColumn): number {
  const fileType = normalizeDataTypeAndSize(fileColumn.dataType, fileColumn.size);
  const dbType = normalizeDataTypeAndSize(dbColumn.dataType, resolveDbColumnSize(dbColumn));
  const typeScore =
    normalizeName(fileType.type) === normalizeName(dbType.type) &&
    normalizeName(fileType.size) === normalizeName(dbType.size)
      ? 1
      : 0;
  const nullableScore =
    typeof fileColumn.nullable === "boolean" ? (fileColumn.nullable === dbColumn.nullable ? 1 : 0) : 0.5;
  return (
    0.45 * bigramSimilarity(fileColumn.physicalName, dbColumn.name) +
    0.2 * bigramSimilarity(fileColumn.logicalName, dbColumn.comment) +
    0.2 * typeScore +
    0.15 * nullableScore
  );
}

function collectTableChangedFields(fileTable: DbFileTable, dbTable: DbSchemaCatalog["tables"][number]): string[] {
  const changedFields: string[] = [];
  if (normalizeName(fileTable.physicalTableName) !== normalizeName(dbTable.name)) changedFields.push("physicalTableName");
  if ((fileTable.logicalTableName ?? "") !== (dbTable.comment ?? "")) changedFields.push("comment");
  return changedFields;
}

function collectColumnChangedFields(fileColumn: DbFileColumn, dbColumn: DbColumn): string[] {
  const changedFields: string[] = [];
  if (normalizeName(fileColumn.physicalName) !== normalizeName(dbColumn.name)) changedFields.push("physicalName");
  if ((fileColumn.comment ?? "") !== (dbColumn.comment ?? "")) changedFields.push("comment");
  const fileType = normalizeDataTypeAndSize(fileColumn.dataType, fileColumn.size);
  const dbType = normalizeDataTypeAndSize(dbColumn.dataType, resolveDbColumnSize(dbColumn));
  if (normalizeName(fileType.type) !== normalizeName(dbType.type)) changedFields.push("dataType");
  if (normalizeName(fileType.size) !== normalizeName(dbType.size)) changedFields.push("size");
  if (typeof fileColumn.nullable === "boolean" && fileColumn.nullable !== dbColumn.nullable) changedFields.push("nullable");
  if (Boolean(fileColumn.autoIncrement) !== Boolean(dbColumn.autoIncrement)) changedFields.push("autoIncrement");
  return changedFields;
}

function detectTypeShrink(fileColumn: DbFileColumn, dbColumn: DbColumn): boolean {
  const fileType = normalizeDataTypeAndSize(fileColumn.dataType, fileColumn.size);
  const dbType = normalizeDataTypeAndSize(dbColumn.dataType, resolveDbColumnSize(dbColumn));
  const fileKind = normalizeName(fileType.type);
  const dbKind = normalizeName(dbType.type);
  if (!fileKind || !dbKind) return false;
  if ((fileKind === "varchar" || fileKind === "char") && (dbKind === "varchar" || dbKind === "char")) {
    const fileSize = Number(fileType.size ?? 0);
    const dbSize = Number(dbType.size ?? 0);
    return Number.isFinite(fileSize) && Number.isFinite(dbSize) && fileSize > 0 && dbSize > 0 && fileSize < dbSize;
  }
  if ((fileKind === "decimal" || fileKind === "numeric") && (dbKind === "decimal" || dbKind === "numeric")) {
    const [filePrecision = 0, fileScale = 0] = String(fileType.size ?? "").split(",").map((value) => Number(value.trim()));
    const [dbPrecision = 0, dbScale = 0] = String(dbType.size ?? "").split(",").map((value) => Number(value.trim()));
    return (
      (filePrecision > 0 && dbPrecision > 0 && filePrecision < dbPrecision) ||
      (fileScale > 0 && dbScale > 0 && fileScale < dbScale)
    );
  }
  const numericRank: Record<string, number> = { tinyint: 1, smallint: 2, mediumint: 3, int: 4, integer: 4, bigint: 5 };
  return fileKind in numericRank && dbKind in numericRank && numericRank[fileKind] < numericRank[dbKind];
}

function buildColumnBlockers(
  sheetName: string,
  tableName: string,
  fileColumn: DbFileColumn | undefined,
  dbColumn: DbColumn | undefined,
  action: DbDiffAction,
  entityKey: string,
  requiresConfirmation: boolean,
): DbDiffBlocker[] {
  const blockers: DbDiffBlocker[] = [];
  const columnName = fileColumn ? fileColumnName(fileColumn) : dbColumn?.name;
  if (action === "removed" && dbColumn) {
    blockers.push(
      createBlocker("drop_column", "column", entityKey, `Removing DB column ${dbColumn.name} is blocked in preview.`, {
        sheetName,
        tableName,
        columnName: dbColumn.name,
      }),
    );
  }
  if ((action === "modified" || action === "renamed") && fileColumn && dbColumn) {
    if (detectTypeShrink(fileColumn, dbColumn)) {
      blockers.push(
        createBlocker("type_shrink", "column", entityKey, `Changing ${dbColumn.name} narrows the existing DB type.`, {
          sheetName,
          tableName,
          columnName,
        }),
      );
    }
    if (dbColumn.nullable && fileColumn.nullable === false) {
      blockers.push(
        createBlocker(
          "not_null_without_fill",
          "column",
          entityKey,
          `Changing ${dbColumn.name} from NULL to NOT NULL requires a default or fill strategy.`,
          { sheetName, tableName, columnName },
        ),
      );
    }
  }
  if (requiresConfirmation) {
    blockers.push(
      createBlocker("rename_unconfirmed", "column", entityKey, `Rename candidate ${columnName ?? "column"} must be confirmed first.`, {
        sheetName,
        tableName,
        columnName,
      }),
    );
  }
  return blockers;
}

function matchRenameCandidates<TLeft, TRight>(
  leftItems: TLeft[],
  rightItems: TRight[],
  score: (left: TLeft, right: TRight) => number,
  threshold: number,
): Array<{ leftIndex: number; rightIndex: number; score: number }> {
  const candidates: Array<{ leftIndex: number; rightIndex: number; score: number }> = [];
  leftItems.forEach((left, leftIndex) => {
    rightItems.forEach((right, rightIndex) => {
      const value = score(left, right);
      if (value >= threshold) candidates.push({ leftIndex, rightIndex, score: value });
    });
  });
  candidates.sort((left, right) => right.score - left.score);
  const usedLeft = new Set<number>();
  const usedRight = new Set<number>();
  const matched: Array<{ leftIndex: number; rightIndex: number; score: number }> = [];
  for (const candidate of candidates) {
    if (usedLeft.has(candidate.leftIndex) || usedRight.has(candidate.rightIndex)) continue;
    const competing = candidates
      .filter((item) => item.leftIndex === candidate.leftIndex || item.rightIndex === candidate.rightIndex)
      .sort((left, right) => right.score - left.score);
    const secondScore = competing[1]?.score ?? 0;
    if (candidate.score - secondScore < AMBIGUITY_GAP) continue;
    usedLeft.add(candidate.leftIndex);
    usedRight.add(candidate.rightIndex);
    matched.push(candidate);
  }
  return matched;
}

function buildColumnChanges(
  sheetName: string,
  fileTable: DbFileTable,
  dbTable: DbSchemaCatalog["tables"][number],
): { changes: DbDiffColumnChange[]; renameSuggestions: DbRenameSuggestion[] } {
  const changes: DbDiffColumnChange[] = [];
  const suggestions: DbRenameSuggestion[] = [];
  const matchedFileIndexes = new Set<number>();
  const matchedDbIndexes = new Set<number>();
  const dbByName = new Map(dbTable.columns.map((column, index) => [normalizeName(column.name), { column, index }]));

  fileTable.columns.forEach((fileColumn, index) => {
    const match = dbByName.get(normalizeName(fileColumnName(fileColumn)));
    if (!match) return;
    matchedFileIndexes.add(index);
    matchedDbIndexes.add(match.index);
    const entityKey = buildEntityKey(["column", sheetName, fileTableName(fileTable), match.column.name]);
    const changedFields = collectColumnChangedFields(fileColumn, match.column);
    if (changedFields.length > 0) {
      changes.push({
        action: "modified",
        entityKey,
        requiresConfirmation: false,
        changedFields,
        fileColumn,
        dbColumn: match.column,
        blockers: buildColumnBlockers(sheetName, fileTableName(fileTable), fileColumn, match.column, "modified", entityKey, false),
      });
    }
  });

  const unmatchedFileColumns = fileTable.columns.map((column, index) => ({ column, index })).filter((item) => !matchedFileIndexes.has(item.index));
  const unmatchedDbColumns = dbTable.columns.map((column, index) => ({ column, index })).filter((item) => !matchedDbIndexes.has(item.index));
  const renamePairs = matchRenameCandidates(
    unmatchedFileColumns,
    unmatchedDbColumns,
    (left, right) => scoreColumnSimilarity(left.column, right.column),
    COLUMN_RENAME_THRESHOLD,
  );

  renamePairs.forEach((pair) => {
    const fileColumn = unmatchedFileColumns[pair.leftIndex]!.column;
    const dbColumn = unmatchedDbColumns[pair.rightIndex]!.column;
    matchedFileIndexes.add(unmatchedFileColumns[pair.leftIndex]!.index);
    matchedDbIndexes.add(unmatchedDbColumns[pair.rightIndex]!.index);
    const entityKey = buildColumnRenameEntityKey(sheetName, fileTableName(fileTable), dbColumn.name, fileColumnName(fileColumn));
    suggestions.push({
      entityType: "column",
      entityKey,
      confidence: pair.score,
      decision: "pending",
      sheetName,
      tableNameBefore: dbTable.name,
      tableNameAfter: fileTableName(fileTable),
      columnNameBefore: dbColumn.name,
      columnNameAfter: fileColumnName(fileColumn),
    });
    changes.push({
      action: "rename_suggest",
      entityKey,
      confidence: pair.score,
      requiresConfirmation: true,
      changedFields: collectColumnChangedFields(fileColumn, dbColumn),
      fileColumn,
      dbColumn,
      blockers: buildColumnBlockers(sheetName, fileTableName(fileTable), fileColumn, dbColumn, "rename_suggest", entityKey, true),
    });
  });

  fileTable.columns.forEach((fileColumn, index) => {
    if (matchedFileIndexes.has(index)) return;
    changes.push({
      action: "added",
      entityKey: buildEntityKey(["column", sheetName, fileTableName(fileTable), fileColumnName(fileColumn), "add"]),
      requiresConfirmation: false,
      fileColumn,
      changedFields: [],
      blockers: [],
    });
  });
  dbTable.columns.forEach((dbColumn, index) => {
    if (matchedDbIndexes.has(index)) return;
    const entityKey = buildEntityKey(["column", sheetName, dbTable.name, dbColumn.name, "drop"]);
    changes.push({
      action: "removed",
      entityKey,
      requiresConfirmation: false,
      dbColumn,
      changedFields: [],
      blockers: buildColumnBlockers(sheetName, dbTable.name, undefined, dbColumn, "removed", entityKey, false),
    });
  });

  return { changes: changes.sort((left, right) => left.entityKey.localeCompare(right.entityKey)), renameSuggestions: suggestions };
}

function compareMatchedTables(fileTable: DbFileTable, dbTable: DbSchemaCatalog["tables"][number]) {
  const changedFields = collectTableChangedFields(fileTable, dbTable);
  const columns = buildColumnChanges(fileTable.sheetName, fileTable, dbTable);
  return {
    changedFields,
    columnChanges: columns.changes,
    blockers: columns.changes.flatMap((change) => change.blockers),
    renameSuggestions: columns.renameSuggestions,
  };
}

function buildDiffSummary(
  tableChanges: DbDiffTableChange[],
  renameSuggestions: DbRenameSuggestion[],
  blockers: DbDiffBlocker[],
): DbDiffSummary {
  let addedTables = 0;
  let removedTables = 0;
  let changedTables = 0;
  let addedColumns = 0;
  let removedColumns = 0;
  let changedColumns = 0;
  for (const tableChange of tableChanges) {
    if (tableChange.action === "added") addedTables += 1;
    else if (tableChange.action === "removed") removedTables += 1;
    else changedTables += 1;
    for (const columnChange of tableChange.columnChanges) {
      if (columnChange.action === "added") addedColumns += 1;
      else if (columnChange.action === "removed") removedColumns += 1;
      else changedColumns += 1;
    }
  }
  return {
    addedTables,
    removedTables,
    changedTables,
    renameSuggestions: renameSuggestions.length,
    pendingRenameConfirmations: renameSuggestions.filter((item) => item.decision === "pending").length,
    addedColumns,
    removedColumns,
    changedColumns,
    blockingCount: blockers.length,
  };
}

export function applyRenameDecisionsToCompareResult<T extends DbComparePreviewCore>(result: T, decisions: DbRenameDecisionItem[]): T {
  const decisionMap = new Map<string, DbRenameDecision>(decisions.map((item) => [item.entityKey, item.decision]));
  const tableChanges: DbDiffTableChange[] = [];
  for (const tableChange of result.tableChanges) {
    if (tableChange.action === "rename_suggest") {
      const decision = decisionMap.get(tableChange.entityKey) ?? "pending";
      if (decision === "accept") {
        tableChanges.push({
          ...tableChange,
          action: "renamed",
          requiresConfirmation: false,
          blockers: tableChange.blockers.filter((blocker) => blocker.code !== "rename_unconfirmed"),
        });
        continue;
      }
      if (decision === "reject") {
        if (tableChange.dbTable) {
          tableChanges.push({
            action: "removed",
            entityKey: buildEntityKey(["table", tableChange.sheetName, tableChange.dbTable.name, "drop"]),
            sheetName: tableChange.sheetName,
            requiresConfirmation: false,
            dbTable: tableChange.dbTable,
            changedFields: [],
            columnChanges: [],
            blockers: [
              createBlocker("drop_table", "table", buildEntityKey(["table", tableChange.sheetName, tableChange.dbTable.name, "drop"]), `Removing DB table ${tableChange.dbTable.name} is blocked in preview.`, {
                sheetName: tableChange.sheetName,
                tableName: tableChange.dbTable.name,
              }),
            ],
          });
        }
        if (tableChange.fileTable) {
          tableChanges.push({
            action: "added",
            entityKey: buildEntityKey(["table", tableChange.sheetName, fileTableName(tableChange.fileTable), "create"]),
            sheetName: tableChange.sheetName,
            requiresConfirmation: false,
            fileTable: tableChange.fileTable,
            changedFields: [],
            columnChanges: [],
            blockers: [],
          });
        }
        continue;
      }
    }

    const columnChanges: DbDiffColumnChange[] = [];
    for (const columnChange of tableChange.columnChanges) {
      if (columnChange.action !== "rename_suggest") {
        columnChanges.push(columnChange);
        continue;
      }
      const decision = decisionMap.get(columnChange.entityKey) ?? "pending";
      if (decision === "accept") {
        columnChanges.push({
          ...columnChange,
          action: "renamed",
          requiresConfirmation: false,
          blockers: columnChange.blockers.filter((blocker) => blocker.code !== "rename_unconfirmed"),
        });
      } else if (decision === "reject") {
        if (columnChange.dbColumn) {
          columnChanges.push({
            action: "removed",
            entityKey: buildEntityKey([tableChange.entityKey, columnChange.dbColumn.name, "drop"]),
            requiresConfirmation: false,
            dbColumn: columnChange.dbColumn,
            changedFields: [],
            blockers: buildColumnBlockers(tableChange.sheetName, tableChange.dbTable?.name ?? fileTableName(tableChange.fileTable ?? { sheetName: tableChange.sheetName, columns: [] }), undefined, columnChange.dbColumn, "removed", buildEntityKey([tableChange.entityKey, columnChange.dbColumn.name, "drop"]), false),
          });
        }
        if (columnChange.fileColumn) {
          columnChanges.push({
            action: "added",
            entityKey: buildEntityKey([tableChange.entityKey, fileColumnName(columnChange.fileColumn), "add"]),
            requiresConfirmation: false,
            fileColumn: columnChange.fileColumn,
            changedFields: [],
            blockers: [],
          });
        }
      } else {
        columnChanges.push(columnChange);
      }
    }

    tableChanges.push({
      ...tableChange,
      columnChanges,
      blockers: [
        ...tableChange.blockers.filter((blocker) => blocker.code !== "rename_unconfirmed"),
        ...columnChanges.flatMap((change) => change.blockers),
      ],
    });
  }

  const renameSuggestions = result.renameSuggestions.map((suggestion) => ({
    ...suggestion,
    decision: decisionMap.get(suggestion.entityKey) ?? suggestion.decision,
  }));
  const activeRenameSuggestions = renameSuggestions.filter((item) => item.decision === "pending");
  const blockers = tableChanges.flatMap((change) => [...change.blockers, ...change.columnChanges.flatMap((column) => column.blockers)]);
  return {
    ...result,
    tableChanges: tableChanges.sort((left, right) => left.entityKey.localeCompare(right.entityKey)),
    renameSuggestions,
    blockers,
    summary: buildDiffSummary(tableChanges, activeRenameSuggestions, blockers),
    canPreview: blockers.length === 0,
  } as T;
}

function applyRenameDecisions(result: DbDiffPreviewResponse, decisions: DbRenameDecisionItem[]): DbDiffPreviewResponse {
  return applyRenameDecisionsToCompareResult(result, decisions);
}

type DbComparePreviewCore = Pick<
  DbDiffPreviewResponse,
  "summary" | "tableChanges" | "renameSuggestions" | "blockers" | "canPreview"
>;

export function compareFileLikeTablesAgainstDbSchema(args: {
  sheetName: string;
  tables: DbFileTable[];
  dbTables: DbSchemaCatalog["tables"];
}): DbComparePreviewCore {
  const tableChanges: DbDiffTableChange[] = [];
  const renameSuggestions: DbRenameSuggestion[] = [];
  const matchedFileIndexes = new Set<number>();
  const matchedDbIndexes = new Set<number>();
  const dbByName = new Map(args.dbTables.map((table, index) => [normalizeName(table.name), { table, index }]));

  args.tables.forEach((fileTable, index) => {
    const match = dbByName.get(normalizeName(fileTableName(fileTable)));
    if (!match) return;
    matchedFileIndexes.add(index);
    matchedDbIndexes.add(match.index);
    const compared = compareMatchedTables(fileTable, match.table);
    tableChanges.push({
      action: "modified",
      entityKey: buildEntityKey(["table", fileTable.sheetName, match.table.name]),
      sheetName: fileTable.sheetName,
      requiresConfirmation: false,
      changedFields: compared.changedFields,
      fileTable,
      dbTable: match.table,
      columnChanges: compared.columnChanges,
      blockers: compared.blockers,
    });
    renameSuggestions.push(...compared.renameSuggestions);
  });

  const unmatchedFileTables = args.tables.map((table, index) => ({ table, index })).filter((item) => !matchedFileIndexes.has(item.index));
  const unmatchedDbTables = args.dbTables.map((table, index) => ({ table, index })).filter((item) => !matchedDbIndexes.has(item.index));
  const tableRenamePairs = matchRenameCandidates(
    unmatchedFileTables,
    unmatchedDbTables,
    (left, right) => scoreTableSimilarity(left.table, right.table),
    TABLE_RENAME_THRESHOLD,
  );

  tableRenamePairs.forEach((pair) => {
    const fileTable = unmatchedFileTables[pair.leftIndex]!.table;
    const dbTable = unmatchedDbTables[pair.rightIndex]!.table;
    matchedFileIndexes.add(unmatchedFileTables[pair.leftIndex]!.index);
    matchedDbIndexes.add(unmatchedDbTables[pair.rightIndex]!.index);
    const entityKey = buildTableRenameEntityKey(fileTable.sheetName, dbTable.name, fileTableName(fileTable));
    const compared = compareMatchedTables(fileTable, dbTable);
    tableChanges.push({
      action: "rename_suggest",
      entityKey,
      confidence: pair.score,
      requiresConfirmation: true,
      sheetName: fileTable.sheetName,
      changedFields: compared.changedFields,
      fileTable,
      dbTable,
      columnChanges: compared.columnChanges,
      blockers: [
        createBlocker("rename_unconfirmed", "table", entityKey, `Rename candidate ${dbTable.name} -> ${fileTableName(fileTable)} must be confirmed first.`, {
          sheetName: fileTable.sheetName,
          tableName: dbTable.name,
        }),
        ...compared.blockers,
      ],
    });
    renameSuggestions.push({
      entityType: "table",
      entityKey,
      confidence: pair.score,
      decision: "pending",
      sheetName: fileTable.sheetName,
      tableNameBefore: dbTable.name,
      tableNameAfter: fileTableName(fileTable),
    });
    renameSuggestions.push(...compared.renameSuggestions);
  });

  args.tables.forEach((fileTable, index) => {
    if (matchedFileIndexes.has(index)) return;
    tableChanges.push({
      action: "added",
      entityKey: buildEntityKey(["table", fileTable.sheetName, fileTableName(fileTable), "create"]),
      sheetName: fileTable.sheetName,
      requiresConfirmation: false,
      fileTable,
      changedFields: [],
      columnChanges: [],
      blockers: [],
    });
  });

  args.dbTables.forEach((dbTable, index) => {
    if (matchedDbIndexes.has(index)) return;
    const entityKey = buildEntityKey(["table", args.sheetName, dbTable.name, "drop"]);
    tableChanges.push({
      action: "removed",
      entityKey,
      sheetName: args.sheetName,
      requiresConfirmation: false,
      dbTable,
      changedFields: [],
      columnChanges: [],
      blockers: [
        createBlocker("drop_table", "table", entityKey, `Removing DB table ${dbTable.name} is blocked in preview.`, {
          sheetName: args.sheetName,
          tableName: dbTable.name,
        }),
      ],
    });
  });

  const blockers = tableChanges.flatMap((change) => [...change.blockers, ...change.columnChanges.flatMap((column) => column.blockers)]);
  return {
    summary: buildDiffSummary(tableChanges, renameSuggestions, blockers),
    tableChanges: tableChanges.sort((left, right) => left.entityKey.localeCompare(right.entityKey)),
    renameSuggestions: renameSuggestions.sort((left, right) => right.confidence - left.confidence),
    blockers,
    canPreview: blockers.length === 0,
  };
}

export async function previewDbDiff(connectionId: number, compare: DbDiffPreviewRequest): Promise<DbDiffPreviewResponse> {
  const [{ file, tables }, liveSchema] = await Promise.all([loadFileTables(compare), resolveLiveSchema(connectionId, compare)]);
  const dbTables =
    compare.scope === "table" && compare.tableName
      ? liveSchema.schema.tables.filter((table) => normalizeName(table.name) === normalizeName(compare.tableName))
      : liveSchema.schema.tables;
  const core = compareFileLikeTablesAgainstDbSchema({
    sheetName: compare.sheetName,
    tables,
    dbTables,
  });
  return {
    context: {
      fileId: file.id,
      fileName: file.originalName,
      scope: compare.scope,
      sheetName: compare.sheetName,
      tableName: compare.tableName,
      connectionId,
      connectionName: liveSchema.connection.name,
      databaseName: liveSchema.selectedDatabase,
      snapshotHash: liveSchema.snapshot.snapshotHash,
      snapshotCapturedAt: liveSchema.snapshot.capturedAt,
    },
    cacheHit: liveSchema.cacheHit,
    ...core,
  };
}

export async function confirmDbDiffRenames(connectionId: number, request: DbDiffConfirmRenamesRequest): Promise<DbDiffPreviewResponse> {
  return applyRenameDecisions(await previewDbDiff(connectionId, request.compare), request.decisions);
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function quoteIdentifier(value: string): string {
  return `\`${String(value).replace(/`/g, "``")}\``;
}

function toColumnInfo(column: DbFileColumn, index: number): ColumnInfo {
  return {
    no: index + 1,
    logicalName: column.logicalName,
    physicalName: column.physicalName,
    dataType: column.dataType,
    size: column.size,
    notNull: typeof column.nullable === "boolean" ? !column.nullable : undefined,
    isPk: column.isPk,
    autoIncrement: column.autoIncrement,
    comment: column.comment,
  };
}

function toTableInfo(table: DbFileTable): TableInfo {
  return {
    logicalTableName: table.logicalTableName ?? fileTableName(table),
    physicalTableName: table.physicalTableName ?? fileTableName(table),
    columns: table.columns.map((column, index) => toColumnInfo(column, index)),
  };
}

function formatColumnType(column: DbFileColumn): string {
  const normalized = normalizeDataTypeAndSize(column.dataType, column.size);
  const baseType = normalized.type || column.dataType || "varchar";
  const size = normalized.size ?? column.size;
  return size ? `${baseType.toUpperCase()}(${size})` : baseType.toUpperCase();
}

function buildColumnDefinitionSql(column: DbFileColumn, includeName = true): string {
  const parts: string[] = [];
  if (includeName) {
    parts.push(quoteIdentifier(fileColumnName(column)));
  }
  parts.push(formatColumnType(column));
  if (column.nullable === false) {
    parts.push("NOT NULL");
  }
  if (column.autoIncrement) {
    parts.push("AUTO_INCREMENT");
  }
  if (column.comment) {
    parts.push(`COMMENT '${escapeSqlLiteral(column.comment)}'`);
  }
  return parts.join(" ");
}

function buildStatement(
  id: string,
  kind: DbSqlPreviewStatement["kind"],
  sql: string,
  relatedEntityKeys: string[],
  tableName?: string,
): DbSqlPreviewStatement {
  return {
    id,
    kind,
    tableName,
    sql,
    relatedEntityKeys,
    blocked: false,
    blockerCodes: [],
  };
}

function buildCreateArtifact(tableChange: DbDiffTableChange, settings: Awaited<ReturnType<typeof storage.getSettings>>): DbSqlPreviewArtifact | null {
  if (!tableChange.fileTable) {
    return null;
  }
  const ddl = generateDDL({
    tables: [toTableInfo(tableChange.fileTable)],
    dialect: "mysql",
    settings,
  }).trim();
  const tableName = fileTableName(tableChange.fileTable);
  return {
    artifactName: `${tableName}.create.sql`,
    tableName,
    sql: ddl,
    statements: [
      buildStatement(`create:${tableChange.entityKey}`, "create_table", ddl, [tableChange.entityKey], tableName),
    ],
  };
}

function buildAlterStatements(tableChange: DbDiffTableChange): DbSqlPreviewStatement[] {
  const statements: DbSqlPreviewStatement[] = [];
  const currentTableName = tableChange.dbTable?.name ?? fileTableName(tableChange.fileTable ?? { sheetName: tableChange.sheetName, columns: [] });
  const targetTableName = fileTableName(tableChange.fileTable ?? { sheetName: tableChange.sheetName, columns: [] });

  if (tableChange.action === "renamed" && tableChange.dbTable && tableChange.fileTable) {
    statements.push(
      buildStatement(
        `rename-table:${tableChange.entityKey}`,
        "rename_table",
        `RENAME TABLE ${quoteIdentifier(tableChange.dbTable.name)} TO ${quoteIdentifier(targetTableName)};`,
        [tableChange.entityKey],
        targetTableName,
      ),
    );
  }

  for (const columnChange of tableChange.columnChanges) {
    if (columnChange.action === "added" && columnChange.fileColumn) {
      statements.push(
        buildStatement(
          `add-column:${columnChange.entityKey}`,
          "add_column",
          `ALTER TABLE ${quoteIdentifier(targetTableName)} ADD COLUMN ${buildColumnDefinitionSql(columnChange.fileColumn)};`,
          [tableChange.entityKey, columnChange.entityKey],
          targetTableName,
        ),
      );
      continue;
    }

    if (columnChange.action === "modified" && columnChange.fileColumn) {
      statements.push(
        buildStatement(
          `modify-column:${columnChange.entityKey}`,
          "modify_column",
          `ALTER TABLE ${quoteIdentifier(targetTableName)} MODIFY COLUMN ${buildColumnDefinitionSql(columnChange.fileColumn)};`,
          [tableChange.entityKey, columnChange.entityKey],
          targetTableName,
        ),
      );
      continue;
    }

    if (columnChange.action === "renamed" && columnChange.fileColumn && columnChange.dbColumn) {
      statements.push(
        buildStatement(
          `rename-column:${columnChange.entityKey}`,
          "rename_column",
          `ALTER TABLE ${quoteIdentifier(targetTableName)} CHANGE COLUMN ${quoteIdentifier(columnChange.dbColumn.name)} ${buildColumnDefinitionSql(columnChange.fileColumn)};`,
          [tableChange.entityKey, columnChange.entityKey],
          targetTableName,
        ),
      );
    }
  }

  if (statements.length === 0 && tableChange.changedFields.length > 0 && tableChange.fileTable) {
    statements.push(
      buildStatement(
        `note:${tableChange.entityKey}`,
        "note",
        `-- Table ${currentTableName} changed in fields: ${tableChange.changedFields.join(", ")}`,
        [tableChange.entityKey],
        targetTableName,
      ),
    );
  }

  return statements;
}

function buildAlterArtifact(tableChange: DbDiffTableChange): DbSqlPreviewArtifact | null {
  const statements = buildAlterStatements(tableChange);
  if (statements.length === 0) {
    return null;
  }
  const tableName = fileTableName(tableChange.fileTable ?? { sheetName: tableChange.sheetName, columns: [] });
  return {
    artifactName: `${tableName}.alter.sql`,
    tableName,
    sql: statements.map((statement) => statement.sql).join("\n\n"),
    statements,
  };
}

async function buildSqlArtifacts(compareResult: DbComparePreviewCore): Promise<DbSqlPreviewArtifact[]> {
  const settings = await storage.getSettings();
  const artifacts: DbSqlPreviewArtifact[] = [];

  for (const tableChange of compareResult.tableChanges) {
    if (tableChange.action === "added") {
      const artifact = buildCreateArtifact(tableChange, settings);
      if (artifact) {
        artifacts.push(artifact);
      }
      continue;
    }

    if (tableChange.action === "modified" || tableChange.action === "renamed") {
      const artifact = buildAlterArtifact(tableChange);
      if (artifact) {
        artifacts.push(artifact);
      }
    }
  }

  return artifacts;
}

function buildPreviewState(compareResult: DbComparePreviewCore) {
  return {
    blocked: compareResult.blockers.length > 0 || !compareResult.canPreview,
  };
}

export async function previewDbSql(connectionId: number, request: DbSqlPreviewRequest): Promise<DbSqlPreviewResponse> {
  const compareResult = applyRenameDecisions(await previewDbDiff(connectionId, request.compare), request.decisions);
  const previewState = buildPreviewState(compareResult);
  const artifacts = previewState.blocked ? [] : await buildSqlArtifacts(compareResult);
  return {
    compareResult,
    dialect: request.dialect,
    artifacts,
    blocked: previewState.blocked,
  };
}

export async function previewDbDryRun(connectionId: number, request: DbDryRunRequest): Promise<DbDryRunResponse> {
  const preview = await previewDbSql(connectionId, request);
  const statementCount = preview.artifacts.reduce((count, artifact) => count + artifact.statements.length, 0);
  return {
    compareResult: preview.compareResult,
    summary: {
      dialect: request.dialect,
      statementCount,
      executableStatementCount: preview.blocked ? 0 : statementCount,
      blockedStatementCount: preview.blocked ? statementCount : 0,
      blockingCount: preview.compareResult.blockers.length,
      tableCount: preview.compareResult.tableChanges.length,
    },
    artifacts: preview.artifacts,
  };
}

export async function previewDbVsDbSql(
  compareResult: DbVsDbCompareResponse,
  request: DbVsDbPreviewRequest,
): Promise<DbVsDbPreviewResponse> {
  const reviewed = applyRenameDecisionsToCompareResult(compareResult, request.decisions);
  const previewState = buildPreviewState(reviewed);
  const artifacts = previewState.blocked ? [] : await buildSqlArtifacts(reviewed);
  return {
    compareResult: reviewed,
    dialect: request.dialect,
    artifacts,
    blocked: previewState.blocked,
  };
}
