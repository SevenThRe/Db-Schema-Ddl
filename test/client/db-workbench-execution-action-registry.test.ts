import test from "node:test";
import assert from "node:assert/strict";

import { createWorkbenchExecutionStateActions } from "../../client/src/components/extensions/db-workbench/workbench-execution-action-registry";

test("workbench execution action registry groups result, query, export, and lifecycle actions", () => {
  const events: string[] = [];
  const activeQueryRequestIdRef = { current: null as string | null };
  const activeExportRequestIdRef = { current: null as string | null };
  const actions = createWorkbenchExecutionStateActions({
    activeQueryRequestIdRef,
    activeExportRequestIdRef,
    setResultTab: (tab) => events.push(`tab:${tab}`),
    setResults: (results) => events.push(`results:${results ? "set" : "none"}`),
    setQueryError: (message) => events.push(`query-error:${message ?? "none"}`),
    setActiveBatchIndex: (index) => events.push(`batch:${index}`),
    setPendingEditCells: (cells) => events.push(`edits:${Object.keys(cells).length}`),
    setPendingDeleteRows: (rows) => events.push(`deletes:${Object.keys(rows).length}`),
    setPendingInsertedRows: (rows) => events.push(`inserts:${Object.keys(rows).length}`),
    setPreparedGridPlan: (plan) => events.push(`plan:${plan ? "set" : "none"}`),
    clearShownWindowCapNotices: () => events.push("window-notices:clear"),
    setCurrentExportRequestId: (requestId) => events.push(`export-current:${requestId ?? "none"}`),
    setIsExporting: (isExporting) => events.push(`exporting:${isExporting}`),
    setCurrentRequestId: (requestId) => events.push(`query-current:${requestId ?? "none"}`),
    setIsExecuting: (isExecuting) => events.push(`executing:${isExecuting}`),
    setLastGridEditSource: (source) => events.push(`source:${source?.kind ?? "none"}`),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    setRecentQueries: (queries) => events.push(`recent:${queries.length}`),
    setQueryHistory: (history) => events.push(`history:${history.length}`),
    setSqlMemory: (memory) => events.push(`memory:${memory.queryPatterns.length}`),
    setPendingSql: (sql) => events.push(`pending-sql:${sql ?? "none"}`),
    setPendingCursorOffset: (cursorOffset) => events.push(`cursor:${cursorOffset ?? "none"}`),
    setPendingQuerySource: (source) => events.push(`pending-source:${source?.kind ?? "none"}`),
    setPendingQueryMode: (mode) => events.push(`mode:${mode}`),
    setDangerPreview: (preview) => events.push(`danger:${preview ? "set" : "none"}`),
    setShowDangerDialog: (open) => events.push(`danger-open:${open}`),
    setPendingParameterReview: (review) => events.push(`parameter:${review ? "set" : "none"}`),
    setParameterValues: (values) => events.push(`values:${Object.keys(values).length}`),
    setPendingScriptReview: (review) => events.push(`script:${review ? "set" : "none"}`),
    setIsExplaining: (isExplaining) => events.push(`explaining:${isExplaining}`),
  });

  actions.resultWorkspace.selectResultsTab();
  actions.resultWorkspace.clearGridDrafts();
  actions.resultExport.startRequest("export-1");
  actions.resultExport.finishRequest("export-1");
  actions.queryExecution.startRequest("query-1");
  actions.querySafety.setPendingSql("select 1");
  actions.querySafety.clearDangerPreview();
  actions.requestLifecycle.startCancelRequest("cancel-1");
  actions.requestLifecycle.finishCancelRequest("cancel-1");

  assert.equal(activeQueryRequestIdRef.current, null);
  assert.equal(activeExportRequestIdRef.current, null);
  assert.deepEqual(events, [
    "tab:results",
    "edits:0",
    "deletes:0",
    "inserts:0",
    "plan:none",
    "export-current:export-1",
    "exporting:true",
    "exporting:false",
    "export-current:none",
    "query-current:query-1",
    "executing:true",
    "results:none",
    "query-error:none",
    "pending-sql:select 1",
    "danger:none",
    "query-current:cancel-1",
    "executing:true",
    "executing:false",
    "query-current:none",
  ]);
});
