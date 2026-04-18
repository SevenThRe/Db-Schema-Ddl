export type ReleaseVerificationLiveDriver = "mysql" | "postgres";
export type ReleaseVerificationFlowStatus =
  | "passed"
  | "failed"
  | "warning"
  | "skipped";

export interface ReleaseVerificationLiveConfig {
  enabled: boolean;
  driver?: ReleaseVerificationLiveDriver;
  connectionId?: string;
  connectionName?: string;
  connectionString?: string;
  readonly?: boolean;
  defaultSchema?: string;
}

export interface ReleaseVerificationWindowConfig {
  enabled: boolean;
  logPath?: string;
  autoOpenDbWorkbench: boolean;
  live?: ReleaseVerificationLiveConfig;
}

declare global {
  interface Window {
    __DB_SCHEMA_RELEASE_VERIFICATION__?: ReleaseVerificationWindowConfig;
  }
}

export function readReleaseVerificationConfig(): ReleaseVerificationWindowConfig {
  if (typeof window === "undefined") {
    return {
      enabled: false,
      autoOpenDbWorkbench: false,
      live: undefined,
    };
  }

  const config = window.__DB_SCHEMA_RELEASE_VERIFICATION__;
  if (!config || config.enabled !== true) {
    return {
      enabled: false,
      autoOpenDbWorkbench: false,
      live: undefined,
    };
  }

  return {
    enabled: true,
    logPath: config.logPath,
    autoOpenDbWorkbench: config.autoOpenDbWorkbench === true,
    live: config.live?.enabled
      ? {
          enabled: true,
          driver:
            config.live.driver === "mysql" || config.live.driver === "postgres"
              ? config.live.driver
              : undefined,
          connectionId: config.live.connectionId?.trim() || undefined,
          connectionName: config.live.connectionName?.trim() || undefined,
          connectionString: config.live.connectionString?.trim() || undefined,
          readonly: config.live.readonly === true ? true : undefined,
          defaultSchema: config.live.defaultSchema?.trim() || undefined,
        }
      : undefined,
  };
}

export async function emitReleaseCheckpoint(
  checkpoint: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const config = readReleaseVerificationConfig();
  if (!config.enabled || typeof window === "undefined") {
    return;
  }

  const tauriInternalsPresent =
    "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
  if (!tauriInternalsPresent) {
    return;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("core_smoke_checkpoint", {
      checkpoint,
      metadata: metadata ?? {},
    });
  } catch {
    // Verification checkpoints must never break the operator-facing UI.
  }
}

export async function emitLiveVerificationFlow(
  flowId: string,
  status: ReleaseVerificationFlowStatus,
  metadata?: {
    note?: string;
    driver?: ReleaseVerificationLiveDriver;
    connectionId?: string | null;
    connectionName?: string | null;
  },
): Promise<void> {
  await emitReleaseCheckpoint("db_workbench_live_flow", {
    flowId,
    status,
    note: metadata?.note,
    driver: metadata?.driver,
    connectionId: metadata?.connectionId ?? null,
    connectionName: metadata?.connectionName ?? null,
  });
}

export async function emitLiveVerificationCompleted(metadata?: {
  driver?: ReleaseVerificationLiveDriver;
  connectionId?: string | null;
  connectionName?: string | null;
  database?: string | null;
  readonly?: boolean;
  status?: "passed" | "failed" | "warning";
  note?: string;
}): Promise<void> {
  await emitReleaseCheckpoint("db_workbench_live_completed", {
    driver: metadata?.driver,
    connectionId: metadata?.connectionId ?? null,
    connectionName: metadata?.connectionName ?? null,
    database: metadata?.database ?? null,
    readonly: metadata?.readonly,
    status: metadata?.status ?? "passed",
    note: metadata?.note,
  });
}
