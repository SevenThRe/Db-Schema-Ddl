import test from "node:test";
import assert from "node:assert/strict";

import {
  createDataDiffStateActions,
  formatDataDiffDetailError,
  formatDataDiffPreviewError,
  resolveDataDiffPreviewReadinessIssue,
  resolveDataDiffPreviewTables,
  runDataDiffDetail,
  runDataDiffPreview,
} from "../../client/src/components/extensions/db-workbench/data-sync-runner";
import type {
  DbDataDiffDetailRequest,
  DbDataDiffDetailResponse,
  DbDataDiffPreviewRequest,
  DbDataDiffPreviewResponse,
} from "../../shared/schema";

function previewResponse(
  tableName = "users",
): DbDataDiffPreviewResponse {
  return {
    compareId: "compare-1",
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    targetSnapshotHash: "target-hash",
    createdAt: "2026-05-31T00:00:00.000Z",
    expiresAt: "2026-05-31T01:00:00.000Z",
    statusCounts: { insert: 1, update: 0, delete: 0, unchanged: 0 },
    tableSummaries: [
      {
        tableName,
        keyColumns: ["id"],
        compareColumns: ["name"],
        statusCounts: { insert: 1, update: 0, delete: 0, unchanged: 0 },
        blocked: false,
        blockerCodes: [],
        sampleRows: [],
      },
    ],
    blockers: [],
  };
}

function detailResponse(): DbDataDiffDetailResponse {
  return {
    compareId: "compare-1",
    tableName: "users",
    targetSnapshotHash: "target-hash",
    currentTargetSnapshotHash: "target-current",
    keyColumns: ["id"],
    compareColumns: ["name"],
    rows: [
      {
        tableName: "users",
        rowKey: { id: 1 },
        status: "value_changed",
        suggestedAction: "update",
        sourceRow: { id: 1, name: "Ada" },
        targetRow: { id: 1, name: "A." },
        fieldDiffs: [
          {
            columnName: "name",
            sourceValue: "Ada",
            targetValue: "A.",
            changed: true,
          },
        ],
      },
    ],
    hasMore: false,
    blockers: [],
  };
}

test("data sync runner resolves preview tables and readiness messages", () => {
  assert.deepEqual(
    resolveDataDiffPreviewTables({
      syncSelectedTables: ["orders"],
      selectedTableName: "users",
    }),
    ["orders"],
  );
  assert.deepEqual(
    resolveDataDiffPreviewTables({
      syncSelectedTables: [],
      selectedTableName: "users",
    }),
    ["users"],
  );
  assert.equal(
    resolveDataDiffPreviewReadinessIssue({
      isSyncSchemaLoading: true,
      syncSchemaIssueMessage: null,
      tables: ["users"],
    }),
    "Wait for source/target schema metadata to finish loading before compare.",
  );
  assert.equal(
    resolveDataDiffPreviewReadinessIssue({
      isSyncSchemaLoading: false,
      syncSchemaIssueMessage: "target missing",
      tables: ["users"],
    }),
    "target missing",
  );
  assert.equal(
    resolveDataDiffPreviewReadinessIssue({
      isSyncSchemaLoading: false,
      syncSchemaIssueMessage: null,
      tables: [],
    }),
    "Select at least one table before compare.",
  );
});

test("data sync runner previews compare and triggers first table detail load", async () => {
  const previewRequests: DbDataDiffPreviewRequest[] = [];
  const loadedDetails: Array<{ tableName: string; includeUnchanged: boolean }> = [];
  const events: string[] = [];

  const result = await runDataDiffPreview({
    isSyncSchemaLoading: false,
    syncSchemaIssueMessage: null,
    syncSelectedTables: ["users"],
    selectedTableName: null,
    syncTableConfigs: {
      users: {
        keyColumnsText: "id",
        compareColumnsText: "name,email",
        whereClause: "active = 1",
      },
    },
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    includeUnchanged: true,
    previewDataDiff: async (request) => {
      previewRequests.push(request);
      return previewResponse();
    },
    loadDetail: async (tableName, includeUnchanged) => {
      loadedDetails.push({ tableName, includeUnchanged });
      return detailResponse();
    },
    setIssue: (message) => events.push(`issue:${message ?? "none"}`),
    beginPreview: () => events.push("begin"),
    applyPreview: (preview) => events.push(`preview:${preview.compareId}`),
    finishPreview: () => events.push("finish"),
  });

  assert.equal(result?.compareId, "compare-1");
  assert.deepEqual(previewRequests[0], {
    sourceConnectionId: "source-1",
    targetConnectionId: "target-1",
    tables: [
      {
        tableName: "users",
        keyColumns: ["id"],
        compareColumns: ["name", "email"],
        whereClause: "active = 1",
      },
    ],
  });
  assert.deepEqual(loadedDetails, [
    { tableName: "users", includeUnchanged: true },
  ]);
  assert.deepEqual(events, ["begin", "preview:compare-1", "finish"]);
});

