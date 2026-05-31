import type { DbGridEditSource } from "@shared/schema";
import type { SqlCopilotGeneratedDraft } from "./sql-copilot-generation";
import { splitSqlStatements } from "./sql-statements";

export type SqlCopilotDraftNotice = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

export interface ReplaceActiveTabWithGeneratedDraftInput {
  draft: SqlCopilotGeneratedDraft | null;
  insertSqlIntoActiveTab: (sql: string) => void;
  focusSqlEditor: () => void;
  showNotification: (notice: SqlCopilotDraftNotice) => void;
}

export function replaceActiveTabWithGeneratedDraft(
  input: ReplaceActiveTabWithGeneratedDraftInput,
): boolean {
  const sql = input.draft?.sql.trim() ?? "";
  if (!sql) return false;

  input.insertSqlIntoActiveTab(sql);
  input.focusSqlEditor();
  input.showNotification({
    title: "Generated SQL inserted",
    description: "The reviewed draft replaced the active editor tab.",
    variant: "success",
  });
  return true;
}

export interface OpenGeneratedDraftInNewTabInput {
  draft: SqlCopilotGeneratedDraft | null;
  openSqlInNewTab: (sql: string, label: string) => void;
  showNotification: (notice: SqlCopilotDraftNotice) => void;
}

export function openGeneratedDraftInNewTab(
  input: OpenGeneratedDraftInNewTabInput,
): boolean {
  const sql = input.draft?.sql.trim() ?? "";
  if (!sql) return false;

  input.openSqlInNewTab(sql, input.draft?.summary ?? "Generated SQL");
  input.showNotification({
    title: "Generated SQL opened",
    description: "The reviewed draft was opened in a new query tab.",
    variant: "success",
  });
  return true;
}

export type GeneratedDraftExecutionRoute = "empty" | "script" | "statement";

export interface RunGeneratedDraftWithSafetyGatesInput {
  draft: SqlCopilotGeneratedDraft | null;
  runtimeSchema?: string;
  executeScript: (sql: string) => Promise<unknown>;
  executeStatement: (
    sql: string,
    source: DbGridEditSource,
    mode: "statement",
    cursorOffset?: number,
  ) => Promise<unknown>;
}

export async function runGeneratedDraftWithSafetyGates(
  input: RunGeneratedDraftWithSafetyGatesInput,
): Promise<GeneratedDraftExecutionRoute> {
  const sql = input.draft?.sql.trim() ?? "";
  if (!sql) return "empty";

  if (splitSqlStatements(sql).length > 1) {
    await input.executeScript(sql);
    return "script";
  }

  await input.executeStatement(
    sql,
    {
      kind: "custom-sql",
      schema: input.runtimeSchema,
    },
    "statement",
    undefined,
  );
  return "statement";
}
