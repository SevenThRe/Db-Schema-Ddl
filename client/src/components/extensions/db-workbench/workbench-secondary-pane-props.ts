import type { WorkbenchResultWorkspacePaneProps } from "./WorkbenchResultWorkspacePane";

type SchemaDiffProps = WorkbenchResultWorkspacePaneProps["schemaDiff"];
type InspectionProps = WorkbenchResultWorkspacePaneProps["inspection"];
type JobsProps = WorkbenchResultWorkspacePaneProps["jobs"];

type AsyncableIgnored = void | Promise<unknown>;

export interface BuildWorkbenchSecondaryPanePropsInput {
  schemaDiff: Omit<SchemaDiffProps, "onCompare"> & {
    onCompare: () => AsyncableIgnored;
  };
  inspection: Omit<
    InspectionProps,
    "className" | "onInspectObject" | "onOpenTable"
  > & {
    className?: string;
    onInspectObject: (
      ...args: Parameters<NonNullable<InspectionProps["onInspectObject"]>>
    ) => AsyncableIgnored;
    onOpenTable: (
      ...args: Parameters<NonNullable<InspectionProps["onOpenTable"]>>
    ) => AsyncableIgnored;
  };
  jobs: Omit<JobsProps, "onRefresh" | "onReopenSyncContext"> & {
    onRefresh: () => AsyncableIgnored;
    onReopenSyncContext: (jobId: string) => AsyncableIgnored;
  };
}

export type WorkbenchSecondaryPaneProps = Pick<
  WorkbenchResultWorkspacePaneProps,
  "schemaDiff" | "inspection" | "jobs"
>;

export function buildWorkbenchSecondaryPaneProps(
  input: BuildWorkbenchSecondaryPanePropsInput,
): WorkbenchSecondaryPaneProps {
  return {
    schemaDiff: {
      ...input.schemaDiff,
      onCompare: () => {
        void input.schemaDiff.onCompare();
      },
    },
    inspection: {
      ...input.inspection,
      className: input.inspection.className ?? "h-full",
      onInspectObject: (objectKind, objectName) => {
        void input.inspection.onInspectObject(objectKind, objectName);
      },
      onOpenTable: (tableName) => {
        void input.inspection.onOpenTable(tableName);
      },
    },
    jobs: {
      ...input.jobs,
      onRefresh: () => {
        void input.jobs.onRefresh();
      },
      onReopenSyncContext: (jobId) => {
        void input.jobs.onReopenSyncContext(jobId);
      },
    },
  };
}
