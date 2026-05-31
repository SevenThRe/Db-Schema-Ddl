import type {
  BinaryCommandResult,
  DbConnectionConfig,
  DbGridDeleteRowDraft,
  DbGridEditSource,
  DbGridPrepareCommitResponse,
  DbObjectInspectionResponse,
  DbQueryBatchResult,
  DbSchemaSnapshot,
  QueryExecutionRequest,
  QueryExecutionResponse,
} from "@shared/schema";
import {
  buildLiveVerificationCancelOutcome,
  buildLiveVerificationCancelQueryRequest,
  buildLiveVerificationCompletedNote,
  buildLiveVerificationConnectPassedNote,
  buildLiveVerificationEditMissingPkOutcome,
  buildLiveVerificationEditPreparedOutcome,
  buildLiveVerificationEditSkippedOutcome,
  buildLiveVerificationExportOutcome,
  buildLiveVerificationInspectionOutcome,
  buildLiveVerificationNoTableCompletion,
  buildLiveVerificationNoTableSkippedOutcome,
  buildLiveVerificationPagingOutcome,
  buildLiveVerificationPagingWarningOutcome,
  buildLiveVerificationQueryOutcome,
  buildLiveVerificationReadonlyOutcome,
  buildLiveVerificationSchemaMissingOutcome,
  getNoTableLiveVerificationFlowIds,
  isLiveVerificationCancelMessage,
  shouldAttemptLiveVerificationEdit,
  shouldAttemptLiveVerificationPaging,
  type LiveVerificationFlowId,
  type LiveVerificationFlowStatus,
} from "./live-verification-runtime";
import {
  buildRowPrimaryKey,
  buildRowPkTuple,
} from "./result-grid-utils";
import { buildStarterTableQuery } from "./table-query-utils";
import { formatWorkbenchError } from "./workbench-errors";

export type LiveVerificationCompletionStatus = Extract<
  LiveVerificationFlowStatus,
  "passed" | "failed" | "warning"
>;

export interface WorkbenchLiveVerificationRunner {
  emitFlow: (
    flowId: LiveVerificationFlowId,
    status: LiveVerificationFlowStatus,
    note: string,
  ) => Promise<void>;
  complete: (
    status: LiveVerificationCompletionStatus,
    note: string,
  ) => Promise<void>;
  inspectObject: (
    kind: "table",
    objectName: string,
  ) => Promise<DbObjectInspectionResponse | null>;
  updateActiveTabSql: (sql: string) => void;
  setResultTab: (tab: "results") => void;
  setLastGridEditSource: (source: DbGridEditSource | null) => void;
  executeImmediate: (
    sql: string,
    confirmed: boolean,
    source: DbGridEditSource | null,
    mode: "statement",
  ) => Promise<QueryExecutionResponse | null>;
  loadMore: (batchIndex: number) => Promise<DbQueryBatchResult | null>;
  exportCurrentPage: () => Promise<BinaryCommandResult | null>;
  stageDeleteRow: (row: DbGridDeleteRowDraft) => void;
  prepareGridCommit: () => Promise<DbGridPrepareCommitResponse | null>;
  revertGridDelete: (rowPkTuple: string) => void;
  clearPreparedGridPlan: () => void;
  randomRequestId: () => string;
  startCancelRequest: (requestId: string) => void;
  executeCancelQuery: (request: QueryExecutionRequest) => Promise<QueryExecutionResponse>;
  cancelQuery: (requestId: string) => Promise<void>;
  finishCancelRequest: (requestId: string) => void;
  sleep: (ms: number) => Promise<void>;
}

export interface RunWorkbenchLiveVerificationInput {
  connection: DbConnectionConfig;
  schemaSnapshot: DbSchemaSnapshot | null;
  schemaErrorMessage?: string | null;
  runtimeSchema?: string;
  runner: WorkbenchLiveVerificationRunner;
}

