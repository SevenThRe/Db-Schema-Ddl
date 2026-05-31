import type { WorkbenchResultTab } from "./workbench-session";
import {
  WorkbenchDataSyncPane,
  type WorkbenchDataSyncPaneProps,
} from "./WorkbenchDataSyncPane";
import {
  WorkbenchExplainPane,
  type WorkbenchExplainPaneProps,
} from "./WorkbenchExplainPane";
import {
  WorkbenchQueryResultsPane,
  type WorkbenchQueryResultsPaneProps,
} from "./WorkbenchQueryResultsPane";
import {
  WorkbenchResultWorkspaceHeader,
  type WorkbenchResultWorkspaceHeaderProps,
} from "./WorkbenchResultWorkspaceHeader";
import {
  WorkbenchSchemaDiffPane,
  type WorkbenchSchemaDiffPaneProps,
} from "./SchemaDiffPane";
import {
  JobCenterPane,
  type JobCenterPaneProps,
} from "./JobCenterPane";
import {
  ObjectInspectionPane,
  type ObjectInspectionPaneProps,
} from "./ObjectInspectionPane";

export interface WorkbenchResultWorkspacePaneProps {
  resultTab: WorkbenchResultTab;
  header: WorkbenchResultWorkspaceHeaderProps;
  queryResults: WorkbenchQueryResultsPaneProps;
  explain: WorkbenchExplainPaneProps;
  schemaDiff: WorkbenchSchemaDiffPaneProps;
  inspection: ObjectInspectionPaneProps;
  jobs: JobCenterPaneProps;
  sync: WorkbenchDataSyncPaneProps;
}

export function WorkbenchResultWorkspacePane({
  resultTab,
  header,
  queryResults,
  explain,
  schemaDiff,
  inspection,
  jobs,
  sync,
}: WorkbenchResultWorkspacePaneProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <WorkbenchResultWorkspaceHeader {...header} />

      <div className="flex-1 overflow-hidden">
        {resultTab === "results" ? (
          <WorkbenchQueryResultsPane {...queryResults} />
        ) : resultTab === "explain" ? (
          <WorkbenchExplainPane {...explain} />
        ) : resultTab === "schema-diff" ? (
          <WorkbenchSchemaDiffPane {...schemaDiff} />
        ) : resultTab === "inspect" ? (
          <ObjectInspectionPane {...inspection} />
        ) : resultTab === "jobs" ? (
          <JobCenterPane {...jobs} />
        ) : (
          <WorkbenchDataSyncPane {...sync} />
        )}
      </div>
    </div>
  );
}
