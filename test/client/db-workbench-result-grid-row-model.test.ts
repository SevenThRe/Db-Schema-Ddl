import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridInsertedRowDraft,
  DbQueryBatchResult,
  DbQueryColumn,
  DbQueryRow,
} from "../../shared/schema";
import {
  buildResultGridBatchMetrics,
  buildResultGridRowViews,
  filterResultGridRows,
} from "../../client/src/components/extensions/db-workbench/result-grid-batch-model";
import {
  buildSelectedRowJson,
  buildSelectedRowTsv,
} from "../../client/src/components/extensions/db-workbench/result-grid-copy-model";
import {
  buildGridEditCommitPlan,
} from "../../client/src/components/extensions/db-workbench/result-grid-edit-model";
import {
  buildGridRowView,
  buildInsertedRowView,
  buildPendingDeleteLookup,
  buildPendingEditLookup,
  parseEditedValue,
  parseInsertedValue,
  valuesToObject,
  valuesToTsv,
} from "../../client/src/components/extensions/db-workbench/result-grid-row-model";

const paneSource = readFileSync(
  "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  "utf8",
);
const singleBatchSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-single-batch.tsx",
  "utf8",
);
const singleBatchRuntimeSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-single-batch-runtime.ts",
  "utf8",
);
const singleBatchCopyRuntimeSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-single-batch-copy-runtime.ts",
  "utf8",
);
const singleBatchEditRuntimeSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-single-batch-edit-runtime.ts",
  "utf8",
);
const rowModelSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-row-model.ts",
  "utf8",
);
const batchModelSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-batch-model.ts",
  "utf8",
);
const copyModelSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-copy-model.ts",
  "utf8",
);
const editModelSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-edit-model.ts",
  "utf8",
);
const clipboardSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-clipboard.ts",
  "utf8",
);
const batchNavigationSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-batch-navigation.tsx",
  "utf8",
);
const rowInspectorSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-row-inspector.tsx",
  "utf8",
);
const statusPanelsSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-status-panels.tsx",
  "utf8",
);
const toolbarSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-toolbar.tsx",
  "utf8",
);
const columnHeaderSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-column-header.tsx",
  "utf8",
);
const cellSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-cell.tsx",
  "utf8",
);
const rowSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-row.tsx",
  "utf8",
);
const bodySource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-body.tsx",
  "utf8",
);
const paneChromeSource = readFileSync(
  "client/src/components/extensions/db-workbench/result-grid-pane-chrome.tsx",
  "utf8",
);

const columns: DbQueryColumn[] = [
  { name: "id", dataType: "int" },
  { name: "name", dataType: "varchar" },
  { name: "active", dataType: "boolean" },
];

function row(...values: DbQueryRow["values"]): DbQueryRow {
  return { values };
}

