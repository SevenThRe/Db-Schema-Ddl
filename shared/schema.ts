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
  uploadRateLimitWindowMs: integer("upload_rate_limit_window_ms").notNull().default(60000),
  uploadRateLimitMaxRequests: integer("upload_rate_limit_max_requests").notNull().default(20),
  parseRateLimitWindowMs: integer("parse_rate_limit_window_ms").notNull().default(60000),
  parseRateLimitMaxRequests: integer("parse_rate_limit_max_requests").notNull().default(40),
  globalProtectRateLimitWindowMs: integer("global_protect_rate_limit_window_ms").notNull().default(60000),
  globalProtectRateLimitMaxRequests: integer("global_protect_rate_limit_max_requests").notNull().default(240),
  globalProtectMaxInFlight: integer("global_protect_max_inflight").notNull().default(80),
  prewarmEnabled: integer("prewarm_enabled", { mode: "boolean" }).notNull().default(true),
  prewarmMaxConcurrency: integer("prewarm_max_concurrency").notNull().default(1),
  prewarmQueueMax: integer("prewarm_queue_max").notNull().default(12),
  prewarmMaxFileMb: integer("prewarm_max_file_mb").notNull().default(20),
  taskManagerMaxQueueLength: integer("task_manager_max_queue_length").notNull().default(200),
  taskManagerStalePendingMs: integer("task_manager_stale_pending_ms").notNull().default(1800000),
  nameFixDefaultMode: text("name_fix_default_mode").notNull().default("copy"),
  nameFixConflictStrategy: text("name_fix_conflict_strategy").notNull().default("suffix_increment"),
  nameFixReservedWordStrategy: text("name_fix_reserved_word_strategy").notNull().default("prefix"),
  nameFixLengthOverflowStrategy: text("name_fix_length_overflow_strategy").notNull().default("truncate_hash"),
  nameFixMaxIdentifierLength: integer("name_fix_max_identifier_length").notNull().default(64),
  nameFixBackupRetentionDays: integer("name_fix_backup_retention_days").notNull().default(30),
  nameFixMaxBatchConcurrency: integer("name_fix_max_batch_concurrency").notNull().default(4),
  allowOverwriteInElectron: integer("allow_overwrite_in_electron", { mode: "boolean" }).notNull().default(true),
  allowExternalPathWrite: integer("allow_external_path_write", { mode: "boolean" }).notNull().default(false),
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
  uploadRateLimitWindowMs: z.number().int().min(1000).max(300000).default(60000),
  uploadRateLimitMaxRequests: z.number().int().min(1).max(500).default(20),
  parseRateLimitWindowMs: z.number().int().min(1000).max(300000).default(60000),
  parseRateLimitMaxRequests: z.number().int().min(1).max(1000).default(40),
  globalProtectRateLimitWindowMs: z.number().int().min(1000).max(300000).default(60000),
  globalProtectRateLimitMaxRequests: z.number().int().min(10).max(5000).default(240),
  globalProtectMaxInFlight: z.number().int().min(1).max(500).default(80),
  prewarmEnabled: z.boolean().default(true),
  prewarmMaxConcurrency: z.number().int().min(1).max(8).default(1),
  prewarmQueueMax: z.number().int().min(1).max(100).default(12),
  prewarmMaxFileMb: z.number().int().min(1).max(100).default(20),
  taskManagerMaxQueueLength: z.number().int().min(10).max(1000).default(200),
  taskManagerStalePendingMs: z.number().int().min(60000).max(3600000).default(1800000),
  nameFixDefaultMode: z.enum(["copy", "overwrite", "replace_download"]).default("copy"),
  nameFixConflictStrategy: z.enum(["suffix_increment", "hash_suffix", "abort"]).default("suffix_increment"),
  nameFixReservedWordStrategy: z.enum(["prefix", "abort"]).default("prefix"),
  nameFixLengthOverflowStrategy: z.enum(["truncate_hash", "abort"]).default("truncate_hash"),
  nameFixMaxIdentifierLength: z.number().int().min(8).max(255).default(64),
  nameFixBackupRetentionDays: z.number().int().min(1).max(365).default(30),
  nameFixMaxBatchConcurrency: z.number().int().min(1).max(16).default(4),
  allowOverwriteInElectron: z.boolean().default(true),
  allowExternalPathWrite: z.boolean().default(false),
});

export type DdlSettings = z.infer<typeof ddlSettingsSchema>;

// Non-DB types for Excel parsing
export const codeValueOptionSchema = z.object({
  code: z.string(),
  label: z.string(),
});

export const codeReferenceSchema = z.object({
  source: z.string().min(1),
  codeId: z.string(),
  raw: z.string(),
  options: z.array(codeValueOptionSchema).optional(),
});

