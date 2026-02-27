import {
  type InsertUploadedFile,
  type UploadedFile,
  type DdlSettings,
  type ProcessingTask,
  uploadedFiles as uploadedFilesTable,
  ddlSettings as ddlSettingsTable,
  processingTasks as processingTasksTable,
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
}

// Memory-based storage for development (no database needed)
export class MemoryStorage implements IStorage {
  private files: UploadedFile[] = [];
  private tasks: ProcessingTask[] = [];
  private nextId = 1;
  private nextTaskId = 1;
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
}

// Database storage (requires PostgreSQL)
export class DatabaseStorage implements IStorage {
  private db: any;
  private uploadedFiles: any;
  private ddlSettings: any;
  private processingTasks: any;

  constructor() {
    if (!db) {
      throw new Error("DatabaseStorage requires configured database connection.");
    }
    this.db = db;
    this.uploadedFiles = uploadedFilesTable;
    this.ddlSettings = ddlSettingsTable;
    this.processingTasks = processingTasksTable;
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
    };
  }

  private toDbSettingsInput(settings: DdlSettings): Record<string, unknown> {
    return {
      ...settings,
      pkMarkers: serializePkMarkers(settings.pkMarkers),
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
}

// Auto-select storage based on actual database readiness.
// - SQLite mode: db is initialized when USE_SQLITE_STORAGE / ELECTRON_MODE is enabled.
// - PostgreSQL mode: db is initialized when DATABASE_URL is present.
const shouldUseDatabaseStorage = Boolean(db);

export const storage: IStorage = shouldUseDatabaseStorage
  ? new DatabaseStorage()
  : new MemoryStorage();

console.info(`[storage] mode=${shouldUseDatabaseStorage ? "database" : "memory"}`);
