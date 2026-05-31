import { buildWorkbenchLayoutRenderProps } from "./workbench-layout-render-props";
import {
  buildWorkbenchLayoutRenderPropInput,
  type WorkbenchLayoutRenderPropGroups,
} from "./workbench-layout-render-prop-input";

export function useWorkbenchLayoutRenderProps(
  input: WorkbenchLayoutRenderPropGroups,
) {
  return buildWorkbenchLayoutRenderProps(
    buildWorkbenchLayoutRenderPropInput(input),
  );
}
