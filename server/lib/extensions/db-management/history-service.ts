import { normalizeDataTypeAndSize } from "../../ddl-validation";
import { runParseWorkbookBundle } from "../../excel-executor";
import { storage } from "../../../storage";
import {
  type DbCompareLiveTarget,
  type DbComparePolicy,
  type DbColumn,
  type DbDiffAction,
  type DbDiffBlocker,
  type DbDiffBlockerCode,
  type DbDiffColumnChange,
  type DbDiffSummary,
  type DbDiffTableChange,
  type DbFileColumn,
  type DbFileTable,
  type DbHistoryCompareRequest,
  type DbHistoryCompareResponse,
  type DbHistoryCompareSource,
  type DbHistoryDetailResponse,
  type DbHistoryEntry,
  type DbHistoryListRequest,
  type DbHistoryListResponse,
  type DbRenameDecisionItem,
  type DbSchemaCatalog,
  type DbSchemaSnapshot,
  type DbVsDbCompareRequest,
  type DbVsDbCompareResponse,
  type DbVsDbRenameReviewRequest,
  type TableInfo,
} from "@shared/schema";
import { getDbConnectionRecordOrThrow } from "./connection-service";
import {
  applyRenameDecisionsToCompareResult,
  compareFileLikeTablesAgainstDbSchema,
} from "./db-diff-service";
import { introspectMySqlDatabase } from "./mysql-introspection";
import { normalizeMySqlSchema } from "./schema-normalizer";
import { persistDbSchemaSnapshot } from "./snapshot-service";

interface ResolvedHistoryCatalog {
  source: DbHistoryCompareSource;
  catalog: DbSchemaCatalog;
  snapshot?: DbSchemaSnapshot;
}

interface ResolvedLiveCompareCatalog {
  target: DbCompareLiveTarget;
  connectionName: string;
  catalog: DbSchemaCatalog;
  snapshot: DbSchemaSnapshot;
  cacheHit: boolean;
}

const DEFAULT_DB_COMPARE_POLICY: DbComparePolicy = {};

function resolveDatabaseNameFromSources(
  left: DbHistoryCompareSource,
  right: DbHistoryCompareSource,
): string {
  if (left.kind !== "file") {
    return left.databaseName;
  }
  if (right.kind !== "file") {
    return right.databaseName;
  }
  throw new Error("History comparison requires at least one DB-backed source.");
}

function dbCatalogToFileTables(catalog: DbSchemaCatalog): DbFileTable[] {
  return catalog.tables.map((table) => dbTableToFileTable(catalog.databaseName, table));
}

function buildAutoAcceptRenameDecisions(
  compareResult: Pick<DbVsDbCompareResponse, "renameSuggestions">,
  policy: DbComparePolicy,
): DbRenameDecisionItem[] {
  return compareResult.renameSuggestions.flatMap((suggestion) => {
    const threshold =
      suggestion.entityType === "table"
        ? policy.tableRenameAutoAcceptThreshold
        : policy.columnRenameAutoAcceptThreshold;
    if (threshold == null || suggestion.confidence < threshold) {
      return [];
    }
    return [
      {
        entityKey: suggestion.entityKey,
        entityType: suggestion.entityType,
        decision: "accept" as const,
      },
    ];
  });
}

