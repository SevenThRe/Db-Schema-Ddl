import test from "node:test";
import assert from "node:assert/strict";
import {
  applyNameFixPlan,
  normalizePhysicalName,
  validateTablePhysicalNames,
} from "../../shared/physical-name";

test("normalizePhysicalName handles camel-case, spaces, symbols, and leading digits", () => {
  assert.equal(normalizePhysicalName("UserName"), "user_name");
  assert.equal(normalizePhysicalName("user name"), "user_name");
  assert.equal(normalizePhysicalName("user-name@v2"), "user_name_v2");
  assert.equal(normalizePhysicalName("123user"), "t_123user");
});

test("normalizePhysicalName falls back when source cannot be normalized", () => {
  const cjkOnly = "\u7528\u6237"; // 用户
  assert.equal(normalizePhysicalName(cjkOnly, "fallback_name"), "fallback_name");
});

test("validateTablePhysicalNames flags invalid table and column names", () => {
  const validation = validateTablePhysicalNames({
    logicalTableName: "Users",
    physicalTableName: "User Table",
    columns: [
      { logicalName: "User ID", physicalName: "User ID" },
      { logicalName: "Name", physicalName: "name" },
    ],
  });

  assert.equal(validation.hasIssues, true);
  assert.equal(validation.hasInvalidTableName, true);
  assert.equal(validation.tableNameSuggested, "user_table");
  assert.equal(validation.invalidColumns.length, 1);
  assert.equal(validation.invalidColumns[0].suggestedName, "user_id");
});

test("applyNameFixPlan resolves duplicates and reserved words with default strategies", () => {
  const plan = applyNameFixPlan(
    [
      {
        logicalTableName: "Users",
        physicalTableName: "user",
        columns: [
          { logicalName: "Id", physicalName: "id" },
          { logicalName: "Id duplicate", physicalName: "id" },
          { logicalName: "Group", physicalName: "group" },
        ],
      },
      {
        logicalTableName: "Users copy",
        physicalTableName: "user",
        columns: [{ logicalName: "Order", physicalName: "order" }],
      },
    ],
    {
      conflictStrategy: "suffix_increment",
      reservedWordStrategy: "prefix",
      maxIdentifierLength: 64,
    },
  );

  assert.equal(plan.fixedTables[0].physicalTableName, "n_user");
  assert.equal(plan.fixedTables[1].physicalTableName, "n_user_2");
  assert.equal(plan.fixedTables[0].columns[1].physicalName, "id_2");
  assert.equal(plan.fixedTables[0].columns[2].physicalName, "n_group");
  assert.equal(plan.fixedTables[1].columns[0].physicalName, "n_order");
  assert.equal(plan.blockingConflicts.length, 0);
});

test("applyNameFixPlan abort strategy yields blocking conflicts for duplicates and reserved words", () => {
  const plan = applyNameFixPlan(
    [
      {
        logicalTableName: "Users",
        physicalTableName: "dup_table",
        columns: [{ logicalName: "Group", physicalName: "group" }],
      },
      {
        logicalTableName: "Users copy",
        physicalTableName: "dup_table",
        columns: [{ logicalName: "Group", physicalName: "group" }],
      },
    ],
    {
      conflictStrategy: "abort",
      reservedWordStrategy: "abort",
      lengthOverflowStrategy: "abort",
      maxIdentifierLength: 10,
    },
  );

  assert.ok(plan.blockingConflicts.some((item) => item.type === "reserved_word"));
  assert.ok(plan.blockingConflicts.some((item) => item.type === "table_duplicate"));
});

test("truncate_hash strategy is deterministic for length overflow", () => {
  const longIdentifier = `col_${"x".repeat(80)}`;

  const runA = applyNameFixPlan(
    [
      {
        logicalTableName: "LongTable",
        physicalTableName: `tbl_${"x".repeat(80)}`,
        columns: [{ physicalName: longIdentifier }],
      },
    ],
    {
      lengthOverflowStrategy: "truncate_hash",
      maxIdentifierLength: 30,
    },
  );

  const runB = applyNameFixPlan(
    [
      {
        logicalTableName: "LongTable",
        physicalTableName: `tbl_${"x".repeat(80)}`,
        columns: [{ physicalName: longIdentifier }],
      },
    ],
    {
      lengthOverflowStrategy: "truncate_hash",
      maxIdentifierLength: 30,
    },
  );

  const tableNameA = runA.fixedTables[0].physicalTableName;
  const tableNameB = runB.fixedTables[0].physicalTableName;
  const columnNameA = runA.fixedTables[0].columns[0].physicalName;
  const columnNameB = runB.fixedTables[0].columns[0].physicalName;

  assert.equal(tableNameA, tableNameB);
  assert.equal(columnNameA, columnNameB);
  assert.ok(tableNameA.length <= 30);
  assert.ok((columnNameA ?? "").length <= 30);
});
