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
  ddlImportTemplatePreference: text("ddl_import_template_preference"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const EXTENSION_HOST_API_VERSION = 1 as const;
export const DB_MANAGEMENT_EXTENSION_ID = "db-management" as const;
export const OFFICIAL_EXTENSION_PUBLISHER = "SevenThRe" as const;
export const OFFICIAL_EXTENSION_GITHUB_OWNER = "SevenThRe" as const;
export const OFFICIAL_EXTENSION_GITHUB_REPO = "Db-Schema-Ddl" as const;
export const OFFICIAL_EXTENSION_RELEASES_URL = `https://github.com/${OFFICIAL_EXTENSION_GITHUB_OWNER}/${OFFICIAL_EXTENSION_GITHUB_REPO}/releases`;
export const OFFICIAL_EXTENSION_MANIFEST_ASSET_NAME = "db-management-extension-manifest.json" as const;

export const installedExtensions = sqliteTable(
  "installed_extensions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    extensionId: text("extension_id").notNull(),
    version: text("version").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    installPath: text("install_path").notNull(),
    manifestJson: text("manifest_json"),
    minAppVersion: text("min_app_version"),
    hostApiVersion: integer("host_api_version").notNull().default(EXTENSION_HOST_API_VERSION),
    compatibilityStatus: text("compatibility_status").notNull().default("unknown"),
    compatibilityMessage: text("compatibility_message"),
    installedAt: text("installed_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    extensionIdUniqueIndex: uniqueIndex("installed_extensions_extension_id_unique").on(table.extensionId),
  }),
);

export const extensionLifecycleStates = sqliteTable(
  "extension_lifecycle_states",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    extensionId: text("extension_id").notNull(),
    stage: text("stage").notNull().default("idle"),
    progressPercent: integer("progress_percent").notNull().default(0),
    downloadedBytes: integer("downloaded_bytes").notNull().default(0),
    totalBytes: integer("total_bytes"),
    availableVersion: text("available_version"),
    releaseTag: text("release_tag"),
    assetName: text("asset_name"),
    assetUrl: text("asset_url"),
    downloadPath: text("download_path"),
    stagedPath: text("staged_path"),
    activeVersion: text("active_version"),
    previousVersion: text("previous_version"),
    catalogJson: text("catalog_json"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    lastCheckedAt: text("last_checked_at"),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    extensionIdUniqueIndex: uniqueIndex("extension_lifecycle_states_extension_id_unique").on(table.extensionId),
  }),
);

export const dbConnections = sqliteTable(
  "db_connections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    dialect: text("dialect").notNull().default("mysql"),
    host: text("host").notNull(),
    port: integer("port").notNull().default(3306),
    username: text("username").notNull(),
    encryptedPassword: text("encrypted_password"),
    passwordStorage: text("password_storage").notNull().default("electron-safe-storage"),
    rememberPassword: integer("remember_password", { mode: "boolean" }).notNull().default(true),
    sslMode: text("ssl_mode").notNull().default("preferred"),
    lastSelectedDatabase: text("last_selected_database"),
    lastTestStatus: text("last_test_status").notNull().default("unknown"),
    lastTestMessage: text("last_test_message"),
    lastTestedAt: text("last_tested_at"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    nameUniqueIndex: uniqueIndex("db_connections_name_unique").on(table.name),
  }),
);

export const dbSchemaSnapshots = sqliteTable(
  "db_schema_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    connectionId: integer("connection_id").notNull(),
    dialect: text("dialect").notNull().default("mysql"),
    databaseName: text("database_name").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    tableCount: integer("table_count").notNull().default(0),
    schemaJson: text("schema_json").notNull(),
    capturedAt: text("captured_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    snapshotUniqueIndex: uniqueIndex("db_schema_snapshots_conn_db_hash_unique").on(
      table.connectionId,
      table.databaseName,
      table.snapshotHash,
    ),
  }),
);

export const dbSchemaScanEvents = sqliteTable(
  "db_schema_scan_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    connectionId: integer("connection_id").notNull(),
    dialect: text("dialect").notNull().default("mysql"),
    databaseName: text("database_name").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    eventType: text("event_type").notNull().default("new_snapshot"),
    previousSnapshotHash: text("previous_snapshot_hash"),
    changeSummaryJson: text("change_summary_json"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    scanEventUniqueIndex: uniqueIndex("db_schema_scan_events_conn_db_snapshot_created_unique").on(
      table.connectionId,
      table.databaseName,
      table.snapshotHash,
      table.createdAt,
    ),
  }),
);

export const dbDeployJobs = sqliteTable(
  "db_deploy_jobs",
  {
    id: text("id").primaryKey(),
    connectionId: integer("connection_id").notNull(),
    dialect: text("dialect").notNull().default("mysql"),
    databaseName: text("database_name").notNull(),
    compareHash: text("compare_hash").notNull(),
    compareSourceJson: text("compare_source_json").notNull(),
    baselineSourceJson: text("baseline_source_json").notNull(),
    targetSnapshotHash: text("target_snapshot_hash").notNull(),
    selectedTablesJson: text("selected_tables_json").notNull(),
    summaryJson: text("summary_json"),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    compareHashIndex: uniqueIndex("db_deploy_jobs_compare_hash_unique").on(table.compareHash, table.id),
  }),
);

export const dbDeployJobStatementResults = sqliteTable(
  "db_deploy_job_statement_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: text("job_id").notNull(),
    statementId: text("statement_id").notNull(),
    tableName: text("table_name"),
    statementKind: text("statement_kind").notNull(),
    relatedEntityKeysJson: text("related_entity_keys_json").notNull().default("[]"),
    blockerCodesJson: text("blocker_codes_json").notNull().default("[]"),
    blocked: integer("blocked", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull().default("pending"),
    sql: text("sql").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    executedAt: text("executed_at"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    jobStatementUniqueIndex: uniqueIndex("db_deploy_job_statement_results_job_statement_unique").on(
      table.jobId,
      table.statementId,
    ),
  }),
);

export const dbComparePolicies = sqliteTable("db_compare_policies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tableRenameAutoAcceptThreshold: integer("table_rename_auto_accept_threshold"),
  columnRenameAutoAcceptThreshold: integer("column_rename_auto_accept_threshold"),
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
  ddlImportTemplatePreference: workbookTemplateVariantIdSchema.optional(),
});

export type DdlSettings = z.infer<typeof ddlSettingsSchema>;

export const extensionIdSchema = z.enum([DB_MANAGEMENT_EXTENSION_ID]);
export const extensionHostStatusSchema = z.enum(["not_installed", "enabled", "disabled", "incompatible"]);
export const extensionCompatibilityStatusSchema = z.enum(["unknown", "compatible", "incompatible"]);
export const extensionHostActionSchema = z.enum([
  "install",
  "enable",
  "disable",
  "activate",
  "check_for_updates",
  "update",
  "uninstall",
  "retry",
]);
export const extensionSourceSchema = z.enum(["official"]);
export const extensionRuntimeTargetSchema = z.enum([
  "win32-x64",
  "win32-arm64",
  "darwin-x64",
  "darwin-arm64",
  "linux-x64",
]);
export const extensionLifecycleStageSchema = z.enum([
  "idle",
  "checking",
  "available",
  "downloading",
  "downloaded",
  "verifying",
  "verified",
  "installing",
  "installed",
  "ready_to_enable",
  "update_available",
  "uninstalling",
  "failed",
]);
export const extensionLifecycleErrorCodeSchema = z.enum([
  "network_error",
  "catalog_unavailable",
  "asset_not_found",
  "verification_failed",
  "incompatible",
  "install_failed",
  "uninstall_failed",
]);

