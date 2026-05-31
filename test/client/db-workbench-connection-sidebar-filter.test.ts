import test from "node:test";
import assert from "node:assert/strict";
import type { DbTableSchema } from "../../shared/schema";
import {
  filterTableContents,
  normalizeFilterText,
  tableMatchesFilter,
} from "../../client/src/components/extensions/db-workbench/connection-sidebar-object-filter";

const table: DbTableSchema = {
  name: "orders",
  comment: "customer order rows",
  columns: [
    { name: "id", dataType: "bigint", nullable: false, primaryKey: true },
    { name: "customer_id", dataType: "bigint", nullable: false, primaryKey: false },
    { name: "status", dataType: "varchar", nullable: false, primaryKey: false },
  ],
  indexes: [
    { name: "pk_orders", columns: ["id"], unique: true, primary: true },
    { name: "idx_orders_customer", columns: ["customer_id"], unique: false },
  ],
  foreignKeys: [
    {
      name: "fk_orders_customer",
      columns: ["customer_id"],
      referencedTable: "customers",
      referencedColumns: ["id"],
    },
  ],
};

test("connection sidebar object filter centralizes table object search", () => {
  assert.equal(normalizeFilterText("  CUSTOMER_ID  "), "customer_id");
  assert.equal(tableMatchesFilter(table, "customer_id"), true);
  assert.equal(tableMatchesFilter(table, "missing"), false);

  const filtered = filterTableContents(table, "customer_id");
  assert.deepEqual(
    filtered.visibleColumns.map((column) => column.name),
    ["customer_id"],
  );
  assert.deepEqual(
    filtered.visibleIndexes.map((index) => index.name),
    ["idx_orders_customer"],
  );
  assert.deepEqual(
    filtered.visibleForeignKeys.map((foreignKey) => foreignKey.name),
    ["fk_orders_customer"],
  );
});
