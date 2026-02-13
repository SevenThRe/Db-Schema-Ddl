import { type InsertUploadedFile, type UploadedFile } from "@shared/schema";

export interface IStorage {
  createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
  getUploadedFiles(): Promise<UploadedFile[]>;
  getUploadedFile(id: number): Promise<UploadedFile | undefined>;
  deleteUploadedFile(id: number): Promise<void>;
}

// Memory-based storage for development (no database needed)
export class MemoryStorage implements IStorage {
  private files: UploadedFile[] = [];
  private nextId = 1;

  async createUploadedFile(insertFile: InsertUploadedFile): Promise<UploadedFile> {
    const file: UploadedFile = {
      id: this.nextId++,
      filePath: insertFile.filePath,
      originalName: insertFile.originalName,
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

  async deleteUploadedFile(id: number): Promise<void> {
    this.files = this.files.filter(f => f.id !== id);
  }
}

// Database storage (requires PostgreSQL)
export class DatabaseStorage implements IStorage {
  private db: any;
  private uploadedFiles: any;

  constructor() {
    // Lazy load DB modules only if DATABASE_URL is set
    const { db } = require("./db");
    const { uploadedFiles } = require("@shared/schema");
    const { eq } = require("drizzle-orm");
    this.db = db;
    this.uploadedFiles = uploadedFiles;
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

  async deleteUploadedFile(id: number): Promise<void> {
    await this.db.delete(this.uploadedFiles).where(this.eq(this.uploadedFiles.id, id));
  }
}

// Auto-select storage based on environment
export const storage: IStorage = process.env.DATABASE_URL
  ? new DatabaseStorage()
  : new MemoryStorage();
