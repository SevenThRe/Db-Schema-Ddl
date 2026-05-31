import { useMemo } from "react";
import type { WorkbenchExecutionStateActions } from "./workbench-execution-action-registry";
import {
  createWorkbenchOperatorSurfaceStateActions,
  type WorkbenchOperatorSurfaceStateActions,
} from "./workbench-operator-surface-action-registry";
import type { UseWorkbenchStateActionRegistriesInput } from "./workbench-state-action-registry-types";

export function useWorkbenchOperatorSurfaceStateActions({
  input,
  resultWorkspaceStateActions,
}: {
  input: UseWorkbenchStateActionRegistriesInput;
  resultWorkspaceStateActions: WorkbenchExecutionStateActions["resultWorkspace"];
}): WorkbenchOperatorSurfaceStateActions {
  return useMemo(
    () =>
      createWorkbenchOperatorSurfaceStateActions({
        selectResultTab: resultWorkspaceStateActions.selectResultTab,
        setActiveBatchIndex: resultWorkspaceStateActions.setActiveBatchIndex,
        clearGridDrafts: resultWorkspaceStateActions.clearGridDrafts,
        showNotification: input.showNotification,
        setIsPreparingGridCommit: input.setIsPreparingGridCommit,
        setPreparedGridPlan: input.setPreparedGridPlan,
        setIsCommittingGridEdit: input.setIsCommittingGridEdit,
        setIsInspectingObject: input.setIsInspectingObject,
        setInspectionState: input.setInspectionState,
        setSelectedTableName: input.setSelectedTableName,
        setRestoredInspectionTarget: input.setRestoredInspectionTarget,
        setSchemaDiffTargetConnectionId: input.setSchemaDiffTargetConnectionId,
        setIsSchemaDiffing: input.setIsSchemaDiffing,
        setSchemaDiffState: input.setSchemaDiffState,
        setResults: input.setResults,
        setExplainPlan: input.setExplainPlan,
        setQueryError: input.setQueryError,
        setExplainError: input.setExplainError,
        setPendingEditCells: input.setPendingEditCells,
        setPendingDeleteRows: input.setPendingDeleteRows,
        setPendingInsertedRows: input.setPendingInsertedRows,
        setLastGridEditSource: input.setLastGridEditSource,
        setSqlCopilotSettingsDraft: input.setSqlCopilotSettingsDraft,
      }),
    [input, resultWorkspaceStateActions],
  );
}
