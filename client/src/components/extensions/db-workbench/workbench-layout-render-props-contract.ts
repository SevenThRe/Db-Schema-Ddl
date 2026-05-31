import type { DbConnectionConfig, DbTableSchema } from "@shared/schema";
import type { buildWorkbenchLayoutRenderPropActionInput } from "./workbench-layout-render-prop-action-input";
import type { buildWorkbenchLayoutRenderPropExecutionInput } from "./workbench-layout-render-prop-execution-input";
import type { buildWorkbenchLayoutRenderPropResultInput } from "./workbench-layout-render-prop-result-input";
import type { buildWorkbenchLayoutRenderPropSchemaInput } from "./workbench-layout-render-prop-schema-input";
import type { buildWorkbenchLayoutRenderPropSqlInput } from "./workbench-layout-render-prop-sql-input";
import type { buildWorkbenchLayoutRenderPropSyncInput } from "./workbench-layout-render-prop-sync-input";
import type { WorkbenchDialogStackProps } from "./WorkbenchDialogStack";
import type { WorkbenchOperatorChromeProps } from "./WorkbenchOperatorChrome";
import type { WorkbenchWorkspaceBodyProps } from "./WorkbenchWorkspaceBody";

type WorkbenchLayoutRenderPropBaseInput = {
  connection: DbConnectionConfig;
  connections: DbConnectionConfig[];
  sidebarMode: WorkbenchWorkspaceBodyProps["sidebarMode"];
  /**
   * Optional visual-table-designer wiring. When present the dialog stack renders
   * the designer; driver / schema / readonly are derived from the active
   * connection by the dialog-props assembler.
   */
  tableDesigner?: {
    open: boolean;
    sourceSchema: DbTableSchema | null;
    onApplyDdl: (sql: string) => void;
    onClose: () => void;
  };
};

export type BuildWorkbenchLayoutRenderPropsInput =
  WorkbenchLayoutRenderPropBaseInput &
    ReturnType<typeof buildWorkbenchLayoutRenderPropActionInput> &
    ReturnType<typeof buildWorkbenchLayoutRenderPropExecutionInput> &
    ReturnType<typeof buildWorkbenchLayoutRenderPropResultInput> &
    ReturnType<typeof buildWorkbenchLayoutRenderPropSchemaInput> &
    ReturnType<typeof buildWorkbenchLayoutRenderPropSqlInput> &
    ReturnType<typeof buildWorkbenchLayoutRenderPropSyncInput>;

export interface WorkbenchLayoutRenderProps {
  operatorChromeProps: WorkbenchOperatorChromeProps;
  workspaceBodyProps: WorkbenchWorkspaceBodyProps;
  dialogStackProps: WorkbenchDialogStackProps;
}
