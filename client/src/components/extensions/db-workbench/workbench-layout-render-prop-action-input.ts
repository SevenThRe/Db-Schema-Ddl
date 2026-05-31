import { buildWorkbenchLayoutRenderPropControllerActionInput } from "./workbench-layout-render-prop-controller-action-input";
import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";
import { buildWorkbenchLayoutRenderPropStateActionInput } from "./workbench-layout-render-prop-state-action-input";

type WorkbenchLayoutRenderPropActionInput = ReturnType<
  typeof buildWorkbenchLayoutRenderPropControllerActionInput
> &
  ReturnType<typeof buildWorkbenchLayoutRenderPropStateActionInput>;

export function buildWorkbenchLayoutRenderPropActionInput(
  input: WorkbenchLayoutRenderPropGroups,
): WorkbenchLayoutRenderPropActionInput {
  return {
    ...buildWorkbenchLayoutRenderPropControllerActionInput(input),
    ...buildWorkbenchLayoutRenderPropStateActionInput(input),
  };
}
