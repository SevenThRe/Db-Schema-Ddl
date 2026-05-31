import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { buildReleaseVerificationBootstrapConfig } from "@/lib/db-connection-string";
import {
  emitLiveVerificationCompleted,
  emitLiveVerificationFlow,
  emitReleaseCheckpoint,
  readReleaseVerificationConfig,
} from "@/lib/release-verification";
import type { DbConnectionConfig } from "@shared/schema";
import {
  dispatchDbConnectorConnectionSelection,
  subscribeDbConnectorConnectionSelection,
} from "./sidebar/db-connector-sidebar-events";
import {
  PRIMARY_WORKSPACE_VIEW,
  persistWorkspaceRoute,
  type WorkspaceView,
} from "./workbench-workspace-route";
import {
  normalizeConnectionConfig,
  resolveLiveVerificationConnection,
} from "./workbench-connection-config-model";

export function useDbConnectorWorkspaceRuntimeEffects({
  connections,
  activeConnection,
  selectedConnId,
  setSelectedConnId,
  workspaceView,
  setWorkspaceView,
  activeTabValue,
  editingConfig,
  setResumeRecoveryNotice,
  isLoadingConnections,
  saveConnectionAsync,
  activateConnection,
}: {
  connections: DbConnectionConfig[];
  activeConnection: DbConnectionConfig | null;
  selectedConnId: string | null;
  setSelectedConnId: Dispatch<SetStateAction<string | null>>;
  workspaceView: WorkspaceView;
  setWorkspaceView: Dispatch<SetStateAction<WorkspaceView>>;
  activeTabValue: WorkspaceView;
  editingConfig: DbConnectionConfig | null;
  setResumeRecoveryNotice: Dispatch<SetStateAction<string | null>>;
  isLoadingConnections: boolean;
  saveConnectionAsync: (config: DbConnectionConfig) => Promise<DbConnectionConfig>;
  activateConnection: (connectionId: string, nextView?: WorkspaceView) => void;
}) {
  const releaseVerification = useMemo(() => readReleaseVerificationConfig(), []);
  const initialRecoveryConnectionIdRef = useRef<string | null>(selectedConnId);
  const recoveryCheckpointSentRef = useRef(false);
  const lastSurfaceCheckpointKeyRef = useRef<string | null>(null);
  const liveVerificationResolutionSentRef = useRef(false);
  const liveVerificationBootstrapAttemptedRef = useRef(false);
  const liveVerificationBootstrapStartedAtRef = useRef<number | null>(null);
  const liveVerificationBootstrapStateRef = useRef<"idle" | "saving" | "saved" | "failed">("idle");

  const liveVerificationBootstrap = useMemo(
    () =>
      buildReleaseVerificationBootstrapConfig({
        driver: releaseVerification.live?.driver,
        connectionName: releaseVerification.live?.connectionName,
        connectionString: releaseVerification.live?.connectionString,
        readonly: releaseVerification.live?.readonly,
        defaultSchema: releaseVerification.live?.defaultSchema,
      }),
    [
      releaseVerification.live?.connectionName,
      releaseVerification.live?.connectionString,
      releaseVerification.live?.defaultSchema,
      releaseVerification.live?.driver,
      releaseVerification.live?.readonly,
    ],
  );
  const liveVerificationTarget = releaseVerification.live?.enabled
    ? resolveLiveVerificationConnection(connections, {
        driver: releaseVerification.live.driver,
        connectionId: releaseVerification.live.connectionId,
        connectionName: releaseVerification.live.connectionName,
      })
    : null;

  useEffect(() => {
    if (!selectedConnId) {
      return;
    }
    dispatchDbConnectorConnectionSelection(selectedConnId);
  }, [selectedConnId]);

  useEffect(
    () =>
      subscribeDbConnectorConnectionSelection((connectionId) => {
        if (!connectionId || connectionId === selectedConnId) {
          return;
        }
        activateConnection(connectionId, PRIMARY_WORKSPACE_VIEW);
      }),
    [activateConnection, selectedConnId],
  );

  useEffect(() => {
    persistWorkspaceRoute(activeTabValue, selectedConnId);
  }, [activeTabValue, selectedConnId]);

  useEffect(() => {
    if (!releaseVerification.enabled) {
      return;
    }

    const checkpointKey =
      activeTabValue === "sql" && activeConnection
        ? `sql:${activeConnection.id}`
        : activeTabValue;
    if (lastSurfaceCheckpointKeyRef.current === checkpointKey) {
      return;
    }
    lastSurfaceCheckpointKeyRef.current = checkpointKey;

    void emitReleaseCheckpoint("db_workbench_surface_ready", {
      activeTabValue,
      selectedConnectionId: activeConnection?.id ?? null,
    });
  }, [activeConnection?.id, activeTabValue, releaseVerification.enabled]);

  useEffect(() => {
    if (!releaseVerification.enabled || isLoadingConnections || recoveryCheckpointSentRef.current) {
      return;
    }

    const requestedConnectionId = initialRecoveryConnectionIdRef.current;
    const recoveryClassification = requestedConnectionId
      ? connections.some((connection) => connection.id === requestedConnectionId)
        ? "restored"
        : "missing-fallback"
      : "none";

    recoveryCheckpointSentRef.current = true;
    void emitReleaseCheckpoint("db_workbench_recovery_classified", {
      classification: recoveryClassification,
      requestedConnectionId: requestedConnectionId ?? null,
      activeConnectionId: activeConnection?.id ?? null,
    });
  }, [activeConnection?.id, connections, isLoadingConnections, releaseVerification.enabled]);

  useEffect(() => {
    if (
      !releaseVerification.enabled ||
      !releaseVerification.live?.enabled ||
      isLoadingConnections ||
      editingConfig
    ) {
      return;
    }

    if (liveVerificationTarget) {
      if (selectedConnId !== liveVerificationTarget.id || workspaceView !== PRIMARY_WORKSPACE_VIEW) {
        activateConnection(liveVerificationTarget.id, PRIMARY_WORKSPACE_VIEW);
      }
      return;
    }

    if (
      liveVerificationBootstrap.config &&
      !liveVerificationBootstrapAttemptedRef.current &&
      liveVerificationBootstrapStateRef.current === "idle"
    ) {
      liveVerificationBootstrapAttemptedRef.current = true;
      liveVerificationBootstrapStartedAtRef.current = Date.now();
      liveVerificationBootstrapStateRef.current = "saving";
      void saveConnectionAsync(normalizeConnectionConfig(liveVerificationBootstrap.config))
        .then(() => {
          liveVerificationBootstrapStateRef.current = "saved";
        })
        .catch((error) => {
          liveVerificationBootstrapStateRef.current = "failed";
          if (liveVerificationResolutionSentRef.current) {
            return;
          }
          liveVerificationResolutionSentRef.current = true;
          const note = `Live verification bootstrap connection could not be saved: ${String(error)}`;
          void emitLiveVerificationFlow("connect", "failed", {
            driver: releaseVerification.live?.driver ?? liveVerificationBootstrap.config?.driver,
            note,
          });
          void emitLiveVerificationCompleted({
            driver: releaseVerification.live?.driver ?? liveVerificationBootstrap.config?.driver,
            status: "failed",
            note,
          });
        });
      return;
    }

    if (liveVerificationBootstrapStateRef.current === "saving") {
      return;
    }

    if (liveVerificationBootstrapStateRef.current === "saved") {
      const startedAt = liveVerificationBootstrapStartedAtRef.current;
      if (startedAt && Date.now() - startedAt < 5_000) {
        return;
      }
    }

    if (liveVerificationResolutionSentRef.current) {
      return;
    }
    liveVerificationResolutionSentRef.current = true;
    const resolutionNote =
      liveVerificationBootstrap.error ??
      (liveVerificationBootstrap.config
        ? "Live verification bootstrap connection did not resolve to a saved target."
        : "No saved connection matched the requested live verification target, and no bootstrap connection string was provided.");
    void emitLiveVerificationFlow("connect", "failed", {
      driver: releaseVerification.live.driver,
      note: resolutionNote,
    });
    void emitLiveVerificationCompleted({
      driver: releaseVerification.live.driver,
      status: "failed",
      note: resolutionNote,
    });
  }, [
    activateConnection,
    editingConfig,
    isLoadingConnections,
    liveVerificationBootstrap,
    liveVerificationTarget,
    releaseVerification.enabled,
    releaseVerification.live,
    saveConnectionAsync,
    selectedConnId,
    workspaceView,
  ]);

  useEffect(() => {
    if (!selectedConnId) return;
    if (connections.some((connection) => connection.id === selectedConnId)) return;

    setResumeRecoveryNotice("未能恢复上次活动连接。该连接已不存在或不可用，已回退到连接中心。");
    setSelectedConnId(null);
    if (workspaceView === "sql") {
      setWorkspaceView("connections");
    }
  }, [connections, selectedConnId, setSelectedConnId, setWorkspaceView, workspaceView]);

}
