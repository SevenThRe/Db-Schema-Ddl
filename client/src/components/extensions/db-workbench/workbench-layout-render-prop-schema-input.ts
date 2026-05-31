import type { WorkbenchLayoutRenderPropGroups } from "./workbench-layout-render-prop-groups";

export function buildWorkbenchLayoutRenderPropSchemaInput(
  input: WorkbenchLayoutRenderPropGroups,
) {
  const { backendQueries, contextModels } = input;
  const { schemaContext } = contextModels;

  return {
    autocompleteContext: schemaContext.autocompleteContext,
    isSchemaLoading: backendQueries.isSchemaLoading,
    isSchemaOptionsLoading: backendQueries.isSchemaOptionsLoading,
    schemaErrorMessage: schemaContext.schemaErrorMessage,
    schemaOptions: schemaContext.schemaOptions,
    schemaSnapshot: backendQueries.schemaSnapshot,
  };
}
