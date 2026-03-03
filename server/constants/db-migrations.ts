import { DB_INIT_SQL } from "./db-init";

export const DB_MIGRATION_SQL = {
  createSchemaMigrationsTable: `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  listAppliedVersions: "SELECT version FROM schema_migrations",
  insertAppliedVersion: "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
} as const;

export interface DbMigrationDefinition {
  version: number;
  name: string;
  statements: string[];
  ensureDdlSettingsCompatColumns?: boolean;
}

export const DB_MIGRATIONS: DbMigrationDefinition[] = [
  {
    version: 1,
    name: "create_uploaded_files",
    statements: [DB_INIT_SQL.createUploadedFilesTable, DB_INIT_SQL.createUploadedFilesHashUniqueIndex],
  },
  {
    version: 2,
    name: "create_ddl_settings",
    statements: [DB_INIT_SQL.createDdlSettingsTable],
    ensureDdlSettingsCompatColumns: true,
  },
  {
    version: 3,
    name: "create_processing_tasks",
    statements: [DB_INIT_SQL.createProcessingTasksTable],
  },
  {
    version: 4,
    name: "create_name_fix_tables",
    statements: [
      DB_INIT_SQL.createNameFixJobsTable,
      DB_INIT_SQL.createNameFixJobItemsTable,
      DB_INIT_SQL.createNameFixBackupsTable,
    ],
  },
] as const;
