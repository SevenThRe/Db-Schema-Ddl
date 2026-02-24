import { type InsertUploadedFile, type UploadedFile, type DdlSettings, type ProcessingTask } from "@shared/schema";

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
    maxConsecutiveEmptyRows: 10,
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
    return this.settings;
  }

  async updateSettings(settings: DdlSettings): Promise<DdlSettings> {
    this.settings = settings;
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
    // Lazy load DB modules only if DATABASE_URL is set
    const { db } = require("./db");
    const { uploadedFiles, ddlSettings, processingTasks } = require("@shared/schema");
    const { eq } = require("drizzle-orm");
    this.db = db;
    this.uploadedFiles = uploadedFiles;
    this.ddlSettings = ddlSettings;
    this.processingTasks = processingTasks;
    this.eq = eq;
  }

  private eq: any;

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
      // Create default settings if none exist
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
        maxConsecutiveEmptyRows: 10,
      };
      const [created] = await this.db.insert(this.ddlSettings).values(defaultSettings).returning();
      return {
        mysqlEngine: created.mysqlEngine,
        mysqlCharset: created.mysqlCharset,
        mysqlCollate: created.mysqlCollate,
        varcharCharset: created.varcharCharset,
        varcharCollate: created.varcharCollate,
        exportFilenamePrefix: created.exportFilenamePrefix,
        exportFilenameSuffix: created.exportFilenameSuffix,
        includeCommentHeader: created.includeCommentHeader,
        authorName: created.authorName,
        includeSetNames: created.includeSetNames,
        includeDropTable: created.includeDropTable,
        downloadPath: created.downloadPath,
        excelReadPath: created.excelReadPath,
        customHeaderTemplate: created.customHeaderTemplate,
        useCustomHeader: created.useCustomHeader,
        maxConsecutiveEmptyRows: created.maxConsecutiveEmptyRows,
      };
    }
    return {
      mysqlEngine: settings.mysqlEngine,
      mysqlCharset: settings.mysqlCharset,
      mysqlCollate: settings.mysqlCollate,
      varcharCharset: settings.varcharCharset,
      varcharCollate: settings.varcharCollate,
      exportFilenamePrefix: settings.exportFilenamePrefix,
      exportFilenameSuffix: settings.exportFilenameSuffix,
      includeCommentHeader: settings.includeCommentHeader,
      authorName: settings.authorName,
      includeSetNames: settings.includeSetNames,
      includeDropTable: settings.includeDropTable,
      downloadPath: settings.downloadPath,
      excelReadPath: settings.excelReadPath,
      customHeaderTemplate: settings.customHeaderTemplate,
      useCustomHeader: settings.useCustomHeader,
      maxConsecutiveEmptyRows: settings.maxConsecutiveEmptyRows,
    };
  }

  async updateSettings(newSettings: DdlSettings): Promise<DdlSettings> {
    const [existing] = await this.db.select().from(this.ddlSettings).limit(1);
    if (!existing) {
      const [created] = await this.db.insert(this.ddlSettings).values(newSettings).returning();
      return {
        mysqlEngine: created.mysqlEngine,
        mysqlCharset: created.mysqlCharset,
        mysqlCollate: created.mysqlCollate,
        varcharCharset: created.varcharCharset,
        varcharCollate: created.varcharCollate,
        exportFilenamePrefix: created.exportFilenamePrefix,
        exportFilenameSuffix: created.exportFilenameSuffix,
        includeCommentHeader: created.includeCommentHeader,
        authorName: created.authorName,
        includeSetNames: created.includeSetNames,
        includeDropTable: created.includeDropTable,
        downloadPath: created.downloadPath,
        excelReadPath: created.excelReadPath,
        customHeaderTemplate: created.customHeaderTemplate,
        useCustomHeader: created.useCustomHeader,
        maxConsecutiveEmptyRows: created.maxConsecutiveEmptyRows,
      };
    }
    const [updated] = await this.db
      .update(this.ddlSettings)
      .set({ ...newSettings, updatedAt: new Date().toISOString() })
      .where(this.eq(this.ddlSettings.id, existing.id))
      .returning();
    return {
      mysqlEngine: updated.mysqlEngine,
      mysqlCharset: updated.mysqlCharset,
      mysqlCollate: updated.mysqlCollate,
      varcharCharset: updated.varcharCharset,
      varcharCollate: updated.varcharCollate,
      exportFilenamePrefix: updated.exportFilenamePrefix,
      exportFilenameSuffix: updated.exportFilenameSuffix,
      includeCommentHeader: updated.includeCommentHeader,
      authorName: updated.authorName,
      includeSetNames: updated.includeSetNames,
      includeDropTable: updated.includeDropTable,
      downloadPath: updated.downloadPath,
      excelReadPath: updated.excelReadPath,
      customHeaderTemplate: updated.customHeaderTemplate,
      useCustomHeader: updated.useCustomHeader,
      maxConsecutiveEmptyRows: updated.maxConsecutiveEmptyRows,
    };
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

// Auto-select storage based on environment
export const storage: IStorage = process.env.DATABASE_URL
  ? new DatabaseStorage()
  : new MemoryStorage();
