import { buildWorkbenchLayoutRenderPropActionInput } from "./workbench-layout-render-prop-action-input";
import { buildWorkbenchLayoutRenderPropExecutionInput } from "./workbench-layout-render-prop-execution-input";
import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";
import { buildWorkbenchLayoutRenderPropResultInput } from "./workbench-layout-render-prop-result-input";
import { buildWorkbenchLayoutRenderPropSchemaInput } from "./workbench-layout-render-prop-schema-input";
import { buildWorkbenchLayoutRenderPropSqlInput } from "./workbench-layout-render-prop-sql-input";
import { buildWorkbenchLayoutRenderPropSyncInput } from "./workbench-layout-render-prop-sync-input";
import type { BuildWorkbenchLayoutRenderPropsInput } from "./workbench-layout-render-props-contract";

export type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";

export function buildWorkbenchLayoutRenderPropInput(
  input: WorkbenchLayoutRenderPropGroups,
): BuildWorkbenchLayoutRenderPropsInput {
  return {
    ...buildWorkbenchLayoutRenderPropActionInput(input),
    ...buildWorkbenchLayoutRenderPropExecutionInput(input),
    ...buildWorkbenchLayoutRenderPropResultInput(input),
    ...buildWorkbenchLayoutRenderPropSchemaInput(input),
    ...buildWorkbenchLayoutRenderPropSqlInput(input),
    ...buildWorkbenchLayoutRenderPropSyncInput(input),
    connection: input.connection,
    connections: input.backendQueries.connections,
    sidebarMode: input.sidebarMode,
    tableDesigner: input.tableDesigner,
  };
}