export const cellSourceRefSchema = z.object({
  sheetName: z.string(),
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  address: z.string().optional(),
});

export const tableSourceRefSchema = z.object({
  sheetName: z.string(),
  logicalName: cellSourceRefSchema.optional(),
  physicalName: cellSourceRefSchema.optional(),
});

export const columnInfoSchema = z.object({
  no: z.number().optional(),
  logicalName: z.string().optional(),
  physicalName: z.string().optional(),
  dataType: z.string().optional(),
  size: z.string().optional(),
  notNull: z.boolean().optional(),
  isPk: z.boolean().optional(),
  autoIncrement: z.boolean().optional(),
  comment: z.string().optional(),
  commentRaw: z.string().optional(),
  codeReferences: z.array(codeReferenceSchema).optional(),
  sourceRef: cellSourceRefSchema.optional(),
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
  sourceRef: tableSourceRefSchema.optional(),
});

export const generateDdlRequestSchema = z.object({
  tables: z.array(tableInfoSchema),
  dialect: z.enum(["mysql", "oracle"]),
  settings: ddlSettingsSchema.optional(),
});

export const exportZipRequestSchema = generateDdlRequestSchema.extend({
  tolerantMode: z.boolean().default(true),
  includeErrorReport: z.boolean().default(true),
});

export const tableReferenceOverrideSchema = z.object({
  tableIndex: z.number().int().min(0),
  table: tableInfoSchema,
});

export const generateDdlByReferenceRequestSchema = z.object({
  fileId: z.number().int().positive(),
  sheetName: z.string().min(1),
  selectedTableIndexes: z.array(z.number().int().min(0)).min(1),
  tableOverrides: z.array(tableReferenceOverrideSchema).optional(),
  dialect: z.enum(["mysql", "oracle"]),
  settings: ddlSettingsSchema.optional(),
});

export const exportZipByReferenceRequestSchema = generateDdlByReferenceRequestSchema.extend({
  tolerantMode: z.boolean().default(true),
  includeErrorReport: z.boolean().default(true),
});

export type ColumnInfo = z.infer<typeof columnInfoSchema>;
export type CodeValueOption = z.infer<typeof codeValueOptionSchema>;
export type CodeReference = z.infer<typeof codeReferenceSchema>;
export type TableInfo = z.infer<typeof tableInfoSchema>;
export type GenerateDdlRequest = z.infer<typeof generateDdlRequestSchema>;
export type ExportZipRequest = z.infer<typeof exportZipRequestSchema>;

export const nameFixModeSchema = z.enum(["copy", "overwrite", "replace_download"]);
export const nameFixScopeSchema = z.enum(["current_sheet", "selected_sheets", "all_sheets"]);
export const nameFixConflictStrategySchema = z.enum(["suffix_increment", "hash_suffix", "abort"]);
export const reservedWordStrategySchema = z.enum(["prefix", "abort"]);
export const lengthOverflowStrategySchema = z.enum(["truncate_hash", "abort"]);

export const nameFixConflictSchema = z.object({
  type: z.enum(["table_duplicate", "column_duplicate", "reserved_word", "length_overflow", "invalid_name"]),
  blocking: z.boolean(),
  tableIndex: z.number().int(),
  columnIndex: z.number().int().optional(),
  target: z.enum(["table", "column"]),
  currentName: z.string(),
  attemptedName: z.string(),
  reason: z.string(),
  tableName: z.string().optional(),
  sheetName: z.string().optional(),
});

export const nameFixDecisionTraceSchema = z.object({
  target: z.enum(["table", "column"]),
  tableIndex: z.number().int(),
  columnIndex: z.number().int().optional(),
  before: z.string(),
  normalized: z.string(),
  after: z.string(),
  reasons: z.array(z.string()),
  tableName: z.string().optional(),
  sheetName: z.string().optional(),
});

export const nameFixColumnMappingSchema = z.object({
  columnIndex: z.number().int(),
  logicalName: z.string().optional(),
  physicalNameBefore: z.string(),
  physicalNameAfter: z.string(),
  sourceRef: cellSourceRefSchema.optional(),
  sourceRefExists: z.boolean(),
});

export const nameFixTableMappingSchema = z.object({
  sheetName: z.string(),
  tableIndex: z.number().int(),
  logicalTableName: z.string(),
  physicalTableNameBefore: z.string(),
  physicalTableNameAfter: z.string(),
  sourceRef: tableSourceRefSchema.optional(),
  sourceRefExists: z.boolean(),
  unresolvedSourceRefs: z.number().int().min(0),
  columns: z.array(nameFixColumnMappingSchema),
});

