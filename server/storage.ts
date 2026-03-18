import {
  type InsertUploadedFile,
  type UploadedFile,
  type DdlSettings,
  type ExtensionId,
  type InstalledExtensionRecord,
  type ExtensionLifecycleState,
  type ExtensionLifecycleStage,
  type ExtensionLifecycleErrorCode,
  type DbConnectionRecord,
  type DbConnectionSummary,
  type DbComparePolicy,
  type DbConnectionTestStatus,
  type DbSchemaSnapshot,
  type DbHistoryCompareSource,
  type DbSchemaScanEvent,
  type DbDeployJob,
  type DbDeployJobStatementResult,
  type ProcessingTask,
  type NameFixJob,
  type NameFixJobItem,
  type NameFixBackup,
  type SchemaSnapshot,
  type VersionLink,
  type SchemaDiff,
  type DiffRenameDecision,
  dbHistoryCompareSourceSchema,
  dbDeployJobSummarySchema,
  uploadedFiles as uploadedFilesTable,
  ddlSettings as ddlSettingsTable,
  installedExtensions as installedExtensionsTable,
  extensionLifecycleStates as extensionLifecycleStatesTable,
  dbConnections as dbConnectionsTable,
  dbComparePolicies as dbComparePoliciesTable,
  dbSchemaSnapshots as dbSchemaSnapshotsTable,
  dbSchemaScanEvents as dbSchemaScanEventsTable,
  dbDeployJobs as dbDeployJobsTable,
  dbDeployJobStatementResults as dbDeployJobStatementResultsTable,
  processingTasks as processingTasksTable,
  nameFixJobs as nameFixJobsTable,
  nameFixJobItems as nameFixJobItemsTable,
  nameFixBackups as nameFixBackupsTable,
  schemaSnapshots as schemaSnapshotsTable,
  versionLinks as versionLinksTable,
  schemaDiffs as schemaDiffsTable,
  diffRenameDecisions as diffRenameDecisionsTable,
} from "@shared/schema";
import { APP_DEFAULTS, createDefaultDdlSettings } from "@shared/config";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import { db } from "./db";

const DEFAULT_PK_MARKERS = [...APP_DEFAULTS.excel.pkMarkers];
const DEFAULT_UPLOAD_RATE_LIMIT_WINDOW_MS = APP_DEFAULTS.rateLimit.uploadWindowMs;
const DEFAULT_UPLOAD_RATE_LIMIT_MAX_REQUESTS = APP_DEFAULTS.rateLimit.uploadMaxRequests;
const DEFAULT_PARSE_RATE_LIMIT_WINDOW_MS = APP_DEFAULTS.rateLimit.parseWindowMs;
const DEFAULT_PARSE_RATE_LIMIT_MAX_REQUESTS = APP_DEFAULTS.rateLimit.parseMaxRequests;
const DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_WINDOW_MS = APP_DEFAULTS.rateLimit.globalProtectWindowMs;
const DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_MAX_REQUESTS = APP_DEFAULTS.rateLimit.globalProtectMaxRequests;
const DEFAULT_GLOBAL_PROTECT_MAX_INFLIGHT = APP_DEFAULTS.rateLimit.globalProtectMaxInFlight;
const DEFAULT_PREWARM_ENABLED = APP_DEFAULTS.prewarm.enabled;
const DEFAULT_PREWARM_MAX_CONCURRENCY = APP_DEFAULTS.prewarm.maxConcurrency;
const DEFAULT_PREWARM_QUEUE_MAX = APP_DEFAULTS.prewarm.queueMax;
const DEFAULT_PREWARM_MAX_FILE_MB = APP_DEFAULTS.prewarm.maxFileMb;
const DEFAULT_TASK_MANAGER_MAX_QUEUE_LENGTH = APP_DEFAULTS.taskManager.maxQueueLength;
const DEFAULT_TASK_MANAGER_STALE_PENDING_MS = APP_DEFAULTS.taskManager.stalePendingMs;
const DEFAULT_NAME_FIX_DEFAULT_MODE = APP_DEFAULTS.nameFix.defaultMode;
const DEFAULT_NAME_FIX_CONFLICT_STRATEGY = APP_DEFAULTS.nameFix.conflictStrategy;
const DEFAULT_NAME_FIX_RESERVED_WORD_STRATEGY = APP_DEFAULTS.nameFix.reservedWordStrategy;
const DEFAULT_NAME_FIX_LENGTH_OVERFLOW_STRATEGY = APP_DEFAULTS.nameFix.lengthOverflowStrategy;
const DEFAULT_NAME_FIX_MAX_IDENTIFIER_LENGTH = APP_DEFAULTS.nameFix.maxIdentifierLength;
const DEFAULT_NAME_FIX_BACKUP_RETENTION_DAYS = APP_DEFAULTS.nameFix.backupRetentionDays;
const DEFAULT_NAME_FIX_MAX_BATCH_CONCURRENCY = APP_DEFAULTS.nameFix.maxBatchConcurrency;
const DEFAULT_ALLOW_OVERWRITE_IN_ELECTRON = APP_DEFAULTS.nameFix.allowOverwriteInElectron;
const DEFAULT_ALLOW_EXTERNAL_PATH_WRITE = APP_DEFAULTS.nameFix.allowExternalPathWrite;

type AppDatabase = BetterSQLite3Database<typeof import("@shared/schema")>;
type UploadedFileRow = typeof uploadedFilesTable.$inferSelect;
type DdlSettingsRow = typeof ddlSettingsTable.$inferSelect;
type DdlSettingsInsertRow = typeof ddlSettingsTable.$inferInsert;
type InstalledExtensionRow = typeof installedExtensionsTable.$inferSelect;
type InstalledExtensionInsertRow = typeof installedExtensionsTable.$inferInsert;
type ExtensionLifecycleStateRow = typeof extensionLifecycleStatesTable.$inferSelect;
type ExtensionLifecycleStateInsertRow = typeof extensionLifecycleStatesTable.$inferInsert;
type DbConnectionRow = typeof dbConnectionsTable.$inferSelect;
type DbConnectionInsertRow = typeof dbConnectionsTable.$inferInsert;
type DbComparePolicyRow = typeof dbComparePoliciesTable.$inferSelect;
type DbComparePolicyInsertRow = typeof dbComparePoliciesTable.$inferInsert;
type DbSchemaSnapshotRow = typeof dbSchemaSnapshotsTable.$inferSelect;
type DbSchemaSnapshotInsertRow = typeof dbSchemaSnapshotsTable.$inferInsert;
type DbSchemaScanEventRow = typeof dbSchemaScanEventsTable.$inferSelect;
type DbSchemaScanEventInsertRow = typeof dbSchemaScanEventsTable.$inferInsert;
type DbDeployJobRow = typeof dbDeployJobsTable.$inferSelect;
type DbDeployJobInsertRow = typeof dbDeployJobsTable.$inferInsert;
type DbDeployJobStatementResultRow = typeof dbDeployJobStatementResultsTable.$inferSelect;
type DbDeployJobStatementResultInsertRow = typeof dbDeployJobStatementResultsTable.$inferInsert;
type ProcessingTaskRow = typeof processingTasksTable.$inferSelect;
type NameFixJobRow = typeof nameFixJobsTable.$inferSelect;
type NameFixJobItemRow = typeof nameFixJobItemsTable.$inferSelect;
type NameFixBackupRow = typeof nameFixBackupsTable.$inferSelect;
type SchemaSnapshotRow = typeof schemaSnapshotsTable.$inferSelect;
type VersionLinkRow = typeof versionLinksTable.$inferSelect;
type SchemaDiffRow = typeof schemaDiffsTable.$inferSelect;
type DiffRenameDecisionRow = typeof diffRenameDecisionsTable.$inferSelect;

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function parseHistoryCompareSource(value: string): DbHistoryCompareSource {
  return dbHistoryCompareSourceSchema.parse(JSON.parse(value));
}

function parseDeployJobSummary(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }
  return dbDeployJobSummarySchema.parse(JSON.parse(value));
}

function normalizePkMarkers(markers?: string[]): string[] {
  const source = Array.isArray(markers) ? markers : DEFAULT_PK_MARKERS;
  const cleaned = source
    .map((marker) => String(marker ?? "").trim())
    .filter((marker) => marker.length > 0);
  const unique = Array.from(new Set(cleaned));
  return unique.length > 0 ? unique : DEFAULT_PK_MARKERS;
}

function parsePkMarkers(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return normalizePkMarkers(raw as string[]);
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    return DEFAULT_PK_MARKERS;
  }
  try {
    const parsed = JSON.parse(raw);
    return normalizePkMarkers(Array.isArray(parsed) ? parsed.map((item) => String(item)) : undefined);
  } catch {
    return DEFAULT_PK_MARKERS;
  }
}

function serializePkMarkers(markers?: string[]): string {
  return JSON.stringify(normalizePkMarkers(markers));
}

function toOptionalString(value: string | null | undefined): string | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return value;
}

function toMysqlDataTypeCase(value: string | null | undefined): "lower" | "upper" {
  return value === "upper" ? "upper" : "lower";
}

function toMysqlBooleanMode(value: string | null | undefined): "tinyint(1)" | "boolean" {
  return value === "boolean" ? "boolean" : "tinyint(1)";
}

function toNameFixMode(value: string | null | undefined): "copy" | "overwrite" | "replace_download" {
  if (value === "overwrite" || value === "replace_download") {
    return value;
  }
  return "copy";
}

function toNameFixScope(value: string | null | undefined): "current_sheet" | "selected_sheets" | "all_sheets" {
  if (value === "selected_sheets" || value === "all_sheets") {
    return value;
  }
  return "current_sheet";
}

function toNameFixStatus(
  value: string | null | undefined,
): "pending" | "processing" | "completed" | "failed" | "rolled_back" {
  if (value === "processing" || value === "completed" || value === "failed" || value === "rolled_back") {
    return value;
  }
  return "pending";
}

function toNameFixConflictStrategy(value: string | null | undefined): "suffix_increment" | "hash_suffix" | "abort" {
  if (value === "hash_suffix" || value === "abort") {
    return value;
  }
  return "suffix_increment";
}

function toReservedWordStrategy(value: string | null | undefined): "prefix" | "abort" {
  return value === "abort" ? "abort" : "prefix";
}

function toLengthOverflowStrategy(value: string | null | undefined): "truncate_hash" | "abort" {
  return value === "abort" ? "abort" : "truncate_hash";
}

function toNameFixTarget(value: string | null | undefined): "table" | "column" {
  return value === "column" ? "column" : "table";
}

function confidenceToStored(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(clamped * 10000);
}

function confidenceFromStored(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) {
    return 0;
  }
  return Math.max(0, Math.min(1, (value as number) / 10000));
}

function toDiffScope(value: string | null | undefined): "current_sheet" | "all_sheets" {
  return value === "all_sheets" ? "all_sheets" : "current_sheet";
}

function toDiffSelectionMode(value: string | null | undefined): "auto" | "manual" {
  return value === "manual" ? "manual" : "auto";
}

function toDiffDecision(value: string | null | undefined): "pending" | "accept" | "reject" {
  if (value === "accept" || value === "reject") {
    return value;
  }
  return "pending";
}

