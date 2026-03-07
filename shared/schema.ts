import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { APP_DEFAULTS, DEFAULT_DDL_SETTINGS_VALUES } from "./config";

// SQLite テーブル定義（Electron デスクトップ版用）
export const uploadedFiles = sqliteTable(
  "uploaded_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    filePath: text("file_path").notNull(),
    originalName: text("original_name").notNull(),
    originalModifiedAt: text("original_modified_at"),
    fileHash: text("file_hash").notNull(),
    fileSize: integer("file_size").notNull(),
    uploadedAt: text("uploaded_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    fileHashUniqueIndex: uniqueIndex("uploaded_files_file_hash_unique").on(table.fileHash),
  }),
);

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({ id: true, uploadedAt: true });
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;

// DDL Settings table
export const ddlSettings = sqliteTable("ddl_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mysqlEngine: text("mysql_engine").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.mysqlEngine),
  mysqlCharset: text("mysql_charset").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.mysqlCharset),
  mysqlCollate: text("mysql_collate").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.mysqlCollate),
  varcharCharset: text("varchar_charset").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.varcharCharset),
  varcharCollate: text("varchar_collate").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.varcharCollate),
  exportFilenamePrefix: text("export_filename_prefix").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.exportFilenamePrefix),
  exportFilenameSuffix: text("export_filename_suffix").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.exportFilenameSuffix),
  includeCommentHeader: integer("include_comment_header", { mode: "boolean" }).notNull().default(DEFAULT_DDL_SETTINGS_VALUES.includeCommentHeader),
  authorName: text("author_name").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.authorName),
  includeSetNames: integer("include_set_names", { mode: "boolean" }).notNull().default(DEFAULT_DDL_SETTINGS_VALUES.includeSetNames),
  includeDropTable: integer("include_drop_table", { mode: "boolean" }).notNull().default(DEFAULT_DDL_SETTINGS_VALUES.includeDropTable),
  downloadPath: text("download_path"),
  excelReadPath: text("excel_read_path"),
  customHeaderTemplate: text("custom_header_template"),
  useCustomHeader: integer("use_custom_header", { mode: "boolean" }).notNull().default(DEFAULT_DDL_SETTINGS_VALUES.useCustomHeader),
  mysqlDataTypeCase: text("mysql_data_type_case").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.mysqlDataTypeCase),
  mysqlBooleanMode: text("mysql_boolean_mode").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.mysqlBooleanMode),
  pkMarkers: text("pk_markers").notNull().default(JSON.stringify(APP_DEFAULTS.excel.pkMarkers)),
  maxConsecutiveEmptyRows: integer("max_consecutive_empty_rows").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.maxConsecutiveEmptyRows),
  uploadRateLimitWindowMs: integer("upload_rate_limit_window_ms").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.uploadRateLimitWindowMs),
  uploadRateLimitMaxRequests: integer("upload_rate_limit_max_requests").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.uploadRateLimitMaxRequests),
  parseRateLimitWindowMs: integer("parse_rate_limit_window_ms").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.parseRateLimitWindowMs),
  parseRateLimitMaxRequests: integer("parse_rate_limit_max_requests").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.parseRateLimitMaxRequests),
  globalProtectRateLimitWindowMs: integer("global_protect_rate_limit_window_ms").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.globalProtectRateLimitWindowMs),
  globalProtectRateLimitMaxRequests: integer("global_protect_rate_limit_max_requests").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.globalProtectRateLimitMaxRequests),
  globalProtectMaxInFlight: integer("global_protect_max_inflight").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.globalProtectMaxInFlight),
  prewarmEnabled: integer("prewarm_enabled", { mode: "boolean" }).notNull().default(DEFAULT_DDL_SETTINGS_VALUES.prewarmEnabled),
  prewarmMaxConcurrency: integer("prewarm_max_concurrency").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.prewarmMaxConcurrency),
  prewarmQueueMax: integer("prewarm_queue_max").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.prewarmQueueMax),
  prewarmMaxFileMb: integer("prewarm_max_file_mb").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.prewarmMaxFileMb),
  taskManagerMaxQueueLength: integer("task_manager_max_queue_length").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.taskManagerMaxQueueLength),
  taskManagerStalePendingMs: integer("task_manager_stale_pending_ms").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.taskManagerStalePendingMs),
  nameFixDefaultMode: text("name_fix_default_mode").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.nameFixDefaultMode),
  nameFixConflictStrategy: text("name_fix_conflict_strategy").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.nameFixConflictStrategy),
  nameFixReservedWordStrategy: text("name_fix_reserved_word_strategy").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.nameFixReservedWordStrategy),
  nameFixLengthOverflowStrategy: text("name_fix_length_overflow_strategy").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.nameFixLengthOverflowStrategy),
  nameFixMaxIdentifierLength: integer("name_fix_max_identifier_length").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.nameFixMaxIdentifierLength),
  nameFixBackupRetentionDays: integer("name_fix_backup_retention_days").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.nameFixBackupRetentionDays),
  nameFixMaxBatchConcurrency: integer("name_fix_max_batch_concurrency").notNull().default(DEFAULT_DDL_SETTINGS_VALUES.nameFixMaxBatchConcurrency),
  allowOverwriteInElectron: integer("allow_overwrite_in_electron", { mode: "boolean" }).notNull().default(DEFAULT_DDL_SETTINGS_VALUES.allowOverwriteInElectron),
  allowExternalPathWrite: integer("allow_external_path_write", { mode: "boolean" }).notNull().default(DEFAULT_DDL_SETTINGS_VALUES.allowExternalPathWrite),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const ddlSettingsSchema = z.object({
  mysqlEngine: z.string().default(DEFAULT_DDL_SETTINGS_VALUES.mysqlEngine),
  mysqlCharset: z.string().default(DEFAULT_DDL_SETTINGS_VALUES.mysqlCharset),
  mysqlCollate: z.string().default(DEFAULT_DDL_SETTINGS_VALUES.mysqlCollate),
  varcharCharset: z.string().default(DEFAULT_DDL_SETTINGS_VALUES.varcharCharset),
  varcharCollate: z.string().default(DEFAULT_DDL_SETTINGS_VALUES.varcharCollate),
  exportFilenamePrefix: z.string().default(DEFAULT_DDL_SETTINGS_VALUES.exportFilenamePrefix),
  exportFilenameSuffix: z.string().default(DEFAULT_DDL_SETTINGS_VALUES.exportFilenameSuffix),
  includeCommentHeader: z.boolean().default(DEFAULT_DDL_SETTINGS_VALUES.includeCommentHeader),
  authorName: z.string().default(DEFAULT_DDL_SETTINGS_VALUES.authorName),
  includeSetNames: z.boolean().default(DEFAULT_DDL_SETTINGS_VALUES.includeSetNames),
  includeDropTable: z.boolean().default(DEFAULT_DDL_SETTINGS_VALUES.includeDropTable),
  downloadPath: z.string().optional(),
  excelReadPath: z.string().optional(),
  customHeaderTemplate: z.string().optional(),
  useCustomHeader: z.boolean().default(DEFAULT_DDL_SETTINGS_VALUES.useCustomHeader),
  mysqlDataTypeCase: z.enum(["lower", "upper"]).default(DEFAULT_DDL_SETTINGS_VALUES.mysqlDataTypeCase),
  mysqlBooleanMode: z
    .enum(["tinyint(1)", "boolean"])
    .default(DEFAULT_DDL_SETTINGS_VALUES.mysqlBooleanMode),
  pkMarkers: z.array(z.string().min(1)).default([...APP_DEFAULTS.excel.pkMarkers]),
  maxConsecutiveEmptyRows: z.number().int().min(1).max(100).default(APP_DEFAULTS.excel.maxConsecutiveEmptyRows),
  uploadRateLimitWindowMs: z.number().int().min(1000).max(300000).default(APP_DEFAULTS.rateLimit.uploadWindowMs),
  uploadRateLimitMaxRequests: z.number().int().min(1).max(500).default(APP_DEFAULTS.rateLimit.uploadMaxRequests),
  parseRateLimitWindowMs: z.number().int().min(1000).max(300000).default(APP_DEFAULTS.rateLimit.parseWindowMs),
  parseRateLimitMaxRequests: z.number().int().min(1).max(1000).default(APP_DEFAULTS.rateLimit.parseMaxRequests),
  globalProtectRateLimitWindowMs: z.number().int().min(1000).max(300000).default(APP_DEFAULTS.rateLimit.globalProtectWindowMs),
  globalProtectRateLimitMaxRequests: z.number().int().min(10).max(5000).default(APP_DEFAULTS.rateLimit.globalProtectMaxRequests),
  globalProtectMaxInFlight: z.number().int().min(1).max(500).default(APP_DEFAULTS.rateLimit.globalProtectMaxInFlight),
  prewarmEnabled: z.boolean().default(APP_DEFAULTS.prewarm.enabled),
  prewarmMaxConcurrency: z.number().int().min(1).max(8).default(APP_DEFAULTS.prewarm.maxConcurrency),
  prewarmQueueMax: z.number().int().min(1).max(100).default(APP_DEFAULTS.prewarm.queueMax),
  prewarmMaxFileMb: z.number().int().min(1).max(100).default(APP_DEFAULTS.prewarm.maxFileMb),
  taskManagerMaxQueueLength: z.number().int().min(10).max(1000).default(APP_DEFAULTS.taskManager.maxQueueLength),
  taskManagerStalePendingMs: z.number().int().min(60000).max(3600000).default(APP_DEFAULTS.taskManager.stalePendingMs),
  nameFixDefaultMode: z.enum(["copy", "overwrite", "replace_download"]).default(APP_DEFAULTS.nameFix.defaultMode),
  nameFixConflictStrategy: z.enum(["suffix_increment", "hash_suffix", "abort"]).default(APP_DEFAULTS.nameFix.conflictStrategy),
  nameFixReservedWordStrategy: z.enum(["prefix", "abort"]).default(APP_DEFAULTS.nameFix.reservedWordStrategy),
  nameFixLengthOverflowStrategy: z.enum(["truncate_hash", "abort"]).default(APP_DEFAULTS.nameFix.lengthOverflowStrategy),
  nameFixMaxIdentifierLength: z.number().int().min(8).max(255).default(APP_DEFAULTS.nameFix.maxIdentifierLength),
  nameFixBackupRetentionDays: z.number().int().min(1).max(365).default(APP_DEFAULTS.nameFix.backupRetentionDays),
  nameFixMaxBatchConcurrency: z.number().int().min(1).max(16).default(APP_DEFAULTS.nameFix.maxBatchConcurrency),
  allowOverwriteInElectron: z.boolean().default(APP_DEFAULTS.nameFix.allowOverwriteInElectron),
  allowExternalPathWrite: z.boolean().default(APP_DEFAULTS.nameFix.allowExternalPathWrite),
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

export const schemaDiffScopeSchema = z.enum(["current_sheet", "all_sheets"]);
export const schemaDiffSelectionModeSchema = z.enum(["auto", "manual"]);
export const schemaDiffEntityTypeSchema = z.enum(["table", "column"]);
export const schemaDiffDecisionSchema = z.enum(["pending", "accept", "reject"]);

export const schemaDiffThresholdsSchema = z.object({
  baselineAutoSelectMin: z.number().min(0).max(1).default(0.65),
  tableMatchStrong: z.number().min(0).max(1).default(0.8),
  tableRenameCandidate: z.number().min(0).max(1).default(0.65),
  columnMatchStrong: z.number().min(0).max(1).default(0.8),
  columnRenameCandidate: z.number().min(0).max(1).default(0.65),
  ambiguityGap: z.number().min(0).max(1).default(0.08),
});

export const schemaDiffScoreBreakdownSchema = z.object({
  fileName: z.number().min(0).max(1),
  uploadedAt: z.number().min(0).max(1),
  content: z.number().min(0).max(1),
});

export const schemaDiffVersionLinkSchema = z.object({
  newFileId: z.number().int().positive(),
  oldFileId: z.number().int().positive(),
  mode: schemaDiffSelectionModeSchema,
  confidence: z.number().min(0).max(1),
  lowConfidence: z.boolean().default(false),
  scoreBreakdown: schemaDiffScoreBreakdownSchema.optional(),
});

export const schemaDiffColumnChangeSchema = z.object({
  action: z.enum(["added", "removed", "modified", "rename_suggest", "renamed"]),
  confidence: z.number().min(0).max(1).optional(),
  requiresConfirmation: z.boolean().default(false),
  entityKey: z.string().optional(),
  oldColumn: columnInfoSchema.optional(),
  newColumn: columnInfoSchema.optional(),
  changedFields: z.array(z.string()).default([]),
});

export const schemaDiffTableChangeSchema = z.object({
  action: z.enum(["added", "removed", "changed", "rename_suggest", "renamed"]),
  confidence: z.number().min(0).max(1).optional(),
  requiresConfirmation: z.boolean().default(false),
  entityKey: z.string().optional(),
  oldTable: tableInfoSchema.optional(),
  newTable: tableInfoSchema.optional(),
  changedFields: z.array(z.string()).default([]),
  columnChanges: z.array(schemaDiffColumnChangeSchema).default([]),
});

export const schemaDiffSheetResultSchema = z.object({
  sheetName: z.string(),
  tableChanges: z.array(schemaDiffTableChangeSchema),
});

export const schemaDiffRenameSuggestionSchema = z.object({
  entityType: schemaDiffEntityTypeSchema,
  entityKey: z.string(),
  confidence: z.number().min(0).max(1),
  sheetName: z.string(),
  tableNameBefore: z.string().optional(),
  tableNameAfter: z.string().optional(),
  columnNameBefore: z.string().optional(),
  columnNameAfter: z.string().optional(),
  decision: schemaDiffDecisionSchema.default("pending"),
});

export const schemaDiffMcpHintsSchema = z.object({
  changedTables: z.array(
    z.object({
      sheetName: z.string(),
      action: z.string(),
      tableName: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
      requiresConfirmation: z.boolean().default(false),
    }),
  ),
  changedColumns: z.array(
    z.object({
      sheetName: z.string(),
      tableName: z.string().optional(),
      action: z.string(),
      columnName: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
      requiresConfirmation: z.boolean().default(false),
    }),
  ),
  impactKeywords: z.array(z.string()),
  nextActions: z.array(z.string()),
});

export const schemaDiffSummarySchema = z.object({
  addedTables: z.number().int().min(0),
  removedTables: z.number().int().min(0),
  changedTables: z.number().int().min(0),
  renameSuggestions: z.number().int().min(0),
  pendingConfirmations: z.number().int().min(0),
  addedColumns: z.number().int().min(0),
  removedColumns: z.number().int().min(0),
  changedColumns: z.number().int().min(0),
});

export const schemaDiffPreviewRequestSchema = z
  .object({
    newFileId: z.number().int().positive(),
    mode: schemaDiffSelectionModeSchema.default("auto"),
    oldFileId: z.number().int().positive().optional(),
    scope: schemaDiffScopeSchema.default("current_sheet"),
    sheetName: z.string().min(1).optional(),
    forceRecompute: z.boolean().default(false),
    thresholds: schemaDiffThresholdsSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "manual" && !value.oldFileId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["oldFileId"],
        message: "oldFileId is required when mode=manual",
      });
    }
    if (value.scope === "current_sheet" && !value.sheetName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sheetName"],
        message: "sheetName is required when scope=current_sheet",
      });
    }
  });

