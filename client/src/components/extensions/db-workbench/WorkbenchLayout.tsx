// DB 工作台 — メインレイアウトシェル（Plan 04 全コンポーネント配線済み）
//
// 3 ペイン構成:
//   - 環境帯（28px、接続の environment が設定されている場合のみ）
//   - 左サイドバー（200px 固定、ConnectionSidebar コンポーネント）
//   - メインエリア（flex-1）
//     - タブバー（QueryTabs コンポーネント、36px）
//     - エディター + 結果エリア（SqlEditorPane + ResultGridPane / ExplainPlanPane）
//
// セッション状態は loadSessionForConnection()/saveSessionForConnection() で
// 接続単位に復元・永続化する（タブ/ドラフト/Recent SQL/Snippet）。
// 危険な SQL は事前に previewDangerousSql でチェックし、confirmed=true で再実行する。
// これにより Rust 層でのサーバーサイド安全性が保証される（SAFE-01 / SAFE-02）。

import { useState, useCallback, useEffect, useMemo } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  BinaryCommandResult,
  DbConnectionConfig,
  QueryExecutionResponse,
  DbExplainPlan,
  DangerousSqlPreview,
} from "@shared/schema";
import type { HostApi } from "@/extensions/host-api";
import { ConnectionSidebar } from "./ConnectionSidebar";
import { QueryTabs, loadTabsForConnection, defaultTab } from "./QueryTabs";
import type { QueryTab } from "./QueryTabs";
import {
  appendRecentQuery,
  loadSessionForConnection,
  saveSessionForConnection,
  saveSnippet,
  type SavedSqlSnippet,
  type WorkbenchSessionState,
} from "./workbench-session";
import { SqlEditorPane } from "./SqlEditorPane";
import { ResultGridPane } from "./ResultGridPane";
import type { ExportFormat, ExportScope } from "./ResultExportMenu";
import { ResultExportMenu } from "./ResultExportMenu";
import { ExplainPlanPane } from "./ExplainPlanPane";
import { DangerousSqlDialog } from "./DangerousSqlDialog";
import { buildAutocompleteContext } from "./sql-autocomplete";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type StarterQueryMode = "select" | "count" | "columns";