export const installedExtensionRecordSchema = z.object({
  id: z.number().int().positive(),
  extensionId: extensionIdSchema,
  version: z.string().min(1),
  enabled: z.boolean(),
  installPath: z.string().min(1),
  manifestJson: z.string().optional(),
  minAppVersion: z.string().optional(),
  hostApiVersion: z.number().int().positive().default(EXTENSION_HOST_API_VERSION),
  compatibilityStatus: extensionCompatibilityStatusSchema.default("unknown"),
  compatibilityMessage: z.string().optional(),
  installedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const officialExtensionCatalogItemSchema = z.object({
  extensionId: extensionIdSchema,
  name: z.string().min(1),
  shortName: z.string().min(1),
  description: z.string().min(1),
  publisher: z.string().min(1),
  source: extensionSourceSchema.default("official"),
  official: z.boolean().default(true),
  hostApiVersion: z.number().int().positive().default(EXTENSION_HOST_API_VERSION),
  minAppVersion: z.string().optional(),
  recommended: z.boolean().default(true),
});

export const extensionManifestPackageSchema = z.object({
  target: extensionRuntimeTargetSchema,
  assetName: z.string().min(1),
  downloadUrl: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
  sha256: z.string().min(32),
  releaseUrl: z.string().min(1).optional(),
});

export const officialExtensionManifestSchema = officialExtensionCatalogItemSchema.extend({
  version: z.string().min(1),
  summary: z.string().min(1).optional(),
  releaseNotes: z.string().optional(),
  packages: z.array(extensionManifestPackageSchema).min(1),
});

export const extensionCatalogReleaseSchema = z.object({
  version: z.string().min(1),
  tagName: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  releaseNotes: z.string().optional(),
  publishedAt: z.string().optional(),
  releaseUrl: z.string().min(1).optional(),
  package: extensionManifestPackageSchema.optional(),
  compatibilityStatus: extensionCompatibilityStatusSchema.default("unknown"),
  compatibilityMessage: z.string().optional(),
  checkedAt: z.string().optional(),
});

export const extensionLifecycleStateSchema = z.object({
  id: z.number().int().positive(),
  extensionId: extensionIdSchema,
  stage: extensionLifecycleStageSchema.default("idle"),
  progressPercent: z.number().int().min(0).max(100).default(0),
  downloadedBytes: z.number().int().min(0).default(0),
  totalBytes: z.number().int().min(0).optional(),
  availableVersion: z.string().min(1).optional(),
  releaseTag: z.string().min(1).optional(),
  assetName: z.string().min(1).optional(),
  assetUrl: z.string().min(1).optional(),
  downloadPath: z.string().min(1).optional(),
  stagedPath: z.string().min(1).optional(),
  activeVersion: z.string().min(1).optional(),
  previousVersion: z.string().min(1).optional(),
  catalogJson: z.string().optional(),
  lastErrorCode: extensionLifecycleErrorCodeSchema.optional(),
  lastErrorMessage: z.string().optional(),
  lastCheckedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const extensionHostStateSchema = officialExtensionCatalogItemSchema.extend({
  status: extensionHostStatusSchema,
  enabled: z.boolean(),
  installedVersion: z.string().optional(),
  installPath: z.string().optional(),
  compatibilityStatus: extensionCompatibilityStatusSchema.default("unknown"),
  compatibilityMessage: z.string().optional(),
  requiresAppRestart: z.boolean().default(false),
  availableActions: z.array(extensionHostActionSchema).default([]),
  installMarkerLabel: z.string().optional(),
  stateLabel: z.string().min(1),
  updateAvailable: z.boolean().default(false),
  updateVersion: z.string().optional(),
  catalog: extensionCatalogReleaseSchema.optional(),
  lifecycle: extensionLifecycleStateSchema.optional(),
});

export const extensionLifecycleActionRequestSchema = z.object({
  extensionId: extensionIdSchema,
  action: extensionHostActionSchema.optional(),
  force: z.boolean().default(false),
});

export const dbConnectionDialectSchema = z.enum(["mysql"]);
export const dbConnectionSslModeSchema = z.enum(["disable", "preferred", "required"]);
export const dbPasswordStorageSchema = z.enum(["electron-safe-storage"]);
export const dbConnectionTestStatusSchema = z.enum(["unknown", "ok", "failed"]);
export const dbSchemaIndexDirectionSchema = z.enum(["A", "D"]);

export const dbConnectionRecordSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  dialect: dbConnectionDialectSchema.default("mysql"),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(3306),
  username: z.string().min(1),
  encryptedPassword: z.string().optional(),
  passwordStorage: dbPasswordStorageSchema.default("electron-safe-storage"),
  rememberPassword: z.boolean().default(true),
  sslMode: dbConnectionSslModeSchema.default("preferred"),
  lastSelectedDatabase: z.string().optional(),
  lastTestStatus: dbConnectionTestStatusSchema.default("unknown"),
  lastTestMessage: z.string().optional(),
  lastTestedAt: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const dbConnectionSummarySchema = dbConnectionRecordSchema
  .omit({ encryptedPassword: true })
  .extend({
    passwordStored: z.boolean().default(false),
  });

export const dbConnectionUpsertRequestSchema = z.object({
  name: z.string().min(1).max(120),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(3306),
  username: z.string().min(1).max(255),
  password: z.string().min(1).optional(),
  rememberPassword: z.boolean().default(true),
  clearSavedPassword: z.boolean().default(false),
  sslMode: dbConnectionSslModeSchema.default("preferred"),
});

export const dbConnectionTestResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  serverVersion: z.string().optional(),
  databaseCount: z.number().int().min(0).optional(),
});

export const dbDatabaseOptionSchema = z.object({
  name: z.string().min(1),
  isSelected: z.boolean().default(false),
});

export const dbPrimaryKeySchema = z.object({
  name: z.string().optional(),
  columns: z.array(z.string().min(1)).min(1),
});

export const dbForeignKeyColumnMappingSchema = z.object({
  columnName: z.string().min(1),
  referencedColumnName: z.string().min(1),
});

export const dbForeignKeySchema = z.object({
  name: z.string().min(1),
  referencedTableSchema: z.string().optional(),
  referencedTableName: z.string().min(1),
  updateRule: z.string().optional(),
  deleteRule: z.string().optional(),
  columnMappings: z.array(dbForeignKeyColumnMappingSchema).min(1),
});

export const dbIndexColumnSchema = z.object({
  columnName: z.string().min(1),
  seqInIndex: z.number().int().min(1),
  direction: dbSchemaIndexDirectionSchema.optional(),
  subPart: z.number().int().min(1).optional(),
});

export const dbIndexSchema = z.object({
  name: z.string().min(1),
  unique: z.boolean(),
  primary: z.boolean().default(false),
  indexType: z.string().optional(),
  columns: z.array(dbIndexColumnSchema).min(1),
});

export const dbColumnSchema = z.object({
  name: z.string().min(1),
  ordinalPosition: z.number().int().min(1),
  dataType: z.string().min(1),
  columnType: z.string().optional(),
  extra: z.string().optional(),
  nullable: z.boolean(),
  defaultValue: z.string().nullable().optional(),
  autoIncrement: z.boolean().default(false),
  comment: z.string().optional(),
  characterMaxLength: z.number().int().positive().optional(),
  numericPrecision: z.number().int().positive().optional(),
  numericScale: z.number().int().min(0).optional(),
});

export const dbTableSchema = z.object({
  name: z.string().min(1),
  engine: z.string().optional(),
  comment: z.string().optional(),
  columns: z.array(dbColumnSchema).default([]),
  primaryKey: dbPrimaryKeySchema.optional(),
  foreignKeys: z.array(dbForeignKeySchema).default([]),
  indexes: z.array(dbIndexSchema).default([]),
});

export const dbSchemaCatalogSchema = z.object({
  dialect: dbConnectionDialectSchema.default("mysql"),
  databaseName: z.string().min(1),
  tables: z.array(dbTableSchema).default([]),
  capturedAt: z.string().optional(),
});

export const dbSchemaSnapshotSchema = z.object({
  id: z.number().int().positive(),
  connectionId: z.number().int().positive(),
  dialect: dbConnectionDialectSchema.default("mysql"),
  databaseName: z.string().min(1),
  snapshotHash: z.string().min(8),
  tableCount: z.number().int().min(0),
  schemaJson: z.string(),
  capturedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const dbSelectDatabaseRequestSchema = z.object({
  databaseName: z.string().min(1),
});

export const dbSchemaIntrospectRequestSchema = z.object({
  databaseName: z.string().min(1).optional(),
  forceRefresh: z.boolean().default(true),
});

export const dbSchemaIntrospectResponseSchema = z.object({
  connection: dbConnectionSummarySchema,
  selectedDatabase: z.string().min(1),
  cacheHit: z.boolean().default(false),
  snapshot: dbSchemaSnapshotSchema,
  schema: dbSchemaCatalogSchema,
});

export const dbDiffScopeSchema = z.enum(["sheet", "table"]);
export const dbDiffActionSchema = z.enum(["added", "removed", "modified", "rename_suggest", "renamed"]);
export const dbDiffEntityTypeSchema = z.enum(["table", "column"]);
export const dbRenameDecisionSchema = z.enum(["pending", "accept", "reject"]);
export const dbDiffBlockerCodeSchema = z.enum([
  "drop_table",
  "drop_column",
  "type_shrink",
  "rename_unconfirmed",
  "not_null_without_fill",
]);
export const dbDiffBlockerSeveritySchema = z.enum(["blocking", "warning"]);
export const dbSqlStatementKindSchema = z.enum([
  "create_table",
  "drop_table",
  "rename_table",
  "add_column",
  "drop_column",
  "modify_column",
  "rename_column",
  "note",
]);

export const dbFileColumnSchema = z.object({
  logicalName: z.string().optional(),
  physicalName: z.string().optional(),
  dataType: z.string().optional(),
  size: z.string().optional(),
  nullable: z.boolean().optional(),
  isPk: z.boolean().optional(),
  autoIncrement: z.boolean().optional(),
  comment: z.string().optional(),
});

export const dbFileTableSchema = z.object({
  sheetName: z.string().min(1),
  logicalTableName: z.string().optional(),
  physicalTableName: z.string().optional(),
  columns: z.array(dbFileColumnSchema).default([]),
});

export const dbDiffBlockerSchema = z.object({
  code: dbDiffBlockerCodeSchema,
  severity: dbDiffBlockerSeveritySchema.default("blocking"),
  entityType: dbDiffEntityTypeSchema,
  entityKey: z.string().min(1),
  sheetName: z.string().optional(),
  tableName: z.string().optional(),
  columnName: z.string().optional(),
  message: z.string().min(1),
});

export const dbRenameSuggestionSchema = z.object({
  entityType: dbDiffEntityTypeSchema,
  entityKey: z.string().min(1),
  confidence: z.number().min(0).max(1),
  decision: dbRenameDecisionSchema.default("pending"),
  sheetName: z.string().min(1),
  tableNameBefore: z.string().optional(),
  tableNameAfter: z.string().optional(),
  columnNameBefore: z.string().optional(),
  columnNameAfter: z.string().optional(),
});

export const dbDiffColumnChangeSchema = z.object({
  action: dbDiffActionSchema,
  entityKey: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  requiresConfirmation: z.boolean().default(false),
  changedFields: z.array(z.string()).default([]),
  fileColumn: dbFileColumnSchema.optional(),
  dbColumn: dbColumnSchema.optional(),
  blockers: z.array(dbDiffBlockerSchema).default([]),
});

export const dbDiffTableChangeSchema = z.object({
  action: dbDiffActionSchema,
  entityKey: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  requiresConfirmation: z.boolean().default(false),
  sheetName: z.string().min(1),
  changedFields: z.array(z.string()).default([]),
  fileTable: dbFileTableSchema.optional(),
  dbTable: dbTableSchema.optional(),
  columnChanges: z.array(dbDiffColumnChangeSchema).default([]),
  blockers: z.array(dbDiffBlockerSchema).default([]),
});

export const dbDiffSummarySchema = z.object({
  addedTables: z.number().int().min(0),
  removedTables: z.number().int().min(0),
  changedTables: z.number().int().min(0),
  renameSuggestions: z.number().int().min(0),
  pendingRenameConfirmations: z.number().int().min(0),
  addedColumns: z.number().int().min(0),
  removedColumns: z.number().int().min(0),
  changedColumns: z.number().int().min(0),
  blockingCount: z.number().int().min(0),
});

export const dbDiffContextSchema = z.object({
  fileId: z.number().int().positive(),
  fileName: z.string().min(1),
  scope: dbDiffScopeSchema,
  sheetName: z.string().min(1),
  tableName: z.string().optional(),
  connectionId: z.number().int().positive(),
  connectionName: z.string().min(1),
  databaseName: z.string().min(1),
  snapshotHash: z.string().min(8),
  snapshotCapturedAt: z.string().optional(),
});

export const dbDiffPreviewRequestSchema = z
  .object({
    fileId: z.number().int().positive(),
    sheetName: z.string().min(1),
    scope: dbDiffScopeSchema.default("sheet"),
    tableName: z.string().min(1).optional(),
    databaseName: z.string().min(1).optional(),
    refreshLiveSchema: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "table" && !value.tableName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tableName"],
        message: "tableName is required when scope=table",
      });
    }
  });

export const dbRenameDecisionItemSchema = z.object({
  entityType: dbDiffEntityTypeSchema,
  entityKey: z.string().min(1),
  decision: z.enum(["accept", "reject"]),
});

export const dbDiffConfirmRenamesRequestSchema = z.object({
  compare: dbDiffPreviewRequestSchema,
  decisions: z.array(dbRenameDecisionItemSchema).min(1),
});

export const dbDiffPreviewResponseSchema = z.object({
  context: dbDiffContextSchema,
  cacheHit: z.boolean().default(false),
  summary: dbDiffSummarySchema,
  tableChanges: z.array(dbDiffTableChangeSchema).default([]),
  renameSuggestions: z.array(dbRenameSuggestionSchema).default([]),
  blockers: z.array(dbDiffBlockerSchema).default([]),
  canPreview: z.boolean().default(false),
});

export const dbSqlPreviewStatementSchema = z.object({
  id: z.string().min(1),
  kind: dbSqlStatementKindSchema,
  tableName: z.string().optional(),
  sql: z.string().min(1),
  relatedEntityKeys: z.array(z.string()).default([]),
  blocked: z.boolean().default(false),
  blockerCodes: z.array(dbDiffBlockerCodeSchema).default([]),
});

export const dbSqlPreviewArtifactSchema = z.object({
  artifactName: z.string().min(1),
  tableName: z.string().optional(),
  sql: z.string().min(1),
  statements: z.array(dbSqlPreviewStatementSchema).default([]),
});

export const dbSqlPreviewRequestSchema = z.object({
  compare: dbDiffPreviewRequestSchema,
  decisions: z.array(dbRenameDecisionItemSchema).default([]),
  dialect: z.enum(["mysql", "oracle"]).default("mysql"),
});

export const dbSqlPreviewResponseSchema = z.object({
  compareResult: dbDiffPreviewResponseSchema,
  dialect: z.enum(["mysql", "oracle"]),
  artifacts: z.array(dbSqlPreviewArtifactSchema).default([]),
  blocked: z.boolean().default(false),
});

export const dbDryRunRequestSchema = z.object({
  compare: dbDiffPreviewRequestSchema,
  decisions: z.array(dbRenameDecisionItemSchema).default([]),
  dialect: z.enum(["mysql", "oracle"]).default("mysql"),
});

export const dbDryRunSummarySchema = z.object({
  dialect: z.enum(["mysql", "oracle"]),
  statementCount: z.number().int().min(0),
  executableStatementCount: z.number().int().min(0),
  blockedStatementCount: z.number().int().min(0),
  blockingCount: z.number().int().min(0),
  tableCount: z.number().int().min(0),
});

export const dbDryRunResponseSchema = z.object({
  compareResult: dbDiffPreviewResponseSchema,
  summary: dbDryRunSummarySchema,
  artifacts: z.array(dbSqlPreviewArtifactSchema).default([]),
});

export const dbComparePolicySchema = z.object({
  tableRenameAutoAcceptThreshold: z.number().min(0).max(1).optional(),
  columnRenameAutoAcceptThreshold: z.number().min(0).max(1).optional(),
});

export const dbCompareLiveTargetSchema = z.object({
  connectionId: z.number().int().positive(),
  databaseName: z.string().min(1),
  snapshotHash: z.string().min(8).optional(),
});

export const dbVsDbCompareScopeSchema = z.enum(["database", "table"]);

export const dbVsDbCompareRequestSchema = z
  .object({
    source: dbCompareLiveTargetSchema,
    target: dbCompareLiveTargetSchema,
    scope: dbVsDbCompareScopeSchema.default("database"),
    tableName: z.string().min(1).optional(),
    refreshSourceSchema: z.boolean().default(false),
    refreshTargetSchema: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "table" && !value.tableName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tableName"],
        message: "tableName is required when scope=table",
      });
    }
  });

