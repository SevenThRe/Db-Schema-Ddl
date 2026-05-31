import type { ReactNode } from "react";
import { Database, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import type { DbConnectionConfig } from "@shared/schema";
import {
  COMPATIBILITY_SURFACE_NOTE,
  type WorkspaceSurfaceMeta,
  type WorkspaceView,
} from "./workbench-workspace-route";

export function DbConnectorWorkspaceShell({
  children,
  activeConnection,
  activeConnectionLabel,
  activeTabValue,
  shellSurface,
  compatibilityToolActive,
  legacyToolsOpen,
  hasConnections,
  resumeRecoveryNotice,
  onDismissRecovery,
  onNewConnection,
  onTabValueChange,
  onOpenConnectionView,
  onOpenDatabaseWorkspace,
  onResumeDatabaseWorkspace,
  onToggleCompatibilityTools,
  onOpenSchema,
  onOpenDiff,
}: {
  children: ReactNode;
  activeConnection: DbConnectionConfig | null;
  activeConnectionLabel: string;
  activeTabValue: WorkspaceView;
  shellSurface: WorkspaceSurfaceMeta;
  compatibilityToolActive: boolean;
  legacyToolsOpen: boolean;
  hasConnections: boolean;
  resumeRecoveryNotice: string | null;
  onDismissRecovery: () => void;
  onNewConnection: () => void;
  onTabValueChange: (value: string) => void;
  onOpenConnectionView: () => void;
  onOpenDatabaseWorkspace: () => void;
  onResumeDatabaseWorkspace: () => void;
  onToggleCompatibilityTools: () => void;
  onOpenSchema: () => void;
  onOpenDiff: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-panel-muted/40 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">DB Workbench</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              连接管理是辅助面，真正的日常 DB 操作应通过统一的 Database Workspace 完成。
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden max-w-[420px] rounded-md border border-border bg-background px-3 py-1.5 md:block">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Active Context
              </div>
              <p className="mt-0.5 truncate font-mono text-[11px] text-foreground">
                {activeConnectionLabel}
              </p>
              {activeConnection ? (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                    {activeConnection.driver}
                  </Badge>
                  {activeConnection.environment ? (
                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                      {activeConnection.environment}
                    </Badge>
                  ) : null}
                  {activeConnection.readonly ? (
                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                      readonly
                    </Badge>
                  ) : null}
                  {activeConnection.defaultSchema ? (
                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                      schema:{activeConnection.defaultSchema}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={onNewConnection}
            >
              <Plus className="mr-1 h-3 w-3" />
              新建连接
            </Button>
          </div>
        </div>
      </div>

      {resumeRecoveryNotice ? (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                Connection recovery
              </p>
              <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                {resumeRecoveryNotice}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
              onClick={onDismissRecovery}
            >
              关闭
            </Button>
          </div>
        </div>
      ) : null}

      <Tabs
        value={activeTabValue}
        onValueChange={onTabValueChange}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-foreground">{shellSurface.title}</p>
              <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                {shellSurface.status}
              </Badge>
              {compatibilityToolActive ? (
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                  Compatibility
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {shellSurface.description}
            </p>
            {compatibilityToolActive ? (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {COMPATIBILITY_SURFACE_NOTE}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant={activeTabValue === "connections" ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={onOpenConnectionView}
            >
              连接中心
            </Button>
            <Button
              size="sm"
              variant={activeTabValue === "sql" ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={onOpenDatabaseWorkspace}
            >
              Database Workspace
            </Button>
            {activeConnection && activeTabValue !== "sql" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={onResumeDatabaseWorkspace}
              >
                Resume daily-driver route
              </Button>
            ) : null}
            <div className="ml-1 flex items-center gap-1 border-l border-border pl-2">
              <Button
                size="sm"
                variant={compatibilityToolActive || legacyToolsOpen ? "outline" : "ghost"}
                className="h-7 px-2 text-xs"
                onClick={onToggleCompatibilityTools}
              >
                Compatibility tools
              </Button>
              {legacyToolsOpen || compatibilityToolActive ? (
                <>
                  <Button
                    size="sm"
                    variant={activeTabValue === "schema" ? "outline" : "ghost"}
                    className="h-7 px-2 text-xs"
                    onClick={onOpenSchema}
                    disabled={!activeConnection}
                  >
                    Schema
                  </Button>
                  <Button
                    size="sm"
                    variant={activeTabValue === "diff" ? "outline" : "ghost"}
                    className="h-7 px-2 text-xs"
                    onClick={onOpenDiff}
                    disabled={!hasConnections}
                  >
                    Diff
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {children}
      </Tabs>
    </div>
  );
}

export function DbConnectorNoConnectionView({
  onOpenConnectionView,
  onNewConnection,
}: {
  onOpenConnectionView: () => void;
  onNewConnection: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Database className="h-10 w-10 text-muted-foreground/40" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">先选择一个连接，再进入统一 Database Workspace</p>
        <p className="text-xs text-muted-foreground">
          连接选定后，查询、对象浏览、结果和检查能力会在同一个操作面里协同工作。
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 px-3 text-xs" onClick={onOpenConnectionView}>
          去连接中心
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-xs"
          onClick={onNewConnection}
        >
          新建连接
        </Button>
      </div>
    </div>
  );
}
