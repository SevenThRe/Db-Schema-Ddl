import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  dbHistoryCompareRequestSchema,
  dbHistoryListResponseSchema,
  dbSchemaScanEventSchema,
} from "@shared/schema";
import {
  phase5FileCompareSource,
  phase5HistoryEntries,
  phase5LiveCompareSource,
  phase5SnapshotCompareSource,
} from "./db-phase5-fixtures";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("changed-only scan history distinguishes new scan events from new snapshot versions", () => {
  const unchangedScan = dbSchemaScanEventSchema.parse(phase5HistoryEntries[1].scanEvent);
  const changedScan = dbSchemaScanEventSchema.parse(phase5HistoryEntries[2].scanEvent);
  const history = dbHistoryListResponseSchema.parse({
    connectionId: 7,
    databaseName: "sales_core",
    latestSnapshotHash: phase5HistoryEntries[2].snapshot?.snapshotHash,
    entries: phase5HistoryEntries,
  });

  assert.equal(unchangedScan.eventType, "unchanged_scan");
  assert.equal(changedScan.eventType, "new_snapshot");
  assert.equal(history.entries[1].createdNewSnapshot, false);
  assert.equal(history.entries[2].createdNewSnapshot, true);
  assert.equal(history.entries[1].scanEvent.snapshotHash, history.entries[0].scanEvent.snapshotHash);
  assert.notEqual(history.entries[2].scanEvent.snapshotHash, history.entries[1].scanEvent.snapshotHash);
});

test("history compare sources support file, live, and snapshot without allowing live-to-live DB comparisons", () => {
  const fileVsLive = dbHistoryCompareRequestSchema.parse({
    left: phase5FileCompareSource,
    right: phase5LiveCompareSource,
    scope: "database",
  });
  const snapshotVsSnapshot = dbHistoryCompareRequestSchema.parse({
    left: phase5SnapshotCompareSource,
    right: {
      ...phase5SnapshotCompareSource,
      snapshotHash: "snap-other-0003",
    },
    scope: "database",
  });

  assert.equal(fileVsLive.left.kind, "file");
  assert.equal(fileVsLive.right.kind, "live");
  assert.equal(snapshotVsSnapshot.left.kind, "snapshot");
  assert.equal(snapshotVsSnapshot.right.kind, "snapshot");

  assert.throws(() => {
    dbHistoryCompareRequestSchema.parse({
      left: phase5LiveCompareSource,
      right: phase5LiveCompareSource,
      scope: "database",
    });
  }, /live-to-live DB comparison is deferred/);
});

test("phase 5 history seams exist in shared contracts, routes, and storage", async () => {
  const schemaSource = await read("shared/schema.ts");
  const routesSource = await read("shared/routes.ts");
  const storageSource = await read("server/storage.ts");

  assert.match(schemaSource, /dbSchemaScanEventSchema/);
  assert.match(schemaSource, /dbHistoryCompareRequestSchema/);
  assert.match(schemaSource, /dbHistoryListResponseSchema/);

  assert.match(routesSource, /listHistory:/);
  assert.match(routesSource, /historyDetail:/);
  assert.match(routesSource, /compareHistory:/);

  assert.match(storageSource, /listDbSchemaScanEvents/);
  assert.match(storageSource, /getDbSchemaScanEvent/);
  assert.match(storageSource, /createDbSchemaScanEvent/);
});