function normalizeName(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function buildEntityKey(parts: Array<string | undefined>): string {
  return parts.map((part) => normalizeName(part)).join(":");
}

function fileColumnName(column: DbFileColumn): string {
  return column.physicalName || column.logicalName || "unknown_column";
}

function fileTableName(table: DbFileTable): string {
  return table.physicalTableName || table.logicalTableName || "unknown_table";
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

function dbTableToFileTable(databaseName: string, table: DbSchemaCatalog["tables"][number]): DbFileTable {
  return {
    sheetName: databaseName,
    logicalTableName: table.comment,
    physicalTableName: table.name,
    columns: table.columns.map((column) => ({
      logicalName: column.comment,
      physicalName: column.name,
      dataType: column.dataType,
      size: resolveDbColumnSize(column),
      nullable: column.nullable,
      isPk: table.primaryKey?.columns.includes(column.name),
      autoIncrement: column.autoIncrement,
      comment: column.comment,
    })),
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

function collectTableChangedFields(left: DbFileTable, right: DbSchemaCatalog["tables"][number]): string[] {
  const changedFields: string[] = [];
  if (normalizeName(left.physicalTableName) !== normalizeName(right.name)) changedFields.push("physicalTableName");
  if ((left.logicalTableName ?? "") !== (right.comment ?? "")) changedFields.push("comment");
  return changedFields;
}

function collectColumnChangedFields(left: DbFileColumn, right: DbColumn): string[] {
  const changedFields: string[] = [];
  if (normalizeName(left.physicalName) !== normalizeName(right.name)) changedFields.push("physicalName");
  if ((left.comment ?? "") !== (right.comment ?? "")) changedFields.push("comment");
  const leftType = normalizeDataTypeAndSize(left.dataType, left.size);
  const rightType = normalizeDataTypeAndSize(right.dataType, resolveDbColumnSize(right));
  if (normalizeName(leftType.type) !== normalizeName(rightType.type)) changedFields.push("dataType");
  if (normalizeName(leftType.size) !== normalizeName(rightType.size)) changedFields.push("size");
  if (typeof left.nullable === "boolean" && left.nullable !== right.nullable) changedFields.push("nullable");
  if (Boolean(left.autoIncrement) !== Boolean(right.autoIncrement)) changedFields.push("autoIncrement");
  return changedFields;
}

function detectTypeShrink(left: DbFileColumn, right: DbColumn): boolean {
  const fileType = normalizeDataTypeAndSize(left.dataType, left.size);
  const dbType = normalizeDataTypeAndSize(right.dataType, resolveDbColumnSize(right));
  const fileKind = normalizeName(fileType.type);
  const dbKind = normalizeName(dbType.type);
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
  databaseName: string,
  tableName: string,
  left: DbFileColumn | undefined,
  right: DbColumn | undefined,
  action: DbDiffAction,
  entityKey: string,
): DbDiffBlocker[] {
  const blockers: DbDiffBlocker[] = [];
  if (action === "removed" && right) {
    blockers.push(createBlocker("drop_column", "column", entityKey, `Removing DB column ${right.name} is blocked in preview.`, { sheetName: databaseName, tableName, columnName: right.name }));
  }
  if ((action === "modified" || action === "renamed") && left && right) {
    if (detectTypeShrink(left, right)) {
      blockers.push(createBlocker("type_shrink", "column", entityKey, `Changing ${right.name} narrows the existing DB type.`, { sheetName: databaseName, tableName, columnName: right.name }));
    }
    if (right.nullable && left.nullable === false) {
      blockers.push(createBlocker("not_null_without_fill", "column", entityKey, `Changing ${right.name} from NULL to NOT NULL requires a default or fill strategy.`, { sheetName: databaseName, tableName, columnName: right.name }));
    }
  }
  return blockers;
}

function buildDiffSummary(tableChanges: DbDiffTableChange[], blockers: DbDiffBlocker[]): DbDiffSummary {
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
  return { addedTables, removedTables, changedTables, renameSuggestions: 0, pendingRenameConfirmations: 0, addedColumns, removedColumns, changedColumns, blockingCount: blockers.length };
}

async function loadFileCatalog(source: Extract<DbHistoryCompareSource, { kind: "file" }>, databaseName: string): Promise<DbSchemaCatalog> {
  const file = await storage.getUploadedFile(source.fileId);
  if (!file) throw new Error("Target file not found.");
  const settings = await storage.getSettings();
  const bundle = await runParseWorkbookBundle(file.filePath, { maxConsecutiveEmptyRows: settings.maxConsecutiveEmptyRows, pkMarkers: settings.pkMarkers }, file.fileHash);
  const sheetTables = bundle.tablesBySheet[source.sheetName];
  if (!sheetTables?.length) {
    throw new Error(`Sheet "${source.sheetName}" has no table definitions.`);
  }
  return {
    dialect: "mysql",
    databaseName,
    tables: sheetTables.map((table) => ({
      name: table.physicalTableName,
      comment: table.logicalTableName,
      columns: table.columns.map((column, index) => ({
        name: column.physicalName || column.logicalName || `column_${index + 1}`,
        ordinalPosition: index + 1,
        dataType: column.dataType || "varchar",
        columnType: column.size ? `${column.dataType || "varchar"}(${column.size})` : column.dataType || "varchar",
        nullable: typeof column.notNull === "boolean" ? !column.notNull : true,
        autoIncrement: Boolean(column.autoIncrement),
        comment: column.comment,
        characterMaxLength: column.size && /^\d+$/.test(column.size) ? Number(column.size) : undefined,
      })),
      primaryKey: {
        columns: table.columns.filter((column) => column.isPk).map((column) => column.physicalName || column.logicalName || ""),
      },
      foreignKeys: [],
      indexes: [],
    })),
  };
}

async function resolveSnapshot(connectionId: number, databaseName: string, snapshotHash: string): Promise<DbSchemaSnapshot> {
  const snapshot = await storage.getDbSchemaSnapshotByHash(connectionId, databaseName, snapshotHash);
  if (!snapshot) throw new Error(`Snapshot "${snapshotHash}" was not found.`);
  return snapshot;
}

export async function resolveCompareSourceCatalog(
  routeConnectionId: number,
  source: DbHistoryCompareSource,
  options: { databaseName: string; refreshLiveSchema?: boolean },
): Promise<ResolvedHistoryCatalog> {
  if (source.kind === "file") {
    return { source, catalog: await loadFileCatalog(source, options.databaseName) };
  }
  if (source.connectionId !== routeConnectionId) {
    throw new Error("Cross-connection history comparison is not supported in this phase.");
  }
  if (source.kind === "snapshot") {
    const snapshot = await resolveSnapshot(routeConnectionId, source.databaseName, source.snapshotHash);
    return { source, snapshot, catalog: JSON.parse(snapshot.schemaJson) as DbSchemaCatalog };
  }

  if (source.snapshotHash) {
    const snapshot = await resolveSnapshot(routeConnectionId, source.databaseName, source.snapshotHash);
    return { source, snapshot, catalog: JSON.parse(snapshot.schemaJson) as DbSchemaCatalog };
  }

  if (options.refreshLiveSchema) {
    await getDbConnectionRecordOrThrow(routeConnectionId);
    const rawSchema = await introspectMySqlDatabase(routeConnectionId, source.databaseName);
    const catalog = normalizeMySqlSchema(rawSchema);
    const persisted = await persistDbSchemaSnapshot(routeConnectionId, catalog);
    return { source: { ...source, snapshotHash: persisted.snapshot.snapshotHash }, snapshot: persisted.snapshot, catalog };
  }

  const latest = await storage.getLatestDbSchemaSnapshot(routeConnectionId, source.databaseName);
  if (!latest) {
    throw new Error(`No schema snapshot exists for database "${source.databaseName}". Run scan first.`);
  }
  return { source: { ...source, snapshotHash: latest.snapshotHash }, snapshot: latest, catalog: JSON.parse(latest.schemaJson) as DbSchemaCatalog };
}

async function resolveLiveCompareCatalog(
  target: DbCompareLiveTarget,
  refreshSchema: boolean,
): Promise<ResolvedLiveCompareCatalog> {
  const connection = await getDbConnectionRecordOrThrow(target.connectionId);

  if (!refreshSchema) {
    if (target.snapshotHash) {
      const snapshot = await resolveSnapshot(target.connectionId, target.databaseName, target.snapshotHash);
      return {
        target,
        connectionName: connection.name,
        catalog: JSON.parse(snapshot.schemaJson) as DbSchemaCatalog,
        snapshot,
        cacheHit: true,
      };
    }
    const latest = await storage.getLatestDbSchemaSnapshot(target.connectionId, target.databaseName);
    if (latest) {
      return {
        target: { ...target, snapshotHash: latest.snapshotHash },
        connectionName: connection.name,
        catalog: JSON.parse(latest.schemaJson) as DbSchemaCatalog,
        snapshot: latest,
        cacheHit: true,
      };
    }
  }

  const rawSchema = await introspectMySqlDatabase(target.connectionId, target.databaseName);
  const catalog = normalizeMySqlSchema(rawSchema);
  const persisted = await persistDbSchemaSnapshot(target.connectionId, catalog);
  return {
    target: { ...target, snapshotHash: persisted.snapshot.snapshotHash },
    connectionName: connection.name,
    catalog,
    snapshot: persisted.snapshot,
    cacheHit: persisted.cacheHit,
  };
}

export async function compareLiveDatabases(input: DbVsDbCompareRequest): Promise<DbVsDbCompareResponse> {
  const [source, target, storedPolicy] = await Promise.all([
    resolveLiveCompareCatalog(input.source, input.refreshSourceSchema),
    resolveLiveCompareCatalog(input.target, input.refreshTargetSchema),
    storage.getDbComparePolicy(),
  ]);
  const policy = { ...DEFAULT_DB_COMPARE_POLICY, ...storedPolicy };

  const sourceTables = dbCatalogToFileTables(source.catalog).filter((table) =>
    input.scope !== "table" || normalizeName(fileTableName(table)) === normalizeName(input.tableName),
  );
  const targetTables =
    input.scope === "table" && input.tableName
      ? target.catalog.tables.filter((table) => normalizeName(table.name) === normalizeName(input.tableName))
      : target.catalog.tables;

  const compared = compareFileLikeTablesAgainstDbSchema({
    sheetName: source.catalog.databaseName,
    tables: sourceTables,
    dbTables: targetTables,
  });

  const baseResult: DbVsDbCompareResponse = {
    context: {
      sourceConnectionId: source.target.connectionId,
      sourceConnectionName: source.connectionName,
      sourceDatabaseName: source.target.databaseName,
      sourceSnapshotHash: source.snapshot.snapshotHash,
      targetConnectionId: target.target.connectionId,
      targetConnectionName: target.connectionName,
      targetDatabaseName: target.target.databaseName,
      targetSnapshotHash: target.snapshot.snapshotHash,
      scope: input.scope,
      tableName: input.tableName,
    },
    ...compared,
    policy,
  };
  const autoAcceptDecisions = buildAutoAcceptRenameDecisions(baseResult, policy);
  return autoAcceptDecisions.length > 0
    ? applyRenameDecisionsToCompareResult(baseResult, autoAcceptDecisions)
    : baseResult;
}

export async function reviewLiveDatabaseRenames(
  request: DbVsDbRenameReviewRequest,
): Promise<DbVsDbCompareResponse> {
  const compareResult = await compareLiveDatabases(request.compare);
  return applyRenameDecisionsToCompareResult(compareResult, request.decisions);
}

function compareCatalogs(args: {
  databaseName: string;
  leftCatalog: DbSchemaCatalog;
  rightCatalog: DbSchemaCatalog;
  scope: DbHistoryCompareRequest["scope"];
  tableName?: string;
}): Pick<DbHistoryCompareResponse, "summary" | "tableChanges" | "blockers" | "canApply"> {
  const leftTables = dbCatalogToFileTables(args.leftCatalog).filter((table) => args.scope !== "table" || normalizeName(fileTableName(table)) === normalizeName(args.tableName));
  const rightTables = args.rightCatalog.tables.filter((table) => args.scope !== "table" || normalizeName(table.name) === normalizeName(args.tableName));
  const rightByName = new Map(rightTables.map((table) => [normalizeName(table.name), table]));
  const matched = new Set<string>();
  const tableChanges: DbDiffTableChange[] = [];

  for (const leftTable of leftTables) {
    const rightTable = rightByName.get(normalizeName(fileTableName(leftTable)));
    if (!rightTable) {
      tableChanges.push({ action: "added", entityKey: buildEntityKey(["table", args.databaseName, fileTableName(leftTable), "create"]), sheetName: args.databaseName, requiresConfirmation: false, fileTable: leftTable, changedFields: [], columnChanges: [], blockers: [] });
      continue;
    }
    matched.add(normalizeName(rightTable.name));
    const columnChanges: DbDiffColumnChange[] = [];
    const rightColumns = new Map(rightTable.columns.map((column) => [normalizeName(column.name), column]));
    const matchedColumns = new Set<string>();
    for (const leftColumn of leftTable.columns) {
      const rightColumn = rightColumns.get(normalizeName(fileColumnName(leftColumn)));
      if (!rightColumn) {
        columnChanges.push({ action: "added", entityKey: buildEntityKey(["column", args.databaseName, fileTableName(leftTable), fileColumnName(leftColumn), "add"]), requiresConfirmation: false, fileColumn: leftColumn, changedFields: [], blockers: [] });
        continue;
      }
      matchedColumns.add(normalizeName(rightColumn.name));
      const changedFields = collectColumnChangedFields(leftColumn, rightColumn);
      if (changedFields.length > 0) {
        const entityKey = buildEntityKey(["column", args.databaseName, fileTableName(leftTable), rightColumn.name]);
        columnChanges.push({ action: "modified", entityKey, requiresConfirmation: false, changedFields, fileColumn: leftColumn, dbColumn: rightColumn, blockers: buildColumnBlockers(args.databaseName, rightTable.name, leftColumn, rightColumn, "modified", entityKey) });
      }
    }
    for (const rightColumn of rightTable.columns) {
      if (matchedColumns.has(normalizeName(rightColumn.name))) continue;
      const entityKey = buildEntityKey(["column", args.databaseName, rightTable.name, rightColumn.name, "drop"]);
      columnChanges.push({ action: "removed", entityKey, requiresConfirmation: false, dbColumn: rightColumn, changedFields: [], blockers: buildColumnBlockers(args.databaseName, rightTable.name, undefined, rightColumn, "removed", entityKey) });
    }
    const changedFields = collectTableChangedFields(leftTable, rightTable);
    if (changedFields.length > 0 || columnChanges.length > 0) {
      tableChanges.push({ action: "modified", entityKey: buildEntityKey(["table", args.databaseName, rightTable.name]), sheetName: args.databaseName, requiresConfirmation: false, changedFields, fileTable: leftTable, dbTable: rightTable, columnChanges, blockers: columnChanges.flatMap((change) => change.blockers) });
    }
  }

  for (const rightTable of rightTables) {
    if (matched.has(normalizeName(rightTable.name))) continue;
    const entityKey = buildEntityKey(["table", args.databaseName, rightTable.name, "drop"]);
    tableChanges.push({ action: "removed", entityKey, sheetName: args.databaseName, requiresConfirmation: false, dbTable: rightTable, changedFields: [], columnChanges: [], blockers: [createBlocker("drop_table", "table", entityKey, `Removing DB table ${rightTable.name} is blocked in preview.`, { sheetName: args.databaseName, tableName: rightTable.name })] });
  }

  const blockers = tableChanges.flatMap((change) => [...change.blockers, ...change.columnChanges.flatMap((column) => column.blockers)]);
  return {
    summary: buildDiffSummary(tableChanges, blockers),
    tableChanges: tableChanges.sort((left, right) => left.entityKey.localeCompare(right.entityKey)),
    blockers,
    canApply: blockers.length === 0,
  };
}

export async function listDbHistory(connectionId: number, input: DbHistoryListRequest): Promise<DbHistoryListResponse> {
  const events = (await storage.listDbSchemaScanEvents(connectionId, input.databaseName)).sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")));
  const latestSnapshot = await storage.getLatestDbSchemaSnapshot(connectionId, input.databaseName);
  const limited = events.filter((event) => !input.changedOnly || event.eventType === "new_snapshot").slice(0, input.limit);
  const entries: DbHistoryEntry[] = [];
  for (const event of limited) {
    const snapshot = await storage.getDbSchemaSnapshotByHash(connectionId, event.databaseName, event.snapshotHash);
    const previousSnapshot = event.previousSnapshotHash ? await storage.getDbSchemaSnapshotByHash(connectionId, event.databaseName, event.previousSnapshotHash) : undefined;
    entries.push({ scanEvent: event, snapshot, previousSnapshot, createdNewSnapshot: event.eventType === "new_snapshot" });
  }
  return { connectionId, databaseName: input.databaseName, latestSnapshotHash: latestSnapshot?.snapshotHash, entries };
}

export async function getDbHistoryDetail(connectionId: number, eventId: number): Promise<DbHistoryDetailResponse> {
  const event = await storage.getDbSchemaScanEvent(eventId);
  if (!event || event.connectionId !== connectionId) {
    throw new Error("DB history event not found.");
  }
  const snapshot = await storage.getDbSchemaSnapshotByHash(connectionId, event.databaseName, event.snapshotHash);
  const previousSnapshot = event.previousSnapshotHash ? await storage.getDbSchemaSnapshotByHash(connectionId, event.databaseName, event.previousSnapshotHash) : undefined;
  return { entry: { scanEvent: event, snapshot, previousSnapshot, createdNewSnapshot: event.eventType === "new_snapshot" } };
}

export async function compareDbHistory(connectionId: number, input: DbHistoryCompareRequest): Promise<DbHistoryCompareResponse> {
  const databaseName = resolveDatabaseNameFromSources(input.left, input.right);
  const [left, right] = await Promise.all([
    resolveCompareSourceCatalog(connectionId, input.left, { databaseName, refreshLiveSchema: input.refreshLiveSchema }),
    resolveCompareSourceCatalog(connectionId, input.right, { databaseName, refreshLiveSchema: input.refreshLiveSchema }),
  ]);
  const compared = compareCatalogs({ databaseName, leftCatalog: left.catalog, rightCatalog: right.catalog, scope: input.scope, tableName: input.tableName });
  return {
    context: { connectionId, databaseName, left: left.source, right: right.source, scope: input.scope, tableName: input.tableName },
    summary: compared.summary,
    tableChanges: compared.tableChanges,
    blockers: compared.blockers,
    canApply: input.left.kind === "file" && input.right.kind !== "file" && compared.blockers.length === 0,
  };
}
