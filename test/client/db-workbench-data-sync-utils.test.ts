import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbDataDiffDetailResponse,
  DbTableSchema,
} from "../../shared/schema";
import {
  buildDataApplySelections,
  buildDataDiffTableRequests,
  buildSyncSchemaIssueMessage,
  buildSyncTableMetadataIndex,
  describeDataSyncBlocker,
  formatDataSyncCounts,
  hasBlockingDataSyncBlocker,
  pruneSyncTableConfigs,
  resolveRuntimeSyncMetadata,
  resolveSyncSelectedTables,
  toDataSyncRowDiffEntry,
} from "../../client/src/components/extensions/db-workbench/data-sync-utils";

function table(input: {
  name: string;
  columns: Array<{ name: string; primaryKey?: boolean }>;
  uniqueColumns?: string[];
}): DbTableSchema {
  return {
    name: input.name,
    columns: input.columns.map((column) => ({
      name: column.name,
      dataType: "varchar",
      nullable: !column.primaryKey,
      primaryKey: column.primaryKey === true,
    })),
    indexes: input.uniqueColumns
      ? [{
          name: `uq_${input.name}_${input.uniqueColumns.join("_")}`,
          columns: input.uniqueColumns,
          unique: true,
        }]
      : [],
    foreignKeys: [],
  };
}

test("data sync metadata prefers primary keys and excludes key columns from compare defaults", () => {
  const metadata = resolveRuntimeSyncMetadata(
    table({
      name: "employees",
      columns: [
        { name: "id", primaryKey: true },
        { name: "employee_no" },
        { name: "full_name" },
      ],
    }),
    table({
      name: "employees",
      columns: [
        { name: "id", primaryKey: true },
        { name: "employee_no" },
        { name: "status" },
      ],
    }),
  );

  assert.deepEqual(metadata.availableColumns, ["id", "employee_no", "full_name", "status"]);
  assert.deepEqual(metadata.defaultKeyColumns, ["id"]);
  assert.deepEqual(metadata.defaultCompareColumns, ["employee_no", "full_name", "status"]);
  assert.equal(metadata.sourceExists, true);
  assert.equal(metadata.targetExists, true);
});

test("data sync metadata falls back to unique indexes when no primary key exists", () => {
  const metadata = resolveRuntimeSyncMetadata(
    table({
      name: "departments",
      columns: [
        { name: "code" },
        { name: "name" },
      ],
      uniqueColumns: ["code"],
    }),
    null,
  );

  assert.deepEqual(metadata.defaultKeyColumns, ["code"]);
  assert.deepEqual(metadata.defaultCompareColumns, ["name"]);
  assert.equal(metadata.sourceExists, true);
  assert.equal(metadata.targetExists, false);
});

test("data sync table metadata index merges source and target table coverage", () => {
  const index = buildSyncTableMetadataIndex(
    {
      tables: [
        table({
          name: "employees",
          columns: [
            { name: "id", primaryKey: true },
            { name: "source_name" },
          ],
        }),
        table({
          name: "source_only",
          columns: [{ name: "id", primaryKey: true }],
        }),
      ],
    },
    {
      tables: [
        table({
          name: "employees",
          columns: [
            { name: "id", primaryKey: true },
            { name: "target_status" },
          ],
        }),
        table({
          name: "target_only",
          columns: [{ name: "id", primaryKey: true }],
        }),
      ],
    },
  );

  assert.deepEqual(index.tableNames, ["employees", "source_only", "target_only"]);
  assert.deepEqual(index.metadataByName.employees?.availableColumns, [
    "id",
    "source_name",
    "target_status",
  ]);
  assert.equal(index.metadataByName.source_only?.sourceExists, true);
  assert.equal(index.metadataByName.source_only?.targetExists, false);
  assert.equal(index.metadataByName.target_only?.sourceExists, false);
  assert.equal(index.metadataByName.target_only?.targetExists, true);
});

test("data sync schema issue builder keeps source target safety messages centralized", () => {
  assert.equal(
    buildSyncSchemaIssueMessage({
      sourceConnectionId: "",
      targetConnectionId: "target",
      activeConnectionId: "source",
      connectionCount: 2,
      activeSchemaError: null,
      sourceSnapshotError: null,
      targetSnapshotError: null,
    }),
    "Select both source and target connections before compare.",
  );
  assert.equal(
    buildSyncSchemaIssueMessage({
      sourceConnectionId: "same",
      targetConnectionId: "same",
      activeConnectionId: "same",
      connectionCount: 2,
      activeSchemaError: null,
      sourceSnapshotError: null,
      targetSnapshotError: null,
    }),
    "Source and target connections must be different for sync compare.",
  );
  assert.equal(
    buildSyncSchemaIssueMessage({
      sourceConnectionId: "same",
      targetConnectionId: "same",
      activeConnectionId: "same",
      connectionCount: 1,
      activeSchemaError: null,
      sourceSnapshotError: null,
      targetSnapshotError: null,
    }),
    "Add a second saved connection before running sync compare.",
  );
  assert.match(
    buildSyncSchemaIssueMessage({
      sourceConnectionId: "source",
      targetConnectionId: "target",
      activeConnectionId: "source",
      connectionCount: 2,
      activeSchemaError: new Error("source failed"),
      sourceSnapshotError: null,
      targetSnapshotError: null,
    }) ?? "",
    /source failed/,
  );
});

