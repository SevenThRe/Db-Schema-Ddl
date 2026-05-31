import type {
  DbObjectInspectionRequest,
  DbObjectInspectionResponse,
  DbObjectKind,
  DbSchemaDiffResult,
  DbSchemaSnapshot,
} from "@shared/schema";
import {
  runObjectInspection,
  type ObjectInspectionStateActions,
} from "./object-inspection-runner";
import {
  runRestoredObjectInspectionTarget,
} from "./object-inspection-session-runner";
import {
  runSchemaDiffPreview,
  type SchemaDiffStateActions,
} from "./schema-diff-runner";
import type { ObjectInspectionNotice } from "./object-inspection-runtime";
import type { SchemaDiffNotice } from "./schema-diff-runtime";
import type { WorkbenchInspectionTarget } from "./workbench-session";

export interface WorkbenchInspectionDiffController {
  handleInspectObject: (
    objectKind: DbObjectKind,
    objectName: string,
    options?: {
      signature?: string | null;
      parentObjectName?: string | null;
    },
  ) => Promise<DbObjectInspectionResponse | null>;
  handleRestoreInspectionTarget: () => Promise<boolean>;
  handlePreviewSchemaDiff: () => Promise<void>;
}

export function createWorkbenchInspectionDiffController(input: {
  connectionId: string;
  runtimeSchema?: string | null;
  restoredInspectionTarget: WorkbenchInspectionTarget | null;
  schemaDiffTargetConnectionId: string | null | undefined;
  objectInspectionActions: ObjectInspectionStateActions;
  schemaDiffActions: SchemaDiffStateActions;
  inspectObject: (
    request: DbObjectInspectionRequest,
  ) => Promise<DbObjectInspectionResponse>;
  introspect: (connectionId: string) => Promise<DbSchemaSnapshot>;
  diff: (
    sourceConnectionId: string,
    targetConnectionId: string,
  ) => Promise<DbSchemaDiffResult>;
  showNotification: (notice: ObjectInspectionNotice | SchemaDiffNotice) => void;
}): WorkbenchInspectionDiffController {
  const handleInspectObject = async (
    objectKind: DbObjectKind,
    objectName: string,
    options?: {
      signature?: string | null;
      parentObjectName?: string | null;
    },
  ) =>
    runObjectInspection({
      connectionId: input.connectionId,
      runtimeSchema: input.runtimeSchema,
      objectKind,
      objectName,
      signature: options?.signature ?? null,
      parentObjectName: options?.parentObjectName ?? null,
      inspectObject: input.inspectObject,
      setResultTab: input.objectInspectionActions.setResultTab,
      beginInspection: input.objectInspectionActions.beginInspection,
      applyState: input.objectInspectionActions.applyState,
      selectTable: input.objectInspectionActions.selectTable,
      showNotification: input.showNotification,
      finishInspection: input.objectInspectionActions.finishInspection,
    });

  return {
    handleInspectObject,
    handleRestoreInspectionTarget: () =>
      runRestoredObjectInspectionTarget({
        restoredInspectionTarget: input.restoredInspectionTarget,
        inspectObject: handleInspectObject,
        clearRestoredInspectionTarget:
          input.objectInspectionActions.clearRestoredInspectionTarget,
      }),
    handlePreviewSchemaDiff: async () => {
      await runSchemaDiffPreview({
        sourceConnectionId: input.connectionId,
        targetConnectionId: input.schemaDiffTargetConnectionId,
        introspect: input.introspect,
        diff: input.diff,
        setResultTab: input.schemaDiffActions.setResultTab,
        beginCompare: input.schemaDiffActions.beginCompare,
        applyState: input.schemaDiffActions.applyState,
        showNotification: input.showNotification,
        finishCompare: input.schemaDiffActions.finishCompare,
      });
    },
  };
}
