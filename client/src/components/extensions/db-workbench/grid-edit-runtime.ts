import type {
  DbGridEditEligibility,
  DbGridEditSource,
  DbQueryBatchResult,
  DbTableSchema,
  QueryExecutionResponse,
} from "@shared/schema";
import {
  buildRowPrimaryKey,
  buildRowPkTuple,
  getLoadedRowCount,
  getLoadedRowOffset,
} from "./result-grid-utils";

export type BatchEditMetadata = {
  eligibility: DbGridEditEligibility;
  primaryKeyColumns: string[];
  columns: DbQueryBatchResult["columns"];
  normalizedSource: DbGridEditSource;
};

export type GridEditRuntimeContext = {
  readonlyConnection: boolean;
  runtimeSchema?: string;
  schemaTables?: DbTableSchema[];
};

export function deriveBatchEditMetadata(
  batch: DbQueryBatchResult,
  source: DbGridEditSource | null,
  context: GridEditRuntimeContext,
): BatchEditMetadata {
  const normalizedSource: DbGridEditSource = source ?? {
    kind: "custom-sql",
    schema: context.runtimeSchema,
  };

  if (!source) {
    return {
      eligibility: {
        eligible: false,
        reasons: [
          {
            code: "unsupported_source",
            message: "Only starter table queries are editable in this phase.",
          },
        ],
      },
      primaryKeyColumns: [],
      columns: batch.columns,
      normalizedSource,
    };
  }

  if (context.readonlyConnection) {
    return {
      eligibility: {
        eligible: false,
        reasons: [
          {
            code: "readonly_connection",
            message: "This connection is read-only.",
          },
        ],
      },
      primaryKeyColumns: [],
      columns: batch.columns,
      normalizedSource,
    };
  }

  if (source.kind === "starter-count") {
    return {
      eligibility: {
        eligible: false,
        reasons: [
          {
            code: "count_result",
            message: "Count rows results are read-only. Run Select top 100 to edit rows.",
          },
        ],
      },
      primaryKeyColumns: [],
      columns: batch.columns,
      normalizedSource,
    };
  }

  if (batch.error) {
    return {
      eligibility: {
        eligible: false,
        reasons: [
          {
            code: "result_error",
            message: "Current batch has an error and cannot be edited.",
          },
        ],
      },
      primaryKeyColumns: [],
      columns: batch.columns,
      normalizedSource,
    };
  }

  const tableName = source.tableName?.trim();
  if (!tableName) {
    return {
      eligibility: {
        eligible: false,
        reasons: [
          {
            code: "unsupported_source",
            message: "Starter source is missing table context.",
          },
        ],
      },
      primaryKeyColumns: [],
      columns: batch.columns,
      normalizedSource,
    };
  }

  const matchedTable = context.schemaTables?.find((table) => table.name === tableName);
  if (!matchedTable) {
    return {
      eligibility: {
        eligible: false,
        reasons: [
          {
            code: "table_not_found",
            message: "Table metadata is not available for this result batch.",
          },
        ],
      },
      primaryKeyColumns: [],
      columns: batch.columns,
      normalizedSource,
    };
  }

  const primaryKeyColumns = matchedTable.columns
    .filter((column) => column.primaryKey)
    .map((column) => column.name);

  if (primaryKeyColumns.length === 0) {
    return {
      eligibility: {
        eligible: false,
        reasons: [
          {
            code: "missing_primary_key",
            message: "Selected table has no detectable primary key columns.",
          },
        ],
      },
      primaryKeyColumns: [],
      columns: batch.columns,
      normalizedSource,
    };
  }

  const missingPkColumns = primaryKeyColumns.filter(
    (primaryKeyColumn) =>
      !batch.columns.some((column) => column.name === primaryKeyColumn),
  );
  if (missingPkColumns.length > 0) {
    return {
      eligibility: {
        eligible: false,
        reasons: missingPkColumns.map((missingPrimaryKeyColumn) => ({
          code: "missing_primary_key_column" as const,
          message: `Result is missing primary key column: ${missingPrimaryKeyColumn}`,
        })),
      },
      primaryKeyColumns,
      columns: batch.columns,
      normalizedSource,
    };
  }

  const seenTuples = new Set<string>();
  for (const row of batch.rows) {
    const rowPrimaryKey = buildRowPrimaryKey(row, batch, primaryKeyColumns);
    if (!rowPrimaryKey) {
      return {
        eligibility: {
          eligible: false,
          reasons: [
            {
              code: "missing_primary_key_column",
              message: "Failed to resolve row primary key mapping.",
            },
          ],
        },
        primaryKeyColumns,
        columns: batch.columns,
        normalizedSource,
      };
    }

    const rowPkTuple = buildRowPkTuple(rowPrimaryKey, primaryKeyColumns);
    if (seenTuples.has(rowPkTuple)) {
      return {
        eligibility: {
          eligible: false,
          reasons: [
            {
              code: "duplicate_primary_key_tuple",
              message: "Duplicate primary key tuples detected in loaded rows.",
            },
          ],
        },
        primaryKeyColumns,
        columns: batch.columns,
        normalizedSource,
      };
    }
    seenTuples.add(rowPkTuple);
  }

  const decoratedColumns = batch.columns.map((column) => {
    const matchedColumn = matchedTable.columns.find(
      (tableColumn) => tableColumn.name === column.name,
    );
    return {
      ...column,
      sourceTable: tableName,
      sourceSchema: source.schema ?? context.runtimeSchema,
      sourceColumn: matchedColumn?.name ?? column.name,
      isPrimaryKey: primaryKeyColumns.includes(column.name),
    };
  });

  return {
    eligibility: {
      eligible: true,
      reasons: [],
    },
    primaryKeyColumns,
    columns: decoratedColumns,
    normalizedSource,
  };
}

export function decorateQueryResultsForEdit(
  response: QueryExecutionResponse,
  source: DbGridEditSource | null,
  context: GridEditRuntimeContext,
): QueryExecutionResponse {
  const batches = response.batches.map((batch) => {
    const metadata = deriveBatchEditMetadata(batch, source, context);
    return {
      ...batch,
      loadedRowOffset: getLoadedRowOffset(batch),
      loadedRowCount: getLoadedRowCount(batch),
      rowWindowTruncated: batch.rowWindowTruncated === true ? true : undefined,
      columns: metadata.columns,
      editEligibility: metadata.eligibility,
      editSource: metadata.normalizedSource,
      primaryKeyColumns: metadata.primaryKeyColumns,
    };
  });
  return {
    ...response,
    batches,
  };
}
