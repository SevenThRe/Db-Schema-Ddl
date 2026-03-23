/**
 * Web Worker ベースの差分計算フック
 *
 * diffLines 等の重い計算をメインスレッドからオフロードし、
 * 計算完了後に結果を返す。Worker 未対応環境では同期フォールバック。
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { DiffLineData, DiffHunk } from "./types";
import { computeLineDiff, groupIntoHunks, countDiffStats } from "./diff-algorithm";

interface DiffResult {
  lines: DiffLineData[];
  hunks: DiffHunk[];
  stats: { added: number; removed: number };
}

interface DiffWorkerResponse {
  id: number;
  lines: DiffLineData[];
  hunks: DiffHunk[];
  stats: { added: number; removed: number };
}

let workerInstance: Worker | null = null;
let workerFailed = false;

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (workerInstance) return workerInstance;
  try {
    workerInstance = new Worker(
      new URL("./diff-worker.ts", import.meta.url),
      { type: "module" },
    );
    workerInstance.onerror = () => {
      workerFailed = true;
      workerInstance = null;
    };
    return workerInstance;
  } catch {
    workerFailed = true;
    return null;
  }
}

let nextId = 0;

/**
 * 非同期差分計算フック
 *
 * oldText/newText が変化するたびにWorkerで差分を計算する。
 * 計算中は前回の結果を保持し、loading フラグを true にする。
 */
export function useDiffWorker(
  oldText: string,
  newText: string,
  contextLines = 3,
): { result: DiffResult | null; loading: boolean } {
  const [result, setResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const pendingIdRef = useRef<number | null>(null);

  const computeSync = useCallback(() => {
    const lines = computeLineDiff(oldText, newText);
    const hunks = groupIntoHunks(lines, contextLines);
    const stats = countDiffStats(lines);
    setResult({ lines, hunks, stats });
    setLoading(false);
  }, [oldText, newText, contextLines]);

  useEffect(() => {
    if (!oldText && !newText) {
      setResult({ lines: [], hunks: [], stats: { added: 0, removed: 0 } });
      setLoading(false);
      return;
    }

    const worker = getWorker();
    if (!worker) {
      computeSync();
      return;
    }

    setLoading(true);
    const id = ++nextId;
    pendingIdRef.current = id;

    const handler = (event: MessageEvent<DiffWorkerResponse>) => {
      if (event.data.id === id) {
        setResult({
          lines: event.data.lines,
          hunks: event.data.hunks,
          stats: event.data.stats,
        });
        setLoading(false);
        pendingIdRef.current = null;
      }
    };

    worker.addEventListener("message", handler);
    worker.postMessage({ id, oldText, newText, contextLines });

    return () => {
      worker.removeEventListener("message", handler);
      if (pendingIdRef.current === id) {
        pendingIdRef.current = null;
      }
    };
  }, [oldText, newText, contextLines, computeSync]);

  return { result, loading };
}
