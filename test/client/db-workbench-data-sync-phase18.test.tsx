import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  dataSyncRowDiffToStructuredEntry,
  type DataSyncRowDiffEntry,
} from "../../client/src/components/extensions/db-workbench/data-sync-row-diff.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workbenchPath = path.resolve(
  __dirname,
  "../../client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
);
const workbenchSource = readFileSync(workbenchPath, "utf8");

function makeEntry(status: DataSyncRowDiffEntry["status"]): DataSyncRowDiffEntry {
  return {
    tableName: "users",
    rowKey: { id: 1 },
    status,
    suggestedAction:
      status === "source_only"
        ? "insert"
        : status === "target_only"
          ? "delete"
          : "update",
    sourceRow: { id: 1, name: "alice" },
    targetRow: { id: 1, name: status === "value_changed" ? "bob" : "alice" },
    fieldDiffs: [
      {
        columnName: "name",
        sourceValue: "alice",
        targetValue: status === "value_changed" ? "bob" : "alice",
        changed: status === "value_changed",
      },
    ],
  };
}

test("sync compare summary keeps source -> target direction copy", () => {
  assert.match(workbenchSource, /source -&gt; target/);
});

test("row diff status maps source_only target_only value_changed into structured actions", () => {
  const sourceOnly = dataSyncRowDiffToStructuredEntry(makeEntry("source_only"));
  const targetOnly = dataSyncRowDiffToStructuredEntry(makeEntry("target_only"));
  const valueChanged = dataSyncRowDiffToStructuredEntry(makeEntry("value_changed"));

  assert.equal(sourceOnly.action, "added");
  assert.equal(targetOnly.action, "removed");
  assert.equal(valueChanged.action, "modified");
});

test("unchanged rows stay hidden by default and can be toggled", () => {
  assert.match(
    workbenchSource,
    /const \[syncIncludeUnchanged, setSyncIncludeUnchanged\] = useState\(false\)/,
  );
  assert.match(workbenchSource, /include unchanged/);
  assert.match(workbenchSource, /includeUnchanged,/);
});
