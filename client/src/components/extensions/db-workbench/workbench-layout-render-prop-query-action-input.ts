import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";

export function buildWorkbenchLayoutRenderPropQueryActionInput(
  input: WorkbenchLayoutRenderPropGroups,
) {
  const { queryControllers } = input;

  return {
    handleCancel: queryControllers.handleCancel,
    handleCancelParameterReview: queryControllers.handleCancelParameterReview,
    handleCancelScriptReview: queryControllers.handleCancelScriptReview,
    handleConfirmParameterReview: queryControllers.handleConfirmParameterReview,
    handleConfirmScriptReview: queryControllers.handleConfirmScriptReview,
    handleDangerCancel: queryControllers.handleDangerCancel,
    handleDangerConfirm: queryControllers.handleDangerConfirm,
    handleExecuteScript: queryControllers.handleExecuteScript,
    handleExecuteSelection: queryControllers.handleExecuteSelection,
    handleExplain: queryControllers.handleExplain,
    handleParameterValueChange: queryControllers.handleParameterValueChange,
  };
}
