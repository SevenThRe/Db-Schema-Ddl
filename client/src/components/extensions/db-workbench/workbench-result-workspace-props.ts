import type { WorkbenchResultWorkspacePaneProps } from "./WorkbenchResultWorkspacePane";

type HeaderProps = WorkbenchResultWorkspacePaneProps["header"];
type QueryResultsProps = WorkbenchResultWorkspacePaneProps["queryResults"];
type ExplainProps = WorkbenchResultWorkspacePaneProps["explain"];
type SchemaDiffProps = WorkbenchResultWorkspacePaneProps["schemaDiff"];
type InspectionProps = WorkbenchResultWorkspacePaneProps["inspection"];
type JobsProps = WorkbenchResultWorkspacePaneProps["jobs"];
type SyncProps = WorkbenchResultWorkspacePaneProps["sync"];

export interface BuildWorkbenchResultWorkspacePropsInput {
  resultTab: WorkbenchResultWorkspacePaneProps["resultTab"];
  header: Omit<
    HeaderProps,
    "schemaDiffContextLabel" | "inspectionContextLabel"
  > & {
    sourceConnectionLabel: string;
    targetConnectionLabel: string | null | undefined;
    inspectionDisplayName: string | null | undefined;
  };
  queryResults: QueryResultsProps;
  explain: ExplainProps;
  schemaDiff: SchemaDiffProps;
  inspection: InspectionProps;
  jobs: JobsProps;
  sync: SyncProps;
}

export function buildWorkbenchResultWorkspaceProps(
  input: BuildWorkbenchResultWorkspacePropsInput,
): WorkbenchResultWorkspacePaneProps {
  return {
    resultTab: input.resultTab,
    header: {
      resultTab: input.header.resultTab,
      onResultTabChange: input.header.onResultTabChange,
      activeBatch: input.header.activeBatch,
      onExport: input.header.onExport,
      isExporting: input.header.isExporting,
      schemaDiffContextLabel: `${input.header.sourceConnectionLabel} → ${
        input.header.targetConnectionLabel ?? "target connection"
      }`,
      inspectionContextLabel:
        input.header.inspectionDisplayName ?? "table/view DDL",
    },
    queryResults: input.queryResults,
    explain: input.explain,
    schemaDiff: input.schemaDiff,
    inspection: input.inspection,
    jobs: input.jobs,
    sync: input.sync,
  };
}
