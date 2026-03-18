import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  dbApplyRequestSchema,
  dbComparePolicySchema,
  dbVsDbCompareRequestSchema,
  dbVsDbGraphRequestSchema,
  dbVsDbPreviewRequestSchema,
} from "@shared/schema";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("DB-vs-DB compare and graph contracts accept live source/target pairs while apply stays blocked", () => {
  const compare = dbVsDbCompareRequestSchema.parse({
    source: {
      connectionId: 7,
      databaseName: "sales_core",
    },
    target: {
      connectionId: 11,
      databaseName: "sales_core_shadow",
    },
    scope: "database",
  });

  const preview = dbVsDbPreviewRequestSchema.parse({
    compare,
    decisions: [],
    dialect: "mysql",
  });

  const graph = dbVsDbGraphRequestSchema.parse({
    compare,
    mode: "full",
    selectedTableNames: [],
    includeNeighbors: true,
  });

  assert.equal(compare.source.connectionId, 7);
  assert.equal(compare.target.connectionId, 11);
  assert.equal(preview.compare.target.databaseName, "sales_core_shadow");
  assert.equal(graph.compare.source.databaseName, "sales_core");

  assert.throws(() => {
    dbApplyRequestSchema.parse({
      databaseName: "sales_core_shadow",
      compareSource: {
        kind: "live",
        connectionId: 7,
        databaseName: "sales_core",
        snapshotHash: "snapshot-src-001",
      },
      baselineSource: {
        kind: "live",
        connectionId: 11,
        databaseName: "sales_core_shadow",
        snapshotHash: "snapshot-tgt-001",
      },
      compareHash: "cmp-live-live-0001",
      comparedTargetSnapshotHash: "snapshot-tgt-001",
      currentTargetSnapshotHash: "snapshot-tgt-001",
      selections: [
        {
          tableName: "orders",
          relatedEntityKeys: ["table:orders"],
          blocked: false,
          blockerCodes: [],
        },
      ],
      dialect: "mysql",
    });
  }, /live-to-live DB apply is deferred/);
});

test("DB compare policy stays low-complexity and object-type based", () => {
  const policy = dbComparePolicySchema.parse({
    tableRenameAutoAcceptThreshold: 0.95,
    columnRenameAutoAcceptThreshold: 0.98,
  });

  assert.equal(policy.tableRenameAutoAcceptThreshold, 0.95);
  assert.equal(policy.columnRenameAutoAcceptThreshold, 0.98);
  assert.deepEqual(dbComparePolicySchema.parse({}), {});
});

test("phase 1 server seams exist in shared contracts and routes", async () => {
  const schemaSource = await read("shared/schema.ts");
  const routesSource = await read("shared/routes.ts");
  const storageSource = await read("server/storage.ts");

  assert.match(schemaSource, /dbVsDbCompareRequestSchema/);
  assert.match(schemaSource, /dbVsDbPreviewResponseSchema/);
  assert.match(schemaSource, /dbComparePolicySchema/);

  assert.match(routesSource, /compareDatabases:/);
  assert.match(routesSource, /previewDatabaseSql:/);
  assert.match(routesSource, /databaseGraph:/);
  assert.match(routesSource, /getComparePolicy:/);
  assert.match(routesSource, /updateComparePolicy:/);
  assert.match(storageSource, /getDbComparePolicy/);
  assert.match(storageSource, /updateDbComparePolicy/);
  assert.match(storageSource, /dbComparePolicies/);
});
