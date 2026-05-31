import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ConnectionSidebar } from "./ConnectionSidebar";
import type { ConnectionSidebarProps } from "./ConnectionSidebar";
import { QueryTabs } from "./QueryTabs";
import type { QueryTabsProps } from "./QueryTabs";
import { SqlEditorPane } from "./SqlEditorPane";
import type { SqlEditorPaneProps } from "./SqlEditorPane";
import { WorkbenchResultWorkspacePane } from "./WorkbenchResultWorkspacePane";
import type { WorkbenchResultWorkspacePaneProps } from "./WorkbenchResultWorkspacePane";
import { WorkbenchSqlToolStrip } from "./WorkbenchOperatorChrome";
import type { WorkbenchSqlToolStripProps } from "./WorkbenchOperatorChrome";

export interface WorkbenchWorkspaceBodyProps {
  sidebarMode: "host" | "embedded";
  sidebar: ConnectionSidebarProps;
  queryTabs: QueryTabsProps;
  sqlToolStrip: WorkbenchSqlToolStripProps;
  editor: SqlEditorPaneProps;
  resultWorkspace: WorkbenchResultWorkspacePaneProps;
}

export function WorkbenchWorkspaceBody({
  sidebarMode,
  sidebar,
  queryTabs,
  sqlToolStrip,
  editor,
  resultWorkspace,
}: WorkbenchWorkspaceBodyProps) {
  return (
    <div className="flex flex-1 overflow-hidden">
      {sidebarMode === "host" ? null : <ConnectionSidebar {...sidebar} />}

      <div className="flex flex-1 flex-col overflow-hidden">
        <QueryTabs {...queryTabs} />
        <WorkbenchSqlToolStrip {...sqlToolStrip} />

        <ResizablePanelGroup direction="vertical" className="flex-1">
          <ResizablePanel defaultSize={60} minSize={20}>
            <SqlEditorPane {...editor} />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={40} minSize={15}>
            <WorkbenchResultWorkspacePane {...resultWorkspace} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
