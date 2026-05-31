import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSchemaLoadFailureNotice,
  buildSchemaOptions,
  buildSchemaOptionsFailureNotice,
  buildSchemaSwitchFailureNotice,
  normalizeSchemaName,
  resolveSelectedTableName,
} from "../../client/src/components/extensions/db-workbench/workbench-schema-runtime";

test("schema runtime builds stable PostgreSQL schema options", () => {
  assert.deepEqual(
    buildSchemaOptions({
      driver: "postgres",
      defaultSchema: " app ",
      activeSchema: "analytics",
      schemaOptionsRaw: [" public ", "reporting", "", "app"],
    }),
    ["analytics", "app", "public", "reporting"],
  );
  assert.deepEqual(
    buildSchemaOptions({
      driver: "mysql",
      defaultSchema: "app",
      activeSchema: "app",
      schemaOptionsRaw: ["other"],
    }),
    [],
  );
});

test("schema runtime normalizes schema names and selected table fallback", () => {
  assert.equal(normalizeSchemaName("  "), "public");
  assert.equal(normalizeSchemaName(" audit "), "audit");
  assert.equal(
    resolveSelectedTableName("orders", [{ name: "users" }, { name: "orders" }]),
    "orders",
  );
  assert.equal(
    resolveSelectedTableName("missing", [{ name: "users" }, { name: "orders" }]),
    "orders",
  );
  assert.equal(resolveSelectedTableName("missing", []), null);
});

test("schema runtime centralizes schema failure notices", () => {
  assert.deepEqual(buildSchemaLoadFailureNotice("offline"), {
    title: "数据库当前不可连接",
    description: "offline",
    variant: "destructive",
  });
  assert.deepEqual(buildSchemaOptionsFailureNotice(new Error("list failed")), {
    title: "Schema list unavailable",
    description: "list failed",
    variant: "destructive",
  });
  assert.deepEqual(buildSchemaSwitchFailureNotice(new Error("save failed")), {
    title: "Schema switch failed",
    description: "save failed",
    variant: "destructive",
  });
});
