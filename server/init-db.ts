import { db } from "./db";
import { ddlSettings } from "@shared/schema";
import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@shared/schema";
import { createDefaultDdlSettings } from "@shared/config";
import { DDL_SETTINGS_COMPAT_COLUMNS, DB_INIT_SQL } from "./constants/db-init";
import { DB_MIGRATIONS, DB_MIGRATION_SQL } from "./constants/db-migrations";

interface SqliteTableInfoRow {
  name: string;
}

interface MigrationVersionRow {
  version: number;
}

type SqliteDatabaseConnection = BetterSQLite3Database<typeof schema>;

function requireDatabaseConnection(): SqliteDatabaseConnection {
  if (!db) {
    throw new Error("Database connection is not configured.");
  }
  return db as SqliteDatabaseConnection;
}

async function executeSql(statement: string): Promise<void> {
  const sqliteDb = requireDatabaseConnection();
  await sqliteDb.run(sql.raw(statement));
}

async function ensureDdlSettingsCompatColumns(): Promise<void> {
  const sqliteDb = requireDatabaseConnection();
  const ddlSettingsColumns = (await sqliteDb.all(sql`PRAGMA table_info(ddl_settings)`)) as SqliteTableInfoRow[];
  const ddlSettingsColumnNames = new Set(ddlSettingsColumns.map((column) => column.name));

  for (const column of DDL_SETTINGS_COMPAT_COLUMNS) {
    if (!ddlSettingsColumnNames.has(column.name)) {
      await executeSql(column.sql);
    }
  }
}

async function ensureSchemaMigrationsTable(): Promise<void> {
  await executeSql(DB_MIGRATION_SQL.createSchemaMigrationsTable);
}

async function getAppliedMigrationVersions(): Promise<Set<number>> {
  const sqliteDb = requireDatabaseConnection();
  const rows = (await sqliteDb.all(sql.raw(DB_MIGRATION_SQL.listAppliedVersions))) as MigrationVersionRow[];
  return new Set(rows.map((row) => Number(row.version)));
}

async function markMigrationApplied(version: number, name: string): Promise<void> {
  const sqliteDb = requireDatabaseConnection();
  await sqliteDb.run(sql`INSERT INTO schema_migrations (version, name) VALUES (${version}, ${name})`);
}

async function applyPendingMigrations(): Promise<void> {
  await ensureSchemaMigrationsTable();
  const appliedVersions = await getAppliedMigrationVersions();

  for (const migration of DB_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    console.log(`[db-migrate] applying v${migration.version} ${migration.name}`);
    for (const statement of migration.statements) {
      await executeSql(statement);
    }
    if (migration.ensureDdlSettingsCompatColumns) {
      await ensureDdlSettingsCompatColumns();
    }
    await markMigrationApplied(migration.version, migration.name);
  }
}

/**
 * 初始化 SQLite 数据库
 * 创建表并插入默认设置
 */
export async function initializeDatabase() {
  try {
    console.log("Initializing SQLite database...");
    await applyPendingMigrations();
    // Keep this safeguard for legacy DBs that predate schema_migrations.
    await executeSql(DB_INIT_SQL.createDdlSettingsTable);
    await executeSql(DB_INIT_SQL.createInstalledExtensionsTable);
    await executeSql(DB_INIT_SQL.createInstalledExtensionsUniqueIndex);
    await executeSql(DB_INIT_SQL.createExtensionLifecycleStatesTable);
    await executeSql(DB_INIT_SQL.createExtensionLifecycleStatesUniqueIndex);
    await executeSql(DB_INIT_SQL.createDbConnectionsTable);
    await executeSql(DB_INIT_SQL.createDbConnectionsUniqueIndex);
    await executeSql(DB_INIT_SQL.createDbSchemaSnapshotsTable);
    await executeSql(DB_INIT_SQL.createDbSchemaSnapshotsUniqueIndex);
    await executeSql(DB_INIT_SQL.createDbSchemaScanEventsTable);
    await executeSql(DB_INIT_SQL.createDbSchemaScanEventsUniqueIndex);
    await executeSql(DB_INIT_SQL.createDbDeployJobsTable);
    await executeSql(DB_INIT_SQL.createDbDeployJobsCompareHashUniqueIndex);
    await executeSql(DB_INIT_SQL.createDbDeployJobStatementResultsTable);
    await executeSql(DB_INIT_SQL.createDbDeployJobStatementResultsUniqueIndex);
    await executeSql(DB_INIT_SQL.createDbComparePoliciesTable);
    await ensureDdlSettingsCompatColumns();

    // 检查是否已有默认设置
    const sqliteDb = requireDatabaseConnection();
    const existingSettings = await sqliteDb.select().from(ddlSettings).limit(1);

    if (existingSettings.length === 0) {
      // 插入默认设置
      const defaultSettings = createDefaultDdlSettings();
      await sqliteDb.insert(ddlSettings).values({
        ...defaultSettings,
        pkMarkers: JSON.stringify(defaultSettings.pkMarkers),
      });
      console.log("Default settings inserted");
    }

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  }
}
