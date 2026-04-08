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
import { AlertTriangle, GitCompare, Lock } from "lucide-react";
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
  DbGridEditPatchCell,
  DbGridEditSource,
  DbGridEditEligibility,
  DbGridPrepareCommitResponse,
  DbQueryBatchResult,
  DbQueryRow,
  DbDataDiffPreviewResponse,
  DbDataDiffDetailResponse,
  DbDataApplyPreviewResponse,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailResponse,
  DbDataSyncBlockerCode,
  DbDataApplySelection,
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
import { GridEditCommitDialog } from "./GridEditCommitDialog";
import { DataSyncRowDiffPane } from "./DataSyncRowDiffPane";
import type { DataSyncRowDiffEntry } from "./data-sync-row-diff";
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

function formatRowPkValue(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function isCellValueEqual(
  left: string | number | boolean | null,
  right: string | number | boolean | null,
): boolean {
  return left === right;
}

function buildRowPrimaryKey(
  row: DbQueryRow,
  batch: DbQueryBatchResult,
  primaryKeyColumns: string[],
): Record<string, string | number | boolean | null> | null {
  const rowPrimaryKey: Record<string, string | number | boolean | null> = {};
  for (const primaryKeyColumn of primaryKeyColumns) {
    const columnIndex = batch.columns.findIndex((column) => column.name === primaryKeyColumn);
    if (columnIndex < 0) return null;
    rowPrimaryKey[primaryKeyColumn] = row.values[columnIndex] ?? null;
  }
  return rowPrimaryKey;
}

function buildRowPkTuple(
  rowPrimaryKey: Record<string, string | number | boolean | null>,
  primaryKeyColumns: string[],
): string {
  return primaryKeyColumns
    .map((column) => `${column}=${formatRowPkValue(rowPrimaryKey[column] ?? null)}`)
    .join("|");
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(key(item), item);
  }
  return Array.from(map.values());
}

function hasBlockingDataSyncBlocker(
  blockers: { code: DbDataSyncBlockerCode }[] | undefined,
): boolean {
  if (!blockers || blockers.length === 0) return false;
  return blockers.some((blocker) =>
    blocker.code === "target_snapshot_changed" ||
    blocker.code === "artifact_expired" ||
    blocker.code === "readonly_target" ||
    blocker.code === "missing_stable_key"
  );
}

function describeDataSyncBlocker(code: DbDataSyncBlockerCode): string {
  if (code === "target_snapshot_changed") {
    return "Target snapshot changed after compare. Re-run compare before execute.";
  }
  if (code === "artifact_expired") {
    return "Compare artifact expired. Re-run compare preview.";
  }
  if (code === "unsafe_delete_threshold") {
    return "Delete volume crossed unsafe_delete_threshold. Operator confirmation required.";
  }
  if (code === "readonly_target") {
    return "Target connection is read-only and cannot apply changes.";
  }
  return "Missing stable key prevents deterministic row matching.";
}

function formatDataSyncCounts(counts: {
  insert: number;
  update: number;
  delete: number;
  unchanged: number;
}): string {
  return `I:${counts.insert} U:${counts.update} D:${counts.delete} =:${counts.unchanged}`;
}