export async function runWorkbenchLiveVerification(
  input: RunWorkbenchLiveVerificationInput,
): Promise<void> {
  const {
    connection,
    schemaSnapshot,
    schemaErrorMessage,
    runtimeSchema,
    runner,
  } = input;

  if (!schemaSnapshot) {
    const missingSchema = buildLiveVerificationSchemaMissingOutcome(schemaErrorMessage);
    await runner.emitFlow(
      "connect",
      missingSchema.connect.status,
      missingSchema.connect.note,
    );
    await runner.complete(missingSchema.completion, missingSchema.completionNote);
    return;
  }

  await runner.emitFlow(
    "connect",
    "passed",
    buildLiveVerificationConnectPassedNote(connection),
  );

  const verificationTable = schemaSnapshot.tables[0];
  if (!verificationTable) {
    const skipped = buildLiveVerificationNoTableSkippedOutcome();
    for (const flowId of getNoTableLiveVerificationFlowIds()) {
      await runner.emitFlow(flowId, skipped.status, skipped.note);
    }
    const noTableCompletion = buildLiveVerificationNoTableCompletion();
    await runner.complete(noTableCompletion.status, noTableCompletion.note);
    return;
  }

  const inspected = await runner.inspectObject("table", verificationTable.name);
  const inspectionOutcome = buildLiveVerificationInspectionOutcome(
    verificationTable.name,
    !!inspected,
  );
  await runner.emitFlow("inspection", inspectionOutcome.status, inspectionOutcome.note);

  const { sql: querySql, source } = buildStarterTableQuery({
    driver: connection.driver,
    tableName: verificationTable.name,
    mode: "select",
    table: verificationTable,
    runtimeSchema,
    snapshotSchema: schemaSnapshot.schema,
    defaultSchema: connection.defaultSchema,
  });
  runner.updateActiveTabSql(querySql);
  runner.setResultTab("results");
  runner.setLastGridEditSource(source);
  const queryResponse = await runner.executeImmediate(
    querySql,
    false,
    source,
    "statement",
  );
  const queryBatch = queryResponse?.batches[0] ?? null;
  const queryOutcome = buildLiveVerificationQueryOutcome(
    verificationTable.name,
    queryBatch,
  );
  await runner.emitFlow("query", queryOutcome.status, queryOutcome.note);

  if (shouldAttemptLiveVerificationPaging(queryBatch)) {
    const moreBatch = await runner.loadMore(0);
    const pagingOutcome = buildLiveVerificationPagingOutcome(
      verificationTable.name,
      !!moreBatch,
    );
    await runner.emitFlow("paging", pagingOutcome.status, pagingOutcome.note);
  } else {
    const pagingWarning = buildLiveVerificationPagingWarningOutcome(
      verificationTable.name,
    );
    await runner.emitFlow("paging", pagingWarning.status, pagingWarning.note);
  }

  const exportResult = await runner.exportCurrentPage();
  const exportOutcome = buildLiveVerificationExportOutcome(
    verificationTable.name,
    exportResult,
  );
  await runner.emitFlow("export", exportOutcome.status, exportOutcome.note);

  if (shouldAttemptLiveVerificationEdit(queryBatch)) {
    const firstRow = queryBatch.rows[0];
    const rowPrimaryKey = buildRowPrimaryKey(
      firstRow,
      queryBatch,
      queryBatch.primaryKeyColumns ?? [],
    );
    if (rowPrimaryKey) {
      const rowPkTuple = buildRowPkTuple(
        rowPrimaryKey,
        queryBatch.primaryKeyColumns ?? [],
      );
      runner.stageDeleteRow({ rowPrimaryKey, rowPkTuple });
      await runner.sleep(0);
      const prepared = await runner.prepareGridCommit();
      runner.revertGridDelete(rowPkTuple);
      runner.clearPreparedGridPlan();
      const editOutcome = buildLiveVerificationEditPreparedOutcome(
        verificationTable.name,
        !!prepared,
      );
      await runner.emitFlow("edit", editOutcome.status, editOutcome.note);
    } else {
      const editOutcome = buildLiveVerificationEditMissingPkOutcome(
        verificationTable.name,
      );
      await runner.emitFlow("edit", editOutcome.status, editOutcome.note);
    }
  } else {
    const editOutcome = buildLiveVerificationEditSkippedOutcome({
      tableName: verificationTable.name,
      readonly: connection.readonly === true,
    });
    await runner.emitFlow("edit", editOutcome.status, editOutcome.note);
  }

  const readonlyOutcome = buildLiveVerificationReadonlyOutcome(
    connection.readonly === true,
  );
  await runner.emitFlow("readonly", readonlyOutcome.status, readonlyOutcome.note);

  const cancelRequestId = runner.randomRequestId();
  runner.startCancelRequest(cancelRequestId);
  const cancelPromise = runner.executeCancelQuery(buildLiveVerificationCancelQueryRequest({
    connectionId: connection.id,
    driver: connection.driver,
    requestId: cancelRequestId,
    schema: runtimeSchema,
  }));

  await runner.sleep(400);
  await runner.cancelQuery(cancelRequestId).catch(() => undefined);
  let cancelPassed = false;
  try {
    await cancelPromise;
  } catch (error) {
    const message = formatWorkbenchError(
      error,
      "Query cancellation did not return a message.",
    );
    cancelPassed = isLiveVerificationCancelMessage(message);
  } finally {
    runner.finishCancelRequest(cancelRequestId);
  }

  const cancelOutcome = buildLiveVerificationCancelOutcome(
    connection.driver,
    cancelPassed,
  );
  await runner.emitFlow("cancel", cancelOutcome.status, cancelOutcome.note);

  await runner.complete(
    "passed",
    buildLiveVerificationCompletedNote(connection.name || connection.database),
  );
}