test("data sync runner loads detail and normalizes row diff entries", async () => {
  const requests: DbDataDiffDetailRequest[] = [];
  let appliedRows = 0;

  const detail = await runDataDiffDetail({
    compareId: "compare-1",
    tableName: "users",
    includeUnchanged: false,
    fetchDataDiffDetail: async (request) => {
      requests.push(request);
      return detailResponse();
    },
    applyDetail: ({ rows }) => {
      appliedRows = rows.length;
      assert.equal(rows[0]?.suggestedAction, "update");
      assert.deepEqual(rows[0]?.rowKey, { id: 1 });
    },
    setIssue: () => assert.fail("setIssue should not run"),
  });

  assert.equal(detail?.tableName, "users");
  assert.equal(appliedRows, 1);
  assert.deepEqual(requests[0], {
    compareId: "compare-1",
    tableName: "users",
    limit: 200,
    offset: 0,
    includeUnchanged: false,
  });
});

test("data sync runner creates reusable diff state action objects", () => {
  const events: string[] = [];
  const actions = createDataDiffStateActions({
    setIssue: (message) => events.push(`issue:${message ?? "none"}`),
    setResultTab: () => events.push("tab:sync"),
    setIsDiffPreviewing: (isPreviewing) => events.push(`previewing:${isPreviewing}`),
    setDiffPreview: (preview) => events.push(`preview:${preview?.compareId ?? "none"}`),
    setDiffDetail: (detail) => events.push(`detail:${detail?.tableName ?? "none"}`),
    setDiffRows: (rows) => events.push(`rows:${rows.length}`),
    setSelectedDiffRowIndex: (index) => events.push(`index:${index}`),
    setApplyPreview: (preview) => events.push(`apply-preview:${preview ? "set" : "none"}`),
    setApplyExecute: (execute) => events.push(`apply-execute:${execute ? "set" : "none"}`),
  });
  const detail = detailResponse();

  actions.beginPreview();
  actions.applyPreview(previewResponse());
  actions.applyDetail({
    detail,
    rows: [
      {
        tableName: "users",
        rowKey: { id: 1 },
        status: "value_changed",
        suggestedAction: "update",
        sourceRow: { id: 1, name: "Ada" },
        targetRow: { id: 1, name: "A." },
        fieldDiffs: [
          {
            columnName: "name",
            sourceValue: "Ada",
            targetValue: "A.",
            changed: true,
          },
        ],
      },
    ],
  });
  actions.selectRow(2);
  actions.clearArtifacts();
  actions.setIssue("target changed");
  actions.finishPreview();

  assert.deepEqual(events, [
    "previewing:true",
    "issue:none",
    "tab:sync",
    "detail:none",
    "rows:0",
    "index:0",
    "apply-preview:none",
    "apply-execute:none",
    "preview:compare-1",
    "detail:users",
    "rows:1",
    "index:0",
    "index:2",
    "preview:none",
    "detail:none",
    "rows:0",
    "index:0",
    "apply-preview:none",
    "apply-execute:none",
    "issue:target changed",
    "previewing:false",
  ]);
});

test("data sync runner centralizes preview and detail error formatting", () => {
  assert.equal(
    formatDataDiffPreviewError(new Error("Error invoking preview: denied")),
    "denied",
  );
  assert.equal(
    formatDataDiffDetailError(new Error("Error: missing compare")),
    "missing compare",
  );
});
