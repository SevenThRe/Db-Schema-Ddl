import test from "node:test";
import assert from "node:assert/strict";
import { applyNameFixPlan } from "../../shared/physical-name";

test("applyNameFixPlan emits blocking duplicate when suffix strategy search space is exhausted", () => {
  const duplicateColumns = Array.from({ length: 10_001 }, () => ({ physicalName: "dup" }));
  const plan = applyNameFixPlan([
    {
      logicalTableName: "Bulk",
      physicalTableName: "bulk",
      columns: duplicateColumns,
    },
  ]);

  assert.ok(plan.blockingConflicts.length > 0);
});
