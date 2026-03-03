export const DB_INIT_SQL = {
  createUploadedFilesTable: `
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `,
  createUploadedFilesHashUniqueIndex: `
    CREATE UNIQUE INDEX IF NOT EXISTS uploaded_files_file_hash_unique
    ON uploaded_files(file_hash)
  `,
  createDdlSettingsTable: `
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
      pk_markers TEXT NOT NULL DEFAULT '["\\\\u3007"]',
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
  `,
  createProcessingTasksTable: `
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
  `,
  createNameFixJobsTable: `
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
  `,
  createNameFixJobItemsTable: `
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
  `,
  createNameFixBackupsTable: `
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
  `,
} as const;

export interface DdlSettingsCompatColumn {
  name: string;
  sql: string;
}

export const DDL_SETTINGS_COMPAT_COLUMNS: DdlSettingsCompatColumn[] = [
  { name: "mysql_data_type_case", sql: "ALTER TABLE ddl_settings ADD COLUMN mysql_data_type_case TEXT NOT NULL DEFAULT 'lower'" },
  { name: "mysql_boolean_mode", sql: "ALTER TABLE ddl_settings ADD COLUMN mysql_boolean_mode TEXT NOT NULL DEFAULT 'tinyint(1)'" },
  { name: "pk_markers", sql: "ALTER TABLE ddl_settings ADD COLUMN pk_markers TEXT NOT NULL DEFAULT '[\"\\\\u3007\"]'" },
  { name: "custom_header_template", sql: "ALTER TABLE ddl_settings ADD COLUMN custom_header_template TEXT" },
  { name: "use_custom_header", sql: "ALTER TABLE ddl_settings ADD COLUMN use_custom_header INTEGER NOT NULL DEFAULT 0" },
  { name: "max_consecutive_empty_rows", sql: "ALTER TABLE ddl_settings ADD COLUMN max_consecutive_empty_rows INTEGER NOT NULL DEFAULT 10" },
  { name: "upload_rate_limit_window_ms", sql: "ALTER TABLE ddl_settings ADD COLUMN upload_rate_limit_window_ms INTEGER NOT NULL DEFAULT 60000" },
  { name: "upload_rate_limit_max_requests", sql: "ALTER TABLE ddl_settings ADD COLUMN upload_rate_limit_max_requests INTEGER NOT NULL DEFAULT 20" },
  { name: "parse_rate_limit_window_ms", sql: "ALTER TABLE ddl_settings ADD COLUMN parse_rate_limit_window_ms INTEGER NOT NULL DEFAULT 60000" },
  { name: "parse_rate_limit_max_requests", sql: "ALTER TABLE ddl_settings ADD COLUMN parse_rate_limit_max_requests INTEGER NOT NULL DEFAULT 40" },
  { name: "global_protect_rate_limit_window_ms", sql: "ALTER TABLE ddl_settings ADD COLUMN global_protect_rate_limit_window_ms INTEGER NOT NULL DEFAULT 60000" },
  { name: "global_protect_rate_limit_max_requests", sql: "ALTER TABLE ddl_settings ADD COLUMN global_protect_rate_limit_max_requests INTEGER NOT NULL DEFAULT 240" },
  { name: "global_protect_max_inflight", sql: "ALTER TABLE ddl_settings ADD COLUMN global_protect_max_inflight INTEGER NOT NULL DEFAULT 80" },
  { name: "prewarm_enabled", sql: "ALTER TABLE ddl_settings ADD COLUMN prewarm_enabled INTEGER NOT NULL DEFAULT 1" },
  { name: "prewarm_max_concurrency", sql: "ALTER TABLE ddl_settings ADD COLUMN prewarm_max_concurrency INTEGER NOT NULL DEFAULT 1" },
  { name: "prewarm_queue_max", sql: "ALTER TABLE ddl_settings ADD COLUMN prewarm_queue_max INTEGER NOT NULL DEFAULT 12" },
  { name: "prewarm_max_file_mb", sql: "ALTER TABLE ddl_settings ADD COLUMN prewarm_max_file_mb INTEGER NOT NULL DEFAULT 20" },
  { name: "task_manager_max_queue_length", sql: "ALTER TABLE ddl_settings ADD COLUMN task_manager_max_queue_length INTEGER NOT NULL DEFAULT 200" },
  { name: "task_manager_stale_pending_ms", sql: "ALTER TABLE ddl_settings ADD COLUMN task_manager_stale_pending_ms INTEGER NOT NULL DEFAULT 1800000" },
  { name: "name_fix_default_mode", sql: "ALTER TABLE ddl_settings ADD COLUMN name_fix_default_mode TEXT NOT NULL DEFAULT 'copy'" },
  { name: "name_fix_conflict_strategy", sql: "ALTER TABLE ddl_settings ADD COLUMN name_fix_conflict_strategy TEXT NOT NULL DEFAULT 'suffix_increment'" },
  { name: "name_fix_reserved_word_strategy", sql: "ALTER TABLE ddl_settings ADD COLUMN name_fix_reserved_word_strategy TEXT NOT NULL DEFAULT 'prefix'" },
  { name: "name_fix_length_overflow_strategy", sql: "ALTER TABLE ddl_settings ADD COLUMN name_fix_length_overflow_strategy TEXT NOT NULL DEFAULT 'truncate_hash'" },
  { name: "name_fix_max_identifier_length", sql: "ALTER TABLE ddl_settings ADD COLUMN name_fix_max_identifier_length INTEGER NOT NULL DEFAULT 64" },
  { name: "name_fix_backup_retention_days", sql: "ALTER TABLE ddl_settings ADD COLUMN name_fix_backup_retention_days INTEGER NOT NULL DEFAULT 30" },
  { name: "name_fix_max_batch_concurrency", sql: "ALTER TABLE ddl_settings ADD COLUMN name_fix_max_batch_concurrency INTEGER NOT NULL DEFAULT 4" },
  { name: "allow_overwrite_in_electron", sql: "ALTER TABLE ddl_settings ADD COLUMN allow_overwrite_in_electron INTEGER NOT NULL DEFAULT 1" },
  { name: "allow_external_path_write", sql: "ALTER TABLE ddl_settings ADD COLUMN allow_external_path_write INTEGER NOT NULL DEFAULT 0" },
];

