import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// SQLite テーブル定義（Electron デスクトップ版用）
export const uploadedFiles = sqliteTable("uploaded_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filePath: text("file_path").notNull(),
  originalName: text("original_name").notNull(),
  fileHash: text("file_hash").notNull(),
  fileSize: integer("file_size").notNull(),
  uploadedAt: text("uploaded_at").default(sql`CURRENT_TIMESTAMP`),
});

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({ id: true, uploadedAt: true });
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;

// DDL Settings table
export const ddlSettings = sqliteTable("ddl_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mysqlEngine: text("mysql_engine").notNull().default("InnoDB"),
  mysqlCharset: text("mysql_charset").notNull().default("utf8mb4"),
  mysqlCollate: text("mysql_collate").notNull().default("utf8mb4_bin"),
  varcharCharset: text("varchar_charset").notNull().default("utf8mb4"),
  varcharCollate: text("varchar_collate").notNull().default("utf8mb4_bin"),
  exportFilenamePrefix: text("export_filename_prefix").notNull().default("Crt_"),
  exportFilenameSuffix: text("export_filename_suffix").notNull().default(""),
  includeCommentHeader: integer("include_comment_header", { mode: "boolean" }).notNull().default(true),
  authorName: text("author_name").notNull().default("ISI"),
  includeSetNames: integer("include_set_names", { mode: "boolean" }).notNull().default(true),
  includeDropTable: integer("include_drop_table", { mode: "boolean" }).notNull().default(true),
  downloadPath: text("download_path"),
  excelReadPath: text("excel_read_path"),
  customHeaderTemplate: text("custom_header_template"),
  useCustomHeader: integer("use_custom_header", { mode: "boolean" }).notNull().default(false),
  mysqlDataTypeCase: text("mysql_data_type_case").notNull().default("lower"),
  mysqlBooleanMode: text("mysql_boolean_mode").notNull().default("tinyint(1)"),
  pkMarkers: text("pk_markers").notNull().default("[\"\\u3007\"]"),
  maxConsecutiveEmptyRows: integer("max_consecutive_empty_rows").notNull().default(10),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
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
  mysqlDataTypeCase: z.enum(["lower", "upper"]).default("lower"),
  mysqlBooleanMode: z.enum(["tinyint(1)", "boolean"]).default("tinyint(1)"),
  pkMarkers: z.array(z.string().min(1)).default(["\u3007"]),
  maxConsecutiveEmptyRows: z.number().int().min(1).max(100).default(10),
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
  // Column and row range information for the parsed table
  columnRange: z.object({
    startCol: z.number(),
    endCol: z.number(),
    startColLabel: z.string().optional(), // Excel column label (e.g., "A", "B", "AA")
    endColLabel: z.string().optional(),
  }).optional(),
  rowRange: z.object({
    startRow: z.number(),
    endRow: z.number(),
  }).optional(),
  // Excel range notation (e.g., "A15:N40")
  excelRange: z.string().optional(),
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
export const processingTasks = sqliteTable("processing_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileId: integer("file_id"),
  taskType: text("task_type").notNull(), // 'upload', 'parse_sheets'
  status: text("status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'failed'
  progress: integer("progress").notNull().default(0), // 0-100
  error: text("error"),
  result: text("result"), // JSON-encoded result data
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
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
