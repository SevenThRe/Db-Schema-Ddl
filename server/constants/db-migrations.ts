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
  {
    version: 5,
    name: "create_schema_diff_tables",
    statements: [
      DB_INIT_SQL.createSchemaSnapshotsTable,
      DB_INIT_SQL.createSchemaSnapshotsUniqueIndex,
      DB_INIT_SQL.createVersionLinksTable,
      DB_INIT_SQL.createVersionLinksPairUniqueIndex,
      DB_INIT_SQL.createSchemaDiffsTable,
      DB_INIT_SQL.createSchemaDiffsCacheUniqueIndex,
      DB_INIT_SQL.createDiffRenameDecisionsTable,
      DB_INIT_SQL.createDiffRenameDecisionsUniqueIndex,
    ],
  },
  {
    version: 6,
    name: "add_uploaded_files_original_modified_at",
    statements: [
      "ALTER TABLE uploaded_files ADD COLUMN original_modified_at TEXT",
    ],
  },
  {
    version: 7,
    name: "create_installed_extensions",
    statements: [
      DB_INIT_SQL.createInstalledExtensionsTable,
      DB_INIT_SQL.createInstalledExtensionsUniqueIndex,
    ],
  },
  {
    version: 8,
    name: "create_extension_lifecycle_states",
    statements: [
      DB_INIT_SQL.createExtensionLifecycleStatesTable,
      DB_INIT_SQL.createExtensionLifecycleStatesUniqueIndex,
    ],
  },
  {
    version: 9,
    name: "create_db_management_tables",
    statements: [
      DB_INIT_SQL.createDbConnectionsTable,
      DB_INIT_SQL.createDbConnectionsUniqueIndex,
      DB_INIT_SQL.createDbSchemaSnapshotsTable,
      DB_INIT_SQL.createDbSchemaSnapshotsUniqueIndex,
    ],
  },
] as const;
