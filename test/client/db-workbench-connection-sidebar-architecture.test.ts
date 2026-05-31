import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { buildConnectionSidebarModel } from "../../client/src/components/extensions/db-workbench/connection-sidebar-model";
import type {
  DbConnectionConfig,
  DbSchemaSnapshot,
} from "../../shared/schema";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

function connection(overrides: Partial<DbConnectionConfig> = {}): DbConnectionConfig {
  return {
    id: "conn",
    name: "Local",
    driver: "postgres",
    host: "localhost",
    port: 5432,
    database: "app",
    username: "app",
    password: "",
    environment: "dev",
    readonly: false,
    defaultSchema: "tenant",
    ...overrides,
  };
}

function snapshot(): DbSchemaSnapshot {
  return {
    connectionId: "conn",
    connectionName: "Local",
    database: "app",
    schema: "tenant",
    tables: [
      { name: "orders", columns: [{ name: "id", dataType: "int", nullable: false, primaryKey: true }] },
      { name: "users", columns: [{ name: "email", dataType: "text", nullable: true, primaryKey: false }] },
    ],
    views: [{ name: "active_users", columns: [] }],
    routines: [{ name: "refresh_users", kind: "function" }],
    triggers: [{ name: "orders_audit", tableName: "orders", event: "insert" }],
    sequences: [{ name: "users_id_seq" }],
  };
}

test("connection sidebar shell delegates model derivation and local chrome sections", async () => {
  const sidebar = await read(
    "client/src/components/extensions/db-workbench/ConnectionSidebar.tsx",
  );
  const model = await read(
    "client/src/components/extensions/db-workbench/connection-sidebar-model.ts",
  );
  const sections = await read(
    "client/src/components/extensions/db-workbench/connection-sidebar-sections.tsx",
  );

  assert.match(sidebar, /buildConnectionSidebarModel/);
  assert.match(sidebar, /<ConnectionSidebarObjectExplorerHeader/);
  assert.match(sidebar, /<ConnectionSidebarObjectFilter/);
  assert.match(sidebar, /<ConnectionSidebarObjectExplorer/);
  assert.match(sidebar, /<ConnectionSidebarTableStructure/);
  assert.doesNotMatch(sidebar, /tableMatchesFilter/);
  assert.doesNotMatch(sidebar, /Search tables, views, routines/);
  assert.doesNotMatch(sidebar, /Refresh schema/);

  assert.match(model, /tableMatchesFilter/);
  assert.match(model, /buildSchemaSelectOptions/);
  assert.match(model, /buildFilteredExplorerSummary/);
  assert.match(model, /buildConnectionState/);

  assert.match(sections, /Object Explorer/);
  assert.match(sections, /Search tables, views, routines, triggers, sequences/);
  assert.match(sections, /Refresh schema/);
});

test("connection sidebar model preserves schema options filtering and selected table semantics", () => {
  const model = buildConnectionSidebarModel({
    connection: connection(),
    activeSchema: "public",
    schemaOptions: ["audit", " public ", ""],
    schemaSnapshot: snapshot(),
    schemaError: null,
    isSchemaLoading: false,
    objectFilter: "email",
    selectedTableName: "orders",
    inspectedObjectKind: "table",
    inspectedObjectName: "users",
  });

  assert.deepEqual(model.schemaSelectOptions, ["audit", "public", "tenant"]);
  assert.equal(model.effectiveSchema, "public");
  assert.equal(model.visibleTables.length, 1);
  assert.equal(model.visibleTables[0]?.name, "users");
  assert.equal(model.selectedTable?.name, "users");
  assert.equal(model.isSelectedTableInspected, true);
  assert.equal(model.connectionStateLabel, "Connected");
  assert.match(model.filteredSummary, /1\/2 tables/);
});