function toDiffEntityType(value: string | null | undefined): "table" | "column" {
  return value === "column" ? "column" : "table";
}

function toExtensionId(value: string | null | undefined): ExtensionId {
  return value === "db-management" ? "db-management" : "db-management";
}

function toExtensionCompatibilityStatus(
  value: string | null | undefined,
): "unknown" | "compatible" | "incompatible" {
  if (value === "compatible" || value === "incompatible") {
    return value;
  }
  return "unknown";
}

function toExtensionLifecycleStage(value: string | null | undefined): ExtensionLifecycleStage {
  switch (value) {
    case "checking":
    case "available":
    case "downloading":
    case "downloaded":
    case "verifying":
    case "verified":
    case "installing":
    case "installed":
    case "ready_to_enable":
    case "update_available":
    case "uninstalling":
    case "failed":
      return value;
    default:
      return "idle";
  }
}

function toExtensionLifecycleErrorCode(
  value: string | null | undefined,
): ExtensionLifecycleErrorCode | undefined {
  switch (value) {
    case "network_error":
    case "catalog_unavailable":
    case "asset_not_found":
    case "verification_failed":
    case "incompatible":
    case "install_failed":
    case "uninstall_failed":
      return value;
    default:
      return undefined;
  }
}

function toDbConnectionTestStatus(value: string | null | undefined): DbConnectionTestStatus {
  switch (value) {
    case "ok":
    case "failed":
      return value;
    default:
      return "unknown";
  }
}

