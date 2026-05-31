import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  describeDataSyncBlocker,
  formatDataSyncCounts,
  resolveJobCenterDetail,
  resolveJobCenterSelectedSummary,
} from "../../client/src/components/extensions/db-workbench/job-center-model";
import type {
  DbBackgroundJobSummary,
  DbDataApplyJobDetailResponse,
} from "../../shared/schema";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("job center pane delegates display and model logic to focused modules", async () => {
  const pane = await read(
    "client/src/components/extensions/db-workbench/JobCenterPane.tsx",
  );
  const model = await read(
    "client/src/components/extensions/db-workbench/job-center-model.ts",
  );
  const sections = await read(
    "client/src/components/extensions/db-workbench/job-center-sections.tsx",
  );

  assert.match(pane, /resolveJobCenterSelectedSummary/);
  assert.match(pane, /resolveJobCenterDetail/);
  assert.match(pane, /<JobCenterListPane/);
  assert.match(pane, /<JobCenterDetailPane/);
  assert.doesNotMatch(pane, /Recent background DB work/);
  assert.doesNotMatch(pane, /Reopen sync context/);
  assert.doesNotMatch(pane, /describeDataSyncBlocker/);

  assert.match(model, /formatDataSyncCounts/);
  assert.match(model, /describeDataSyncBlocker/);
  assert.match(model, /resolveJobCenterSelectedSummary/);
  assert.match(model, /resolveJobCenterDetail/);

  assert.match(sections, /Recent background DB work/);
  assert.match(sections, /Reopen sync context/);
  assert.match(sections, /Loading persisted job detail/);
  assert.match(sections, /Table results/);
});

test("job center model preserves selected job and stale detail guards", () => {
  const jobs = [
    { jobId: "job-a" },
    { jobId: "job-b" },
  ] as DbBackgroundJobSummary[];
  const matchingDetail = {
    jobId: "job-b",
  } as DbDataApplyJobDetailResponse;
  const staleDetail = {
    jobId: "job-a",
  } as DbDataApplyJobDetailResponse;

  assert.equal(formatDataSyncCounts({ insert: 1, update: 2, delete: 3, unchanged: 4 }), "I:1 U:2 D:3 =:4");
  assert.match(describeDataSyncBlocker("readonly_target"), /read-only/);

  const selected = resolveJobCenterSelectedSummary(jobs, "job-b");
  assert.equal(selected?.jobId, "job-b");
  assert.equal(resolveJobCenterSelectedSummary(jobs, "missing")?.jobId, "job-a");
  assert.equal(resolveJobCenterDetail(matchingDetail, selected)?.jobId, "job-b");
  assert.equal(resolveJobCenterDetail(staleDetail, selected), null);
});
