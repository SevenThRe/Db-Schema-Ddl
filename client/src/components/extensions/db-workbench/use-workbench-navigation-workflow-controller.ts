import { useMemo } from "react";
import { createWorkbenchNavigationController } from "./workbench-navigation-controller";
import { invalidateConnectionQueries } from "./workbench-query-cache";
import type { UseWorkbenchWorkflowControllersInput } from "./workbench-workflow-controller-types";

export function useWorkbenchNavigationWorkflowController(
  input: UseWorkbenchWorkflowControllersInput,
) {
  return useMemo(
    () =>
      createWorkbenchNavigationController({
        connection: input.connection,
        activeSchema: input.activeSchema,
        tables: input.schemaSnapshot?.tables,
        runtimeSchema: input.runtimeSchema,
        snapshotSchema: input.schemaSnapshot?.schema,
        actions: input.navigationStateActions,
        onSwitchConnection: input.onSwitchConnection,
        saveConnection: input.hostApi.connections.save,
        invalidateConnections: () => invalidateConnectionQueries(input.queryClient),
        refetchSchema: input.refetchSchema,
        refetchSchemaOptions: input.refetchSchemaOptions,
        applyActiveSchema: input.setActiveSchema,
        updateActiveTabSql: input.updateActiveTabSql,
        setResultTab: input.resultWorkspaceStateActions.selectResultTab,
        setLastGridEditSource: input.setLastGridEditSource,
        focusSqlEditor: input.focusSqlEditor,
        executeQuery: input.executeQuery,
        showNotification: input.hostApi.notifications.show,
      }),
    [
      input.activeSchema,
      input.connection,
      input.executeQuery,
      input.focusSqlEditor,
      input.hostApi.connections,
      input.hostApi.notifications,
      input.navigationStateActions,
      input.onSwitchConnection,
      input.queryClient,
      input.refetchSchema,
      input.refetchSchemaOptions,
      input.resultWorkspaceStateActions,
      input.runtimeSchema,
      input.schemaSnapshot?.schema,
      input.schemaSnapshot?.tables,
      input.setActiveSchema,
      input.setLastGridEditSource,
      input.updateActiveTabSql,
    ],
  );
}
