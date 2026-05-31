import type { DbConnectionConfig } from "@shared/schema";
import type { BuildWorkbenchDialogStackPropsInput } from "./workbench-dialog-stack-props";

type GridCommitInput = BuildWorkbenchDialogStackPropsInput["gridCommit"];
type SqlLibraryInput = BuildWorkbenchDialogStackPropsInput["sqlLibrary"];
type SqlMemoryInput = Omit<
  BuildWorkbenchDialogStackPropsInput["sqlMemory"],
  "connectionLabel" | "activeSchema"
>;
type SqlCopilotInput = Omit<
  BuildWorkbenchDialogStackPropsInput["sqlCopilot"],
  "connectionLabel"
>;
type SqlParametersInput = BuildWorkbenchDialogStackPropsInput["sqlParameters"];
type SqlScriptReviewInput =
  BuildWorkbenchDialogStackPropsInput["sqlScriptReview"];
type SaveSnippetInput = Omit<
  BuildWorkbenchDialogStackPropsInput["saveSnippet"],
  "sqlPreview"
>;
type DangerousSqlInput = BuildWorkbenchDialogStackPropsInput["dangerousSql"];

export interface BuildWorkbenchDialogStackInputInput {
  connection: DbConnectionConfig;
  activeSchema: string | null | undefined;
  activeSql: string;
  gridCommit: GridCommitInput;
  sqlLibrary: SqlLibraryInput;
  sqlMemory: SqlMemoryInput;
  sqlCopilot: SqlCopilotInput;
  sqlParameters: SqlParametersInput;
  sqlScriptReview: SqlScriptReviewInput;
  saveSnippet: SaveSnippetInput;
  dangerousSql: DangerousSqlInput;
  tableDesigner?: BuildWorkbenchDialogStackPropsInput["tableDesigner"];
}

export function buildWorkbenchDialogStackInput(
  input: BuildWorkbenchDialogStackInputInput,
): BuildWorkbenchDialogStackPropsInput {
  const connectionLabel = (input.connection.name || input.connection.database).trim();

  return {
    gridCommit: input.gridCommit,
    sqlLibrary: input.sqlLibrary,
    sqlMemory: {
      ...input.sqlMemory,
      connectionLabel,
      activeSchema: input.activeSchema ?? null,
    },
    sqlCopilot: {
      ...input.sqlCopilot,
      connectionLabel,
    },
    sqlParameters: input.sqlParameters,
    sqlScriptReview: input.sqlScriptReview,
    saveSnippet: {
      ...input.saveSnippet,
      sqlPreview: input.activeSql,
    },
    dangerousSql: input.dangerousSql,
    tableDesigner: input.tableDesigner,
  };
}
