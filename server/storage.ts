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
import { eq } from "drizzle-orm";
import { db } from "./db";

const DEFAULT_PK_MARKERS = ["\u3007"];
const DEFAULT_UPLOAD_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_UPLOAD_RATE_LIMIT_MAX_REQUESTS = 20;
const DEFAULT_PARSE_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_PARSE_RATE_LIMIT_MAX_REQUESTS = 40;
const DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_MAX_REQUESTS = 240;
const DEFAULT_GLOBAL_PROTECT_MAX_INFLIGHT = 80;
const DEFAULT_PREWARM_ENABLED = true;
const DEFAULT_PREWARM_MAX_CONCURRENCY = 1;
const DEFAULT_PREWARM_QUEUE_MAX = 12;
const DEFAULT_PREWARM_MAX_FILE_MB = 20;
const DEFAULT_TASK_MANAGER_MAX_QUEUE_LENGTH = 200;
const DEFAULT_TASK_MANAGER_STALE_PENDING_MS = 30 * 60 * 1000;
const DEFAULT_NAME_FIX_DEFAULT_MODE = "copy";
const DEFAULT_NAME_FIX_CONFLICT_STRATEGY = "suffix_increment";
const DEFAULT_NAME_FIX_RESERVED_WORD_STRATEGY = "prefix";
const DEFAULT_NAME_FIX_LENGTH_OVERFLOW_STRATEGY = "truncate_hash";
const DEFAULT_NAME_FIX_MAX_IDENTIFIER_LENGTH = 64;
const DEFAULT_NAME_FIX_BACKUP_RETENTION_DAYS = 30;
const DEFAULT_NAME_FIX_MAX_BATCH_CONCURRENCY = 4;
const DEFAULT_ALLOW_OVERWRITE_IN_ELECTRON = true;
const DEFAULT_ALLOW_EXTERNAL_PATH_WRITE = false;

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
  private settings: DdlSettings = {
    mysqlEngine: "InnoDB",
    mysqlCharset: "utf8mb4",
    mysqlCollate: "utf8mb4_bin",
    varcharCharset: "utf8mb4",
    varcharCollate: "utf8mb4_bin",
    exportFilenamePrefix: "Crt_",
    exportFilenameSuffix: "",
    includeCommentHeader: true,
    authorName: "ISI",
    includeSetNames: true,
    includeDropTable: true,
    downloadPath: undefined,
    excelReadPath: undefined,
    customHeaderTemplate: undefined,
    useCustomHeader: false,
    mysqlDataTypeCase: "lower",
    mysqlBooleanMode: "tinyint(1)",
    pkMarkers: DEFAULT_PK_MARKERS,
    maxConsecutiveEmptyRows: 10,
    uploadRateLimitWindowMs: DEFAULT_UPLOAD_RATE_LIMIT_WINDOW_MS,
    uploadRateLimitMaxRequests: DEFAULT_UPLOAD_RATE_LIMIT_MAX_REQUESTS,
    parseRateLimitWindowMs: DEFAULT_PARSE_RATE_LIMIT_WINDOW_MS,
    parseRateLimitMaxRequests: DEFAULT_PARSE_RATE_LIMIT_MAX_REQUESTS,
    globalProtectRateLimitWindowMs: DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_WINDOW_MS,
    globalProtectRateLimitMaxRequests: DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_MAX_REQUESTS,
    globalProtectMaxInFlight: DEFAULT_GLOBAL_PROTECT_MAX_INFLIGHT,
    prewarmEnabled: DEFAULT_PREWARM_ENABLED,
    prewarmMaxConcurrency: DEFAULT_PREWARM_MAX_CONCURRENCY,
    prewarmQueueMax: DEFAULT_PREWARM_QUEUE_MAX,
    prewarmMaxFileMb: DEFAULT_PREWARM_MAX_FILE_MB,
    taskManagerMaxQueueLength: DEFAULT_TASK_MANAGER_MAX_QUEUE_LENGTH,
    taskManagerStalePendingMs: DEFAULT_TASK_MANAGER_STALE_PENDING_MS,
    nameFixDefaultMode: DEFAULT_NAME_FIX_DEFAULT_MODE,
    nameFixConflictStrategy: DEFAULT_NAME_FIX_CONFLICT_STRATEGY,
    nameFixReservedWordStrategy: DEFAULT_NAME_FIX_RESERVED_WORD_STRATEGY,
    nameFixLengthOverflowStrategy: DEFAULT_NAME_FIX_LENGTH_OVERFLOW_STRATEGY,
    nameFixMaxIdentifierLength: DEFAULT_NAME_FIX_MAX_IDENTIFIER_LENGTH,
    nameFixBackupRetentionDays: DEFAULT_NAME_FIX_BACKUP_RETENTION_DAYS,
    nameFixMaxBatchConcurrency: DEFAULT_NAME_FIX_MAX_BATCH_CONCURRENCY,
    allowOverwriteInElectron: DEFAULT_ALLOW_OVERWRITE_IN_ELECTRON,
    allowExternalPathWrite: DEFAULT_ALLOW_EXTERNAL_PATH_WRITE,
  };

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
  private db: any;
  private uploadedFiles: any;
  private ddlSettings: any;
  private processingTasks: any;
  private nameFixJobs: any;
  private nameFixJobItems: any;
  private nameFixBackups: any;

  constructor() {
    if (!db) {
      throw new Error("DatabaseStorage requires configured database connection.");
    }
    this.db = db;
    this.uploadedFiles = uploadedFilesTable;
    this.ddlSettings = ddlSettingsTable;
    this.processingTasks = processingTasksTable;
    this.nameFixJobs = nameFixJobsTable;
    this.nameFixJobItems = nameFixJobItemsTable;
    this.nameFixBackups = nameFixBackupsTable;
    this.eq = eq;
  }

  private eq: any;

  private mapDbSettings(row: any): DdlSettings {
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
      downloadPath: row.downloadPath,
      excelReadPath: row.excelReadPath,
      customHeaderTemplate: row.customHeaderTemplate,
      useCustomHeader: row.useCustomHeader,
      mysqlDataTypeCase: row.mysqlDataTypeCase,
      mysqlBooleanMode: row.mysqlBooleanMode,
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
      nameFixDefaultMode: row.nameFixDefaultMode ?? DEFAULT_NAME_FIX_DEFAULT_MODE,
      nameFixConflictStrategy: row.nameFixConflictStrategy ?? DEFAULT_NAME_FIX_CONFLICT_STRATEGY,
      nameFixReservedWordStrategy: row.nameFixReservedWordStrategy ?? DEFAULT_NAME_FIX_RESERVED_WORD_STRATEGY,
      nameFixLengthOverflowStrategy: row.nameFixLengthOverflowStrategy ?? DEFAULT_NAME_FIX_LENGTH_OVERFLOW_STRATEGY,
      nameFixMaxIdentifierLength: row.nameFixMaxIdentifierLength ?? DEFAULT_NAME_FIX_MAX_IDENTIFIER_LENGTH,
      nameFixBackupRetentionDays: row.nameFixBackupRetentionDays ?? DEFAULT_NAME_FIX_BACKUP_RETENTION_DAYS,
      nameFixMaxBatchConcurrency: row.nameFixMaxBatchConcurrency ?? DEFAULT_NAME_FIX_MAX_BATCH_CONCURRENCY,
      allowOverwriteInElectron: row.allowOverwriteInElectron ?? DEFAULT_ALLOW_OVERWRITE_IN_ELECTRON,
      allowExternalPathWrite: row.allowExternalPathWrite ?? DEFAULT_ALLOW_EXTERNAL_PATH_WRITE,
    };
  }

  private toDbSettingsInput(settings: DdlSettings): Record<string, unknown> {
    return {
      ...settings,
      pkMarkers: serializePkMarkers(settings.pkMarkers),
    };
  }

  private mapNameFixJobRow(row: any): NameFixJob {
    return {
      id: row.id,
      fileId: row.fileId,
      planId: row.planId,
      planHash: row.planHash,
      mode: row.mode,
      scope: row.scope,
      status: row.status,
      sourcePath: row.sourcePath,
      outputPath: row.outputPath ?? undefined,
      backupPath: row.backupPath ?? undefined,
      reportJsonPath: row.reportJsonPath ?? undefined,
      reportTextPath: row.reportTextPath ?? undefined,
      conflictStrategy: row.conflictStrategy,
      reservedWordStrategy: row.reservedWordStrategy,
      lengthOverflowStrategy: row.lengthOverflowStrategy,
      maxIdentifierLength: row.maxIdentifierLength ?? DEFAULT_NAME_FIX_MAX_IDENTIFIER_LENGTH,
      changedTableCount: row.changedTableCount ?? 0,
      changedColumnCount: row.changedColumnCount ?? 0,
      blockingConflictCount: row.blockingConflictCount ?? 0,
      unresolvedSourceRefCount: row.unresolvedSourceRefCount ?? 0,
      error: row.error ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapNameFixJobItemRow(row: any): NameFixJobItem {
    return {
      id: row.id,
      jobId: row.jobId,
      fileId: row.fileId,
      sheetName: row.sheetName,
      tableIndex: row.tableIndex,
      columnIndex: row.columnIndex ?? undefined,
      target: row.target,
      beforeName: row.beforeName,
      afterName: row.afterName,
      action: row.action,
      reason: row.reason ?? undefined,
      sourceAddress: row.sourceAddress ?? undefined,
      blocking: Boolean(row.blocking),
      createdAt: row.createdAt,
    };
  }

  private mapNameFixBackupRow(row: any): NameFixBackup {
    return {
      id: row.id,
      jobId: row.jobId,
      fileId: row.fileId,
      sourcePath: row.sourcePath,
      backupPath: row.backupPath,
      backupHash: row.backupHash,
      restorable: Boolean(row.restorable),
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
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
    const [file] = await this.db.select().from(this.uploadedFiles).where(this.eq(this.uploadedFiles.id, id));
    return file;
  }

  async findFileByHash(hash: string): Promise<UploadedFile | undefined> {
    const [file] = await this.db.select().from(this.uploadedFiles).where(this.eq(this.uploadedFiles.fileHash, hash));
    return file;
  }

  async deleteUploadedFile(id: number): Promise<void> {
    await this.db.delete(this.uploadedFiles).where(this.eq(this.uploadedFiles.id, id));
  }

  async updateUploadedFile(id: number, updates: Pick<InsertUploadedFile, 'fileHash' | 'fileSize'>): Promise<UploadedFile | undefined> {
    const [updated] = await this.db
      .update(this.uploadedFiles)
      .set(updates)
      .where(this.eq(this.uploadedFiles.id, id))
      .returning();
    return updated;
  }

  async getSettings(): Promise<DdlSettings> {
    const [settings] = await this.db.select().from(this.ddlSettings).limit(1);
    if (!settings) {
      const defaultSettings: DdlSettings = {
        mysqlEngine: "InnoDB",
        mysqlCharset: "utf8mb4",
        mysqlCollate: "utf8mb4_bin",
        varcharCharset: "utf8mb4",
        varcharCollate: "utf8mb4_bin",
        exportFilenamePrefix: "Crt_",
        exportFilenameSuffix: "",
        includeCommentHeader: true,
        authorName: "ISI",
        includeSetNames: true,
        includeDropTable: true,
        downloadPath: undefined,
        excelReadPath: undefined,
        customHeaderTemplate: undefined,
        useCustomHeader: false,
        mysqlDataTypeCase: "lower",
        mysqlBooleanMode: "tinyint(1)",
        pkMarkers: DEFAULT_PK_MARKERS,
        maxConsecutiveEmptyRows: 10,
        uploadRateLimitWindowMs: DEFAULT_UPLOAD_RATE_LIMIT_WINDOW_MS,
        uploadRateLimitMaxRequests: DEFAULT_UPLOAD_RATE_LIMIT_MAX_REQUESTS,
        parseRateLimitWindowMs: DEFAULT_PARSE_RATE_LIMIT_WINDOW_MS,
        parseRateLimitMaxRequests: DEFAULT_PARSE_RATE_LIMIT_MAX_REQUESTS,
        globalProtectRateLimitWindowMs: DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_WINDOW_MS,
        globalProtectRateLimitMaxRequests: DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_MAX_REQUESTS,
        globalProtectMaxInFlight: DEFAULT_GLOBAL_PROTECT_MAX_INFLIGHT,
        prewarmEnabled: DEFAULT_PREWARM_ENABLED,
        prewarmMaxConcurrency: DEFAULT_PREWARM_MAX_CONCURRENCY,
        prewarmQueueMax: DEFAULT_PREWARM_QUEUE_MAX,
        prewarmMaxFileMb: DEFAULT_PREWARM_MAX_FILE_MB,
        taskManagerMaxQueueLength: DEFAULT_TASK_MANAGER_MAX_QUEUE_LENGTH,
        taskManagerStalePendingMs: DEFAULT_TASK_MANAGER_STALE_PENDING_MS,
        nameFixDefaultMode: DEFAULT_NAME_FIX_DEFAULT_MODE,
        nameFixConflictStrategy: DEFAULT_NAME_FIX_CONFLICT_STRATEGY,
        nameFixReservedWordStrategy: DEFAULT_NAME_FIX_RESERVED_WORD_STRATEGY,
        nameFixLengthOverflowStrategy: DEFAULT_NAME_FIX_LENGTH_OVERFLOW_STRATEGY,
        nameFixMaxIdentifierLength: DEFAULT_NAME_FIX_MAX_IDENTIFIER_LENGTH,
        nameFixBackupRetentionDays: DEFAULT_NAME_FIX_BACKUP_RETENTION_DAYS,
        nameFixMaxBatchConcurrency: DEFAULT_NAME_FIX_MAX_BATCH_CONCURRENCY,
        allowOverwriteInElectron: DEFAULT_ALLOW_OVERWRITE_IN_ELECTRON,
        allowExternalPathWrite: DEFAULT_ALLOW_EXTERNAL_PATH_WRITE,
      };
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
      .where(this.eq(this.ddlSettings.id, existing.id))
      .returning();
    return this.mapDbSettings(updated);
  }

  async createTask(task: Omit<ProcessingTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProcessingTask> {
    const [created] = await this.db.insert(this.processingTasks).values(task).returning();
    return {
      id: created.id,
      fileId: created.fileId,
      taskType: created.taskType,
      status: created.status,
      progress: created.progress,
      error: created.error,
      result: created.result ? JSON.parse(created.result) : undefined,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async getTask(id: number): Promise<ProcessingTask | undefined> {
    const [task] = await this.db.select().from(this.processingTasks).where(this.eq(this.processingTasks.id, id));
    if (!task) return undefined;
    return {
      id: task.id,
      fileId: task.fileId,
      taskType: task.taskType,
      status: task.status,
      progress: task.progress,
      error: task.error,
      result: task.result ? JSON.parse(task.result) : undefined,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  async updateTask(id: number, updates: Partial<Omit<ProcessingTask, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ProcessingTask | undefined> {
    const updateData = { ...updates };
    if (updateData.result !== undefined) {
      (updateData as any).result = JSON.stringify(updateData.result);
    }
    const [updated] = await this.db
      .update(this.processingTasks)
      .set({ ...updateData, updatedAt: new Date() })
      .where(this.eq(this.processingTasks.id, id))
      .returning();
    if (!updated) return undefined;
    return {
      id: updated.id,
      fileId: updated.fileId,
      taskType: updated.taskType,
      status: updated.status,
      progress: updated.progress,
      error: updated.error,
      result: updated.result ? JSON.parse(updated.result) : undefined,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteTask(id: number): Promise<void> {
    await this.db.delete(this.processingTasks).where(this.eq(this.processingTasks.id, id));
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
    const [job] = await this.db.select().from(this.nameFixJobs).where(this.eq(this.nameFixJobs.id, id));
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
      .where(this.eq(this.nameFixJobs.id, id))
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
    return created.map((row: any) => this.mapNameFixJobItemRow(row));
  }

  async listNameFixJobItems(jobId: string): Promise<NameFixJobItem[]> {
    const rows = await this.db.select().from(this.nameFixJobItems).where(this.eq(this.nameFixJobItems.jobId, jobId));
    return rows.map((row: any) => this.mapNameFixJobItemRow(row));
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
    const rows = await this.db.select().from(this.nameFixBackups).where(this.eq(this.nameFixBackups.jobId, jobId));
    return rows.map((row: any) => this.mapNameFixBackupRow(row));
  }

  async listNameFixBackups(): Promise<NameFixBackup[]> {
    const rows = await this.db.select().from(this.nameFixBackups);
    return rows.map((row: any) => this.mapNameFixBackupRow(row));
  }

  async updateNameFixBackup(
    id: number,
    updates: Partial<Omit<NameFixBackup, "id" | "createdAt">>,
  ): Promise<NameFixBackup | undefined> {
    const [updated] = await this.db
      .update(this.nameFixBackups)
      .set(updates)
      .where(this.eq(this.nameFixBackups.id, id))
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
