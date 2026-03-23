/**
 * 構造化差分コンテンツ
 *
 * テーブル/カラム/フィールド単位のセマンティック差分を
 * カード形式で表示する主ビュー。DDLテキスト差分に代わる
 * 意味レベルの変更可視化を提供する。
 */

import { memo, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Plus,
  Minus,
  Pencil,
  ArrowLeftRight,
  HelpCircle,
} from "lucide-react";
import type { StructuredDiffEntry, StructuredColumnChange, FieldChange } from "./structured-types";

// ---------------------------------------------------------------------------
// プロパティ
// ---------------------------------------------------------------------------

export interface StructuredDiffContentProps {
  entry: StructuredDiffEntry;
  className?: string;
}

// ---------------------------------------------------------------------------
// アクション定数
// ---------------------------------------------------------------------------

const ACTION_CONFIG: Record<string, {
  label: string;
  icon: typeof Plus;
  bg: string;
  border: string;
  text: string;
  badge: string;
}> = {
  added: {
    label: "追加",
    icon: Plus,
    bg: "bg-emerald-500/[0.06]",
    border: "border-emerald-500/20",
    text: "text-emerald-700 dark:text-emerald-300",
    badge: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
  },
  removed: {
    label: "削除",
    icon: Minus,
    bg: "bg-rose-500/[0.06]",
    border: "border-rose-500/20",
    text: "text-rose-700 dark:text-rose-300",
    badge: "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300",
  },
  modified: {
    label: "変更",
    icon: Pencil,
    bg: "bg-amber-500/[0.06]",
    border: "border-amber-500/20",
    text: "text-amber-700 dark:text-amber-300",
    badge: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
  },
  changed: {
    label: "変更",
    icon: Pencil,
    bg: "bg-amber-500/[0.06]",
    border: "border-amber-500/20",
    text: "text-amber-700 dark:text-amber-300",
    badge: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
  },
  renamed: {
    label: "改名",
    icon: ArrowLeftRight,
    bg: "bg-blue-500/[0.06]",
    border: "border-blue-500/20",
    text: "text-blue-700 dark:text-blue-300",
    badge: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300",
  },
  rename_suggest: {
    label: "改名候補",
    icon: HelpCircle,
    bg: "bg-violet-500/[0.06]",
    border: "border-violet-500/20",
    text: "text-violet-700 dark:text-violet-300",
    badge: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300",
  },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? ACTION_CONFIG.modified;
}

// ---------------------------------------------------------------------------
// フィールド変更セル
// ---------------------------------------------------------------------------

