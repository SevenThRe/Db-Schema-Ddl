import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ExplorerBadgeTone = "neutral" | "success" | "warning";

const EXPLORER_BADGE_TONE_CLASS: Record<ExplorerBadgeTone, string> = {
  neutral:
    "border-border bg-muted/60 text-foreground/75 dark:bg-muted/40 dark:text-foreground/70",
  success:
    "border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-300",
  warning:
    "border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-300",
};

export function ExplorerBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: ExplorerBadgeTone;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 rounded-sm px-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] shadow-none",
        EXPLORER_BADGE_TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </Badge>
  );
}
