import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";

export function buildWorkbenchLayoutRenderPropRuntimeActionInput(
  input: WorkbenchLayoutRenderPropGroups,
) {
  const { runtimeControllers } = input;

  return {
    handleAddInsertedGridRow: runtimeControllers.handleAddInsertedGridRow,
    handleCommitGridEdits: runtimeControllers.handleCommitGridEdits,
    handleDiscardGridEdits: runtimeControllers.handleDiscardGridEdits,
    handleDiscardInsertedGridRow:
      runtimeControllers.handleDiscardInsertedGridRow,
    handleEditCell: runtimeControllers.handleEditCell,
    handleEditInsertedGridRowValue:
      runtimeControllers.handleEditInsertedGridRowValue,
    handleExport: runtimeControllers.handleExport,
    handleLoadMore: runtimeControllers.handleLoadMore,
    handlePrepareGridCommit: runtimeControllers.handlePrepareGridCommit,
    handleRevertGridCell: runtimeControllers.handleRevertGridCell,
    handleRevertGridDelete: runtimeControllers.handleRevertGridDelete,
    handleRevertGridRow: runtimeControllers.handleRevertGridRow,
    handleStageDeleteGridRow: runtimeControllers.handleStageDeleteGridRow,
  };
}
