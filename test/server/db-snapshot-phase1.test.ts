import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  dbSnapshotCompareReportRequestSchema,
  dbSnapshotCompareReportResponseSchema,
  dbSnapshotCompareRequestSchema,
  dbSnapshotCompareResponseSchema,
} from "@shared/schema";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("snapshot compare request supports snapshot-vs-snapshot and live-vs-snapshot with explicit freshness", () => {
  const liveVsSnapshot = dbSnapshotCompareRequestSchema.parse({
    left: {
      kind: "live",
      connectionId: 7,
      databaseName: "sales_core",
      freshness: "latest_snapshot",
    },
    right: {
      kind: "snapshot",
      connectionId: 8,
      databaseName: "sales_core_backup",
      snapshotHash: "snap-target-0002",
    },
    scope: "database",
  });

  const snapshotVsSnapshot = dbSnapshotCompareRequestSchema.parse({
    left: {
      kind: "snapshot",
      connectionId: 7,
      databaseName: "sales_core",
      snapshotHash: "snap-left-0001",
    },
    right: {
      kind: "snapshot",
      connectionId: 8,
      databaseName: "sales_core_backup",
      snapshotHash: "snap-right-0002",
    },
    scope: "table",
    tableName: "orders",
  });

  assert.equal(liveVsSnapshot.left.kind, "live");
  assert.equal(liveVsSnapshot.left.freshness, "latest_snapshot");
  assert.equal(liveVsSnapshot.right.kind, "snapshot");
  assert.equal(snapshotVsSnapshot.scope, "table");
  assert.equal(snapshotVsSnapshot.tableName, "orders");
});

test("snapshot compare artifact and report export stay stable and MCP-friendly", () => {
  const artifact = dbSnapshotCompareResponseSchema.parse({
    context: {
      artifactVersion: "v1",
      compareKey: "snapshot_compare:left:right:database",
      scope: "database",
      generatedAt: "2026-03-18T00:00:00.000Z",
      left: {
        sourceKey: "left-source",
        label: "local/sales_core (latest snapshot)",
        kind: "live",
        connectionId: 7,
        connectionName: "local",
        databaseName: "sales_core",
        snapshotHash: "snap-left-0001",
        snapshotCapturedAt: "2026-03-18T00:00:00.000Z",
        freshness: "latest_snapshot",
        usedFreshLiveScan: false,
        cacheHit: true,
      },
      right: {
        sourceKey: "right-source",
        label: "staging/sales_core@snap-righ",
        kind: "snapshot",
        connectionId: 8,
        connectionName: "staging",
        databaseName: "sales_core",
        requestedSnapshotHash: "snap-right-0002",
        snapshotHash: "snap-right-0002",
        snapshotCapturedAt: "2026-03-17T23:00:00.000Z",
        usedFreshLiveScan: false,
        cacheHit: true,
      },
    },
    summary: {
      addedTables: 1,
      removedTables: 0,
      changedTables: 1,
      renameSuggestions: 0,
      pendingRenameConfirmations: 0,
      addedColumns: 1,
      removedColumns: 0,
      changedColumns: 1,
      blockingCount: 1,
    },
    tableChanges: [
      {
        action: "modified",
        entityKey: "table:sales_core:orders",
        sheetName: "sales_core",
        changedFields: ["comment"],
        columnChanges: [
          {
            action: "modified",
            entityKey: "column:sales_core:orders:status",
            changedFields: ["nullable"],
            blockers: [],
          },
        ],
        blockers: [],
      },
    ],
    blockers: [
      {
        code: "drop_column",
        entityType: "column",
        entityKey: "column:sales_core:orders:legacy_code",
        message: "Removing DB column legacy_code is blocked in preview.",
      },
    ],
    warnings: [
      {
        code: "using_latest_snapshot_left",
        side: "left",
        message: "local/sales_core uses the latest stored snapshot.",
      },
    ],
  });

  const reportRequest = dbSnapshotCompareReportRequestSchema.parse({
    format: "json",
    artifact,
  });
  const reportResponse = dbSnapshotCompareReportResponseSchema.parse({
    format: "json",
    fileName: "snapshot-compare.json",
    mimeType: "application/json;charset=utf-8",
    content: JSON.stringify(artifact),
    artifact,
  });

  assert.equal(artifact.context.left.sourceKey, "left-source");
  assert.equal(artifact.context.right.snapshotHash, "snap-right-0002");
  assert.equal(artifact.tableChanges[0]?.columnChanges[0]?.entityKey, "column:sales_core:orders:status");
  assert.equal(reportRequest.format, "json");
  assert.equal(reportResponse.artifact.context.compareKey, artifact.context.compareKey);
});

test("phase 1 snapshot compare seams exist in shared contracts and routes", async () => {
  const schemaSource = await read("shared/schema.ts");
  const routesSource = await read("shared/routes.ts");
  const historyService = await read("server/lib/extensions/db-management/history-service.ts");

  assert.match(schemaSource, /dbSnapshotCompareRequestSchema/);
  assert.match(schemaSource, /dbSnapshotCompareArtifactSchema/);
  assert.match(schemaSource, /dbSnapshotCompareReportResponseSchema/);
  assert.match(schemaSource, /"snapshot-compare"/);

  assert.match(routesSource, /snapshotCompare:/);
  assert.match(routesSource, /exportSnapshotCompareReport:/);

  assert.match(historyService, /compareSnapshotSources/);
  assert.match(historyService, /exportSnapshotCompareReport/);
});
