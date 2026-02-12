import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const uploadedFiles = pgTable("uploaded_files", {
  id: serial("id").primaryKey(),
  filePath: text("file_path").notNull(),
  originalName: text("original_name").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({ id: true, uploadedAt: true });
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;

// Non-DB types for Excel parsing
export const columnInfoSchema = z.object({
  no: z.number().optional(),
  logicalName: z.string().optional(),
  physicalName: z.string().optional(),
  dataType: z.string().optional(),
  size: z.string().optional(),
  notNull: z.boolean().optional(),
  isPk: z.boolean().optional(),
  comment: z.string().optional(),
});

export const tableInfoSchema = z.object({
  logicalTableName: z.string(),
  physicalTableName: z.string(),
  columns: z.array(columnInfoSchema),
});

export const generateDdlRequestSchema = z.object({
  tables: z.array(tableInfoSchema),
  dialect: z.enum(["mysql", "oracle"]),
});

export type ColumnInfo = z.infer<typeof columnInfoSchema>;
export type TableInfo = z.infer<typeof tableInfoSchema>;
export type GenerateDdlRequest = z.infer<typeof generateDdlRequestSchema>;
