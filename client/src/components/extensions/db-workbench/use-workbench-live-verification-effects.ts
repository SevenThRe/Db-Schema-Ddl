import { useEffect } from "react";
import {
  emitLiveVerificationCompleted,
  emitLiveVerificationFlow,
  type ReleaseVerificationWindowConfig,
} from "@/lib/release-verification";
import type {
  DbConnectionConfig,
  DbSchemaSnapshot,
} from "@shared/schema";

import {
  startWorkbenchLiveVerificationSession,
  type LiveVerificationRunKeyStore,
  type WorkbenchLiveVerificationSessionRunner,
} from "./live-verification-session-runner";

export interface UseWorkbenchLiveVerificationEffectsInput {
  releaseVerification: ReleaseVerificationWindowConfig;
  connection: DbConnectionConfig;
  isSchemaLoading: boolean;
  schemaSnapshot: DbSchemaSnapshot | null;
  schemaErrorMessage?: string | null;
  runtimeSchema?: string;
  runKeyStore: LiveVerificationRunKeyStore;
  runner: WorkbenchLiveVerificationSessionRunner;
}

export function useWorkbenchLiveVerificationEffects({
  releaseVerification,
  connection,
  isSchemaLoading,
  schemaSnapshot,
  schemaErrorMessage,
  runtimeSchema,
  runKeyStore,
  runner,
}: UseWorkbenchLiveVerificationEffectsInput): void {
  useEffect(() => {
    return startWorkbenchLiveVerificationSession({
      releaseVerification,
      connection,
      isSchemaLoading,
      schemaSnapshot,
      schemaErrorMessage,
      runtimeSchema,
      runKeyStore,
      emitFlowCheckpoint: emitLiveVerificationFlow,
      emitCompletedCheckpoint: emitLiveVerificationCompleted,
      runner,
    });
  }, [
    connection.defaultSchema,
    connection.database,
    connection.driver,
    connection.host,
    connection.id,
    connection.name,
    connection.port,
    connection.readonly,
    isSchemaLoading,
    releaseVerification.enabled,
    releaseVerification.live,
    runKeyStore,
    runner,
    runtimeSchema,
    schemaErrorMessage,
    schemaSnapshot,
  ]);
}
