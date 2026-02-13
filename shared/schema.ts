import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const uploadedFiles = pgTable("uploaded_files", {
  id: serial("id").primaryKey(),
  filePath: text("file_path").notNull(),
  originalName: text("original_name").notNull(),
  fileHash: text("file_hash").notNull(),
  fileSize: serial("file_size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({ id: true, uploadedAt: true });
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;

// DDL Settings table
export const ddlSettings = pgTable("ddl_settings", {
  id: serial("id").primaryKey(),
  mysqlEngine: text("mysql_engine").notNull().default("InnoDB"),
  mysqlCharset: text("mysql_charset").notNull().default("utf8mb4"),
  mysqlCollate: text("mysql_collate").notNull().default("utf8mb4_bin"),
  varcharCharset: text("varchar_charset").notNull().default("utf8mb4"),
  varcharCollate: text("varchar_collate").notNull().default("utf8mb4_bin"),
  exportFilenamePrefix: text("export_filename_prefix").notNull().default("Crt_"),
  exportFilenameSuffix: text("export_filename_suffix").notNull().default(""),
  includeCommentHeader: boolean("include_comment_header").notNull().default(true),
  authorName: text("author_name").notNull().default("ISI"),
  includeSetNames: boolean("include_set_names").notNull().default(true),
  includeDropTable: boolean("include_drop_table").notNull().default(true),
  downloadPath: text("download_path"),
  excelReadPath: text("excel_read_path"),
  customHeaderTemplate: text("custom_header_template"),
  useCustomHeader: boolean("use_custom_header").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const ddlSettingsSchema = z.object({
  mysqlEngine: z.string().default("InnoDB"),
  mysqlCharset: z.string().default("utf8mb4"),
  mysqlCollate: z.string().default("utf8mb4_bin"),
  varcharCharset: z.string().default("utf8mb4"),
  varcharCollate: z.string().default("utf8mb4_bin"),
  exportFilenamePrefix: z.string().default("Crt_"),
  exportFilenameSuffix: z.string().default(""),
  includeCommentHeader: z.boolean().default(true),
  authorName: z.string().default("ISI"),
  includeSetNames: z.boolean().default(true),
  includeDropTable: z.boolean().default(true),
  downloadPath: z.string().optional(),
  excelReadPath: z.string().optional(),
  customHeaderTemplate: z.string().optional(),
  useCustomHeader: z.boolean().default(false),
});

export type DdlSettings = z.infer<typeof ddlSettingsSchema>;

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
  settings: ddlSettingsSchema.optional(),
});

export type ColumnInfo = z.infer<typeof columnInfoSchema>;
export type TableInfo = z.infer<typeof tableInfoSchema>;
export type GenerateDdlRequest = z.infer<typeof generateDdlRequestSchema>;

// Processing Tasks table for tracking background file processing
export const processingTasks = pgTable("processing_tasks", {
  id: serial("id").primaryKey(),
  fileId: serial("file_id"),
  taskType: text("task_type").notNull(), // 'upload', 'parse_sheets'
  status: text("status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'failed'
  progress: serial("progress").notNull().default(0), // 0-100
  error: text("error"),
  result: text("result"), // JSON-encoded result data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const processingTaskSchema = z.object({
  id: z.number(),
  fileId: z.number().optional(),
  taskType: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  progress: z.number().min(0).max(100),
  error: z.string().optional(),
  result: z.any().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ProcessingTask = z.infer<typeof processingTaskSchema>;