function formatWorkbenchError(error: unknown, fallback: string): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : fallback;

  return raw
    .replace(/^Error invoking [^:]+:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

function InlineIssue({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-border bg-background px-3 py-2">
      <Alert variant="destructive" className="rounded-md px-3 py-2">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle className="text-xs">{title}</AlertTitle>
        <AlertDescription className="text-xs">{description}</AlertDescription>
      </Alert>
    </div>
  );
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function downloadBinaryResult(result: BinaryCommandResult): void {
  const bytes = base64ToBytes(result.base64);
  const blob = new Blob([bytes], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function quoteIdentifier(driver: DbConnectionConfig["driver"], identifier: string): string {
  if (driver === "mysql") {
    return `\`${identifier.replace(/`/g, "``")}\``;
  }
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

interface HydratedConnectionSession {
  tabs: QueryTab[];
  activeTabId: string;
  recentQueries: string[];
  snippets: SavedSqlSnippet[];
  selectedTableName: string | null;
}

function hydrateConnectionSession(
  connectionId: string,
  session?: WorkbenchSessionState,
): HydratedConnectionSession {
  const normalizedConnectionId = connectionId.trim();
  const loadedSession = session ?? loadSessionForConnection(normalizedConnectionId);
  const loadedTabs =
    loadedSession.tabs.length > 0
      ? loadedSession.tabs.map((tab) => ({
          ...tab,
          connectionId: normalizedConnectionId,
        }))
      : loadTabsForConnection(normalizedConnectionId);

  const tabs =
    loadedTabs.length > 0 ? loadedTabs : [defaultTab(normalizedConnectionId)];
  const fallbackTabId = tabs[0]?.id ?? defaultTab(normalizedConnectionId).id;
  const activeTabId =
    loadedSession.activeTabId &&
    tabs.some((tab) => tab.id === loadedSession.activeTabId)
      ? loadedSession.activeTabId
      : fallbackTabId;

  return {
    tabs,
    activeTabId,
    recentQueries: loadedSession.recentQueries,
    snippets: loadedSession.snippets,
    selectedTableName: loadedSession.selectedTableName,
  };
}

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
  /** 工作台内で接続を切り替えるコールバック */
  onSwitchConnection: (connectionId: string) => void;
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
  onSwitchConnection,
}: WorkbenchLayoutProps) {
  // ──────────────────────────────────────────────
  // タブ状態管理（localStorage から初期化）
  // ──────────────────────────────────────────────

  const initialSession = useMemo(
    () => hydrateConnectionSession(connection.id),
    [connection.id],
  );

  const [tabs, setTabs] = useState<QueryTab[]>(initialSession.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(
    initialSession.activeTabId,
  );
  const [recentQueries, setRecentQueries] = useState<string[]>(
    initialSession.recentQueries,
  );
  const [savedSnippets, setSavedSnippets] = useState<SavedSqlSnippet[]>(
    initialSession.snippets,
  );
  const [selectedTableName, setSelectedTableName] = useState<string | null>(
    initialSession.selectedTableName,
  );
  const [selectedRecentSql, setSelectedRecentSql] = useState("");
  const [selectedSnippetId, setSelectedSnippetId] = useState("");

  // ──────────────────────────────────────────────
  // クエリ実行・結果状態
  // ──────────────────────────────────────────────

  const [isExecuting, setIsExecuting] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [results, setResults] = useState<QueryExecutionResponse | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  // EXPLAIN 状態
  const [explainPlan, setExplainPlan] = useState<DbExplainPlan | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  // 危険 SQL ダイアログ状態
  const [dangerPreview, setDangerPreview] =
    useState<DangerousSqlPreview | null>(null);
  const [showDangerDialog, setShowDangerDialog] = useState(false);
  const [pendingSql, setPendingSql] = useState<string | null>(null);

  // Stop on error 状態（D-05: デフォルト ON）
  const [stopOnError, setStopOnError] = useState(true);

  // 結果エリアのアクティブタブ（Results / Explain）
  const [resultTab, setResultTab] = useState<"results" | "explain">("results");
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [currentExportRequestId, setCurrentExportRequestId] = useState<string | null>(null);
  const [activeSchema, setActiveSchema] = useState<string>(() =>
    connection.driver === "postgres"
      ? connection.defaultSchema?.trim() || "public"
      : "public",
  );
  const queryClient = useQueryClient();

  useEffect(() => {
    if (connection.driver !== "postgres") {
      setActiveSchema("public");
      return;
    }
    setActiveSchema(connection.defaultSchema?.trim() || "public");
  }, [connection.driver, connection.defaultSchema, connection.id]);

  const runtimeSchema = connection.driver === "postgres" ? activeSchema : undefined;

  // 接続リスト（切替ドロップダウン用）
  const { data: connections = [] } = useQuery({
    queryKey: ["connections"],
    queryFn: () => hostApi.connections.list(),
  });

  const {
    data: schemaSnapshot,
    isFetching: isSchemaLoading,
    error: schemaQueryError,
    refetch: refetchSchema,
  } = useQuery({
    queryKey: ["db-workbench-schema", connection.id],
    queryFn: () => hostApi.connections.introspect(connection.id),
    staleTime: 30_000,
    retry: false,
  });

  const {
    data: schemaOptionsRaw = [],
    isFetching: isSchemaOptionsLoading,
    error: schemaOptionsError,
    refetch: refetchSchemaOptions,
  } = useQuery({
    queryKey: ["db-workbench-schema-options", connection.id],
    queryFn: async () => {
      if (!hostApi.connections.listSchemas) return [];
      return await hostApi.connections.listSchemas(connection.id);
    },
    enabled: connection.driver === "postgres",
    staleTime: 30_000,
    retry: false,
  });

  const schemaOptions = useMemo(() => {
    if (connection.driver !== "postgres") return [];
    const merged = new Set<string>(["public"]);
    if (connection.defaultSchema?.trim()) {
      merged.add(connection.defaultSchema.trim());
    }
    if (activeSchema.trim()) {
      merged.add(activeSchema.trim());
    }
    for (const schema of schemaOptionsRaw) {
      const normalized = schema.trim();
      if (normalized) {
        merged.add(normalized);
      }
    }
    return Array.from(merged).sort((left, right) => left.localeCompare(right));
  }, [activeSchema, connection.defaultSchema, connection.driver, schemaOptionsRaw]);

  const autocompleteContext = useMemo(
    () => buildAutocompleteContext(schemaSnapshot, runtimeSchema),
    [runtimeSchema, schemaSnapshot],
  );

  const schemaErrorMessage = useMemo(() => {
    if (!schemaQueryError) return null;
    return formatWorkbenchError(
      schemaQueryError,
      "Unable to load schema from the current connection.",
    );
  }, [schemaQueryError]);

  useEffect(() => {
    if (!schemaErrorMessage) return;
    hostApi.notifications.show({
      title: "数据库当前不可连接",
      description: schemaErrorMessage,
      variant: "destructive",
    });
  }, [hostApi.notifications, schemaErrorMessage]);

  useEffect(() => {
    if (!schemaOptionsError || connection.driver !== "postgres") return;
    hostApi.notifications.show({
      title: "Schema list unavailable",
      description: formatWorkbenchError(
        schemaOptionsError,
        "Unable to list PostgreSQL schemas for this connection.",
      ),
      variant: "destructive",
    });
  }, [connection.driver, hostApi.notifications, schemaOptionsError]);

  useEffect(() => {
    const sortedTableNames = [...(schemaSnapshot?.tables ?? [])]
      .map((table) => table.name)
      .sort((left, right) => left.localeCompare(right));

    if (sortedTableNames.length === 0) {
      setSelectedTableName(null);
      return;
    }

    setSelectedTableName((current) =>
      current && sortedTableNames.includes(current) ? current : sortedTableNames[0],
    );
  }, [schemaSnapshot]);

  // ──────────────────────────────────────────────
  // アクティブタブ
  // ──────────────────────────────────────────────

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  useEffect(() => {
    const loadedSession = loadSessionForConnection(connection.id);
    const restored = hydrateConnectionSession(connection.id, loadedSession);
    setTabs(restored.tabs);
    setActiveTabId(restored.activeTabId);
    setRecentQueries(restored.recentQueries);
    setSavedSnippets(restored.snippets);
    setSelectedTableName(restored.selectedTableName);
    setSelectedRecentSql("");
    setSelectedSnippetId("");
  }, [connection.id]);

  useEffect(() => {
    if (tabs.length === 0) {
      setTabs([defaultTab(connection.id)]);
      return;
    }
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTabId, connection.id, tabs]);

  useEffect(() => {
    if (!connection.id) return;
    saveSessionForConnection(connection.id, {
      tabs: tabs.map((tab) => ({ ...tab, connectionId: connection.id })),
      activeTabId,
      recentQueries,
      snippets: savedSnippets,
      selectedTableName,
    });
  }, [activeTabId, connection.id, recentQueries, savedSnippets, selectedTableName, tabs]);

  // ──────────────────────────────────────────────
  // タブ操作ハンドラー
  // ──────────────────────────────────────────────

  /** SQL 変更: アクティブタブの SQL を更新して永続化 */
  const handleSqlChange = useCallback(
    (sql: string) => {
      setTabs((prev) => {
        return prev.map((t) => (t.id === activeTabId ? { ...t, sql } : t));
      });
    },
    [activeTabId],
  );

  const updateActiveTabSql = useCallback(
    (sql: string) => {
      setTabs((prev) =>
        prev.map((tab) => (tab.id === activeTabId ? { ...tab, sql } : tab)),
      );
    },
    [activeTabId],
  );

  const focusSqlEditor = useCallback(() => {
    window.requestAnimationFrame(() => {
      const input = document.querySelector<HTMLTextAreaElement>(
        ".monaco-editor textarea.inputarea",
      );
      input?.focus();
    });
  }, []);

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
      setActiveTabId(newTab.id);
      return [...prev, newTab];
    });
  }, [connection.id]);

  /** タブ削除（最後の 1 タブは削除不可） */
  const handleTabClose = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;

        const updated = prev.filter((t) => t.id !== tabId);

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
      return prev.map((t) => (t.id === tabId ? { ...t, label: newLabel } : t));
    });
  }, []);

  /** 現在のアクティブタブを閉じる（Ctrl+W） */
  const handleCloseActiveTab = useCallback(() => {
    handleTabClose(activeTabId);
  }, [activeTabId, handleTabClose]);

  const insertSqlIntoActiveTab = useCallback(
    (nextSql: string) => {
      if (!nextSql.trim()) return;
      setTabs((prev) =>
        prev.map((tab) => (tab.id === activeTabId ? { ...tab, sql: nextSql } : tab)),
      );
    },
    [activeTabId],
  );

  const handleSaveSnippet = useCallback(() => {
    const sqlToSave = activeTab?.sql ?? "";
    if (!sqlToSave.trim()) {
      hostApi.notifications.show({
        title: "Nothing to save",
        description: "Write SQL in the active tab before saving a snippet.",
        variant: "default",
      });
      return;
    }

    const defaultName = activeTab?.label?.trim() || "Snippet";
    const promptValue = window.prompt("Save snippet", defaultName);
    if (promptValue === null) return;

    const snippetName = promptValue.trim();
    if (!snippetName) {
      hostApi.notifications.show({
        title: "Snippet name required",
        description: "Provide a non-empty snippet name.",
        variant: "destructive",
      });
      return;
    }

    const updatedSession = saveSnippet(connection.id, snippetName, sqlToSave);
    setSavedSnippets(updatedSession.snippets);
    setSelectedSnippetId("");
    hostApi.notifications.show({
      title: "Snippet saved",
      description: `${snippetName} is available for this connection.`,
      variant: "success",
    });
  }, [activeTab?.label, activeTab?.sql, connection.id, hostApi.notifications]);

  const handleInsertSnippet = useCallback(
    (snippetId: string) => {
      const snippet = savedSnippets.find((item) => item.id === snippetId);
      if (!snippet) return;
      insertSqlIntoActiveTab(snippet.sql);
      setSelectedSnippetId("");
    },
    [insertSqlIntoActiveTab, savedSnippets],
  );

  const handleInsertRecentSql = useCallback(
    (indexValue: string) => {
      const index = Number(indexValue);
      if (!Number.isInteger(index) || index < 0 || index >= recentQueries.length) return;
      const sql = recentQueries[index];
      if (!sql) return;
      insertSqlIntoActiveTab(sql);
      setSelectedRecentSql("");
    },
    [insertSqlIntoActiveTab, recentQueries],
  );

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
      setQueryError(null);

      try {
        const response = await hostApi.connections.executeQuery({
          connectionId: connection.id,
          sql,
          requestId,
          schema: runtimeSchema,
          continueOnError: !stopOnError,
          // confirmed=true は Rust 層への危険 SQL バイパスシグナル（SAFE-01）
          confirmed: confirmed ? true : undefined,
        });
        setResults(response);
        setActiveBatchIndex(0);
        setResultTab("results");
        const updatedSession = appendRecentQuery(connection.id, sql);
        setRecentQueries(updatedSession.recentQueries);
      } catch (error) {
        const message = formatWorkbenchError(
          error,
          "Unable to execute query on the current connection.",
        );
        setQueryError(message);
        setResultTab("results");
        hostApi.notifications.show({
          title: "查询执行失败",
          description: message,
          variant: "destructive",
        });
      } finally {
        setIsExecuting(false);
        setCurrentRequestId(null);
      }
    },
    [
      connection.id,
      hostApi.connections,
      hostApi.notifications,
      runtimeSchema,
      stopOnError,
    ],
  );

  /**
   * 実行前に危険 SQL チェックを行う。
   * 危険が検出された場合は確認ダイアログを表示し、ユーザーの判断を待つ。
   * 危険がない場合は即座に実行する。
   */
  const handleExecute = useCallback(
    async (sql: string) => {
      if (!sql.trim() || isExecuting || isExporting) return;

      setPendingSql(sql);
      setQueryError(null);

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
    [connection.id, hostApi.connections, isExecuting, isExporting, executeImmediate],
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
      setExplainError(null);

      try {
        const plan = await hostApi.connections.explainQuery({
          connectionId: connection.id,
          sql,
          schema: runtimeSchema,
        });
        setExplainPlan(plan);
        setResultTab("explain");
      } catch (error) {
        const message = formatWorkbenchError(
          error,
          "Unable to get execution plan from the current connection.",
        );
        setExplainPlan(null);
        setExplainError(message);
        setResultTab("explain");
        hostApi.notifications.show({
          title: "Explain 执行失败",
          description: message,
          variant: "destructive",
        });
      } finally {
        setIsExplaining(false);
      }
    },
    [
      connection.id,
      hostApi.connections,
      hostApi.notifications,
      isExplaining,
      runtimeSchema,
    ],
  );

  /** クエリ/エクスポートキャンセル */
  const handleCancel = useCallback(async () => {
    const requestId = currentRequestId ?? currentExportRequestId;
    if (!requestId) return;

    try {
      await hostApi.connections.cancelQuery(requestId);
    } finally {
      if (requestId === currentRequestId) {
        setIsExecuting(false);
        setCurrentRequestId(null);
      }
      if (requestId === currentExportRequestId) {
        setIsExporting(false);
        setCurrentExportRequestId(null);
      }
    }
  }, [currentExportRequestId, currentRequestId, hostApi.connections]);

  /** 接続切替（サイドバーから） */
  const handleSwitchConnection = useCallback(
    (connectionId: string) => {
      if (connectionId === connection.id) return;
      onSwitchConnection(connectionId);
    },
    [connection.id, onSwitchConnection],
  );

  const handleSchemaChange = useCallback(
    async (nextSchema: string) => {
      if (connection.driver !== "postgres") return;
      const normalizedSchema = nextSchema.trim() || "public";
      if (normalizedSchema === activeSchema) return;

      const previousSchema = activeSchema;
      setActiveSchema(normalizedSchema);

      try {
        await hostApi.connections.save({
          ...connection,
          defaultSchema: normalizedSchema,
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["connections"] }),
          queryClient.invalidateQueries({ queryKey: ["/db/connections"] }),
        ]);
        await Promise.all([refetchSchema(), refetchSchemaOptions()]);

        setResults(null);
        setExplainPlan(null);
        setQueryError(null);
        setExplainError(null);
        setActiveBatchIndex(0);
        setResultTab("results");
      } catch (error) {
        setActiveSchema(previousSchema);
        hostApi.notifications.show({
          title: "Schema switch failed",
          description: formatWorkbenchError(
            error,
            "Unable to persist schema selection for this connection.",
          ),
          variant: "destructive",
        });
      }
    },
    [
      activeSchema,
      connection,
      hostApi.connections,
      hostApi.notifications,
      queryClient,
      refetchSchema,
      refetchSchemaOptions,
    ],
  );

  const handleSelectTable = useCallback((tableName: string) => {
    setSelectedTableName(tableName);
  }, []);

  const buildQualifiedTableName = useCallback(
    (tableName: string) => {
      const quotedTable = quoteIdentifier(connection.driver, tableName);
      if (connection.driver !== "postgres") {
        return quotedTable;
      }

      const schemaName =
        runtimeSchema?.trim() ||
        schemaSnapshot?.schema?.trim() ||
        connection.defaultSchema?.trim() ||
        "public";

      return `${quoteIdentifier(connection.driver, schemaName)}.${quotedTable}`;
    },
    [
      connection.defaultSchema,
      connection.driver,
      runtimeSchema,
      schemaSnapshot?.schema,
    ],
  );

  const handleRunStarterQuery = useCallback(
    async (tableName: string, mode: StarterQueryMode) => {
      setSelectedTableName(tableName);

      const qualifiedTable = buildQualifiedTableName(tableName);
      const table = schemaSnapshot?.tables.find((item) => item.name === tableName);
      const explicitColumns = (table?.columns ?? [])
        .map((column) => quoteIdentifier(connection.driver, column.name))
        .join(",\n  ");

      let nextSql = "";
      if (mode === "count") {
        nextSql = `SELECT COUNT(*) AS total_count\nFROM ${qualifiedTable};`;
      } else if (mode === "columns") {
        const columnProjection = explicitColumns || "*";
        nextSql = `SELECT\n  ${columnProjection}\nFROM ${qualifiedTable}\nLIMIT 100;`;
      } else {
        nextSql = `SELECT *\nFROM ${qualifiedTable}\nLIMIT 100;`;
      }

      updateActiveTabSql(nextSql);
      setResultTab("results");

      if (mode === "columns") {
        focusSqlEditor();
        return;
      }

      await handleExecute(nextSql);
    },
    [
      buildQualifiedTableName,
      connection.driver,
      focusSqlEditor,
      handleExecute,
      schemaSnapshot?.tables,
      updateActiveTabSql,
    ],
  );

  const handleOpenTable = useCallback(
    async (tableName: string) => {
      await handleRunStarterQuery(tableName, "select");
    },
    [handleRunStarterQuery],
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
      if (!results) return;

      const batch = results.batches[batchIndex];
      if (!batch) return;
      if (batch.pagingMode !== "offset" || !batch.hasMore) {
        if (batch.pagingMode === "unsupported") {
          hostApi.notifications.show({
            title: "Load more unavailable",
            description:
              batch.pagingReason ?? "Only single result-returning statements support load more.",
            variant: "destructive",
          });
        }
        return;
      }
      if (typeof batch.nextOffset !== "number") {
        hostApi.notifications.show({
          title: "Load more unavailable",
          description: "Next page offset was not provided by the runtime.",
          variant: "destructive",
        });
        return;
      }

      try {
        const moreBatch = await hostApi.connections.fetchMore({
          requestId: results.requestId,
          batchIndex,
          sql: batch.sql,
          connectionId: connection.id,
          schema: runtimeSchema,
          offset: batch.nextOffset,
          limit: 1000,
        });

        setResults((prev) => {
          if (!prev) return prev;
          const updatedBatches = prev.batches.map((b, i) => {
            if (i !== batchIndex) return b;
            const mergedRows = [...b.rows, ...moreBatch.rows];
            return {
              ...b,
              rows: mergedRows,
              totalRows: moreBatch.totalRows ?? b.totalRows,
              returnedRows: mergedRows.length,
              hasMore: moreBatch.hasMore,
              pagingMode: moreBatch.pagingMode,
              pagingReason: moreBatch.pagingReason,
              nextOffset: moreBatch.nextOffset,
              schema: moreBatch.schema ?? b.schema,
              elapsedMs: b.elapsedMs + moreBatch.elapsedMs,
            };
          });
          return { ...prev, batches: updatedBatches };
        });
      } catch (error) {
        hostApi.notifications.show({
          title: "Load more failed",
          description: formatWorkbenchError(
            error,
            "Unable to load additional rows for this result.",
          ),
          variant: "destructive",
        });
      }
    },
    [
      results,
      hostApi.connections,
      connection.id,
      hostApi.notifications,
      runtimeSchema,
    ],
  );

  // ──────────────────────────────────────────────
  // エクスポートハンドラー（runtime-backed scope）
  // ──────────────────────────────────────────────

  const handleExport = useCallback(
    async (scope: ExportScope, format: ExportFormat) => {
      if (!results || isExecuting || isExporting) return;

      const activeBatch = results.batches[activeBatchIndex];
      if (!activeBatch) return;

      const exportRequestId = crypto.randomUUID();
      setCurrentExportRequestId(exportRequestId);
      setIsExporting(true);

      try {
        const exportResult = await hostApi.connections.exportRows({
          connectionId: connection.id,
          requestId: exportRequestId,
          sql: activeBatch.sql,
          schema: runtimeSchema,
          format,
          scope,
          batchIndex: activeBatchIndex,
          loadedRows: scope === "full_result" ? undefined : activeBatch.rows,
          columns: scope === "full_result" ? undefined : activeBatch.columns,
          maxRows: scope === "full_result" ? 100_000 : undefined,
        });

        downloadBinaryResult(exportResult);

        const isTruncatedFile = exportResult.fileName
          .toLowerCase()
          .includes("truncated");
        const fullResultMayBeCapped =
          scope === "full_result" &&
          (isTruncatedFile || exportResult.successCount >= 100_000);

        if (fullResultMayBeCapped) {
          hostApi.notifications.show({
            title: "Export warning",
            description: "Full result export may be truncated at 100000 rows.",
            variant: "default",
          });
        } else {
          hostApi.notifications.show({
            title: "Export complete",
            description: `${exportResult.fileName} is ready to download.`,
            variant: "success",
          });
        }
      } catch (error) {
        const message = formatWorkbenchError(
          error,
          "Unable to export rows from the current result.",
        );
        const cancelled = /cancel|キャンセル/i.test(message);

        hostApi.notifications.show({
          title: cancelled ? "Export cancelled" : "Export failed",
          description: message,
          variant: cancelled ? "default" : "destructive",
        });
      } finally {
        setIsExporting(false);
        setCurrentExportRequestId(null);
      }
    },
    [
      activeBatchIndex,
      connection.id,
      hostApi.connections,
      hostApi.notifications,
      isExecuting,
      isExporting,
      results,
      runtimeSchema,
    ],
  );

  // activeIndex の同期（batches 更新時に範囲外を防ぐ）
  useEffect(() => {
    if (!results) {
      setActiveBatchIndex(0);
      return;
    }

    if (activeBatchIndex >= results.batches.length) {
      setActiveBatchIndex(Math.max(0, results.batches.length - 1));
    }
  }, [results, activeBatchIndex]);

  // ──────────────────────────────────────────────
  // レンダリング
  // ──────────────────────────────────────────────

  // アクティブバッチ（結果エクスポートメニュー用）
  const activeBatch = results?.batches[Math.min(activeBatchIndex, Math.max(0, (results?.batches.length ?? 1) - 1))];

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* 環境帯 — prod/test/dev 接続時のみ表示 */}
        <EnvironmentBand connection={connection} />

        <div className="shrink-0 border-b border-border bg-panel-muted/40 px-3 py-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Primary DB workspace
          </p>
        </div>

        {/* メインボディ: サイドバー + コンテンツエリア */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左サイドバー — ConnectionSidebar（200px 固定幅） */}
          <ConnectionSidebar
            connection={connection}
            connections={connections}
            onSwitchConnection={handleSwitchConnection}
            activeSchema={runtimeSchema}
            schemaOptions={schemaOptions}
            isSchemaListLoading={isSchemaOptionsLoading}
            onSchemaChange={handleSchemaChange}
            schemaSnapshot={schemaSnapshot}
            schemaError={schemaErrorMessage}
            isSchemaLoading={isSchemaLoading}
            onRefreshSchema={() => {
              void refetchSchema();
              if (connection.driver === "postgres") {
                void refetchSchemaOptions();
              }
            }}
            selectedTableName={selectedTableName}
            onSelectTable={handleSelectTable}
            onOpenTable={handleOpenTable}
            onRunStarterQuery={handleRunStarterQuery}
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

            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel-muted/70 px-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onClick={handleSaveSnippet}
              >
                Save snippet
              </Button>

              <label htmlFor="workbench-snippet-select" className="text-xs text-muted-foreground">
                Insert snippet
              </label>
              <select
                id="workbench-snippet-select"
                className="h-7 min-w-[180px] rounded-sm border border-border bg-background px-2 text-xs"
                value={selectedSnippetId}
                onChange={(event) => {
                  const nextSnippetId = event.target.value;
                  setSelectedSnippetId(nextSnippetId);
                  if (nextSnippetId) {
                    handleInsertSnippet(nextSnippetId);
                  }
                }}
              >
                <option value="">Insert snippet</option>
                {savedSnippets.map((snippet) => (
                  <option key={snippet.id} value={snippet.id}>
                    {snippet.name}
                  </option>
                ))}
              </select>

              <label htmlFor="workbench-recent-sql-select" className="text-xs text-muted-foreground">
                Recent SQL
              </label>
              <select
                id="workbench-recent-sql-select"
                className="h-7 min-w-[220px] rounded-sm border border-border bg-background px-2 text-xs"
                value={selectedRecentSql}
                onChange={(event) => {
                  const nextIndex = event.target.value;
                  setSelectedRecentSql(nextIndex);
                  if (nextIndex) {
                    handleInsertRecentSql(nextIndex);
                  }
                }}
              >
                <option value="">Recent SQL</option>
                {recentQueries.map((sql, index) => {
                  const oneLine = sql.replace(/\s+/g, " ").trim();
                  const preview =
                    oneLine.length > 72 ? `${oneLine.slice(0, 69)}...` : oneLine;
                  return (
                    <option key={`${index}-${preview}`} value={String(index)}>
                      {preview || "(empty SQL)"}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* エディター/結果エリア — react-resizable-panels で縦分割 */}
            <ResizablePanelGroup direction="vertical" className="flex-1">
              {/* エディターエリア: SqlEditorPane（flex-1） */}
              <ResizablePanel defaultSize={60} minSize={20}>
                <SqlEditorPane
                  sql={activeTab?.sql ?? ""}
                  dialect={connection.driver}
                  autocompleteContext={autocompleteContext}
                  onSqlChange={handleSqlChange}
                  onExecuteSelection={handleExecuteSelection}
                  onExecuteScript={handleExecuteScript}
                  onExplain={handleExplain}
                  onCancel={handleCancel}
                  onCloseTab={handleCloseActiveTab}
                  isExecuting={isExecuting || isExporting}
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
                        onExport={handleExport}
                        isExporting={isExporting}
                      />
                    )}
                  </div>

                  {/* 結果/EXPLAIN コンテンツエリア */}
                  <div className="flex-1 overflow-hidden">
                    {resultTab === "results" ? (
                      <div className="flex h-full flex-col overflow-hidden">
                        {queryError ? (
                          <InlineIssue
                            title="Current query could not be started"
                            description={queryError}
                          />
                        ) : null}
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <ResultGridPane
                            batches={results?.batches ?? []}
                            activeIndex={activeBatchIndex}
                            onActiveIndexChange={setActiveBatchIndex}
                            onLoadMore={handleLoadMore}
                            isLoading={isExecuting}
                            onStopOnErrorChange={setStopOnError}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col overflow-hidden">
                        {explainError ? (
                          <InlineIssue
                            title="Execution plan is unavailable"
                            description={explainError}
                          />
                        ) : null}
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <ExplainPlanPane
                            plan={explainPlan}
                            isLoading={isExplaining}
                          />
                        </div>
                      </div>
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
