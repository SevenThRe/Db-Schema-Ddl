// DB 工作台 — SQL エディターペイン（Monaco ベース）
//
// Monaco Editor を使用した SQL 編集エリア。
// キーボードショートカット（Ctrl+Enter / Shift+Ctrl+Enter / Alt+Shift+F / Ctrl+W）を
// addAction() で登録し、エディタースコープ内でのみ有効化する。
//
// 設計原則:
// - ステートメント区切り処理はバックエンド側に委譲（REVIEW FIX 準拠）
//   フロントエンドは「フルSQL + カーソルオフセット」を渡すのみ
// - EXPLAIN 自動検出はリーディングコメント・空白を除去してから EXPLAIN キーワードを判定
// - sql-formatter で Format SQL (Alt+Shift+F) を実装

import { useRef, useCallback } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { format } from "sql-formatter";
import { Play, Lightbulb, AlignLeft, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DbDriver } from "@shared/schema";

// ──────────────────────────────────────────────
// 定数
// ──────────────────────────────────────────────

/** sql-formatter が受け付けるダイアレクト名マッピング */
const SQL_FORMATTER_DIALECT: Record<DbDriver, "mysql" | "postgresql"> = {
  mysql: "mysql",
  postgres: "postgresql",
};

/**
 * EXPLAIN 自動検出用の正規表現。
 * リーディング空白、単一行コメント（-- ...）、ブロックコメント（/* ... *\/）を除去してから
 * EXPLAIN キーワードが先頭にあるかを判定する（REVIEW FIX: D-04 準拠）。
 */
const LEADING_JUNK_PATTERN = /^(\s|--[^\n]*\n?|\/\*[\s\S]*?\*\/)+/i;

// ──────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────

/**
 * SQL テキストのリーディングコメント・空白を除去して返す。
 * EXPLAIN 自動検出で使用する（正規表現の繰り返しマッチで全除去）。
 */
function stripLeadingJunk(sql: string): string {
  let stripped = sql;
  let prev = "";
  // リーディングコメント・空白が消えるまで繰り返す
  while (stripped !== prev) {
    prev = stripped;
    stripped = stripped.replace(LEADING_JUNK_PATTERN, "");
  }
  return stripped;
}

/** 指定 SQL が EXPLAIN クエリかどうかを判定する */
function isExplainQuery(sql: string): boolean {
  const stripped = stripLeadingJunk(sql).trimStart();
  return /^explain\b/i.test(stripped);
}

// ──────────────────────────────────────────────
// プロップ型
// ──────────────────────────────────────────────

export interface SqlEditorPaneProps {
  /** エディターに表示する SQL テキスト */
  sql: string;
  /** 接続のダイアレクト（sql-formatter のダイアレクト選択に使用） */
  dialect: DbDriver;
  /** SQL 変更コールバック */
  onSqlChange: (sql: string) => void;
  /**
   * 選択範囲実行コールバック。
   * - selection が存在する場合: その選択テキストを sql として渡す
   * - 選択なしの場合: フル SQL + カーソルオフセットを渡す（バックエンドがステートメントを特定）
   */
  onExecuteSelection: (sql: string, cursorOffset?: number) => void;
  /** フルスクリプト実行コールバック（Shift+Ctrl+Enter） */
  onExecuteScript: (sql: string) => void;
  /** EXPLAIN 実行コールバック */
  onExplain: (sql: string) => void;
  /** クエリキャンセルコールバック */
  onCancel: () => void;
  /** 現在タブを閉じるコールバック（Ctrl+W で呼び出し） */
  onCloseTab?: () => void;
  /** クエリ実行中フラグ（ツールバーのスピナー・Stop ボタン表示に使用） */
  isExecuting: boolean;
}

// ──────────────────────────────────────────────
// SqlEditorPane コンポーネント
// ──────────────────────────────────────────────

/**
 * Monaco ベースの SQL エディターペイン
 *
 * ツールバー（Run / Explain / Format SQL / Stop）と Monaco エディターで構成される。
 * キーボードショートカットはすべて addAction() でエディタースコープに限定登録する。
 */
