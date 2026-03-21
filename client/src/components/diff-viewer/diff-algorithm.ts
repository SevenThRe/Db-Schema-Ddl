/**
 * 行レベル差分アルゴリズム
 *
 * jsdiff (diff npm パッケージ) を使用して旧/新DDLテキストの行単位差分を計算し、
 * 折りたたみ可能なハンクに分割する。
 */

import { diffLines } from "diff";
import type { DiffLineData, DiffHunk } from "./types";

/**
 * 2つのテキストの行レベル差分を計算する
 *
 * @param oldText - 旧DDLテキスト
 * @param newText - 新DDLテキスト
 * @returns 差分行データの配列
 */
export function computeLineDiff(oldText: string, newText: string): DiffLineData[] {
  const changes = diffLines(oldText, newText, { newlineIsToken: false });
  const lines: DiffLineData[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const change of changes) {
    const changeLines = change.value.replace(/\n$/, "").split("\n");

    for (const content of changeLines) {
      if (change.added) {
        lines.push({ type: "added", oldLineNumber: null, newLineNumber: newLine, content });
        newLine += 1;
      } else if (change.removed) {
        lines.push({ type: "removed", oldLineNumber: oldLine, newLineNumber: null, content });
        oldLine += 1;
      } else {
        lines.push({ type: "unchanged", oldLineNumber: oldLine, newLineNumber: newLine, content });
        oldLine += 1;
        newLine += 1;
      }
    }
  }

  return lines;
}

/**
 * 差分行をハンクに分割する
 *
 * 連続する未変更行が contextLines * 2 を超える場合、折りたたみ可能なハンクに変換する。
 * 変更行の前後に contextLines 行のコンテキストを保持する。
 *
 * @param lines - 差分行データの配列
 * @param contextLines - 変更行前後に表示するコンテキスト行数（デフォルト: 3）
 * @returns ハンクの配列
 */
export function groupIntoHunks(lines: DiffLineData[], contextLines = 3): DiffHunk[] {
  if (lines.length === 0) return [];

  // 全行が未変更の場合
  const hasChanges = lines.some((line) => line.type !== "unchanged");
  if (!hasChanges) {
    if (lines.length <= contextLines * 2) {
      return [{ type: "changed", lines }];
    }
    return [
      { type: "changed", lines: lines.slice(0, contextLines) },
      { type: "collapsed", lines: lines.slice(contextLines, -contextLines), collapsedCount: lines.length - contextLines * 2 },
      { type: "changed", lines: lines.slice(-contextLines) },
    ];
  }

  // 変更行のインデックスを収集
  const changedIndexes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== "unchanged") {
      changedIndexes.push(i);
    }
  }

  const hunks: DiffHunk[] = [];
  let cursor = 0;

  for (let ci = 0; ci < changedIndexes.length; ) {
    // 連続する変更のグループを見つける
    let groupStart = changedIndexes[ci];
    let groupEnd = changedIndexes[ci];

    while (ci + 1 < changedIndexes.length && changedIndexes[ci + 1] - groupEnd <= contextLines * 2 + 1) {
      ci += 1;
      groupEnd = changedIndexes[ci];
    }
    ci += 1;

    // グループ前のコンテキスト開始位置
    const contextStart = Math.max(cursor, groupStart - contextLines);
    // グループ後のコンテキスト終了位置
    const contextEnd = Math.min(lines.length, groupEnd + contextLines + 1);

    // cursor〜contextStart間の未変更行を折りたたむ
    if (contextStart > cursor) {
      const collapsedLines = lines.slice(cursor, contextStart);
      hunks.push({
        type: "collapsed",
        lines: collapsedLines,
        collapsedCount: collapsedLines.length,
      });
    }

    // コンテキスト付きの変更ハンク
    hunks.push({
      type: "changed",
      lines: lines.slice(contextStart, contextEnd),
    });

    cursor = contextEnd;
  }

  // 残りの未変更行を折りたたむ
  if (cursor < lines.length) {
    const remaining = lines.slice(cursor);
    hunks.push({
      type: "collapsed",
      lines: remaining,
      collapsedCount: remaining.length,
    });
  }

  return hunks;
}

/**
 * 差分の追加行数と削除行数をカウントする
 */
export function countDiffStats(lines: DiffLineData[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === "added") added += 1;
    if (line.type === "removed") removed += 1;
  }
  return { added, removed };
}
