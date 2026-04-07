// DB 工作台 — クエリタブ管理
//
// 複数クエリタブのライフサイクル管理（追加・削除・リネーム・切替）と
// バージョン管理付き localStorage 永続化を提供する。
// バージョン不一致 / JSON 破損時は警告ログ出力 + デフォルトタブにリセット（防御的回復）。

import { useState, useRef } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  loadSessionForConnection,
  saveSessionForConnection,
} from "./workbench-session";

// ──────────────────────────────────────────────
// localStorage 定数（バージョン管理）
// ──────────────────────────────────────────────

/** バージョン変更時は古いキーのデータを自動削除し新キーで再初期化する */
export const QUERY_TABS_STORAGE_VERSION = "v1";

/** バージョン付き localStorage キー */
export const QUERY_TABS_STORAGE_KEY = `db-workbench:query-tabs:${QUERY_TABS_STORAGE_VERSION}`;

/** 旧バージョン（バージョン無し）のキー — 追加の後方互換用 */
const PRE_VERSION_STORAGE_KEY = "db-workbench:query-tabs";

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
export function defaultTab(connectionId: string | null = null): QueryTab {
  return {
    id: crypto.randomUUID(),
    label: "Query 1",
    sql: "",
    connectionId,
  };
}

function withConnectionId(tab: QueryTab, connectionId: string): QueryTab {
  return { ...tab, connectionId };
}

function migrateLegacyTabsForConnection(connectionId: string): QueryTab[] | null {
  if (typeof window === "undefined") return null;

  const versionedRaw = window.localStorage.getItem(QUERY_TABS_STORAGE_KEY);
  if (versionedRaw) {
    const migrated = parseTabsFromJson(versionedRaw, "legacy-v1").map((tab) =>
      withConnectionId(tab, connectionId),
    );
    window.localStorage.removeItem(QUERY_TABS_STORAGE_KEY);
    window.localStorage.removeItem(PRE_VERSION_STORAGE_KEY);
    return migrated;
  }

  const preVersionRaw = window.localStorage.getItem(PRE_VERSION_STORAGE_KEY);
  if (preVersionRaw) {
    const migrated = parseTabsFromJson(preVersionRaw, "legacy-pre-v1").map((tab) =>
      withConnectionId(tab, connectionId),
    );
    window.localStorage.removeItem(PRE_VERSION_STORAGE_KEY);
    return migrated;
  }

  return null;
}

export function loadTabsForConnection(connectionId: string): QueryTab[] {
  const normalizedConnectionId = connectionId.trim();
  if (!normalizedConnectionId) {
    return [defaultTab()];
  }

  const session = loadSessionForConnection(normalizedConnectionId);
  if (session.tabs.length > 0) {
    return session.tabs.map((tab) => withConnectionId(tab, normalizedConnectionId));
  }

  // 既存セッションがない場合のみ、旧 v1 キーを 1 回読み込んで移行する。
  const migratedTabs = migrateLegacyTabsForConnection(normalizedConnectionId);
  if (migratedTabs && migratedTabs.length > 0) {
    saveSessionForConnection(normalizedConnectionId, {
      ...session,
      tabs: migratedTabs,
      activeTabId: migratedTabs[0]?.id ?? null,
    });
    return migratedTabs;
  }

  return [defaultTab(normalizedConnectionId)];
}

export function saveTabsForConnection(connectionId: string, tabs: QueryTab[]): void {
  const normalizedConnectionId = connectionId.trim();
  if (!normalizedConnectionId) return;

  const session = loadSessionForConnection(normalizedConnectionId);
  const normalizedTabs = (tabs.length > 0
    ? tabs
    : [defaultTab(normalizedConnectionId)]
  ).map((tab) => withConnectionId(tab, normalizedConnectionId));

  const activeTabId =
    typeof session.activeTabId === "string" &&
    normalizedTabs.some((tab) => tab.id === session.activeTabId)
      ? session.activeTabId
      : normalizedTabs[0]?.id ?? null;

  saveSessionForConnection(normalizedConnectionId, {
    ...session,
    tabs: normalizedTabs,
    activeTabId,
  });
}

/**
 * localStorage からタブ状態を読み込む。
 *
 * 読み込みロジック:
 * 現在は後方互換のために "global" 接続として v2 セッションへ読み込む。
 */
export function loadTabs(): QueryTab[] {
  return loadTabsForConnection("global");
}

/**
 * JSON 文字列を QueryTab[] としてパースし、スキーマ検証を行う。
 * parse エラーまたはスキーマ不一致の場合は警告ログ + デフォルトタブを返す。
 */
function parseTabsFromJson(
  raw: string,
  source: "legacy-v1" | "legacy-pre-v1",
): QueryTab[] {
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
  saveTabsForConnection("global", tabs);
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
  const tabButtonRefs = useRef<Array<HTMLDivElement | null>>([]);

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

  function focusTabByOffset(currentIndex: number, offset: number) {
    if (tabs.length === 0) return;

    const nextIndex = (currentIndex + offset + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;

    onTabChange(nextTab.id);
    tabButtonRefs.current[nextIndex]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Query tabs"
      className="flex h-[36px] shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-panel-muted px-1"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isRenaming = renamingTabId === tab.id;

        return (
          <div
            key={tab.id}
            ref={(element) => {
              const index = tabs.findIndex((item) => item.id === tab.id);
              tabButtonRefs.current[index] = element;
            }}
            role="tab"
            id={`db-workbench-tab-${tab.id}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={cn(
              "group relative flex h-[28px] shrink-0 cursor-pointer items-center gap-1 rounded-t-sm px-2.5",
              "border border-b-0 border-transparent transition-colors",
              isActive
                ? "border-border bg-background text-foreground"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
            onClick={() => !isRenaming && onTabChange(tab.id)}
            onKeyDown={(event) => {
              const currentIndex = tabs.findIndex((item) => item.id === tab.id);
              if (currentIndex < 0 || isRenaming) return;

              if (event.key === "ArrowRight") {
                event.preventDefault();
                focusTabByOffset(currentIndex, 1);
              }
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                focusTabByOffset(currentIndex, -1);
              }
              if (event.key === "Home") {
                event.preventDefault();
                const firstTab = tabs[0];
                if (!firstTab) return;
                onTabChange(firstTab.id);
                tabButtonRefs.current[0]?.focus();
              }
              if (event.key === "End") {
                event.preventDefault();
                const lastIndex = tabs.length - 1;
                const lastTab = tabs[lastIndex];
                if (!lastTab) return;
                onTabChange(lastTab.id);
                tabButtonRefs.current[lastIndex]?.focus();
              }
            }}
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
