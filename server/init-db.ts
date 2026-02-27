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
      });
      console.log("Default settings inserted");
    }

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  }
}
