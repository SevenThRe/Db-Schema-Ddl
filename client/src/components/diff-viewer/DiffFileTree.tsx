/**
 * 差分ファイルツリー
 *
 * VS Codeスタイルの変更ファイルリスト。
 * 各テーブルの変更アクション、+N/-M統計を表示し、クリックで選択する。
 */

import { memo } from "react";
import type { DiffFileTreeProps, DiffTableEntry } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** アクションに応じたアイコン文字 */
const ACTION_ICON: Record<string, string> = {
  added: "A",
  removed: "D",
  modified: "M",
  changed: "M",
  renamed: "R",
  rename_suggest: "R?",
};

/** アクションに応じた色 */
const ACTION_COLOR: Record<string, string> = {
  added: "text-green-600 dark:text-emerald-400",
  removed: "text-red-600 dark:text-red-400",
  modified: "text-amber-600 dark:text-amber-400",
  changed: "text-amber-600 dark:text-amber-400",
  renamed: "text-blue-600 dark:text-blue-400",
  rename_suggest: "text-blue-600 dark:text-blue-400",
};

/** テーブルエントリの表示ラベル */
function getTableLabel(table: DiffTableEntry): string {
  if (table.logicalName && table.logicalName !== table.tableName) {
    return `${table.tableName}`;
  }
  return table.tableName;
}

export const DiffFileTree = memo(function DiffFileTree({ tables, selectedTableKey, onSelectTable }: DiffFileTreeProps) {
  if (tables.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        変更されたテーブルはありません
      </div>
    );
  }

  // アクション別にグループ化
  const totalAdded = tables.reduce((sum, t) => sum + t.addedLines, 0);
  const totalRemoved = tables.reduce((sum, t) => sum + t.removedLines, 0);

  return (
    <div className="flex h-full flex-col">
      {/* ヘッダー */}
      <div className="shrink-0 border-b border-border/50 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">
            Files Changed ({tables.length})
          </span>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-green-600 dark:text-emerald-400">+{totalAdded}</span>
            <span className="text-red-600 dark:text-red-400">-{totalRemoved}</span>
          </div>
        </div>
      </div>

      {/* ファイルリスト */}
      <ScrollArea className="flex-1">
        <div className="p-1">
          {tables.map((table) => (
            <button
              key={table.key}
              type="button"
              onClick={() => onSelectTable(table.key)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors",
                selectedTableKey === table.key
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {/* アクションアイコン */}
              <span className={cn("w-4 shrink-0 text-center text-[10px] font-bold", ACTION_COLOR[table.action] || "text-muted-foreground")}>
                {ACTION_ICON[table.action] || "?"}
              </span>

              {/* テーブル名 */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium">{getTableLabel(table)}</div>
                {table.logicalName ? (
                  <div className="truncate text-[10px] text-muted-foreground">{table.logicalName}</div>
                ) : null}
                {table.sheetName ? (
                  <div className="truncate text-[10px] text-muted-foreground font-mono">{table.sheetName}</div>
                ) : null}
              </div>

              {/* +N / -M 統計 */}
              <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-mono">
                {table.addedLines > 0 ? (
                  <span className="text-green-600 dark:text-emerald-400">+{table.addedLines}</span>
                ) : null}
                {table.removedLines > 0 ? (
                  <span className="text-red-600 dark:text-red-400">-{table.removedLines}</span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
});
