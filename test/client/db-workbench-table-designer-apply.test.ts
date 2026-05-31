import test from "node:test";
import assert from "node:assert/strict";
import { planTableDesignApply } from "../../client/src/components/extensions/db-workbench/table-designer-apply";

test("read-only connections block table-design DDL apply", () => {
  const plan = planTableDesignApply({
    script: "ALTER TABLE `users` DROP COLUMN `email`;",
    readonly: true,
  });
  assert.equal(plan.allowed, false);
  assert.match(plan.blockedReason ?? "", /只读/);
  assert.equal(plan.requiresDangerousConfirmation, false);
});

test("empty script is blocked with a no-changes reason", () => {
  const plan = planTableDesignApply({ script: "   ", readonly: false });
  assert.equal(plan.allowed, false);
  assert.match(plan.blockedReason ?? "", /没有需要应用/);
});

test("ALTER/DROP scripts require dangerous-SQL confirmation", () => {
  const plan = planTableDesignApply({
    script: "ALTER TABLE `users` DROP COLUMN `email`;",
    readonly: false,
  });
  assert.equal(plan.allowed, true);
  assert.equal(plan.requiresDangerousConfirmation, true);
});

test("a pure CREATE of a new table is allowed without dangerous confirmation", () => {
  const plan = planTableDesignApply({
    script: "CREATE TABLE `orders` (\n  `id` int NOT NULL,\n  PRIMARY KEY (`id`)\n);",
    readonly: false,
  });
  assert.equal(plan.allowed, true);
  assert.equal(plan.requiresDangerousConfirmation, false);
  assert.equal(plan.script.startsWith("CREATE TABLE"), true);
});
