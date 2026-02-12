import { db } from "./db";
import { uploadedFiles, type InsertUploadedFile, type UploadedFile } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
  getUploadedFiles(): Promise<UploadedFile[]>;
  getUploadedFile(id: number): Promise<UploadedFile | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createUploadedFile(insertFile: InsertUploadedFile): Promise<UploadedFile> {
    const [file] = await db.insert(uploadedFiles).values(insertFile).returning();
    return file;
  }

  async getUploadedFiles(): Promise<UploadedFile[]> {
    return await db.select().from(uploadedFiles);
  }

  async getUploadedFile(id: number): Promise<UploadedFile | undefined> {
    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, id));
    return file;
  }
}

export const storage = new DatabaseStorage();
