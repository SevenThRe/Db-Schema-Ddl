import test from "node:test";
import assert from "node:assert/strict";
import {
  autoFixTablePhysicalNames,
  isValidPhysicalName,
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
  assert.ok(String(columnNameA).length <= 30);
});

test("applyNameFixPlan hash_suffix strategy resolves duplicates within max length", () => {
  const plan = applyNameFixPlan(
    [
      {
        logicalTableName: "Item",
        physicalTableName: "item",
        columns: [{ physicalName: "code" }, { physicalName: "code" }],
      },
      {
        logicalTableName: "Item2",
        physicalTableName: "item",
        columns: [{ physicalName: "code" }],
      },
    ],
    {
      conflictStrategy: "hash_suffix",
      maxIdentifierLength: 12,
    },
  );

  assert.equal(plan.blockingConflicts.length, 0);
  assert.notEqual(plan.fixedTables[0].physicalTableName, plan.fixedTables[1].physicalTableName);
  assert.notEqual(plan.fixedTables[0].columns[0].physicalName, plan.fixedTables[0].columns[1].physicalName);
  assert.ok(String(plan.fixedTables[1].physicalTableName).length <= 12);
  assert.ok(String(plan.fixedTables[0].columns[1].physicalName).length <= 12);
});

test("applyNameFixPlan clamps identifier length and defaults reserved prefix when blank", () => {
  const plan = applyNameFixPlan(
    [
      {
        logicalTableName: "Group",
        physicalTableName: "group",
        columns: [{ logicalName: "Order", physicalName: "order" }],
      },
    ],
    {
      reservedWordStrategy: "prefix",
      reservedPrefix: "   ",
      maxIdentifierLength: 3,
      lengthOverflowStrategy: "truncate_hash",
    },
  );

  assert.equal(plan.fixedTables[0].physicalTableName.startsWith("n_"), true);
  assert.equal(String(plan.fixedTables[0].columns[0].physicalName).startsWith("n_"), true);
  assert.ok(String(plan.fixedTables[0].physicalTableName).length <= 8);
  assert.ok(String(plan.fixedTables[0].columns[0].physicalName).length <= 8);
});

test("isValidPhysicalName and autoFixTablePhysicalNames expose helper-level behavior", () => {
  assert.equal(isValidPhysicalName(undefined), false);
  assert.equal(isValidPhysicalName("valid_name"), true);
  assert.equal(isValidPhysicalName("Bad Name"), false);

  const fixed = autoFixTablePhysicalNames({
    logicalTableName: "Sample",
    physicalTableName: "sample table",
    columns: [{ logicalName: "User Id", physicalName: "User Id" }],
  });

  assert.equal(fixed.physicalTableName, "sample_table");
  assert.equal(fixed.columns[0].physicalName, "user_id");
});

test("validateTablePhysicalNames returns clean result for already valid names", () => {
  const validation = validateTablePhysicalNames({
    logicalTableName: "Users",
    physicalTableName: "users",
    columns: [
      { logicalName: "Id", physicalName: "id" },
      { logicalName: "Name", physicalName: "name" },
    ],
  });

  assert.equal(validation.hasIssues, false);
  assert.equal(validation.hasInvalidTableName, false);
  assert.deepEqual(validation.invalidColumns, []);
});

test("applyNameFixPlan normalizes option bounds for maxIdentifierLength", () => {
  const planWithNaN = applyNameFixPlan(
    [
      {
        logicalTableName: "T1",
        physicalTableName: `table_${"x".repeat(80)}`,
        columns: [{ physicalName: `column_${"x".repeat(80)}` }],
      },
    ],
    {
      maxIdentifierLength: Number.NaN,
      lengthOverflowStrategy: "truncate_hash",
    },
  );

  const planWithHugeLimit = applyNameFixPlan(
    [
      {
        logicalTableName: "T2",
        physicalTableName: `table_${"y".repeat(400)}`,
        columns: [{ physicalName: `column_${"y".repeat(400)}` }],
      },
    ],
    {
      maxIdentifierLength: 1_000,
      lengthOverflowStrategy: "truncate_hash",
    },
  );

  assert.ok(String(planWithNaN.fixedTables[0].physicalTableName).length <= 64);
  assert.ok(String(planWithNaN.fixedTables[0].columns[0].physicalName).length <= 64);
  assert.ok(String(planWithHugeLimit.fixedTables[0].physicalTableName).length <= 255);
  assert.ok(String(planWithHugeLimit.fixedTables[0].columns[0].physicalName).length <= 255);
});

test("applyNameFixPlan keeps unique identifiers unchanged", () => {
  const plan = applyNameFixPlan([
    {
      logicalTableName: "Users",
      physicalTableName: "users",
      columns: [
        { physicalName: "id" },
        { physicalName: "name" },
        { physicalName: "email" },
      ],
    },
  ]);

  assert.equal(plan.tableNamesChanged, 0);
  assert.equal(plan.columnNamesChanged, 0);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.fixedTables[0].physicalTableName, "users");
});