export const schemaDiffPreviewResponseSchema = z.object({
  diffId: z.string(),
  cacheHit: z.boolean(),
  algorithmVersion: z.string(),
  scope: schemaDiffScopeSchema,
  sheetName: z.string().optional(),
  link: schemaDiffVersionLinkSchema,
  summary: schemaDiffSummarySchema,
  sheets: z.array(schemaDiffSheetResultSchema),
  renameSuggestions: z.array(schemaDiffRenameSuggestionSchema),
  mcpHints: schemaDiffMcpHintsSchema,
});

export const schemaDiffRenameDecisionItemSchema = z.object({
  entityType: schemaDiffEntityTypeSchema,
  entityKey: z.string().min(1),
  decision: z.enum(["accept", "reject"]),
});

export const schemaDiffConfirmRequestSchema = z.object({
  diffId: z.string().min(8),
  decisions: z.array(schemaDiffRenameDecisionItemSchema).min(1),
});

export const schemaDiffConfirmResponseSchema = z.object({
  diffId: z.string(),
  summary: schemaDiffSummarySchema,
  sheets: z.array(schemaDiffSheetResultSchema),
  renameSuggestions: z.array(schemaDiffRenameSuggestionSchema),
});

export const schemaDiffAlterOutputModeSchema = z.enum(["single_table", "multi_table"]);
export const schemaDiffAlterPackagingSchema = z.enum(["single_file", "zip"]);

