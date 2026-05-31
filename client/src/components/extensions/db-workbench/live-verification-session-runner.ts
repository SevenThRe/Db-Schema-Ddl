import type {
  ReleaseVerificationWindowConfig,
  emitLiveVerificationCompleted,
  emitLiveVerificationFlow,
} from "@/lib/release-verification";
import type {
  DbConnectionConfig,
  DbSchemaSnapshot,
} from "@shared/schema";
import {
  buildLiveVerificationFlowMetadata,
  buildLiveVerificationRunKey,
  shouldRunWorkbenchLiveVerification,
  type LiveVerificationFlowId,
  type LiveVerificationFlowStatus,
} from "./live-verification-runtime";
import {
  runWorkbenchLiveVerification,
  type LiveVerificationCompletionStatus,
  type WorkbenchLiveVerificationRunner,
} from "./live-verification-runner";

export type LiveVerificationRunKeyStore = {
  current: string | null;
};

export type WorkbenchLiveVerificationSessionRunner = Omit<
  WorkbenchLiveVerificationRunner,
  "emitFlow" | "complete"
>;

export function createWorkbenchLiveVerificationRunner(
  input: WorkbenchLiveVerificationSessionRunner,
): WorkbenchLiveVerificationSessionRunner {
  return {
    inspectObject: input.inspectObject,
    updateActiveTabSql: input.updateActiveTabSql,
    setResultTab: input.setResultTab,
    setLastGridEditSource: input.setLastGridEditSource,
    executeImmediate: input.executeImmediate,
    loadMore: input.loadMore,
    exportCurrentPage: input.exportCurrentPage,
    stageDeleteRow: input.stageDeleteRow,
    prepareGridCommit: input.prepareGridCommit,
    revertGridDelete: input.revertGridDelete,
    clearPreparedGridPlan: input.clearPreparedGridPlan,
    randomRequestId: input.randomRequestId,
    startCancelRequest: input.startCancelRequest,
    executeCancelQuery: input.executeCancelQuery,
    cancelQuery: input.cancelQuery,
    finishCancelRequest: input.finishCancelRequest,
    sleep: input.sleep,
  };
}

export function sleepWithBrowserTimer(ms: number): Promise<void> {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export interface StartWorkbenchLiveVerificationSessionInput {
  releaseVerification: ReleaseVerificationWindowConfig;
  connection: DbConnectionConfig;
  isSchemaLoading: boolean;
  schemaSnapshot: DbSchemaSnapshot | null;
  schemaErrorMessage?: string | null;
  runtimeSchema?: string;
  runKeyStore: LiveVerificationRunKeyStore;
  emitFlowCheckpoint: typeof emitLiveVerificationFlow;
  emitCompletedCheckpoint: typeof emitLiveVerificationCompleted;
  runner: WorkbenchLiveVerificationSessionRunner;
}

export function startWorkbenchLiveVerificationSession(
  input: StartWorkbenchLiveVerificationSessionInput,
): (() => void) | undefined {
  const liveVerification = input.releaseVerification.live;
  if (
    !shouldRunWorkbenchLiveVerification({
      releaseEnabled: input.releaseVerification.enabled,
      liveConfig: liveVerification,
      connection: input.connection,
      isSchemaLoading: input.isSchemaLoading,
    })
  ) {
    return undefined;
  }

  const runKey = buildLiveVerificationRunKey(input.connection);
  if (input.runKeyStore.current === runKey) {
    return undefined;
  }
  input.runKeyStore.current = runKey;

  let cancelled = false;
  const flowMetadata = buildLiveVerificationFlowMetadata(input.connection);
  const emitFlow = async (
    flowId: LiveVerificationFlowId,
    status: LiveVerificationFlowStatus,
    note: string,
  ) => {
    if (cancelled) return;
    await input.emitFlowCheckpoint(flowId, status, {
      ...flowMetadata,
      note,
    });
  };
  const complete = async (
    status: LiveVerificationCompletionStatus,
    note: string,
  ) => {
    await input.emitCompletedCheckpoint({
      ...flowMetadata,
      status,
      note,
      database: input.connection.database,
      readonly: input.connection.readonly === true,
    });
  };

  void runWorkbenchLiveVerification({
    connection: input.connection,
    schemaSnapshot: input.schemaSnapshot,
    schemaErrorMessage: input.schemaErrorMessage,
    runtimeSchema: input.runtimeSchema,
    runner: {
      ...input.runner,
      emitFlow,
      complete,
    },
  });

  return () => {
    cancelled = true;
  };
}
