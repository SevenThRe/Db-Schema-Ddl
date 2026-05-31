export type WorkbenchRequestKind = "query" | "export";

export type WorkbenchCancellationTargets = {
  queryRequestId: string | null;
  exportRequestId: string | null;
};

export function isActiveWorkbenchRequest(
  activeRequestId: string | null,
  requestId: string,
): boolean {
  return activeRequestId === requestId;
}

export function shouldIgnoreWorkbenchResponse(input: {
  activeRequestId: string | null;
  requestId: string;
}): boolean {
  return !isActiveWorkbenchRequest(input.activeRequestId, input.requestId);
}

export function shouldFinalizeWorkbenchRequest(input: {
  activeRequestId: string | null;
  requestId: string;
}): boolean {
  return isActiveWorkbenchRequest(input.activeRequestId, input.requestId);
}

export function resolveWorkbenchCancellationTargets(input: {
  queryRequestId: string | null;
  exportRequestId: string | null;
}): WorkbenchCancellationTargets {
  return {
    queryRequestId: input.queryRequestId,
    exportRequestId: input.exportRequestId,
  };
}
