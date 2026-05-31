import type {
  DbGridEditSource,
  QueryExecutionRequest,
  QueryExecutionResponse,
} from "@shared/schema";
import {
  buildQueryRunEntryFromResponse,
  recordQueryRun,
  type QueryRunMode,
  type RecordQueryRunInput,
  type WorkbenchSessionState,
} from "./workbench-session";
import {
  buildQueryMemoryPatternFromResponse,
  extractSqlMemoryValueProfilesFromBatches,
} from "./sql-memory";
import { countSqlStatementsForHistory } from "./query-execution-gates";

export function resolveQueryMemorySchema(
  runtimeSchema: string | null | undefined,
  source: DbGridEditSource | null,
): string {
  return runtimeSchema?.trim() || source?.schema?.trim() || "public";
}

export function buildQueryExecutionRequest(input: {
  connectionId: string;
  sql: string;
  requestId: string;
  cursorOffset?: number;
  runtimeSchema?: string | null;
  stopOnError: boolean;
  confirmed: boolean;
}): QueryExecutionRequest {
  return {
    connectionId: input.connectionId,
    sql: input.sql,
    requestId: input.requestId,
    cursorOffset: input.cursorOffset,
    schema: input.runtimeSchema ?? undefined,
    continueOnError: !input.stopOnError,
    confirmed: input.confirmed ? true : undefined,
  };
}

export function buildSuccessfulQueryRunRecord(input: {
  sql: string;
  mode: QueryRunMode;
  response: QueryExecutionResponse;
  runtimeSchema?: string | null;
  source: DbGridEditSource | null;
}): RecordQueryRunInput {
  return {
    ...buildQueryRunEntryFromResponse(input.sql, input.mode, input.response),
    memoryPattern: buildQueryMemoryPatternFromResponse(
      input.sql,
      input.mode,
      input.response,
      input.runtimeSchema ?? undefined,
      input.source,
    ),
    valueProfiles: extractSqlMemoryValueProfilesFromBatches(
      input.response.batches,
      resolveQueryMemorySchema(input.runtimeSchema, input.source),
      input.source?.tableName ?? null,
    ),
  };
}

export function buildFailedQueryRunRecord(input: {
  sql: string;
  mode: QueryRunMode;
  errorMessage: string;
}): RecordQueryRunInput {
  return {
    sql: input.sql,
    mode: input.mode,
    status: "failed",
    statementCount: countSqlStatementsForHistory(input.sql, input.mode),
    errorMessage: input.errorMessage,
  };
}

export function recordSuccessfulQueryExecution(input: {
  connectionId: string;
  sql: string;
  mode: QueryRunMode;
  response: QueryExecutionResponse;
  runtimeSchema?: string | null;
  source: DbGridEditSource | null;
}): WorkbenchSessionState {
  return recordQueryRun(
    input.connectionId,
    buildSuccessfulQueryRunRecord(input),
  );
}

export function recordFailedQueryExecution(input: {
  connectionId: string;
  sql: string;
  mode: QueryRunMode;
  errorMessage: string;
}): WorkbenchSessionState {
  return recordQueryRun(
    input.connectionId,
    buildFailedQueryRunRecord(input),
  );
}
