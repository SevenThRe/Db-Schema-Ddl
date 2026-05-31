import test from "node:test";
import assert from "node:assert/strict";

import {
  createWorkbenchOperatorSurfaceStateActions,
} from "../../client/src/components/extensions/db-workbench/workbench-operator-surface-action-registry.ts";
import { createQueryWorkspaceResetState } from "../../client/src/components/extensions/db-workbench/workbench-reset-runtime.ts";

test("workbench operator surface action registry groups edit draft, commit, inspection, diff, navigation, and schema actions", () => {
  const events: string[] = [];
  let selectedTab = "";
  let selectedTable: string | null = null;
  let schemaDiffTarget = "";
  let preparedPlan: unknown = { existing: true };

  const actions = createWorkbenchOperatorSurfaceStateActions({
    selectResultTab: (tab) => {
      selectedTab = tab;
      events.push(`tab:${tab}`);
    },
    setActiveBatchIndex: (index) => events.push(`batch:${index}`),
    clearGridDrafts: () => events.push("drafts:clear"),
    showNotification: (notice) => events.push(`notice:${notice.title}`),
    setIsPreparingGridCommit: (isPreparing) => events.push(`preparing:${isPreparing}`),
    setPreparedGridPlan: (value) => {
      preparedPlan = typeof value === "function" ? value(preparedPlan as never) : value;
      events.push(`prepared:${preparedPlan ? "set" : "clear"}`);
    },
    setIsCommittingGridEdit: (isCommitting) => events.push(`committing:${isCommitting}`),
    setIsInspectingObject: (isInspecting) => events.push(`inspecting:${isInspecting}`),
    setInspectionState: () => events.push("inspection:set"),
    setSelectedTableName: (value) => {
      selectedTable = typeof value === "function" ? value(selectedTable) : value;
      events.push(`table:${selectedTable ?? "none"}`);
    },
    setRestoredInspectionTarget: (target) =>
      events.push(`restoredInspection:${target ? "set" : "clear"}`),
    setSchemaDiffTargetConnectionId: (value) => {
      schemaDiffTarget =
        typeof value === "function" ? value(schemaDiffTarget) : value;
      events.push(`target:${schemaDiffTarget}`);
    },
    setIsSchemaDiffing: (isDiffing) => events.push(`diffing:${isDiffing}`),
    setSchemaDiffState: () => events.push("schemaDiff:set"),
    setResults: (results) => events.push(`results:${results ? "set" : "clear"}`),
    setExplainPlan: (plan) => events.push(`explain:${plan ? "set" : "clear"}`),
    setQueryError: (message) => events.push(`queryError:${message ?? "clear"}`),
    setExplainError: (message) => events.push(`explainError:${message ?? "clear"}`),
    setPendingEditCells: (value) =>
      events.push(`editCells:${typeof value === "function" ? "update" : "set"}`),
    setPendingDeleteRows: (value) =>
      events.push(`deleteRows:${typeof value === "function" ? "update" : "set"}`),
    setPendingInsertedRows: (value) =>
      events.push(`insertRows:${typeof value === "function" ? "update" : "set"}`),
    setLastGridEditSource: (source) =>
      events.push(`gridSource:${source ? source.kind : "clear"}`),
    setSqlCopilotSettingsDraft: () => events.push("copilotSettings:set"),
  });

  actions.gridDraft.clearPreparedPlan();
  actions.gridCommit.beginPrepare();
  actions.gridCommit.clearPreparedPlan();
  actions.objectInspection.setResultTab();
  actions.objectInspection.selectTable("orders");
  actions.schemaDiff.setResultTab();
  actions.schemaDiff.setTargetConnectionId("target-db");
  actions.navigation.applyQueryWorkspaceReset(createQueryWorkspaceResetState());
  actions.schema.notifyDdlSettingsFailure(new Error("settings missing"));

  assert.equal(selectedTab, "results");
  assert.equal(selectedTable, "orders");
  assert.equal(schemaDiffTarget, "target-db");
  assert.equal(preparedPlan, null);
  assert.ok(events.includes("preparing:true"));
  assert.ok(events.includes("tab:inspect"));
  assert.ok(events.includes("tab:schema-diff"));
  assert.ok(events.includes("batch:0"));
  assert.ok(events.includes("notice:SQL copilot settings unavailable"));
});
