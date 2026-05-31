import type { ReleaseVerificationLiveConfig } from "@/lib/release-verification";
import type {
  BinaryCommandResult,
  DbConnectionConfig,
  DbQueryBatchResult,
  QueryExecutionRequest,
} from "@shared/schema";
import type { LiveVerificationFlow } from "@shared/release-verification";

export type LiveVerificationFlowId = LiveVerificationFlow["id"];
export type LiveVerificationFlowStatus = LiveVerificationFlow["status"];

export interface LiveVerificationFlowOutcome {
  status: LiveVerificationFlowStatus;
  note: string;
}

export interface WorkbenchLiveVerificationFlowMetadata {
  driver: DbConnectionConfig["driver"];
  connectionId: string;
  connectionName: string;
}

export function shouldRunWorkbenchLiveVerification(input: {
  releaseEnabled: boolean;
  liveConfig: ReleaseVerificationLiveConfig | undefined;
  connection: DbConnectionConfig;
  isSchemaLoading: boolean;
}): boolean {
  const { releaseEnabled, liveConfig, connection, isSchemaLoading } = input;
  if (!releaseEnabled || !liveConfig?.enabled) {
    return false;
  }
  if (liveConfig.driver && liveConfig.driver !== connection.driver) {
    return false;
  }
  if (liveConfig.connectionId && liveConfig.connectionId !== connection.id) {
    return false;
  }
  if (
    liveConfig.connectionName &&
    connection.name.trim().toLowerCase() !==
      liveConfig.connectionName.trim().toLowerCase()
  ) {
    return false;
  }
  return !isSchemaLoading;
}

export function buildLiveVerificationRunKey(
  connection: Pick<DbConnectionConfig, "id" | "driver">,
): string {
  return `${connection.id}:${connection.driver}`;
}

export function buildLiveVerificationFlowMetadata(
  connection: Pick<DbConnectionConfig, "id" | "driver" | "name" | "database">,
): WorkbenchLiveVerificationFlowMetadata {
  return {
    driver: connection.driver,
    connectionId: connection.id,
    connectionName: connection.name || connection.database,
  };
}

export function getNoTableLiveVerificationFlowIds(): LiveVerificationFlowId[] {
  return ["inspection", "query", "paging", "export", "edit", "readonly", "cancel"];
}

export function buildLiveVerificationSchemaMissingOutcome(
  schemaErrorMessage?: string | null,
): {
  connect: LiveVerificationFlowOutcome;
  completion: Extract<LiveVerificationFlowStatus, "failed">;
  completionNote: string;
} {
  return {
    connect: {
      status: "failed",
      note:
        schemaErrorMessage ??
        "Schema snapshot did not load for the selected connection.",
    },
    completion: "failed",
    completionNote:
      "Live verification stopped before query flows because the connection could not be established.",
  };
}

export function buildLiveVerificationConnectPassedNote(
  connection: Pick<DbConnectionConfig, "driver" | "host" | "port" | "database">,
): string {
  return `Connected to ${connection.driver} ${connection.host}:${connection.port}/${connection.database}.`;
}

export function buildLiveVerificationNoTableSkippedOutcome(): LiveVerificationFlowOutcome {
  return {
    status: "skipped",
    note: "No tables were available in the schema snapshot.",
  };
}

export function buildLiveVerificationNoTableCompletion(): {
  status: Extract<LiveVerificationFlowStatus, "warning">;
  note: string;
} {
  return {
    status: "warning",
    note:
      "Connected successfully, but the schema has no tables so deeper workbench flows were skipped.",
  };
}

export function buildLiveVerificationInspectionOutcome(
  tableName: string,
  inspected: boolean,
): LiveVerificationFlowOutcome {
  return {
    status: inspected ? "passed" : "failed",
    note: inspected
      ? `Inspected table ${tableName}.`
      : `Failed to inspect table ${tableName}.`,
  };
}

export function buildLiveVerificationQueryOutcome(
  tableName: string,
  batch: DbQueryBatchResult | null,
): LiveVerificationFlowOutcome {
  const passed = !!batch && !batch.error;
  return {
    status: passed ? "passed" : "failed",
    note: passed
      ? `Loaded ${batch.rows.length} rows from ${tableName}.`
      : `Failed to execute starter query for ${tableName}.`,
  };
}

