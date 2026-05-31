import test from "node:test";
import assert from "node:assert/strict";

import {
  createWorkbenchSyncStateActions,
} from "../../client/src/components/extensions/db-workbench/workbench-sync-action-registry.ts";

test("workbench sync action registry groups diff, apply, draft, routing, and jobs actions", () => {
  const events: string[] = [];
  let selectedTab = "";
  let applyPreview: unknown = { existing: true };
  let applyExecute: unknown = { existing: true };
  let sourceConnectionId = "";
  let targetConnectionId = "";

  const actions = createWorkbenchSyncStateActions({
    selectResultTab: (tab) => {
      selectedTab = tab;
      events.push(`tab:${tab}`);
    },
    setSyncIssue: (message) => events.push(`syncIssue:${message ?? "none"}`),
    setIsApplyPreviewing: (isPreviewing) => events.push(`applyPreviewing:${isPreviewing}`),
    setApplyPreview: (preview) => {
      applyPreview = preview;
      events.push(`applyPreview:${preview ? "set" : "clear"}`);
    },
    setApplyUnsafeDeleteConfirmed: (confirmed) =>
      events.push(`unsafeDelete:${confirmed}`),
    setApplyProdConfirmation: (confirmation) =>
      events.push(`prod:${confirmation}`),
    setIsExecutingApply: (isExecuting) => events.push(`applyExecuting:${isExecuting}`),
    setApplyExecute: (result) => {
      applyExecute = result;
      events.push(`applyExecute:${result ? "set" : "clear"}`);
    },
    updateApplyExecute: (updater) => {
      applyExecute = updater(applyExecute as never);
      events.push("applyExecute:update");
    },
    setSelectedJobId: (jobId) => events.push(`selectedJob:${jobId}`),
    setApplyJobDetail: () => events.push("applyJobDetail:set"),
    updateBackgroundJobs: (updater) => {
      updater([]);
      events.push("jobs:update");
    },
    setIsDiffPreviewing: (isPreviewing) => events.push(`diffPreviewing:${isPreviewing}`),
    setDiffPreview: () => events.push("diffPreview:set"),
    setDiffDetail: (detail) => events.push(`diffDetail:${detail ? "set" : "clear"}`),
    setDiffRows: (rows) => events.push(`diffRows:${rows.length}`),
    setSelectedDiffRowIndex: (index) => events.push(`diffRow:${index}`),
    updateSelectedTables: (updater) => {
      updater(["orders"]);
      events.push("tables:update");
    },
    updateTableConfigs: (updater) => {
      updater({});
      events.push("configs:update");
    },
    updateRows: (updater) => {
      updater([]);
      events.push("rows:update");
    },
    setIncludeUnchanged: (includeUnchanged) =>
      events.push(`includeUnchanged:${includeUnchanged}`),
    setSyncSourceConnectionId: (connectionId) => {
      sourceConnectionId = connectionId;
      events.push(`source:${connectionId}`);
    },
    setSyncTargetConnectionId: (connectionId) => {
      targetConnectionId = connectionId;
      events.push(`target:${connectionId}`);
    },
    setIsRefreshingJobs: (isRefreshing) => events.push(`refreshing:${isRefreshing}`),
    setJobCenterIssue: (message) => events.push(`jobIssue:${message ?? "none"}`),
    updateSelectedJobId: (updater) => {
      updater(null);
      events.push("selectedJob:update");
    },
  });

  actions.dataApply.beginPreview();
  actions.dataDiff.beginPreview();
  actions.dataSyncDraft.clearApplyArtifacts();
  actions.syncConnection.setSourceConnectionId("source-db");
  actions.syncConnection.setTargetConnectionId("target-db");
  actions.jobCenter.beginRefresh();
  actions.jobCenter.setResultTab("jobs");

  assert.equal(selectedTab, "jobs");
  assert.equal(sourceConnectionId, "source-db");
  assert.equal(targetConnectionId, "target-db");
  assert.equal(applyPreview, null);
  assert.equal(applyExecute, null);
  assert.ok(events.includes("tab:sync"));
  assert.ok(events.includes("diffRows:0"));
  assert.ok(events.includes("source:source-db"));
  assert.ok(events.includes("target:target-db"));
  assert.ok(events.includes("refreshing:true"));
});