function toDataSyncRowDiffEntry(
  detail: DbDataDiffDetailResponse,
): DataSyncRowDiffEntry[] {
  return detail.rows.map((row) => ({
    tableName: detail.tableName,
    rowKey: Object.fromEntries(
      Object.entries(row.rowKey).map(([key, value]) => {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          value === null
        ) {
          return [key, value];
        }
        return [key, String(value)];
      }),
    ),
    status: row.status,
    suggestedAction: row.suggestedAction,
    sourceRow: row.sourceRow,
    targetRow: row.targetRow,
    fieldDiffs: row.fieldDiffs.map((field) => ({
      columnName: field.columnName,
      sourceValue: field.sourceValue,
      targetValue: field.targetValue,
      changed: field.changed,
    })),
  }));
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
  const [pendingQuerySource, setPendingQuerySource] = useState<DbGridEditSource | null>(null);

  // Stop on error 状態（D-05: デフォルト ON）
  const [stopOnError, setStopOnError] = useState(true);

  // 結果エリアのアクティブタブ（Results / Explain）
  const [resultTab, setResultTab] = useState<"results" | "explain" | "sync">("results");
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [currentExportRequestId, setCurrentExportRequestId] = useState<string | null>(null);
  const [syncSourceConnectionId, setSyncSourceConnectionId] = useState(connection.id);
  const [syncTargetConnectionId, setSyncTargetConnectionId] = useState(connection.id);
  const [syncSelectedTables, setSyncSelectedTables] = useState<string[]>([]);
  const [diffPreview, setDiffPreview] = useState<DbDataDiffPreviewResponse | null>(null);
  const [diffDetail, setDiffDetail] = useState<DbDataDiffDetailResponse | null>(null);
  const [diffRows, setDiffRows] = useState<DataSyncRowDiffEntry[]>([]);
  const [selectedDiffRowIndex, setSelectedDiffRowIndex] = useState(0);
  const [syncIncludeUnchanged, setSyncIncludeUnchanged] = useState(false);
  const [applyPreview, setApplyPreview] = useState<DbDataApplyPreviewResponse | null>(null);
  const [applyExecute, setApplyExecute] = useState<DbDataApplyExecuteResponse | null>(null);
  const [applyJobDetail, setApplyJobDetail] = useState<DbDataApplyJobDetailResponse | null>(null);
  const [applyProdConfirmation, setApplyProdConfirmation] = useState("");
  const [syncIssue, setSyncIssue] = useState<string | null>(null);
  const [isDiffPreviewing, setIsDiffPreviewing] = useState(false);
  const [isApplyPreviewing, setIsApplyPreviewing] = useState(false);
  const [isApplyExecuting, setIsApplyExecuting] = useState(false);
  const [pendingEditCells, setPendingEditCells] = useState<Record<string, DbGridEditPatchCell>>({});
  const [preparedGridPlan, setPreparedGridPlan] = useState<DbGridPrepareCommitResponse | null>(null);
  const [isPreparingGridCommit, setIsPreparingGridCommit] = useState(false);
  const [isCommittingGridEdit, setIsCommittingGridEdit] = useState(false);
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
  const [lastGridEditSource, setLastGridEditSource] = useState<DbGridEditSource | null>(null);

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

  useEffect(() => {
    const tableNames = [...(schemaSnapshot?.tables ?? [])].map((table) => table.name);
    if (tableNames.length === 0) {
      setSyncSelectedTables([]);
      return;
    }

    setSyncSelectedTables((current) => {
      const filtered = current.filter((name) => tableNames.includes(name));
      if (filtered.length > 0) return filtered;
      if (selectedTableName && tableNames.includes(selectedTableName)) {
        return [selectedTableName];
      }
      return [tableNames[0]];
    });
  }, [schemaSnapshot, selectedTableName]);

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
    setPendingEditCells({});
    setPreparedGridPlan(null);
    setLastGridEditSource(null);
    setSyncSourceConnectionId(connection.id);
    setSyncTargetConnectionId(connection.id);
    setSyncSelectedTables([]);
    setDiffPreview(null);
    setDiffDetail(null);
    setDiffRows([]);
    setSelectedDiffRowIndex(0);
    setSyncIncludeUnchanged(false);
    setApplyPreview(null);
    setApplyExecute(null);
    setApplyJobDetail(null);
    setApplyProdConfirmation("");
    setSyncIssue(null);
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

  const deriveBatchEditMetadata = useCallback(
    (
      batch: DbQueryBatchResult,
      source: DbGridEditSource | null,
    ): {
      eligibility: DbGridEditEligibility;
      primaryKeyColumns: string[];
      columns: DbQueryBatchResult["columns"];
      normalizedSource: DbGridEditSource;
    } => {
      const normalizedSource: DbGridEditSource = source ?? {
        kind: "custom-sql",
        schema: runtimeSchema,
      };

      if (!source) {
        return {
          eligibility: {
            eligible: false,
            reasons: [
              {
                code: "unsupported_source",
                message: "Only starter table queries are editable in this phase.",
              },
            ],
          },
          primaryKeyColumns: [],
          columns: batch.columns,
          normalizedSource,
        };
      }

      if (connection.readonly) {
        return {
          eligibility: {
            eligible: false,
            reasons: [
              {
                code: "readonly_connection",
                message: "This connection is read-only.",
              },
            ],
          },
          primaryKeyColumns: [],
          columns: batch.columns,
          normalizedSource,
        };
      }

      if (source.kind === "starter-count") {
        return {
          eligibility: {
            eligible: false,
            reasons: [
              {
                code: "count_result",
                message: "Count rows results are read-only. Run Select top 100 to edit rows.",
              },
            ],
          },
          primaryKeyColumns: [],
          columns: batch.columns,
          normalizedSource,
        };
      }

      if (batch.error) {
        return {
          eligibility: {
            eligible: false,
            reasons: [
              {
                code: "result_error",
                message: "Current batch has an error and cannot be edited.",
              },
            ],
          },
          primaryKeyColumns: [],
          columns: batch.columns,
          normalizedSource,
        };
      }

      if (batch.rows.length === 0) {
        return {
          eligibility: {
            eligible: false,
            reasons: [
              {
                code: "empty_result",
                message: "No rows are loaded for editing.",
              },
            ],
          },
          primaryKeyColumns: [],
          columns: batch.columns,
          normalizedSource,
        };
      }

      const tableName = source.tableName?.trim();
      if (!tableName) {
        return {
          eligibility: {
            eligible: false,
            reasons: [
              {
                code: "unsupported_source",
                message: "Starter source is missing table context.",
              },
            ],
          },
          primaryKeyColumns: [],
          columns: batch.columns,
          normalizedSource,
        };
      }

      const matchedTable = schemaSnapshot?.tables.find((table) => table.name === tableName);
      if (!matchedTable) {
        return {
          eligibility: {
            eligible: false,
            reasons: [
              {
                code: "table_not_found",
                message: "Table metadata is not available for this result batch.",
              },
            ],
          },
          primaryKeyColumns: [],
          columns: batch.columns,
          normalizedSource,
        };
      }

      const primaryKeyColumns = matchedTable.columns
        .filter((column) => column.primaryKey)
        .map((column) => column.name);

      if (primaryKeyColumns.length === 0) {
        return {
          eligibility: {
            eligible: false,
            reasons: [
              {
                code: "missing_primary_key",
                message: "Selected table has no detectable primary key columns.",
              },
            ],
          },
          primaryKeyColumns: [],
          columns: batch.columns,
          normalizedSource,
        };
      }

      const missingPkColumns = primaryKeyColumns.filter(
        (primaryKeyColumn) =>
          !batch.columns.some((column) => column.name === primaryKeyColumn),
      );
      if (missingPkColumns.length > 0) {
        return {
          eligibility: {
            eligible: false,
            reasons: missingPkColumns.map((missingPrimaryKeyColumn) => ({
              code: "missing_primary_key_column" as const,
              message: `Result is missing primary key column: ${missingPrimaryKeyColumn}`,
            })),
          },
          primaryKeyColumns,
          columns: batch.columns,
          normalizedSource,
        };
      }

      const seenTuples = new Set<string>();
      for (const row of batch.rows) {
        const rowPrimaryKey = buildRowPrimaryKey(row, batch, primaryKeyColumns);
        if (!rowPrimaryKey) {
          return {
            eligibility: {
              eligible: false,
              reasons: [
                {
                  code: "missing_primary_key_column",
                  message: "Failed to resolve row primary key mapping.",
                },
              ],
            },
            primaryKeyColumns,
            columns: batch.columns,
            normalizedSource,
          };
        }

        const rowPkTuple = buildRowPkTuple(rowPrimaryKey, primaryKeyColumns);
        if (seenTuples.has(rowPkTuple)) {
          return {
            eligibility: {
              eligible: false,
              reasons: [
                {
                  code: "duplicate_primary_key_tuple",
                  message: "Duplicate primary key tuples detected in loaded rows.",
                },
              ],
            },
            primaryKeyColumns,
            columns: batch.columns,
            normalizedSource,
          };
        }
        seenTuples.add(rowPkTuple);
      }

      const decoratedColumns = batch.columns.map((column) => {
        const matchedColumn = matchedTable.columns.find(
          (tableColumn) => tableColumn.name === column.name,
        );
        return {
          ...column,
          sourceTable: tableName,
          sourceSchema: source.schema ?? runtimeSchema,
          sourceColumn: matchedColumn?.name ?? column.name,
          isPrimaryKey: primaryKeyColumns.includes(column.name),
        };
      });

      return {
        eligibility: {
          eligible: true,
          reasons: [],
        },
        primaryKeyColumns,
        columns: decoratedColumns,
        normalizedSource,
      };
    },
    [connection.readonly, runtimeSchema, schemaSnapshot?.tables],
  );

  const decorateResultsForEdit = useCallback(
    (response: QueryExecutionResponse, source: DbGridEditSource | null): QueryExecutionResponse => {
      const batches = response.batches.map((batch) => {
        const metadata = deriveBatchEditMetadata(batch, source);
        return {
          ...batch,
          columns: metadata.columns,
          editEligibility: metadata.eligibility,
          editSource: metadata.normalizedSource,
          primaryKeyColumns: metadata.primaryKeyColumns,
        };
      });
      return {
        ...response,
        batches,
      };
    },
    [deriveBatchEditMetadata],
  );

  // ──────────────────────────────────────────────
  // クエリ実行コア関数
  // ──────────────────────────────────────────────

  /**
   * 実際のクエリ実行（危険 SQL 確認後に呼び出す）。
   * confirmed=true の場合、Rust 層でも危険 SQL チェックを通過させる（サーバーサイド強制）。
   */
  const executeImmediate = useCallback(
    async (
      sql: string,
      confirmed: boolean,
      source: DbGridEditSource | null,
    ) => {
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
        setResults(decorateResultsForEdit(response, source));
        setLastGridEditSource(source);
        setPendingEditCells({});
        setPreparedGridPlan(null);
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
      decorateResultsForEdit,
      hostApi.connections,
      hostApi.notifications,
      setLastGridEditSource,
      setPendingEditCells,
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
    async (sql: string, source: DbGridEditSource | null = null) => {
      if (!sql.trim() || isExecuting || isExporting) return;

      setPendingSql(sql);
      setPendingQuerySource(source);
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
          await executeImmediate(sql, false, source);
        }
      } catch {
        // previewDangerousSql のエラーは無視して実行を試みる
        await executeImmediate(sql, false, source);
      }
    },
    [
      connection.id,
      hostApi.connections,
      isExecuting,
      isExporting,
      executeImmediate,
    ],
  );

  /**
   * 危険 SQL ダイアログで "Run anyway" / "Confirm and run" を押した場合。
   * confirmed=true で再実行する（Rust 層が独立して危険 SQL を再検証し通過させる）。
   */
  const handleDangerConfirm = useCallback(async () => {
    setShowDangerDialog(false);
    setDangerPreview(null);

    if (pendingSql) {
      await executeImmediate(pendingSql, true, pendingQuerySource);
      setPendingSql(null);
      setPendingQuerySource(null);
    }
  }, [pendingQuerySource, pendingSql, executeImmediate]);

  /** ダイアログキャンセル */
  const handleDangerCancel = useCallback(() => {
    setShowDangerDialog(false);
    setDangerPreview(null);
    setPendingSql(null);
    setPendingQuerySource(null);
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
        setPendingEditCells({});
        setPreparedGridPlan(null);
        setLastGridEditSource(null);
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

      const source: DbGridEditSource = {
        kind:
          mode === "count"
            ? "starter-count"
            : mode === "columns"
              ? "starter-columns"
              : "starter-select",
        tableName,
        schema: runtimeSchema,
        queryMode: mode,
      };

      updateActiveTabSql(nextSql);
      setResultTab("results");
      setLastGridEditSource(source);

      if (mode === "columns") {
        focusSqlEditor();
        return;
      }

      await handleExecute(nextSql, source);
    },
    [
      buildQualifiedTableName,
      connection.driver,
      focusSqlEditor,
      handleExecute,
      runtimeSchema,
      schemaSnapshot?.tables,
      setLastGridEditSource,
      updateActiveTabSql,
    ],
  );

  const handleOpenTable = useCallback(
    async (tableName: string) => {
      await handleRunStarterQuery(tableName, "select");
    },
    [handleRunStarterQuery],
  );

  const buildDataApplySelections = useCallback((): DbDataApplySelection[] => {
    return diffRows
      .filter((row) => row.suggestedAction && row.suggestedAction !== "ignore")
      .map((row) => ({
        tableName: row.tableName,
        rowKey: row.rowKey,
        action:
          row.suggestedAction === "insert"
            ? "insert"
            : row.suggestedAction === "delete"
              ? "delete"
              : "update",
      }));
  }, [diffRows]);

  const handleLoadDataDiffDetail = useCallback(
    async (tableName: string, includeUnchanged = syncIncludeUnchanged) => {
      if (!diffPreview?.compareId) return;
      try {
        const detail = await hostApi.connections.fetchDataDiffDetail({
          compareId: diffPreview.compareId,
          tableName,
          limit: 200,
          offset: 0,
          includeUnchanged,
        });
        setDiffDetail(detail);
        setDiffRows(toDataSyncRowDiffEntry(detail));
        setSelectedDiffRowIndex(0);
      } catch (error) {
        setSyncIssue(
          formatWorkbenchError(
            error,
            "Failed to load row-level compare detail.",
          ),
        );
      }
    },
    [diffPreview?.compareId, hostApi.connections, syncIncludeUnchanged],
  );

  const handlePreviewDataDiff = useCallback(async () => {
    const tables = syncSelectedTables.length > 0
      ? syncSelectedTables
      : selectedTableName
        ? [selectedTableName]
        : [];
    if (tables.length === 0) {
      setSyncIssue("Select at least one table before compare.");
      return;
    }

    setIsDiffPreviewing(true);
    setSyncIssue(null);
    setResultTab("sync");
    setDiffDetail(null);
    setDiffRows([]);
    setSelectedDiffRowIndex(0);
    setApplyPreview(null);
    setApplyExecute(null);
    setApplyJobDetail(null);
    try {
      const preview = await hostApi.connections.previewDataDiff({
        sourceConnectionId: syncSourceConnectionId,
        targetConnectionId: syncTargetConnectionId,
        tables: tables.map((tableName) => ({
          tableName,
          keyColumns: [],
          compareColumns: [],
        })),
      });
      setDiffPreview(preview);
      const firstTable = preview.tableSummaries[0]?.tableName;
      if (firstTable) {
        void handleLoadDataDiffDetail(firstTable, syncIncludeUnchanged);
      }
    } catch (error) {
      setSyncIssue(
        formatWorkbenchError(
          error,
          "Failed to preview data diff for source -> target.",
        ),
      );
    } finally {
      setIsDiffPreviewing(false);
    }
  }, [
    handleLoadDataDiffDetail,
    hostApi.connections,
    selectedTableName,
    syncSelectedTables,
    syncSourceConnectionId,
    syncTargetConnectionId,
    syncIncludeUnchanged,
  ]);

  const handlePreviewDataApply = useCallback(async () => {
    if (!diffPreview) {
      setSyncIssue("Run compare preview first.");
      return;
    }

    const selections = buildDataApplySelections();
    if (selections.length === 0) {
      setSyncIssue("No row actions are selected for apply preview.");
      return;
    }
    setIsApplyPreviewing(true);
    setSyncIssue(null);
    setResultTab("sync");
    try {
      const preview = await hostApi.connections.previewDataApply({
        compareId: diffPreview.compareId,
        sourceConnectionId: syncSourceConnectionId,
        targetConnectionId: syncTargetConnectionId,
        targetSnapshotHash: diffPreview.targetSnapshotHash,
        currentTargetSnapshotHash: diffDetail?.currentTargetSnapshotHash,
        selections,
        deleteWarningThreshold: 500,
      });
      setApplyPreview(preview);
    } catch (error) {
      setSyncIssue(
        formatWorkbenchError(
          error,
          "Failed to preview apply operation.",
        ),
      );
    } finally {
      setIsApplyPreviewing(false);
    }
  }, [
    buildDataApplySelections,
    diffDetail?.currentTargetSnapshotHash,
    diffPreview,
    hostApi.connections,
    syncSourceConnectionId,
    syncTargetConnectionId,
  ]);

  const handleLoadDataApplyJobDetail = useCallback(
    async (jobId: string) => {
      const detail = await hostApi.connections.fetchDataApplyJobDetail({ jobId });
      setApplyJobDetail(detail);
      return detail;
    },
    [hostApi.connections],
  );

  const handleExecuteDataApply = useCallback(async () => {
    if (!diffPreview || !applyPreview) {
      setSyncIssue("Run apply preview before execute.");
      return;
    }
    if (hasBlockingDataSyncBlocker(applyPreview.blockers)) {
      const codes = applyPreview.blockers.map((blocker) => blocker.code).join(", ");
      setSyncIssue(
        `Execution blocked by sync guards: ${codes}. Re-run compare when target_snapshot_changed or artifact_expired is present.`,
      );
      return;
    }
    if (!applyPreview.executable) {
      setSyncIssue("Apply preview is not executable yet. Resolve warnings before execute.");
      return;
    }

    const targetConnection = connections.find((item) => item.id === syncTargetConnectionId);
    const requiresProdConfirmation = targetConnection?.environment === "prod";
    if (requiresProdConfirmation && applyProdConfirmation !== targetConnection.database) {
      setSyncIssue("Execution requires typed confirmation for prod target database.");
      return;
    }

    setIsApplyExecuting(true);
    setSyncIssue(null);
    setResultTab("sync");
    try {
      const executeResult = await hostApi.connections.executeDataApply({
        compareId: diffPreview.compareId,
        sourceConnectionId: syncSourceConnectionId,
        targetConnectionId: syncTargetConnectionId,
        targetSnapshotHash: applyPreview.targetSnapshotHash,
        currentTargetSnapshotHash: applyPreview.currentTargetSnapshotHash,
        selections: buildDataApplySelections(),
      });
      setApplyExecute(executeResult);
      await handleLoadDataApplyJobDetail(executeResult.jobId);
    } catch (error) {
      setSyncIssue(
        formatWorkbenchError(
          error,
          "Failed to execute apply operation.",
        ),
      );
    } finally {
      setIsApplyExecuting(false);
    }
  }, [
    applyPreview,
    applyProdConfirmation,
    buildDataApplySelections,
    connections,
    diffPreview,
    handleLoadDataApplyJobDetail,
    hostApi.connections,
    syncSourceConnectionId,
    syncTargetConnectionId,
  ]);

  const handleToggleSyncTable = useCallback((tableName: string) => {
    setSyncSelectedTables((current) => {
      if (current.includes(tableName)) {
        const next = current.filter((name) => name !== tableName);
        return next.length > 0 ? next : [tableName];
      }
      return [...current, tableName];
    });
  }, []);

  const handleChangeSyncRowAction = useCallback(
    (rowIndex: number, nextAction: "insert" | "update" | "delete" | "ignore") => {
      setDiffRows((current) =>
        current.map((row, index) =>
          index === rowIndex ? { ...row, suggestedAction: nextAction } : row,
        ),
      );
      setApplyPreview(null);
      setApplyExecute(null);
      setApplyJobDetail(null);
    },
    [],
  );

  const handleToggleIncludeUnchangedRows = useCallback(
    (nextIncludeUnchanged: boolean) => {
      setSyncIncludeUnchanged(nextIncludeUnchanged);
      if (diffDetail) {
        void handleLoadDataDiffDetail(diffDetail.tableName, nextIncludeUnchanged);
      }
    },
    [diffDetail, handleLoadDataDiffDetail],
  );

  const handleEditCell = useCallback((patch: DbGridEditPatchCell) => {
    const patchKey = `${patch.rowPkTuple}::${patch.columnName}`;
    setPendingEditCells((previous) => {
      const next = { ...previous };
      if (isCellValueEqual(patch.beforeValue, patch.nextValue)) {
        delete next[patchKey];
        return next;
      }
      next[patchKey] = patch;
      return next;
    });
    setPreparedGridPlan(null);
  }, []);

  const handleDiscardGridEdits = useCallback(() => {
    setPendingEditCells({});
    setPreparedGridPlan(null);
  }, []);

  const handlePrepareGridCommit = useCallback(async () => {
    if (!results) return;
    const activeBatch = results.batches[activeBatchIndex];
    if (!activeBatch) return;

    if (activeBatch.editEligibility?.eligible !== true) {
      const reason =
        activeBatch.editEligibility?.reasons[0]?.message ??
        "Current batch is read-only for safe editing.";
      hostApi.notifications.show({
        title: "Cannot prepare commit",
        description: reason,
        variant: "destructive",
      });
      return;
    }

    const source = activeBatch.editSource ?? lastGridEditSource;
    const tableName = source?.tableName?.trim();
    if (!source || !tableName) {
      hostApi.notifications.show({
        title: "Cannot prepare commit",
        description: "Editable source table context is missing.",
        variant: "destructive",
      });
      return;
    }

    const primaryKeyColumns = activeBatch.primaryKeyColumns ?? [];
    if (primaryKeyColumns.length === 0) {
      hostApi.notifications.show({
        title: "Cannot prepare commit",
        description: "Primary key columns are missing for this editable batch.",
        variant: "destructive",
      });
      return;
    }

    const patchCells = uniqueBy(
      Object.values(pendingEditCells),
      (patch) => `${patch.rowPkTuple}::${patch.columnName}`,
    );
    if (patchCells.length === 0) {
      hostApi.notifications.show({
        title: "No pending edits",
        description: "Edit at least one non-primary-key cell before preparing commit.",
        variant: "default",
      });
      return;
    }

    setIsPreparingGridCommit(true);
    try {
      const prepared = await hostApi.connections.prepareGridCommit({
        connectionId: connection.id,
        schema: runtimeSchema,
        tableName,
        source,
        primaryKeyColumns,
        patchCells,
      });
      setPreparedGridPlan(prepared);
      hostApi.notifications.show({
        title: "Commit plan prepared",
        description: `${prepared.affectedRows} rows ready for review.`,
        variant: "success",
      });
    } catch (error) {
      hostApi.notifications.show({
        title: "Prepare commit failed",
        description: formatWorkbenchError(
          error,
          "Failed to prepare safe edit commit preview.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsPreparingGridCommit(false);
    }
  }, [
    activeBatchIndex,
    connection.id,
    hostApi.connections,
    hostApi.notifications,
    lastGridEditSource,
    pendingEditCells,
    results,
    runtimeSchema,
  ]);

  const handleCommitGridEdits = useCallback(async () => {
    if (!preparedGridPlan || isCommittingGridEdit) return;
    setIsCommittingGridEdit(true);

    try {
      const result = await hostApi.connections.commitGridEdits({
        connectionId: connection.id,
        planId: preparedGridPlan.planId,
        planHash: preparedGridPlan.planHash,
      });

      if (typeof result.failedSqlIndex === "number") {
        hostApi.notifications.show({
          title: "Commit rolled back",
          description:
            result.message ??
            `Statement ${result.failedSqlIndex + 1} failed and the transaction was rolled back.`,
          variant: "destructive",
        });
        setPreparedGridPlan(null);
        return;
      }

      setPendingEditCells({});
      setPreparedGridPlan(null);

      if (selectedTableName) {
        await handleRunStarterQuery(selectedTableName, "select");
      }

      hostApi.notifications.show({
        title: "Commit applied",
        description: `${result.committedRows} row updates committed.`,
        variant: "success",
      });
    } catch (error) {
      hostApi.notifications.show({
        title: "Commit failed",
        description: formatWorkbenchError(
          error,
          "Failed to commit prepared row edits.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsCommittingGridEdit(false);
    }
  }, [
    connection.id,
    handleRunStarterQuery,
    hostApi.connections,
    hostApi.notifications,
    isCommittingGridEdit,
    preparedGridPlan,
    selectedTableName,
  ]);

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

  useEffect(() => {
    setPendingEditCells({});
    setPreparedGridPlan(null);
  }, [activeBatchIndex, results?.requestId]);

  // ──────────────────────────────────────────────
  // レンダリング
  // ──────────────────────────────────────────────

  // アクティブバッチ（結果エクスポートメニュー用）
  const activeBatch = results?.batches[Math.min(activeBatchIndex, Math.max(0, (results?.batches.length ?? 1) - 1))];
  const pendingEditCount = Object.keys(pendingEditCells).length;
  const activeEditEligibility = activeBatch?.editEligibility;
  const activePrimaryKeyColumns = activeBatch?.primaryKeyColumns ?? [];
  const activeEditBlockReason =
    activeEditEligibility && !activeEditEligibility.eligible
      ? activeEditEligibility.reasons[0]?.message ?? "Current result is read-only."
      : null;
  const syncAvailableTableNames = (schemaSnapshot?.tables ?? [])
    .map((table) => table.name)
    .sort((left, right) => left.localeCompare(right));
  const activeDiffRow = diffRows[selectedDiffRowIndex] ?? null;
  const syncConnectionOptions = connections.length > 0 ? connections : [connection];
  const activeSyncSourceConnection =
    connections.find((item) => item.id === syncSourceConnectionId) ?? connection;
  const activeSyncTargetConnection =
    connections.find((item) => item.id === syncTargetConnectionId) ?? connection;
  const syncRequiresProdTypedConfirmation = activeSyncTargetConnection.environment === "prod";
  const applyPreviewHasBlockingGuard = hasBlockingDataSyncBlocker(applyPreview?.blockers);
  const applyPreviewHasUnsafeDeleteWarning =
    applyPreview?.blockers.some((blocker) => blocker.code === "unsafe_delete_threshold") ?? false;
  const activeApplyJobId = applyExecute?.jobId ?? applyJobDetail?.jobId ?? null;
  const canExecuteDataApply =
    Boolean(diffPreview) &&
    Boolean(applyPreview) &&
    !isApplyExecuting &&
    !applyPreviewHasBlockingGuard &&
    applyPreview?.executable === true &&
    (!syncRequiresProdTypedConfirmation ||
      applyProdConfirmation === activeSyncTargetConnection.database);

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
                        setResultTab(v as "results" | "explain" | "sync")
                      }
                    >
                      <TabsList className="h-7">
                        <TabsTrigger value="results" className="h-6 text-xs">
                          Results
                        </TabsTrigger>
                        <TabsTrigger value="explain" className="h-6 text-xs">
                          Explain
                        </TabsTrigger>
                        <TabsTrigger value="sync" className="h-6 text-xs">
                          <GitCompare className="mr-1 h-3.5 w-3.5" />
                          Sync
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
                    {resultTab === "sync" && (
                      <div className="text-[11px] text-muted-foreground">
                        source -&gt; target
                      </div>
                    )}
                  </div>

                  {/* 結果/EXPLAIN/SYNC コンテンツエリア */}
                  <div className="flex-1 overflow-hidden">
                    {resultTab === "results" ? (
                      <div className="flex h-full flex-col overflow-hidden">
                        {queryError ? (
                          <InlineIssue
                            title="Current query could not be started"
                            description={queryError}
                          />
                        ) : null}
                        {!queryError && activeEditBlockReason ? (
                          <InlineIssue
                            title="Result is currently read-only"
                            description={activeEditBlockReason}
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
                            editEligibility={activeEditEligibility}
                            primaryKeyColumns={activePrimaryKeyColumns}
                            pendingEditCount={pendingEditCount}
                            onEditCell={handleEditCell}
                            onPrepareCommit={handlePrepareGridCommit}
                            onDiscardEdits={handleDiscardGridEdits}
                          />
                        </div>
                      </div>
                    ) : resultTab === "explain" ? (
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
                    ) : (
                      <div className="flex h-full flex-col overflow-hidden">
                        {syncIssue ? (
                          <InlineIssue
                            title="Data sync action failed"
                            description={syncIssue}
                          />
                        ) : null}

                        <div className="shrink-0 border-b border-border bg-background px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="inline-flex items-center gap-1 font-medium text-foreground">
                              <GitCompare className="h-3.5 w-3.5 text-muted-foreground" />
                              source -&gt; target
                            </span>
                            <span className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
                              {activeSyncSourceConnection.name} -&gt; {activeSyncTargetConnection.name}
                            </span>
                            {diffPreview ? (
                              <>
                                <span className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
                                  compareId: {diffPreview.compareId}
                                </span>
                                <span className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
                                  {formatDataSyncCounts(diffPreview.statusCounts)}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>

                        <div className="shrink-0 border-b border-border bg-panel-muted/40 px-3 py-2">
                          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
                            <div className="space-y-1">
                              <label htmlFor="sync-source-connection" className="text-[11px] font-medium text-muted-foreground">
                                Source connection
                              </label>
                              <select
                                id="sync-source-connection"
                                className="h-8 w-full rounded-sm border border-border bg-background px-2 text-xs"
                                value={syncSourceConnectionId}
                                onChange={(event) => setSyncSourceConnectionId(event.target.value)}
                              >
                                {syncConnectionOptions.map((item) => (
                                  <option key={`sync-source-${item.id}`} value={item.id}>
                                    {item.name} ({item.environment ?? "dev"}) / {item.database}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label htmlFor="sync-target-connection" className="text-[11px] font-medium text-muted-foreground">
                                Target connection
                              </label>
                              <select
                                id="sync-target-connection"
                                className="h-8 w-full rounded-sm border border-border bg-background px-2 text-xs"
                                value={syncTargetConnectionId}
                                onChange={(event) => setSyncTargetConnectionId(event.target.value)}
                              >
                                {syncConnectionOptions.map((item) => (
                                  <option key={`sync-target-${item.id}`} value={item.id}>
                                    {item.name} ({item.environment ?? "dev"}) / {item.database}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => {
                                void handlePreviewDataDiff();
                              }}
                              disabled={isDiffPreviewing || syncSelectedTables.length === 0}
                            >
                              {isDiffPreviewing ? "Comparing..." : "Compare source -> target"}
                            </Button>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {syncAvailableTableNames.length === 0 ? (
                              <span className="text-[11px] text-muted-foreground">
                                No tables detected for sync compare.
                              </span>
                            ) : (
                              syncAvailableTableNames.map((tableName) => {
                                const selected = syncSelectedTables.includes(tableName);
                                return (
                                  <label
                                    key={`sync-table-${tableName}`}
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px]",
                                      selected
                                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                        : "border-border bg-background text-muted-foreground",
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={() => handleToggleSyncTable(tableName)}
                                    />
                                    <span className="font-mono">{tableName}</span>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>

                        <div className="min-h-0 flex flex-1 overflow-hidden">
                          <div className="w-[280px] shrink-0 border-r border-border">
                            <div className="border-b border-border bg-panel-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              Compare Summary
                            </div>
                            <div className="h-full overflow-auto p-2">
                              {!diffPreview ? (
                                <p className="text-xs text-muted-foreground">
                                  Run compare preview to inspect per-table insert/update/delete deltas.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {diffPreview.tableSummaries.map((summary) => {
                                    const active = diffDetail?.tableName === summary.tableName;
                                    return (
                                      <button
                                        key={`summary-${summary.tableName}`}
                                        type="button"
                                        onClick={() => {
                                          void handleLoadDataDiffDetail(summary.tableName);
                                        }}
                                        className={cn(
                                          "w-full rounded-sm border p-2 text-left text-xs",
                                          active
                                            ? "border-emerald-500/40 bg-emerald-500/10"
                                            : "border-border bg-background hover:bg-muted/30",
                                        )}
                                      >
                                        <p className="truncate font-mono text-[11px] font-semibold">
                                          {summary.tableName}
                                        </p>
                                        <p className="mt-1 text-[11px] text-muted-foreground">
                                          {formatDataSyncCounts(summary.statusCounts)}
                                        </p>
                                        {summary.blockerCodes.length > 0 ? (
                                          <p className="mt-1 text-[11px] text-destructive">
                                            {summary.blockerCodes.join(", ")}
                                          </p>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="w-[320px] shrink-0 border-r border-border">
                            <div className="flex items-center justify-between border-b border-border bg-panel-muted/40 px-3 py-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                Row Deltas
                              </span>
                              <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={syncIncludeUnchanged}
                                  onChange={(event) =>
                                    handleToggleIncludeUnchangedRows(event.target.checked)
                                  }
                                />
                                include unchanged
                              </label>
                            </div>
                            <div className="h-full overflow-auto p-2">
                              {!diffDetail ? (
                                <p className="text-xs text-muted-foreground">
                                  Select a table summary to load row-level diff detail.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {diffDetail.blockers.length > 0 ? (
                                    <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                                      {diffDetail.blockers.map((blocker) => (
                                        <p key={`detail-blocker-${blocker.code}`}>
                                          {blocker.code}: {describeDataSyncBlocker(blocker.code)}
                                        </p>
                                      ))}
                                    </div>
                                  ) : null}
                                  {diffRows.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                      No row differences found in current table.
                                    </p>
                                  ) : (
                                    diffRows.map((row, index) => {
                                      const active = index === selectedDiffRowIndex;
                                      const rowKeyLabel = Object.entries(row.rowKey)
                                        .map(([key, value]) => `${key}=${value ?? "null"}`)
                                        .join(", ");
                                      return (
                                        <div
                                          key={`row-diff-${index}-${rowKeyLabel}`}
                                          className={cn(
                                            "rounded-sm border p-2",
                                            active
                                              ? "border-emerald-500/40 bg-emerald-500/10"
                                              : "border-border bg-background",
                                          )}
                                        >
                                          <button
                                            type="button"
                                            className="w-full text-left"
                                            onClick={() => setSelectedDiffRowIndex(index)}
                                          >
                                            <p className="truncate font-mono text-[11px]">{rowKeyLabel}</p>
                                            <p className="mt-1 text-[11px] text-muted-foreground">
                                              {row.status}
                                            </p>
                                          </button>
                                          <div className="mt-2">
                                            <label className="mb-1 block text-[11px] text-muted-foreground">
                                              Apply action
                                            </label>
                                            <select
                                              className="h-7 w-full rounded-sm border border-border bg-background px-2 text-xs"
                                              value={row.suggestedAction ?? "ignore"}
                                              onChange={(event) =>
                                                handleChangeSyncRowAction(
                                                  index,
                                                  event.target.value as "insert" | "update" | "delete" | "ignore",
                                                )
                                              }
                                            >
                                              <option value="insert">insert</option>
                                              <option value="update">update</option>
                                              <option value="delete">delete</option>
                                              <option value="ignore">ignore</option>
                                            </select>
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="min-w-0 flex-1 overflow-hidden bg-background">
                            <DataSyncRowDiffPane entry={activeDiffRow} className="h-full" />
                          </div>
                        </div>

                        <div className="shrink-0 border-t border-border bg-panel-muted/40 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => {
                                void handlePreviewDataApply();
                              }}
                              disabled={!diffPreview || isApplyPreviewing}
                            >
                              {isApplyPreviewing ? "Previewing..." : "Preview apply"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="h-8 text-xs"
                              disabled={!canExecuteDataApply}
                              onClick={() => {
                                void handleExecuteDataApply();
                              }}
                            >
                              {isApplyExecuting ? "Executing..." : "Execute apply"}
                            </Button>
                            {activeApplyJobId ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => {
                                  void handleLoadDataApplyJobDetail(activeApplyJobId);
                                }}
                              >
                                View job detail
                              </Button>
                            ) : null}
                          </div>

                          {applyPreview ? (
                            <div className="mt-2 space-y-1 text-[11px]">
                              <p className="font-mono text-foreground">
                                apply preview: {formatDataSyncCounts(applyPreview.statusCounts)}
                              </p>
                              <p className="text-muted-foreground">
                                target snapshot {applyPreview.currentTargetSnapshotHash}
                              </p>
                              <p className="text-muted-foreground">
                                executable: {applyPreview.executable ? "yes" : "no"}
                              </p>
                              {applyPreview.sqlPreviewLines.length > 0 ? (
                                <pre className="max-h-28 overflow-auto rounded-sm border border-border bg-background p-2 font-mono text-[11px]">
                                  {applyPreview.sqlPreviewLines.join("\n")}
                                </pre>
                              ) : null}
                              {applyPreview.blockers.length > 0 ? (
                                <div
                                  className={cn(
                                    "rounded-sm border p-2",
                                    applyPreviewHasBlockingGuard
                                      ? "border-destructive/40 bg-destructive/5 text-destructive"
                                      : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                                  )}
                                >
                                  {applyPreview.blockers.map((blocker) => (
                                    <p key={`apply-blocker-${blocker.code}`}>
                                      {blocker.code}: {describeDataSyncBlocker(blocker.code)}
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                              {applyPreviewHasUnsafeDeleteWarning ? (
                                <p className="text-amber-700 dark:text-amber-300">
                                  unsafe_delete_threshold warning is active. Review delete volume before execute.
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          {syncRequiresProdTypedConfirmation && (
                            <div className="mt-2 rounded-sm border border-destructive/30 bg-destructive/5 p-2">
                              <p className="text-[11px] text-destructive">
                                typed confirmation required for prod target.
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Type target database name: {activeSyncTargetConnection.database}
                              </p>
                              <input
                                value={applyProdConfirmation}
                                onChange={(event) => setApplyProdConfirmation(event.target.value)}
                                placeholder={activeSyncTargetConnection.database}
                                className="mt-1 h-8 w-full rounded-sm border border-border bg-background px-2 text-xs"
                              />
                            </div>
                          )}

                          {applyExecute ? (
                            <div className="mt-2 rounded-sm border border-border bg-background p-2 text-[11px]">
                              <p className="font-mono">
                                apply result job: {applyExecute.jobId} ({applyExecute.status})
                              </p>
                              <p className="mt-1 text-muted-foreground">
                                {formatDataSyncCounts(applyExecute.statusCounts)}
                              </p>
                            </div>
                          ) : null}

                          {applyJobDetail ? (
                            <div className="mt-2 rounded-sm border border-border bg-background p-2 text-[11px]">
                              <p className="font-mono">
                                job detail: {applyJobDetail.jobId} ({applyJobDetail.status})
                              </p>
                              <p className="mt-1 text-muted-foreground">
                                created: {applyJobDetail.createdAt}
                                {applyJobDetail.finishedAt ? ` / finished: ${applyJobDetail.finishedAt}` : ""}
                              </p>
                            </div>
                          ) : null}
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

      {/* 行編集コミット確認ダイアログ（DATA-02 / DATA-03） */}
      <GridEditCommitDialog
        open={preparedGridPlan !== null}
        affectedRows={preparedGridPlan?.affectedRows ?? 0}
        changedColumnsSummary={preparedGridPlan?.changedColumnsSummary ?? []}
        sqlPreviewLines={preparedGridPlan?.sqlPreviewLines ?? []}
        previewTruncated={preparedGridPlan?.previewTruncated ?? false}
        isConfirming={isCommittingGridEdit}
        onConfirm={handleCommitGridEdits}
        onCancel={() => setPreparedGridPlan(null)}
      />

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
