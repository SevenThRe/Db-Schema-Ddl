import { useMemo } from "react";
import type { DbConnectionConfig } from "@shared/schema";
import { useWorkbenchExecutionWorkspaceState } from "./use-workbench-execution-workspace-state";
import { useWorkbenchOperatorWorkspaceState } from "./use-workbench-operator-workspace-state";
import { useWorkbenchResultWindowCapNotices } from "./use-workbench-result-window-cap-notices";
import { useWorkbenchResultWorkspaceState } from "./use-workbench-result-workspace-state";
import { useWorkbenchSqlWorkspaceState } from "./use-workbench-sql-workspace-state";
import { useWorkbenchSyncWorkspaceState } from "./use-workbench-sync-workspace-state";
import { hydrateConnectionSession } from "./workbench-session-hydration";

export interface WorkbenchLayoutWorkspaceStateInput {
  connection: DbConnectionConfig;
}

export function useWorkbenchLayoutWorkspaceState({
  connection,
}: WorkbenchLayoutWorkspaceStateInput) {
  const initialSession = useMemo(
    () => hydrateConnectionSession(connection.id),
    [connection.id],
  );

  const sqlWorkspaceState = useWorkbenchSqlWorkspaceState(initialSession);
  const executionWorkspaceState = useWorkbenchExecutionWorkspaceState(
    initialSession.lastResultTab,
  );
  const resultWindowCapNotices = useWorkbenchResultWindowCapNotices();
  const resultWorkspaceState = useWorkbenchResultWorkspaceState(
    initialSession.selectedJobId,
  );
  const syncWorkspaceState = useWorkbenchSyncWorkspaceState(connection.id);
  const operatorWorkspaceState = useWorkbenchOperatorWorkspaceState({
    connection,
    initialSession,
  });

  return {
    initialSession,
    sqlWorkspaceState,
    executionWorkspaceState,
    resultWindowCapNotices,
    resultWorkspaceState,
    syncWorkspaceState,
    operatorWorkspaceState,
  };
}
