import type { DbConnectionConfig } from "@shared/schema";
import {
  WORKSPACE_SURFACE_META,
  type WorkspaceSurfaceMeta,
  type WorkspaceView,
} from "./workbench-workspace-route";

export type DbConnectorSidebarMode = "host" | "embedded";

export function resolveDbConnectorSidebarMode(
  workbenchViewId?: string,
): DbConnectorSidebarMode {
  return workbenchViewId ? "host" : "embedded";
}

export function resolveActiveConnection(
  connections: DbConnectionConfig[],
  selectedConnId: string | null,
): DbConnectionConfig | null {
  return selectedConnId
    ? connections.find((connection) => connection.id === selectedConnId) ?? null
    : null;
}

export function formatActiveConnectionLabel(
  activeConnection: DbConnectionConfig | null,
): string {
  return activeConnection
    ? `${activeConnection.name || activeConnection.database} · ${activeConnection.driver}://${activeConnection.host}:${activeConnection.port}/${activeConnection.database}`
    : "未选择活动连接";
}

export function resolveActiveTabValue({
  editingConfig,
  workspaceView,
}: {
  editingConfig: DbConnectionConfig | null;
  workspaceView: WorkspaceView;
}): WorkspaceView {
  return editingConfig ? "connections" : workspaceView;
}

export function isCompatibilityToolActive(activeTabValue: WorkspaceView): boolean {
  return activeTabValue === "schema" || activeTabValue === "diff";
}

export function resolveShellSurface({
  activeConnection,
  activeTabValue,
}: {
  activeConnection: DbConnectionConfig | null;
  activeTabValue: WorkspaceView;
}): WorkspaceSurfaceMeta {
  return activeTabValue === "sql" && !activeConnection
    ? WORKSPACE_SURFACE_META.connections
    : WORKSPACE_SURFACE_META[activeTabValue];
}

export function buildDuplicateConnectionDraft(
  connection: DbConnectionConfig,
): DbConnectionConfig {
  const displayName = connection.name || connection.database;
  return {
    ...connection,
    id: "",
    name: `${displayName} - 副本`,
    password: "",
    hasStoredPassword: false,
    clearStoredPassword: false,
    favorite: false,
  };
}