export interface IStorage {
  createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
  getUploadedFiles(): Promise<UploadedFile[]>;
  getUploadedFile(id: number): Promise<UploadedFile | undefined>;
  findFileByHash(hash: string): Promise<UploadedFile | undefined>;
  updateUploadedFile(id: number, updates: Pick<InsertUploadedFile, 'fileHash' | 'fileSize'>): Promise<UploadedFile | undefined>;
  deleteUploadedFile(id: number): Promise<void>;
  getSettings(): Promise<DdlSettings>;
  updateSettings(settings: DdlSettings): Promise<DdlSettings>;
  listInstalledExtensions(): Promise<InstalledExtensionRecord[]>;
  getInstalledExtension(extensionId: ExtensionId): Promise<InstalledExtensionRecord | undefined>;
  upsertInstalledExtension(
    extension: Omit<InstalledExtensionRecord, "id" | "installedAt" | "updatedAt">,
  ): Promise<InstalledExtensionRecord>;
  setInstalledExtensionEnabled(
    extensionId: ExtensionId,
    enabled: boolean,
  ): Promise<InstalledExtensionRecord | undefined>;
  listExtensionLifecycleStates(): Promise<ExtensionLifecycleState[]>;
  getExtensionLifecycleState(extensionId: ExtensionId): Promise<ExtensionLifecycleState | undefined>;
  upsertExtensionLifecycleState(
    lifecycleState: Omit<ExtensionLifecycleState, "id" | "updatedAt">,
  ): Promise<ExtensionLifecycleState>;
  deleteExtensionLifecycleState(extensionId: ExtensionId): Promise<void>;
  listDbConnections(): Promise<DbConnectionSummary[]>;
  getDbConnection(id: number): Promise<DbConnectionRecord | undefined>;
  getDbComparePolicy(): Promise<DbComparePolicy>;
  updateDbComparePolicy(policy: DbComparePolicy): Promise<DbComparePolicy>;
  createDbConnection(
    connection: Omit<DbConnectionRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<DbConnectionRecord>;
  updateDbConnection(
    id: number,
    updates: Partial<Omit<DbConnectionRecord, "id" | "createdAt" | "updatedAt">>,
  ): Promise<DbConnectionRecord | undefined>;
  deleteDbConnection(id: number): Promise<void>;
  listDbSchemaSnapshots(connectionId: number, databaseName?: string): Promise<DbSchemaSnapshot[]>;
  getLatestDbSchemaSnapshot(connectionId: number, databaseName: string): Promise<DbSchemaSnapshot | undefined>;
  getDbSchemaSnapshotByHash(
    connectionId: number,
    databaseName: string,
    snapshotHash: string,
  ): Promise<DbSchemaSnapshot | undefined>;
  createDbSchemaSnapshot(
    snapshot: Omit<DbSchemaSnapshot, "id" | "capturedAt" | "updatedAt">,
  ): Promise<DbSchemaSnapshot>;
  listDbSchemaScanEvents(connectionId: number, databaseName?: string): Promise<DbSchemaScanEvent[]>;
  getDbSchemaScanEvent(id: number): Promise<DbSchemaScanEvent | undefined>;
  createDbSchemaScanEvent(
    event: Omit<DbSchemaScanEvent, "id" | "createdAt">,
  ): Promise<DbSchemaScanEvent>;
  listDbDeployJobs(connectionId: number, databaseName?: string): Promise<DbDeployJob[]>;
  getDbDeployJob(id: string): Promise<DbDeployJob | undefined>;
  createDbDeployJob(job: Omit<DbDeployJob, "createdAt" | "updatedAt">): Promise<DbDeployJob>;
  updateDbDeployJob(
    id: string,
    updates: Partial<Omit<DbDeployJob, "id" | "createdAt" | "updatedAt">>,
  ): Promise<DbDeployJob | undefined>;
  replaceDbDeployJobStatementResults(
    jobId: string,
    results: Omit<DbDeployJobStatementResult, "id" | "createdAt">[],
  ): Promise<DbDeployJobStatementResult[]>;
  listDbDeployJobStatementResults(jobId: string): Promise<DbDeployJobStatementResult[]>;

  // Task management
  createTask(task: Omit<ProcessingTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProcessingTask>;
  getTask(id: number): Promise<ProcessingTask | undefined>;
  updateTask(id: number, updates: Partial<Omit<ProcessingTask, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ProcessingTask | undefined>;
  deleteTask(id: number): Promise<void>;

  // Name-fix jobs
  createNameFixJob(job: Omit<NameFixJob, "createdAt" | "updatedAt">): Promise<NameFixJob>;
  getNameFixJob(id: string): Promise<NameFixJob | undefined>;
  updateNameFixJob(
    id: string,
    updates: Partial<Omit<NameFixJob, "id" | "createdAt" | "updatedAt">>,
  ): Promise<NameFixJob | undefined>;
  createNameFixJobItems(items: Omit<NameFixJobItem, "id" | "createdAt">[]): Promise<NameFixJobItem[]>;
  listNameFixJobItems(jobId: string): Promise<NameFixJobItem[]>;
  createNameFixBackup(backup: Omit<NameFixBackup, "id" | "createdAt">): Promise<NameFixBackup>;
  listNameFixBackups(): Promise<NameFixBackup[]>;
  getNameFixBackupsByJob(jobId: string): Promise<NameFixBackup[]>;
  updateNameFixBackup(
    id: number,
    updates: Partial<Omit<NameFixBackup, "id" | "createdAt">>,
  ): Promise<NameFixBackup | undefined>;

  // Diff snapshots and cache
  listUploadedFilesByOriginalName(originalName: string): Promise<UploadedFile[]>;
  getSchemaSnapshotByFileId(fileId: number, algorithmVersion: string): Promise<SchemaSnapshot | undefined>;
  getSchemaSnapshotByHash(
    snapshotHash: string,
    algorithmVersion: string,
  ): Promise<SchemaSnapshot | undefined>;
  createSchemaSnapshot(snapshot: Omit<SchemaSnapshot, "id" | "createdAt">): Promise<SchemaSnapshot>;
  upsertVersionLink(link: Omit<VersionLink, "id" | "createdAt">): Promise<VersionLink>;
  listVersionLinksByNewFileId(newFileId: number): Promise<VersionLink[]>;
  getSchemaDiffById(id: string): Promise<SchemaDiff | undefined>;
  getSchemaDiffByCacheKey(cacheKey: string): Promise<SchemaDiff | undefined>;
  createOrUpdateSchemaDiff(diff: Omit<SchemaDiff, "createdAt" | "lastUsedAt">): Promise<SchemaDiff>;
  touchSchemaDiff(id: string): Promise<void>;
  replaceDiffRenameDecisions(
    diffId: string,
    decisions: Omit<DiffRenameDecision, "id" | "updatedAt">[],
  ): Promise<DiffRenameDecision[]>;
  listDiffRenameDecisions(diffId: string): Promise<DiffRenameDecision[]>;
}

// Memory-based storage for development (no database needed)
export class MemoryStorage implements IStorage {
  private files: UploadedFile[] = [];
  private tasks: ProcessingTask[] = [];
  private installedExtensions: InstalledExtensionRecord[] = [];
  private extensionLifecycleStates: ExtensionLifecycleState[] = [];
  private dbConnections: DbConnectionRecord[] = [];
  private dbComparePolicy: DbComparePolicy = {};
  private dbSchemaSnapshots: DbSchemaSnapshot[] = [];
  private dbSchemaScanEvents: DbSchemaScanEvent[] = [];
  private dbDeployJobs: DbDeployJob[] = [];
  private dbDeployJobStatementResults: DbDeployJobStatementResult[] = [];
  private nameFixJobs: NameFixJob[] = [];
  private nameFixJobItems: NameFixJobItem[] = [];
  private nameFixBackups: NameFixBackup[] = [];
  private schemaSnapshots: SchemaSnapshot[] = [];
  private versionLinks: VersionLink[] = [];
  private schemaDiffs: SchemaDiff[] = [];
  private diffRenameDecisions: DiffRenameDecision[] = [];
  private nextId = 1;
  private nextTaskId = 1;
  private nextDbConnectionId = 1;
  private nextNameFixItemId = 1;
  private nextNameFixBackupId = 1;
  private nextDbSchemaSnapshotId = 1;
  private nextDbSchemaScanEventId = 1;
  private nextDbDeployJobStatementResultId = 1;
  private nextSchemaSnapshotId = 1;
  private nextVersionLinkId = 1;
  private nextDiffRenameDecisionId = 1;
  private settings: DdlSettings = createDefaultDdlSettings();

  async createUploadedFile(insertFile: InsertUploadedFile): Promise<UploadedFile> {
    const file: UploadedFile = {
      id: this.nextId++,
      filePath: insertFile.filePath,
      originalName: insertFile.originalName,
      originalModifiedAt: insertFile.originalModifiedAt ?? null,
      fileHash: insertFile.fileHash,
      fileSize: insertFile.fileSize || 0,
      uploadedAt: new Date().toISOString(),
    };
    this.files.push(file);
    return file;
  }

  async getUploadedFiles(): Promise<UploadedFile[]> {
    return this.files;
  }

  async listUploadedFilesByOriginalName(originalName: string): Promise<UploadedFile[]> {
    return this.files.filter((file) => file.originalName === originalName);
  }

  async getUploadedFile(id: number): Promise<UploadedFile | undefined> {
    return this.files.find(f => f.id === id);
  }

  async findFileByHash(hash: string): Promise<UploadedFile | undefined> {
    return this.files.find(f => f.fileHash === hash);
  }

  async deleteUploadedFile(id: number): Promise<void> {
    this.files = this.files.filter(f => f.id !== id);
  }

  async updateUploadedFile(id: number, updates: Pick<InsertUploadedFile, 'fileHash' | 'fileSize'>): Promise<UploadedFile | undefined> {
    const file = this.files.find(f => f.id === id);
    if (!file) return undefined;
    Object.assign(file, updates);
    return file;
  }

  async getSettings(): Promise<DdlSettings> {
    return {
      ...this.settings,
      pkMarkers: normalizePkMarkers(this.settings.pkMarkers),
    };
  }

  async updateSettings(settings: DdlSettings): Promise<DdlSettings> {
    this.settings = {
      ...settings,
      pkMarkers: normalizePkMarkers(settings.pkMarkers),
    };
    return this.settings;
  }

  async listInstalledExtensions(): Promise<InstalledExtensionRecord[]> {
    return [...this.installedExtensions];
  }

  async getInstalledExtension(extensionId: ExtensionId): Promise<InstalledExtensionRecord | undefined> {
    return this.installedExtensions.find((extension) => extension.extensionId === extensionId);
  }

  async upsertInstalledExtension(
    extension: Omit<InstalledExtensionRecord, "id" | "installedAt" | "updatedAt">,
  ): Promise<InstalledExtensionRecord> {
    const now = new Date().toISOString();
    const existing = this.installedExtensions.find((item) => item.extensionId === extension.extensionId);
    if (existing) {
      Object.assign(existing, extension, { updatedAt: now });
      return existing;
    }

    const created: InstalledExtensionRecord = {
      ...extension,
      id: this.nextId++,
      installedAt: now,
      updatedAt: now,
    };
    this.installedExtensions.push(created);
    return created;
  }

  async setInstalledExtensionEnabled(
    extensionId: ExtensionId,
    enabled: boolean,
  ): Promise<InstalledExtensionRecord | undefined> {
    const extension = this.installedExtensions.find((item) => item.extensionId === extensionId);
    if (!extension) {
      return undefined;
    }
    extension.enabled = enabled;
    extension.updatedAt = new Date().toISOString();
    return extension;
  }

  async listExtensionLifecycleStates(): Promise<ExtensionLifecycleState[]> {
    return [...this.extensionLifecycleStates];
  }

  async getExtensionLifecycleState(extensionId: ExtensionId): Promise<ExtensionLifecycleState | undefined> {
    return this.extensionLifecycleStates.find((item) => item.extensionId === extensionId);
  }

  async upsertExtensionLifecycleState(
    lifecycleState: Omit<ExtensionLifecycleState, "id" | "updatedAt">,
  ): Promise<ExtensionLifecycleState> {
    const now = new Date().toISOString();
    const existing = this.extensionLifecycleStates.find((item) => item.extensionId === lifecycleState.extensionId);
    if (existing) {
      Object.assign(existing, lifecycleState, { updatedAt: now });
      return existing;
    }

    const created: ExtensionLifecycleState = {
      ...lifecycleState,
      id: this.nextId++,
      updatedAt: now,
    };
    this.extensionLifecycleStates.push(created);
    return created;
  }

  async deleteExtensionLifecycleState(extensionId: ExtensionId): Promise<void> {
    this.extensionLifecycleStates = this.extensionLifecycleStates.filter((item) => item.extensionId !== extensionId);
  }

  async listDbConnections(): Promise<DbConnectionSummary[]> {
    return this.dbConnections.map(({ encryptedPassword, ...connection }) => ({
      ...connection,
      passwordStored: Boolean(encryptedPassword),
    }));
  }

  async getDbConnection(id: number): Promise<DbConnectionRecord | undefined> {
    return this.dbConnections.find((connection) => connection.id === id);
  }

  async getDbComparePolicy(): Promise<DbComparePolicy> {
    return { ...this.dbComparePolicy };
  }

  async updateDbComparePolicy(policy: DbComparePolicy): Promise<DbComparePolicy> {
    this.dbComparePolicy = { ...policy };
    return { ...this.dbComparePolicy };
  }

  async createDbConnection(
    connection: Omit<DbConnectionRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<DbConnectionRecord> {
    const now = new Date().toISOString();
    const record: DbConnectionRecord = {
      ...connection,
      id: this.nextDbConnectionId++,
      createdAt: now,
      updatedAt: now,
    };
    this.dbConnections.push(record);
    return record;
  }

  async updateDbConnection(
    id: number,
    updates: Partial<Omit<DbConnectionRecord, "id" | "createdAt" | "updatedAt">>,
  ): Promise<DbConnectionRecord | undefined> {
    const target = this.dbConnections.find((connection) => connection.id === id);
    if (!target) {
      return undefined;
    }
    Object.assign(target, updates, { updatedAt: new Date().toISOString() });
    return target;
  }

  async deleteDbConnection(id: number): Promise<void> {
    this.dbConnections = this.dbConnections.filter((connection) => connection.id !== id);
    this.dbSchemaSnapshots = this.dbSchemaSnapshots.filter((snapshot) => snapshot.connectionId !== id);
    this.dbSchemaScanEvents = this.dbSchemaScanEvents.filter((event) => event.connectionId !== id);
    this.dbDeployJobs = this.dbDeployJobs.filter((job) => job.connectionId !== id);
    const remainingJobIds = new Set(this.dbDeployJobs.map((job) => job.id));
    this.dbDeployJobStatementResults = this.dbDeployJobStatementResults.filter((result) =>
      remainingJobIds.has(result.jobId),
    );
  }

  async listDbSchemaSnapshots(connectionId: number, databaseName?: string): Promise<DbSchemaSnapshot[]> {
    return this.dbSchemaSnapshots.filter((snapshot) => {
      if (snapshot.connectionId !== connectionId) {
        return false;
      }
      if (databaseName && snapshot.databaseName !== databaseName) {
        return false;
      }
      return true;
    });
  }

  async getLatestDbSchemaSnapshot(
    connectionId: number,
    databaseName: string,
  ): Promise<DbSchemaSnapshot | undefined> {
    return this.dbSchemaSnapshots
      .filter((snapshot) => snapshot.connectionId === connectionId && snapshot.databaseName === databaseName)
      .sort((left, right) => String(right.capturedAt ?? "").localeCompare(String(left.capturedAt ?? "")))[0];
  }

  async getDbSchemaSnapshotByHash(
    connectionId: number,
    databaseName: string,
    snapshotHash: string,
  ): Promise<DbSchemaSnapshot | undefined> {
    return this.dbSchemaSnapshots.find(
      (snapshot) =>
        snapshot.connectionId === connectionId &&
        snapshot.databaseName === databaseName &&
        snapshot.snapshotHash === snapshotHash,
    );
  }

  async createDbSchemaSnapshot(
    snapshot: Omit<DbSchemaSnapshot, "id" | "capturedAt" | "updatedAt">,
  ): Promise<DbSchemaSnapshot> {
    const now = new Date().toISOString();
    const record: DbSchemaSnapshot = {
      ...snapshot,
      id: this.nextDbSchemaSnapshotId++,
      capturedAt: now,
      updatedAt: now,
    };
    this.dbSchemaSnapshots.push(record);
    return record;
  }

  async listDbSchemaScanEvents(connectionId: number, databaseName?: string): Promise<DbSchemaScanEvent[]> {
    return this.dbSchemaScanEvents.filter((event) => {
      if (event.connectionId !== connectionId) {
        return false;
      }
      if (databaseName && event.databaseName !== databaseName) {
        return false;
      }
      return true;
    });
  }

  async getDbSchemaScanEvent(id: number): Promise<DbSchemaScanEvent | undefined> {
    return this.dbSchemaScanEvents.find((event) => event.id === id);
  }

  async createDbSchemaScanEvent(
    event: Omit<DbSchemaScanEvent, "id" | "createdAt">,
  ): Promise<DbSchemaScanEvent> {
    const record: DbSchemaScanEvent = {
      ...event,
      id: this.nextDbSchemaScanEventId++,
      createdAt: new Date().toISOString(),
    };
    this.dbSchemaScanEvents.push(record);
    return record;
  }

  async listDbDeployJobs(connectionId: number, databaseName?: string): Promise<DbDeployJob[]> {
    return this.dbDeployJobs.filter((job) => {
      if (job.connectionId !== connectionId) {
        return false;
      }
      if (databaseName && job.databaseName !== databaseName) {
        return false;
      }
      return true;
    });
  }

  async getDbDeployJob(id: string): Promise<DbDeployJob | undefined> {
    return this.dbDeployJobs.find((job) => job.id === id);
  }

  async createDbDeployJob(job: Omit<DbDeployJob, "createdAt" | "updatedAt">): Promise<DbDeployJob> {
    const now = new Date().toISOString();
    const record: DbDeployJob = {
      ...job,
      createdAt: now,
      updatedAt: now,
    };
    this.dbDeployJobs.push(record);
    return record;
  }

  async updateDbDeployJob(
    id: string,
    updates: Partial<Omit<DbDeployJob, "id" | "createdAt" | "updatedAt">>,
  ): Promise<DbDeployJob | undefined> {
    const target = this.dbDeployJobs.find((job) => job.id === id);
    if (!target) {
      return undefined;
    }
    Object.assign(target, updates, { updatedAt: new Date().toISOString() });
    return target;
  }

  async replaceDbDeployJobStatementResults(
    jobId: string,
    results: Omit<DbDeployJobStatementResult, "id" | "createdAt">[],
  ): Promise<DbDeployJobStatementResult[]> {
    this.dbDeployJobStatementResults = this.dbDeployJobStatementResults.filter((result) => result.jobId !== jobId);
    const createdAt = new Date().toISOString();
    const created = results.map((result) => ({
      ...result,
      id: this.nextDbDeployJobStatementResultId++,
      createdAt,
    }));
    this.dbDeployJobStatementResults.push(...created);
    return created;
  }

  async listDbDeployJobStatementResults(jobId: string): Promise<DbDeployJobStatementResult[]> {
    return this.dbDeployJobStatementResults.filter((result) => result.jobId === jobId);
  }

  async createTask(task: Omit<ProcessingTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProcessingTask> {
    const newTask: ProcessingTask = {
      ...task,
      id: this.nextTaskId++,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tasks.push(newTask);
    return newTask;
  }

  async getTask(id: number): Promise<ProcessingTask | undefined> {
    return this.tasks.find(t => t.id === id);
  }

  async updateTask(id: number, updates: Partial<Omit<ProcessingTask, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ProcessingTask | undefined> {
    const task = this.tasks.find(t => t.id === id);
    if (!task) return undefined;
    Object.assign(task, updates, { updatedAt: new Date() });
    return task;
  }

  async deleteTask(id: number): Promise<void> {
    this.tasks = this.tasks.filter(t => t.id !== id);
  }

  async createNameFixJob(job: Omit<NameFixJob, "createdAt" | "updatedAt">): Promise<NameFixJob> {
    const now = new Date().toISOString();
    const record: NameFixJob = {
      ...job,
      createdAt: now,
      updatedAt: now,
    };
    this.nameFixJobs.push(record);
    return record;
  }

  async getNameFixJob(id: string): Promise<NameFixJob | undefined> {
    return this.nameFixJobs.find((job) => job.id === id);
  }

  async updateNameFixJob(
    id: string,
    updates: Partial<Omit<NameFixJob, "id" | "createdAt" | "updatedAt">>,
  ): Promise<NameFixJob | undefined> {
    const target = this.nameFixJobs.find((job) => job.id === id);
    if (!target) {
      return undefined;
    }
    Object.assign(target, updates, { updatedAt: new Date().toISOString() });
    return target;
  }

  async createNameFixJobItems(items: Omit<NameFixJobItem, "id" | "createdAt">[]): Promise<NameFixJobItem[]> {
    const now = new Date().toISOString();
    const created = items.map((item) => ({
      ...item,
      id: this.nextNameFixItemId++,
      createdAt: now,
    }));
    this.nameFixJobItems.push(...created);
    return created;
  }

  async listNameFixJobItems(jobId: string): Promise<NameFixJobItem[]> {
    return this.nameFixJobItems.filter((item) => item.jobId === jobId);
  }

  async createNameFixBackup(backup: Omit<NameFixBackup, "id" | "createdAt">): Promise<NameFixBackup> {
    const record: NameFixBackup = {
      ...backup,
      id: this.nextNameFixBackupId++,
      createdAt: new Date().toISOString(),
    };
    this.nameFixBackups.push(record);
    return record;
  }

  async getNameFixBackupsByJob(jobId: string): Promise<NameFixBackup[]> {
    return this.nameFixBackups.filter((backup) => backup.jobId === jobId);
  }

  async listNameFixBackups(): Promise<NameFixBackup[]> {
    return [...this.nameFixBackups];
  }

  async updateNameFixBackup(
    id: number,
    updates: Partial<Omit<NameFixBackup, "id" | "createdAt">>,
  ): Promise<NameFixBackup | undefined> {
    const target = this.nameFixBackups.find((item) => item.id === id);
    if (!target) {
      return undefined;
    }
    Object.assign(target, updates);
    return target;
  }

  async getSchemaSnapshotByFileId(
    fileId: number,
    algorithmVersion: string,
  ): Promise<SchemaSnapshot | undefined> {
    return this.schemaSnapshots.find(
      (snapshot) => snapshot.fileId === fileId && snapshot.algorithmVersion === algorithmVersion,
    );
  }

  async getSchemaSnapshotByHash(
    snapshotHash: string,
    algorithmVersion: string,
  ): Promise<SchemaSnapshot | undefined> {
    return this.schemaSnapshots.find(
      (snapshot) =>
        snapshot.snapshotHash === snapshotHash && snapshot.algorithmVersion === algorithmVersion,
    );
  }

  async createSchemaSnapshot(snapshot: Omit<SchemaSnapshot, "id" | "createdAt">): Promise<SchemaSnapshot> {
    const record: SchemaSnapshot = {
      ...snapshot,
      id: this.nextSchemaSnapshotId++,
      createdAt: new Date().toISOString(),
    };
    this.schemaSnapshots.push(record);
    return record;
  }

  async upsertVersionLink(link: Omit<VersionLink, "id" | "createdAt">): Promise<VersionLink> {
    const existing = this.versionLinks.find(
      (row) => row.newFileId === link.newFileId && row.oldFileId === link.oldFileId,
    );
    const now = new Date().toISOString();
    if (existing) {
      existing.selectionMode = link.selectionMode;
      existing.confidence = link.confidence;
      existing.scoreBreakdownJson = link.scoreBreakdownJson;
      existing.createdAt = now;
      return existing;
    }
    const record: VersionLink = {
      ...link,
      id: this.nextVersionLinkId++,
      createdAt: now,
    };
    this.versionLinks.push(record);
    return record;
  }

  async listVersionLinksByNewFileId(newFileId: number): Promise<VersionLink[]> {
    return this.versionLinks.filter((link) => link.newFileId === newFileId);
  }

  async getSchemaDiffById(id: string): Promise<SchemaDiff | undefined> {
    return this.schemaDiffs.find((diff) => diff.id === id);
  }

  async getSchemaDiffByCacheKey(cacheKey: string): Promise<SchemaDiff | undefined> {
    return this.schemaDiffs.find((diff) => diff.cacheKey === cacheKey);
  }

  async createOrUpdateSchemaDiff(diff: Omit<SchemaDiff, "createdAt" | "lastUsedAt">): Promise<SchemaDiff> {
    const existing = this.schemaDiffs.find((row) => row.id === diff.id || row.cacheKey === diff.cacheKey);
    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, { ...diff, id: existing.id }, { lastUsedAt: now });
      return existing;
    }
    const record: SchemaDiff = {
      ...diff,
      createdAt: now,
      lastUsedAt: now,
    };
    this.schemaDiffs.push(record);
    return record;
  }

  async touchSchemaDiff(id: string): Promise<void> {
    const target = this.schemaDiffs.find((item) => item.id === id);
    if (!target) {
      return;
    }
    target.hitCount += 1;
    target.lastUsedAt = new Date().toISOString();
  }

  async replaceDiffRenameDecisions(
    diffId: string,
    decisions: Omit<DiffRenameDecision, "id" | "updatedAt">[],
  ): Promise<DiffRenameDecision[]> {
    this.diffRenameDecisions = this.diffRenameDecisions.filter((item) => item.diffId !== diffId);
    const now = new Date().toISOString();
    const created = decisions.map((item) => ({
      ...item,
      id: this.nextDiffRenameDecisionId++,
      updatedAt: now,
    }));
    this.diffRenameDecisions.push(...created);
    return created;
  }

  async listDiffRenameDecisions(diffId: string): Promise<DiffRenameDecision[]> {
    return this.diffRenameDecisions.filter((item) => item.diffId === diffId);
  }
}

// Database storage (requires PostgreSQL)
export class DatabaseStorage implements IStorage {
  private readonly db: AppDatabase;
  private readonly uploadedFiles = uploadedFilesTable;
  private readonly ddlSettings = ddlSettingsTable;
  private readonly installedExtensions = installedExtensionsTable;
  private readonly extensionLifecycleStates = extensionLifecycleStatesTable;
  private readonly dbConnections = dbConnectionsTable;
  private readonly dbComparePolicies = dbComparePoliciesTable;
  private readonly dbSchemaSnapshots = dbSchemaSnapshotsTable;
  private readonly dbSchemaScanEvents = dbSchemaScanEventsTable;
  private readonly dbDeployJobs = dbDeployJobsTable;
  private readonly dbDeployJobStatementResults = dbDeployJobStatementResultsTable;
  private readonly processingTasks = processingTasksTable;
  private readonly nameFixJobs = nameFixJobsTable;
  private readonly nameFixJobItems = nameFixJobItemsTable;
  private readonly nameFixBackups = nameFixBackupsTable;
  private readonly schemaSnapshots = schemaSnapshotsTable;
  private readonly versionLinks = versionLinksTable;
  private readonly schemaDiffs = schemaDiffsTable;
  private readonly diffRenameDecisions = diffRenameDecisionsTable;

  constructor() {
    if (!db) {
      throw new Error("DatabaseStorage requires configured database connection.");
    }
    this.db = db as AppDatabase;
  }

  private mapDbSettings(row: DdlSettingsRow): DdlSettings {
    return {
      mysqlEngine: row.mysqlEngine,
      mysqlCharset: row.mysqlCharset,
      mysqlCollate: row.mysqlCollate,
      varcharCharset: row.varcharCharset,
      varcharCollate: row.varcharCollate,
      exportFilenamePrefix: row.exportFilenamePrefix,
      exportFilenameSuffix: row.exportFilenameSuffix,
      includeCommentHeader: row.includeCommentHeader,
      authorName: row.authorName,
      includeSetNames: row.includeSetNames,
      includeDropTable: row.includeDropTable,
      downloadPath: toOptionalString(row.downloadPath),
      excelReadPath: toOptionalString(row.excelReadPath),
      customHeaderTemplate: toOptionalString(row.customHeaderTemplate),
      useCustomHeader: row.useCustomHeader,
      mysqlDataTypeCase: toMysqlDataTypeCase(row.mysqlDataTypeCase),
      mysqlBooleanMode: toMysqlBooleanMode(row.mysqlBooleanMode),
      pkMarkers: parsePkMarkers(row.pkMarkers),
      maxConsecutiveEmptyRows: row.maxConsecutiveEmptyRows,
      uploadRateLimitWindowMs: row.uploadRateLimitWindowMs ?? DEFAULT_UPLOAD_RATE_LIMIT_WINDOW_MS,
      uploadRateLimitMaxRequests: row.uploadRateLimitMaxRequests ?? DEFAULT_UPLOAD_RATE_LIMIT_MAX_REQUESTS,
      parseRateLimitWindowMs: row.parseRateLimitWindowMs ?? DEFAULT_PARSE_RATE_LIMIT_WINDOW_MS,
      parseRateLimitMaxRequests: row.parseRateLimitMaxRequests ?? DEFAULT_PARSE_RATE_LIMIT_MAX_REQUESTS,
      globalProtectRateLimitWindowMs:
        row.globalProtectRateLimitWindowMs ?? DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_WINDOW_MS,
      globalProtectRateLimitMaxRequests:
        row.globalProtectRateLimitMaxRequests ?? DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_MAX_REQUESTS,
      globalProtectMaxInFlight: row.globalProtectMaxInFlight ?? DEFAULT_GLOBAL_PROTECT_MAX_INFLIGHT,
      prewarmEnabled: row.prewarmEnabled ?? DEFAULT_PREWARM_ENABLED,
      prewarmMaxConcurrency: row.prewarmMaxConcurrency ?? DEFAULT_PREWARM_MAX_CONCURRENCY,
      prewarmQueueMax: row.prewarmQueueMax ?? DEFAULT_PREWARM_QUEUE_MAX,
      prewarmMaxFileMb: row.prewarmMaxFileMb ?? DEFAULT_PREWARM_MAX_FILE_MB,
      taskManagerMaxQueueLength: row.taskManagerMaxQueueLength ?? DEFAULT_TASK_MANAGER_MAX_QUEUE_LENGTH,
      taskManagerStalePendingMs: row.taskManagerStalePendingMs ?? DEFAULT_TASK_MANAGER_STALE_PENDING_MS,
      nameFixDefaultMode: toNameFixMode(row.nameFixDefaultMode ?? DEFAULT_NAME_FIX_DEFAULT_MODE),
      nameFixConflictStrategy: toNameFixConflictStrategy(
        row.nameFixConflictStrategy ?? DEFAULT_NAME_FIX_CONFLICT_STRATEGY,
      ),
      nameFixReservedWordStrategy: toReservedWordStrategy(
        row.nameFixReservedWordStrategy ?? DEFAULT_NAME_FIX_RESERVED_WORD_STRATEGY,
      ),
      nameFixLengthOverflowStrategy: toLengthOverflowStrategy(
        row.nameFixLengthOverflowStrategy ?? DEFAULT_NAME_FIX_LENGTH_OVERFLOW_STRATEGY,
      ),
      nameFixMaxIdentifierLength: row.nameFixMaxIdentifierLength ?? DEFAULT_NAME_FIX_MAX_IDENTIFIER_LENGTH,
      nameFixBackupRetentionDays: row.nameFixBackupRetentionDays ?? DEFAULT_NAME_FIX_BACKUP_RETENTION_DAYS,
      nameFixMaxBatchConcurrency: row.nameFixMaxBatchConcurrency ?? DEFAULT_NAME_FIX_MAX_BATCH_CONCURRENCY,
      allowOverwriteInElectron: row.allowOverwriteInElectron ?? DEFAULT_ALLOW_OVERWRITE_IN_ELECTRON,
      allowExternalPathWrite: row.allowExternalPathWrite ?? DEFAULT_ALLOW_EXTERNAL_PATH_WRITE,
    };
  }

  private toDbSettingsInput(settings: DdlSettings): DdlSettingsInsertRow {
    return {
      ...settings,
      pkMarkers: serializePkMarkers(settings.pkMarkers),
    };
  }

  private mapInstalledExtensionRow(row: InstalledExtensionRow): InstalledExtensionRecord {
    return {
      id: row.id,
      extensionId: toExtensionId(row.extensionId),
      version: row.version,
      enabled: row.enabled,
      installPath: row.installPath,
      manifestJson: row.manifestJson ?? undefined,
      minAppVersion: row.minAppVersion ?? undefined,
      hostApiVersion: row.hostApiVersion,
      compatibilityStatus: toExtensionCompatibilityStatus(row.compatibilityStatus),
      compatibilityMessage: row.compatibilityMessage ?? undefined,
      installedAt: row.installedAt ?? undefined,
      updatedAt: row.updatedAt ?? undefined,
    };
  }

  private mapExtensionLifecycleStateRow(row: ExtensionLifecycleStateRow): ExtensionLifecycleState {
    return {
      id: row.id,
      extensionId: toExtensionId(row.extensionId),
      stage: toExtensionLifecycleStage(row.stage),
      progressPercent: row.progressPercent ?? 0,
      downloadedBytes: row.downloadedBytes ?? 0,
      totalBytes: row.totalBytes ?? undefined,
      availableVersion: row.availableVersion ?? undefined,
      releaseTag: row.releaseTag ?? undefined,
      assetName: row.assetName ?? undefined,
      assetUrl: row.assetUrl ?? undefined,
      downloadPath: row.downloadPath ?? undefined,
      stagedPath: row.stagedPath ?? undefined,
      activeVersion: row.activeVersion ?? undefined,
      previousVersion: row.previousVersion ?? undefined,
      catalogJson: row.catalogJson ?? undefined,
      lastErrorCode: toExtensionLifecycleErrorCode(row.lastErrorCode),
      lastErrorMessage: row.lastErrorMessage ?? undefined,
      lastCheckedAt: row.lastCheckedAt ?? undefined,
      updatedAt: row.updatedAt ?? undefined,
    };
  }

  private toInstalledExtensionInsertRow(
    extension: Omit<InstalledExtensionRecord, "id" | "installedAt" | "updatedAt">,
  ): InstalledExtensionInsertRow {
    return {
      extensionId: extension.extensionId,
      version: extension.version,
      enabled: extension.enabled,
      installPath: extension.installPath,
      manifestJson: extension.manifestJson,
      minAppVersion: extension.minAppVersion,
      hostApiVersion: extension.hostApiVersion,
      compatibilityStatus: extension.compatibilityStatus,
      compatibilityMessage: extension.compatibilityMessage,
    };
  }

  private toExtensionLifecycleStateInsertRow(
    lifecycleState: Omit<ExtensionLifecycleState, "id" | "updatedAt">,
  ): ExtensionLifecycleStateInsertRow {
    return {
      extensionId: lifecycleState.extensionId,
      stage: lifecycleState.stage,
      progressPercent: lifecycleState.progressPercent,
      downloadedBytes: lifecycleState.downloadedBytes,
      totalBytes: lifecycleState.totalBytes,
      availableVersion: lifecycleState.availableVersion,
      releaseTag: lifecycleState.releaseTag,
      assetName: lifecycleState.assetName,
      assetUrl: lifecycleState.assetUrl,
      downloadPath: lifecycleState.downloadPath,
      stagedPath: lifecycleState.stagedPath,
      activeVersion: lifecycleState.activeVersion,
      previousVersion: lifecycleState.previousVersion,
      catalogJson: lifecycleState.catalogJson,
      lastErrorCode: lifecycleState.lastErrorCode,
      lastErrorMessage: lifecycleState.lastErrorMessage,
      lastCheckedAt: lifecycleState.lastCheckedAt,
    };
  }

  private mapDbConnectionRow(row: DbConnectionRow): DbConnectionRecord {
    return {
      id: row.id,
      name: row.name,
      dialect: row.dialect === "mysql" ? "mysql" : "mysql",
      host: row.host,
      port: row.port ?? 3306,
      username: row.username,
      encryptedPassword: row.encryptedPassword ?? undefined,
      passwordStorage: row.passwordStorage === "electron-safe-storage" ? "electron-safe-storage" : "electron-safe-storage",
      rememberPassword: Boolean(row.rememberPassword),
      sslMode:
        row.sslMode === "disable" || row.sslMode === "required"
          ? row.sslMode
          : "preferred",
      lastSelectedDatabase: row.lastSelectedDatabase ?? undefined,
      lastTestStatus: toDbConnectionTestStatus(row.lastTestStatus),
      lastTestMessage: row.lastTestMessage ?? undefined,
      lastTestedAt: row.lastTestedAt ?? undefined,
      createdAt: row.createdAt ?? undefined,
      updatedAt: row.updatedAt ?? undefined,
    };
  }

  private toDbConnectionInsertRow(
    connection: Omit<DbConnectionRecord, "id" | "createdAt" | "updatedAt">,
  ): DbConnectionInsertRow {
    return {
      name: connection.name,
      dialect: connection.dialect,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      encryptedPassword: connection.encryptedPassword,
      passwordStorage: connection.passwordStorage,
      rememberPassword: connection.rememberPassword,
      sslMode: connection.sslMode,
      lastSelectedDatabase: connection.lastSelectedDatabase,
      lastTestStatus: connection.lastTestStatus,
      lastTestMessage: connection.lastTestMessage,
      lastTestedAt: connection.lastTestedAt,
    };
  }

  private mapDbComparePolicyRow(row: DbComparePolicyRow): DbComparePolicy {
    return {
      tableRenameAutoAcceptThreshold: row.tableRenameAutoAcceptThreshold == null
        ? undefined
        : confidenceFromStored(row.tableRenameAutoAcceptThreshold),
      columnRenameAutoAcceptThreshold: row.columnRenameAutoAcceptThreshold == null
        ? undefined
        : confidenceFromStored(row.columnRenameAutoAcceptThreshold),
    };
  }

  private toDbComparePolicyInput(policy: DbComparePolicy): DbComparePolicyInsertRow {
    return {
      tableRenameAutoAcceptThreshold:
        policy.tableRenameAutoAcceptThreshold == null
          ? null
          : confidenceToStored(policy.tableRenameAutoAcceptThreshold),
      columnRenameAutoAcceptThreshold:
        policy.columnRenameAutoAcceptThreshold == null
          ? null
          : confidenceToStored(policy.columnRenameAutoAcceptThreshold),
    };
  }

  private mapDbSchemaSnapshotRow(row: DbSchemaSnapshotRow): DbSchemaSnapshot {
    return {
      id: row.id,
      connectionId: row.connectionId,
      dialect: row.dialect === "mysql" ? "mysql" : "mysql",
      databaseName: row.databaseName,
      snapshotHash: row.snapshotHash,
      tableCount: row.tableCount ?? 0,
      schemaJson: row.schemaJson,
      capturedAt: row.capturedAt ?? undefined,
      updatedAt: row.updatedAt ?? undefined,
    };
  }

  private toDbSchemaSnapshotInsertRow(
    snapshot: Omit<DbSchemaSnapshot, "id" | "capturedAt" | "updatedAt">,
  ): DbSchemaSnapshotInsertRow {
    return {
      connectionId: snapshot.connectionId,
      dialect: snapshot.dialect,
      databaseName: snapshot.databaseName,
      snapshotHash: snapshot.snapshotHash,
      tableCount: snapshot.tableCount,
      schemaJson: snapshot.schemaJson,
    };
  }

  private mapDbSchemaScanEventRow(row: DbSchemaScanEventRow): DbSchemaScanEvent {
    return {
      id: row.id,
      connectionId: row.connectionId,
      dialect: row.dialect === "mysql" ? "mysql" : "mysql",
      databaseName: row.databaseName,
      snapshotHash: row.snapshotHash,
      eventType: row.eventType === "unchanged_scan" ? "unchanged_scan" : "new_snapshot",
      previousSnapshotHash: row.previousSnapshotHash ?? undefined,
      changeSummaryJson: row.changeSummaryJson ?? undefined,
      createdAt: row.createdAt ?? undefined,
    };
  }

  private toDbSchemaScanEventInsertRow(
    event: Omit<DbSchemaScanEvent, "id" | "createdAt">,
  ): DbSchemaScanEventInsertRow {
    return {
      connectionId: event.connectionId,
      dialect: event.dialect,
      databaseName: event.databaseName,
      snapshotHash: event.snapshotHash,
      eventType: event.eventType,
      previousSnapshotHash: event.previousSnapshotHash,
      changeSummaryJson: event.changeSummaryJson,
    };
  }

  private mapDbDeployJobRow(row: DbDeployJobRow): DbDeployJob {
    return {
      id: row.id,
      connectionId: row.connectionId,
      dialect: row.dialect === "oracle" ? "oracle" : "mysql",
      databaseName: row.databaseName,
      compareHash: row.compareHash,
      compareSource: parseHistoryCompareSource(row.compareSourceJson),
      baselineSource: parseHistoryCompareSource(row.baselineSourceJson),
      targetSnapshotHash: row.targetSnapshotHash,
      selectedTables: parseJsonArray(row.selectedTablesJson),
      summary: parseDeployJobSummary(row.summaryJson),
      status:
        row.status === "running" ||
        row.status === "succeeded" ||
        row.status === "failed" ||
        row.status === "partial" ||
        row.status === "blocked"
          ? row.status
          : "pending",
      errorMessage: row.errorMessage ?? undefined,
      createdAt: row.createdAt ?? undefined,
      updatedAt: row.updatedAt ?? undefined,
    };
  }

  private toDbDeployJobInsertRow(
    job: Omit<DbDeployJob, "createdAt" | "updatedAt">,
  ): DbDeployJobInsertRow {
    return {
      id: job.id,
      connectionId: job.connectionId,
      dialect: job.dialect,
      databaseName: job.databaseName,
      compareHash: job.compareHash,
      compareSourceJson: JSON.stringify(job.compareSource),
      baselineSourceJson: JSON.stringify(job.baselineSource),
      targetSnapshotHash: job.targetSnapshotHash,
      selectedTablesJson: JSON.stringify(job.selectedTables),
      summaryJson: job.summary ? JSON.stringify(job.summary) : null,
      status: job.status,
      errorMessage: job.errorMessage ?? null,
    };
  }

  private mapDbDeployJobStatementResultRow(
    row: DbDeployJobStatementResultRow,
  ): DbDeployJobStatementResult {
    return {
      id: row.id,
      jobId: row.jobId,
      statementId: row.statementId,
      tableName: row.tableName ?? undefined,
      statementKind: row.statementKind as DbDeployJobStatementResult["statementKind"],
      relatedEntityKeys: parseJsonArray(row.relatedEntityKeysJson),
      blockerCodes: parseJsonArray(row.blockerCodesJson) as DbDeployJobStatementResult["blockerCodes"],
      blocked: row.blocked,
      status:
        row.status === "succeeded" ||
        row.status === "failed" ||
        row.status === "blocked" ||
        row.status === "skipped"
          ? row.status
          : "pending",
      sql: row.sql,
      errorCode: row.errorCode ?? undefined,
      errorMessage: row.errorMessage ?? undefined,
      executedAt: row.executedAt ?? undefined,
      createdAt: row.createdAt ?? undefined,
    };
  }

  private toDbDeployJobStatementResultInsertRow(
    result: Omit<DbDeployJobStatementResult, "id" | "createdAt">,
  ): DbDeployJobStatementResultInsertRow {
    return {
      jobId: result.jobId,
      statementId: result.statementId,
      tableName: result.tableName ?? null,
      statementKind: result.statementKind,
      relatedEntityKeysJson: JSON.stringify(result.relatedEntityKeys),
      blockerCodesJson: JSON.stringify(result.blockerCodes),
      blocked: result.blocked,
      status: result.status,
      sql: result.sql,
      errorCode: result.errorCode ?? null,
      errorMessage: result.errorMessage ?? null,
      executedAt: result.executedAt ?? null,
    };
  }

  private mapNameFixJobRow(row: NameFixJobRow): NameFixJob {
    return {
      id: row.id,
      fileId: row.fileId,
      planId: row.planId,
      planHash: row.planHash,
      mode: toNameFixMode(row.mode),
      scope: toNameFixScope(row.scope),
      status: toNameFixStatus(row.status),
      sourcePath: row.sourcePath,
      outputPath: row.outputPath ?? undefined,
      backupPath: row.backupPath ?? undefined,
      reportJsonPath: row.reportJsonPath ?? undefined,
      reportTextPath: row.reportTextPath ?? undefined,
      conflictStrategy: toNameFixConflictStrategy(row.conflictStrategy),
      reservedWordStrategy: toReservedWordStrategy(row.reservedWordStrategy),
      lengthOverflowStrategy: toLengthOverflowStrategy(row.lengthOverflowStrategy),
      maxIdentifierLength: row.maxIdentifierLength ?? DEFAULT_NAME_FIX_MAX_IDENTIFIER_LENGTH,
      changedTableCount: row.changedTableCount ?? 0,
      changedColumnCount: row.changedColumnCount ?? 0,
      blockingConflictCount: row.blockingConflictCount ?? 0,
      unresolvedSourceRefCount: row.unresolvedSourceRefCount ?? 0,
      error: row.error ?? undefined,
      createdAt: row.createdAt ?? new Date().toISOString(),
      updatedAt: row.updatedAt ?? new Date().toISOString(),
    };
  }

  private mapNameFixJobItemRow(row: NameFixJobItemRow): NameFixJobItem {
    return {
      id: row.id,
      jobId: row.jobId,
      fileId: row.fileId,
      sheetName: row.sheetName,
      tableIndex: row.tableIndex,
      columnIndex: row.columnIndex ?? undefined,
      target: toNameFixTarget(row.target),
      beforeName: row.beforeName,
      afterName: row.afterName,
      action: row.action,
      reason: row.reason ?? undefined,
      sourceAddress: row.sourceAddress ?? undefined,
      blocking: Boolean(row.blocking),
      createdAt: row.createdAt ?? new Date().toISOString(),
    };
  }

  private mapNameFixBackupRow(row: NameFixBackupRow): NameFixBackup {
    return {
      id: row.id,
      jobId: row.jobId,
      fileId: row.fileId,
      sourcePath: row.sourcePath,
      backupPath: row.backupPath,
      backupHash: row.backupHash,
      restorable: Boolean(row.restorable),
      expiresAt: row.expiresAt ?? new Date().toISOString(),
      createdAt: row.createdAt ?? new Date().toISOString(),
    };
  }

  private mapSchemaSnapshotRow(row: SchemaSnapshotRow): SchemaSnapshot {
    return {
      id: row.id,
      fileId: row.fileId,
      fileHash: row.fileHash,
      originalName: row.originalName,
      uploadedAt: row.uploadedAt ?? undefined,
      snapshotHash: row.snapshotHash,
      algorithmVersion: row.algorithmVersion,
      snapshotJson: row.snapshotJson,
      createdAt: row.createdAt ?? undefined,
    };
  }

  private mapVersionLinkRow(row: VersionLinkRow): VersionLink {
    return {
      id: row.id,
      newFileId: row.newFileId,
      oldFileId: row.oldFileId,
      selectionMode: toDiffSelectionMode(row.selectionMode),
      confidence: confidenceFromStored(row.confidence),
      scoreBreakdownJson: row.scoreBreakdownJson ?? undefined,
      createdAt: row.createdAt ?? undefined,
    };
  }

  private mapSchemaDiffRow(row: SchemaDiffRow): SchemaDiff {
    return {
      id: row.id,
      newSnapshotHash: row.newSnapshotHash,
      oldSnapshotHash: row.oldSnapshotHash,
      scope: toDiffScope(row.scope),
      sheetName: row.sheetName ?? undefined,
      algorithmVersion: row.algorithmVersion,
      optionsHash: row.optionsHash,
      cacheKey: row.cacheKey,
      diffJson: row.diffJson,
      alterPreviewJson: row.alterPreviewJson ?? undefined,
      hitCount: row.hitCount ?? 0,
      createdAt: row.createdAt ?? undefined,
      lastUsedAt: row.lastUsedAt ?? undefined,
    };
  }

  private mapDiffRenameDecisionRow(row: DiffRenameDecisionRow): DiffRenameDecision {
    return {
      id: row.id,
      diffId: row.diffId,
      entityType: toDiffEntityType(row.entityType),
      entityKey: row.entityKey,
      decision: toDiffDecision(row.decision),
      confidence: confidenceFromStored(row.confidence),
      userNote: row.userNote ?? undefined,
      updatedAt: row.updatedAt ?? undefined,
    };
  }

  private mapProcessingTaskRow(row: ProcessingTaskRow): ProcessingTask {
    let parsedResult: unknown;
    if (row.result) {
      try {
        parsedResult = JSON.parse(row.result);
      } catch {
        parsedResult = row.result;
      }
    }
    return {
      id: row.id,
      fileId: row.fileId ?? undefined,
      taskType: row.taskType,
      status: row.status as ProcessingTask["status"],
      progress: row.progress,
      error: row.error ?? undefined,
      result: parsedResult,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
    };
  }

  async createUploadedFile(insertFile: InsertUploadedFile): Promise<UploadedFile> {
    const [file] = await this.db.insert(this.uploadedFiles).values(insertFile).returning();
    return file;
  }

  async getUploadedFiles(): Promise<UploadedFile[]> {
    return await this.db.select().from(this.uploadedFiles);
  }

  async listUploadedFilesByOriginalName(originalName: string): Promise<UploadedFile[]> {
    return await this.db
      .select()
      .from(this.uploadedFiles)
      .where(eq(this.uploadedFiles.originalName, originalName));
  }

  async getUploadedFile(id: number): Promise<UploadedFile | undefined> {
    const [file] = await this.db.select().from(this.uploadedFiles).where(eq(this.uploadedFiles.id, id));
    return file;
  }

  async findFileByHash(hash: string): Promise<UploadedFile | undefined> {
    const [file] = await this.db.select().from(this.uploadedFiles).where(eq(this.uploadedFiles.fileHash, hash));
    return file;
  }

  async deleteUploadedFile(id: number): Promise<void> {
    await this.db.delete(this.uploadedFiles).where(eq(this.uploadedFiles.id, id));
  }

  async updateUploadedFile(id: number, updates: Pick<InsertUploadedFile, 'fileHash' | 'fileSize'>): Promise<UploadedFile | undefined> {
    const [updated] = await this.db
      .update(this.uploadedFiles)
      .set(updates)
      .where(eq(this.uploadedFiles.id, id))
      .returning();
    return updated;
  }

  async getSettings(): Promise<DdlSettings> {
    const [settings] = await this.db.select().from(this.ddlSettings).limit(1);
    if (!settings) {
      const defaultSettings: DdlSettings = createDefaultDdlSettings();
      const [created] = await this.db
        .insert(this.ddlSettings)
        .values(this.toDbSettingsInput(defaultSettings))
        .returning();
      return this.mapDbSettings(created);
    }
    return this.mapDbSettings(settings);
  }

  async updateSettings(newSettings: DdlSettings): Promise<DdlSettings> {
    const [existing] = await this.db.select().from(this.ddlSettings).limit(1);
    const normalizedSettings: DdlSettings = {
      ...newSettings,
      pkMarkers: normalizePkMarkers(newSettings.pkMarkers),
    };
    if (!existing) {
      const [created] = await this.db
        .insert(this.ddlSettings)
        .values(this.toDbSettingsInput(normalizedSettings))
        .returning();
      return this.mapDbSettings(created);
    }
    const dbUpdatePayload = {
      ...this.toDbSettingsInput(normalizedSettings),
      updatedAt: new Date().toISOString(),
    };
    const [updated] = await this.db
      .update(this.ddlSettings)
      .set(dbUpdatePayload)
      .where(eq(this.ddlSettings.id, existing.id))
      .returning();
    return this.mapDbSettings(updated);
  }

  async listInstalledExtensions(): Promise<InstalledExtensionRecord[]> {
    const rows = await this.db.select().from(this.installedExtensions);
    return rows.map((row: InstalledExtensionRow) => this.mapInstalledExtensionRow(row));
  }

  async getInstalledExtension(extensionId: ExtensionId): Promise<InstalledExtensionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(this.installedExtensions)
      .where(eq(this.installedExtensions.extensionId, extensionId));
    return row ? this.mapInstalledExtensionRow(row) : undefined;
  }

  async upsertInstalledExtension(
    extension: Omit<InstalledExtensionRecord, "id" | "installedAt" | "updatedAt">,
  ): Promise<InstalledExtensionRecord> {
    const existing = await this.getInstalledExtension(extension.extensionId);
    const payload = this.toInstalledExtensionInsertRow(extension);
    if (!existing) {
      const [created] = await this.db.insert(this.installedExtensions).values(payload).returning();
      return this.mapInstalledExtensionRow(created);
    }

    const [updated] = await this.db
      .update(this.installedExtensions)
      .set({
        ...payload,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(this.installedExtensions.extensionId, extension.extensionId))
      .returning();
    return this.mapInstalledExtensionRow(updated);
  }

  async setInstalledExtensionEnabled(
    extensionId: ExtensionId,
    enabled: boolean,
  ): Promise<InstalledExtensionRecord | undefined> {
    const [updated] = await this.db
      .update(this.installedExtensions)
      .set({
        enabled,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(this.installedExtensions.extensionId, extensionId))
      .returning();
    return updated ? this.mapInstalledExtensionRow(updated) : undefined;
  }

  async listExtensionLifecycleStates(): Promise<ExtensionLifecycleState[]> {
    const rows = await this.db.select().from(this.extensionLifecycleStates);
    return rows.map((row: ExtensionLifecycleStateRow) => this.mapExtensionLifecycleStateRow(row));
  }

  async getExtensionLifecycleState(extensionId: ExtensionId): Promise<ExtensionLifecycleState | undefined> {
    const [row] = await this.db
      .select()
      .from(this.extensionLifecycleStates)
      .where(eq(this.extensionLifecycleStates.extensionId, extensionId));
    return row ? this.mapExtensionLifecycleStateRow(row) : undefined;
  }

  async upsertExtensionLifecycleState(
    lifecycleState: Omit<ExtensionLifecycleState, "id" | "updatedAt">,
  ): Promise<ExtensionLifecycleState> {
    const existing = await this.getExtensionLifecycleState(lifecycleState.extensionId);
    const payload = this.toExtensionLifecycleStateInsertRow(lifecycleState);
    if (!existing) {
      const [created] = await this.db.insert(this.extensionLifecycleStates).values(payload).returning();
      return this.mapExtensionLifecycleStateRow(created);
    }

    const [updated] = await this.db
      .update(this.extensionLifecycleStates)
      .set({
        ...payload,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(this.extensionLifecycleStates.extensionId, lifecycleState.extensionId))
      .returning();
    return this.mapExtensionLifecycleStateRow(updated);
  }

  async deleteExtensionLifecycleState(extensionId: ExtensionId): Promise<void> {
    await this.db
      .delete(this.extensionLifecycleStates)
      .where(eq(this.extensionLifecycleStates.extensionId, extensionId));
  }

  async listDbConnections(): Promise<DbConnectionSummary[]> {
    const rows = await this.db.select().from(this.dbConnections);
    return rows.map((row: DbConnectionRow) => {
      const { encryptedPassword, ...connection } = this.mapDbConnectionRow(row);
      return {
        ...connection,
        passwordStored: Boolean(encryptedPassword),
      };
    });
  }

  async getDbConnection(id: number): Promise<DbConnectionRecord | undefined> {
    const [row] = await this.db.select().from(this.dbConnections).where(eq(this.dbConnections.id, id));
    return row ? this.mapDbConnectionRow(row) : undefined;
  }

  async getDbComparePolicy(): Promise<DbComparePolicy> {
    const [row] = await this.db.select().from(this.dbComparePolicies).limit(1);
    return row ? this.mapDbComparePolicyRow(row) : {};
  }

  async updateDbComparePolicy(policy: DbComparePolicy): Promise<DbComparePolicy> {
    const [existing] = await this.db.select().from(this.dbComparePolicies).limit(1);
    const payload = this.toDbComparePolicyInput(policy);
    if (!existing) {
      const [created] = await this.db.insert(this.dbComparePolicies).values(payload).returning();
      return this.mapDbComparePolicyRow(created);
    }

    const [updated] = await this.db
      .update(this.dbComparePolicies)
      .set({
        ...payload,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(this.dbComparePolicies.id, existing.id))
      .returning();
    return this.mapDbComparePolicyRow(updated);
  }

  async createDbConnection(
    connection: Omit<DbConnectionRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<DbConnectionRecord> {
    const [created] = await this.db
      .insert(this.dbConnections)
      .values(this.toDbConnectionInsertRow(connection))
      .returning();
    return this.mapDbConnectionRow(created);
  }

  async updateDbConnection(
    id: number,
    updates: Partial<Omit<DbConnectionRecord, "id" | "createdAt" | "updatedAt">>,
  ): Promise<DbConnectionRecord | undefined> {
    const [updated] = await this.db
      .update(this.dbConnections)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(this.dbConnections.id, id))
      .returning();
    return updated ? this.mapDbConnectionRow(updated) : undefined;
  }

  async deleteDbConnection(id: number): Promise<void> {
    await this.db.delete(this.dbConnections).where(eq(this.dbConnections.id, id));
    await this.db.delete(this.dbSchemaSnapshots).where(eq(this.dbSchemaSnapshots.connectionId, id));
    await this.db.delete(this.dbSchemaScanEvents).where(eq(this.dbSchemaScanEvents.connectionId, id));
    const jobs = await this.db.select().from(this.dbDeployJobs).where(eq(this.dbDeployJobs.connectionId, id));
    for (const job of jobs) {
      await this.db
        .delete(this.dbDeployJobStatementResults)
        .where(eq(this.dbDeployJobStatementResults.jobId, job.id));
    }
    await this.db.delete(this.dbDeployJobs).where(eq(this.dbDeployJobs.connectionId, id));
  }

  async listDbSchemaSnapshots(connectionId: number, databaseName?: string): Promise<DbSchemaSnapshot[]> {
    const predicate = databaseName
      ? and(eq(this.dbSchemaSnapshots.connectionId, connectionId), eq(this.dbSchemaSnapshots.databaseName, databaseName))
      : eq(this.dbSchemaSnapshots.connectionId, connectionId);
    const rows = await this.db.select().from(this.dbSchemaSnapshots).where(predicate);
    return rows.map((row: DbSchemaSnapshotRow) => this.mapDbSchemaSnapshotRow(row));
  }

  async getLatestDbSchemaSnapshot(
    connectionId: number,
    databaseName: string,
  ): Promise<DbSchemaSnapshot | undefined> {
    const rows = await this.db
      .select()
      .from(this.dbSchemaSnapshots)
      .where(
        and(
          eq(this.dbSchemaSnapshots.connectionId, connectionId),
          eq(this.dbSchemaSnapshots.databaseName, databaseName),
        ),
      );
    const [latest] = rows
      .sort((left, right) => String(right.capturedAt ?? "").localeCompare(String(left.capturedAt ?? "")));
    return latest ? this.mapDbSchemaSnapshotRow(latest) : undefined;
  }

  async getDbSchemaSnapshotByHash(
    connectionId: number,
    databaseName: string,
    snapshotHash: string,
  ): Promise<DbSchemaSnapshot | undefined> {
    const [row] = await this.db
      .select()
      .from(this.dbSchemaSnapshots)
      .where(
        and(
          eq(this.dbSchemaSnapshots.connectionId, connectionId),
          eq(this.dbSchemaSnapshots.databaseName, databaseName),
          eq(this.dbSchemaSnapshots.snapshotHash, snapshotHash),
        ),
      );
    return row ? this.mapDbSchemaSnapshotRow(row) : undefined;
  }

  async createDbSchemaSnapshot(
    snapshot: Omit<DbSchemaSnapshot, "id" | "capturedAt" | "updatedAt">,
  ): Promise<DbSchemaSnapshot> {
    const [created] = await this.db
      .insert(this.dbSchemaSnapshots)
      .values(this.toDbSchemaSnapshotInsertRow(snapshot))
      .returning();
    return this.mapDbSchemaSnapshotRow(created);
  }

  async listDbSchemaScanEvents(connectionId: number, databaseName?: string): Promise<DbSchemaScanEvent[]> {
    const predicate = databaseName
      ? and(eq(this.dbSchemaScanEvents.connectionId, connectionId), eq(this.dbSchemaScanEvents.databaseName, databaseName))
      : eq(this.dbSchemaScanEvents.connectionId, connectionId);
    const rows = await this.db.select().from(this.dbSchemaScanEvents).where(predicate);
    return rows.map((row: DbSchemaScanEventRow) => this.mapDbSchemaScanEventRow(row));
  }

  async getDbSchemaScanEvent(id: number): Promise<DbSchemaScanEvent | undefined> {
    const [row] = await this.db.select().from(this.dbSchemaScanEvents).where(eq(this.dbSchemaScanEvents.id, id));
    return row ? this.mapDbSchemaScanEventRow(row) : undefined;
  }

  async createDbSchemaScanEvent(
    event: Omit<DbSchemaScanEvent, "id" | "createdAt">,
  ): Promise<DbSchemaScanEvent> {
    const [created] = await this.db
      .insert(this.dbSchemaScanEvents)
      .values(this.toDbSchemaScanEventInsertRow(event))
      .returning();
    return this.mapDbSchemaScanEventRow(created);
  }

  async listDbDeployJobs(connectionId: number, databaseName?: string): Promise<DbDeployJob[]> {
    const predicate = databaseName
      ? and(eq(this.dbDeployJobs.connectionId, connectionId), eq(this.dbDeployJobs.databaseName, databaseName))
      : eq(this.dbDeployJobs.connectionId, connectionId);
    const rows = await this.db.select().from(this.dbDeployJobs).where(predicate);
    return rows.map((row: DbDeployJobRow) => this.mapDbDeployJobRow(row));
  }

  async getDbDeployJob(id: string): Promise<DbDeployJob | undefined> {
    const [row] = await this.db.select().from(this.dbDeployJobs).where(eq(this.dbDeployJobs.id, id));
    return row ? this.mapDbDeployJobRow(row) : undefined;
  }

  async createDbDeployJob(job: Omit<DbDeployJob, "createdAt" | "updatedAt">): Promise<DbDeployJob> {
    const [created] = await this.db
      .insert(this.dbDeployJobs)
      .values(this.toDbDeployJobInsertRow(job))
      .returning();
    return this.mapDbDeployJobRow(created);
  }

  async updateDbDeployJob(
    id: string,
    updates: Partial<Omit<DbDeployJob, "id" | "createdAt" | "updatedAt">>,
  ): Promise<DbDeployJob | undefined> {
    const updateData: Partial<DbDeployJobInsertRow> & { updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };
    if (updates.connectionId !== undefined) updateData.connectionId = updates.connectionId;
    if (updates.dialect !== undefined) updateData.dialect = updates.dialect;
    if (updates.databaseName !== undefined) updateData.databaseName = updates.databaseName;
    if (updates.compareHash !== undefined) updateData.compareHash = updates.compareHash;
    if (updates.compareSource !== undefined) updateData.compareSourceJson = JSON.stringify(updates.compareSource);
    if (updates.baselineSource !== undefined) updateData.baselineSourceJson = JSON.stringify(updates.baselineSource);
    if (updates.targetSnapshotHash !== undefined) updateData.targetSnapshotHash = updates.targetSnapshotHash;
    if (updates.selectedTables !== undefined) updateData.selectedTablesJson = JSON.stringify(updates.selectedTables);
    if (updates.summary !== undefined) updateData.summaryJson = JSON.stringify(updates.summary);
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.errorMessage !== undefined) updateData.errorMessage = updates.errorMessage ?? null;

    const [updated] = await this.db
      .update(this.dbDeployJobs)
      .set(updateData)
      .where(eq(this.dbDeployJobs.id, id))
      .returning();
    return updated ? this.mapDbDeployJobRow(updated) : undefined;
  }

  async replaceDbDeployJobStatementResults(
    jobId: string,
    results: Omit<DbDeployJobStatementResult, "id" | "createdAt">[],
  ): Promise<DbDeployJobStatementResult[]> {
    await this.db
      .delete(this.dbDeployJobStatementResults)
      .where(eq(this.dbDeployJobStatementResults.jobId, jobId));
    if (!results.length) {
      return [];
    }
    const rows = await this.db
      .insert(this.dbDeployJobStatementResults)
      .values(results.map((result) => this.toDbDeployJobStatementResultInsertRow(result)))
      .returning();
    return rows.map((row: DbDeployJobStatementResultRow) => this.mapDbDeployJobStatementResultRow(row));
  }

  async listDbDeployJobStatementResults(jobId: string): Promise<DbDeployJobStatementResult[]> {
    const rows = await this.db
      .select()
      .from(this.dbDeployJobStatementResults)
      .where(eq(this.dbDeployJobStatementResults.jobId, jobId));
    return rows.map((row: DbDeployJobStatementResultRow) => this.mapDbDeployJobStatementResultRow(row));
  }

  async createTask(task: Omit<ProcessingTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProcessingTask> {
    const payload = {
      ...task,
      result: task.result === undefined ? undefined : JSON.stringify(task.result),
    };
    const [created] = await this.db.insert(this.processingTasks).values(payload).returning();
    return this.mapProcessingTaskRow(created);
  }

  async getTask(id: number): Promise<ProcessingTask | undefined> {
    const [task] = await this.db.select().from(this.processingTasks).where(eq(this.processingTasks.id, id));
    if (!task) return undefined;
    return this.mapProcessingTaskRow(task);
  }

  async updateTask(id: number, updates: Partial<Omit<ProcessingTask, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ProcessingTask | undefined> {
    const updateData: Record<string, unknown> = { ...updates };
    if ("result" in updateData && updateData.result !== undefined) {
      updateData.result = JSON.stringify(updateData.result);
    }
    const [updated] = await this.db
      .update(this.processingTasks)
      .set({ ...updateData, updatedAt: new Date().toISOString() })
      .where(eq(this.processingTasks.id, id))
      .returning();
    if (!updated) return undefined;
    return this.mapProcessingTaskRow(updated);
  }

  async deleteTask(id: number): Promise<void> {
    await this.db.delete(this.processingTasks).where(eq(this.processingTasks.id, id));
  }

  async createNameFixJob(job: Omit<NameFixJob, "createdAt" | "updatedAt">): Promise<NameFixJob> {
    const payload = {
      ...job,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const [created] = await this.db.insert(this.nameFixJobs).values(payload).returning();
    return this.mapNameFixJobRow(created);
  }

  async getNameFixJob(id: string): Promise<NameFixJob | undefined> {
    const [job] = await this.db.select().from(this.nameFixJobs).where(eq(this.nameFixJobs.id, id));
    return job ? this.mapNameFixJobRow(job) : undefined;
  }

  async updateNameFixJob(
    id: string,
    updates: Partial<Omit<NameFixJob, "id" | "createdAt" | "updatedAt">>,
  ): Promise<NameFixJob | undefined> {
    const [updated] = await this.db
      .update(this.nameFixJobs)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(this.nameFixJobs.id, id))
      .returning();
    return updated ? this.mapNameFixJobRow(updated) : undefined;
  }

  async createNameFixJobItems(items: Omit<NameFixJobItem, "id" | "createdAt">[]): Promise<NameFixJobItem[]> {
    if (!items.length) {
      return [];
    }
    const now = new Date().toISOString();
    const payload = items.map((item) => ({
      ...item,
      createdAt: now,
    }));
    const created = await this.db.insert(this.nameFixJobItems).values(payload).returning();
    return created.map((row: NameFixJobItemRow) => this.mapNameFixJobItemRow(row));
  }

  async listNameFixJobItems(jobId: string): Promise<NameFixJobItem[]> {
    const rows = await this.db.select().from(this.nameFixJobItems).where(eq(this.nameFixJobItems.jobId, jobId));
    return rows.map((row: NameFixJobItemRow) => this.mapNameFixJobItemRow(row));
  }

  async createNameFixBackup(backup: Omit<NameFixBackup, "id" | "createdAt">): Promise<NameFixBackup> {
    const payload = {
      ...backup,
      createdAt: new Date().toISOString(),
    };
    const [created] = await this.db.insert(this.nameFixBackups).values(payload).returning();
    return this.mapNameFixBackupRow(created);
  }

  async getNameFixBackupsByJob(jobId: string): Promise<NameFixBackup[]> {
    const rows = await this.db.select().from(this.nameFixBackups).where(eq(this.nameFixBackups.jobId, jobId));
    return rows.map((row: NameFixBackupRow) => this.mapNameFixBackupRow(row));
  }

  async listNameFixBackups(): Promise<NameFixBackup[]> {
    const rows = await this.db.select().from(this.nameFixBackups);
    return rows.map((row: NameFixBackupRow) => this.mapNameFixBackupRow(row));
  }

  async updateNameFixBackup(
    id: number,
    updates: Partial<Omit<NameFixBackup, "id" | "createdAt">>,
  ): Promise<NameFixBackup | undefined> {
    const [updated] = await this.db
      .update(this.nameFixBackups)
      .set(updates)
      .where(eq(this.nameFixBackups.id, id))
      .returning();
    return updated ? this.mapNameFixBackupRow(updated) : undefined;
  }

  async getSchemaSnapshotByFileId(
    fileId: number,
    algorithmVersion: string,
  ): Promise<SchemaSnapshot | undefined> {
    const [row] = await this.db
      .select()
      .from(this.schemaSnapshots)
      .where(
        and(
          eq(this.schemaSnapshots.fileId, fileId),
          eq(this.schemaSnapshots.algorithmVersion, algorithmVersion),
        ),
      );
    return row ? this.mapSchemaSnapshotRow(row) : undefined;
  }

  async getSchemaSnapshotByHash(
    snapshotHash: string,
    algorithmVersion: string,
  ): Promise<SchemaSnapshot | undefined> {
    const [row] = await this.db
      .select()
      .from(this.schemaSnapshots)
      .where(
        and(
          eq(this.schemaSnapshots.snapshotHash, snapshotHash),
          eq(this.schemaSnapshots.algorithmVersion, algorithmVersion),
        ),
      );
    return row ? this.mapSchemaSnapshotRow(row) : undefined;
  }

  async createSchemaSnapshot(snapshot: Omit<SchemaSnapshot, "id" | "createdAt">): Promise<SchemaSnapshot> {
    const [created] = await this.db
      .insert(this.schemaSnapshots)
      .values({
        ...snapshot,
      })
      .returning();
    return this.mapSchemaSnapshotRow(created);
  }

  async upsertVersionLink(link: Omit<VersionLink, "id" | "createdAt">): Promise<VersionLink> {
    const [existing] = await this.db
      .select()
      .from(this.versionLinks)
      .where(
        and(
          eq(this.versionLinks.newFileId, link.newFileId),
          eq(this.versionLinks.oldFileId, link.oldFileId),
        ),
      );

    if (!existing) {
      const [created] = await this.db
        .insert(this.versionLinks)
        .values({
          newFileId: link.newFileId,
          oldFileId: link.oldFileId,
          selectionMode: link.selectionMode,
          confidence: confidenceToStored(link.confidence),
          scoreBreakdownJson: link.scoreBreakdownJson,
        })
        .returning();
      return this.mapVersionLinkRow(created);
    }

    const [updated] = await this.db
      .update(this.versionLinks)
      .set({
        selectionMode: link.selectionMode,
        confidence: confidenceToStored(link.confidence),
        scoreBreakdownJson: link.scoreBreakdownJson,
        createdAt: new Date().toISOString(),
      })
      .where(eq(this.versionLinks.id, existing.id))
      .returning();
    return this.mapVersionLinkRow(updated);
  }

  async listVersionLinksByNewFileId(newFileId: number): Promise<VersionLink[]> {
    const rows = await this.db
      .select()
      .from(this.versionLinks)
      .where(eq(this.versionLinks.newFileId, newFileId));
    return rows.map((row: VersionLinkRow) => this.mapVersionLinkRow(row));
  }

  async getSchemaDiffById(id: string): Promise<SchemaDiff | undefined> {
    const [row] = await this.db.select().from(this.schemaDiffs).where(eq(this.schemaDiffs.id, id));
    return row ? this.mapSchemaDiffRow(row) : undefined;
  }

  async getSchemaDiffByCacheKey(cacheKey: string): Promise<SchemaDiff | undefined> {
    const [row] = await this.db
      .select()
      .from(this.schemaDiffs)
      .where(eq(this.schemaDiffs.cacheKey, cacheKey));
    return row ? this.mapSchemaDiffRow(row) : undefined;
  }

  async createOrUpdateSchemaDiff(diff: Omit<SchemaDiff, "createdAt" | "lastUsedAt">): Promise<SchemaDiff> {
    const [existing] = await this.db
      .select()
      .from(this.schemaDiffs)
      .where(eq(this.schemaDiffs.cacheKey, diff.cacheKey));
    const now = new Date().toISOString();

    if (!existing) {
      const [created] = await this.db
        .insert(this.schemaDiffs)
        .values({
          ...diff,
          hitCount: diff.hitCount,
          createdAt: now,
          lastUsedAt: now,
        })
        .returning();
      return this.mapSchemaDiffRow(created);
    }

    const [updated] = await this.db
      .update(this.schemaDiffs)
      .set({
        newSnapshotHash: diff.newSnapshotHash,
        oldSnapshotHash: diff.oldSnapshotHash,
        scope: diff.scope,
        sheetName: diff.sheetName,
        algorithmVersion: diff.algorithmVersion,
        optionsHash: diff.optionsHash,
        cacheKey: diff.cacheKey,
        diffJson: diff.diffJson,
        alterPreviewJson: diff.alterPreviewJson,
        hitCount: diff.hitCount,
        lastUsedAt: now,
      })
      .where(eq(this.schemaDiffs.id, existing.id))
      .returning();
    return this.mapSchemaDiffRow(updated);
  }

  async touchSchemaDiff(id: string): Promise<void> {
    const [existing] = await this.db.select().from(this.schemaDiffs).where(eq(this.schemaDiffs.id, id));
    if (!existing) {
      return;
    }
    await this.db
      .update(this.schemaDiffs)
      .set({
        hitCount: (existing.hitCount ?? 0) + 1,
        lastUsedAt: new Date().toISOString(),
      })
      .where(eq(this.schemaDiffs.id, id));
  }

  async replaceDiffRenameDecisions(
    diffId: string,
    decisions: Omit<DiffRenameDecision, "id" | "updatedAt">[],
  ): Promise<DiffRenameDecision[]> {
    await this.db.delete(this.diffRenameDecisions).where(eq(this.diffRenameDecisions.diffId, diffId));
    if (!decisions.length) {
      return [];
    }
    const payload = decisions.map((item) => ({
      diffId: item.diffId,
      entityType: item.entityType,
      entityKey: item.entityKey,
      decision: item.decision,
      confidence: confidenceToStored(item.confidence),
      userNote: item.userNote,
      updatedAt: new Date().toISOString(),
    }));
    const rows = await this.db.insert(this.diffRenameDecisions).values(payload).returning();
    return rows.map((row: DiffRenameDecisionRow) => this.mapDiffRenameDecisionRow(row));
  }

  async listDiffRenameDecisions(diffId: string): Promise<DiffRenameDecision[]> {
    const rows = await this.db
      .select()
      .from(this.diffRenameDecisions)
      .where(eq(this.diffRenameDecisions.diffId, diffId));
    return rows.map((row: DiffRenameDecisionRow) => this.mapDiffRenameDecisionRow(row));
  }
}

// Auto-select storage based on actual database readiness.
// - SQLite mode: db is initialized when server app-config / ELECTRON_MODE is enabled.
// - PostgreSQL mode: db is initialized when DATABASE_URL is present.
const shouldUseDatabaseStorage = Boolean(db);

export const storage: IStorage = shouldUseDatabaseStorage
  ? new DatabaseStorage()
  : new MemoryStorage();

console.info(`[storage] mode=${shouldUseDatabaseStorage ? "database" : "memory"}`);
