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
        max_consecutive_empty_rows INTEGER NOT NULL DEFAULT 10,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
        maxConsecutiveEmptyRows: 10,
      });
      console.log("Default settings inserted");
    }

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  }
}