test("result grid row model is outside the React pane", () => {
  assert.match(paneSource, /from "\.\/result-grid-single-batch"/);
  assert.match(singleBatchSource, /useResultGridSingleBatchRuntime/);
  assert.match(singleBatchRuntimeSource, /from "\.\/result-grid-row-model"/);
  assert.doesNotMatch(paneSource, /from "\.\/result-grid-row-model"/);
  assert.doesNotMatch(singleBatchSource, /function buildGridRowView\(/);
  assert.doesNotMatch(singleBatchSource, /function parseInsertedValue\(/);
  assert.match(rowModelSource, /export function buildGridRowView\(/);
  assert.match(rowModelSource, /export function parseInsertedValue\(/);
  assert.match(singleBatchRuntimeSource, /from "\.\/result-grid-batch-model"/);
  assert.match(batchModelSource, /export function buildResultGridRowViews/);
  assert.match(batchModelSource, /export function buildResultGridBatchMetrics/);
  assert.doesNotMatch(singleBatchSource, /batch\.pagingMode === "offset" && batch\.hasMore/);
  assert.match(singleBatchRuntimeSource, /useResultGridSingleBatchCopyActions/);
  assert.match(singleBatchCopyRuntimeSource, /from "\.\/result-grid-copy-model"/);
  assert.match(copyModelSource, /export function buildSelectedRowJson/);
  assert.match(copyModelSource, /export function buildSelectedRowTsv/);
  assert.doesNotMatch(singleBatchSource, /Object\.fromEntries\(/);
  assert.match(singleBatchCopyRuntimeSource, /from "\.\/result-grid-clipboard"/);
  assert.match(clipboardSource, /export async function writeClipboardText/);
  assert.doesNotMatch(singleBatchSource, /document\.execCommand\("copy"\)/);
  assert.match(singleBatchRuntimeSource, /useResultGridSingleBatchEditActions/);
  assert.match(singleBatchEditRuntimeSource, /from "\.\/result-grid-edit-model"/);
  assert.match(editModelSource, /export function buildGridEditCommitPlan/);
  assert.doesNotMatch(singleBatchSource, /parseEditedValue/);
  assert.doesNotMatch(singleBatchSource, /parseInsertedValue/);
  assert.match(batchNavigationSource, /export function BatchTabs\(/);
  assert.match(batchNavigationSource, /export function ScriptRunSummary\(/);
  assert.doesNotMatch(paneSource, /function BatchTabs\(/);
  assert.doesNotMatch(paneSource, /function ScriptRunSummary\(/);
  assert.match(singleBatchSource, /from "\.\/result-grid-row-inspector"/);
  assert.match(rowInspectorSource, /export function SelectedRowInspector\(/);
  assert.match(rowInspectorSource, /Row Inspector/);
  assert.doesNotMatch(paneSource, /function SelectedRowInspector\(/);
  assert.match(singleBatchSource, /from "\.\/result-grid-status-panels"/);
  assert.match(statusPanelsSource, /export function ResultGridFooter\(/);
  assert.match(statusPanelsSource, /export function PendingRowSummaries\(/);
  assert.match(statusPanelsSource, /export function PendingMutationBar\(/);
  assert.doesNotMatch(paneSource, /function ResultGridFooter\(/);
  assert.doesNotMatch(paneSource, /function PendingRowSummaries\(/);
  assert.doesNotMatch(paneSource, /function PendingMutationBar\(/);
  assert.match(singleBatchSource, /from "\.\/result-grid-toolbar"/);
  assert.match(toolbarSource, /export function ResultGridToolbar\(/);
  assert.match(toolbarSource, /Add row draft/);
  assert.doesNotMatch(paneSource, /function ResultGridToolbar\(/);
  assert.doesNotMatch(paneSource, /Add row draft/);
  assert.match(singleBatchSource, /from "\.\/result-grid-column-header"/);
  assert.match(columnHeaderSource, /export function ResultGridColumnHeader\(/);
  assert.match(columnHeaderSource, /cursor-col-resize/);
  assert.doesNotMatch(paneSource, /function ResultGridColumnHeader\(/);
  assert.doesNotMatch(paneSource, /cursor-col-resize/);
  assert.match(singleBatchSource, /from "\.\/result-grid-row"/);
  assert.match(rowSource, /export function ResultGridRow\(/);
  assert.match(rowSource, /<ResultGridCell/);
  assert.doesNotMatch(paneSource, /function ResultGridRow\(/);
  assert.doesNotMatch(paneSource, /<ResultGridCell/);
  assert.match(singleBatchSource, /from "\.\/result-grid-body"/);
  assert.match(bodySource, /export function ResultGridBody\(/);
  assert.match(bodySource, /react-window/);
  assert.match(bodySource, /This query returned no rows\./);
  assert.doesNotMatch(paneSource, /<List<Record<string, never>>/);
  assert.doesNotMatch(paneSource, /This query returned no rows\./);
  assert.match(paneSource, /from "\.\/result-grid-pane-chrome"/);
  assert.match(paneChromeSource, /export function ResultGridEmptyState\(/);
  assert.match(paneChromeSource, /export function ResultGridStopOnErrorBar\(/);
  assert.match(paneChromeSource, /connection-scoped session/);
  assert.doesNotMatch(paneSource, /connection-scoped session/);
  assert.match(cellSource, /export function ResultGridCell\(/);
  assert.match(cellSource, /Primary key column \(read-only\)/);
  assert.match(cellSource, /Omitted from INSERT\. Database default will apply\./);
  assert.doesNotMatch(paneSource, /function ResultGridCell\(/);
  assert.doesNotMatch(paneSource, /Omitted from INSERT\. Database default will apply\./);
});

test("result grid row model applies pending edit and delete state", () => {
  const patch: DbGridEditPatchCell = {
    rowPrimaryKey: { id: 7 },
    rowPkTuple: "id=7",
    columnName: "name",
    beforeValue: "Aki",
    nextValue: "Kai",
  };
  const deleteDraft: DbGridDeleteRowDraft = {
    rowPkTuple: "id=7",
    rowPrimaryKey: { id: 7 },
  };

  const rowView = buildGridRowView(
    row(7, "Aki", true),
    12,
    columns,
    ["id"],
    buildPendingEditLookup({ "id=7:name": patch }),
    buildPendingDeleteLookup({ "id=7": deleteDraft }),
  );

  assert.equal(rowView.kind, "loaded");
  assert.deepEqual(rowView.rowPrimaryKey, { id: 7 });
  assert.equal(rowView.rowPkTuple, "id=7");
  assert.deepEqual(rowView.displayValues, [7, "Kai", true]);
  assert.equal(rowView.dirtyColumnNames.has("name"), true);
  assert.equal(rowView.isPendingDelete, true);
});

test("result grid insert drafts and parsing keep default versus explicit values separate", () => {
  const draft: DbGridInsertedRowDraft = {
    rowDraftId: "draft-1",
    values: {
      name: "New user",
      active: false,
    },
  };

  const rowView = buildInsertedRowView(draft, columns);

  assert.equal(rowView.kind, "insert-draft");
  assert.deepEqual(rowView.displayValues, [null, "New user", false]);
  assert.equal(rowView.includedColumnNames.has("id"), false);
  assert.equal(rowView.includedColumnNames.has("name"), true);
  assert.deepEqual(parseInsertedValue("").kind, "unset");
  assert.deepEqual(parseInsertedValue("NULL"), { kind: "value", value: null });
  assert.deepEqual(parseInsertedValue("42"), { kind: "value", value: 42 });
  assert.deepEqual(parseInsertedValue("false"), { kind: "value", value: false });
});

test("result grid value formatting helpers preserve object and TSV copy contracts", () => {
  assert.deepEqual(valuesToObject([7, "Aki", true], columns), {
    id: 7,
    name: "Aki",
    active: true,
  });
  assert.equal(valuesToTsv([7, "Aki", true], columns), "id\tname\tactive\n7\tAki\ttrue");
  assert.equal(parseEditedValue(null, ""), null);
  assert.equal(parseEditedValue(7, "8"), 8);
  assert.equal(parseEditedValue(true, "no"), false);
});

test("result grid copy model preserves insert draft included column indexes", () => {
  const draft: DbGridInsertedRowDraft = {
    rowDraftId: "draft-copy",
    values: {
      name: "Only name",
    },
  };
  const draftView = buildInsertedRowView(draft, columns);

  assert.equal(
    buildSelectedRowJson(draftView, columns),
    JSON.stringify({ name: "Only name" }, null, 2),
  );
  assert.equal(buildSelectedRowTsv(draftView, columns), "name\nOnly name");
});

test("result grid edit model builds insert and loaded-row commit plans", () => {
  const insertPlan = buildGridEditCommitPlan({
    isEditEnabled: true,
    rowView: buildInsertedRowView({ rowDraftId: "draft-2", values: {} }, columns),
    column: columns[1],
    columnIndex: 1,
    nextRawValue: "Mika",
    primaryKeySet: new Set(["id"]),
    pendingEditLookup: buildPendingEditLookup({}),
  });

  assert.deepEqual(insertPlan, {
    kind: "insert",
    rowDraftId: "draft-2",
    columnName: "name",
    nextValue: "Mika",
  });

  const loadedView = buildGridRowView(
    row(7, "Aki", true),
    0,
    columns,
    ["id"],
    buildPendingEditLookup({}),
    buildPendingDeleteLookup({}),
  );
  const patchPlan = buildGridEditCommitPlan({
    isEditEnabled: true,
    rowView: loadedView,
    column: columns[2],
    columnIndex: 2,
    nextRawValue: "false",
    primaryKeySet: new Set(["id"]),
    pendingEditLookup: buildPendingEditLookup({}),
  });

  assert.deepEqual(patchPlan, {
    kind: "patch",
    patch: {
      rowPrimaryKey: { id: 7 },
      rowPkTuple: "id=7",
      columnName: "active",
      beforeValue: true,
      nextValue: false,
    },
  });
});

test("result grid edit model fails closed for locked or keyless rows", () => {
  const loadedView = buildGridRowView(
    row(7, "Aki", true),
    0,
    columns,
    ["id"],
    buildPendingEditLookup({}),
    buildPendingDeleteLookup({}),
  );

  assert.deepEqual(
    buildGridEditCommitPlan({
      isEditEnabled: true,
      rowView: loadedView,
      column: columns[0],
      columnIndex: 0,
      nextRawValue: "8",
      primaryKeySet: new Set(["id"]),
      pendingEditLookup: buildPendingEditLookup({}),
    }),
    { kind: "ignore" },
  );

  const keylessView = buildGridRowView(
    row(7, "Aki", true),
    0,
    columns,
    ["missing_id"],
    buildPendingEditLookup({}),
    buildPendingDeleteLookup({}),
  );
  const keylessPlan = buildGridEditCommitPlan({
    isEditEnabled: true,
    rowView: keylessView,
    column: columns[1],
    columnIndex: 1,
    nextRawValue: "Kai",
    primaryKeySet: new Set(["missing_id"]),
    pendingEditLookup: buildPendingEditLookup({}),
  });

  assert.equal(keylessPlan.kind, "missing-primary-key");
});

test("result grid batch model owns row filtering and paging metrics", () => {
  const batch: DbQueryBatchResult = {
    sql: "select id, name, active from users",
    columns,
    rows: [row(7, "Aki", true), row(8, "Mika", false)],
    returnedRows: 2,
    elapsedMs: 18,
    hasMore: true,
    nextOffset: 100,
    totalRows: 250,
    pagingMode: "offset",
    loadedRowOffset: 10,
    loadedRowCount: 100,
    rowWindowTruncated: true,
  };

  const rowViews = buildResultGridRowViews({
    batch,
    primaryKeyList: ["id"],
    pendingEditLookup: buildPendingEditLookup({
      "id=7:name": {
        rowPrimaryKey: { id: 7 },
        rowPkTuple: "id=7",
        columnName: "name",
        beforeValue: "Aki",
        nextValue: "Kai",
      },
    }),
    pendingDeleteLookup: buildPendingDeleteLookup({}),
    pendingInsertedRows: {
      draft_1: {
        rowDraftId: "draft_1",
        values: { name: "Draft" },
      },
    },
  });

  assert.equal(rowViews.length, 3);
  assert.deepEqual(filterResultGridRows(rowViews, "kai")[0]?.displayValues, [7, "Kai", true]);

  const metrics = buildResultGridBatchMetrics(batch, 2);
  assert.equal(metrics.loadedCount, 100);
  assert.equal(metrics.retainedCount, 2);
  assert.equal(metrics.totalLabel, "250 total");
  assert.equal(metrics.canLoadMore, true);
  assert.equal(metrics.loadMoreCount, 150);
  assert.match(metrics.footerStatusLabel, /2 shown \/ 2 retained \/ 100 loaded \/ 250 total/);
});
