import { z } from "zod";
import { APP_DEFAULTS, DEFAULT_DDL_SETTINGS_VALUES } from "./config";

export type UploadedFile = {
  id: number;
  filePath: string;
  originalName: string;
  originalModifiedAt: string | null;
  fileHash: string;
  fileSize: number;
  uploadedAt: string | null;
};

export const uploadedFileRecordSchema = z.object({
  id: z.number().int().positive(),
  filePath: z.string().min(1),
  originalName: z.string().min(1),
  originalModifiedAt: z.string().optional().nullable(),
  fileHash: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  uploadedAt: z.string().optional().nullable(),
});

export const workbookTemplateVariantIdSchema = z.enum([
  "format-a-table-sheet",
  "format-b-multi-table-sheet",
]);

export const workbookTemplateLayoutSchema = z.enum([
  "table_per_sheet",
  "multi_table_per_sheet",
]);

export const workbookTemplateVariantSchema = z.object({
  id: workbookTemplateVariantIdSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  parserFormat: z.enum(["A", "B"]),
  layout: workbookTemplateLayoutSchema,
  seedAssetName: z.string().min(1),
  suggestedFileName: z.string().min(1),
  starterSheetName: z.string().min(1),
});

export const workbookTemplateValidationSchema = z.object({
  parserFormat: z.enum(["A", "B", "UNKNOWN"]),
  expectedParserFormat: z.enum(["A", "B"]),
  recognized: z.boolean(),
  workbookSheetCount: z.number().int().positive(),
  checkedSheetName: z.string().min(1),
  reasons: z.array(z.string()).default([]),
});

export const createWorkbookFromTemplateRequestSchema = z.object({
  templateId: workbookTemplateVariantIdSchema,
  originalName: z
    .string()
    .min(1)
    .max(255)
    .optional(),
});

export const createWorkbookFromTemplateResponseSchema = z.object({
  file: uploadedFileRecordSchema,
  template: workbookTemplateVariantSchema,
  validation: workbookTemplateValidationSchema,
});

export const ddlSettingsSchema = z.object({
  statusBarItems: z.array(z.enum(["activity", "memory"])).default([...DEFAULT_DDL_SETTINGS_VALUES.statusBarItems]),
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
  hideSheetsWithoutDefinitions: z.boolean().default(DEFAULT_DDL_SETTINGS_VALUES.hideSheetsWithoutDefinitions),
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
  ddlImportTemplatePreference: workbookTemplateVariantIdSchema.optional(),
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

export const ddlImportDialectSchema = z.enum(["mysql", "oracle"]);
export const ddlImportSourceModeSchema = z.enum([
  "mysql-paste",
  "mysql-file",
  "mysql-bundle",
  "oracle-paste",
  "oracle-file",
]);
export const ddlImportIssueSeveritySchema = z.enum(["blocking", "confirm", "info"]);
export const ddlImportIssueKindSchema = z.enum([
  "parser_error",
  "parser_unsupported",
  "workbook_inexpressible",
  "workbook_lossy",
  "info",
]);

export const ddlImportDefaultValueSchema = z.object({
  type: z.enum(["number", "string", "boolean", "expression"]),
  value: z.string().min(1),
});

export const ddlImportColumnSchema = z.object({
  entityKey: z.string().min(1),
  name: z.string().min(1),
  dataType: z.string().min(1),
  dataTypeArgs: z.string().optional(),
  columnType: z.string().min(1),
  nullable: z.boolean(),
  defaultValue: ddlImportDefaultValueSchema.optional(),
  autoIncrement: z.boolean().default(false),
  primaryKey: z.boolean().default(false),
  unique: z.boolean().default(false),
  comment: z.string().optional(),
});

export const ddlImportIndexColumnSchema = z.object({
  columnName: z.string().min(1),
  expression: z.string().optional(),
  order: z.enum(["ASC", "DESC"]).optional(),
});

export const ddlImportIndexSchema = z.object({
  entityKey: z.string().min(1),
  name: z.string().min(1),
  unique: z.boolean().default(false),
  primary: z.boolean().default(false),
  indexType: z.string().optional(),
  comment: z.string().optional(),
  columns: z.array(ddlImportIndexColumnSchema).min(1),
});

export const ddlImportForeignKeyColumnSchema = z.object({
  columnName: z.string().min(1),
  referencedColumnName: z.string().min(1),
});

export const ddlImportForeignKeySchema = z.object({
  entityKey: z.string().min(1),
  name: z.string().min(1),
  referencedTableName: z.string().min(1),
  referencedTableSchema: z.string().optional(),
  onDelete: z.string().optional(),
  onUpdate: z.string().optional(),
  columns: z.array(ddlImportForeignKeyColumnSchema).min(1),
});

export const ddlImportTableSchema = z.object({
  entityKey: z.string().min(1),
  name: z.string().min(1),
  comment: z.string().optional(),
  engine: z.string().optional(),
  columns: z.array(ddlImportColumnSchema).default([]),
  indexes: z.array(ddlImportIndexSchema).default([]),
  foreignKeys: z.array(ddlImportForeignKeySchema).default([]),
});

export const ddlImportCatalogSchema = z.object({
  sourceMode: ddlImportSourceModeSchema,
  dialect: ddlImportDialectSchema,
  databaseName: z.string().min(1).default("ddl_import"),
  tables: z.array(ddlImportTableSchema).default([]),
});

export const ddlImportIssueSchema = z.object({
  severity: ddlImportIssueSeveritySchema,
  kind: ddlImportIssueKindSchema,
  entityKey: z.string().min(1),
  tableName: z.string().optional(),
  columnName: z.string().optional(),
  constraintName: z.string().optional(),
  message: z.string().min(1),
  detail: z.string().optional(),
});

export const ddlImportIssueSummarySchema = z.object({
  blockingCount: z.number().int().min(0).default(0),
  confirmCount: z.number().int().min(0).default(0),
  infoCount: z.number().int().min(0).default(0),
});

export const ddlImportPreviewRequestSchema = z
  .object({
    sourceMode: ddlImportSourceModeSchema.default("mysql-paste"),
    sqlText: z.string().min(1),
    fileName: z.string().min(1).max(255).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.sqlText.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sqlText"],
        message: "sqlText is required",
      });
    }
  });

