/**
 * 差分コンテンツ切替コントローラ
 *
 * viewModeに応じてSideBySideDiffまたはUnifiedDiffを切り替える。
 * 空の差分データの場合は適切なメッセージを表示する。
 */

import { memo } from "react";
import type { DiffContentProps } from "./types";
import { SideBySideDiff } from "./SideBySideDiff";
import { UnifiedDiff } from "./UnifiedDiff";
import { ScrollArea } from "@/components/ui/scroll-area";

export const DiffContent = memo(function DiffContent({ hunks, viewMode, oldTitle, newTitle }: DiffContentProps) {
  if (hunks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        差分データがありません
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* サイドバイサイドモードのカラムヘッダー */}
      {viewMode === "side-by-side" ? (
        <div className="flex shrink-0 border-b border-border/50 bg-slate-50 dark:bg-slate-800/50">
          <div className="w-1/2 border-r border-border/20 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
            {oldTitle || "--- a/ (旧)"}
          </div>
          <div className="w-1/2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
            {newTitle || "+++ b/ (新)"}
          </div>
        </div>
      ) : null}

      {/* 差分コンテンツ */}
      <ScrollArea className="flex-1">
        {viewMode === "side-by-side" ? (
          <SideBySideDiff hunks={hunks} />
        ) : (
          <UnifiedDiff hunks={hunks} />
        )}
      </ScrollArea>
    </div>
  );
});
