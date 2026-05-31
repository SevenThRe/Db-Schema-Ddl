import type {
  DbConnectionConfig,
  DbGridEditSource,
  DbTableSchema,
} from "@shared/schema";
import {
  buildSchemaSwitchFailureNotice,
  normalizeSchemaName,
  type WorkbenchSchemaNotice,
} from "./workbench-schema-runtime";
import {
  buildStarterTableQuery,
  type StarterQueryMode,
} from "./table-query-utils";
import {
  createQueryWorkspaceResetState,
  type QueryWorkspaceResetState,
} from "./workbench-reset-runtime";
import type { WorkbenchResultTab } from "./workbench-session";

export interface NavigationStateActions {
  selectTable: (tableName: string) => void;
  applyQueryWorkspaceReset: (reset: QueryWorkspaceResetState) => void;
}

export function createNavigationStateActions(input: {
  setSelectedTableName: (tableName: string) => void;
  setResults: (results: QueryWorkspaceResetState["results"]) => void;
  setExplainPlan: (plan: QueryWorkspaceResetState["explainPlan"]) => void;
  setQueryError: (message: QueryWorkspaceResetState["queryError"]) => void;
  setExplainError: (message: QueryWorkspaceResetState["explainError"]) => void;
  setActiveBatchIndex: (index: QueryWorkspaceResetState["activeBatchIndex"]) => void;
  setResultTab: (tab: QueryWorkspaceResetState["resultTab"]) => void;
  setPendingEditCells: (cells: QueryWorkspaceResetState["pendingEditCells"]) => void;
  setPendingDeleteRows: (rows: QueryWorkspaceResetState["pendingDeleteRows"]) => void;
  setPendingInsertedRows: (rows: QueryWorkspaceResetState["pendingInsertedRows"]) => void;
  setPreparedGridPlan: (plan: QueryWorkspaceResetState["preparedGridPlan"]) => void;
  setLastGridEditSource: (source: QueryWorkspaceResetState["lastGridEditSource"]) => void;
}): NavigationStateActions {
  return {
    selectTable: input.setSelectedTableName,
    applyQueryWorkspaceReset: (reset) => {
      input.setResults(reset.results);
      input.setExplainPlan(reset.explainPlan);
      input.setQueryError(reset.queryError);
      input.setExplainError(reset.explainError);
      input.setActiveBatchIndex(reset.activeBatchIndex);
      input.setResultTab(reset.resultTab);
      input.setPendingEditCells(reset.pendingEditCells);
      input.setPendingDeleteRows(reset.pendingDeleteRows);
      input.setPendingInsertedRows(reset.pendingInsertedRows);
      input.setPreparedGridPlan(reset.preparedGridPlan);
      input.setLastGridEditSource(reset.lastGridEditSource);
    },
  };
}

export interface RunSchemaChangeInput {
  connection: DbConnectionConfig;
  activeSchema: string;
  nextSchema: string;
  saveConnection: (connection: DbConnectionConfig) => Promise<unknown>;
  invalidateConnections: () => Promise<unknown>;
  refetchSchema: () => Promise<unknown>;
  refetchSchemaOptions: () => Promise<unknown>;
  applyActiveSchema: (schema: string) => void;
  applyQueryWorkspaceReset: (reset: QueryWorkspaceResetState) => void;
  showNotification: (notice: WorkbenchSchemaNotice) => void;
}

export async function runSchemaChange(
  input: RunSchemaChangeInput,
): Promise<QueryWorkspaceResetState | null> {
  if (input.connection.driver !== "postgres") return null;

  const normalizedSchema = normalizeSchemaName(input.nextSchema);
  if (normalizedSchema === input.activeSchema) return null;

  const previousSchema = input.activeSchema;
  input.applyActiveSchema(normalizedSchema);

  try {
    await input.saveConnection({
      ...input.connection,
      defaultSchema: normalizedSchema,
    });
    await input.invalidateConnections();
    await Promise.all([
      input.refetchSchema(),
      input.refetchSchemaOptions(),
    ]);

    const reset = createQueryWorkspaceResetState();
    input.applyQueryWorkspaceReset(reset);
    return reset;
  } catch (error) {
    input.applyActiveSchema(previousSchema);
    input.showNotification(buildSchemaSwitchFailureNotice(error));
    return null;
  }
}

export interface RunStarterTableQueryInput {
  connection: Pick<
    DbConnectionConfig,
    "driver" | "defaultSchema"
  >;
  tableName: string;
  mode: StarterQueryMode;
  tables?: DbTableSchema[];
  runtimeSchema?: string;
  snapshotSchema?: string | null;
  selectTable: (tableName: string) => void;
  updateActiveTabSql: (sql: string) => void;
  setResultTab: (tab: WorkbenchResultTab) => void;
  setLastGridEditSource: (source: DbGridEditSource) => void;
  focusSqlEditor: () => void;
  executeQuery: (sql: string, source: DbGridEditSource) => Promise<unknown>;
}

export interface StarterTableQueryRunResult {
  sql: string;
  source: DbGridEditSource;
  executed: boolean;
}

export async function runStarterTableQuery(
  input: RunStarterTableQueryInput,
): Promise<StarterTableQueryRunResult> {
  input.selectTable(input.tableName);

  const table = input.tables?.find((item) => item.name === input.tableName);
  const { sql, source } = buildStarterTableQuery({
    driver: input.connection.driver,
    tableName: input.tableName,
    mode: input.mode,
    table,
    runtimeSchema: input.runtimeSchema,
    snapshotSchema: input.snapshotSchema,
    defaultSchema: input.connection.defaultSchema,
  });

  input.updateActiveTabSql(sql);
  input.setResultTab("results");
  input.setLastGridEditSource(source);

  if (input.mode === "columns") {
    input.focusSqlEditor();
    return { sql, source, executed: false };
  }

  await input.executeQuery(sql, source);
  return { sql, source, executed: true };
}
