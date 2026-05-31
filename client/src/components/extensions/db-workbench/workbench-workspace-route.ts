export type WorkspaceView = "connections" | "schema" | "diff" | "sql";
export type WorkspaceSurfaceStatus =
  | "Primary"
  | "Primary Support"
  | "Compatibility";

export interface WorkspaceSurfaceMeta {
  status: WorkspaceSurfaceStatus;
  title: string;
  description: string;
}

const WORKSPACE_VIEW_STORAGE_KEY = "db-workbench:workspace-view:v1";
const WORKSPACE_CONNECTION_STORAGE_KEY =
  "db-workbench:selected-connection:v1";
const WORKSPACE_VIEW_QUERY_KEY = "db-workbench-view";
const WORKSPACE_CONNECTION_QUERY_KEY = "db-workbench-connection";

export const PRIMARY_WORKSPACE_VIEW: WorkspaceView = "sql";
export const COMPATIBILITY_SURFACE_NOTE =
  "Compatibility-only surfaces remain for parity review and migration cleanup. Daily-driver work should return to Database Workspace.";
export const WORKSPACE_SURFACE_META: Record<
  WorkspaceView,
  WorkspaceSurfaceMeta
> = {
  connections: {
    status: "Primary Support",
    title: "Connection Center",
    description:
      "Primary support surface. Save, recover, and organize connections here, then return to the Database Workspace daily-driver route.",
  },
  schema: {
    status: "Compatibility",
    title: "Compatibility Schema Browser",
    description:
      "Compatibility-only surface. Keep it for parity checks and migration-era regression, not as a co-equal DB route.",
  },
  diff: {
    status: "Compatibility",
    title: "Compatibility Schema Diff",
    description:
      "Compatibility-only surface. Keep it for cross-connection parity review until the canonical route fully absorbs the need.",
  },
  sql: {
    status: "Primary",
    title: "Database Workspace",
    description:
      "Daily-driver route. Connection context, inspection, query, results, and guarded operations stay in one canonical surface.",
  },
};

export function isWorkspaceView(value: string | null): value is WorkspaceView {
  return (
    value === "connections" ||
    value === "schema" ||
    value === "diff" ||
    value === "sql"
  );
}

export function readInitialWorkspaceView(
  selectedConnId: string | null,
): WorkspaceView {
  if (typeof window === "undefined") return "connections";
  if (selectedConnId) {
    return PRIMARY_WORKSPACE_VIEW;
  }

  const params = new URLSearchParams(window.location.search);
  const routeValue = params.get(WORKSPACE_VIEW_QUERY_KEY);
  if (isWorkspaceView(routeValue)) {
    return routeValue;
  }

  try {
    const storedValue = window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY);
    return isWorkspaceView(storedValue) ? storedValue : "connections";
  } catch {
    return "connections";
  }
}

export function readInitialSelectedConnectionId(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const routeValue = params.get(WORKSPACE_CONNECTION_QUERY_KEY);
  if (routeValue) {
    return routeValue;
  }

  try {
    const storedValue = window.localStorage.getItem(
      WORKSPACE_CONNECTION_STORAGE_KEY,
    );
    return storedValue && storedValue.trim() ? storedValue : null;
  } catch {
    return null;
  }
}

export function persistWorkspaceRoute(
  view: WorkspaceView,
  connectionId: string | null,
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, view);
    if (connectionId) {
      window.localStorage.setItem(
        WORKSPACE_CONNECTION_STORAGE_KEY,
        connectionId,
      );
    } else {
      window.localStorage.removeItem(WORKSPACE_CONNECTION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures inside sandboxed runtime iframes.
  }

  try {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set(WORKSPACE_VIEW_QUERY_KEY, view);
    if (connectionId) {
      nextUrl.searchParams.set(WORKSPACE_CONNECTION_QUERY_KEY, connectionId);
    } else {
      nextUrl.searchParams.delete(WORKSPACE_CONNECTION_QUERY_KEY);
    }

    window.history.replaceState(window.history.state, "", nextUrl);
  } catch {
    // Ignore history update failures inside constrained runtime mounts.
  }
}
