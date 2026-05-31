import { useEffect } from "react";

import type {
  ObjectInspectionStateActions,
} from "./object-inspection-runner";
import {
  runResetObjectInspectionForContext,
} from "./object-inspection-session-runner";

export interface UseWorkbenchInspectionEffectsInput {
  connectionId: string;
  runtimeSchema?: string | null;
  objectInspectionStateActions: ObjectInspectionStateActions;
  restoreInspectionTarget: () => Promise<boolean>;
}

export function useWorkbenchInspectionEffects({
  connectionId,
  runtimeSchema,
  objectInspectionStateActions,
  restoreInspectionTarget,
}: UseWorkbenchInspectionEffectsInput): void {
  useEffect(() => {
    runResetObjectInspectionForContext(objectInspectionStateActions);
  }, [connectionId, objectInspectionStateActions, runtimeSchema]);

  useEffect(() => {
    void restoreInspectionTarget();
  }, [restoreInspectionTarget]);
}