export const nameFixFilePreviewSchema = z.object({
  fileId: z.number().int(),
  originalName: z.string(),
  sourcePath: z.string(),
  selectedSheets: z.array(z.string()),
  tableCount: z.number().int(),
  changedTableCount: z.number().int(),
  changedColumnCount: z.number().int(),
  blockingConflictCount: z.number().int(),
  unresolvedSourceRefCount: z.number().int(),
  conflicts: z.array(nameFixConflictSchema),
  decisionTrace: z.array(nameFixDecisionTraceSchema),
  tableMappings: z.array(nameFixTableMappingSchema),
});

export const nameFixPreviewRequestSchema = z.object({
  fileIds: z.array(z.number().int().positive()).min(1),
  scope: nameFixScopeSchema.default("current_sheet"),
  currentSheetName: z.string().optional(),
  selectedSheetNames: z.array(z.string()).optional(),
  conflictStrategy: nameFixConflictStrategySchema.default("suffix_increment"),
  reservedWordStrategy: reservedWordStrategySchema.default("prefix"),
  lengthOverflowStrategy: lengthOverflowStrategySchema.default("truncate_hash"),
  maxIdentifierLength: z.number().int().min(8).max(255).default(64),
});

export const nameFixPreviewResponseSchema = z.object({
  planId: z.string(),
  planHash: z.string(),
  expiresAt: z.string(),
  summary: z.object({
    fileCount: z.number().int(),
    tableCount: z.number().int(),
    changedTableCount: z.number().int(),
    changedColumnCount: z.number().int(),
    blockingConflictCount: z.number().int(),
    unresolvedSourceRefCount: z.number().int(),
  }),
  files: z.array(nameFixFilePreviewSchema),
});

export const nameFixApplyRequestSchema = z.object({
  planId: z.string().min(8),
  mode: nameFixModeSchema.default("copy"),
  targetDirectory: z.string().optional(),
  includeReport: z.boolean().default(true),
});

export const nameFixApplyFileResultSchema = z.object({
  fileId: z.number().int(),
  sourcePath: z.string(),
  outputPath: z.string().optional(),
  backupPath: z.string().optional(),
  reportJsonPath: z.string().optional(),
  reportTextPath: z.string().optional(),
  downloadToken: z.string().optional(),
  downloadFilename: z.string().optional(),
  success: z.boolean(),
  changedTableCount: z.number().int(),
  changedColumnCount: z.number().int(),
  skippedChanges: z.number().int(),
  error: z.string().optional(),
});

export const nameFixApplyResponseSchema = z.object({
  jobId: z.string(),
  planId: z.string(),
  planHash: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  downloadBundleToken: z.string().optional(),
  downloadBundleFilename: z.string().optional(),
  summary: z.object({
    fileCount: z.number().int(),
    successCount: z.number().int(),
    failedCount: z.number().int(),
    changedTableCount: z.number().int(),
    changedColumnCount: z.number().int(),
  }),
  files: z.array(nameFixApplyFileResultSchema),
});

export const nameFixRollbackRequestSchema = z.object({
  jobId: z.string().min(4),
});

export const nameFixRollbackResponseSchema = z.object({
  jobId: z.string(),
  success: z.boolean(),
  restoredPath: z.string().optional(),
  backupPath: z.string().optional(),
  restoredHash: z.string().optional(),
  message: z.string().optional(),
});

export const nameFixJobStatusSchema = z.enum(["pending", "processing", "completed", "failed", "rolled_back"]);

