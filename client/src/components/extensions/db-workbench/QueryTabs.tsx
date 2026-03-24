// DB 工作台 — クエリタブ管理
//
// 複数クエリタブのライフサイクル管理（追加・削除・リネーム・切替）と
// バージョン管理付き localStorage 永続化を提供する。
// バージョン不一致 / JSON 破損時は警告ログ出力 + デフォルトタブにリセット（防御的回復）。

import { useState, useRef } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────
// localStorage 定数（バージョン管理）
// ──────────────────────────────────────────────

/** バージョン変更時は古いキーのデータを自動削除し新キーで再初期化する */
export const QUERY_TABS_STORAGE_VERSION = "v1";

/** バージョン付き localStorage キー */
export const QUERY_TABS_STORAGE_KEY = `db-workbench:query-tabs:${QUERY_TABS_STORAGE_VERSION}`;

/** 旧バージョン（バージョン無し）のキー — マイグレーション対象 */
const LEGACY_STORAGE_KEY = "db-workbench:query-tabs";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

/** 単一クエリタブの状態 */
export interface QueryTab {
  id: string;
  label: string;
  sql: string;
  /** タブを作成した接続 ID（null = 接続未割当） */
  connectionId: string | null;
}

// ──────────────────────────────────────────────
// localStorage ヘルパー関数
// ──────────────────────────────────────────────

/** デフォルトタブを生成する（常に新 UUID を使用） */
export function defaultTab(): QueryTab {
  return {
    id: crypto.randomUUID(),
    label: "Query 1",
    sql: "",
    connectionId: null,
  };
}

/**
 * localStorage からタブ状態を読み込む。
 *
 * 読み込みロジック:
 * 1. バージョン付きキーを確認 → 存在すれば parse してスキーマ検証
 * 2. 旧バージョンキーが存在すれば マイグレーション → 旧キー削除 → バージョン付きキーに保存
 * 3. JSON parse エラー / スキーマ不一致 → 警告ログ出力 + デフォルトタブ 1 枚にリセット
 */
export function loadTabs(): QueryTab[] {
  if (typeof window === "undefined") {
    return [defaultTab()];
  }

  // バージョン付きキーから読み込み試行
  const raw = window.localStorage.getItem(QUERY_TABS_STORAGE_KEY);
  if (raw) {
    return parseTabsFromJson(raw, "versioned");
  }

  // 旧バージョンキーからのマイグレーション試行
  const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyRaw) {
    const migrated = parseTabsFromJson(legacyRaw, "legacy");
    // マイグレーション成功時は新キーに保存し、旧キーを削除
    window.localStorage.setItem(QUERY_TABS_STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
  }

  return [defaultTab()];
}

/**
 * JSON 文字列を QueryTab[] としてパースし、スキーマ検証を行う。
 * parse エラーまたはスキーマ不一致の場合は警告ログ + デフォルトタブを返す。
 */
function parseTabsFromJson(raw: string, source: "versioned" | "legacy"): QueryTab[] {
  try {
    const parsed = JSON.parse(raw);

    // 必須フィールド検証（スキーマ不一致時はリセット）
    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.warn(`[QueryTabs] ${source} storage: invalid structure, resetting to default`);
      return [defaultTab()];
    }

    const validated: QueryTab[] = [];
    for (const item of parsed) {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof item.id !== "string" ||
        typeof item.label !== "string" ||
        typeof item.sql !== "string"
      ) {
        // 不正なエントリをスキップして警告
        console.warn("[QueryTabs] Skipping corrupted tab entry:", item);
        continue;
      }
      validated.push({
        id: item.id,
        label: item.label,
        sql: item.sql,
        connectionId: typeof item.connectionId === "string" ? item.connectionId : null,
      });
    }

    if (validated.length === 0) {
      console.warn(`[QueryTabs] ${source} storage: all entries corrupted, resetting to default`);
      return [defaultTab()];
    }

    return validated;
  } catch (err) {
    // JSON.parse エラー
    console.warn(`[QueryTabs] Failed to parse ${source} storage, resetting to default:`, err);
    return [defaultTab()];
  }
}