const FieldChangeRow = memo(function FieldChangeRow({ fc, action }: { fc: FieldChange; action: string }) {
  const isAdd = action === "added";
  const isDel = action === "removed";
  const changed = !fc.semanticEqual && !isAdd && !isDel;

  return (
    <div className="grid grid-cols-[110px_1fr_24px_1fr] items-baseline gap-x-2 border-t border-border/20 px-3 py-2 text-[12px] leading-relaxed transition-colors hover:bg-muted/30">
      {/* ラベル */}
      <span className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground" title={fc.field}>
        {fc.label}
      </span>

      {/* 旧値 */}
      <span
        className={cn(
          "font-mono break-all rounded px-1.5 py-0.5",
          isDel && "bg-rose-500/10 text-rose-700 dark:text-rose-300",
          changed && fc.oldValue !== "-" && "bg-rose-500/8 text-rose-700/80 dark:text-rose-300/80 line-through decoration-rose-400/40",
          !isDel && !changed && "text-muted-foreground",
        )}
      >
        {fc.oldValue}
      </span>

      {/* 矢印 */}
      <span className="flex items-center justify-center">
        {!fc.semanticEqual || isAdd || isDel ? (
          <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
        ) : (
          <span className="text-muted-foreground/30">=</span>
        )}
      </span>

      {/* 新値 */}
      <span
        className={cn(
          "font-mono break-all rounded px-1.5 py-0.5",
          isAdd && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          changed && fc.newValue !== "-" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold",
          !isAdd && !changed && "text-muted-foreground",
        )}
      >
        {fc.newValue}
      </span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// カラム変更カード
// ---------------------------------------------------------------------------

const ColumnChangeCard = memo(function ColumnChangeCard({
  col,
  index,
}: {
  col: StructuredColumnChange;
  index: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const cfg = getActionConfig(col.action);
  const ActionIcon = cfg.icon;

  const changedCount = col.fieldChanges.filter((fc) => !fc.semanticEqual).length;
  const isRename = col.action === "renamed" || col.action === "rename_suggest";

  return (
    <div
      className={cn(
        "rounded-lg border transition-all duration-150",
        cfg.border,
        cfg.bg,
      )}
    >
      {/* カラムヘッダー */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors rounded-t-lg"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <ActionIcon className={cn("h-3.5 w-3.5 shrink-0", cfg.text)} />
        <span className="min-w-0 flex-1">
          <span className="font-mono text-[12px] font-semibold">
            {isRename && col.oldDisplayName ? (
              <>
                <span className="text-rose-600 dark:text-rose-300 line-through decoration-rose-400/50">{col.oldDisplayName}</span>
                <ArrowRight className="inline h-3 w-3 mx-1 text-muted-foreground" />
                <span className="text-emerald-600 dark:text-emerald-300">{col.displayName}</span>
              </>
            ) : (
              col.displayName
            )}
          </span>
        </span>
        <Badge variant="outline" className={cn("text-[10px] shrink-0", cfg.badge)}>
          {cfg.label}
        </Badge>
        {changedCount > 0 && col.action !== "added" && col.action !== "removed" && (
          <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">
            {changedCount} 変更
          </Badge>
        )}
        {col.confidence !== undefined && (
          <Badge variant="outline" className="text-[10px] shrink-0 font-mono text-muted-foreground">
            {(col.confidence * 100).toFixed(0)}%
          </Badge>
        )}
        {col.requiresConfirmation && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        )}
      </button>

      {/* フィールド詳細 */}
      {expanded && col.fieldChanges.length > 0 && (
        <div className="border-t border-border/30 bg-background/60">
          {col.fieldChanges.map((fc) => (
            <FieldChangeRow key={fc.field} fc={fc} action={col.action} />
          ))}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// テーブルヘッダーサマリ
// ---------------------------------------------------------------------------

const TableSummaryHeader = memo(function TableSummaryHeader({
  entry,
}: {
  entry: StructuredDiffEntry;
}) {
  const cfg = getActionConfig(entry.action);
  const ActionIcon = cfg.icon;

  const addedCols = entry.columnChanges.filter((c) => c.action === "added").length;
  const removedCols = entry.columnChanges.filter((c) => c.action === "removed").length;
  const modifiedCols = entry.columnChanges.filter((c) => c.action === "modified").length;
  const renamedCols = entry.columnChanges.filter((c) => c.action === "renamed" || c.action === "rename_suggest").length;

  return (
    <div className={cn("rounded-xl border px-4 py-4 shadow-sm", cfg.border, cfg.bg)}>
      {/* テーブル識別 */}
      <div className="flex items-center gap-2.5">
        <ActionIcon className={cn("h-4.5 w-4.5 shrink-0", cfg.text)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-bold tracking-tight">{entry.tableName}</span>
            <Badge variant="outline" className={cn("text-[10px]", cfg.badge)}>
              {cfg.label}
            </Badge>
            {entry.confidence !== undefined && (
              <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                信頼度 {(entry.confidence * 100).toFixed(0)}%
              </Badge>
            )}
            {entry.requiresConfirmation && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400/30 bg-amber-500/10">
                <AlertTriangle className="h-3 w-3 mr-1" />
                要確認
              </Badge>
            )}
          </div>
          {entry.logicalName && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{entry.logicalName}</p>
          )}
          {entry.sheetName && (
            <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">sheet/{entry.sheetName}</p>
          )}
        </div>
      </div>

      {/* カラム変更サマリーバッジ */}
      {entry.columnChanges.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-border/20">
          <span className="text-[10px] text-muted-foreground mr-1">列変更:</span>
          {addedCols > 0 && (
            <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-400/30 dark:text-emerald-300">
              +{addedCols} 追加
            </Badge>
          )}
          {removedCols > 0 && (
            <Badge variant="outline" className="text-[10px] text-rose-700 border-rose-400/30 dark:text-rose-300">
              -{removedCols} 削除
            </Badge>
          )}
          {modifiedCols > 0 && (
            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-400/30 dark:text-amber-300">
              ~{modifiedCols} 変更
            </Badge>
          )}
          {renamedCols > 0 && (
            <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-400/30 dark:text-blue-300">
              R{renamedCols} 改名
            </Badge>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/20 pt-3">
        <div className="rounded-lg border border-border/40 bg-background/60 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Table Fields</p>
          <p className="mt-1 font-mono text-sm">{entry.tableFieldChanges.filter((item) => !item.semanticEqual).length}</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-background/60 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Column Changes</p>
          <p className="mt-1 font-mono text-sm">{entry.columnChanges.length}</p>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// テーブルレベルフィールド変更
// ---------------------------------------------------------------------------

const TableFieldChanges = memo(function TableFieldChanges({
  changes,
  action,
}: {
  changes: FieldChange[];
  action: string;
}) {
  const visibleChanges = changes.filter((fc) => !fc.semanticEqual || action === "added" || action === "removed");
  if (visibleChanges.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border/40 bg-muted/20">
      <div className="border-b border-border/30 bg-muted/30 px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Table Delta</span>
      </div>
      {visibleChanges.map((fc) => (
        <FieldChangeRow key={fc.field} fc={fc} action={action} />
      ))}
    </div>
  );
});

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export const StructuredDiffContent = memo(function StructuredDiffContent({
  entry,
  className,
}: StructuredDiffContentProps) {
  const sortedColumns = useMemo(() => {
    const order: Record<string, number> = {
      removed: 0,
      rename_suggest: 1,
      renamed: 2,
      modified: 3,
      changed: 3,
      added: 4,
    };
    return [...entry.columnChanges].sort(
      (a, b) => (order[a.action] ?? 5) - (order[b.action] ?? 5),
    );
  }, [entry.columnChanges]);

  if (entry.columnChanges.length === 0 && entry.tableFieldChanges.length === 0) {
    return (
      <div className={cn("flex h-full items-center justify-center text-sm text-muted-foreground", className)}>
        構造変更なし
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.08),transparent_40%)]", className)}>
      <div className="space-y-3 p-4">
        <div className="rounded-xl border border-dashed border-border/50 bg-background/70 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Review Surface</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Semantic deltas are grouped by table fields first, then by column-level change cards.
          </p>
        </div>

        {/* テーブルサマリヘッダー */}
        <TableSummaryHeader entry={entry} />

        {/* テーブルレベルの変更 */}
        <TableFieldChanges changes={entry.tableFieldChanges} action={entry.action} />

        {/* カラムレベルの変更 */}
        {sortedColumns.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                カラム変更 ({sortedColumns.length})
              </span>
              <div className="flex-1 border-t border-border/30" />
            </div>
            {sortedColumns.map((col, index) => (
              <ColumnChangeCard
                key={col.entityKey ?? `col-${index}`}
                col={col}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
});
