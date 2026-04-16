import test from "node:test";
import assert from "node:assert/strict";

import {
  dataSyncRowDiffToStructuredEntry,
  toRowJson,
} from "../../client/src/components/extensions/db-workbench/data-sync-row-diff.ts";

test("value_changed row diffs only surface changed columns in structured output", () => {
  const structured = dataSyncRowDiffToStructuredEntry({
    tableName: "users",
    rowKey: { id: 1 },
    status: "value_changed",
    suggestedAction: "update",
    sourceRow: { id: 1, email: "new@example.com", active: true },
    targetRow: { id: 1, email: "old@example.com", active: true },
  });

  assert.equal(structured.action, "modified");
  assert.equal(structured.columnChanges.length, 1);
  assert.equal(structured.columnChanges[0]?.displayName, "email");
  assert.deepEqual(structured.columnChanges[0]?.changedFields, ["email"]);
  assert.equal(structured.tableFieldChanges[2]?.newValue, "update");
  assert.equal(
    structured.columnChanges[0]?.fieldChanges[0]?.oldValue,
    "old@example.com",
  );
  assert.equal(
    structured.columnChanges[0]?.fieldChanges[0]?.newValue,
    "new@example.com",
  );
});

test("source_only row diffs map to added entries and keep source payload JSON", () => {
  const sourceRow = {
    id: 2,
    tenant: "acme",
    status: "pending",
  };
  const structured = dataSyncRowDiffToStructuredEntry({
    tableName: "orders",
    rowKey: { id: 2, tenant: "acme" },
    status: "source_only",
    suggestedAction: "insert",
    sourceRow,
  });

  assert.equal(structured.action, "added");
  assert.equal(structured.logicalName, "row/id=2, tenant=acme");
  assert.equal(structured.oldDdl, "{}");
  assert.equal(structured.newDdl, toRowJson(sourceRow));
  assert.ok(structured.columnChanges.every((change) => change.action === "added"));
  assert.equal(structured.tableFieldChanges[2]?.newValue, "insert");
});
