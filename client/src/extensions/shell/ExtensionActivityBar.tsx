import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Puzzle } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { ResolvedActivityBarItem } from "../contribution-resolver";

function getLucideIcon(name?: string): LucideIcons.LucideIcon | null {
  if (!name) return null;
  const icon = (LucideIcons as Record<string, unknown>)[name];
  return typeof icon === "function" ? (icon as LucideIcons.LucideIcon) : null;
}

interface ExtensionActivityBarProps {
  items: ResolvedActivityBarItem[];
  activeActivityItemId?: string | null;
  onSelectActivity: (activityItemId: string) => void;
}

export function ExtensionActivityBar({
  items,
  activeActivityItemId,
  onSelectActivity,
}: ExtensionActivityBarProps) {
  return (
    <aside className="workspace-panel flex h-full w-16 shrink-0 flex-col items-center gap-1.5 overflow-hidden px-2 py-3">
      <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md border border-slate-200/80 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
        <Puzzle className="h-4 w-4" />
      </div>

      <div className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        {items.map((item) => {
          const Icon = getLucideIcon(item.icon) ?? Puzzle;
          const isActive = item.id === activeActivityItemId;
          return (
            <Tooltip key={`${item.extensionId}:${item.id}`}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={isActive ? "secondary" : "ghost"}
                  size="icon"
                  className={cn(
                    "h-10 w-10 rounded-md border border-transparent",
                    isActive
                      ? "border-slate-200/80 bg-white text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
                      : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900",
                  )}
                  onClick={() => onSelectActivity(item.id)}
                  aria-label={item.label}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </aside>
  );
}