export const nameFixJobSchema = z.object({
  id: z.string(),
  fileId: z.number().int(),
  planId: z.string(),
  planHash: z.string(),
  mode: nameFixModeSchema,
  scope: nameFixScopeSchema,
  status: nameFixJobStatusSchema,
  sourcePath: z.string(),
  outputPath: z.string().optional(),
  backupPath: z.string().optional(),
  reportJsonPath: z.string().optional(),
  reportTextPath: z.string().optional(),
  conflictStrategy: nameFixConflictStrategySchema,
  reservedWordStrategy: reservedWordStrategySchema,
  lengthOverflowStrategy: lengthOverflowStrategySchema,
  maxIdentifierLength: z.number().int(),
  changedTableCount: z.number().int(),
  changedColumnCount: z.number().int(),
  blockingConflictCount: z.number().int(),
  unresolvedSourceRefCount: z.number().int(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const nameFixJobItemSchema = z.object({
  id: z.number().int(),
  jobId: z.string(),
  fileId: z.number().int(),
  sheetName: z.string(),
  tableIndex: z.number().int(),
  columnIndex: z.number().int().optional(),
  target: z.enum(["table", "column"]),
  beforeName: z.string(),
  afterName: z.string(),
  action: z.string(),
  reason: z.string().optional(),
  sourceAddress: z.string().optional(),
  blocking: z.boolean().default(false),
  createdAt: z.string(),
});

export const nameFixBackupSchema = z.object({
  id: z.number().int(),
  jobId: z.string(),
  fileId: z.number().int(),
  sourcePath: z.string(),
  backupPath: z.string(),
  backupHash: z.string(),
  restorable: z.boolean(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type TableReferenceOverride = z.infer<typeof tableReferenceOverrideSchema>;
export type GenerateDdlByReferenceRequest = z.infer<typeof generateDdlByReferenceRequestSchema>;
export type ExportZipByReferenceRequest = z.infer<typeof exportZipByReferenceRequestSchema>;

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

export const nameFixJobs = sqliteTable("name_fix_jobs", {
  id: text("id").primaryKey(),
  fileId: integer("file_id").notNull(),
  planId: text("plan_id").notNull(),
  planHash: text("plan_hash").notNull(),
  mode: text("mode").notNull(),
  scope: text("scope").notNull(),
  status: text("status").notNull().default("pending"),
  sourcePath: text("source_path").notNull(),
  outputPath: text("output_path"),
  backupPath: text("backup_path"),
  reportJsonPath: text("report_json_path"),
  reportTextPath: text("report_text_path"),
  conflictStrategy: text("conflict_strategy").notNull(),
  reservedWordStrategy: text("reserved_word_strategy").notNull(),
  lengthOverflowStrategy: text("length_overflow_strategy").notNull(),
  maxIdentifierLength: integer("max_identifier_length").notNull().default(64),
  changedTableCount: integer("changed_table_count").notNull().default(0),
  changedColumnCount: integer("changed_column_count").notNull().default(0),
  blockingConflictCount: integer("blocking_conflict_count").notNull().default(0),
  unresolvedSourceRefCount: integer("unresolved_source_ref_count").notNull().default(0),
  error: text("error"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const nameFixJobItems = sqliteTable("name_fix_job_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id").notNull(),
  fileId: integer("file_id").notNull(),
  sheetName: text("sheet_name").notNull(),
  tableIndex: integer("table_index").notNull(),
  columnIndex: integer("column_index"),
  target: text("target").notNull(),
  beforeName: text("before_name").notNull(),
  afterName: text("after_name").notNull(),
  action: text("action").notNull(),
  reason: text("reason"),
  sourceAddress: text("source_address"),
  blocking: integer("blocking", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const nameFixBackups = sqliteTable("name_fix_backups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id").notNull(),
  fileId: integer("file_id").notNull(),
  sourcePath: text("source_path").notNull(),
  backupPath: text("backup_path").notNull(),
  backupHash: text("backup_hash").notNull(),
  restorable: integer("restorable", { mode: "boolean" }).notNull().default(true),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
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
export type CellSourceRef = z.infer<typeof cellSourceRefSchema>;
export type TableSourceRef = z.infer<typeof tableSourceRefSchema>;
export type NameFixMode = z.infer<typeof nameFixModeSchema>;
export type NameFixScope = z.infer<typeof nameFixScopeSchema>;
export type NameFixConflictStrategy = z.infer<typeof nameFixConflictStrategySchema>;
export type ReservedWordStrategy = z.infer<typeof reservedWordStrategySchema>;
export type LengthOverflowStrategy = z.infer<typeof lengthOverflowStrategySchema>;
export type NameFixPreviewRequest = z.infer<typeof nameFixPreviewRequestSchema>;
export type NameFixPreviewResponse = z.infer<typeof nameFixPreviewResponseSchema>;
export type NameFixApplyRequest = z.infer<typeof nameFixApplyRequestSchema>;
export type NameFixApplyResponse = z.infer<typeof nameFixApplyResponseSchema>;
export type NameFixRollbackRequest = z.infer<typeof nameFixRollbackRequestSchema>;
export type NameFixRollbackResponse = z.infer<typeof nameFixRollbackResponseSchema>;
export type NameFixConflict = z.infer<typeof nameFixConflictSchema>;
export type NameFixDecisionTrace = z.infer<typeof nameFixDecisionTraceSchema>;
export type NameFixColumnMapping = z.infer<typeof nameFixColumnMappingSchema>;
export type NameFixTableMapping = z.infer<typeof nameFixTableMappingSchema>;
export type NameFixJob = z.infer<typeof nameFixJobSchema>;
export type NameFixJobItem = z.infer<typeof nameFixJobItemSchema>;
export type NameFixBackup = z.infer<typeof nameFixBackupSchema>;