test("data sync selected table resolver keeps valid choices and falls back predictably", () => {
  assert.deepEqual(
    resolveSyncSelectedTables({
      currentSelectedTables: ["employees", "missing"],
      availableTableNames: ["departments", "employees"],
      selectedTableName: "departments",
    }),
    ["employees"],
  );
  assert.deepEqual(
    resolveSyncSelectedTables({
      currentSelectedTables: ["missing"],
      availableTableNames: ["departments", "employees"],
      selectedTableName: "employees",
    }),
    ["employees"],
  );
  assert.deepEqual(
    resolveSyncSelectedTables({
      currentSelectedTables: [],
      availableTableNames: ["departments", "employees"],
      selectedTableName: "missing",
    }),
    ["departments"],
  );
  assert.deepEqual(
    resolveSyncSelectedTables({
      currentSelectedTables: ["employees"],
      availableTableNames: [],
      selectedTableName: "employees",
    }),
    [],
  );
});

test("data sync config pruning removes tables no longer visible in source target metadata", () => {
  const configs = {
    employees: {
      keyColumnsText: "id",
      compareColumnsText: "name",
      whereClause: "",
    },
    stale_table: {
      keyColumnsText: "id",
      compareColumnsText: "",
      whereClause: "",
    },
  };

  assert.deepEqual(pruneSyncTableConfigs(configs, ["employees"]), {
    employees: configs.employees,
  });
  assert.equal(pruneSyncTableConfigs(configs, ["employees", "stale_table"]), configs);
});

test("data sync blocker helpers separate hard blockers from warning blockers", () => {
  assert.equal(
    hasBlockingDataSyncBlocker([{ code: "unsafe_delete_threshold" }]),
    false,
  );
  assert.equal(
    hasBlockingDataSyncBlocker([{ code: "readonly_target" }]),
    true,
  );
  assert.match(describeDataSyncBlocker("readonly_target"), /read-only/);
  assert.equal(formatDataSyncCounts({
    insert: 1,
    update: 2,
    delete: 3,
    unchanged: 4,
  }), "I:1 U:2 D:3 =:4");
});

test("data sync row diff conversion normalizes non-scalar row keys", () => {
  const detail: DbDataDiffDetailResponse = {
    artifactId: "artifact-1",
    tableName: "employees",
    tableIndex: 0,
    offset: 0,
    limit: 50,
    totalRows: 1,
    rows: [{
      rowKey: {
        id: 1,
        compound: { nested: true },
      },
      status: "value_changed",
      suggestedAction: "update",
      sourceRow: { id: 1, full_name: "Aki" },
      targetRow: { id: 1, full_name: "Akira" },
      fieldDiffs: [{
        columnName: "full_name",
        sourceValue: "Aki",
        targetValue: "Akira",
        changed: true,
      }],
    }],
  };

  const rows = toDataSyncRowDiffEntry(detail);

  assert.equal(rows[0]?.tableName, "employees");
  assert.deepEqual(rows[0]?.rowKey, {
    id: 1,
    compound: "[object Object]",
  });
  assert.equal(rows[0]?.fieldDiffs[0]?.changed, true);
});

test("data sync apply selections include only actionable row suggestions", () => {
  const selections = buildDataApplySelections([
    {
      tableName: "employees",
      rowKey: { id: 1 },
      status: "source_only",
      suggestedAction: "insert",
    },
    {
      tableName: "employees",
      rowKey: { id: 2 },
      status: "value_changed",
      suggestedAction: "update",
    },
    {
      tableName: "employees",
      rowKey: { id: 3 },
      status: "target_only",
      suggestedAction: "delete",
    },
    {
      tableName: "employees",
      rowKey: { id: 4 },
      status: "unchanged",
      suggestedAction: "ignore",
    },
    {
      tableName: "employees",
      rowKey: { id: 5 },
      status: "unchanged",
    },
  ]);

  assert.deepEqual(selections, [
    {
      tableName: "employees",
      rowKey: { id: 1 },
      action: "insert",
    },
    {
      tableName: "employees",
      rowKey: { id: 2 },
      action: "update",
    },
    {
      tableName: "employees",
      rowKey: { id: 3 },
      action: "delete",
    },
  ]);
});

test("data sync table request builder normalizes key, compare, and where config", () => {
  const requests = buildDataDiffTableRequests(
    ["employees", "departments", "projects"],
    {
      employees: {
        keyColumnsText: "id, employee_no, legacy_id, id",
        compareColumnsText: "name, status, name",
        whereClause: " active = 1 ",
      },
      departments: {
        keyColumnsText: "",
        compareColumnsText: " ",
        whereClause: "   ",
      },
    },
  );

  assert.deepEqual(requests, [
    {
      tableName: "employees",
      keyColumns: ["id", "employee_no", "legacy_id"],
      compareColumns: ["name", "status"],
      whereClause: "active = 1",
    },
    {
      tableName: "departments",
      keyColumns: undefined,
      compareColumns: undefined,
      whereClause: undefined,
    },
    {
      tableName: "projects",
      keyColumns: undefined,
      compareColumns: undefined,
      whereClause: undefined,
    },
  ]);
});