export function SqlEditorPane({
  sql,
  dialect,
  onSqlChange,
  onExecuteSelection,
  onExecuteScript,
  onExplain,
  onCancel,
  onCloseTab,
  isExecuting,
}: SqlEditorPaneProps) {
  // Monaco エディターインスタンスへの参照
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // ──────────────────────────────────────────────
  // ハンドラー
  // ──────────────────────────────────────────────

  /**
   * 選択範囲またはカーソル位置のステートメントを実行する（Ctrl+Enter）。
   *
   * REVIEW FIX: ステートメント区切りはバックエンドに委譲する設計:
   * - 選択テキストがある場合 → その選択テキストをそのまま渡す
   * - 選択なしの場合 → フル SQL + カーソルオフセットを渡す
   *   （バックエンドの split_sql_statements がオフセットに基づきターゲットステートメントを解決）
   */
  const handleExecuteSelection = useCallback(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;

    const selection = editorInstance.getSelection();
    const model = editorInstance.getModel();
    if (!model) return;

    // 選択テキストが存在する場合はそれを実行
    const selectedText = selection ? model.getValueInRange(selection) : "";
    if (selectedText.trim()) {
      // EXPLAIN 自動検出: 選択テキストが EXPLAIN で始まるかチェック
      if (isExplainQuery(selectedText)) {
        onExplain(selectedText);
      } else {
        onExecuteSelection(selectedText);
      }
      return;
    }

    // 選択なし: フル SQL + カーソルオフセットをバックエンドに渡す
    const fullSql = model.getValue();
    const position = editorInstance.getPosition();
    // カーソルオフセットを文字数で計算（model.getOffsetAt が利用可能）
    const cursorOffset = position ? model.getOffsetAt(position) : undefined;

    if (isExplainQuery(fullSql)) {
      onExplain(fullSql);
    } else {
      onExecuteSelection(fullSql, cursorOffset);
    }
  }, [onExecuteSelection, onExplain]);

  /**
   * フルスクリプト実行（Shift+Ctrl+Enter）。
   * カーソルオフセットなし = バックエンドが全ステートメントを実行。
   */
  const handleExecuteScript = useCallback(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    onExecuteScript(model.getValue());
  }, [onExecuteScript]);

  /**
   * SQL フォーマット（Alt+Shift+F）。
   *
   * - 選択範囲がある場合 → 選択テキストのみフォーマット
   * - 選択なしの場合 → エディター全体をフォーマット
   * - executeEdits() を使用して undo スタックを保持する（EDIT-04 準拠）
   */
  const handleFormatSql = useCallback(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    const sqlDialect = SQL_FORMATTER_DIALECT[dialect] ?? "sql";
    const selection = editorInstance.getSelection();
    const selectedText = selection ? model.getValueInRange(selection) : "";

    try {
      if (selectedText.trim() && selection) {
        // 選択範囲のみフォーマット
        const formatted = format(selectedText, {
          language: sqlDialect,
          keywordCase: "upper",
        });
        editorInstance.executeEdits("format-sql", [
          { range: selection, text: formatted },
        ]);
      } else {
        // エディター全体をフォーマット
        const fullText = model.getValue();
        const formatted = format(fullText, {
          language: sqlDialect,
          keywordCase: "upper",
        });
        const fullRange = model.getFullModelRange();
        editorInstance.executeEdits("format-sql", [
          { range: fullRange, text: formatted },
        ]);
      }
    } catch {
      // sql-formatter が解析できない SQL は変更せずにスキップ
    }
  }, [dialect]);

  /** Explain ボタン押下 */
  const handleExplain = useCallback(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    const selection = editorInstance.getSelection();
    const selectedText = selection ? model.getValueInRange(selection) : "";
    const sqlToExplain = selectedText.trim() ? selectedText : model.getValue();
    onExplain(sqlToExplain);
  }, [onExplain]);

  // ──────────────────────────────────────────────
  // Monaco マウント処理
  // ──────────────────────────────────────────────

  const handleMount: OnMount = useCallback(
    (editorInstance, monacoInstance) => {
      editorRef.current = editorInstance;

      // Monaco の KeyMod / KeyCode を使用してキーバインドを登録する
      // monacoInstance は @monaco-editor/react が提供する monaco 名前空間
      const { KeyMod, KeyCode } = monacoInstance;

      // Ctrl+Enter: 選択範囲またはカーソル位置のステートメントを実行（EDIT-02）
      editorInstance.addAction({
        id: "db-execute-selection",
        label: "Execute Selection / Statement",
        keybindings: [KeyMod.CtrlCmd | KeyCode.Enter],
        run: () => handleExecuteSelection(),
      });

      // Shift+Ctrl+Enter: フルスクリプトを実行（EDIT-03）
      editorInstance.addAction({
        id: "db-execute-script",
        label: "Execute Full Script",
        keybindings: [KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.Enter],
        run: () => handleExecuteScript(),
      });

      // Alt+Shift+F: SQL フォーマット（EDIT-04）
      editorInstance.addAction({
        id: "db-format-sql",
        label: "Format SQL",
        keybindings: [KeyMod.Alt | KeyMod.Shift | KeyCode.KeyF],
        run: () => handleFormatSql(),
      });

      // Ctrl+W: 現在タブを閉じる
      // NOTE: addAction() のバインディングはエディターウィジェットスコープに限定される。
      // ブラウザ / Tauri ウィンドウレベルの Ctrl+W とは競合しない。
      editorInstance.addAction({
        id: "db-close-tab",
        label: "Close Tab",
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyW],
        run: () => onCloseTab?.(),
      });
    },
    [handleExecuteSelection, handleExecuteScript, handleFormatSql, onCloseTab],
  );

  // ──────────────────────────────────────────────
  // レンダリング
  // ──────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ツールバー（36px 高さ、UI-SPEC 準拠） */}
      <div className="flex h-[36px] shrink-0 items-center gap-1.5 border-b border-border bg-panel-muted px-2">
        {/* Run ボタン: Ctrl+Enter で選択範囲/ステートメントを実行 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={isExecuting}
              onClick={handleExecuteSelection}
            >
              {isExecuting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              Run
            </Button>
          </TooltipTrigger>
          <TooltipContent>Run (Ctrl+Enter)</TooltipContent>
        </Tooltip>

        {/* Explain ボタン */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={isExecuting}
              onClick={handleExplain}
            >
              <Lightbulb size={14} />
              Explain
            </Button>
          </TooltipTrigger>
          <TooltipContent>Explain</TooltipContent>
        </Tooltip>

        {/* Format SQL ボタン */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={isExecuting}
              onClick={handleFormatSql}
            >
              <AlignLeft size={14} />
              Format SQL
            </Button>
          </TooltipTrigger>
          <TooltipContent>Format SQL (Alt+Shift+F)</TooltipContent>
        </Tooltip>

        {/* セパレーター */}
        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Stop ボタン: isExecuting 時のみ表示 */}
        {isExecuting && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive",
                )}
                onClick={onCancel}
              >
                <Square size={14} />
                Stop
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop running query</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Monaco エディター（flex-1 でツールバー以外の全高さを占有） */}
      <div className="min-h-0 flex-1">
        <Editor
          language="sql"
          value={sql}
          onChange={(value) => onSqlChange(value ?? "")}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            wordWrap: "on",
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            padding: { top: 8, bottom: 8 },
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            folding: true,
            contextmenu: true,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