export const schemaDiffAlterPreviewRequestSchema = z.object({
  diffId: z.string().min(8),
  dialect: z.enum(["mysql", "oracle"]),
  outputMode: schemaDiffAlterOutputModeSchema.default("multi_table"),
  packaging: schemaDiffAlterPackagingSchema.default("single_file"),
  splitBySheet: z.boolean().default(false),
  includeUnconfirmed: z.boolean().default(false),
});

export const schemaDiffAlterArtifactSchema = z.object({
  artifactName: z.string(),
  sheetName: z.string().optional(),
  tableName: z.string().optional(),
  sql: z.string(),
});

export const schemaDiffAlterPreviewResponseSchema = z.object({
  diffId: z.string(),
  dialect: z.enum(["mysql", "oracle"]),
  packaging: schemaDiffAlterPackagingSchema,
  outputMode: schemaDiffAlterOutputModeSchema,
  splitBySheet: z.boolean(),
  artifacts: z.array(schemaDiffAlterArtifactSchema),
});

export const schemaDiffHistoryItemSchema = z.object({
  fileId: z.number().int().positive(),
  originalName: z.string(),
  uploadedAt: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  scoreBreakdown: schemaDiffScoreBreakdownSchema.optional(),
});

export const schemaDiffHistoryResponseSchema = z.object({
  newFileId: z.number().int().positive(),
  autoRecommendedOldFileId: z.number().int().positive().optional(),
  candidates: z.array(schemaDiffHistoryItemSchema),
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
  selectedTableIndexes: z.array(z.number().int().min(0)).optional(),
  conflictStrategy: nameFixConflictStrategySchema.default("suffix_increment"),
  reservedWordStrategy: reservedWordStrategySchema.default("prefix"),
  lengthOverflowStrategy: lengthOverflowStrategySchema.default("truncate_hash"),
  maxIdentifierLength: z
    .number()
    .int()
    .min(8)
    .max(255)
    .default(APP_DEFAULTS.nameFix.maxIdentifierLength),
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
  mode: nameFixModeSchema.default(APP_DEFAULTS.nameFix.defaultMode),
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

export const schemaSnapshots = sqliteTable(
  "schema_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fileId: integer("file_id").notNull(),
    fileHash: text("file_hash").notNull(),
    originalName: text("original_name").notNull(),
    uploadedAt: text("uploaded_at"),
    snapshotHash: text("snapshot_hash").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    snapshotHashUniqueIndex: uniqueIndex("schema_snapshots_hash_algo_unique").on(
      table.snapshotHash,
      table.algorithmVersion,
    ),
  }),
);

