/**
 * 差分計算 Web Worker
 *
 * diffLines / groupIntoHunks / countDiffStats をメインスレッドから
 * オフロードし、UIジャンクを防止する。
 */

import { diffLines } from "diff";

// ---------------------------------------------------------------------------
// 型定義（Worker 内で使う軽量版 — main 側の types.ts と同一構造）
// ---------------------------------------------------------------------------

interface DiffLineData {
  type: "added" | "removed" | "unchanged";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
}

interface DiffHunk {
  type: "changed" | "collapsed";
  lines: DiffLineData[];
  collapsedCount?: number;
}

interface DiffWorkerRequest {
  id: number;
  oldText: string;
  newText: string;
  contextLines?: number;
}

interface DiffWorkerResponse {
  id: number;
  lines: DiffLineData[];
  hunks: DiffHunk[];
  stats: { added: number; removed: number };
}

// ---------------------------------------------------------------------------
// 差分計算ロジック（diff-algorithm.ts と同一）
// ---------------------------------------------------------------------------

function computeLineDiff(oldText: string, newText: string): DiffLineData[] {
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

function groupIntoHunks(lines: DiffLineData[], contextLines = 3): DiffHunk[] {
  if (lines.length === 0) return [];

  const hasChanges = lines.some((l) => l.type !== "unchanged");
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

  const changedIndexes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== "unchanged") changedIndexes.push(i);
  }

  const hunks: DiffHunk[] = [];
  let cursor = 0;

  for (let ci = 0; ci < changedIndexes.length; ) {
    let groupStart = changedIndexes[ci];
    let groupEnd = changedIndexes[ci];
    while (ci + 1 < changedIndexes.length && changedIndexes[ci + 1] - groupEnd <= contextLines * 2 + 1) {
      ci += 1;
      groupEnd = changedIndexes[ci];
    }
    ci += 1;

    const contextStart = Math.max(cursor, groupStart - contextLines);
    const contextEnd = Math.min(lines.length, groupEnd + contextLines + 1);

    if (contextStart > cursor) {
      const collapsedLines = lines.slice(cursor, contextStart);
      hunks.push({ type: "collapsed", lines: collapsedLines, collapsedCount: collapsedLines.length });
    }
    hunks.push({ type: "changed", lines: lines.slice(contextStart, contextEnd) });
    cursor = contextEnd;
  }

  if (cursor < lines.length) {
    const remaining = lines.slice(cursor);
    hunks.push({ type: "collapsed", lines: remaining, collapsedCount: remaining.length });
  }
  return hunks;
}

function countDiffStats(lines: DiffLineData[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === "added") added += 1;
    if (line.type === "removed") removed += 1;
  }
  return { added, removed };
}

// ---------------------------------------------------------------------------
// Worker メッセージハンドラ
// ---------------------------------------------------------------------------

self.onmessage = (event: MessageEvent<DiffWorkerRequest>) => {
  const { id, oldText, newText, contextLines } = event.data;
  const lines = computeLineDiff(oldText, newText);
  const hunks = groupIntoHunks(lines, contextLines);
  const stats = countDiffStats(lines);

  const response: DiffWorkerResponse = { id, lines, hunks, stats };
  (self as unknown as Worker).postMessage(response);
};