export const dbVsDbCompareContextSchema = z.object({
  sourceConnectionId: z.number().int().positive(),
  sourceConnectionName: z.string().min(1),
  sourceDatabaseName: z.string().min(1),
  sourceSnapshotHash: z.string().min(8),
  targetConnectionId: z.number().int().positive(),
  targetConnectionName: z.string().min(1),
  targetDatabaseName: z.string().min(1),
  targetSnapshotHash: z.string().min(8),
  scope: dbVsDbCompareScopeSchema.default("database"),
  tableName: z.string().min(1).optional(),
});

export const dbVsDbCompareResponseSchema = z.object({
  context: dbVsDbCompareContextSchema,
  summary: dbDiffSummarySchema,
  tableChanges: z.array(dbDiffTableChangeSchema).default([]),
  renameSuggestions: z.array(dbRenameSuggestionSchema).default([]),
  blockers: z.array(dbDiffBlockerSchema).default([]),
  canPreview: z.boolean().default(false),
  policy: dbComparePolicySchema.default({}),
});

export const dbVsDbRenameReviewRequestSchema = z.object({
  compare: dbVsDbCompareRequestSchema,
  decisions: z.array(dbRenameDecisionItemSchema).min(1),
});

export const dbVsDbPreviewRequestSchema = z.object({
  compare: dbVsDbCompareRequestSchema,
  decisions: z.array(dbRenameDecisionItemSchema).default([]),
  dialect: z.enum(["mysql", "oracle"]).default("mysql"),
});

