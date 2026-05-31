import type { Dispatch, SetStateAction } from "react";
import type { ToastOptions } from "@/extensions/host-api";
import type {
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridEditSource,
  DbGridInsertedRowDraft,
  DbGridPrepareCommitResponse,
  QueryExecutionResponse,
} from "@shared/schema";
import type { DbExplainPlan } from "@shared/schema";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";
import {
  createGridCommitStateActions,
  type GridCommitStateActions,
} from "./grid-commit-runner";
import {
  createGridEditDraftStateActions,
  type GridEditDraftActions,
} from "./grid-edit-draft-runner";
import {
  createObjectInspectionStateActions,
  type ObjectInspectionStateActions,
} from "./object-inspection-runner";
import type { ObjectInspectionWorkspaceState } from "./object-inspection-runtime";
import {
  createSchemaDiffStateActions,
  type SchemaDiffStateActions,
} from "./schema-diff-runner";
import type { SchemaDiffWorkspaceState } from "./schema-diff-runtime";
import {
  createNavigationStateActions,
  type NavigationStateActions,
} from "./workbench-navigation-runner";
import {
  createWorkbenchSchemaStateActions,
  type WorkbenchSchemaStateActions,
} from "./workbench-schema-state-runner";
import type {
  WorkbenchInspectionTarget,
  WorkbenchResultTab,
} from "./workbench-session";

export interface WorkbenchOperatorSurfaceStateActions {
  gridDraft: GridEditDraftActions;
  gridCommit: GridCommitStateActions;
  objectInspection: ObjectInspectionStateActions;
  schemaDiff: SchemaDiffStateActions;
  navigation: NavigationStateActions;
  schema: WorkbenchSchemaStateActions;
}

export function createWorkbenchOperatorSurfaceStateActions(input: {
  selectResultTab: (tab: WorkbenchResultTab) => void;
  setActiveBatchIndex: (index: number) => void;
  clearGridDrafts: () => void;
  showNotification: (notice: ToastOptions) => void;
  setIsPreparingGridCommit: (isPreparing: boolean) => void;
  setPreparedGridPlan: Dispatch<SetStateAction<DbGridPrepareCommitResponse | null>>;
  setIsCommittingGridEdit: (isCommitting: boolean) => void;
  setIsInspectingObject: (isInspecting: boolean) => void;
  setInspectionState: (state: ObjectInspectionWorkspaceState) => void;
  setSelectedTableName: Dispatch<SetStateAction<string | null>>;
  setRestoredInspectionTarget: (target: WorkbenchInspectionTarget | null) => void;
  setSchemaDiffTargetConnectionId: Dispatch<SetStateAction<string>>;
  setIsSchemaDiffing: (isDiffing: boolean) => void;
  setSchemaDiffState: (state: SchemaDiffWorkspaceState) => void;
  setResults: (results: QueryExecutionResponse | null) => void;
  setExplainPlan: (plan: DbExplainPlan | null) => void;
  setQueryError: (message: string | null) => void;
  setExplainError: (message: string | null) => void;
  setPendingEditCells: Dispatch<SetStateAction<Record<string, DbGridEditPatchCell>>>;
  setPendingDeleteRows: Dispatch<SetStateAction<Record<string, DbGridDeleteRowDraft>>>;
  setPendingInsertedRows: Dispatch<SetStateAction<Record<string, DbGridInsertedRowDraft>>>;
  setLastGridEditSource: (source: DbGridEditSource | null) => void;
  setSqlCopilotSettingsDraft: (draft: SqlCopilotSettingsDraft) => void;
}): WorkbenchOperatorSurfaceStateActions {
  return {
    gridDraft: createGridEditDraftStateActions({
      setPendingEditCells: input.setPendingEditCells,
      setPendingDeleteRows: input.setPendingDeleteRows,
      setPendingInsertedRows: input.setPendingInsertedRows,
      setPreparedGridPlan: input.setPreparedGridPlan,
    }),
    gridCommit: createGridCommitStateActions({
      setIsPreparing: input.setIsPreparingGridCommit,
      setPreparedPlan: input.setPreparedGridPlan,
      setIsCommitting: input.setIsCommittingGridEdit,
      clearDrafts: input.clearGridDrafts,
    }),
    objectInspection: createObjectInspectionStateActions({
      setResultTab: () => input.selectResultTab("inspect"),
      setIsInspectingObject: input.setIsInspectingObject,
      setInspectionState: input.setInspectionState,
      setSelectedTableName: (tableName) => input.setSelectedTableName(tableName),
      setRestoredInspectionTarget: input.setRestoredInspectionTarget,
    }),
    schemaDiff: createSchemaDiffStateActions({
      setResultTab: () => input.selectResultTab("schema-diff"),
      setSchemaDiffTargetConnectionId: input.setSchemaDiffTargetConnectionId,
      setIsSchemaDiffing: input.setIsSchemaDiffing,
      setSchemaDiffState: input.setSchemaDiffState,
    }),
    navigation: createNavigationStateActions({
      setSelectedTableName: (tableName) => input.setSelectedTableName(tableName),
      setResults: input.setResults,
      setExplainPlan: input.setExplainPlan,
      setQueryError: input.setQueryError,
      setExplainError: input.setExplainError,
      setActiveBatchIndex: input.setActiveBatchIndex,
      setResultTab: input.selectResultTab,
      setPendingEditCells: input.setPendingEditCells,
      setPendingDeleteRows: input.setPendingDeleteRows,
      setPendingInsertedRows: input.setPendingInsertedRows,
      setPreparedGridPlan: input.setPreparedGridPlan,
      setLastGridEditSource: input.setLastGridEditSource,
    }),
    schema: createWorkbenchSchemaStateActions({
      showNotification: input.showNotification,
      setSqlCopilotSettingsDraft: input.setSqlCopilotSettingsDraft,
      setSelectedTableName: input.setSelectedTableName,
    }),
  };
}
