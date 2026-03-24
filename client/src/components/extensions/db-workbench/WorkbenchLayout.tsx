// DB 工作台 — メインレイアウトシェル
//
// 3 ペイン構成:
//   - 環境帯（28px、接続の environment が設定されている場合のみ）
//   - 左サイドバー（200px 固定、ConnectionSidebar コンポーネント）
//   - メインエリア（flex-1）
//     - タブバー（QueryTabs コンポーネント、36px）
//     - エディター + 結果エリア（SqlEditorPane + 結果プレースホルダー）
//
// タブ状態は loadTabs() で localStorage から復元し、変更のたびに saveTabs() で永続化する。
// クエリ実行は hostApi.connections.executeQuery に委譲する（Plan 04 で結果グリッドに拡張）。

import { useState, useCallback, useEffect } from "react";
import { Lock } from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import type { DbConnectionConfig } from "@shared/schema";
import type { HostApi } from "@/extensions/host-api";
import { ConnectionSidebar } from "./ConnectionSidebar";
import { QueryTabs, loadTabs, saveTabs, defaultTab } from "./QueryTabs";
import type { QueryTab } from "./QueryTabs";
import { SqlEditorPane } from "./SqlEditorPane";
import { useQuery } from "@tanstack/react-query";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

export interface WorkbenchLayoutProps {
  /** アクティブな接続設定 */
  connection: DbConnectionConfig;
  /** ホスト API（クエリ実行・キャンセル等で使用） */
  hostApi: HostApi;
  /** レガシービューへ切り替えるコールバック */
  onSwitchToLegacy: () => void;
}

// ──────────────────────────────────────────────
// 環境帯コンポーネント
// ──────────────────────────────────────────────

