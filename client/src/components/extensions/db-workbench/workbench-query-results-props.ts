import type {
  DbGridEditSource,
  DbQueryBatchResult,
  DbSchemaSnapshot,
  QueryExecutionResponse,
} from "@shared/schema";
import type { WorkbenchQueryResultsPaneProps } from "./WorkbenchQueryResultsPane";

type QueryResultsPassthroughProps = Omit<
  WorkbenchQueryResultsPaneProps,
  | "activeEditBlockReason"
  | "batches"
  | "editEligibility"
  | "tableSchema"
  | "primaryKeyColumns"
>;

export interface BuildWorkbenchQueryResultsPropsInput
  extends QueryResultsPassthroughProps {
  results: QueryExecutionResponse | null | undefined;
  activeBatch: DbQueryBatchResult | null | undefined;
  schemaSnapshot: DbSchemaSnapshot | null | undefined;
  lastGridEditSource: DbGridEditSource | null | undefined;
}

export function buildWorkbenchQueryResultsProps(
  input: BuildWorkbenchQueryResultsPropsInput,
): WorkbenchQueryResultsPaneProps {
  const {
    results,
    activeBatch,
    schemaSnapshot,
    lastGridEditSource,
    ...queryResultsProps
  } = input;
  const activeEditEligibility = activeBatch?.editEligibility;
  const activeEditSource =
    activeBatch?.editSource ?? lastGridEditSource;
  const activeEditableTable =
    schemaSnapshot?.tables.find(
      (table) => table.name === activeEditSource?.tableName?.trim(),
    ) ?? null;

  return {
    ...queryResultsProps,
    activeEditBlockReason:
      activeEditEligibility && !activeEditEligibility.eligible
        ? activeEditEligibility.reasons[0]?.message ??
          "Current result is read-only."
        : null,
    batches: results?.batches ?? [],
    editEligibility: activeEditEligibility,
    tableSchema: activeEditableTable,
    primaryKeyColumns: activeBatch?.primaryKeyColumns ?? [],
  };
}
