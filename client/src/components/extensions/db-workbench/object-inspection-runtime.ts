import type {
  DbObjectInspectionRequest,
  DbObjectInspectionResponse,
  DbObjectKind,
} from "@shared/schema";
import type { WorkbenchInspectionTarget } from "./workbench-session";
import { formatWorkbenchError } from "./workbench-errors";

export type ObjectInspectionNotice = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

export type ObjectInspectionWorkspaceState = {
  inspection: DbObjectInspectionResponse | null;
  error: string | null;
};

export function createEmptyObjectInspectionState(
  error: string | null = null,
): ObjectInspectionWorkspaceState {
  return {
    inspection: null,
    error,
  };
}

export function createObjectInspectionSuccessState(
  inspection: DbObjectInspectionResponse,
): ObjectInspectionWorkspaceState {
  return {
    inspection,
    error: null,
  };
}

export function buildObjectInspectionRequest(input: {
  connectionId: string;
  runtimeSchema?: string | null;
  objectKind: DbObjectKind;
  objectName: string;
  signature?: string | null;
  parentObjectName?: string | null;
}): DbObjectInspectionRequest {
  return {
    connectionId: input.connectionId,
    schema: input.runtimeSchema ?? undefined,
    objectKind: input.objectKind,
    objectName: input.objectName,
    signature: input.signature ?? undefined,
    parentObjectName: input.parentObjectName ?? undefined,
  };
}

export function createObjectInspectionFailureState(error: unknown): {
  state: ObjectInspectionWorkspaceState;
  notice: ObjectInspectionNotice;
} {
  const message = formatWorkbenchError(
    error,
    "Failed to inspect database object.",
  );

  return {
    state: createEmptyObjectInspectionState(message),
    notice: {
      title: "Object inspection failed",
      description: message,
      variant: "destructive",
    },
  };
}

export function tableNameFromInspection(
  inspection: DbObjectInspectionResponse,
): string | null {
  return inspection.objectKind === "table" ? inspection.objectName : null;
}

export function buildInspectionTargetForSession(
  inspection: DbObjectInspectionResponse | null,
  restoredInspectionTarget: WorkbenchInspectionTarget | null,
): WorkbenchInspectionTarget | null {
  if (!inspection) {
    return restoredInspectionTarget;
  }

  return {
    objectKind: inspection.objectKind,
    objectName: inspection.objectName,
    signature: inspection.signature ?? null,
    parentObjectName: inspection.parentObjectName ?? null,
  };
}
