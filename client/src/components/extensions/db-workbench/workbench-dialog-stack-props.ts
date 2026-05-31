import type { DbGridPrepareCommitResponse } from "@shared/schema";
import type { WorkbenchDialogStackProps } from "./WorkbenchDialogStack";

type GridCommitProps = WorkbenchDialogStackProps["gridCommit"];
type SqlParametersProps = WorkbenchDialogStackProps["sqlParameters"];
type SqlScriptReviewProps = WorkbenchDialogStackProps["sqlScriptReview"];

export interface BuildWorkbenchDialogStackPropsInput {
  gridCommit: {
    preparedPlan: DbGridPrepareCommitResponse | null;
    pendingRows: GridCommitProps["pendingRows"];
    pendingDeletedRows: GridCommitProps["pendingDeletedRows"];
    pendingInsertedRows: GridCommitProps["pendingInsertedRows"];
    isConfirming: boolean;
    onConfirm: GridCommitProps["onConfirm"];
    onCancel: GridCommitProps["onCancel"];
  };
  sqlLibrary: WorkbenchDialogStackProps["sqlLibrary"];
  sqlMemory: WorkbenchDialogStackProps["sqlMemory"];
  sqlCopilot: WorkbenchDialogStackProps["sqlCopilot"];
  sqlParameters: {
    pendingReview: {
      parameters: SqlParametersProps["parameters"];
      sql: string;
    } | null;
    values: SqlParametersProps["values"];
    renderedSqlPreview: string | null | undefined;
    onValueChange: SqlParametersProps["onValueChange"];
    onConfirm: SqlParametersProps["onConfirm"];
    onCancel: SqlParametersProps["onCancel"];
  };
  sqlScriptReview: {
    pendingReview: {
      statements: SqlScriptReviewProps["statements"];
    } | null;
    stopOnError: SqlScriptReviewProps["stopOnError"];
    onConfirm: SqlScriptReviewProps["onConfirm"];
    onCancel: SqlScriptReviewProps["onCancel"];
  };
  saveSnippet: WorkbenchDialogStackProps["saveSnippet"];
  dangerousSql: WorkbenchDialogStackProps["dangerousSql"];
  /** Optional: present once the layout supplies the visual table designer. */
  tableDesigner?: WorkbenchDialogStackProps["tableDesigner"];
}

export function buildWorkbenchDialogStackProps(
  input: BuildWorkbenchDialogStackPropsInput,
): WorkbenchDialogStackProps {
  const preparedPlan = input.gridCommit.preparedPlan;
  const pendingParameterReview = input.sqlParameters.pendingReview;
  const pendingScriptReview = input.sqlScriptReview.pendingReview;

  return {
    gridCommit: {
      open: preparedPlan !== null,
      affectedRows: preparedPlan?.affectedRows ?? 0,
      insertedRows: preparedPlan?.insertedRows ?? 0,
      updatedRows: preparedPlan?.updatedRows ?? 0,
      deletedRows: preparedPlan?.deletedRows ?? 0,
      changedColumnsSummary: preparedPlan?.changedColumnsSummary ?? [],
      pendingRows: input.gridCommit.pendingRows,
      pendingDeletedRows: input.gridCommit.pendingDeletedRows,
      pendingInsertedRows: input.gridCommit.pendingInsertedRows,
      sqlPreviewLines: preparedPlan?.sqlPreviewLines ?? [],
      previewTruncated: preparedPlan?.previewTruncated ?? false,
      isConfirming: input.gridCommit.isConfirming,
      onConfirm: input.gridCommit.onConfirm,
      onCancel: input.gridCommit.onCancel,
    },
    sqlLibrary: input.sqlLibrary,
    sqlMemory: input.sqlMemory,
    sqlCopilot: input.sqlCopilot,
    sqlParameters: {
      open: pendingParameterReview !== null,
      parameters: pendingParameterReview?.parameters ?? [],
      values: input.sqlParameters.values,
      renderedSqlPreview:
        input.sqlParameters.renderedSqlPreview ?? pendingParameterReview?.sql ?? "",
      onValueChange: input.sqlParameters.onValueChange,
      onConfirm: input.sqlParameters.onConfirm,
      onCancel: input.sqlParameters.onCancel,
    },
    sqlScriptReview: {
      open: pendingScriptReview !== null,
      statements: pendingScriptReview?.statements ?? [],
      stopOnError: input.sqlScriptReview.stopOnError,
      onConfirm: input.sqlScriptReview.onConfirm,
      onCancel: input.sqlScriptReview.onCancel,
    },
    saveSnippet: input.saveSnippet,
    dangerousSql: input.dangerousSql,
    tableDesigner: input.tableDesigner,
  };
}
