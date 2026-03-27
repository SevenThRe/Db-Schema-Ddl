import { AlertCircle, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useStatusBarItems } from "@/status-bar/context";
import type { StatusBarEntry } from "@/status-bar/types";
import { useSettings } from "@/hooks/use-ddl";

function formatProgress(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function toneClassName(item: StatusBarEntry): string {
  if (item.tone === "success") {
    return "text-emerald-700 dark:text-emerald-300";
  }
  if (item.tone === "warning") {
    return "text-amber-700 dark:text-amber-300";
  }
  if (item.tone === "error") {
    return "text-rose-700 dark:text-rose-300";
  }
  if (item.tone === "progress") {
    return "text-sky-700 dark:text-sky-300";
  }
  return "text-[hsl(var(--statusbar-fg))]";
}

function StatusBarItemView({ item }: { item: StatusBarEntry }) {
  return (
    <div className={cn("status-bar-item", toneClassName(item))}>
      {item.tone === "progress" && item.progress == null ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {item.tone === "success" ? <CheckCircle2 className="h-3 w-3" /> : null}
      {item.tone === "warning" ? <TriangleAlert className="h-3 w-3" /> : null}
      {item.tone === "error" ? <AlertCircle className="h-3 w-3" /> : null}
      <span className={cn("truncate", item.mono && "font-mono")}>{item.label}</span>
      {item.detail ? <span className="status-bar-item-detail truncate">{item.detail}</span> : null}
      {typeof item.progress === "number" ? (
        <>
          <span className="font-mono text-[10px]">{formatProgress(item.progress)}</span>
          <span className="status-bar-meter" aria-hidden="true">
            <span className="status-bar-meter-fill" style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }} />
          </span>
        </>
      ) : null}
    </div>
  );
}

export function StatusBar() {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const items = useStatusBarItems();
  const modules = settings?.statusBarItems ?? ["activity", "memory"];
  const activityItems = items.filter((item) => !(item.scope === "app" && item.id === "memory"));
  const memoryItems = items.filter((item) => item.scope === "app" && item.id === "memory");

  if (modules.length === 0) {
    return null;
  }

  return (
    <footer className="status-bar-shell mt-2 flex h-7 shrink-0 items-center justify-between gap-3 px-3 text-[10px] font-medium">
      {modules.map((moduleId) => {
        if (moduleId === "activity") {
          return (
            <div key={moduleId} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              {activityItems.length > 0 ? (
                activityItems.map((item) => <StatusBarItemView key={item.key} item={item} />)
              ) : (
                <span className="truncate text-[hsl(var(--statusbar-muted))]">{t("dashboard.statusIdle")}</span>
              )}
            </div>
          );
        }

        if (moduleId === "memory") {
          return (
            <div key={moduleId} className="flex min-w-0 items-center gap-1.5 overflow-hidden">
              {memoryItems.map((item) => <StatusBarItemView key={item.key} item={item} />)}
            </div>
          );
        }

        return null;
      })}
    </footer>
  );
}
