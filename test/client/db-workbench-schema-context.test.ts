import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbConnectionConfig,
  DbSchemaSnapshot,
} from "../../shared/schema";
import { createEmptySqlWorkbenchMemory } from "../../client/src/components/extensions/db-workbench/sql-memory";
import { buildWorkbenchSchemaContext } from "../../client/src/components/extensions/db-workbench/workbench-schema-context";

const postgresConnection: Pick<
  DbConnectionConfig,
  "driver" | "defaultSchema"
> = {
  driver: "postgres",
  defaultSchema: "app",
};

const schemaSnapshot: DbSchemaSnapshot = {
  connectionId: "conn-1",
  connectionName: "Local app",
  database: "app_db",
  schema: "reporting",
  tables: [
    {
      name: "users",
      columns: [
        {
          name: "id",
          dataType: "integer",
          nullable: false,
          primaryKey: true,
        },
      ],
    },
  ],
  views: [],
  routines: [],
  triggers: [],
  sequences: [],
};

test("schema context centralizes schema options, autocomplete scope, and errors", () => {
  const context = buildWorkbenchSchemaContext({
    connection: postgresConnection,
    activeSchema: "reporting",
    runtimeSchema: "reporting",
    schemaOptionsRaw: [" public ", "analytics", "app"],
    schemaSnapshot,
    schemaQueryError: new Error("Error invoking introspect: refused"),
    selectedTableName: "users",
    sqlMemory: createEmptySqlWorkbenchMemory(),
  });

  assert.deepEqual(context.schemaOptions, [
    "analytics",
    "app",
    "public",
    "reporting",
  ]);
  assert.equal(context.autocompleteContext.driver, "postgres");
  assert.equal(context.autocompleteContext.activeSchema, "reporting");
  assert.equal(context.autocompleteContext.selectedRelation, "users");
  assert.match(context.schemaErrorMessage ?? "", /refused/);
});

test("schema context keeps mysql schema options empty while preserving autocomplete driver", () => {
  const context = buildWorkbenchSchemaContext({
    connection: {
      driver: "mysql",
      defaultSchema: "ignored",
    },
    activeSchema: "ignored",
    runtimeSchema: undefined,
    schemaOptionsRaw: ["other"],
    schemaSnapshot: null,
    schemaQueryError: null,
    selectedTableName: null,
    sqlMemory: createEmptySqlWorkbenchMemory(),
  });

  assert.deepEqual(context.schemaOptions, []);
  assert.equal(context.autocompleteContext.driver, "mysql");
  assert.equal(context.autocompleteContext.activeSchema, "public");
  assert.equal(context.schemaErrorMessage, null);
});
