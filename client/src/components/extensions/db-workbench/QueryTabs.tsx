// DB Workbench query tab bar.
//
// Renders tab selection, keyboard navigation, close, add, and inline rename.
// Storage and migration live in query-tabs-storage.ts.

import { useState, useRef } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { QueryTab } from "./query-tabs-storage";

export type { QueryTab } from "./query-tabs-storage";
export {
  QUERY_TABS_STORAGE_KEY,
  QUERY_TABS_STORAGE_VERSION,
  defaultTab,
  loadTabs,
  loadTabsForConnection,
  saveTabs,
  saveTabsForConnection,
} from "./query-tabs-storage";

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
