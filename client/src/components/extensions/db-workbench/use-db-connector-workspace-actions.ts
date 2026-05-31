import { useCallback, type Dispatch, type SetStateAction } from "react";
import type {
  DbConnectionConfig,
  DbDiscoveredEndpoint,
} from "@shared/schema";
import {
  buildDuplicateConnectionDraft,
} from "./db-connector-workspace-controller-model";
import {
  configFromDiscoveredEndpoint,
  emptyConnectionConfig,
} from "./workbench-connection-config-model";
import {
  PRIMARY_WORKSPACE_VIEW,
  type WorkspaceView,
} from "./workbench-workspace-route";

export type DbConnectorWorkspaceTabActions = {
  activateConnection: (connectionId: string, nextView?: WorkspaceView) => void;
  cancelConnectionEdit: () => void;
  duplicateConnection: (connection: DbConnectionConfig) => void;
  editConnection: (connection: DbConnectionConfig) => void;
  openConnectionView: () => void;
  prefillDiscoveredConnection: (candidate: DbDiscoveredEndpoint) => void;
  returnToWorkspace: () => void;
  selectSchemaConnection: (connectionId: string | null) => void;
  startNewConnectionDraft: () => void;
};

export type DbConnectorWorkspaceShellActions = {
  dismissRecoveryNotice: () => void;
  openDatabaseWorkspace: () => void;
  openDiffCompatibility: () => void;
  openSchemaCompatibility: () => void;
  toggleCompatibilityTools: () => void;
};

export type DbConnectorWorkspaceActions = DbConnectorWorkspaceTabActions &
  DbConnectorWorkspaceShellActions;

export function useDbConnectorWorkspaceActions({
  activeConnection,
  setEditingConfig,
  setLegacyToolsOpen,
  setResumeRecoveryNotice,
  setSelectedConnId,
  setWorkspaceView,
}: {
  activeConnection: DbConnectionConfig | null;
  setEditingConfig: Dispatch<SetStateAction<DbConnectionConfig | null>>;
  setLegacyToolsOpen: Dispatch<SetStateAction<boolean>>;
  setResumeRecoveryNotice: Dispatch<SetStateAction<string | null>>;
  setSelectedConnId: Dispatch<SetStateAction<string | null>>;
  setWorkspaceView: Dispatch<SetStateAction<WorkspaceView>>;
}): DbConnectorWorkspaceActions {
  const dismissRecoveryNotice = useCallback(() => {
    setResumeRecoveryNotice(null);
  }, [setResumeRecoveryNotice]);

  const openConnectionView = useCallback(() => {
    setEditingConfig(null);
    setLegacyToolsOpen(false);
    setWorkspaceView("connections");
  }, [setEditingConfig, setLegacyToolsOpen, setWorkspaceView]);

  const activateConnection = useCallback(
    (connectionId: string, nextView: WorkspaceView = PRIMARY_WORKSPACE_VIEW) => {
      setResumeRecoveryNotice(null);
      setLegacyToolsOpen(false);
      setSelectedConnId(connectionId);
      setWorkspaceView(nextView);
    },
    [
      setLegacyToolsOpen,
      setResumeRecoveryNotice,
      setSelectedConnId,
      setWorkspaceView,
    ],
  );

  const prefillDiscoveredConnection = useCallback(
    (candidate: DbDiscoveredEndpoint) => {
      setResumeRecoveryNotice(null);
      setEditingConfig(configFromDiscoveredEndpoint(candidate));
      setWorkspaceView("connections");
    },
    [setEditingConfig, setResumeRecoveryNotice, setWorkspaceView],
  );

  const startNewConnectionDraft = useCallback(() => {
    setEditingConfig(emptyConnectionConfig());
    setWorkspaceView("connections");
  }, [setEditingConfig, setWorkspaceView]);

  const cancelConnectionEdit = useCallback(() => {
    setEditingConfig(null);
  }, [setEditingConfig]);

  const returnToWorkspace = useCallback(() => {
    setEditingConfig(null);
    setLegacyToolsOpen(false);
    setWorkspaceView(PRIMARY_WORKSPACE_VIEW);
  }, [setEditingConfig, setLegacyToolsOpen, setWorkspaceView]);

  const editConnection = useCallback(
    (connection: DbConnectionConfig) => {
      setEditingConfig(connection);
    },
    [setEditingConfig],
  );

  const duplicateConnection = useCallback(
    (connection: DbConnectionConfig) => {
      setEditingConfig(buildDuplicateConnectionDraft(connection));
    },
    [setEditingConfig],
  );

  const selectSchemaConnection = useCallback(
    (connectionId: string | null) => {
      setSelectedConnId(connectionId);
    },
    [setSelectedConnId],
  );

  const openDatabaseWorkspace = useCallback(() => {
    if (activeConnection) {
      setEditingConfig(null);
      setLegacyToolsOpen(false);
      setWorkspaceView(PRIMARY_WORKSPACE_VIEW);
      return;
    }
    openConnectionView();
  }, [
    activeConnection,
    openConnectionView,
    setEditingConfig,
    setLegacyToolsOpen,
    setWorkspaceView,
  ]);

  const toggleCompatibilityTools = useCallback(() => {
    setLegacyToolsOpen((current) => !current);
  }, [setLegacyToolsOpen]);

  const openSchemaCompatibility = useCallback(() => {
    setWorkspaceView("schema");
  }, [setWorkspaceView]);

  const openDiffCompatibility = useCallback(() => {
    setWorkspaceView("diff");
  }, [setWorkspaceView]);

  return {
    activateConnection,
    cancelConnectionEdit,
    dismissRecoveryNotice,
    duplicateConnection,
    editConnection,
    openConnectionView,
    openDatabaseWorkspace,
    openDiffCompatibility,
    openSchemaCompatibility,
    prefillDiscoveredConnection,
    returnToWorkspace,
    selectSchemaConnection,
    startNewConnectionDraft,
    toggleCompatibilityTools,
  };
}
