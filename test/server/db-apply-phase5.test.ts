import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  dbApplyRequestSchema,
  dbApplyResponseSchema,
  dbDeployJobDetailResponseSchema,
} from "@shared/schema";
import {
  phase5CurrentSnapshot,
  phase5DeployJob,
  phase5DeployResults,
  phase5LiveCompareSource,
  phase5SafeApplyRequest,
  phase5SnapshotCompareSource,
} from "./db-phase5-fixtures";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("safe apply requests reject stale compare hashes or blocked table selections", () => {
  const accepted = dbApplyRequestSchema.parse(phase5SafeApplyRequest);
  assert.equal(accepted.currentTargetSnapshotHash, phase5CurrentSnapshot.snapshotHash);

  assert.throws(() => {
    dbApplyRequestSchema.parse({
      ...phase5SafeApplyRequest,
      currentTargetSnapshotHash: "snap-stale-9999",
    });
  }, /Apply request is stale/);

  assert.throws(() => {
    dbApplyRequestSchema.parse({
      ...phase5SafeApplyRequest,
      selections: [
        {
          tableName: "legacy_orders",
          relatedEntityKeys: ["table:legacy_orders"],
          blocked: true,
          blockerCodes: ["drop_table"],
        },
      ],
    });
  }, /Blocked table selections cannot be applied/);

  assert.throws(() => {
    dbApplyRequestSchema.parse({
      ...phase5SafeApplyRequest,
      compareSource: phase5LiveCompareSource,
      baselineSource: phase5SnapshotCompareSource.kind === "snapshot"
        ? { kind: "live", connectionId: 7, databaseName: "sales_core" }
        : phase5SnapshotCompareSource,
    });
  }, /live-to-live DB apply is deferred/);
});

test("deploy job fixtures preserve summary-first job detail and statement-level results", () => {
  const applyResponse = dbApplyResponseSchema.parse({
    job: phase5DeployJob,
    results: phase5DeployResults,
  });
  const detail = dbDeployJobDetailResponseSchema.parse({
    job: phase5DeployJob,
    results: phase5DeployResults,
  });

  assert.equal(applyResponse.job.summary?.statementCount, 1);
  assert.equal(detail.results[0]?.statementId, "stmt-orders-create");
  assert.equal(detail.results[0]?.status, "pending");
});

test("phase 5 apply seams exist in shared contracts, routes, and storage", async () => {
  const schemaSource = await read("shared/schema.ts");
  const routesSource = await read("shared/routes.ts");
  const storageSource = await read("server/storage.ts");

  assert.match(schemaSource, /dbApplyRequestSchema/);
  assert.match(schemaSource, /dbDeployJobSchema/);
  assert.match(schemaSource, /dbDeployJobStatementResultSchema/);

  assert.match(routesSource, /applyChanges:/);
  assert.match(routesSource, /deployJobDetail:/);

  assert.match(storageSource, /listDbDeployJobs/);
  assert.match(storageSource, /createDbDeployJob/);
  assert.match(storageSource, /replaceDbDeployJobStatementResults/);
});
