const WORKSPACE_CONNECTION_STORAGE_KEY = "db-workbench:selected-connection:v1";
const WORKSPACE_VIEW_STORAGE_KEY = "db-workbench:workspace-view:v1";

export const DB_CONNECTOR_SELECT_CONNECTION_EVENT = "db-connector:select-connection";

export function readStoredDbConnectorConnectionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const value = window.localStorage.getItem(WORKSPACE_CONNECTION_STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function persistDbConnectorConnectionSelection(connectionId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (connectionId) {
      window.localStorage.setItem(WORKSPACE_CONNECTION_STORAGE_KEY, connectionId);
      window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, "sql");
    } else {
      window.localStorage.removeItem(WORKSPACE_CONNECTION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures inside sandboxed runtime iframes.
  }
}

export function dispatchDbConnectorConnectionSelection(connectionId: string): void {
  if (typeof window === "undefined" || !connectionId) {
    return;
  }

  persistDbConnectorConnectionSelection(connectionId);
  window.dispatchEvent(
    new CustomEvent<{ connectionId: string }>(DB_CONNECTOR_SELECT_CONNECTION_EVENT, {
      detail: { connectionId },
    }),
  );
}

export function subscribeDbConnectorConnectionSelection(
  callback: (connectionId: string) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ connectionId?: string }>).detail;
    if (detail?.connectionId) {
      callback(detail.connectionId);
    }
  };

  window.addEventListener(DB_CONNECTOR_SELECT_CONNECTION_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(DB_CONNECTOR_SELECT_CONNECTION_EVENT, handler as EventListener);
  };
}