export const versionLinks = sqliteTable(
  "version_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    newFileId: integer("new_file_id").notNull(),
    oldFileId: integer("old_file_id").notNull(),
    selectionMode: text("selection_mode").notNull(),
    confidence: integer("confidence").notNull().default(0),
    scoreBreakdownJson: text("score_breakdown_json"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    versionPairUniqueIndex: uniqueIndex("version_links_pair_unique").on(table.newFileId, table.oldFileId),
  }),
);

export const schemaDiffs = sqliteTable(
  "schema_diffs",
  {
    id: text("id").primaryKey(),
    newSnapshotHash: text("new_snapshot_hash").notNull(),
    oldSnapshotHash: text("old_snapshot_hash").notNull(),
    scope: text("scope").notNull(),
    sheetName: text("sheet_name"),
    algorithmVersion: text("algorithm_version").notNull(),
    optionsHash: text("options_hash").notNull(),
    cacheKey: text("cache_key").notNull(),
    diffJson: text("diff_json").notNull(),
    alterPreviewJson: text("alter_preview_json"),
    hitCount: integer("hit_count").notNull().default(0),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    lastUsedAt: text("last_used_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    schemaDiffCacheUniqueIndex: uniqueIndex("schema_diffs_cache_key_unique").on(table.cacheKey),
  }),
);