export const dbVsDbPreviewResponseSchema = z.object({
  compareResult: dbVsDbCompareResponseSchema,
  dialect: z.enum(["mysql", "oracle"]),
  artifacts: z.array(dbSqlPreviewArtifactSchema).default([]),
  blocked: z.boolean().default(false),
});

export const dbSnapshotCompareLiveFreshnessSchema = z.enum(["latest_snapshot", "refresh_live"]);

export const dbSnapshotCompareSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("live"),
    connectionId: z.number().int().positive(),
    databaseName: z.string().min(1),
    freshness: dbSnapshotCompareLiveFreshnessSchema.default("latest_snapshot"),
  }),
  z.object({
    kind: z.literal("snapshot"),
    connectionId: z.number().int().positive(),
    databaseName: z.string().min(1),
    snapshotHash: z.string().min(8),
  }),
]);

export const dbSnapshotCompareScopeSchema = z.enum(["database", "table"]);

export const dbSnapshotCompareResolvedSourceSchema = z.object({
  sourceKey: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["live", "snapshot"]),
  connectionId: z.number().int().positive(),
  connectionName: z.string().min(1),
  databaseName: z.string().min(1),
  requestedSnapshotHash: z.string().min(8).optional(),
  snapshotHash: z.string().min(8),
  snapshotCapturedAt: z.string().optional(),
  freshness: dbSnapshotCompareLiveFreshnessSchema.optional(),
  usedFreshLiveScan: z.boolean().default(false),
  cacheHit: z.boolean().default(false),
});

export const dbSnapshotCompareContextSchema = z.object({
  artifactVersion: z.literal("v1").default("v1"),
  compareKey: z.string().min(1),
  scope: dbSnapshotCompareScopeSchema.default("database"),
  tableName: z.string().min(1).optional(),
  generatedAt: z.string().optional(),
  left: dbSnapshotCompareResolvedSourceSchema,
  right: dbSnapshotCompareResolvedSourceSchema,
});

export const dbSnapshotCompareWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  side: z.enum(["left", "right", "compare"]).optional(),
});

export const dbSnapshotCompareArtifactSchema = z.object({
  context: dbSnapshotCompareContextSchema,
  summary: dbDiffSummarySchema,
  tableChanges: z.array(dbDiffTableChangeSchema).default([]),
  blockers: z.array(dbDiffBlockerSchema).default([]),
  warnings: z.array(dbSnapshotCompareWarningSchema).default([]),
});

