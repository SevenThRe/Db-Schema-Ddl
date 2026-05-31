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
  const listSections = await read(
    "client/src/components/extensions/db-workbench/job-center-list-sections.tsx",
  );
  const detailSections = await read(
    "client/src/components/extensions/db-workbench/job-center-detail-sections.tsx",
  );
  const sharedSections = await read(
    "client/src/components/extensions/db-workbench/job-center-shared-sections.tsx",
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

  // The sections file is now a thin facade over list/detail/shared modules.
  assert.match(sections, /export \{ JobCenterListPane \} from "\.\/job-center-list-sections"/);
  assert.match(sections, /export \{ JobCenterDetailPane \} from "\.\/job-center-detail-sections"/);

  // The list pane owns job browsing markup.
  assert.match(listSections, /Recent background DB work/);
  assert.match(listSections, /export function JobCenterListPane/);

  // The detail pane owns audit-trail markup.
  assert.match(detailSections, /Reopen sync context/);
  assert.match(detailSections, /Loading persisted job detail/);
  assert.match(detailSections, /Table results/);
  assert.match(detailSections, /export function JobCenterDetailPane/);

  // Shared leaf primitives live in one place, consumed by both panes.
  assert.match(sharedSections, /export function JobCenterStatusBadge/);
  assert.match(sharedSections, /export function JobCenterEmptyState/);
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