/** タブ状態を localStorage にバージョン付きキーで保存する */
export function saveTabs(tabs: QueryTab[]): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(QUERY_TABS_STORAGE_KEY, JSON.stringify(tabs));
  } catch (err) {
    // localStorage 容量超過などの例外をサイレントに無視
    console.warn("[QueryTabs] Failed to save tabs to localStorage:", err);
  }
}

// ──────────────────────────────────────────────
// プロップ型
// ──────────────────────────────────────────────

export interface QueryTabsProps {
  /** 現在アクティブな接続 ID */
  connectionId: string;
  /** アクティブなタブ ID */
  activeTabId: string;
  /** タブリスト */
  tabs: QueryTab[];
  /** タブ切替コールバック */
  onTabChange: (tabId: string) => void;
  /** 新規タブ追加コールバック */
  onTabAdd: () => void;
  /** タブ削除コールバック */
  onTabClose: (tabId: string) => void;
  /** タブリネームコールバック */
  onTabRename: (tabId: string, newLabel: string) => void;
}

// ──────────────────────────────────────────────
// QueryTabs コンポーネント
// ──────────────────────────────────────────────

/**
 * クエリタブバー
 *
 * - タブ追加 / 削除 / リネーム / 切替
 * - ダブルクリックでインラインリネーム（Input, text-xs）
 * - 最後の 1 タブは削除不可
 * - タブバー高さ: 36px（UI-SPEC 準拠）
 * - アクティブタブ: border-b-2 border-primary の下線
 */
export function QueryTabs({
  activeTabId,
  tabs,
  onTabChange,
  onTabAdd,
  onTabClose,
  onTabRename,
}: QueryTabsProps) {
  // リネーム中のタブ ID（null = リネームモードなし）
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  // リネーム中の一時入力値
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  /** ダブルクリックでリネームモード開始 */
  function handleDoubleClick(tab: QueryTab) {
    setRenamingTabId(tab.id);
    setRenameValue(tab.label);
    // 次のレンダリング後に input にフォーカス
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  /** リネーム確定（Enter / blur） */
  function commitRename() {
    if (renamingTabId && renameValue.trim()) {
      onTabRename(renamingTabId, renameValue.trim());
    }
    setRenamingTabId(null);
    setRenameValue("");
  }

  /** リネームキャンセル（Escape） */
  function cancelRename() {
    setRenamingTabId(null);
    setRenameValue("");
  }

  return (
    <div className="flex h-[36px] shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-panel-muted px-1">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isRenaming = renamingTabId === tab.id;

        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "group relative flex h-[28px] shrink-0 cursor-pointer items-center gap-1 rounded-t-sm px-2.5",
              "border border-b-0 border-transparent transition-colors",
              isActive
                ? "border-border bg-background text-foreground"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
            onClick={() => !isRenaming && onTabChange(tab.id)}
          >
            {/* アクティブタブのボトムボーダー（下線インジケーター） */}
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
            )}

            {/* タブラベル: リネームモードは Input を表示、通常は span */}
            {isRenaming ? (
              <Input
                ref={renameInputRef}
                value={renameValue}
                className="h-5 w-[80px] min-w-0 px-1 text-xs"
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") cancelRename();
                  // タブ内でのキー伝播を止めてエディターへの影響を防ぐ
                  e.stopPropagation();
                }}
                onBlur={commitRename}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="max-w-[120px] truncate text-xs font-semibold"
                onDoubleClick={() => handleDoubleClick(tab)}
              >
                {tab.label}
              </span>
            )}

            {/* 閉じるボタン（hover 時に表示） */}
            {!isRenaming && (
              <button
                type="button"
                aria-label={`Close tab: ${tab.label}`}
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-muted-foreground/20",
                  "group-hover:opacity-100",
                  isActive && "opacity-60",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  // 最後の 1 タブは削除不可
                  if (tabs.length > 1) {
                    onTabClose(tab.id);
                  }
                }}
                disabled={tabs.length <= 1}
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}

      {/* 新規タブ追加ボタン */}
      <button
        type="button"
        aria-label="Add new query tab"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        onClick={onTabAdd}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
