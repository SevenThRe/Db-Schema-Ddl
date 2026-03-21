/**
 * 折りたたみ可能な未変更セクション
 *
 * 連続する未変更行を折りたたんで表示し、クリックで展開する。
 * VS Codeの "Expand N hidden lines" と同等の機能。
 */

import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { DiffLineData, DiffViewMode } from "./types";
import { DiffLineRow, UnifiedDiffLineRow } from "./DiffLine";
import { cn } from "@/lib/utils";

interface CollapsibleUnchangedProps {
  lines: DiffLineData[];
  collapsedCount: number;
  viewMode: DiffViewMode;
}

export const CollapsibleUnchanged = memo(function CollapsibleUnchanged({
  lines,
  collapsedCount,
  viewMode,
}: CollapsibleUnchangedProps) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <div>
        {lines.map((line, i) =>
          viewMode === "unified" ? (
            <UnifiedDiffLineRow key={`expanded-${i}`} line={line} />
          ) : (
            <div key={`expanded-${i}`} className="flex">
              <div className="w-1/2 border-r border-border/20">
                <DiffLineRow line={line} side="old" />
              </div>
              <div className="w-1/2">
                <DiffLineRow line={line} side="new" />
              </div>
            </div>
          ),
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className={cn(
        "flex w-full items-center gap-2 border-y border-border/30 px-4 py-1",
        "bg-blue-50/60 text-blue-600 hover:bg-blue-100/60",
        "dark:bg-blue-950/20 dark:text-blue-400 dark:hover:bg-blue-950/40",
        "text-[11px] font-medium transition-colors",
      )}
    >
      <ChevronRight className="h-3 w-3" />
      <span>Expand {collapsedCount} hidden lines</span>
    </button>
  );
});
