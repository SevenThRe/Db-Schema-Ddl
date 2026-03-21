/**
 * 差分ビューアシェル
 *
 * メインシェルコンポーネント。左側のファイルツリー、ヘッダー、差分コンテンツを統合する。
 * 各差分ビュー（SchemaDiff, DbDiff, DbVsDb, Snapshot）からこのコンポーネントを使用する。
 */

import { memo, useMemo } from "react";
import type { DiffViewerShellProps } from "./types";
import { DiffFileTree } from "./DiffFileTree";
import { DiffHeader } from "./DiffHeader";
import { DiffContent } from "./DiffContent";
import { cn } from "@/lib/utils";

export const DiffViewerShell = memo(function DiffViewerShell({
  tables,
  selectedTableKey,
  onSelectTable,
  viewMode,
  onViewModeChange,
  className,
}: DiffViewerShellProps) {
  const selectedTable = useMemo(
    () => tables.find((t) => t.key === selectedTableKey) ?? null,
    [tables, selectedTableKey],
  );

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
            <DiffHeader
              tableName={selectedTable.tableName}
              logicalName={selectedTable.logicalName}
              action={selectedTable.action}
              addedLines={selectedTable.addedLines}
              removedLines={selectedTable.removedLines}
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
            />
            <div className="flex-1 overflow-hidden">
              <DiffContent
                hunks={selectedTable.diffHunks}
                viewMode={viewMode}
                oldTitle={`--- a/${selectedTable.tableName}`}
                newTitle={`+++ b/${selectedTable.tableName}`}
              />
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
