import { useMemo } from "react";
import { createWorkbenchInspectionDiffController } from "./workbench-inspection-diff-controller";
import type { UseWorkbenchWorkflowControllersInput } from "./workbench-workflow-controller-types";

export function useWorkbenchInspectionDiffWorkflowController(
  input: UseWorkbenchWorkflowControllersInput,
) {
  return useMemo(
    () =>
      createWorkbenchInspectionDiffController({
        connectionId: input.connection.id,
        runtimeSchema: input.runtimeSchema,
        restoredInspectionTarget: input.restoredInspectionTarget,
        schemaDiffTargetConnectionId: input.schemaDiffTargetConnectionId,
        objectInspectionActions: input.objectInspectionStateActions,
        schemaDiffActions: input.schemaDiffStateActions,
        inspectObject: input.hostApi.connections.inspectObject,
        introspect: input.hostApi.connections.introspect,
        diff: input.hostApi.connections.diff,
        showNotification: input.hostApi.notifications.show,
      }),
    [
      input.connection.id,
      input.hostApi.connections,
      input.hostApi.notifications,
      input.objectInspectionStateActions,
      input.restoredInspectionTarget,
      input.runtimeSchema,
      input.schemaDiffStateActions,
      input.schemaDiffTargetConnectionId,
    ],
  );
}
