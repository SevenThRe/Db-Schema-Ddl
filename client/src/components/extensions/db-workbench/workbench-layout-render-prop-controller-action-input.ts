import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";
import { buildWorkbenchLayoutRenderPropQueryActionInput } from "./workbench-layout-render-prop-query-action-input";
import { buildWorkbenchLayoutRenderPropRuntimeActionInput } from "./workbench-layout-render-prop-runtime-action-input";
import { buildWorkbenchLayoutRenderPropSqlActionInput } from "./workbench-layout-render-prop-sql-action-input";
import { buildWorkbenchLayoutRenderPropTabActionInput } from "./workbench-layout-render-prop-tab-action-input";
import { buildWorkbenchLayoutRenderPropWorkflowActionInput } from "./workbench-layout-render-prop-workflow-action-input";

type WorkbenchLayoutRenderPropControllerActionInput = ReturnType<
  typeof buildWorkbenchLayoutRenderPropQueryActionInput
> &
  ReturnType<typeof buildWorkbenchLayoutRenderPropRuntimeActionInput> &
  ReturnType<typeof buildWorkbenchLayoutRenderPropSqlActionInput> &
  ReturnType<typeof buildWorkbenchLayoutRenderPropTabActionInput> &
  ReturnType<typeof buildWorkbenchLayoutRenderPropWorkflowActionInput>;

export function buildWorkbenchLayoutRenderPropControllerActionInput(
  input: WorkbenchLayoutRenderPropGroups,
): WorkbenchLayoutRenderPropControllerActionInput {
  return {
    ...buildWorkbenchLayoutRenderPropQueryActionInput(input),
    ...buildWorkbenchLayoutRenderPropRuntimeActionInput(input),
    ...buildWorkbenchLayoutRenderPropSqlActionInput(input),
    ...buildWorkbenchLayoutRenderPropTabActionInput(input),
    ...buildWorkbenchLayoutRenderPropWorkflowActionInput(input),
  };
}
