import { DangerousSqlDialog } from "./DangerousSqlDialog";
import type { DangerousSqlDialogProps } from "./DangerousSqlDialog";
import { GridEditCommitDialog } from "./GridEditCommitDialog";
import type { GridEditCommitDialogProps } from "./GridEditCommitDialog";
import { SaveSnippetDialog } from "./SaveSnippetDialog";
import type { SaveSnippetDialogProps } from "./SaveSnippetDialog";
import { SqlCopilotDialog } from "./SqlCopilotDialog";
import type { SqlCopilotDialogProps } from "./SqlCopilotDialog";
import { SqlLibraryDialog } from "./SqlLibraryDialog";
import type { SqlLibraryDialogProps } from "./SqlLibraryDialog";
import { SqlMemoryDialog } from "./SqlMemoryDialog";
import type { SqlMemoryDialogProps } from "./SqlMemoryDialog";
import { SqlParametersDialog } from "./SqlParametersDialog";
import type { SqlParametersDialogProps } from "./SqlParametersDialog";
import { SqlScriptReviewDialog } from "./SqlScriptReviewDialog";
import type { SqlScriptReviewDialogProps } from "./SqlScriptReviewDialog";

export interface WorkbenchDialogStackProps {
  gridCommit: GridEditCommitDialogProps;
  sqlLibrary: SqlLibraryDialogProps;
  sqlMemory: SqlMemoryDialogProps;
  sqlCopilot: SqlCopilotDialogProps;
  sqlParameters: SqlParametersDialogProps;
  sqlScriptReview: SqlScriptReviewDialogProps;
  saveSnippet: SaveSnippetDialogProps;
  dangerousSql: DangerousSqlDialogProps;
}

export function WorkbenchDialogStack({
  gridCommit,
  sqlLibrary,
  sqlMemory,
  sqlCopilot,
  sqlParameters,
  sqlScriptReview,
  saveSnippet,
  dangerousSql,
}: WorkbenchDialogStackProps) {
  return (
    <>
      <GridEditCommitDialog {...gridCommit} />
      <SqlLibraryDialog {...sqlLibrary} />
      <SqlMemoryDialog {...sqlMemory} />
      <SqlCopilotDialog {...sqlCopilot} />
      <SqlParametersDialog {...sqlParameters} />
      <SqlScriptReviewDialog {...sqlScriptReview} />
      <SaveSnippetDialog {...saveSnippet} />
      <DangerousSqlDialog {...dangerousSql} />
    </>
  );
}
