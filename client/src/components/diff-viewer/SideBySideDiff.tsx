/**
 * サイドバイサイド差分レイアウト
 *
 * 左側に旧DDL、右側に新DDLを並べて表示する。
 * 各行は旧/新で対応付けされ、追加行は右側のみ、削除行は左側のみに表示される。
 */

import { memo } from "react";
import type { DiffHunk, DiffLineData } from "./types";
import { DiffLineRow } from "./DiffLine";
import { CollapsibleUnchanged } from "./CollapsibleUnchanged";

interface SideBySideDiffProps {
  hunks: DiffHunk[];
}

/** 空行（対応する行がない場合のプレースホルダー） */
const EMPTY_LINE: DiffLineData = {
  type: "unchanged",
  oldLineNumber: null,
  newLineNumber: null,
  content: "",
};

/**
 * 差分行をサイドバイサイド用のペアに整列する
 *
 * 連続する削除行と追加行をペアにし、
 * 対応がない場合は空行で埋める。
 */
function alignLines(lines: DiffLineData[]): Array<{ old: DiffLineData; new: DiffLineData }> {
  const pairs: Array<{ old: DiffLineData; new: DiffLineData }> = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type === "unchanged") {
      pairs.push({ old: line, new: line });
      i += 1;
      continue;
    }

    // 連続する削除行を収集
    const removedBlock: DiffLineData[] = [];
    while (i < lines.length && lines[i].type === "removed") {
      removedBlock.push(lines[i]);
      i += 1;
    }

    // 連続する追加行を収集
    const addedBlock: DiffLineData[] = [];
    while (i < lines.length && lines[i].type === "added") {
      addedBlock.push(lines[i]);
      i += 1;
    }

    // ペアにする（長い方に合わせて空行で埋める）
    const maxLen = Math.max(removedBlock.length, addedBlock.length);
    for (let j = 0; j < maxLen; j++) {
      pairs.push({
        old: removedBlock[j] || EMPTY_LINE,
        new: addedBlock[j] || EMPTY_LINE,
      });
    }
  }

  return pairs;
}

export const SideBySideDiff = memo(function SideBySideDiff({ hunks }: SideBySideDiffProps) {
  return (
    <div className="min-w-0">
      {hunks.map((hunk, hunkIndex) => {
        if (hunk.type === "collapsed") {
          return (
            <CollapsibleUnchanged
              key={`collapsed-${hunkIndex}`}
              lines={hunk.lines}
              collapsedCount={hunk.collapsedCount ?? hunk.lines.length}
              viewMode="side-by-side"
            />
          );
        }

        const pairs = alignLines(hunk.lines);
        return (
          <div key={`hunk-${hunkIndex}`}>
            {pairs.map((pair, pairIndex) => (
              <div key={`pair-${hunkIndex}-${pairIndex}`} className="flex">
                <div className="w-1/2 border-r border-border/20">
                  <DiffLineRow line={pair.old} side="old" />
                </div>
                <div className="w-1/2">
                  <DiffLineRow line={pair.new} side="new" />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
});
