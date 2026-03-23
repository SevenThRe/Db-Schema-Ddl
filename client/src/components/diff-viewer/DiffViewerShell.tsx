/**
 * 差分ビューアシェル
 *
 * メインシェルコンポーネント。左側のファイルツリー、ヘッダー、差分コンテンツを統合する。
 * Structured（構造化差分）タブとDDL Diff タブの切替をサポートする。
 */

import { memo, useMemo, useState } from "react";
import type { DiffViewerShellProps, DiffTabMode } from "./types";
import { DiffFileTree } from "./DiffFileTree";
import { DiffHeader } from "./DiffHeader";
import { StructuredDiffContent } from "./StructuredDiffContent";
import { MonacoDdlDiff } from "./MonacoDdlDiff";
import { cn } from "@/lib/utils";
import { Layers, Code2 } from "lucide-react";

export const DiffViewerShell = memo(function DiffViewerShell({
  tables,
  selectedTableKey,
  onSelectTable,
  viewMode,
  onViewModeChange,
  className,
}: DiffViewerShellProps) {
  const [tabMode, setTabMode] = useState<DiffTabMode>("structured");

  const selectedTable = useMemo(
    () => tables.find((t) => t.key === selectedTableKey) ?? null,
    [tables, selectedTableKey],
  );

  /** 構造化エントリが利用可能か */
  const hasStructured = Boolean(selectedTable?.structuredEntry);

  /** 実効タブ（構造化データがなければDDLにフォールバック） */
  const effectiveTab = hasStructured ? tabMode : "ddl";

  if (tables.length === 0) {
    return (
      <div className={cn("flex h-full items-center justify-center text-sm text-muted-foreground", className)}>
        差分データがありません。まず比較を実行してください。
      </div>
    );
  }

  return (
    <div className={cn("flex h-full overflow-hidden rounded-md border border-border", className)}>
      {/* 左側：ファイルツリー */}
      <div className="w-[260px] shrink-0 border-r border-border bg-background">
        <DiffFileTree
          tables={tables}
          selectedTableKey={selectedTableKey}
          onSelectTable={onSelectTable}
        />
      </div>

      {/* 右側：差分コンテンツ */}
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {selectedTable ? (
          <>
            {/* ヘッダー + タブ切替 */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-slate-50 px-3 py-1.5 dark:bg-slate-800/50">
              <DiffHeader
                tableName={selectedTable.tableName}
                logicalName={selectedTable.logicalName}
                action={selectedTable.action}
                addedLines={selectedTable.addedLines}
                removedLines={selectedTable.removedLines}
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
              />
            </div>

            {/* タブバー */}
            <div className="flex shrink-0 items-center gap-0.5 border-b border-border/50 bg-muted/30 px-2 py-1">
              <button
                type="button"
                onClick={() => setTabMode("structured")}
                disabled={!hasStructured}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                  effectiveTab === "structured"
                    ? "bg-background text-foreground shadow-sm border border-border/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  !hasStructured && "opacity-40 cursor-not-allowed",
                )}
              >
                <Layers className="h-3 w-3" />
                Structured
              </button>
              <button
                type="button"
                onClick={() => setTabMode("ddl")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                  effectiveTab === "ddl"
                    ? "bg-background text-foreground shadow-sm border border-border/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Code2 className="h-3 w-3" />
                DDL Diff
              </button>
            </div>

            {/* コンテンツ */}
            <div className="flex-1 overflow-hidden">
              {effectiveTab === "structured" && selectedTable.structuredEntry ? (
                <StructuredDiffContent entry={selectedTable.structuredEntry} />
              ) : (
                <MonacoDdlDiff
                  oldValue={selectedTable.oldDdl}
                  newValue={selectedTable.newDdl}
                  sideBySide={viewMode === "side-by-side"}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            左側のツリーからテーブルを選択してください
          </div>
        )}
      </div>
    </div>
  );
});
