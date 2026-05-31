import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";

export function buildWorkbenchLayoutRenderPropExecutionInput(
  input: WorkbenchLayoutRenderPropGroups,
) {
  const { executionWorkspaceState, contextModels } = input;
  const { renderedParameterReview } = contextModels.sqlWorkspaceContext;

  return {
    dangerPreview: executionWorkspaceState.dangerPreview,
    explainError: executionWorkspaceState.explainError,
    explainPlan: executionWorkspaceState.explainPlan,
    isExecuting: executionWorkspaceState.isExecuting,
    isExplaining: executionWorkspaceState.isExplaining,
    parameterValues: executionWorkspaceState.parameterValues,
    pendingParameterReview: executionWorkspaceState.pendingParameterReview,
    pendingScriptReview: executionWorkspaceState.pendingScriptReview,
    queryError: executionWorkspaceState.queryError,
    renderedParameterReview,
    results: executionWorkspaceState.results,
    resultTab: executionWorkspaceState.resultTab,
    showDangerDialog: executionWorkspaceState.showDangerDialog,
    stopOnError: executionWorkspaceState.stopOnError,
  };
}
