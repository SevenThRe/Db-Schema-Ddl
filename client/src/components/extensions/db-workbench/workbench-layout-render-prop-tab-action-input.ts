import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";

export function buildWorkbenchLayoutRenderPropTabActionInput(
  input: WorkbenchLayoutRenderPropGroups,
) {
  const { tabController } = input;

  return {
    handleCloseActiveTab: tabController.handleCloseActiveTab,
    handleSqlChange: tabController.handleSqlChange,
    handleTabAdd: tabController.handleTabAdd,
    handleTabChange: tabController.handleTabChange,
    handleTabClose: tabController.handleTabClose,
    handleTabRename: tabController.handleTabRename,
  };
}
