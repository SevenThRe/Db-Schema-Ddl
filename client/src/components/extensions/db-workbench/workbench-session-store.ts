import {
  EMPTY_SESSION,
  sanitizeSession,
  sessionStorageKey,
} from "./workbench-session-codec";
import type { WorkbenchSessionState } from "./workbench-session-types";

export function loadSessionForConnection(connectionId: string): WorkbenchSessionState {
  if (typeof window === "undefined") {
    return { ...EMPTY_SESSION };
  }

  const normalizedConnectionId = connectionId.trim();
  if (!normalizedConnectionId) {
    return { ...EMPTY_SESSION };
  }

  const raw = window.localStorage.getItem(sessionStorageKey(normalizedConnectionId));
  if (!raw) {
    return { ...EMPTY_SESSION };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WorkbenchSessionState>;
    return sanitizeSession(normalizedConnectionId, parsed);
  } catch {
    return { ...EMPTY_SESSION };
  }
}

export function saveSessionForConnection(
  connectionId: string,
  session: Partial<WorkbenchSessionState>,
): WorkbenchSessionState {
  const normalizedConnectionId = connectionId.trim();
  const sanitized = sanitizeSession(normalizedConnectionId, session);

  if (typeof window === "undefined" || !normalizedConnectionId) {
    return sanitized;
  }

  window.localStorage.setItem(
    sessionStorageKey(normalizedConnectionId),
    JSON.stringify(sanitized),
  );
  return sanitized;
}
