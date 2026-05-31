import test from "node:test";
import assert from "node:assert/strict";
import type { DbTableSchema } from "../../shared/schema";
import {
  createTableDesignerStateActions,
  runApplyTableDesign,
  type TableDesignerNotice,
  type TableDesignerTarget,
} from "../../client/src/components/extensions/db-workbench/table-designer-runner";

function tableSchema(): DbTableSchema {
  return {
    name: "users",
    columns: [{ name: "id", dataType: "int", nullable: false, primaryKey: true }],
  };
}

test("state actions open for new and existing tables and clear on close", () => {
  const state: { open: boolean; target: TableDesignerTarget | null } = {
    open: false,
    target: null,
  };
  const actions = createTableDesignerStateActions({
    setOpen: (value) => {
      state.open = value;
    },
    setTarget: (value) => {
      state.target = value;
    },
  });

  actions.openForNewTable({ driver: "mysql", readonly: false });
  assert.equal(state.open, true);
  assert.equal(state.target?.sourceSchema, null);
  assert.equal(state.target?.driver, "mysql");

  actions.openForExistingTable({
    driver: "postgres",
    readonly: false,
    sourceSchema: tableSchema(),
  });
  const opened: TableDesignerTarget | null = state.target;
  assert.equal(opened?.sourceSchema?.name, "users");

  actions.close();
  assert.equal(state.open, false);
  assert.equal(state.target, null);
});

test("apply is blocked (with notice) on a read-only connection and never executes", async () => {
  const notices: TableDesignerNotice[] = [];
  let executed = false;
  let closed = false;

  const result = await runApplyTableDesign({
    script: "ALTER TABLE `users` DROP COLUMN `email`;",
    readonly: true,
    executeScript: async () => {
      executed = true;
    },
    notify: (notice) => notices.push(notice),
    closeDesigner: () => {
      closed = true;
    },
  });

  assert.equal(result, "blocked");
  assert.equal(executed, false);
  assert.equal(closed, false);
  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.variant, "destructive");
});

test("apply executes the script, closes the designer, and refreshes the schema", async () => {
  let executedSql: string | null = null;
  let closed = false;
  let refreshed = false;

  const result = await runApplyTableDesign({
    script: "CREATE TABLE `orders` (\n  `id` int NOT NULL,\n  PRIMARY KEY (`id`)\n);",
    readonly: false,
    executeScript: async (sql) => {
      executedSql = sql;
    },
    notify: () => {
      throw new Error("should not notify on success");
    },
    closeDesigner: () => {
      closed = true;
    },
    refreshSchema: () => {
      refreshed = true;
    },
  });

  assert.equal(result, "applied");
  assert.match(executedSql ?? "", /CREATE TABLE `orders`/);
  assert.equal(closed, true);
  assert.equal(refreshed, true);
});
