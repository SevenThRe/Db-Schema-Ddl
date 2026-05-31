import type { DbObjectInspectionResponse } from "@shared/schema";
import type { WorkbenchInspectionTarget } from "./workbench-session";

export async function runRestoredObjectInspectionTarget(input: {
  restoredInspectionTarget: WorkbenchInspectionTarget | null;
  inspectObject: (
    objectKind: WorkbenchInspectionTarget["objectKind"],
    objectName: string,
    options?: {
      signature?: string | null;
      parentObjectName?: string | null;
    },
  ) => Promise<DbObjectInspectionResponse | null>;
  clearRestoredInspectionTarget: () => void;
}): Promise<boolean> {
  const target = input.restoredInspectionTarget;
  if (!target) return false;

  await input.inspectObject(target.objectKind, target.objectName, {
    signature: target.signature,
    parentObjectName: target.parentObjectName,
  });
  input.clearRestoredInspectionTarget();
  return true;
}

export function runResetObjectInspectionForContext(input: {
  resetState: () => void;
}): void {
  input.resetState();
}
