/**
 * ユニファイド差分レイアウト
 *
 * git diffスタイルの単一カラム表示。
 * 旧/新両方の行番号を左ガターに表示し、
 * 削除行と追加行を交互に表示する。
 */

import { memo } from "react";
import type { DiffHunk } from "./types";
import { UnifiedDiffLineRow } from "./DiffLine";
import { CollapsibleUnchanged } from "./CollapsibleUnchanged";

interface UnifiedDiffProps {
  hunks: DiffHunk[];
}

export const UnifiedDiff = memo(function UnifiedDiff({ hunks }: UnifiedDiffProps) {
  return (
    <div className="min-w-0">
      {hunks.map((hunk, hunkIndex) => {
        if (hunk.type === "collapsed") {
          return (
            <CollapsibleUnchanged
              key={`collapsed-${hunkIndex}`}
              lines={hunk.lines}
              collapsedCount={hunk.collapsedCount ?? hunk.lines.length}
              viewMode="unified"
            />
          );
        }

        return (
          <div key={`hunk-${hunkIndex}`}>
            {hunk.lines.map((line, lineIndex) => (
              <UnifiedDiffLineRow key={`line-${hunkIndex}-${lineIndex}`} line={line} />
            ))}
          </div>
        );
      })}
    </div>
  );
});
