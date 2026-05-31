import { useEffect } from "react";
import type { QueryExecutionResponse } from "@shared/schema";

import {
  runClearGridDraftsForResultContext,
  runClearResultWindowCapNotices,
  runRepairActiveBatchIndex,
  type ResultWorkspaceStateActions,
} from "./result-workspace-runner";

export interface UseWorkbenchResultEffectsInput {
  connectionId: string;
  results: QueryExecutionResponse | null;
  activeBatchIndex: number;
  resultWorkspaceStateActions: ResultWorkspaceStateActions;
}

export function useWorkbenchResultEffects({
  connectionId,
  results,
  activeBatchIndex,
  resultWorkspaceStateActions,
}: UseWorkbenchResultEffectsInput): void {
  useEffect(() => {
    runClearResultWindowCapNotices(resultWorkspaceStateActions);
  }, [connectionId, resultWorkspaceStateActions, results?.requestId]);

  useEffect(() => {
    runRepairActiveBatchIndex({
      results,
      activeBatchIndex,
      setActiveBatchIndex: resultWorkspaceStateActions.setActiveBatchIndex,
    });
  }, [results, activeBatchIndex, resultWorkspaceStateActions]);

  useEffect(() => {
    runClearGridDraftsForResultContext(resultWorkspaceStateActions);
  }, [activeBatchIndex, resultWorkspaceStateActions, results?.requestId]);
}