export function shouldAttemptLiveVerificationPaging(
  batch: DbQueryBatchResult | null,
): batch is DbQueryBatchResult {
  return !!batch && batch.hasMore && batch.pagingMode === "offset";
}

export function buildLiveVerificationPagingOutcome(
  tableName: string,
  fetchedMore: boolean,
): LiveVerificationFlowOutcome {
  return {
    status: fetchedMore ? "passed" : "failed",
    note: fetchedMore
      ? `Fetched additional rows for ${tableName}.`
      : `Load more failed for ${tableName}.`,
  };
}

export function buildLiveVerificationPagingWarningOutcome(
  tableName: string,
): LiveVerificationFlowOutcome {
  return {
    status: "warning",
    note: `The starter query for ${tableName} did not expose offset paging evidence.`,
  };
}

export function buildLiveVerificationExportOutcome(
  tableName: string,
  exportResult: Pick<BinaryCommandResult, "fileName"> | null,
): LiveVerificationFlowOutcome {
  return {
    status: exportResult ? "passed" : "failed",
    note: exportResult
      ? `Exported current-page result to ${exportResult.fileName}.`
      : `Export failed for ${tableName}.`,
  };
}

export function shouldAttemptLiveVerificationEdit(
  batch: DbQueryBatchResult | null,
): batch is DbQueryBatchResult {
  return (
    !!batch &&
    batch.editEligibility?.eligible === true &&
    batch.rows.length > 0 &&
    (batch.primaryKeyColumns?.length ?? 0) > 0
  );
}

export function buildLiveVerificationEditPreparedOutcome(
  tableName: string,
  prepared: boolean,
): LiveVerificationFlowOutcome {
  return {
    status: prepared ? "passed" : "failed",
    note: prepared
      ? `Prepared a review-only delete plan for ${tableName} without committing it.`
      : `Failed to prepare review-only delete plan for ${tableName}.`,
  };
}

export function buildLiveVerificationEditMissingPkOutcome(
  tableName: string,
): LiveVerificationFlowOutcome {
  return {
    status: "warning",
    note: `Could not resolve primary key values for ${tableName}.`,
  };
}

export function buildLiveVerificationEditSkippedOutcome(input: {
  tableName: string;
  readonly: boolean;
}): LiveVerificationFlowOutcome {
  return {
    status: "warning",
    note: input.readonly
      ? "The selected connection is read-only, so edit verification was not attempted."
      : `Loaded result for ${input.tableName} was not eligible for safe grid editing.`,
  };
}

export function buildLiveVerificationReadonlyOutcome(
  readonly: boolean,
): LiveVerificationFlowOutcome {
  return {
    status: readonly ? "passed" : "warning",
    note: readonly
      ? "Selected connection is explicitly marked read-only."
      : "Selected connection is writable; readonly guardrails were not exercised in this run.",
  };
}

export function buildLiveVerificationCancelSql(
  driver: DbConnectionConfig["driver"],
): string {
  return driver === "postgres" ? "SELECT pg_sleep(8);" : "SELECT SLEEP(8);";
}

export function buildLiveVerificationCancelQueryRequest(input: {
  connectionId: string;
  driver: DbConnectionConfig["driver"];
  requestId: string;
  schema?: string;
}): QueryExecutionRequest {
  return {
    connectionId: input.connectionId,
    sql: buildLiveVerificationCancelSql(input.driver),
    requestId: input.requestId,
    schema: input.schema,
  };
}

export function isLiveVerificationCancelMessage(message: string): boolean {
  return /cancel|cancelled|canceled|キャンセル/i.test(message);
}

export function buildLiveVerificationCancelOutcome(
  driver: DbConnectionConfig["driver"],
  cancelled: boolean,
): LiveVerificationFlowOutcome {
  return {
    status: cancelled ? "passed" : "failed",
    note: cancelled
      ? `Cancelled verification query on ${driver}.`
      : `Cancellation did not surface a cancellable runtime response on ${driver}.`,
  };
}

export function buildLiveVerificationCompletedNote(connectionLabel: string): string {
  return `Completed live verification flows for ${connectionLabel}.`;
}
