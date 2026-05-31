import { useState } from "react";
import type { HostApi } from "@/extensions/host-api";
import type {
  DbConnectionConfig,
} from "@shared/schema";
import { useDbConnectorCompatibilityState } from "./use-db-connector-compatibility-state";
import { useDbConnectorWorkspaceActions } from "./use-db-connector-workspace-actions";
import { useDbConnectorConnectionState } from "./use-db-connector-connection-state";
import { useDbConnectorWorkspaceRuntimeEffects } from "./use-db-connector-workspace-runtime-effects";
import {
  formatActiveConnectionLabel,
  isCompatibilityToolActive,
  resolveActiveConnection,
  resolveActiveTabValue,
  resolveDbConnectorSidebarMode,
  resolveShellSurface,
} from "./db-connector-workspace-controller-model";
import {
  PRIMARY_WORKSPACE_VIEW,
  isWorkspaceView,
  readInitialSelectedConnectionId,
  readInitialWorkspaceView,
  type WorkspaceView,
} from "./workbench-workspace-route";

export function useDbConnectorWorkspaceController({
  host,
  workbenchViewId,
}: {
  host: HostApi;
  workbenchViewId?: string;
}) {
  const toast = host.notifications.show;
  const [selectedConnId, setSelectedConnId] = useState<string | null>(() =>
    readInitialSelectedConnectionId(),
  );
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() =>
    readInitialWorkspaceView(selectedConnId),
  );
  const [editingConfig, setEditingConfig] =
    useState<DbConnectionConfig | null>(null);
  const [legacyToolsOpen, setLegacyToolsOpen] = useState(false);
  const [resumeRecoveryNotice, setResumeRecoveryNotice] =
    useState<string | null>(null);
  const sidebarMode = resolveDbConnectorSidebarMode(workbenchViewId);
  const discoveryEnabled = workspaceView === "connections" && !editingConfig;

  const compatibilityState = useDbConnectorCompatibilityState({
    host,
    selectedConnId,
    toast,
  });

  const connectionState = useDbConnectorConnectionState({
    host,
    discoveryEnabled,
    toast,
    onConnectionSaved: (savedConfig) => {
      setEditingConfig(null);
      setResumeRecoveryNotice(null);
      setSelectedConnId(savedConfig.id);
      setWorkspaceView(PRIMARY_WORKSPACE_VIEW);
    },
    onConnectionDeleted: (deletedId) => {
      if (selectedConnId === deletedId) {
        setSelectedConnId(null);
        setWorkspaceView("connections");
      }
      compatibilityState.diff.clearDeletedConnectionFromDiff(deletedId);
    },
  });

  const connections = connectionState.connections;
  const activeConnection = resolveActiveConnection(connections, selectedConnId);
  const actions = useDbConnectorWorkspaceActions({
    activeConnection,
    setEditingConfig,
    setLegacyToolsOpen,
    setResumeRecoveryNotice,
    setSelectedConnId,
    setWorkspaceView,
  });

  const activeConnectionLabel = formatActiveConnectionLabel(activeConnection);
  const activeTabValue = resolveActiveTabValue({ editingConfig, workspaceView });
  const compatibilityToolActive = isCompatibilityToolActive(activeTabValue);
  const shellSurface = resolveShellSurface({ activeConnection, activeTabValue });

  useDbConnectorWorkspaceRuntimeEffects({
    connections,
    activeConnection,
    selectedConnId,
    setSelectedConnId,
    workspaceView,
    setWorkspaceView,
    activeTabValue,
    editingConfig,
    setResumeRecoveryNotice,
    isLoadingConnections: connectionState.isLoading,
    saveConnectionAsync: connectionState.saveConnectionAsync,
    activateConnection: actions.activateConnection,
  });

  return {
    shellProps: {
      activeConnection,
      activeConnectionLabel,
      activeTabValue,
      shellSurface,
      compatibilityToolActive,
      legacyToolsOpen,
      hasConnections: connections.length > 0,
      resumeRecoveryNotice,
      onDismissRecovery: actions.dismissRecoveryNotice,
      onNewConnection: actions.startNewConnectionDraft,
      onTabValueChange: (value: string) => {
        if (!isWorkspaceView(value)) return;
        if (editingConfig) {
          setEditingConfig(null);
        }
        setWorkspaceView(value);
      },
      onOpenConnectionView: actions.openConnectionView,
      onOpenDatabaseWorkspace: actions.openDatabaseWorkspace,
      onResumeDatabaseWorkspace: actions.returnToWorkspace,
      onToggleCompatibilityTools: actions.toggleCompatibilityTools,
      onOpenSchema: actions.openSchemaCompatibility,
      onOpenDiff: actions.openDiffCompatibility,
    },
    tabsProps: {
      sidebarMode,
      activeConnection,
      connections,
      selectedConnId,
      editingConfig,
      connectionState,
      compatibilityState,
      actions: {
        activateConnection: actions.activateConnection,
        cancelConnectionEdit: actions.cancelConnectionEdit,
        duplicateConnection: actions.duplicateConnection,
        editConnection: actions.editConnection,
        openConnectionView: actions.openConnectionView,
        prefillDiscoveredConnection: actions.prefillDiscoveredConnection,
        returnToWorkspace: actions.returnToWorkspace,
        selectSchemaConnection: actions.selectSchemaConnection,
        startNewConnectionDraft: actions.startNewConnectionDraft,
      },
    },
  };
}
