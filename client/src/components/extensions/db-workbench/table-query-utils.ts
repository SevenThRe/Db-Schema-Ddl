import type {
  DbConnectionConfig,
  DbGridEditSource,
  DbTableSchema,
} from "@shared/schema";
import { quoteIdentifier } from "./result-grid-utils";

export type StarterQueryMode = "select" | "count" | "columns";

export function resolveQualifiedTableName(input: {
  driver: DbConnectionConfig["driver"];
  tableName: string;
  runtimeSchema?: string;
  snapshotSchema?: string | null;
  defaultSchema?: string;
}): string {
  const quotedTable = quoteIdentifier(input.driver, input.tableName);
  if (input.driver !== "postgres") {
    return quotedTable;
  }

  const schemaName =
    input.runtimeSchema?.trim() ||
    input.snapshotSchema?.trim() ||
    input.defaultSchema?.trim() ||
    "public";

  return `${quoteIdentifier(input.driver, schemaName)}.${quotedTable}`;
}

export function buildStarterTableQuery(input: {
  driver: DbConnectionConfig["driver"];
  tableName: string;
  mode: StarterQueryMode;
  table?: DbTableSchema | null;
  runtimeSchema?: string;
  snapshotSchema?: string | null;
  defaultSchema?: string;
}): { sql: string; source: DbGridEditSource } {
  const qualifiedTable = resolveQualifiedTableName(input);
  const explicitColumns = (input.table?.columns ?? [])
    .map((column) => quoteIdentifier(input.driver, column.name))
    .join(",\n  ");

  let sql = "";
  if (input.mode === "count") {
    sql = `SELECT COUNT(*) AS total_count\nFROM ${qualifiedTable};`;
  } else if (input.mode === "columns") {
    const columnProjection = explicitColumns || "*";
    sql = `SELECT\n  ${columnProjection}\nFROM ${qualifiedTable}\nLIMIT 100;`;
  } else {
    sql = `SELECT *\nFROM ${qualifiedTable}\nLIMIT 100;`;
  }

  return {
    sql,
    source: {
      kind:
        input.mode === "count"
          ? "starter-count"
          : input.mode === "columns"
            ? "starter-columns"
            : "starter-select",
      tableName: input.tableName,
      schema: input.runtimeSchema,
      queryMode: input.mode,
    },
  };
}
