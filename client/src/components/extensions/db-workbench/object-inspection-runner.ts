import type {
  DbObjectInspectionRequest,
  DbObjectInspectionResponse,
  DbObjectKind,
} from "@shared/schema";
import {
  buildObjectInspectionRequest,
  createEmptyObjectInspectionState,
  createObjectInspectionFailureState,
  createObjectInspectionSuccessState,
  tableNameFromInspection,
  type ObjectInspectionNotice,
  type ObjectInspectionWorkspaceState,
} from "./object-inspection-runtime";
import type { WorkbenchInspectionTarget } from "./workbench-session";

export interface RunObjectInspectionInput {
  connectionId: string;
  runtimeSchema?: string | null;
  objectKind: DbObjectKind;
  objectName: string;
  signature?: string | null;
  parentObjectName?: string | null;
  inspectObject: (
    request: DbObjectInspectionRequest,
  ) => Promise<DbObjectInspectionResponse>;
  setResultTab: () => void;
  beginInspection: () => void;
  applyState: (state: ObjectInspectionWorkspaceState) => void;
  selectTable: (tableName: string) => void;
  showNotification: (notice: ObjectInspectionNotice) => void;
  finishInspection: () => void;
}

export interface ObjectInspectionStateActions {
  setResultTab: () => void;
  beginInspection: () => void;
  applyState: (state: ObjectInspectionWorkspaceState) => void;
  resetState: () => void;
  selectTable: (tableName: string) => void;
  clearRestoredInspectionTarget: () => void;
  finishInspection: () => void;
}

export function createObjectInspectionStateActions(input: {
  setResultTab: () => void;
  setIsInspectingObject: (isInspecting: boolean) => void;
  setInspectionState: (state: ObjectInspectionWorkspaceState) => void;
  setSelectedTableName: (tableName: string) => void;
  setRestoredInspectionTarget: (target: WorkbenchInspectionTarget | null) => void;
}): ObjectInspectionStateActions {
  return {
    setResultTab: input.setResultTab,
    beginInspection: () => input.setIsInspectingObject(true),
    applyState: input.setInspectionState,
    resetState: () => input.setInspectionState(createEmptyObjectInspectionState()),
    selectTable: input.setSelectedTableName,
    clearRestoredInspectionTarget: () => input.setRestoredInspectionTarget(null),
    finishInspection: () => input.setIsInspectingObject(false),
  };
}

export async function runObjectInspection(
  input: RunObjectInspectionInput,
): Promise<DbObjectInspectionResponse | null> {
  input.setResultTab();
  input.beginInspection();
  input.applyState(createEmptyObjectInspectionState());

  try {
    const inspection = await input.inspectObject(
      buildObjectInspectionRequest({
        connectionId: input.connectionId,
        runtimeSchema: input.runtimeSchema,
        objectKind: input.objectKind,
        objectName: input.objectName,
        signature: input.signature ?? null,
        parentObjectName: input.parentObjectName ?? null,
      }),
    );

    input.applyState(createObjectInspectionSuccessState(inspection));
    const inspectedTableName = tableNameFromInspection(inspection);
    if (inspectedTableName) {
      input.selectTable(inspectedTableName);
    }
    return inspection;
  } catch (error) {
    const failure = createObjectInspectionFailureState(error);
    input.applyState(failure.state);
    input.showNotification(failure.notice);
    return null;
  } finally {
    input.finishInspection();
  }
}
