import { ResultGridPane, type ResultGridPaneProps } from "./ResultGridPane";
import { WorkbenchInlineIssue } from "./WorkbenchInlineIssue";

export interface WorkbenchQueryResultsPaneProps extends ResultGridPaneProps {
  queryError: string | null;
  activeEditBlockReason: string | null;
}

export function WorkbenchQueryResultsPane({
  queryError,
  activeEditBlockReason,
  ...gridProps
}: WorkbenchQueryResultsPaneProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {queryError ? (
        <WorkbenchInlineIssue
          title="Current query could not be started"
          description={queryError}
        />
      ) : null}
      {!queryError && activeEditBlockReason ? (
        <WorkbenchInlineIssue
          title="Result is currently read-only"
          description={activeEditBlockReason}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ResultGridPane {...gridProps} />
      </div>
    </div>
  );
}
