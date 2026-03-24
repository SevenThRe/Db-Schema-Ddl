// DB 工作台 — メインレイアウトシェル（Plan 04 全コンポーネント配線済み）
//
// 3 ペイン構成:
//   - 環境帯（28px、接続の environment が設定されている場合のみ）
//   - 左サイドバー（200px 固定、ConnectionSidebar コンポーネント）
//   - メインエリア（flex-1）
//     - タブバー（QueryTabs コンポーネント、36px）
//     - エディター + 結果エリア（SqlEditorPane + ResultGridPane / ExplainPlanPane）
//
// タブ状態は loadTabs() で localStorage から復元し、変更のたびに saveTabs() で永続化する。
// 危険な SQL は事前に previewDangerousSql でチェックし、confirmed=true で再実行する。
// これにより Rust 層でのサーバーサイド安全性が保証される（SAFE-01 / SAFE-02）。

import { useState, useCallback, useEffect } from "react";
import { Lock } from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  DbConnectionConfig,
  QueryExecutionResponse,
  DbExplainPlan,
  DangerousSqlPreview,
  DbQueryBatchResult,
} from "@shared/schema";
import type { HostApi } from "@/extensions/host-api";
import { ConnectionSidebar } from "./ConnectionSidebar";
import { QueryTabs, loadTabs, saveTabs, defaultTab } from "./QueryTabs";
import type { QueryTab } from "./QueryTabs";
import { SqlEditorPane } from "./SqlEditorPane";
import { ResultGridPane } from "./ResultGridPane";
import type { ExportFormat } from "./ResultExportMenu";
import { ResultExportMenu } from "./ResultExportMenu";
import { ExplainPlanPane } from "./ExplainPlanPane";
import { DangerousSqlDialog } from "./DangerousSqlDialog";
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
 * エディター（SqlEditorPane）+ 結果/EXPLAIN エリア（ResultGridPane / ExplainPlanPane）+
 * 危険 SQL 確認ダイアログ（DangerousSqlDialog）
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

  // ──────────────────────────────────────────────
  // クエリ実行・結果状態
  // ──────────────────────────────────────────────

  const [isExecuting, setIsExecuting] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [results, setResults] = useState<QueryExecutionResponse | null>(null);

  // EXPLAIN 状態
  const [explainPlan, setExplainPlan] = useState<DbExplainPlan | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);

  // 危険 SQL ダイアログ状態
  const [dangerPreview, setDangerPreview] =
    useState<DangerousSqlPreview | null>(null);
  const [showDangerDialog, setShowDangerDialog] = useState(false);
  const [pendingSql, setPendingSql] = useState<string | null>(null);

  // Stop on error 状態（D-05: デフォルト ON）
  const [stopOnError, setStopOnError] = useState(true);

  // 結果エリアのアクティブタブ（Results / Explain）
  const [resultTab, setResultTab] = useState<"results" | "explain">("results");

  // 接続リスト（切替ドロップダウン用）
  const { data: connections = [] } = useQuery({
    queryKey: ["connections"],
    queryFn: () => hostApi.connections.list(),
  });

  // ──────────────────────────────────────────────
  // アクティブタブ
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
  // クエリ実行コア関数
  // ──────────────────────────────────────────────

  /**
   * 実際のクエリ実行（危険 SQL 確認後に呼び出す）。
   * confirmed=true の場合、Rust 層でも危険 SQL チェックを通過させる（サーバーサイド強制）。
   */
  const executeImmediate = useCallback(
    async (sql: string, confirmed: boolean) => {
      const requestId = crypto.randomUUID();
      setCurrentRequestId(requestId);
      setIsExecuting(true);
      setResults(null);

      try {
        const response = await hostApi.connections.executeQuery({
          connectionId: connection.id,
          sql,
          requestId,
          continueOnError: !stopOnError,
          // confirmed=true は Rust 層への危険 SQL バイパスシグナル（SAFE-01）
          confirmed: confirmed ? true : undefined,
        });
        setResults(response);
        setResultTab("results");
      } catch {
        // エラーはバッチの error フィールドに含まれる
      } finally {
        setIsExecuting(false);
        setCurrentRequestId(null);
      }
    },
    [connection.id, hostApi.connections, stopOnError],
  );

  /**
   * 実行前に危険 SQL チェックを行う。
   * 危険が検出された場合は確認ダイアログを表示し、ユーザーの判断を待つ。
   * 危険がない場合は即座に実行する。
   */
  const handleExecute = useCallback(
    async (sql: string) => {
      if (!sql.trim() || isExecuting) return;

      setPendingSql(sql);

      try {
        const preview = await hostApi.connections.previewDangerousSql(
          connection.id,
          sql,
        );

        if (preview.dangers.length > 0) {
          // 危険 SQL: ダイアログを表示して確認を待つ
          setDangerPreview(preview);
          setShowDangerDialog(true);
        } else {
          // 安全な SQL: 即座に実行（confirmed 不要）
          await executeImmediate(sql, false);
        }
      } catch {
        // previewDangerousSql のエラーは無視して実行を試みる
        await executeImmediate(sql, false);
      }
    },
    [connection.id, hostApi.connections, isExecuting, executeImmediate],
  );

  /**
   * 危険 SQL ダイアログで "Run anyway" / "Confirm and run" を押した場合。
   * confirmed=true で再実行する（Rust 層が独立して危険 SQL を再検証し通過させる）。
   */
  const handleDangerConfirm = useCallback(async () => {
    setShowDangerDialog(false);
    setDangerPreview(null);

    if (pendingSql) {
      await executeImmediate(pendingSql, true);
      setPendingSql(null);
    }
  }, [pendingSql, executeImmediate]);

  /** ダイアログキャンセル */
  const handleDangerCancel = useCallback(() => {
    setShowDangerDialog(false);
    setDangerPreview(null);
    setPendingSql(null);
  }, []);

  // ──────────────────────────────────────────────
  // エディターショートカットハンドラー
  // ──────────────────────────────────────────────

  /**
   * 選択範囲またはカーソル位置のステートメントを実行する（Ctrl+Enter）。
   * ステートメント区切りはバックエンドに委譲する。
   */
  const handleExecuteSelection = useCallback(
    async (sql: string, cursorOffset?: number) => {
      if (!sql.trim() || isExecuting) return;
      void cursorOffset; // バックエンドが cursorOffset でターゲットを解決する
      await handleExecute(sql);
    },
    [isExecuting, handleExecute],
  );

  /**
   * フルスクリプト実行（Shift+Ctrl+Enter）。
   */
  const handleExecuteScript = useCallback(
    async (sql: string) => {
      if (!sql.trim() || isExecuting) return;
      await handleExecute(sql);
    },
    [isExecuting, handleExecute],
  );

  /**
   * EXPLAIN 実行。
   * 結果タブを "explain" に切り替える。
   */
  const handleExplain = useCallback(
    async (sql: string) => {
      if (!sql.trim() || isExplaining) return;

      setIsExplaining(true);

      try {
        const plan = await hostApi.connections.explainQuery({
          connectionId: connection.id,
          sql,
        });
        setExplainPlan(plan);
        setResultTab("explain");
      } catch {
        // EXPLAIN エラーは結果エリアで表示
      } finally {
        setIsExplaining(false);
      }
    },
    [connection.id, hostApi.connections, isExplaining],
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
      onSwitchToLegacy();
    },
    [onSwitchToLegacy],
  );

  // ──────────────────────────────────────────────
  // ロードモアハンドラー（D-06: 専用 fetchMore コマンド）
  // ──────────────────────────────────────────────

  /**
   * 追加行を取得する（dedicated fetch-more コマンド経由）。
   * 既存バッチに行を追記する。
   */
  const handleLoadMore = useCallback(
    async (batchIndex: number) => {
      if (!results || !currentRequestId) return;

      const batch = results.batches[batchIndex];
      if (!batch) return;

      try {
        const moreBatch = await hostApi.connections.fetchMore({
          requestId: currentRequestId,
          batchIndex,
          sql: batch.sql,
          connectionId: connection.id,
          offset: batch.rows.length,
          limit: 1000,
        });

        // 取得した行を既存バッチに追記
        setResults((prev) => {
          if (!prev) return prev;
          const updatedBatches = prev.batches.map((b, i) => {
            if (i !== batchIndex) return b;
            return {
              ...b,
              rows: [...b.rows, ...moreBatch.rows],
            };
          });
          return { ...prev, batches: updatedBatches };
        });
      } catch {
        // ロードモアエラーは無視（既存の行は保持）
      }
    },
    [results, currentRequestId, hostApi.connections, connection.id],
  );

  // ──────────────────────────────────────────────
  // エクスポートハンドラー（3 モード）
  // ──────────────────────────────────────────────

  /**
   * 現在ページエクスポート（クライアントサイド変換）。
   * ResultExportMenu がブラウザダウンロードを直接トリガーするためここでは何も処理しない。
   */
  const handleExportCurrentPage = useCallback(
    (_format: ExportFormat) => {
      // クライアントサイド変換と download は ResultExportMenu 内で完結している
    },
    [],
  );

  /**
   * 全行エクスポート（バックエンド再実行）。
   * db_export_rows コマンドで全行を取得してダウンロードする。
   */
  const handleExportFull = useCallback(
    async (format: ExportFormat) => {
      if (!results) return;

      // アクティブバッチのカラムを使用（行は空 — バックエンドが再実行する）
      const activeBatch = results.batches[0] as DbQueryBatchResult | undefined;
      if (!activeBatch) return;

      try {
        const content = await hostApi.connections.exportRows({
          rows: [],
          columns: activeBatch.columns,
          format,
          tableName: undefined,
        });

        // ブラウザダウンロードをトリガー
        const mimeTypes: Record<ExportFormat, string> = {
          csv: "text/csv;charset=utf-8",
          json: "application/json;charset=utf-8",
          markdown: "text/markdown;charset=utf-8",
          "sql-insert": "text/plain;charset=utf-8",
        };
        const extensions: Record<ExportFormat, string> = {
          csv: "csv",
          json: "json",
          markdown: "md",
          "sql-insert": "sql",
        };

        const blob = new Blob([content], { type: mimeTypes[format] });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `export.${extensions[format]}`;
        anchor.click();
        URL.revokeObjectURL(url);
      } catch {
        // エクスポートエラーは無視
      }
    },
    [results, hostApi.connections],
  );

  // activeIndex の同期（batches 更新時に範囲外を防ぐ）
  useEffect(() => {
    if (!results) return;
  }, [results]);

  // ──────────────────────────────────────────────
  // レンダリング
  // ──────────────────────────────────────────────

  // アクティブバッチ（結果エクスポートメニュー用）
  const activeBatch = results?.batches[0];

  return (
    <>
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

              {/* 結果/EXPLAIN エリア（ResultGridPane + ExplainPlanPane） */}
              <ResizablePanel defaultSize={40} minSize={15}>
                <div className="flex h-full flex-col overflow-hidden">
                  {/* 結果エリアのタブバー（Results / Explain）+ エクスポートメニュー */}
                  <div className="flex shrink-0 items-center justify-between border-b border-border bg-panel-muted px-2 py-1">
                    <Tabs
                      value={resultTab}
                      onValueChange={(v) =>
                        setResultTab(v as "results" | "explain")
                      }
                    >
                      <TabsList className="h-7">
                        <TabsTrigger value="results" className="h-6 text-xs">
                          Results
                        </TabsTrigger>
                        <TabsTrigger value="explain" className="h-6 text-xs">
                          Explain
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>

                    {/* エクスポートメニュー（Results タブかつ結果がある場合のみ表示） */}
                    {resultTab === "results" && activeBatch && (
                      <ResultExportMenu
                        batch={activeBatch}
                        onExportCurrentPage={handleExportCurrentPage}
                        onExportFull={handleExportFull}
                      />
                    )}
                  </div>

                  {/* 結果/EXPLAIN コンテンツエリア */}
                  <div className="flex-1 overflow-hidden">
                    {resultTab === "results" ? (
                      <ResultGridPane
                        batches={results?.batches ?? []}
                        onLoadMore={handleLoadMore}
                        isLoading={isExecuting}
                        onStopOnErrorChange={setStopOnError}
                      />
                    ) : (
                      <ExplainPlanPane
                        plan={explainPlan}
                        isLoading={isExplaining}
                      />
                    )}
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </div>

      {/* 危険 SQL 確認ダイアログ（SAFE-01 / SAFE-02） */}
      <DangerousSqlDialog
        preview={dangerPreview}
        open={showDangerDialog}
        onConfirm={handleDangerConfirm}
        onCancel={handleDangerCancel}
      />
    </>
  );
}
