/**
 * 差分行コンポーネント
 *
 * 1行分の差分データをレンダリングする。
 * 行番号、プレフィックス記号、SQLシンタックスハイライトを含む。
 */

import { memo } from "react";
import { tokenizeSql, SQL_TOKEN_LIGHT_CLASSES } from "./sql-tokenizer";
import type { DiffLineData } from "./types";
import { cn } from "@/lib/utils";

interface DiffLineProps {
  line: DiffLineData;
  /** サイドバイサイドモードでの表示側 */
  side?: "old" | "new";
}

/** 行タイプに応じた背景色クラス */
const LINE_BG_CLASSES: Record<DiffLineData["type"], string> = {
  added: "bg-green-50 dark:bg-emerald-950/30",
  removed: "bg-red-50 dark:bg-red-950/30",
  unchanged: "bg-transparent",
};

/** 行番号ガターの背景色 */
const GUTTER_BG_CLASSES: Record<DiffLineData["type"], string> = {
  added: "bg-green-100 dark:bg-emerald-900/40",
  removed: "bg-red-100 dark:bg-red-900/40",
  unchanged: "bg-slate-50 dark:bg-slate-800/50",
};

/** プレフィックス記号 */
const PREFIX_MAP: Record<DiffLineData["type"], string> = {
  added: "+",
  removed: "-",
  unchanged: " ",
};

/** プレフィックスの色 */
const PREFIX_COLOR: Record<DiffLineData["type"], string> = {
  added: "text-green-600 dark:text-emerald-400",
  removed: "text-red-600 dark:text-red-400",
  unchanged: "text-transparent",
};

/**
 * 差分行のレンダリング
 *
 * サイドバイサイドモードではold/newの片側の行番号のみ表示し、
 * ユニファイドモードでは両側の行番号を表示する。
 */
export const DiffLineRow = memo(function DiffLineRow({ line, side }: DiffLineProps) {
  const lineNumber = side === "old" ? line.oldLineNumber : side === "new" ? line.newLineNumber : null;
  const tokens = tokenizeSql(line.content);

  return (
    <div className={cn("flex min-h-[24px] font-mono text-[12px] leading-6", LINE_BG_CLASSES[line.type])}>
      {/* 行番号ガター */}
      <div
        className={cn(
          "w-[52px] shrink-0 select-none border-r border-border/30 pr-2 text-right text-[11px] text-slate-400 dark:text-slate-500",
          GUTTER_BG_CLASSES[line.type],
        )}
      >
        {lineNumber ?? ""}
      </div>

      {/* プレフィックス記号 */}
      <div className={cn("w-5 shrink-0 select-none text-center font-semibold", PREFIX_COLOR[line.type])}>
        {PREFIX_MAP[line.type]}
      </div>

      {/* コンテンツ（シンタックスハイライト付き） */}
      <div className="min-w-0 flex-1 whitespace-pre overflow-x-auto pr-4">
        {tokens.map((token, i) => (
          <span key={i} className={SQL_TOKEN_LIGHT_CLASSES[token.type]}>
            {token.text}
          </span>
        ))}
      </div>
    </div>
  );
});

/**
 * ユニファイド差分行（両側の行番号を表示）
 */
export const UnifiedDiffLineRow = memo(function UnifiedDiffLineRow({ line }: { line: DiffLineData }) {
  const tokens = tokenizeSql(line.content);

  return (
    <div className={cn("flex min-h-[24px] font-mono text-[12px] leading-6", LINE_BG_CLASSES[line.type])}>
      {/* 旧行番号 */}
      <div
        className={cn(
          "w-[48px] shrink-0 select-none border-r border-border/30 pr-2 text-right text-[11px] text-slate-400 dark:text-slate-500",
          GUTTER_BG_CLASSES[line.type],
        )}
      >
        {line.oldLineNumber ?? ""}
      </div>

      {/* 新行番号 */}
      <div
        className={cn(
          "w-[48px] shrink-0 select-none border-r border-border/30 pr-2 text-right text-[11px] text-slate-400 dark:text-slate-500",
          GUTTER_BG_CLASSES[line.type],
        )}
      >
        {line.newLineNumber ?? ""}
      </div>

      {/* プレフィックス */}
      <div className={cn("w-5 shrink-0 select-none text-center font-semibold", PREFIX_COLOR[line.type])}>
        {PREFIX_MAP[line.type]}
      </div>

      {/* コンテンツ */}
      <div className="min-w-0 flex-1 whitespace-pre overflow-x-auto pr-4">
        {tokens.map((token, i) => (
          <span key={i} className={SQL_TOKEN_LIGHT_CLASSES[token.type]}>
            {token.text}
          </span>
        ))}
      </div>
    </div>
  );
});