export const diffRenameDecisions = sqliteTable(
  "diff_rename_decisions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    diffId: text("diff_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityKey: text("entity_key").notNull(),
    decision: text("decision").notNull().default("pending"),
    confidence: integer("confidence").notNull().default(0),
    userNote: text("user_note"),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    diffDecisionUniqueIndex: uniqueIndex("diff_rename_decisions_diff_entity_unique").on(
      table.diffId,
      table.entityKey,
    ),
  }),
);

export const processingTaskSchema = z.object({
  id: z.number(),
  fileId: z.number().optional(),
  taskType: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  progress: z.number().min(0).max(100),
  error: z.string().optional(),
  result: z.unknown().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const schemaSnapshotSchema = z.object({
  id: z.number().int(),
  fileId: z.number().int(),
  fileHash: z.string(),
  originalName: z.string(),
  uploadedAt: z.string().optional(),
  snapshotHash: z.string(),
  algorithmVersion: z.string(),
  snapshotJson: z.string(),
  createdAt: z.string().optional(),
});

export const versionLinkSchema = z.object({
  id: z.number().int(),
  newFileId: z.number().int(),
  oldFileId: z.number().int(),
  selectionMode: schemaDiffSelectionModeSchema,
  confidence: z.number().min(0).max(1),
  scoreBreakdownJson: z.string().optional(),
  createdAt: z.string().optional(),
});

export const schemaDiffSchema = z.object({
  id: z.string(),
  newSnapshotHash: z.string(),
  oldSnapshotHash: z.string(),
  scope: schemaDiffScopeSchema,
  sheetName: z.string().optional(),
  algorithmVersion: z.string(),
  optionsHash: z.string(),
  cacheKey: z.string(),
  diffJson: z.string(),
  alterPreviewJson: z.string().optional(),
  hitCount: z.number().int().min(0),
  createdAt: z.string().optional(),
  lastUsedAt: z.string().optional(),
});

export const diffRenameDecisionSchema = z.object({
  id: z.number().int(),
  diffId: z.string(),
  entityType: schemaDiffEntityTypeSchema,
  entityKey: z.string(),
  decision: schemaDiffDecisionSchema,
  confidence: z.number().min(0).max(1),
  userNote: z.string().optional(),
  updatedAt: z.string().optional(),
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
export type SchemaDiffScope = z.infer<typeof schemaDiffScopeSchema>;
export type SchemaDiffSelectionMode = z.infer<typeof schemaDiffSelectionModeSchema>;
export type SchemaDiffThresholds = z.infer<typeof schemaDiffThresholdsSchema>;
export type SchemaDiffSummary = z.infer<typeof schemaDiffSummarySchema>;
export type SchemaDiffRenameSuggestion = z.infer<typeof schemaDiffRenameSuggestionSchema>;
export type SchemaDiffColumnChange = z.infer<typeof schemaDiffColumnChangeSchema>;
export type SchemaDiffTableChange = z.infer<typeof schemaDiffTableChangeSchema>;
export type SchemaDiffPreviewRequest = z.infer<typeof schemaDiffPreviewRequestSchema>;
export type SchemaDiffPreviewResponse = z.infer<typeof schemaDiffPreviewResponseSchema>;
export type SchemaDiffConfirmRequest = z.infer<typeof schemaDiffConfirmRequestSchema>;
export type SchemaDiffConfirmResponse = z.infer<typeof schemaDiffConfirmResponseSchema>;
export type SchemaDiffAlterPreviewRequest = z.infer<typeof schemaDiffAlterPreviewRequestSchema>;
export type SchemaDiffAlterPreviewResponse = z.infer<typeof schemaDiffAlterPreviewResponseSchema>;
export type SchemaDiffHistoryResponse = z.infer<typeof schemaDiffHistoryResponseSchema>;
export type SchemaSnapshot = z.infer<typeof schemaSnapshotSchema>;
export type VersionLink = z.infer<typeof versionLinkSchema>;
export type SchemaDiff = z.infer<typeof schemaDiffSchema>;
export type DiffRenameDecision = z.infer<typeof diffRenameDecisionSchema>;