export const dbSnapshotCompareRequestSchema = z
  .object({
    left: dbSnapshotCompareSourceSchema,
    right: dbSnapshotCompareSourceSchema,
    scope: dbSnapshotCompareScopeSchema.default("database"),
    tableName: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "table" && !value.tableName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tableName"],
        message: "tableName is required when scope=table",
      });
    }
    if (value.left.kind === "live" && value.right.kind === "live") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["right"],
        message: "Use DB vs DB Compare for live-to-live comparisons.",
      });
    }
  });

export const dbSnapshotCompareResponseSchema = dbSnapshotCompareArtifactSchema;

export const dbSnapshotCompareReportFormatSchema = z.enum(["markdown", "json"]);

export const dbSnapshotCompareReportRequestSchema = z.object({
  format: dbSnapshotCompareReportFormatSchema.default("markdown"),
  artifact: dbSnapshotCompareArtifactSchema,
});

export const dbSnapshotCompareReportResponseSchema = z.object({
  format: dbSnapshotCompareReportFormatSchema,
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  content: z.string().min(1),
  artifact: dbSnapshotCompareArtifactSchema,
});

export const dbSnapshotCompareWorkspaceStateSchema = z.object({
  lastCompareInput: dbSnapshotCompareRequestSchema.nullable().default(null),
  artifact: dbSnapshotCompareArtifactSchema.nullable().default(null),
  selectedTableNames: z.array(z.string().min(1)).default([]),
  lastReportFormat: dbSnapshotCompareReportFormatSchema.default("markdown"),
});

export const dbLiveExportIssueKindSchema = z.enum([
  "workbook_inexpressible",
  "workbook_lossy",
  "round_trip_failed",
  "info",
]);

export const dbLiveExportIssueSeveritySchema = z.enum(["blocking", "confirm", "info"]);

export const dbLiveExportIssueSchema = z.object({
  severity: dbLiveExportIssueSeveritySchema,
  kind: dbLiveExportIssueKindSchema,
  entityKey: z.string().min(1),
  tableName: z.string().optional(),
  columnName: z.string().optional(),
  constraintName: z.string().optional(),
  message: z.string().min(1),
  detail: z.string().optional(),
});

export const dbLiveExportIssueSummarySchema = z.object({
  blockingCount: z.number().int().min(0).default(0),
  confirmCount: z.number().int().min(0).default(0),
  infoCount: z.number().int().min(0).default(0),
});

export const dbLiveExportPreviewArtifactSchema = z.object({
  artifactVersion: z.literal("v1").default("v1"),
  artifactKey: z.string().min(1),
  connectionId: z.number().int().positive(),
  databaseName: z.string().min(1),
  freshnessMode: dbSnapshotCompareLiveFreshnessSchema.default("latest_snapshot"),
  resolvedSnapshotHash: z.string().min(8),
  resolvedSnapshotCapturedAt: z.string().optional(),
  catalog: dbSchemaCatalogSchema,
  selectedTableNames: z.array(z.string().min(1)).default([]),
  selectableTableNames: z.array(z.string().min(1)).default([]),
  templateId: workbookTemplateVariantIdSchema,
  issueSummary: dbLiveExportIssueSummarySchema,
  issues: z.array(dbLiveExportIssueSchema).default([]),
  canExport: z.boolean().default(false),
});

export const dbLiveExportPreviewRequestSchema = z.object({
  connectionId: z.number().int().positive(),
  databaseName: z.string().min(1),
  freshnessMode: dbSnapshotCompareLiveFreshnessSchema.default("latest_snapshot"),
  selectedTableNames: z.array(z.string().min(1)).default([]),
  templateId: workbookTemplateVariantIdSchema,
});

export const dbLiveExportPreviewResponseSchema = dbLiveExportPreviewArtifactSchema;

export const dbLiveExportExecuteRequestSchema = z.object({
  artifact: dbLiveExportPreviewArtifactSchema,
  selectedTableNames: z.array(z.string().min(1)).min(1),
  templateId: workbookTemplateVariantIdSchema,
  allowLossyExport: z.boolean().default(false),
  originalName: z.string().min(1).max(255).optional(),
});

export const dbLiveExportExecuteResponseSchema = z.object({
  artifact: dbLiveExportPreviewArtifactSchema,
  file: uploadedFileRecordSchema,
  template: workbookTemplateVariantSchema,
  validation: workbookTemplateValidationSchema,
  selectedTableNames: z.array(z.string().min(1)).default([]),
  issueSummary: dbLiveExportIssueSummarySchema,
  rememberedTemplateId: workbookTemplateVariantIdSchema.optional(),
});

export const dbManagementViewModeSchema = z.enum([
  "diff",
  "db-vs-db",
  "snapshot-compare",
  "live-export",
  "history",
  "apply",
  "graph",
]);

export const dbHistoryCompareSourceKindSchema = z.enum(["file", "live", "snapshot"]);

export const dbHistoryCompareSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("file"),
    fileId: z.number().int().positive(),
    fileName: z.string().min(1),
    sheetName: z.string().min(1),
  }),
  z.object({
    kind: z.literal("live"),
    connectionId: z.number().int().positive(),
    databaseName: z.string().min(1),
    snapshotHash: z.string().min(8).optional(),
  }),
  z.object({
    kind: z.literal("snapshot"),
    connectionId: z.number().int().positive(),
    databaseName: z.string().min(1),
    snapshotHash: z.string().min(8),
  }),
]);

export const dbHistoryCompareScopeSchema = z.enum(["database", "table"]);

export const dbSchemaScanEventTypeSchema = z.enum(["new_snapshot", "unchanged_scan"]);

export const dbSchemaScanEventSchema = z.object({
  id: z.number().int().positive(),
  connectionId: z.number().int().positive(),
  dialect: dbConnectionDialectSchema.default("mysql"),
  databaseName: z.string().min(1),
  snapshotHash: z.string().min(8),
  eventType: dbSchemaScanEventTypeSchema,
  previousSnapshotHash: z.string().min(8).optional(),
  changeSummaryJson: z.string().optional(),
  createdAt: z.string().optional(),
});

export const dbHistoryListRequestSchema = z.object({
  databaseName: z.string().min(1),
  limit: z.number().int().min(1).max(200).default(50),
  changedOnly: z.boolean().default(false),
});

export const dbHistoryEntrySchema = z.object({
  scanEvent: dbSchemaScanEventSchema,
  snapshot: dbSchemaSnapshotSchema.optional(),
  previousSnapshot: dbSchemaSnapshotSchema.optional(),
  createdNewSnapshot: z.boolean().default(false),
});

export const dbHistoryListResponseSchema = z.object({
  connectionId: z.number().int().positive(),
  databaseName: z.string().min(1),
  latestSnapshotHash: z.string().min(8).optional(),
  entries: z.array(dbHistoryEntrySchema).default([]),
});

export const dbHistoryDetailResponseSchema = z.object({
  entry: dbHistoryEntrySchema,
});

export const dbHistoryCompareContextSchema = z.object({
  connectionId: z.number().int().positive(),
  databaseName: z.string().min(1),
  left: dbHistoryCompareSourceSchema,
  right: dbHistoryCompareSourceSchema,
  scope: dbHistoryCompareScopeSchema.default("database"),
  tableName: z.string().min(1).optional(),
});

