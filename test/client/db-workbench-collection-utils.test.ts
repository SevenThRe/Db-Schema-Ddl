import test from "node:test";
import assert from "node:assert/strict";
import {
  formatColumnPreview,
  normalizeIdentifierList,
  uniqueBy,
  uniqueStrings,
} from "../../client/src/components/extensions/db-workbench/workbench-collection-utils";

test("workbench collection helpers parse unique identifier lists", () => {
  assert.deepEqual(
    normalizeIdentifierList(" id, employee_no, id, , full_name "),
    ["id", "employee_no", "full_name"],
  );
});

test("workbench collection helpers preserve last item per key", () => {
  const values = uniqueBy(
    [
      { id: "a", value: 1 },
      { id: "b", value: 2 },
      { id: "a", value: 3 },
    ],
    (item) => item.id,
  );

  assert.deepEqual(values, [
    { id: "a", value: 3 },
    { id: "b", value: 2 },
  ]);
});

test("workbench collection helpers format dense column previews", () => {
  assert.equal(formatColumnPreview([], "none"), "none");
  assert.equal(formatColumnPreview(["id", "name"], "none"), "id, name");
  assert.equal(
    formatColumnPreview(["id", "name", "status", "created_at"], "none", 2),
    "id, name +2 more",
  );
  assert.deepEqual(uniqueStrings(["id", "name", "id", ""]), ["id", "name"]);
});
