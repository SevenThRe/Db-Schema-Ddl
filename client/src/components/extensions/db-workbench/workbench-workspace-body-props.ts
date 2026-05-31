import type { DbConnectionConfig } from "@shared/schema";
import type { WorkbenchWorkspaceBodyProps } from "./WorkbenchWorkspaceBody";

type SidebarProps = WorkbenchWorkspaceBodyProps["sidebar"];
type QueryTabsProps = WorkbenchWorkspaceBodyProps["queryTabs"];
type SqlToolStripProps = WorkbenchWorkspaceBodyProps["sqlToolStrip"];
type EditorProps = WorkbenchWorkspaceBodyProps["editor"];

type AsyncableIgnored = void | Promise<unknown>;

export interface BuildWorkbenchWorkspaceBodyPropsInput {
  sidebarMode: WorkbenchWorkspaceBodyProps["sidebarMode"];
  connection: DbConnectionConfig;
  activeTabId: string;
  activeTabSql: string;
  isExecuting: boolean;
  isExporting: boolean;
  sidebar: Omit<SidebarProps, "connection" | "onRefreshSchema"> & {
    refetchSchema: () => AsyncableIgnored;
    refetchSchemaOptions: () => AsyncableIgnored;
  };
  queryTabs: Omit<QueryTabsProps, "connectionId" | "activeTabId">;
  sqlToolStrip: Omit<SqlToolStripProps, "connectionLabel">;
  editor: Omit<EditorProps, "sql" | "dialect" | "isExecuting">;
  resultWorkspace: WorkbenchWorkspaceBodyProps["resultWorkspace"];
}

export function buildWorkbenchWorkspaceBodyProps(
  input: BuildWorkbenchWorkspaceBodyPropsInput,
): WorkbenchWorkspaceBodyProps {
  return {
    sidebarMode: input.sidebarMode,
    sidebar: {
      ...input.sidebar,
      connection: input.connection,
      onRefreshSchema: () => {
        void input.sidebar.refetchSchema();
        if (input.connection.driver === "postgres") {
          void input.sidebar.refetchSchemaOptions();
        }
      },
    },
    queryTabs: {
      ...input.queryTabs,
      connectionId: input.connection.id,
      activeTabId: input.activeTabId,
    },
    sqlToolStrip: {
      ...input.sqlToolStrip,
      connectionLabel: (input.connection.name || input.connection.database).trim(),
    },
    editor: {
      ...input.editor,
      sql: input.activeTabSql,
      dialect: input.connection.driver,
      isExecuting: input.isExecuting || input.isExporting,
    },
    resultWorkspace: input.resultWorkspace,
  };
}
