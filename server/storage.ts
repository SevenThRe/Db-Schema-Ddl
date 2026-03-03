import {
  type InsertUploadedFile,
  type UploadedFile,
  type DdlSettings,
  type ProcessingTask,
  type NameFixJob,
  type NameFixJobItem,
  type NameFixBackup,
  uploadedFiles as uploadedFilesTable,
  ddlSettings as ddlSettingsTable,
  processingTasks as processingTasksTable,
  nameFixJobs as nameFixJobsTable,
  nameFixJobItems as nameFixJobItemsTable,
  nameFixBackups as nameFixBackupsTable,
} from "@shared/schema";
import { APP_DEFAULTS, createDefaultDdlSettings } from "@shared/config";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
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
type ProcessingTaskRow = typeof processingTasksTable.$inferSelect;
type NameFixJobRow = typeof nameFixJobsTable.$inferSelect;
type NameFixJobItemRow = typeof nameFixJobItemsTable.$inferSelect;
type NameFixBackupRow = typeof nameFixBackupsTable.$inferSelect;

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

export interface IStorage {
  createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
  getUploadedFiles(): Promise<UploadedFile[]>;
  getUploadedFile(id: number): Promise<UploadedFile | undefined>;
  findFileByHash(hash: string): Promise<UploadedFile | undefined>;
  updateUploadedFile(id: number, updates: Pick<InsertUploadedFile, 'fileHash' | 'fileSize'>): Promise<UploadedFile | undefined>;
  deleteUploadedFile(id: number): Promise<void>;
  getSettings(): Promise<DdlSettings>;
  updateSettings(settings: DdlSettings): Promise<DdlSettings>;

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
}

// Memory-based storage for development (no database needed)
export class MemoryStorage implements IStorage {
  private files: UploadedFile[] = [];
  private tasks: ProcessingTask[] = [];
  private nameFixJobs: NameFixJob[] = [];
  private nameFixJobItems: NameFixJobItem[] = [];
  private nameFixBackups: NameFixBackup[] = [];
  private nextId = 1;
  private nextTaskId = 1;
  private nextNameFixItemId = 1;
  private nextNameFixBackupId = 1;
  private settings: DdlSettings = createDefaultDdlSettings();

  async createUploadedFile(insertFile: InsertUploadedFile): Promise<UploadedFile> {
    const file: UploadedFile = {
      id: this.nextId++,
      filePath: insertFile.filePath,
      originalName: insertFile.originalName,
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
}

// Database storage (requires PostgreSQL)
export class DatabaseStorage implements IStorage {
  private readonly db: AppDatabase;
  private readonly uploadedFiles = uploadedFilesTable;
  private readonly ddlSettings = ddlSettingsTable;
  private readonly processingTasks = processingTasksTable;
  private readonly nameFixJobs = nameFixJobsTable;
  private readonly nameFixJobItems = nameFixJobItemsTable;
  private readonly nameFixBackups = nameFixBackupsTable;

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
}

// Auto-select storage based on actual database readiness.
// - SQLite mode: db is initialized when server app-config / ELECTRON_MODE is enabled.
// - PostgreSQL mode: db is initialized when DATABASE_URL is present.
const shouldUseDatabaseStorage = Boolean(db);

export const storage: IStorage = shouldUseDatabaseStorage
  ? new DatabaseStorage()
  : new MemoryStorage();

console.info(`[storage] mode=${shouldUseDatabaseStorage ? "database" : "memory"}`);