export const ddlImportPreviewResponseSchema = z.object({
  sourceMode: ddlImportSourceModeSchema,
  dialect: ddlImportDialectSchema,
  fileName: z.string().optional(),
  sourceSql: z.string().min(1),
  catalog: ddlImportCatalogSchema,
  issues: z.array(ddlImportIssueSchema).default([]),
  issueSummary: ddlImportIssueSummarySchema,
  selectableTableNames: z.array(z.string().min(1)).default([]),
  rememberedTemplateId: workbookTemplateVariantIdSchema.optional(),
});

export const ddlImportExportRequestSchema = z
  .object({
    sourceMode: ddlImportSourceModeSchema.default("mysql-paste"),
    sqlText: z.string().min(1),
    fileName: z.string().min(1).max(255).optional(),
    templateId: workbookTemplateVariantIdSchema,
    selectedTableNames: z.array(z.string().min(1)).min(1),
    allowLossyExport: z.boolean().default(false),
    originalName: z.string().min(1).max(255).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.sqlText.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sqlText"],
        message: "sqlText is required",
      });
    }
  });

export const ddlImportExportResponseSchema = z.object({
  file: uploadedFileRecordSchema,
  template: workbookTemplateVariantSchema,
  validation: workbookTemplateValidationSchema,
  sourceMode: ddlImportSourceModeSchema,
  dialect: ddlImportDialectSchema,
  selectedTableNames: z.array(z.string().min(1)).default([]),
  issueSummary: ddlImportIssueSummarySchema,
  rememberedTemplateId: workbookTemplateVariantIdSchema.optional(),
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

export type ColumnInfo = z.infer<typeof columnInfoSchema>;
export type CodeValueOption = z.infer<typeof codeValueOptionSchema>;
export type CodeReference = z.infer<typeof codeReferenceSchema>;
export type TableInfo = z.infer<typeof tableInfoSchema>;
export type GenerateDdlRequest = z.infer<typeof generateDdlRequestSchema>;
export type ExportZipRequest = z.infer<typeof exportZipRequestSchema>;
export type DdlImportPreviewRequest = z.infer<typeof ddlImportPreviewRequestSchema>;
export type DdlImportPreviewResponse = z.infer<typeof ddlImportPreviewResponseSchema>;
export type DdlImportExportRequest = z.infer<typeof ddlImportExportRequestSchema>;
export type DdlImportExportResponse = z.infer<typeof ddlImportExportResponseSchema>;
export type DdlImportSourceMode = z.infer<typeof ddlImportSourceModeSchema>;
export type DdlImportDialect = z.infer<typeof ddlImportDialectSchema>;
export type DdlImportCatalog = z.infer<typeof ddlImportCatalogSchema>;
export type DdlImportIssue = z.infer<typeof ddlImportIssueSchema>;
export type DdlImportIssueSummary = z.infer<typeof ddlImportIssueSummarySchema>;
export type DdlImportDefaultValue = z.infer<typeof ddlImportDefaultValueSchema>;
export type DdlImportTable = z.infer<typeof ddlImportTableSchema>;
export type DdlImportColumn = z.infer<typeof ddlImportColumnSchema>;
export type DdlImportIndex = z.infer<typeof ddlImportIndexSchema>;
export type DdlImportForeignKey = z.infer<typeof ddlImportForeignKeySchema>;

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
export type TableReferenceOverride = z.infer<typeof tableReferenceOverrideSchema>;
export type GenerateDdlByReferenceRequest = z.infer<typeof generateDdlByReferenceRequestSchema>;
export type ExportZipByReferenceRequest = z.infer<typeof exportZipByReferenceRequestSchema>;
export type UploadedFileRecord = z.infer<typeof uploadedFileRecordSchema>;
export type WorkbookTemplateVariantId = z.infer<typeof workbookTemplateVariantIdSchema>;
export type WorkbookTemplateLayout = z.infer<typeof workbookTemplateLayoutSchema>;
export type WorkbookTemplateVariant = z.infer<typeof workbookTemplateVariantSchema>;
export type WorkbookTemplateValidation = z.infer<typeof workbookTemplateValidationSchema>;
export type CreateWorkbookFromTemplateRequest = z.infer<typeof createWorkbookFromTemplateRequestSchema>;
export type CreateWorkbookFromTemplateResponse = z.infer<typeof createWorkbookFromTemplateResponseSchema>;
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
export type NameFixConflict = z.infer<typeof nameFixConflictSchema>;
export type NameFixDecisionTrace = z.infer<typeof nameFixDecisionTraceSchema>;
export type NameFixColumnMapping = z.infer<typeof nameFixColumnMappingSchema>;
export type NameFixTableMapping = z.infer<typeof nameFixTableMappingSchema>;
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

// ──────────────────────────────────────────────
// 内蔵拡張機能 (Builtin Extensions) 型定義
// Rust 側の BuiltinExtensionManifest と対応する
// ──────────────────────────────────────────────

/** 内蔵拡張のカテゴリ種別 */
export type BuiltinExtensionCategory = "Transformer" | "DbConnector";

/** 内蔵拡張のマニフェスト情報 */
export interface BuiltinExtensionManifest {
  id: string;
  name: string;
  description: string;
  category: BuiltinExtensionCategory;
  /** 対応する入力フォーマット一覧（例: ["xlsx"]） */
  inputFormats: string[];
  /** 対応する出力フォーマット一覧（例: ["java", "ts"]） */
  outputFormats: string[];
}

// ──────────────────────────────────────────────
// 列挙型生成リクエスト / レスポンス型定義
// ──────────────────────────────────────────────

/** 列挙定数の1エントリ */
export interface EnumConstant {
  name: string;
  value: string;
  /** 日本語ラベル（省略可） */
  label?: string;
}

/** 1つの列挙クラス情報 */
export interface EnumClass {
  className: string;
  constants: EnumConstant[];
}

/** Excel シートから自動検出したカラム位置情報 */
export interface DetectedColumns {
  classCol: number;
  nameCol: number;
  valueCol: number;
  /** ラベル列（省略可） */
  labelCol?: number;
  headerRow: number;
}

/** enum_gen_preview コマンドのレスポンス */
export interface EnumGenPreviewResponse {
  enums: EnumClass[];
  /** 生成されたコード文字列 */
  code: string;
  /** パース時の警告メッセージ一覧 */
  warnings: string[];
  detectedColumns: DetectedColumns;
}

/** enum_gen_preview / enum_gen_export コマンドのリクエスト */
export interface EnumGenRequest {
  fileId: number;
  sheetName: string;
  /** 生成対象言語 */
  targetLang: "java" | "typescript";
  /** Java パッケージ名（targetLang === "java" の場合のみ有効） */
  packageName?: string;
}

/** enum_gen_export コマンドのレスポンス */
export interface BinaryCommandResult {
  base64: string;
  fileName: string;
  mimeType: string;
  successCount: number;
  skippedCount: number;
  skippedTables: string[];
}

// ──────────────────────────────────────────────
// DB 接続管理 型定義
// ──────────────────────────────────────────────

export type DbDriver = "mysql" | "postgres";

/** 接続環境ラベル（dev / test / prod） */
export type DbEnvironment = "dev" | "test" | "prod";

export interface DbConnectionConfig {
  id: string;
  name: string;
  driver: DbDriver;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  /** 環境ラベル（dev / test / prod）— 省略時は未分類 */
  environment?: DbEnvironment;
  /** 読み取り専用モード — true の場合 DML/DDL 実行を Rust 側でブロック */
  readonly?: boolean;
  /** ワークベンチヘッダーに表示する色タグ（CSSカラー文字列） */
  colorTag?: string;
  /** デフォルトスキーマ（接続後に自動的に USE する DB 名） */
  defaultSchema?: string;
}

export interface DbColumnSchema {
  name: string;
  dataType: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string;
  comment?: string;
}

export interface DbIndexSchema {
  name: string;
  columns: string[];
  unique: boolean;
  primary?: boolean;
}

export interface DbForeignKeySchema {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
}

export interface DbTableSchema {
  name: string;
  comment?: string;
  columns: DbColumnSchema[];
  indexes?: DbIndexSchema[];
  foreignKeys?: DbForeignKeySchema[];
}

export interface DbViewSchema {
  name: string;
  comment?: string;
  columns: DbColumnSchema[];
}

export interface DbSchemaSnapshot {
  connectionId: string;
  connectionName: string;
  database: string;
  schema: string;
  tables: DbTableSchema[];
  views: DbViewSchema[];
}

export interface DbColumnDiff {
  columnName: string;
  changeType: "added" | "removed" | "modified";
  before?: DbColumnSchema;
  after?: DbColumnSchema;
}

export interface DbTableDiff {
  tableName: string;
  changeType: "added" | "removed" | "modified";
  columnDiffs: DbColumnDiff[];
}

export interface DbSchemaDiffResult {
  sourceLabel: string;
  targetLabel: string;
  tableDiffs: DbTableDiff[];
  addedTables: number;
  removedTables: number;
  modifiedTables: number;
  unchangedTables: number;
}

// ──────────────────────────────────────────────
// Phase 1 クエリ実行 / EXPLAIN 型定義
// ──────────────────────────────────────────────

/**
 * 危険な SQL 分類
 * Rust の detect_dangerous_sql が返すカテゴリと 1:1 対応
 */
export type DangerClass =
  | "DROP"
  | "TRUNCATE"
  | "ALTER_TABLE"
  | "ALTER_DATABASE"
  | "DELETE_WITHOUT_WHERE"
  | "UPDATE_WITHOUT_WHERE";

/**
 * クエリ実行リクエスト
 * confirmed フィールドはサーバー側の安全性強制に使用される:
 * 危険な SQL が検出され confirmed が false / 未指定の場合、Rust 側で実行を拒否する
 */
export interface QueryExecutionRequest {
  connectionId: string;
  sql: string;
  requestId: string;
  /** 実行時のスキーマコンテキスト（未指定時は接続既定） */
  schema?: string;
  /** 1回のフェッチで取得する最大行数（デフォルト 1000） */
  limit?: number;
  offset?: number;
  /** エラー発生時に後続ステートメントを継続するか（デフォルト false = 停止） */
  continueOnError?: boolean;
  /**
   * 危険な SQL 確認済みフラグ（サーバー側安全ゲート）
   * フロントエンドの確認ダイアログで OK を押した後に true をセットする
   */
  confirmed?: boolean;
}

/** クエリ結果のカラム情報 */
export interface DbQueryColumn {
  name: string;
  dataType: string;
  sourceTable?: string;
  sourceSchema?: string;
  sourceColumn?: string;
  isPrimaryKey?: boolean;
}

/** クエリ結果の1行 */
export interface DbQueryRow {
  values: (string | number | boolean | null)[];
}

export type DbGridEditSourceKind =
  | "table-open"
  | "starter-select"
  | "starter-columns"
  | "starter-count"
  | "custom-sql";

export interface DbGridEditSource {
  kind: DbGridEditSourceKind;
  tableName?: string;
  schema?: string;
  queryMode?: "select" | "count" | "columns";
}

export interface DbGridEditEligibilityReason {
  code:
    | "readonly_connection"
    | "unsupported_source"
    | "count_result"
    | "missing_primary_key"
    | "missing_primary_key_column"
    | "duplicate_primary_key_tuple"
    | "empty_result"
    | "result_error"
    | "table_not_found";
  message: string;
}

export interface DbGridEditEligibility {
  eligible: boolean;
  reasons: DbGridEditEligibilityReason[];
}

export interface DbGridEditPatchCell {
  rowPrimaryKey: Record<string, string | number | boolean | null>;
  rowPkTuple: string;
  columnName: string;
  beforeValue: string | number | boolean | null;
  nextValue: string | number | boolean | null;
}

export interface DbGridPrepareCommitRequest {
  connectionId: string;
  schema?: string;
  tableName: string;
  source: DbGridEditSource;
  primaryKeyColumns: string[];
  patchCells: DbGridEditPatchCell[];
}

export interface DbGridPrepareCommitResponse {
  planId: string;
  planHash: string;
  affectedRows: number;
  changedColumnsSummary: string[];
  sqlPreviewLines: string[];
  previewTruncated: boolean;
}

export interface DbGridCommitRequest {
  connectionId: string;
  planId: string;
  planHash: string;
}

export interface DbGridCommitResponse {
  planId: string;
  planHash: string;
  committedRows: number;
  failedSqlIndex?: number;
  failedRowPkTuple?: string;
  message?: string;
}

/**
 * 1ステートメント分の実行結果バッチ
 * マルチステートメント実行では statements の数だけ生成される
 */
export interface DbQueryBatchResult {
  sql: string;
  columns: DbQueryColumn[];
  rows: DbQueryRow[];
  /**
   * 総件数が確定しない実行モードでは null。
   * UI は hasMore / pagingMode / pagingReason と併せて表示判断する。
   */
  totalRows: number | null;
  returnedRows: number;
  hasMore: boolean;
  pagingMode: "offset" | "none" | "unsupported";
  pagingReason?: string;
  nextOffset?: number;
  schema?: string;
  editEligibility?: DbGridEditEligibility;
  editSource?: DbGridEditSource;
  primaryKeyColumns?: string[];
  elapsedMs: number;
  affectedRows?: number;
  error?: string;
}

/** クエリ実行レスポンス（マルチステートメント対応） */
export interface QueryExecutionResponse {
  batches: DbQueryBatchResult[];
  requestId: string;
}

/**
 * "Load more" ページネーションリクエスト
 * フロントエンドが現在の rows.length を offset として送信し、次ページを取得する
 */
export interface FetchMoreRequest {
  requestId: string;
  batchIndex: number;
  sql: string;
  connectionId: string;
  schema?: string;
  offset: number;
  limit: number;
}

/** EXPLAIN プランの1ノード（再帰構造） */
export interface PlanNode {
  id: string;
  label: string;
  nodeType: string;
  relationName?: string;
  cost?: number;
  rows?: number;
  children: PlanNode[];
  /** 警告タグ: "FULL_TABLE_SCAN" | "LARGE_ROWS_ESTIMATE" など */
  warnings: string[];
}

/** Rust 側で正規化済みの EXPLAIN プラン */
export interface DbExplainPlan {
  dialect: DbDriver;
  root: PlanNode;
  rawJson: string;
}

/** 危険な SQL の事前プレビュー情報 */
export interface DangerousSqlPreview {
  dangers: DangerClass[];
  sql: string;
  connectionName: string;
  environment: DbEnvironment;
  database: string;
}

/** 結果行エクスポートリクエスト */
export interface ExportRowsRequest {
  connectionId: string;
  requestId: string;
  sql: string;
  schema?: string;
  format: "json" | "csv" | "markdown" | "sql-insert";
  scope: "current_page" | "loaded_rows" | "full_result";
  batchIndex?: number;
  loadedRows?: DbQueryRow[];
  columns?: DbQueryColumn[];
  maxRows?: number;
}

/** EXPLAIN 実行リクエスト */
export interface ExplainRequest {
  connectionId: string;
  sql: string;
  schema?: string;
}

/** ランタイム export コマンドのレスポンス契約 */
export type ExportRowsResponse = BinaryCommandResult;

/** 接続で利用可能なスキーマ一覧レスポンス契約 */
export type DbSchemaListResponse = string[];
