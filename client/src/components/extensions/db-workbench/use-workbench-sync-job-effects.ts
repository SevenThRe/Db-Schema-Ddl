import { useEffect } from "react";

import type {
  WorkbenchSyncJobController,
} from "./workbench-sync-job-controller";

export interface UseWorkbenchSyncJobEffectsInput {
  connectionId: string;
  syncJobController: WorkbenchSyncJobController;
}

export function useWorkbenchSyncJobEffects({
  connectionId,
  syncJobController,
}: UseWorkbenchSyncJobEffectsInput): void {
  useEffect(() => {
    void syncJobController.refreshBackgroundJobs();
  }, [connectionId, syncJobController]);

  useEffect(() => {
    void syncJobController.handleLoadSelectedJobDetail();
  }, [syncJobController]);

  useEffect(() => {
    return syncJobController.startApplyJobPolling();
  }, [syncJobController]);
}
