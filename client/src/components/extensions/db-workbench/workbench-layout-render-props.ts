import { buildWorkbenchLayoutDialogStackProps } from "./workbench-layout-dialog-stack-props";
import { buildWorkbenchLayoutResultWorkspaceProps } from "./workbench-layout-result-workspace-props";
import { buildWorkbenchLayoutWorkspaceBodyProps } from "./workbench-layout-workspace-body-props";
import {
  type BuildWorkbenchLayoutRenderPropsInput,
  type WorkbenchLayoutRenderProps,
} from "./workbench-layout-render-props-contract";
import { buildWorkbenchRenderContext } from "./workbench-render-context";

export function buildWorkbenchLayoutRenderProps(
  input: BuildWorkbenchLayoutRenderPropsInput,
): WorkbenchLayoutRenderProps {
  const renderContext = buildWorkbenchRenderContext({
    connection: input.connection,
    results: input.results,
    activeBatchIndex: input.activeBatchIndex,
    pendingEditCells: input.pendingEditCells,
    pendingDeleteRows: input.pendingDeleteRows,
    pendingInsertedRows: input.pendingInsertedRows,
    pendingSnippetName: input.pendingSnippetName,
    savedSnippets: input.savedSnippets,
    objectInspection: input.objectInspection,
  });
  const resultWorkspaceProps = buildWorkbenchLayoutResultWorkspaceProps({
    input,
    renderContext,
  });
  const workspaceBodyProps = buildWorkbenchLayoutWorkspaceBodyProps({
    input,
    renderContext,
    resultWorkspaceProps,
  });
  const dialogStackProps = buildWorkbenchLayoutDialogStackProps({
    input,
    renderContext,
  });

  return {
    operatorChromeProps: {
      connection: input.connection,
      runtimeSchema: input.runtimeSchema ?? null,
      driverLabel: renderContext.driverLabel,
      workbenchContextLabel: renderContext.workbenchContextLabel,
      onManageConnections: input.onManageConnections,
    },
    workspaceBodyProps,
    dialogStackProps,
  };
}
