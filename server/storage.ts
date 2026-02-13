import { type InsertUploadedFile, type UploadedFile, type DdlSettings } from "@shared/schema";

export interface IStorage {
  createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
  getUploadedFiles(): Promise<UploadedFile[]>;
  getUploadedFile(id: number): Promise<UploadedFile | undefined>;
  findFileByHash(hash: string): Promise<UploadedFile | undefined>;
  deleteUploadedFile(id: number): Promise<void>;
  getSettings(): Promise<DdlSettings>;
  updateSettings(settings: DdlSettings): Promise<DdlSettings>;
}

// Memory-based storage for development (no database needed)
export class MemoryStorage implements IStorage {
  private files: UploadedFile[] = [];
  private nextId = 1;
  private settings: DdlSettings = {
    mysqlEngine: "InnoDB",
    mysqlCharset: "utf8mb4",
    mysqlCollate: "utf8mb4_bin",
    varcharCharset: "utf8mb4",
    varcharCollate: "utf8mb4_bin",
    exportFilenamePrefix: "Crt_",
    includeCommentHeader: true,
    authorName: "ISI",
    includeSetNames: true,
    includeDropTable: true,
    downloadPath: undefined,
    excelReadPath: undefined,
    customHeaderTemplate: undefined,
    useCustomHeader: false,
  };

  async createUploadedFile(insertFile: InsertUploadedFile): Promise<UploadedFile> {
    const file: UploadedFile = {
      id: this.nextId++,
      filePath: insertFile.filePath,
      originalName: insertFile.originalName,
      fileHash: insertFile.fileHash,
      fileSize: insertFile.fileSize || 0,
      uploadedAt: new Date(),
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

  async getSettings(): Promise<DdlSettings> {
    return this.settings;
  }

  async updateSettings(settings: DdlSettings): Promise<DdlSettings> {
    this.settings = settings;
    return this.settings;
  }
}

// Database storage (requires PostgreSQL)
export class DatabaseStorage implements IStorage {
  private db: any;
  private uploadedFiles: any;
  private ddlSettings: any;

  constructor() {
    // Lazy load DB modules only if DATABASE_URL is set
    const { db } = require("./db");
    const { uploadedFiles, ddlSettings } = require("@shared/schema");
    const { eq } = require("drizzle-orm");
    this.db = db;
    this.uploadedFiles = uploadedFiles;
    this.ddlSettings = ddlSettings;
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
        includeCommentHeader: true,
        authorName: "ISI",
        includeSetNames: true,
        includeDropTable: true,
        downloadPath: undefined,
        excelReadPath: undefined,
        customHeaderTemplate: undefined,
        useCustomHeader: false,
      };
      const [created] = await this.db.insert(this.ddlSettings).values(defaultSettings).returning();
      return {
        mysqlEngine: created.mysqlEngine,
        mysqlCharset: created.mysqlCharset,
        mysqlCollate: created.mysqlCollate,
        varcharCharset: created.varcharCharset,
        varcharCollate: created.varcharCollate,
        exportFilenamePrefix: created.exportFilenamePrefix,
        includeCommentHeader: created.includeCommentHeader,
        authorName: created.authorName,
        includeSetNames: created.includeSetNames,
        includeDropTable: created.includeDropTable,
        downloadPath: created.downloadPath,
        excelReadPath: created.excelReadPath,
        customHeaderTemplate: created.customHeaderTemplate,
        useCustomHeader: created.useCustomHeader,
      };
    }
    return {
      mysqlEngine: settings.mysqlEngine,
      mysqlCharset: settings.mysqlCharset,
      mysqlCollate: settings.mysqlCollate,
      varcharCharset: settings.varcharCharset,
      varcharCollate: settings.varcharCollate,
      exportFilenamePrefix: settings.exportFilenamePrefix,
      includeCommentHeader: settings.includeCommentHeader,
      authorName: settings.authorName,
      includeSetNames: settings.includeSetNames,
      includeDropTable: settings.includeDropTable,
      downloadPath: settings.downloadPath,
      excelReadPath: settings.excelReadPath,
      customHeaderTemplate: settings.customHeaderTemplate,
      useCustomHeader: settings.useCustomHeader,
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
        includeCommentHeader: created.includeCommentHeader,
        authorName: created.authorName,
        includeSetNames: created.includeSetNames,
        includeDropTable: created.includeDropTable,
        downloadPath: created.downloadPath,
        excelReadPath: created.excelReadPath,
        customHeaderTemplate: created.customHeaderTemplate,
        useCustomHeader: created.useCustomHeader,
      };
    }
    const [updated] = await this.db
      .update(this.ddlSettings)
      .set({ ...newSettings, updatedAt: new Date() })
      .where(this.eq(this.ddlSettings.id, existing.id))
      .returning();
    return {
      mysqlEngine: updated.mysqlEngine,
      mysqlCharset: updated.mysqlCharset,
      mysqlCollate: updated.mysqlCollate,
      varcharCharset: updated.varcharCharset,
      varcharCollate: updated.varcharCollate,
      exportFilenamePrefix: updated.exportFilenamePrefix,
      includeCommentHeader: updated.includeCommentHeader,
      authorName: updated.authorName,
      includeSetNames: updated.includeSetNames,
      includeDropTable: updated.includeDropTable,
      downloadPath: updated.downloadPath,
      excelReadPath: updated.excelReadPath,
      customHeaderTemplate: updated.customHeaderTemplate,
      useCustomHeader: updated.useCustomHeader,
    };
  }
}

// Auto-select storage based on environment
export const storage: IStorage = process.env.DATABASE_URL
  ? new DatabaseStorage()
  : new MemoryStorage();
