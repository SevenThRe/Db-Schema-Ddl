/**
 * 差分ヘッダー
 *
 * テーブルパス、変更統計、表示モード切替を含むヘッダーバー。
 * VS Codeのdiffエディタヘッダーに相当する。
 */

import { memo } from "react";
import { Columns2, List } from "lucide-react";
import type { DiffHeaderProps, DiffViewMode } from "./types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** アクションラベル */
const ACTION_LABELS: Record<string, string> = {
  added: "新增",
  removed: "删除",
  modified: "修改",
  changed: "修改",
  renamed: "重命名",
  rename_suggest: "rename 建议",
};

export const DiffHeader = memo(function DiffHeader({
  tableName,
  logicalName,
  action,
  addedLines,
  removedLines,
  viewMode,
  onViewModeChange,
}: DiffHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
      <div className="flex min-w-0 items-center gap-3">
        {/* テーブル名 */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-[12px] font-semibold text-foreground">{tableName}</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                action === "added" && "border-green-300/50 text-green-600 dark:text-emerald-400",
                action === "removed" && "border-red-300/50 text-red-600 dark:text-red-400",
                (action === "modified" || action === "changed") && "border-amber-300/50 text-amber-600 dark:text-amber-400",
                (action === "renamed" || action === "rename_suggest") && "border-blue-300/50 text-blue-600 dark:text-blue-400",
              )}
            >
              {ACTION_LABELS[action] || action}
            </Badge>
          </div>
          {logicalName ? (
            <span className="text-[11px] text-muted-foreground">{logicalName}</span>
          ) : null}
        </div>

        {/* 変更統計 */}
        <div className="flex items-center gap-2 text-[11px] font-mono">
          {addedLines > 0 ? (
            <span className="text-green-600 dark:text-emerald-400">+{addedLines}</span>
          ) : null}
          {removedLines > 0 ? (
            <span className="text-red-600 dark:text-red-400">-{removedLines}</span>
          ) : null}
        </div>
      </div>

      {/* 表示モード切替 */}
      <div className="flex items-center gap-1">
        <Button
          variant={viewMode === "side-by-side" ? "default" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => onViewModeChange("side-by-side")}
          title="Side by side"
        >
          <Columns2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant={viewMode === "unified" ? "default" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => onViewModeChange("unified")}
          title="Unified"
        >
          <List className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
});