export const dbHistoryCompareRequestSchema = z
  .object({
    left: dbHistoryCompareSourceSchema,
    right: dbHistoryCompareSourceSchema,
    scope: dbHistoryCompareScopeSchema.default("database"),
    tableName: z.string().min(1).optional(),
    refreshLiveSchema: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "table" && !value.tableName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tableName"],
        message: "tableName is required when scope=table",
      });
    }
    if (value.left.kind === "live" && value.right.kind === "live") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["right"],
        message: "live-to-live DB comparison is deferred",
      });
    }
  });

export const dbHistoryCompareResponseSchema = z.object({
  context: dbHistoryCompareContextSchema,
  summary: dbDiffSummarySchema,
  tableChanges: z.array(dbDiffTableChangeSchema).default([]),
  blockers: z.array(dbDiffBlockerSchema).default([]),
  canApply: z.boolean().default(false),
});

export const dbApplySelectionSchema = z.object({
  tableName: z.string().min(1),
  relatedEntityKeys: z.array(z.string().min(1)).default([]),
  blocked: z.boolean().default(false),
  blockerCodes: z.array(dbDiffBlockerCodeSchema).default([]),
});

export const dbDeployJobStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "partial",
  "blocked",
]);

export const dbDeployJobSummarySchema = z.object({
  selectedTableCount: z.number().int().min(0),
  appliedTableCount: z.number().int().min(0),
  statementCount: z.number().int().min(0),
  executedStatementCount: z.number().int().min(0),
  blockedStatementCount: z.number().int().min(0),
  failedStatementCount: z.number().int().min(0),
});

export const dbApplyRequestSchema = z
  .object({
    databaseName: z.string().min(1),
    compareSource: dbHistoryCompareSourceSchema,
    baselineSource: dbHistoryCompareSourceSchema,
    compareHash: z.string().min(8),
    comparedTargetSnapshotHash: z.string().min(8),
    currentTargetSnapshotHash: z.string().min(8),
    selections: z.array(dbApplySelectionSchema).min(1),
    dialect: z.enum(["mysql", "oracle"]).default("mysql"),
  })
  .superRefine((value, ctx) => {
    if (value.comparedTargetSnapshotHash !== value.currentTargetSnapshotHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentTargetSnapshotHash"],
        message: "Apply request is stale. Refresh the compare result before applying.",
      });
    }
    if (value.compareSource.kind === "live" && value.baselineSource.kind === "live") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baselineSource"],
        message: "live-to-live DB apply is deferred",
      });
    }
    const blockedSelection = value.selections.find(
      (selection) => selection.blocked || selection.blockerCodes.length > 0,
    );
    if (blockedSelection) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selections"],
        message: `Blocked table selections cannot be applied: ${blockedSelection.tableName}`,
      });
    }
  });

export const dbDeployJobSchema = z.object({
  id: z.string().min(1),
  connectionId: z.number().int().positive(),
  dialect: z.enum(["mysql", "oracle"]).default("mysql"),
  databaseName: z.string().min(1),
  compareHash: z.string().min(8),
  compareSource: dbHistoryCompareSourceSchema,
  baselineSource: dbHistoryCompareSourceSchema,
  targetSnapshotHash: z.string().min(8),
  selectedTables: z.array(z.string().min(1)).default([]),
  summary: dbDeployJobSummarySchema.optional(),
  status: dbDeployJobStatusSchema.default("pending"),
  errorMessage: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const dbDeployJobStatementStatusSchema = z.enum([
  "pending",
  "succeeded",
  "failed",
  "blocked",
  "skipped",
]);

export const dbDeployJobStatementResultSchema = z.object({
  id: z.number().int().positive(),
  jobId: z.string().min(1),
  statementId: z.string().min(1),
  tableName: z.string().optional(),
  statementKind: dbSqlStatementKindSchema,
  relatedEntityKeys: z.array(z.string().min(1)).default([]),
  blockerCodes: z.array(dbDiffBlockerCodeSchema).default([]),
  blocked: z.boolean().default(false),
  status: dbDeployJobStatementStatusSchema.default("pending"),
  sql: z.string().min(1),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  executedAt: z.string().optional(),
  createdAt: z.string().optional(),
});

export const dbApplyResponseSchema = z.object({
  job: dbDeployJobSchema,
  results: z.array(dbDeployJobStatementResultSchema).default([]),
});

export const dbDeployJobDetailResponseSchema = z.object({
  job: dbDeployJobSchema,
  results: z.array(dbDeployJobStatementResultSchema).default([]),
});

export const dbGraphModeSchema = z.enum(["full", "changed", "selection"]);

export const dbGraphNodeSchema = z.object({
  id: z.string().min(1),
  tableName: z.string().min(1),
  label: z.string().min(1),
  columnCount: z.number().int().min(0),
  foreignKeyCount: z.number().int().min(0),
  changed: z.boolean().default(false),
  highlighted: z.boolean().default(false),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export const dbGraphEdgeSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  relationshipName: z.string().optional(),
  changed: z.boolean().default(false),
});

export const dbGraphRequestSchema = z
  .object({
    source: dbHistoryCompareSourceSchema,
    compareTo: dbHistoryCompareSourceSchema.optional(),
    mode: dbGraphModeSchema.default("full"),
    selectedTableNames: z.array(z.string().min(1)).default([]),
    includeNeighbors: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.source.kind === "live" && value.compareTo?.kind === "live") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["compareTo"],
        message: "live-to-live DB graph comparison is deferred",
      });
    }
  });

export const dbGraphResponseSchema = z.object({
  source: dbHistoryCompareSourceSchema,
  compareTo: dbHistoryCompareSourceSchema.optional(),
  mode: dbGraphModeSchema.default("full"),
  nodes: z.array(dbGraphNodeSchema).default([]),
  edges: z.array(dbGraphEdgeSchema).default([]),
  changedTableNames: z.array(z.string().min(1)).default([]),
  availableTableNames: z.array(z.string().min(1)).default([]),
});

export const dbVsDbGraphRequestSchema = z.object({
  compare: dbVsDbCompareRequestSchema,
  decisions: z.array(dbRenameDecisionItemSchema).default([]),
  mode: dbGraphModeSchema.default("full"),
  selectedTableNames: z.array(z.string().min(1)).default([]),
  includeNeighbors: z.boolean().default(true),
});

export const dbVsDbGraphResponseSchema = z.object({
  compareResult: dbVsDbCompareResponseSchema,
  mode: dbGraphModeSchema.default("full"),
  nodes: z.array(dbGraphNodeSchema).default([]),
  edges: z.array(dbGraphEdgeSchema).default([]),
  changedTableNames: z.array(z.string().min(1)).default([]),
  availableTableNames: z.array(z.string().min(1)).default([]),
});

export const dbVsDbWorkspaceStateSchema = z.object({
  lastCompareInput: dbVsDbCompareRequestSchema.nullable().default(null),
  compareResult: dbVsDbCompareResponseSchema.nullable().default(null),
  previewResult: dbVsDbPreviewResponseSchema.nullable().default(null),
  selectedTableNames: z.array(z.string().min(1)).default([]),
});

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

export const ddlImportSourceModeSchema = z.enum(["paste", "upload"]);
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
  name: z.string().min(1),
  referencedTableName: z.string().min(1),
  referencedTableSchema: z.string().optional(),
  onDelete: z.string().optional(),
  onUpdate: z.string().optional(),
  columns: z.array(ddlImportForeignKeyColumnSchema).min(1),
});

