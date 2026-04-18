import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ArrowRightSquare, PanelsTopLeft } from "lucide-react";
import type { ResolvedActivityBarItem, ResolvedSidebarView } from "../contribution-resolver";
import type { MainSurface } from "../host-api";
import { getSidebarView } from "../sidebar-view-registry";
import { useExtensionHost } from "../host-context";
import { ExtensionRuntimeFrame } from "../ExtensionRuntimeFrame";
import { useTranslation } from "react-i18next";

interface ExtensionSecondarySidebarProps {
  activityItem: ResolvedActivityBarItem | null;
  sidebarViews: ResolvedSidebarView[];
  activeSidebarViewId: string | null;
  workbenchViewId?: string | null;
  onSelectSidebarView: (sidebarViewId: string) => void;
  onOpenWorkbenchView: (workbenchViewId?: string) => void;
  onNavigate: (surface: MainSurface) => void;
}

export function ExtensionSecondarySidebar({
  activityItem,
  sidebarViews,
  activeSidebarViewId,
  workbenchViewId,
  onSelectSidebarView,
  onOpenWorkbenchView,
  onNavigate,
}: ExtensionSecondarySidebarProps) {
  const { extensions } = useExtensionHost();
  const { t } = useTranslation();
  const activeSidebarView =
    sidebarViews.find((view) => view.id === activeSidebarViewId) ?? sidebarViews[0] ?? null;
  const SidebarViewComponent =
    activeSidebarView?.component ? getSidebarView(activeSidebarView.component) : undefined;
  const extensionId = activityItem?.extensionId ?? activeSidebarView?.extensionId ?? null;
  const extension =
    extensionId != null ? extensions.find((item) => item.manifest.id === extensionId) ?? null : null;

  return (
    <aside className="workspace-panel flex h-full w-[280px] shrink-0 flex-col overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/75 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              {t("extensions.shell.tool")}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
              {activityItem?.label ?? t("extensions.shell.tool")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 text-[11px]"
            onClick={() => onOpenWorkbenchView(workbenchViewId ?? activityItem?.defaultWorkbenchViewId)}
          >
            <ArrowRightSquare className="h-3.5 w-3.5" />
            {t("extensions.shell.workspace")}
          </Button>
        </div>
      </div>

      <div className="border-b border-slate-200/80 px-2 py-2 dark:border-slate-800">
        <div className="flex flex-wrap gap-1.5">
          {sidebarViews.map((view) => {
            const isActive = view.id === activeSidebarViewId;
            return (
              <Button
                key={`${view.extensionId}:${view.id}`}
                type="button"
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 rounded-md px-2.5 text-[11px]",
                  isActive
                    ? "bg-slate-100 text-slate-950 dark:bg-slate-900 dark:text-slate-50"
                    : "text-slate-600 dark:text-slate-300",
                )}
                onClick={() => onSelectSidebarView(view.id)}
              >
                {view.label}
              </Button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="min-h-full p-2">
          {SidebarViewComponent && extensionId && activeSidebarView ? (
            <SidebarViewComponent
              extensionId={extensionId}
              activityItemId={activityItem?.id}
              sidebarViewId={activeSidebarView.id}
              workbenchViewId={workbenchViewId ?? undefined}
              onNavigate={onNavigate}
              onSelectSidebarView={onSelectSidebarView}
              onOpenWorkbenchView={onOpenWorkbenchView}
            />
          ) : extension && activeSidebarView?.runtimeViewId ? (
            <ExtensionRuntimeFrame
              extension={extension}
              runtimeViewId={activeSidebarView.runtimeViewId}
              surfaceId={activeSidebarView.id}
              surfaceKind="sidebar"
              title={activeSidebarView.label}
              onOpenWorkbenchView={onOpenWorkbenchView}
              onSelectSidebarView={onSelectSidebarView}
            />
          ) : (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-200/80 bg-slate-50/70 p-6 text-center dark:border-slate-800 dark:bg-slate-950/60">
              <PanelsTopLeft className="h-8 w-8 text-slate-400" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {activeSidebarView?.label ?? t("extensions.shell.noSidebarView")}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeSidebarView
                    ? t("extensions.shell.unregisteredView")
                    : t("extensions.shell.selectActivity")}
                </p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