/** 接続の environment に応じた色帯を表示する */
function EnvironmentBand({
  connection,
}: {
  connection: DbConnectionConfig;
}) {
  const env = connection.environment;
  if (!env) return null;

  // 環境ラベルと CSS 変数クラスのマッピング
  const envConfig: Record<
    string,
    { label: string; bgClass: string; fgClass: string }
  > = {
    prod: {
      label: "PRODUCTION",
      bgClass: "bg-[hsl(var(--env-prod))]",
      fgClass: "text-[hsl(var(--env-prod-fg))]",
    },
    test: {
      label: "TEST",
      bgClass: "bg-[hsl(var(--env-test))]",
      fgClass: "text-[hsl(var(--env-test-fg))]",
    },
    dev: {
      label: "DEV",
      bgClass: "bg-[hsl(var(--env-dev))]",
      fgClass: "text-[hsl(var(--env-dev-fg))]",
    },
  };

  const config = envConfig[env];
  if (!config) return null;

  return (
    <div
      className={cn(
        "flex h-[28px] w-full items-center justify-center gap-1.5 text-xs font-semibold",
        config.bgClass,
        config.fgClass,
      )}
    >
      <span>{config.label}</span>
      {/* 読み取り専用接続はロックアイコンを表示 */}
      {connection.readonly && (
        <>
          <Lock className="h-3 w-3" />
          <span>READ-ONLY</span>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// メインレイアウトシェル
// ──────────────────────────────────────────────

/**
 * DB 工作台 メインレイアウトシェル
 *
 * 環境帯 + 左サイドバー（ConnectionSidebar）+ タブバー（QueryTabs）+
 * エディター（SqlEditorPane）+ 結果エリアプレースホルダーで構成される。
 * 結果グリッドは Plan 04 で実装する。
 */
export function WorkbenchLayout({
  connection,
  hostApi,
  onSwitchToLegacy,
}: WorkbenchLayoutProps) {
  // ──────────────────────────────────────────────
  // タブ状態管理（localStorage から初期化）
  // ──────────────────────────────────────────────

  const [tabs, setTabs] = useState<QueryTab[]>(() => loadTabs());
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const loaded = loadTabs();
    return loaded[0]?.id ?? defaultTab().id;
  });

  // クエリ実行状態
  const [isExecuting, setIsExecuting] = useState(false);
  // 現在実行中のリクエスト ID（キャンセル時に使用）
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);

  // 接続リスト（切替ドロップダウン用）
  const { data: connections = [] } = useQuery({
    queryKey: ["connections"],
    queryFn: () => hostApi.connections.list(),
  });

  // ──────────────────────────────────────────────
  // アクティブタブの SQL 取得
  // ──────────────────────────────────────────────

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  // ──────────────────────────────────────────────
  // タブ操作ハンドラー
  // ──────────────────────────────────────────────

  /** SQL 変更: アクティブタブの SQL を更新して永続化 */
  const handleSqlChange = useCallback(
    (sql: string) => {
      setTabs((prev) => {
        const updated = prev.map((t) =>
          t.id === activeTabId ? { ...t, sql } : t,
        );
        saveTabs(updated);
        return updated;
      });
    },
    [activeTabId],
  );

  /** タブ切替 */
  const handleTabChange = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  /** 新規タブ追加 */
  const handleTabAdd = useCallback(() => {
    setTabs((prev) => {
      const newTab: QueryTab = {
        id: crypto.randomUUID(),
        label: `Query ${prev.length + 1}`,
        sql: "",
        connectionId: connection.id,
      };
      const updated = [...prev, newTab];
      saveTabs(updated);
      setActiveTabId(newTab.id);
      return updated;
    });
  }, [connection.id]);

  /** タブ削除（最後の 1 タブは削除不可） */
  const handleTabClose = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;

        const updated = prev.filter((t) => t.id !== tabId);
        saveTabs(updated);

        // 削除したタブがアクティブだった場合は隣のタブをアクティブにする
        if (activeTabId === tabId) {
          const closedIndex = prev.findIndex((t) => t.id === tabId);
          const nextTab = updated[Math.max(0, closedIndex - 1)];
          if (nextTab) setActiveTabId(nextTab.id);
        }

        return updated;
      });
    },
    [activeTabId],
  );

  /** タブリネーム */
  const handleTabRename = useCallback((tabId: string, newLabel: string) => {
    setTabs((prev) => {
      const updated = prev.map((t) =>
        t.id === tabId ? { ...t, label: newLabel } : t,
      );
      saveTabs(updated);
      return updated;
    });
  }, []);

  /** 現在のアクティブタブを閉じる（Ctrl+W） */
  const handleCloseActiveTab = useCallback(() => {
    handleTabClose(activeTabId);
  }, [activeTabId, handleTabClose]);

  // ──────────────────────────────────────────────
  // クエリ実行ハンドラー
  // ──────────────────────────────────────────────

  /**
   * 選択範囲またはカーソル位置のステートメントを実行する（Ctrl+Enter）。
   *
   * REVIEW FIX: ステートメント区切りはバックエンドに委譲。
   * - sql に選択テキストが渡された場合: そのまま実行
   * - cursorOffset が渡された場合: バックエンドがオフセットでターゲットステートメントを解決
   */
  const handleExecuteSelection = useCallback(
    async (sql: string, cursorOffset?: number) => {
      if (!sql.trim() || isExecuting) return;

      const requestId = crypto.randomUUID();
      setCurrentRequestId(requestId);
      setIsExecuting(true);

      try {
        await hostApi.connections.executeQuery({
          connectionId: connection.id,
          sql,
          requestId,
          // cursorOffset はバックエンド側でステートメント特定に使用
          ...(cursorOffset !== undefined && { cursorOffset }),
        });
      } catch {
        // Plan 04 で結果エリアにエラー表示を実装する
      } finally {
        setIsExecuting(false);
        setCurrentRequestId(null);
      }
    },
    [connection.id, hostApi.connections, isExecuting],
  );

  /**
   * フルスクリプト実行（Shift+Ctrl+Enter）。
   * カーソルオフセットなし = バックエンドが全ステートメントを順次実行。
   */
  const handleExecuteScript = useCallback(
    async (sql: string) => {
      if (!sql.trim() || isExecuting) return;

      const requestId = crypto.randomUUID();
      setCurrentRequestId(requestId);
      setIsExecuting(true);

      try {
        await hostApi.connections.executeQuery({
          connectionId: connection.id,
          sql,
          requestId,
        });
      } catch {
        // Plan 04 で結果エリアにエラー表示を実装する
      } finally {
        setIsExecuting(false);
        setCurrentRequestId(null);
      }
    },
    [connection.id, hostApi.connections, isExecuting],
  );

  /**
   * EXPLAIN 実行。
   * バックエンドの db_query_explain に SQL を渡す（Plan 04 で結果グラフに表示）。
   */
  const handleExplain = useCallback(
    async (sql: string) => {
      if (!sql.trim() || isExecuting) return;

      setIsExecuting(true);

      try {
        // ExplainRequest は connectionId + sql のみ（requestId フィールドなし）
        await hostApi.connections.explainQuery({
          connectionId: connection.id,
          sql,
        });
      } catch {
        // Plan 04 で EXPLAIN グラフに表示する
      } finally {
        setIsExecuting(false);
      }
    },
    [connection.id, hostApi.connections, isExecuting],
  );

  /** クエリキャンセル */
  const handleCancel = useCallback(async () => {
    if (!currentRequestId) return;
    try {
      await hostApi.connections.cancelQuery(currentRequestId);
    } finally {
      setIsExecuting(false);
      setCurrentRequestId(null);
    }
  }, [currentRequestId, hostApi.connections]);

  /** 接続切替（サイドバーから） */
  const handleSwitchConnection = useCallback(
    (_id: string) => {
      // 接続切替はレガシービューで行う（Connection フォームを経由）
      onSwitchToLegacy();
    },
    [onSwitchToLegacy],
  );

  // ──────────────────────────────────────────────
  // レンダリング
  // ──────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 環境帯 — prod/test/dev 接続時のみ表示 */}
      <EnvironmentBand connection={connection} />

      {/* メインボディ: サイドバー + コンテンツエリア */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左サイドバー — ConnectionSidebar（200px 固定幅） */}
        <ConnectionSidebar
          connection={connection}
          connections={connections}
          onSwitchConnection={handleSwitchConnection}
        />

        {/* コンテンツエリア — タブバー + エディター/結果 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* タブバー（QueryTabs コンポーネント） */}
          <QueryTabs
            connectionId={connection.id}
            activeTabId={activeTab?.id ?? ""}
            tabs={tabs}
            onTabChange={handleTabChange}
            onTabAdd={handleTabAdd}
            onTabClose={handleTabClose}
            onTabRename={handleTabRename}
          />

          {/* エディター/結果エリア — react-resizable-panels で縦分割 */}
          <ResizablePanelGroup direction="vertical" className="flex-1">
            {/* エディターエリア: SqlEditorPane（flex-1） */}
            <ResizablePanel defaultSize={60} minSize={20}>
              <SqlEditorPane
                sql={activeTab?.sql ?? ""}
                dialect={connection.driver}
                onSqlChange={handleSqlChange}
                onExecuteSelection={handleExecuteSelection}
                onExecuteScript={handleExecuteScript}
                onExplain={handleExplain}
                onCancel={handleCancel}
                onCloseTab={handleCloseActiveTab}
                isExecuting={isExecuting}
              />
            </ResizablePanel>

            <ResizableHandle />

            {/* 結果エリア（Plan 04 で ResultGridPane に置き換え） */}
            <ResizablePanel defaultSize={40} minSize={15}>
              <div className="flex h-full min-h-[120px] items-center justify-center bg-background text-sm text-muted-foreground">
                Run a query to see results
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}
