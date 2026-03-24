// ResultExportMenu — 結果エクスポートメニュー
//
// 3モードエクスポート（EXEC-04 + REVIEW FIX）:
//   1. Current page — 読み込み済み行のみ（クライアントサイド変換）
//   2. All rows (re-execute) — バックエンドで再実行してすべての行を取得
//   3. 自動マージ — totalRows <= 読み込み済み行数の場合は単一 Export のみ表示

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DbQueryBatchResult, DbQueryColumn } from "@shared/schema";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

export type ExportFormat = "json" | "csv" | "markdown" | "sql-insert";

export interface ResultExportMenuProps {
  /** エクスポート対象のバッチ */
  batch: DbQueryBatchResult;
  /** 現在ページ（読み込み済み行）のエクスポートコールバック */
  onExportCurrentPage: (format: ExportFormat) => void;
  /** 全行（再実行）エクスポートコールバック */
  onExportFull: (format: ExportFormat) => void;
}

// ──────────────────────────────────────────────
// クライアントサイドエクスポート変換ロジック
// ──────────────────────────────────────────────

/** 文字列中のカンマ・クォートを含む CSV セルを安全にクォートする */
function csvEscapeCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** SQL INSERT 用の文字列エスケープ（シングルクォートを重ねる） */
function sqlEscapeString(value: string): string {
  return value.replace(/'/g, "''");
}

/** バッチデータを指定フォーマットの文字列に変換する（クライアントサイド） */
export function serializeBatch(
  batch: DbQueryBatchResult,
  format: ExportFormat,
  tableName?: string,
): string {
  const { columns, rows } = batch;

  switch (format) {
    case "csv": {
      // ヘッダー行 + データ行をカンマ区切りで出力
      const header = columns.map((c) => csvEscapeCell(c.name)).join(",");
      const dataRows = rows.map((row) =>
        row.values
          .map((v) => (v === null ? "" : csvEscapeCell(String(v))))
          .join(","),
      );
      return [header, ...dataRows].join("\n");
    }

    case "json": {
      // オブジェクト配列（カラム名をキーとして使用）
      const objects = rows.map((row) =>
        Object.fromEntries(
          columns.map((col, i) => [col.name, row.values[i]]),
        ),
      );
      return JSON.stringify(objects, null, 2);
    }

    case "markdown": {
      // GitHub Flavored Markdown テーブル形式
      const colNames = columns.map((c) => c.name);
      const header = `| ${colNames.join(" | ")} |`;
      const separator = `| ${colNames.map(() => "---").join(" | ")} |`;
      const dataRows = rows.map(
        (row) =>
          `| ${row.values.map((v) => (v === null ? "" : String(v))).join(" | ")} |`,
      );
      return [header, separator, ...dataRows].join("\n");
    }

    case "sql-insert": {
      // INSERT INTO ... VALUES ... 形式（1行1ステートメント）
      const tbl = tableName ?? "table_name";
      const colList = columns.map((c) => c.name).join(", ");
      const statements = rows.map((row) => {
        const valueList = row.values
          .map((v) => {
            if (v === null) return "NULL";
            if (typeof v === "number" || typeof v === "boolean") return String(v);
            return `'${sqlEscapeString(String(v))}'`;
          })
          .join(", ");
        return `INSERT INTO ${tbl} (${colList}) VALUES (${valueList});`;
      });
      return statements.join("\n");
    }
  }
}

/** ブラウザダウンロードをトリガーする */
function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** フォーマットに対応する MIME タイプを返す */
function getMimeType(format: ExportFormat): string {
  switch (format) {
    case "csv":
      return "text/csv;charset=utf-8";
    case "json":
      return "application/json;charset=utf-8";
    case "markdown":
      return "text/markdown;charset=utf-8";
    case "sql-insert":
      return "text/plain;charset=utf-8";
  }
}

/** フォーマットに対応するファイル拡張子を返す */
function getExtension(format: ExportFormat): string {
  switch (format) {
    case "csv":
      return "csv";
    case "json":
      return "json";
    case "markdown":
      return "md";
    case "sql-insert":
      return "sql";
  }
}

// ──────────────────────────────────────────────
// フォーマット選択サブメニューアイテム
// ──────────────────────────────────────────────

const FORMAT_OPTIONS: { label: string; value: ExportFormat }[] = [
  { label: "CSV", value: "csv" },
  { label: "JSON", value: "json" },
  { label: "Markdown", value: "markdown" },
  { label: "SQL INSERT", value: "sql-insert" },
];

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

/**
 * ResultExportMenu — 3モードエクスポートドロップダウン
 *
 * - Current page: 読み込み済み行のみをクライアントサイドで変換
 * - All rows (re-execute): バックエンド経由で全行を再取得
 * - 自動: totalRows <= 読み込み済み → Current page が All rows と同一なので単一表示
 */
export function ResultExportMenu({
  batch,
  onExportCurrentPage,
  onExportFull,
}: ResultExportMenuProps) {
  // 全行が読み込み済みかどうか（totalRows <= 読み込み済み行数）
  const allLoaded = batch.totalRows <= batch.rows.length;

  // 現在ページエクスポートのハンドラー（クライアントサイド）
  const handleCurrentPage = (format: ExportFormat) => {
    const content = serializeBatch(batch, format);
    const ext = getExtension(format);
    triggerDownload(content, `export.${ext}`, getMimeType(format));
    onExportCurrentPage(format);
  };

  // 全行エクスポートのハンドラー（バックエンド再実行）
  const handleFull = (format: ExportFormat) => {
    onExportFull(format);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex h-6 items-center gap-1.5 px-2 text-xs"
        >
          <Download className="h-3 w-3" />
          <span>Export</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {allLoaded ? (
          // すべての行が読み込み済み — スコープ区別不要（単一 Export セクション）
          <>
            <DropdownMenuLabel className="text-xs font-semibold">
              Export
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {FORMAT_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                className="text-xs"
                onClick={() => handleCurrentPage(opt.value)}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </>
        ) : (
          // 一部のみ読み込み済み — Current page と All rows (re-execute) を分けて表示
          <>
            {/* セクション1: Current page */}
            <DropdownMenuLabel className="text-xs font-semibold">
              Current page
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {FORMAT_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={`current-${opt.value}`}
                className="text-xs"
                onClick={() => handleCurrentPage(opt.value)}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />

            {/* セクション2: All rows (re-execute) */}
            <DropdownMenuLabel className="text-xs font-semibold">
              All rows (re-execute)
            </DropdownMenuLabel>
            <div className="px-2 py-1 text-[10px] text-muted-foreground">
              This will re-execute the query to fetch all{" "}
              {batch.totalRows.toLocaleString()} rows.
            </div>
            <DropdownMenuSeparator />
            {FORMAT_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={`full-${opt.value}`}
                className="text-xs"
                onClick={() => handleFull(opt.value)}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
