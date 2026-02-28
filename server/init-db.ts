import { db } from "./db";
import { uploadedFiles, ddlSettings, processingTasks } from "@shared/schema";
import { sql } from "drizzle-orm";

/**
 * 初始化 SQLite 数据库
 * 创建表并插入默认设置
 */
export async function initializeDatabase() {
  try {
    console.log("Initializing SQLite database...");

    // 创建表（如果不存在）
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS ddl_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mysql_engine TEXT NOT NULL DEFAULT 'InnoDB',
        mysql_charset TEXT NOT NULL DEFAULT 'utf8mb4',
        mysql_collate TEXT NOT NULL DEFAULT 'utf8mb4_bin',
        varchar_charset TEXT NOT NULL DEFAULT 'utf8mb4',
        varchar_collate TEXT NOT NULL DEFAULT 'utf8mb4_bin',
        export_filename_prefix TEXT NOT NULL DEFAULT 'Crt_',
        export_filename_suffix TEXT NOT NULL DEFAULT '',
        include_comment_header INTEGER NOT NULL DEFAULT 1,
        author_name TEXT NOT NULL DEFAULT 'ISI',
        include_set_names INTEGER NOT NULL DEFAULT 1,
        include_drop_table INTEGER NOT NULL DEFAULT 1,
        download_path TEXT,
        excel_read_path TEXT,
        custom_header_template TEXT,
        use_custom_header INTEGER NOT NULL DEFAULT 0,
        mysql_data_type_case TEXT NOT NULL DEFAULT 'lower',
        mysql_boolean_mode TEXT NOT NULL DEFAULT 'tinyint(1)',
        pk_markers TEXT NOT NULL DEFAULT '["\\u3007"]',
        max_consecutive_empty_rows INTEGER NOT NULL DEFAULT 10,
        upload_rate_limit_window_ms INTEGER NOT NULL DEFAULT 60000,
        upload_rate_limit_max_requests INTEGER NOT NULL DEFAULT 20,
        parse_rate_limit_window_ms INTEGER NOT NULL DEFAULT 60000,
        parse_rate_limit_max_requests INTEGER NOT NULL DEFAULT 40,
        global_protect_rate_limit_window_ms INTEGER NOT NULL DEFAULT 60000,
        global_protect_rate_limit_max_requests INTEGER NOT NULL DEFAULT 240,
        global_protect_max_inflight INTEGER NOT NULL DEFAULT 80,
        prewarm_enabled INTEGER NOT NULL DEFAULT 1,
        prewarm_max_concurrency INTEGER NOT NULL DEFAULT 1,
        prewarm_queue_max INTEGER NOT NULL DEFAULT 12,
        prewarm_max_file_mb INTEGER NOT NULL DEFAULT 20,
        task_manager_max_queue_length INTEGER NOT NULL DEFAULT 200,
        task_manager_stale_pending_ms INTEGER NOT NULL DEFAULT 1800000,
        name_fix_default_mode TEXT NOT NULL DEFAULT 'copy',
        name_fix_conflict_strategy TEXT NOT NULL DEFAULT 'suffix_increment',
        name_fix_reserved_word_strategy TEXT NOT NULL DEFAULT 'prefix',
        name_fix_length_overflow_strategy TEXT NOT NULL DEFAULT 'truncate_hash',
        name_fix_max_identifier_length INTEGER NOT NULL DEFAULT 64,
        name_fix_backup_retention_days INTEGER NOT NULL DEFAULT 30,
        name_fix_max_batch_concurrency INTEGER NOT NULL DEFAULT 4,
        allow_overwrite_in_electron INTEGER NOT NULL DEFAULT 1,
        allow_external_path_write INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 旧版本兼容：如果历史表缺少新列则补齐
    const ddlSettingsColumns = await db.all(sql`PRAGMA table_info(ddl_settings)`) as Array<{ name: string }>;
    const ddlSettingsColumnNames = new Set(ddlSettingsColumns.map((col) => col.name));
    if (!ddlSettingsColumnNames.has("mysql_data_type_case")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN mysql_data_type_case TEXT NOT NULL DEFAULT 'lower'`);
    }
    if (!ddlSettingsColumnNames.has("mysql_boolean_mode")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN mysql_boolean_mode TEXT NOT NULL DEFAULT 'tinyint(1)'`);
    }
    if (!ddlSettingsColumnNames.has("pk_markers")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN pk_markers TEXT NOT NULL DEFAULT '["\\u3007"]'`);
    }
    if (!ddlSettingsColumnNames.has("upload_rate_limit_window_ms")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN upload_rate_limit_window_ms INTEGER NOT NULL DEFAULT 60000`);
    }
    if (!ddlSettingsColumnNames.has("upload_rate_limit_max_requests")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN upload_rate_limit_max_requests INTEGER NOT NULL DEFAULT 20`);
    }
    if (!ddlSettingsColumnNames.has("parse_rate_limit_window_ms")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN parse_rate_limit_window_ms INTEGER NOT NULL DEFAULT 60000`);
    }
    if (!ddlSettingsColumnNames.has("parse_rate_limit_max_requests")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN parse_rate_limit_max_requests INTEGER NOT NULL DEFAULT 40`);
    }
    if (!ddlSettingsColumnNames.has("global_protect_rate_limit_window_ms")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN global_protect_rate_limit_window_ms INTEGER NOT NULL DEFAULT 60000`);
    }
    if (!ddlSettingsColumnNames.has("global_protect_rate_limit_max_requests")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN global_protect_rate_limit_max_requests INTEGER NOT NULL DEFAULT 240`);
    }
    if (!ddlSettingsColumnNames.has("global_protect_max_inflight")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN global_protect_max_inflight INTEGER NOT NULL DEFAULT 80`);
    }
    if (!ddlSettingsColumnNames.has("prewarm_enabled")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN prewarm_enabled INTEGER NOT NULL DEFAULT 1`);
    }
    if (!ddlSettingsColumnNames.has("prewarm_max_concurrency")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN prewarm_max_concurrency INTEGER NOT NULL DEFAULT 1`);
    }
    if (!ddlSettingsColumnNames.has("prewarm_queue_max")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN prewarm_queue_max INTEGER NOT NULL DEFAULT 12`);
    }
    if (!ddlSettingsColumnNames.has("prewarm_max_file_mb")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN prewarm_max_file_mb INTEGER NOT NULL DEFAULT 20`);
    }
    if (!ddlSettingsColumnNames.has("task_manager_max_queue_length")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN task_manager_max_queue_length INTEGER NOT NULL DEFAULT 200`);
    }
    if (!ddlSettingsColumnNames.has("task_manager_stale_pending_ms")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN task_manager_stale_pending_ms INTEGER NOT NULL DEFAULT 1800000`);
    }
    if (!ddlSettingsColumnNames.has("name_fix_default_mode")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN name_fix_default_mode TEXT NOT NULL DEFAULT 'copy'`);
    }
    if (!ddlSettingsColumnNames.has("name_fix_conflict_strategy")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN name_fix_conflict_strategy TEXT NOT NULL DEFAULT 'suffix_increment'`);
    }
    if (!ddlSettingsColumnNames.has("name_fix_reserved_word_strategy")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN name_fix_reserved_word_strategy TEXT NOT NULL DEFAULT 'prefix'`);
    }
    if (!ddlSettingsColumnNames.has("name_fix_length_overflow_strategy")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN name_fix_length_overflow_strategy TEXT NOT NULL DEFAULT 'truncate_hash'`);
    }
    if (!ddlSettingsColumnNames.has("name_fix_max_identifier_length")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN name_fix_max_identifier_length INTEGER NOT NULL DEFAULT 64`);
    }
    if (!ddlSettingsColumnNames.has("name_fix_backup_retention_days")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN name_fix_backup_retention_days INTEGER NOT NULL DEFAULT 30`);
    }
    if (!ddlSettingsColumnNames.has("name_fix_max_batch_concurrency")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN name_fix_max_batch_concurrency INTEGER NOT NULL DEFAULT 4`);
    }
    if (!ddlSettingsColumnNames.has("allow_overwrite_in_electron")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN allow_overwrite_in_electron INTEGER NOT NULL DEFAULT 1`);
    }
    if (!ddlSettingsColumnNames.has("allow_external_path_write")) {
      await db.run(sql`ALTER TABLE ddl_settings ADD COLUMN allow_external_path_write INTEGER NOT NULL DEFAULT 0`);
    }

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS processing_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER,
        task_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        progress INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        result TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS name_fix_jobs (
        id TEXT PRIMARY KEY,
        file_id INTEGER NOT NULL,
        plan_id TEXT NOT NULL,
        plan_hash TEXT NOT NULL,
        mode TEXT NOT NULL,
        scope TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        source_path TEXT NOT NULL,
        output_path TEXT,
        backup_path TEXT,
        report_json_path TEXT,
        report_text_path TEXT,
        conflict_strategy TEXT NOT NULL,
        reserved_word_strategy TEXT NOT NULL,
        length_overflow_strategy TEXT NOT NULL,
        max_identifier_length INTEGER NOT NULL DEFAULT 64,
        changed_table_count INTEGER NOT NULL DEFAULT 0,
        changed_column_count INTEGER NOT NULL DEFAULT 0,
        blocking_conflict_count INTEGER NOT NULL DEFAULT 0,
        unresolved_source_ref_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS name_fix_job_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        file_id INTEGER NOT NULL,
        sheet_name TEXT NOT NULL,
        table_index INTEGER NOT NULL,
        column_index INTEGER,
        target TEXT NOT NULL,
        before_name TEXT NOT NULL,
        after_name TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT,
        source_address TEXT,
        blocking INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS name_fix_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        file_id INTEGER NOT NULL,
        source_path TEXT NOT NULL,
        backup_path TEXT NOT NULL,
        backup_hash TEXT NOT NULL,
        restorable INTEGER NOT NULL DEFAULT 1,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 检查是否已有默认设置
    const existingSettings = await db.select().from(ddlSettings).limit(1);

    if (existingSettings.length === 0) {
      // 插入默认设置
      await db.insert(ddlSettings).values({
        mysqlEngine: "InnoDB",
        mysqlCharset: "utf8mb4",
        mysqlCollate: "utf8mb4_bin",
        varcharCharset: "utf8mb4",
        varcharCollate: "utf8mb4_bin",
        exportFilenamePrefix: "Crt_",
        exportFilenameSuffix: "",
        includeCommentHeader: true,
        authorName: "ISI",
        includeSetNames: true,
        includeDropTable: true,
        mysqlDataTypeCase: "lower",
        mysqlBooleanMode: "tinyint(1)",
        pkMarkers: "[\"\\u3007\"]",
        maxConsecutiveEmptyRows: 10,
        uploadRateLimitWindowMs: 60000,
        uploadRateLimitMaxRequests: 20,
        parseRateLimitWindowMs: 60000,
        parseRateLimitMaxRequests: 40,
        globalProtectRateLimitWindowMs: 60000,
        globalProtectRateLimitMaxRequests: 240,
        globalProtectMaxInFlight: 80,
        prewarmEnabled: true,
        prewarmMaxConcurrency: 1,
        prewarmQueueMax: 12,
        prewarmMaxFileMb: 20,
        taskManagerMaxQueueLength: 200,
        taskManagerStalePendingMs: 1800000,
        nameFixDefaultMode: "copy",
        nameFixConflictStrategy: "suffix_increment",
        nameFixReservedWordStrategy: "prefix",
        nameFixLengthOverflowStrategy: "truncate_hash",
        nameFixMaxIdentifierLength: 64,
        nameFixBackupRetentionDays: 30,
        nameFixMaxBatchConcurrency: 4,
        allowOverwriteInElectron: true,
        allowExternalPathWrite: false,
      });
      console.log("Default settings inserted");
    }

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  }
}
