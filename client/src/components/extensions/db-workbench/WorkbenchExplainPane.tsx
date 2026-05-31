import type { DbExplainPlan } from "@shared/schema";
import { ExplainPlanPane } from "./ExplainPlanPane";
import { WorkbenchInlineIssue } from "./WorkbenchInlineIssue";

export interface WorkbenchExplainPaneProps {
  explainError: string | null;
  plan: DbExplainPlan | null;
  isLoading: boolean;
}

export function WorkbenchExplainPane({
  explainError,
  plan,
  isLoading,
}: WorkbenchExplainPaneProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {explainError ? (
        <WorkbenchInlineIssue
          title="Execution plan is unavailable"
          description={explainError}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ExplainPlanPane plan={plan} isLoading={isLoading} />
      </div>
    </div>
  );
}