export const ddlImportTableSchema = z.object({
  name: z.string().min(1),
  comment: z.string().optional(),
  engine: z.string().optional(),
  columns: z.array(ddlImportColumnSchema).default([]),
  indexes: z.array(ddlImportIndexSchema).default([]),
  foreignKeys: z.array(ddlImportForeignKeySchema).default([]),
});

export const ddlImportCatalogSchema = z.object({
  dialect: z.literal("mysql"),
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
    sourceMode: ddlImportSourceModeSchema.default("paste"),
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
    sourceMode: ddlImportSourceModeSchema.default("paste"),
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
export type DdlImportPreviewRequest = z.infer<typeof ddlImportPreviewRequestSchema>;
export type DdlImportPreviewResponse = z.infer<typeof ddlImportPreviewResponseSchema>;
export type DdlImportExportRequest = z.infer<typeof ddlImportExportRequestSchema>;
export type DdlImportExportResponse = z.infer<typeof ddlImportExportResponseSchema>;
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

export const processingTaskResponseSchema = z.object({
  id: z.string(),
  fileId: z.number().optional(),
  taskType: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  progress: z.number().min(0).max(100),
  error: z.string().optional(),
  result: z.unknown().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
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

export const OFFICIAL_DB_MANAGEMENT_EXTENSION = officialExtensionCatalogItemSchema.parse({
  extensionId: DB_MANAGEMENT_EXTENSION_ID,
  name: "DB 管理",
  shortName: "DB",
  description: "既存 DB 管理、差异可视化与部署能力的官方扩展。",
  publisher: OFFICIAL_EXTENSION_PUBLISHER,
  source: "official",
  official: true,
  hostApiVersion: EXTENSION_HOST_API_VERSION,
  recommended: true,
});

export type ProcessingTask = z.infer<typeof processingTaskSchema>;
export type ProcessingTaskResponse = z.infer<typeof processingTaskResponseSchema>;
export type UploadedFileRecord = z.infer<typeof uploadedFileRecordSchema>;
export type WorkbookTemplateVariantId = z.infer<typeof workbookTemplateVariantIdSchema>;
export type WorkbookTemplateLayout = z.infer<typeof workbookTemplateLayoutSchema>;
export type WorkbookTemplateVariant = z.infer<typeof workbookTemplateVariantSchema>;
export type WorkbookTemplateValidation = z.infer<typeof workbookTemplateValidationSchema>;
export type CreateWorkbookFromTemplateRequest = z.infer<typeof createWorkbookFromTemplateRequestSchema>;
export type CreateWorkbookFromTemplateResponse = z.infer<typeof createWorkbookFromTemplateResponseSchema>;
export type ExtensionId = z.infer<typeof extensionIdSchema>;
export type ExtensionHostStatus = z.infer<typeof extensionHostStatusSchema>;
export type ExtensionCompatibilityStatus = z.infer<typeof extensionCompatibilityStatusSchema>;
export type ExtensionHostAction = z.infer<typeof extensionHostActionSchema>;
export type ExtensionRuntimeTarget = z.infer<typeof extensionRuntimeTargetSchema>;
export type ExtensionLifecycleStage = z.infer<typeof extensionLifecycleStageSchema>;
export type ExtensionLifecycleErrorCode = z.infer<typeof extensionLifecycleErrorCodeSchema>;
export type InstalledExtensionRecord = z.infer<typeof installedExtensionRecordSchema>;
export type OfficialExtensionCatalogItem = z.infer<typeof officialExtensionCatalogItemSchema>;
export type OfficialExtensionManifest = z.infer<typeof officialExtensionManifestSchema>;
export type ExtensionManifestPackage = z.infer<typeof extensionManifestPackageSchema>;
export type ExtensionCatalogRelease = z.infer<typeof extensionCatalogReleaseSchema>;
export type ExtensionLifecycleState = z.infer<typeof extensionLifecycleStateSchema>;
export type ExtensionHostState = z.infer<typeof extensionHostStateSchema>;
export type DbConnectionDialect = z.infer<typeof dbConnectionDialectSchema>;
export type DbConnectionSslMode = z.infer<typeof dbConnectionSslModeSchema>;
export type DbPasswordStorage = z.infer<typeof dbPasswordStorageSchema>;
export type DbConnectionTestStatus = z.infer<typeof dbConnectionTestStatusSchema>;
export type DbConnectionRecord = z.infer<typeof dbConnectionRecordSchema>;
export type DbConnectionSummary = z.infer<typeof dbConnectionSummarySchema>;
export type DbConnectionUpsertRequest = z.infer<typeof dbConnectionUpsertRequestSchema>;
export type DbConnectionTestResponse = z.infer<typeof dbConnectionTestResponseSchema>;
export type DbDatabaseOption = z.infer<typeof dbDatabaseOptionSchema>;
export type DbPrimaryKey = z.infer<typeof dbPrimaryKeySchema>;
export type DbForeignKeyColumnMapping = z.infer<typeof dbForeignKeyColumnMappingSchema>;
export type DbForeignKey = z.infer<typeof dbForeignKeySchema>;
export type DbIndexColumn = z.infer<typeof dbIndexColumnSchema>;
export type DbIndex = z.infer<typeof dbIndexSchema>;
export type DbColumn = z.infer<typeof dbColumnSchema>;
export type DbTable = z.infer<typeof dbTableSchema>;
export type DbSchemaCatalog = z.infer<typeof dbSchemaCatalogSchema>;
export type DbSchemaSnapshot = z.infer<typeof dbSchemaSnapshotSchema>;
export type DbComparePolicy = z.infer<typeof dbComparePolicySchema>;
export type DbCompareLiveTarget = z.infer<typeof dbCompareLiveTargetSchema>;
export type DbVsDbCompareScope = z.infer<typeof dbVsDbCompareScopeSchema>;
export type DbVsDbCompareRequest = z.infer<typeof dbVsDbCompareRequestSchema>;
export type DbVsDbCompareContext = z.infer<typeof dbVsDbCompareContextSchema>;
export type DbVsDbCompareResponse = z.infer<typeof dbVsDbCompareResponseSchema>;
export type DbVsDbRenameReviewRequest = z.infer<typeof dbVsDbRenameReviewRequestSchema>;
export type DbVsDbPreviewRequest = z.infer<typeof dbVsDbPreviewRequestSchema>;
export type DbVsDbPreviewResponse = z.infer<typeof dbVsDbPreviewResponseSchema>;
export type DbManagementViewMode = z.infer<typeof dbManagementViewModeSchema>;
export type DbSnapshotCompareLiveFreshness = z.infer<typeof dbSnapshotCompareLiveFreshnessSchema>;
export type DbSnapshotCompareSource = z.infer<typeof dbSnapshotCompareSourceSchema>;
export type DbSnapshotCompareScope = z.infer<typeof dbSnapshotCompareScopeSchema>;
export type DbSnapshotCompareResolvedSource = z.infer<typeof dbSnapshotCompareResolvedSourceSchema>;
export type DbSnapshotCompareContext = z.infer<typeof dbSnapshotCompareContextSchema>;
export type DbSnapshotCompareWarning = z.infer<typeof dbSnapshotCompareWarningSchema>;
export type DbSnapshotCompareArtifact = z.infer<typeof dbSnapshotCompareArtifactSchema>;
export type DbSnapshotCompareRequest = z.infer<typeof dbSnapshotCompareRequestSchema>;
export type DbSnapshotCompareResponse = z.infer<typeof dbSnapshotCompareResponseSchema>;
export type DbSnapshotCompareReportFormat = z.infer<typeof dbSnapshotCompareReportFormatSchema>;
export type DbSnapshotCompareReportRequest = z.infer<typeof dbSnapshotCompareReportRequestSchema>;
export type DbSnapshotCompareReportResponse = z.infer<typeof dbSnapshotCompareReportResponseSchema>;
export type DbSnapshotCompareWorkspaceState = z.infer<typeof dbSnapshotCompareWorkspaceStateSchema>;
export type DbLiveExportIssueKind = z.infer<typeof dbLiveExportIssueKindSchema>;
export type DbLiveExportIssueSeverity = z.infer<typeof dbLiveExportIssueSeveritySchema>;
export type DbLiveExportIssue = z.infer<typeof dbLiveExportIssueSchema>;
export type DbLiveExportIssueSummary = z.infer<typeof dbLiveExportIssueSummarySchema>;
export type DbLiveExportPreviewArtifact = z.infer<typeof dbLiveExportPreviewArtifactSchema>;
export type DbLiveExportPreviewRequest = z.infer<typeof dbLiveExportPreviewRequestSchema>;
export type DbLiveExportPreviewResponse = z.infer<typeof dbLiveExportPreviewResponseSchema>;
export type DbLiveExportExecuteRequest = z.infer<typeof dbLiveExportExecuteRequestSchema>;
export type DbLiveExportExecuteResponse = z.infer<typeof dbLiveExportExecuteResponseSchema>;
export type DbHistoryCompareSourceKind = z.infer<typeof dbHistoryCompareSourceKindSchema>;
export type DbHistoryCompareSource = z.infer<typeof dbHistoryCompareSourceSchema>;
export type DbHistoryCompareScope = z.infer<typeof dbHistoryCompareScopeSchema>;
export type DbSchemaScanEventType = z.infer<typeof dbSchemaScanEventTypeSchema>;
export type DbSchemaScanEvent = z.infer<typeof dbSchemaScanEventSchema>;
export type DbHistoryListRequest = z.infer<typeof dbHistoryListRequestSchema>;
export type DbHistoryEntry = z.infer<typeof dbHistoryEntrySchema>;
export type DbHistoryListResponse = z.infer<typeof dbHistoryListResponseSchema>;
export type DbHistoryDetailResponse = z.infer<typeof dbHistoryDetailResponseSchema>;
export type DbHistoryCompareContext = z.infer<typeof dbHistoryCompareContextSchema>;
export type DbHistoryCompareRequest = z.infer<typeof dbHistoryCompareRequestSchema>;
export type DbHistoryCompareResponse = z.infer<typeof dbHistoryCompareResponseSchema>;
export type DbApplySelection = z.infer<typeof dbApplySelectionSchema>;
export type DbDeployJobStatus = z.infer<typeof dbDeployJobStatusSchema>;
export type DbDeployJobSummary = z.infer<typeof dbDeployJobSummarySchema>;
export type DbApplyRequest = z.infer<typeof dbApplyRequestSchema>;
export type DbDeployJob = z.infer<typeof dbDeployJobSchema>;
export type DbDeployJobStatementStatus = z.infer<typeof dbDeployJobStatementStatusSchema>;
export type DbDeployJobStatementResult = z.infer<typeof dbDeployJobStatementResultSchema>;
export type DbApplyResponse = z.infer<typeof dbApplyResponseSchema>;
export type DbDeployJobDetailResponse = z.infer<typeof dbDeployJobDetailResponseSchema>;
export type DbGraphMode = z.infer<typeof dbGraphModeSchema>;
export type DbGraphNode = z.infer<typeof dbGraphNodeSchema>;
export type DbGraphEdge = z.infer<typeof dbGraphEdgeSchema>;
export type DbGraphRequest = z.infer<typeof dbGraphRequestSchema>;
export type DbGraphResponse = z.infer<typeof dbGraphResponseSchema>;
export type DbVsDbGraphRequest = z.infer<typeof dbVsDbGraphRequestSchema>;
export type DbVsDbGraphResponse = z.infer<typeof dbVsDbGraphResponseSchema>;
export type DbVsDbWorkspaceState = z.infer<typeof dbVsDbWorkspaceStateSchema>;
export type DbSelectDatabaseRequest = z.infer<typeof dbSelectDatabaseRequestSchema>;
export type DbSchemaIntrospectRequest = z.infer<typeof dbSchemaIntrospectRequestSchema>;
export type DbSchemaIntrospectResponse = z.infer<typeof dbSchemaIntrospectResponseSchema>;
export type DbDiffScope = z.infer<typeof dbDiffScopeSchema>;
export type DbDiffAction = z.infer<typeof dbDiffActionSchema>;
export type DbDiffEntityType = z.infer<typeof dbDiffEntityTypeSchema>;
export type DbRenameDecision = z.infer<typeof dbRenameDecisionSchema>;
export type DbDiffBlockerCode = z.infer<typeof dbDiffBlockerCodeSchema>;
export type DbDiffBlockerSeverity = z.infer<typeof dbDiffBlockerSeveritySchema>;
export type DbSqlStatementKind = z.infer<typeof dbSqlStatementKindSchema>;
export type DbFileColumn = z.infer<typeof dbFileColumnSchema>;
export type DbFileTable = z.infer<typeof dbFileTableSchema>;
export type DbDiffBlocker = z.infer<typeof dbDiffBlockerSchema>;
export type DbRenameSuggestion = z.infer<typeof dbRenameSuggestionSchema>;
export type DbDiffColumnChange = z.infer<typeof dbDiffColumnChangeSchema>;
export type DbDiffTableChange = z.infer<typeof dbDiffTableChangeSchema>;
export type DbDiffSummary = z.infer<typeof dbDiffSummarySchema>;
export type DbDiffContext = z.infer<typeof dbDiffContextSchema>;
export type DbDiffPreviewRequest = z.infer<typeof dbDiffPreviewRequestSchema>;
export type DbRenameDecisionItem = z.infer<typeof dbRenameDecisionItemSchema>;
export type DbDiffConfirmRenamesRequest = z.infer<typeof dbDiffConfirmRenamesRequestSchema>;
export type DbDiffPreviewResponse = z.infer<typeof dbDiffPreviewResponseSchema>;
export type DbSqlPreviewStatement = z.infer<typeof dbSqlPreviewStatementSchema>;
export type DbSqlPreviewArtifact = z.infer<typeof dbSqlPreviewArtifactSchema>;
export type DbSqlPreviewRequest = z.infer<typeof dbSqlPreviewRequestSchema>;
export type DbSqlPreviewResponse = z.infer<typeof dbSqlPreviewResponseSchema>;
export type DbDryRunRequest = z.infer<typeof dbDryRunRequestSchema>;
export type DbDryRunSummary = z.infer<typeof dbDryRunSummarySchema>;
export type DbDryRunResponse = z.infer<typeof dbDryRunResponseSchema>;
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
