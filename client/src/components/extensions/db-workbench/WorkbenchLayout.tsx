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

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { AlertTriangle, FileSearch, GitCompare, Lock } from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  emitLiveVerificationCompleted,
  emitLiveVerificationFlow,
  readReleaseVerificationConfig,
} from "@/lib/release-verification";
import type {
  BinaryCommandResult,
  DbConnectionConfig,
  DbSchemaDiffResult,
  DbSchemaSnapshot,
  DbTableSchema,
  QueryExecutionResponse,
  DbExplainPlan,
  DangerousSqlPreview,
  DbGridEditPatchCell,
  DbGridDeleteRowDraft,
  DbGridEditSource,
  DbGridEditEligibility,
  DbGridPrepareCommitResponse,
  DbObjectInspectionResponse,
  DbObjectKind,
  DbQueryBatchResult,
  DbQueryRow,
  DbDataDiffPreviewResponse,
  DbDataDiffDetailResponse,
  DbDataApplyPreviewResponse,
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailResponse,
  DbBackgroundJobSummary,
  DbDataSyncBlockerCode,
  DbDataApplySelection,
} from "@shared/schema";
import type { HostApi } from "@/extensions/host-api";
import { ConnectionSidebar } from "./ConnectionSidebar";
import { QueryTabs, loadTabsForConnection, defaultTab } from "./QueryTabs";
import type { QueryTab } from "./QueryTabs";
import {
  deleteSnippet,
  loadSessionForConnection,
  recordQueryRun,
  saveSessionForConnection,
  saveSnippet,
  type QueryRunHistoryEntry,
  type QueryRunMode,
  type WorkbenchInspectionTarget,
  type WorkbenchResultTab,
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
import { JobCenterPane } from "./JobCenterPane";
import { ObjectInspectionPane } from "./ObjectInspectionPane";
import { SaveSnippetDialog } from "./SaveSnippetDialog";
import { SqlLibraryDialog } from "./SqlLibraryDialog";
import { SqlParametersDialog } from "./SqlParametersDialog";
import { SqlScriptReviewDialog } from "./SqlScriptReviewDialog";
import {
  buildPendingDeleteRowSummaries,
  buildPendingEditRowSummaries,
} from "./grid-edit-summary";
import type { DataSyncRowDiffEntry } from "./data-sync-row-diff";
import { buildAutocompleteContext } from "./sql-autocomplete";
import {
  buildSqlLibraryEntries,
  filterSqlLibraryEntries,
} from "./sql-library";
import {
  detectSqlParameters,
  renderSqlParameters,
  type SqlParameterDefinition,
  type SqlParameterInputValue,
} from "./sql-parameters";
import {
  splitSqlStatements,
  type SqlStatementSegment,
} from "./sql-statements";
import { WorkbenchSchemaDiffPane } from "./SchemaDiffPane";
import {
  buildDataApplyNotification,
  isDataApplyJobActive,
  mergeDataApplyExecutionDetail,
} from "./data-apply-runtime";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type StarterQueryMode = "select" | "count" | "columns";

const DATA_SYNC_APPLY_READY_MESSAGE =
  "Apply executes real insert, update, and delete statements against the target connection. Review blockers and SQL preview before running it.";
const DATA_SYNC_DELETE_WARNING_THRESHOLD = 500;
const QUERY_RESULT_WINDOW_LIMIT = 5000;

type SyncTableConfigDraft = {
  keyColumnsText: string;
  compareColumnsText: string;
  whereClause: string;
};

type SyncTableRuntimeMetadata = {
  availableColumns: string[];
  defaultKeyColumns: string[];
  defaultCompareColumns: string[];
  sourceExists: boolean;
  targetExists: boolean;
};

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

function normalizeIdentifierList(input: string): string[] {
  const seen = new Set<string>();
  const identifiers: string[] = [];
  for (const value of input.split(",")) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    identifiers.push(normalized);
  }
  return identifiers;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function collectPrimaryKeyColumns(table: DbTableSchema | null): string[] {
  if (!table) {
    return [];
  }
  return table.columns
    .filter((column) => column.primaryKey)
    .map((column) => column.name);
}

function collectUniqueKeyColumns(table: DbTableSchema | null): string[] {
  if (!table) {
    return [];
  }
  const uniqueIndex = (table.indexes ?? []).find(
    (index) => index.unique && index.columns.length > 0,
  );
  return uniqueIndex?.columns ?? [];
}

function collectUnionColumnNames(
  sourceTable: DbTableSchema | null,
  targetTable: DbTableSchema | null,
): string[] {
  return uniqueStrings([
    ...(sourceTable?.columns.map((column) => column.name) ?? []),
    ...(targetTable?.columns.map((column) => column.name) ?? []),
  ]);
}

function resolveRuntimeSyncMetadata(
  sourceTable: DbTableSchema | null,
  targetTable: DbTableSchema | null,
): SyncTableRuntimeMetadata {
  const availableColumns = collectUnionColumnNames(sourceTable, targetTable);
  const primaryKeyColumns = uniqueStrings([
    ...collectPrimaryKeyColumns(sourceTable),
    ...collectPrimaryKeyColumns(targetTable),
  ]);
  const defaultKeyColumns =
    primaryKeyColumns.length > 0
      ? primaryKeyColumns
      : uniqueStrings([
          ...collectUniqueKeyColumns(sourceTable),
          ...collectUniqueKeyColumns(targetTable),
        ]);
  const keyColumnSet = new Set(defaultKeyColumns);
  const defaultCompareColumns = availableColumns.filter(
    (column) => !keyColumnSet.has(column),
  );

  return {
    availableColumns,
    defaultKeyColumns,
    defaultCompareColumns,
    sourceExists: !!sourceTable,
    targetExists: !!targetTable,
  };
}

function formatColumnPreview(
  columns: string[],
  fallback: string,
  limit = 6,
): string {
  if (columns.length === 0) {
    return fallback;
  }
  if (columns.length <= limit) {
    return columns.join(", ");
  }
  return `${columns.slice(0, limit).join(", ")} +${columns.length - limit} more`;
}

function getLoadedRowOffset(batch: DbQueryBatchResult): number {
  const offset = batch.loadedRowOffset;
  if (typeof offset !== "number" || Number.isNaN(offset)) {
    return 0;
  }
  return Math.max(0, Math.trunc(offset));
}

function getLoadedRowCount(batch: DbQueryBatchResult): number {
  const explicit = batch.loadedRowCount;
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return Math.max(0, Math.trunc(explicit));
  }
  return Math.max(batch.rows.length, Math.trunc(batch.returnedRows || 0));
}

function trimRowsForMemory(
  batch: DbQueryBatchResult,
  rows: DbQueryRow[],
  protectedRowPkTuples: Set<string>,
): { rows: DbQueryRow[]; droppedRows: number } {
  const overflow = rows.length - QUERY_RESULT_WINDOW_LIMIT;
  if (overflow <= 0) {
    return { rows, droppedRows: 0 };
  }

  const primaryKeyColumns = batch.primaryKeyColumns ?? [];
  if (primaryKeyColumns.length === 0 || protectedRowPkTuples.size === 0) {
    return {
      rows: rows.slice(overflow),
      droppedRows: overflow,
    };
  }

  let droppedRows = 0;
  const retainedRows: DbQueryRow[] = [];

  for (const row of rows) {
    if (droppedRows < overflow) {
      const rowPrimaryKey = buildRowPrimaryKey(row, batch, primaryKeyColumns);
      const rowPkTuple = rowPrimaryKey
        ? buildRowPkTuple(rowPrimaryKey, primaryKeyColumns)
        : null;
      if (!rowPkTuple || !protectedRowPkTuples.has(rowPkTuple)) {
        droppedRows += 1;
        continue;
      }
    }

    retainedRows.push(row);
  }

  return {
    rows: retainedRows,
    droppedRows,
  };
}

function getCurrentPageRows(batch: DbQueryBatchResult): DbQueryRow[] {
  if (batch.rows.length === 0) {
    return [];
  }

  const currentPageSize = Math.max(
    1,
    Math.min(batch.rows.length, Math.trunc(batch.returnedRows || 0)),
  );
  return batch.rows.slice(batch.rows.length - currentPageSize);
}

function hasBlockingDataSyncBlocker(
  blockers: { code: DbDataSyncBlockerCode }[] | undefined,
): boolean {
  if (!blockers || blockers.length === 0) return false;
  return blockers.some((blocker) =>
    blocker.code === "target_snapshot_changed" ||
    blocker.code === "artifact_expired" ||
    blocker.code === "readonly_target" ||
    blocker.code === "missing_stable_key" ||
    blocker.code === "unsafe_delete_confirmation_required" ||
    blocker.code === "target_database_confirmation_required"
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
  if (code === "unsafe_delete_confirmation_required") {
    return "Explicit unsafe delete confirmation is required before execute.";
  }
  if (code === "readonly_target") {
    return "Target connection is read-only and cannot apply changes.";
  }
  if (code === "target_database_confirmation_required") {
    return "Typed target database confirmation is required before execute.";
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

function backgroundJobSortValue(job: { startedAt?: string; createdAt: string }): number {
  return Date.parse(job.startedAt ?? job.createdAt) || 0;
}

function mergeBackgroundJobs(
  current: DbBackgroundJobSummary[],
  incoming: DbBackgroundJobSummary[],
): DbBackgroundJobSummary[] {
  const map = new Map(current.map((job) => [job.jobId, job]));
  for (const job of incoming) {
    map.set(job.jobId, {
      ...(map.get(job.jobId) ?? {}),
      ...job,
    });
  }
  return Array.from(map.values()).sort(
    (left, right) => backgroundJobSortValue(right) - backgroundJobSortValue(left),
  );
}

function toBackgroundJobSummary(detail: DbDataApplyJobDetailResponse): DbBackgroundJobSummary {
  return {
    jobId: detail.jobId,
    jobKind: "data-apply",
    title: "Data Sync Apply",
    sourceConnectionId: detail.sourceConnectionId,
    targetConnectionId: detail.targetConnectionId,
    status: detail.status,
    statusCounts: detail.statusCounts,
    blockers: detail.blockers,
    tableCount: uniqueBy(detail.tableResults, (result) => result.tableName).length,
    primaryTableName: detail.tableResults[0]?.tableName,
    statementCount: detail.statementCount,
    sqlPreviewLines: detail.sqlPreviewLines,
    previewTruncated: detail.previewTruncated,
    failureSummary: detail.tableResults.find((result) => result.error)?.error,
    createdAt: detail.createdAt,
    startedAt: detail.startedAt,
    finishedAt: detail.finishedAt,
  };
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
  queryHistory: QueryRunHistoryEntry[];
  snippets: SavedSqlSnippet[];
  selectedTableName: string | null;
  activeSchema: string | null;
  lastResultTab: WorkbenchResultTab;
  inspectionTarget: WorkbenchInspectionTarget | null;
  schemaDiffTargetConnectionId: string | null;
  syncSourceConnectionId: string | null;
  syncTargetConnectionId: string | null;
  selectedJobId: string | null;
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
    queryHistory: loadedSession.queryHistory,
    snippets: loadedSession.snippets,
    selectedTableName: loadedSession.selectedTableName,
    activeSchema: loadedSession.activeSchema,
    lastResultTab: loadedSession.lastResultTab,
    inspectionTarget: loadedSession.inspectionTarget,
    schemaDiffTargetConnectionId: loadedSession.schemaDiffTargetConnectionId,
    syncSourceConnectionId: loadedSession.syncSourceConnectionId,
    syncTargetConnectionId: loadedSession.syncTargetConnectionId,
    selectedJobId: loadedSession.selectedJobId,
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
  /** 打开连接管理面板 */
  onManageConnections: () => void;
  /** 工作台内で接続を切り替えるコールバック */
  onSwitchConnection: (connectionId: string) => void;
}

interface PendingSqlParameterReview {
  sql: string;
  source: DbGridEditSource | null;
  cursorOffset?: number;
  parameters: SqlParameterDefinition[];
  mode: QueryRunMode;
}

interface PendingSqlScriptReview {
  sql: string;
  statements: SqlStatementSegment[];
}

function isCancelledQueryMessage(message: string): boolean {
  return /cancel|cancelled|canceled|キャンセル/i.test(message);
}

function buildQueryRunEntryFromResponse(
  sql: string,
  mode: QueryRunMode,
  response: QueryExecutionResponse,
) {
  const failedIndexes = response.batches.flatMap((batch, index) =>
    batch.error ? [index] : [],
  );
  const status =
    failedIndexes.length === 0
      ? "success"
      : failedIndexes.length === response.batches.length
        ? "failed"
        : "partial";

  return {
    sql,
    mode,
    status,
    statementCount: Math.max(1, response.batches.length),
    returnedRows: response.batches.reduce((sum, batch) => sum + batch.returnedRows, 0),
    affectedRows: response.batches.reduce(
      (sum, batch) => sum + (typeof batch.affectedRows === "number" ? batch.affectedRows : 0),
      0,
    ),
    elapsedMs: response.batches.reduce((sum, batch) => sum + batch.elapsedMs, 0),
    failedStatementIndex: failedIndexes[0] ?? null,
    errorMessage:
      failedIndexes.length > 0 ? response.batches[failedIndexes[0]]?.error ?? null : null,
  } as const;
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
  onManageConnections,
  onSwitchConnection,
}: WorkbenchLayoutProps) {
  const releaseVerification = readReleaseVerificationConfig();
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
  const [queryHistory, setQueryHistory] = useState<QueryRunHistoryEntry[]>(
    initialSession.queryHistory,
  );
  const [savedSnippets, setSavedSnippets] = useState<SavedSqlSnippet[]>(
    initialSession.snippets,
  );
  const [selectedTableName, setSelectedTableName] = useState<string | null>(
    initialSession.selectedTableName,
  );
  const [saveSnippetDialogOpen, setSaveSnippetDialogOpen] = useState(false);
  const [pendingSnippetName, setPendingSnippetName] = useState("");
  const [sqlLibraryOpen, setSqlLibraryOpen] = useState(false);
  const [sqlLibrarySearch, setSqlLibrarySearch] = useState("");
  const [selectedSqlLibraryEntryId, setSelectedSqlLibraryEntryId] = useState("");

  // ──────────────────────────────────────────────
  // クエリ実行・結果状態
  // ──────────────────────────────────────────────

  const [isExecuting, setIsExecuting] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [results, setResults] = useState<QueryExecutionResponse | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const trimmedBatchAlertsRef = useRef<Set<number>>(new Set());

  // EXPLAIN 状態
  const [explainPlan, setExplainPlan] = useState<DbExplainPlan | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  // 危険 SQL ダイアログ状態
  const [dangerPreview, setDangerPreview] =
    useState<DangerousSqlPreview | null>(null);
  const [showDangerDialog, setShowDangerDialog] = useState(false);
  const [pendingSql, setPendingSql] = useState<string | null>(null);
  const [pendingCursorOffset, setPendingCursorOffset] = useState<number | undefined>(undefined);
  const [pendingQuerySource, setPendingQuerySource] = useState<DbGridEditSource | null>(null);
  const [pendingQueryMode, setPendingQueryMode] = useState<QueryRunMode>("statement");
  const [pendingParameterReview, setPendingParameterReview] =
    useState<PendingSqlParameterReview | null>(null);
  const [parameterValues, setParameterValues] = useState<Record<string, SqlParameterInputValue>>(
    {},
  );
  const [pendingScriptReview, setPendingScriptReview] =
    useState<PendingSqlScriptReview | null>(null);

  // Stop on error 状態（D-05: デフォルト ON）
  const [stopOnError, setStopOnError] = useState(true);

  // 結果エリアのアクティブタブ（Results / Explain）
  const [resultTab, setResultTab] = useState<WorkbenchResultTab>(
    initialSession.lastResultTab,
  );
  const [backgroundJobs, setBackgroundJobs] = useState<DbBackgroundJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialSession.selectedJobId);
  const [isRefreshingJobs, setIsRefreshingJobs] = useState(false);
  const [jobCenterIssue, setJobCenterIssue] = useState<string | null>(null);
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [currentExportRequestId, setCurrentExportRequestId] = useState<string | null>(null);
  const [objectInspection, setObjectInspection] = useState<DbObjectInspectionResponse | null>(null);
  const [isInspectingObject, setIsInspectingObject] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [schemaDiffTargetConnectionId, setSchemaDiffTargetConnectionId] = useState(connection.id);
  const [schemaDiffSourceSnapshot, setSchemaDiffSourceSnapshot] = useState<DbSchemaSnapshot | null>(null);
  const [schemaDiffTargetSnapshot, setSchemaDiffTargetSnapshot] = useState<DbSchemaSnapshot | null>(null);
  const [schemaDiffResult, setSchemaDiffResult] = useState<DbSchemaDiffResult | null>(null);
  const [schemaDiffIssue, setSchemaDiffIssue] = useState<string | null>(null);
  const [isSchemaDiffing, setIsSchemaDiffing] = useState(false);
  const [syncSourceConnectionId, setSyncSourceConnectionId] = useState(connection.id);
  const [syncTargetConnectionId, setSyncTargetConnectionId] = useState(connection.id);
  const [syncSelectedTables, setSyncSelectedTables] = useState<string[]>([]);
  const [syncTableConfigs, setSyncTableConfigs] = useState<Record<string, SyncTableConfigDraft>>(
    {},
  );
  const [diffPreview, setDiffPreview] = useState<DbDataDiffPreviewResponse | null>(null);
  const [diffDetail, setDiffDetail] = useState<DbDataDiffDetailResponse | null>(null);
  const [diffRows, setDiffRows] = useState<DataSyncRowDiffEntry[]>([]);
  const [selectedDiffRowIndex, setSelectedDiffRowIndex] = useState(0);
  const [syncIncludeUnchanged, setSyncIncludeUnchanged] = useState(false);
  const [applyPreview, setApplyPreview] = useState<DbDataApplyPreviewResponse | null>(null);
  const [applyExecute, setApplyExecute] = useState<DbDataApplyExecuteResponse | null>(null);
  const [applyJobDetail, setApplyJobDetail] = useState<DbDataApplyJobDetailResponse | null>(null);
  const [applyProdConfirmation, setApplyProdConfirmation] = useState("");
  const [applyUnsafeDeleteConfirmed, setApplyUnsafeDeleteConfirmed] = useState(false);
  const [syncIssue, setSyncIssue] = useState<string | null>(null);
  const [isDiffPreviewing, setIsDiffPreviewing] = useState(false);
  const [isApplyPreviewing, setIsApplyPreviewing] = useState(false);
  const [isExecutingApply, setIsExecutingApply] = useState(false);
  const [pendingEditCells, setPendingEditCells] = useState<Record<string, DbGridEditPatchCell>>({});
  const [pendingDeleteRows, setPendingDeleteRows] = useState<Record<string, DbGridDeleteRowDraft>>({});
  const [preparedGridPlan, setPreparedGridPlan] = useState<DbGridPrepareCommitResponse | null>(null);
  const [isPreparingGridCommit, setIsPreparingGridCommit] = useState(false);
  const [isCommittingGridEdit, setIsCommittingGridEdit] = useState(false);
  const [activeSchema, setActiveSchema] = useState<string>(() =>
    connection.driver === "postgres"
      ? (initialSession.activeSchema ?? connection.defaultSchema?.trim() ?? "public")
      : "public",
  );
  const [restoredInspectionTarget, setRestoredInspectionTarget] =
    useState<WorkbenchInspectionTarget | null>(initialSession.inspectionTarget);
  const queryClient = useQueryClient();

  const runtimeSchema = connection.driver === "postgres" ? activeSchema : undefined;
  const [lastGridEditSource, setLastGridEditSource] = useState<DbGridEditSource | null>(null);
  const activeQueryRequestIdRef = useRef<string | null>(null);
  const activeExportRequestIdRef = useRef<string | null>(null);
  const liveVerificationRunKeyRef = useRef<string | null>(null);

  useEffect(() => {
    trimmedBatchAlertsRef.current.clear();
  }, [connection.id, results?.requestId]);

  useEffect(() => {
    setObjectInspection(null);
    setInspectError(null);
  }, [connection.id, runtimeSchema]);

  // 接続リスト（切替ドロップダウン用）
  const { data: connections = [] } = useQuery({
    queryKey: ["connections"],
    queryFn: () => hostApi.connections.list(),
  });

  useEffect(() => {
    const compareTargets = connections.filter((item) => item.id !== connection.id);
    const fallbackTargetId = compareTargets[0]?.id ?? "";
    if (connections.length === 0) {
      return;
    }
    setSchemaDiffTargetConnectionId((current) => {
      if (current && compareTargets.some((item) => item.id === current)) {
        return current;
      }
      return fallbackTargetId;
    });
  }, [connection.id, connections]);

  useEffect(() => {
    setSchemaDiffSourceSnapshot(null);
    setSchemaDiffTargetSnapshot(null);
    setSchemaDiffResult(null);
    setSchemaDiffIssue(null);
    setIsSchemaDiffing(false);
  }, [connection.id]);

  useEffect(() => {
    setSchemaDiffSourceSnapshot(null);
    setSchemaDiffTargetSnapshot(null);
    setSchemaDiffResult(null);
    setSchemaDiffIssue(null);
  }, [schemaDiffTargetConnectionId]);

  useEffect(() => {
    if (connections.length === 0) {
      return;
    }

    setSyncSourceConnectionId((current) =>
      current && connections.some((item) => item.id === current)
        ? current
        : connection.id,
    );
    setSyncTargetConnectionId((current) =>
      current && connections.some((item) => item.id === current)
        ? current
        : connection.id,
    );
  }, [connection.id, connections]);

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
    data: syncSourceSnapshotData,
    isFetching: isSyncSourceSnapshotLoading,
    error: syncSourceSnapshotError,
  } = useQuery({
    queryKey: ["db-workbench-sync-schema", syncSourceConnectionId],
    queryFn: () => hostApi.connections.introspect(syncSourceConnectionId),
    staleTime: 30_000,
    retry: false,
    enabled: syncSourceConnectionId !== connection.id,
  });
  const {
    data: syncTargetSnapshotData,
    isFetching: isSyncTargetSnapshotLoading,
    error: syncTargetSnapshotError,
  } = useQuery({
    queryKey: ["db-workbench-sync-schema", syncTargetConnectionId],
    queryFn: () => hostApi.connections.introspect(syncTargetConnectionId),
    staleTime: 30_000,
    retry: false,
    enabled: syncTargetConnectionId !== connection.id,
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
  const syncSourceSnapshot =
    syncSourceConnectionId === connection.id
      ? schemaSnapshot ?? null
      : syncSourceSnapshotData ?? null;
  const syncTargetSnapshot =
    syncTargetConnectionId === connection.id
      ? schemaSnapshot ?? null
      : syncTargetSnapshotData ?? null;
  const syncTableMetadataByName = useMemo(() => {
    const sourceTables = new Map<string, DbTableSchema>(
      (syncSourceSnapshot?.tables ?? []).map((table) => [table.name, table]),
    );
    const targetTables = new Map<string, DbTableSchema>(
      (syncTargetSnapshot?.tables ?? []).map((table) => [table.name, table]),
    );
    const tableNames = uniqueStrings([
      ...Array.from(sourceTables.keys()),
      ...Array.from(targetTables.keys()),
    ]).sort((left, right) => left.localeCompare(right));

    return {
      tableNames,
      metadataByName: tableNames.reduce<Record<string, SyncTableRuntimeMetadata>>(
        (accumulator, tableName) => {
          accumulator[tableName] = resolveRuntimeSyncMetadata(
            sourceTables.get(tableName) ?? null,
            targetTables.get(tableName) ?? null,
          );
          return accumulator;
        },
        {},
      ),
    };
  }, [syncSourceSnapshot, syncTargetSnapshot]);
  const syncAvailableTableNames = syncTableMetadataByName.tableNames;
  const syncSchemaIssueMessage = useMemo(() => {
    if (syncSourceConnectionId === connection.id && schemaQueryError) {
      return formatWorkbenchError(
        schemaQueryError,
        "Failed to load source connection schema for sync compare.",
      );
    }
    if (syncTargetConnectionId === connection.id && schemaQueryError) {
      return formatWorkbenchError(
        schemaQueryError,
        "Failed to load target connection schema for sync compare.",
      );
    }
    if (syncSourceSnapshotError) {
      return formatWorkbenchError(
        syncSourceSnapshotError,
        "Failed to load source connection schema for sync compare.",
      );
    }
    if (syncTargetSnapshotError) {
      return formatWorkbenchError(
        syncTargetSnapshotError,
        "Failed to load target connection schema for sync compare.",
      );
    }
    return null;
  }, [
    connection.id,
    schemaQueryError,
    syncSourceConnectionId,
    syncSourceSnapshotError,
    syncTargetConnectionId,
    syncTargetSnapshotError,
  ]);
  const isSyncSchemaLoading =
    (syncSourceConnectionId !== connection.id && isSyncSourceSnapshotLoading)
    || (syncTargetConnectionId !== connection.id && isSyncTargetSnapshotLoading);

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
    () => buildAutocompleteContext(schemaSnapshot, runtimeSchema, selectedTableName),
    [runtimeSchema, schemaSnapshot, selectedTableName],
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
    if (syncAvailableTableNames.length === 0) {
      setSyncSelectedTables([]);
      return;
    }

    setSyncSelectedTables((current) => {
      const filtered = current.filter((name) => syncAvailableTableNames.includes(name));
      if (filtered.length > 0) return filtered;
      if (selectedTableName && syncAvailableTableNames.includes(selectedTableName)) {
        return [selectedTableName];
      }
      return [syncAvailableTableNames[0]];
    });
  }, [selectedTableName, syncAvailableTableNames]);

  useEffect(() => {
    setSyncTableConfigs((current) => {
      const nextEntries = Object.entries(current).filter(([tableName]) =>
        syncAvailableTableNames.includes(tableName)
      );
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }
      return Object.fromEntries(nextEntries);
    });
  }, [syncAvailableTableNames]);

  useEffect(() => {
    setDiffPreview(null);
    setDiffDetail(null);
    setDiffRows([]);
    setSelectedDiffRowIndex(0);
    setApplyPreview(null);
    setApplyExecute(null);
  }, [syncSourceConnectionId, syncTargetConnectionId]);

  // ──────────────────────────────────────────────
  // アクティブタブ
  // ──────────────────────────────────────────────

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const sqlLibraryEntries = useMemo(
    () => buildSqlLibraryEntries(savedSnippets, recentQueries, queryHistory),
    [queryHistory, recentQueries, savedSnippets],
  );
  const filteredSqlLibraryEntries = useMemo(
    () => filterSqlLibraryEntries(sqlLibraryEntries, sqlLibrarySearch),
    [sqlLibraryEntries, sqlLibrarySearch],
  );
  const selectedSqlLibraryEntry = useMemo(
    () =>
      filteredSqlLibraryEntries.find((entry) => entry.id === selectedSqlLibraryEntryId) ??
      filteredSqlLibraryEntries[0] ??
      null,
    [filteredSqlLibraryEntries, selectedSqlLibraryEntryId],
  );
  const renderedParameterReview = useMemo(() => {
    if (!pendingParameterReview) {
      return null;
    }
    return renderSqlParameters(
      pendingParameterReview.sql,
      parameterValues,
      pendingParameterReview.cursorOffset,
    );
  }, [parameterValues, pendingParameterReview]);

  useEffect(() => {
    const loadedSession = loadSessionForConnection(connection.id);
    const restored = hydrateConnectionSession(connection.id, loadedSession);
    setTabs(restored.tabs);
    setActiveTabId(restored.activeTabId);
    setRecentQueries(restored.recentQueries);
    setQueryHistory(restored.queryHistory);
    setSavedSnippets(restored.snippets);
    setSelectedTableName(restored.selectedTableName);
    setActiveSchema(
      connection.driver === "postgres"
        ? (restored.activeSchema ?? connection.defaultSchema?.trim() ?? "public")
        : "public",
    );
    setResultTab(restored.lastResultTab);
    setRestoredInspectionTarget(restored.inspectionTarget);
    setSqlLibraryOpen(false);
    setSqlLibrarySearch("");
    setSelectedSqlLibraryEntryId("");
    setPendingParameterReview(null);
    setParameterValues({});
    setPendingScriptReview(null);
    setPendingEditCells({});
    setPendingDeleteRows({});
    setPreparedGridPlan(null);
    setLastGridEditSource(null);
    setObjectInspection(null);
    setSchemaDiffTargetConnectionId(restored.schemaDiffTargetConnectionId ?? "");
    setSyncSourceConnectionId(restored.syncSourceConnectionId ?? connection.id);
    setSyncTargetConnectionId(restored.syncTargetConnectionId ?? connection.id);
    setSelectedJobId(restored.selectedJobId);
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
    setApplyUnsafeDeleteConfirmed(false);
    setSyncIssue(null);
  }, [connection.defaultSchema, connection.driver, connection.id]);

  useEffect(() => {
    if (!sqlLibraryOpen) return;

    if (filteredSqlLibraryEntries.length === 0) {
      if (selectedSqlLibraryEntryId) {
        setSelectedSqlLibraryEntryId("");
      }
      return;
    }

    const hasSelection = filteredSqlLibraryEntries.some(
      (entry) => entry.id === selectedSqlLibraryEntryId,
    );
    if (!hasSelection) {
      setSelectedSqlLibraryEntryId(filteredSqlLibraryEntries[0]?.id ?? "");
    }
  }, [filteredSqlLibraryEntries, selectedSqlLibraryEntryId, sqlLibraryOpen]);

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
      queryHistory,
      snippets: savedSnippets,
      selectedTableName,
      activeSchema: connection.driver === "postgres" ? activeSchema : null,
      lastResultTab: resultTab,
      inspectionTarget: objectInspection
        ? {
            objectKind: objectInspection.objectKind,
            objectName: objectInspection.objectName,
            signature: objectInspection.signature ?? null,
            parentObjectName: objectInspection.parentObjectName ?? null,
          }
        : restoredInspectionTarget,
      schemaDiffTargetConnectionId,
      syncSourceConnectionId,
      syncTargetConnectionId,
      selectedJobId,
    });
  }, [
    activeSchema,
    activeTabId,
    connection.driver,
    connection.id,
    queryHistory,
    objectInspection,
    recentQueries,
    resultTab,
    restoredInspectionTarget,
    savedSnippets,
    schemaDiffTargetConnectionId,
    selectedJobId,
    selectedTableName,
    syncSourceConnectionId,
    syncTargetConnectionId,
    tabs,
  ]);

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

  const openSqlInNewTab = useCallback(
    (sql: string, label: string) => {
      const trimmedSql = sql.trim();
      if (!trimmedSql) return;

      setTabs((prev) => {
        const nextIndex = prev.length + 1;
        const normalizedLabel = label.trim();
        const newTab: QueryTab = {
          id: crypto.randomUUID(),
          label: normalizedLabel || `Query ${nextIndex}`,
          sql: trimmedSql,
          connectionId: connection.id,
        };
        setActiveTabId(newTab.id);
        return [...prev, newTab];
      });
    },
    [connection.id],
  );

  const handleOpenSqlLibrary = useCallback(() => {
    setSqlLibrarySearch("");
    setSelectedSqlLibraryEntryId(sqlLibraryEntries[0]?.id ?? "");
    setSqlLibraryOpen(true);
  }, [sqlLibraryEntries]);

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
    setPendingSnippetName(defaultName);
    setSaveSnippetDialogOpen(true);
  }, [activeTab?.label, activeTab?.sql, hostApi.notifications]);

  const handleCancelSaveSnippet = useCallback(() => {
    setSaveSnippetDialogOpen(false);
    setPendingSnippetName("");
  }, []);

  const handleConfirmSaveSnippet = useCallback(() => {
    const sqlToSave = activeTab?.sql ?? "";
    const snippetName = pendingSnippetName.trim();
    if (!sqlToSave.trim()) {
      hostApi.notifications.show({
        title: "Nothing to save",
        description: "Write SQL in the active tab before saving a snippet.",
        variant: "default",
      });
      setSaveSnippetDialogOpen(false);
      setPendingSnippetName("");
      return;
    }

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
    setSaveSnippetDialogOpen(false);
    setPendingSnippetName("");
    hostApi.notifications.show({
      title: "Snippet saved",
      description: `${snippetName} is available for this connection.`,
      variant: "success",
    });
  }, [activeTab?.sql, connection.id, hostApi.notifications, pendingSnippetName]);

  const handleReplaceSqlFromLibrary = useCallback(() => {
    if (!selectedSqlLibraryEntry) return;
    insertSqlIntoActiveTab(selectedSqlLibraryEntry.sql);
    setSqlLibraryOpen(false);
  }, [insertSqlIntoActiveTab, selectedSqlLibraryEntry]);

  const handleOpenSqlFromLibraryInNewTab = useCallback(() => {
    if (!selectedSqlLibraryEntry) return;
    const tabLabel =
      selectedSqlLibraryEntry.kind === "snippet"
        ? selectedSqlLibraryEntry.title
        : selectedSqlLibraryEntry.summary;
    openSqlInNewTab(selectedSqlLibraryEntry.sql, tabLabel);
    setSqlLibraryOpen(false);
  }, [openSqlInNewTab, selectedSqlLibraryEntry]);

  const handleDeleteSnippetFromLibrary = useCallback(() => {
    if (!selectedSqlLibraryEntry || selectedSqlLibraryEntry.kind !== "snippet") return;

    const nextSession = deleteSnippet(
      connection.id,
      selectedSqlLibraryEntry.snippetId ?? "",
    );
    setSavedSnippets(nextSession.snippets);
    hostApi.notifications.show({
      title: "Snippet deleted",
      description: `${selectedSqlLibraryEntry.title} was removed from this connection library.`,
      variant: "success",
    });
  }, [connection.id, hostApi.notifications, selectedSqlLibraryEntry]);

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
          loadedRowOffset: getLoadedRowOffset(batch),
          loadedRowCount: getLoadedRowCount(batch),
          rowWindowTruncated: batch.rowWindowTruncated === true ? true : undefined,
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
      mode: QueryRunMode,
      cursorOffset?: number,
    ): Promise<QueryExecutionResponse | null> => {
      const requestId = crypto.randomUUID();
      activeQueryRequestIdRef.current = requestId;
      setCurrentRequestId(requestId);
      setIsExecuting(true);
      setResults(null);
      setQueryError(null);

      try {
        const response = await hostApi.connections.executeQuery({
          connectionId: connection.id,
          sql,
          requestId,
          cursorOffset,
          schema: runtimeSchema,
          continueOnError: !stopOnError,
          // confirmed=true は Rust 層への危険 SQL バイパスシグナル（SAFE-01）
          confirmed: confirmed ? true : undefined,
        });
        if (activeQueryRequestIdRef.current !== requestId) {
          return null;
        }
        setResults(decorateResultsForEdit(response, source));
        setLastGridEditSource(source);
        setPendingEditCells({});
        setPendingDeleteRows({});
        setPreparedGridPlan(null);
        setActiveBatchIndex(0);
        setResultTab("results");
        const updatedSession = recordQueryRun(
          connection.id,
          buildQueryRunEntryFromResponse(sql, mode, response),
        );
        setRecentQueries(updatedSession.recentQueries);
        setQueryHistory(updatedSession.queryHistory);
        return response;
      } catch (error) {
        if (activeQueryRequestIdRef.current !== requestId) {
          return null;
        }
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
        if (!isCancelledQueryMessage(message)) {
          const updatedSession = recordQueryRun(connection.id, {
            sql,
            mode,
            status: "failed",
            statementCount:
              mode === "script" ? Math.max(1, splitSqlStatements(sql).length) : 1,
            errorMessage: message,
          });
          setRecentQueries(updatedSession.recentQueries);
          setQueryHistory(updatedSession.queryHistory);
        }
        return null;
      } finally {
        if (activeQueryRequestIdRef.current === requestId) {
          activeQueryRequestIdRef.current = null;
          setIsExecuting(false);
          setCurrentRequestId(null);
        }
      }
    },
    [
      connection.id,
      decorateResultsForEdit,
      hostApi.connections,
      hostApi.notifications,
      setLastGridEditSource,
      setPendingEditCells,
      setQueryHistory,
      runtimeSchema,
      stopOnError,
    ],
  );

  const previewAndExecuteSql = useCallback(
    async (
      sql: string,
      source: DbGridEditSource | null = null,
      mode: QueryRunMode = "statement",
      cursorOffset?: number,
    ) => {
      if (!sql.trim() || isExecuting || isExporting) return;

      setPendingSql(sql);
      setPendingCursorOffset(cursorOffset);
      setPendingQuerySource(source);
      setPendingQueryMode(mode);
      setQueryError(null);

      try {
        const preview = await hostApi.connections.previewDangerousSql(
          connection.id,
          sql,
          cursorOffset,
        );

        if (preview.dangers.length > 0) {
          setDangerPreview(preview);
          setShowDangerDialog(true);
        } else {
          await executeImmediate(sql, false, source, mode, cursorOffset);
          setPendingSql(null);
          setPendingCursorOffset(undefined);
          setPendingQuerySource(null);
          setPendingQueryMode("statement");
        }
      } catch {
        await executeImmediate(sql, false, source, mode, cursorOffset);
        setPendingSql(null);
        setPendingCursorOffset(undefined);
        setPendingQuerySource(null);
        setPendingQueryMode("statement");
      }
    },
    [
      connection.id,
      executeImmediate,
      hostApi.connections,
      isExecuting,
      isExporting,
      setPendingQueryMode,
    ],
  );

  const handleParameterValueChange = useCallback((name: string, rawValue: string) => {
    setParameterValues((prev) => ({
      ...prev,
      [name]: { rawValue },
    }));
  }, []);

  const handleCancelParameterReview = useCallback(() => {
    setPendingParameterReview(null);
    setParameterValues({});
  }, []);

  const handleConfirmParameterReview = useCallback(async () => {
    if (!pendingParameterReview) return;

    const rendered = renderSqlParameters(
      pendingParameterReview.sql,
      parameterValues,
      pendingParameterReview.cursorOffset,
    );

    setPendingParameterReview(null);
    setParameterValues({});
    await previewAndExecuteSql(
      rendered.sql,
      pendingParameterReview.source,
      pendingParameterReview.mode,
      rendered.cursorOffset,
    );
  }, [parameterValues, pendingParameterReview, previewAndExecuteSql]);

  /**
   * 実行前に危険 SQL チェックを行う。
   * 危険が検出された場合は確認ダイアログを表示し、ユーザーの判断を待つ。
   * 危険がない場合は即座に実行する。
   */
  const handleExecute = useCallback(
    async (
      sql: string,
      source: DbGridEditSource | null = null,
      mode: QueryRunMode = "statement",
      cursorOffset?: number,
    ) => {
      if (!sql.trim() || isExecuting || isExporting) return;

      const parameters = detectSqlParameters(sql);
      if (parameters.length > 0) {
        setPendingParameterReview({
          sql,
          source,
          cursorOffset,
          parameters,
          mode,
        });
        setParameterValues(
          Object.fromEntries(
            parameters.map((parameter) => [
              parameter.name,
              { rawValue: "" satisfies SqlParameterInputValue["rawValue"] },
            ]),
          ),
        );
        return;
      }

      await previewAndExecuteSql(sql, source, mode, cursorOffset);
    },
    [isExecuting, isExporting, previewAndExecuteSql],
  );

  /**
   * 危険 SQL ダイアログで "Run anyway" / "Confirm and run" を押した場合。
   * confirmed=true で再実行する（Rust 層が独立して危険 SQL を再検証し通過させる）。
   */
  const handleDangerConfirm = useCallback(async () => {
    setShowDangerDialog(false);
    setDangerPreview(null);

    if (pendingSql) {
      await executeImmediate(
        pendingSql,
        true,
        pendingQuerySource,
        pendingQueryMode,
        pendingCursorOffset,
      );
      setPendingSql(null);
      setPendingCursorOffset(undefined);
      setPendingQuerySource(null);
      setPendingQueryMode("statement");
    }
  }, [
    pendingCursorOffset,
    pendingQueryMode,
    pendingQuerySource,
    pendingSql,
    executeImmediate,
  ]);

  /** ダイアログキャンセル */
  const handleDangerCancel = useCallback(() => {
    setShowDangerDialog(false);
    setDangerPreview(null);
    setPendingSql(null);
    setPendingCursorOffset(undefined);
    setPendingQuerySource(null);
    setPendingQueryMode("statement");
  }, []);

  const handleCancelScriptReview = useCallback(() => {
    setPendingScriptReview(null);
  }, []);

  const handleConfirmScriptReview = useCallback(async () => {
    if (!pendingScriptReview) return;
    const sql = pendingScriptReview.sql;
    setPendingScriptReview(null);
    await handleExecute(sql, null, "script", undefined);
  }, [handleExecute, pendingScriptReview]);

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
      await handleExecute(sql, null, "statement", cursorOffset);
    },
    [isExecuting, handleExecute],
  );

  /**
   * フルスクリプト実行（Shift+Ctrl+Enter）。
   */
  const handleExecuteScript = useCallback(
    async (sql: string) => {
      if (!sql.trim() || isExecuting) return;
      const statements = splitSqlStatements(sql);
      if (statements.length > 1) {
        setPendingScriptReview({
          sql,
          statements,
        });
        return;
      }
      await handleExecute(sql, null, "script", undefined);
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
    const queryRequestId = currentRequestId;
    const exportRequestId = currentExportRequestId;
    const requestId = queryRequestId ?? exportRequestId;
    if (!requestId) return;

    if (requestId === queryRequestId) {
      activeQueryRequestIdRef.current = null;
      setIsExecuting(false);
      setCurrentRequestId(null);
    }
    if (requestId === exportRequestId) {
      activeExportRequestIdRef.current = null;
      setIsExporting(false);
      setCurrentExportRequestId(null);
    }

    try {
      await hostApi.connections.cancelQuery(requestId);
    } catch {
      // Ignore cancellation transport failures after the UI has already moved on.
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
        setPendingDeleteRows({});
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

  const handleInspectObject = useCallback(
    async (
      objectKind: DbObjectKind,
      objectName: string,
      options?: {
        signature?: string | null;
        parentObjectName?: string | null;
      },
    ): Promise<DbObjectInspectionResponse | null> => {
      setResultTab("inspect");
      setIsInspectingObject(true);
      setInspectError(null);

      try {
        const inspection = await hostApi.connections.inspectObject({
          connectionId: connection.id,
          schema: runtimeSchema,
          objectKind,
          objectName,
          signature: options?.signature ?? undefined,
          parentObjectName: options?.parentObjectName ?? undefined,
        });

        setObjectInspection(inspection);
        if (objectKind === "table") {
          setSelectedTableName(objectName);
        }
        return inspection;
      } catch (error) {
        const message = formatWorkbenchError(
          error,
          "Failed to inspect database object.",
        );
        setObjectInspection(null);
        setInspectError(message);
        hostApi.notifications.show({
          title: "Object inspection failed",
          description: message,
          variant: "destructive",
        });
        return null;
      } finally {
        setIsInspectingObject(false);
      }
    },
    [
      connection.id,
      hostApi.connections,
      hostApi.notifications,
      runtimeSchema,
    ],
  );

  useEffect(() => {
    if (!restoredInspectionTarget) {
      return;
    }

    void handleInspectObject(
      restoredInspectionTarget.objectKind,
      restoredInspectionTarget.objectName,
      {
        signature: restoredInspectionTarget.signature,
        parentObjectName: restoredInspectionTarget.parentObjectName,
      },
    );
    setRestoredInspectionTarget(null);
  }, [handleInspectObject, restoredInspectionTarget]);

  const handlePreviewSchemaDiff = useCallback(async () => {
    if (!schemaDiffTargetConnectionId) {
      setSchemaDiffIssue("Select a target connection before compare.");
      return;
    }

    setIsSchemaDiffing(true);
    setSchemaDiffIssue(null);
    setSchemaDiffSourceSnapshot(null);
    setSchemaDiffTargetSnapshot(null);
    setSchemaDiffResult(null);
    setResultTab("schema-diff");

    try {
      const [sourceSnapshot, targetSnapshot, result] = await Promise.all([
        hostApi.connections.introspect(connection.id),
        hostApi.connections.introspect(schemaDiffTargetConnectionId),
        hostApi.connections.diff(connection.id, schemaDiffTargetConnectionId),
      ]);
      setSchemaDiffSourceSnapshot(sourceSnapshot);
      setSchemaDiffTargetSnapshot(targetSnapshot);
      setSchemaDiffResult(result);
    } catch (error) {
      const message = formatWorkbenchError(
        error,
        "Failed to compare schema between active and target connections.",
      );
      setSchemaDiffIssue(message);
      hostApi.notifications.show({
        title: "Schema compare failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSchemaDiffing(false);
    }
  }, [
    connection.id,
    hostApi.connections,
    hostApi.notifications,
    schemaDiffTargetConnectionId,
  ]);

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

  const handleSyncTableConfigChange = useCallback(
    (
      tableName: string,
      field: keyof SyncTableConfigDraft,
      value: string,
    ) => {
      setSyncTableConfigs((current) => ({
        ...current,
        [tableName]: {
          keyColumnsText: current[tableName]?.keyColumnsText ?? "",
          compareColumnsText: current[tableName]?.compareColumnsText ?? "",
          whereClause: current[tableName]?.whereClause ?? "",
          [field]: value,
        },
      }));
    },
    [],
  );

  const handlePreviewDataDiff = useCallback(async () => {
    if (isSyncSchemaLoading) {
      setSyncIssue("Wait for source/target schema metadata to finish loading before compare.");
      return;
    }
    if (syncSchemaIssueMessage) {
      setSyncIssue(syncSchemaIssueMessage);
      return;
    }

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
    try {
      const preview = await hostApi.connections.previewDataDiff({
        sourceConnectionId: syncSourceConnectionId,
        targetConnectionId: syncTargetConnectionId,
        tables: tables.map((tableName) => {
          const config = syncTableConfigs[tableName];
          const keyColumns = normalizeIdentifierList(config?.keyColumnsText ?? "");
          const compareColumns = normalizeIdentifierList(
            config?.compareColumnsText ?? "",
          );
          const whereClause = config?.whereClause.trim();

          return {
            tableName,
            keyColumns: keyColumns.length > 0 ? keyColumns : undefined,
            compareColumns:
              compareColumns.length > 0 ? compareColumns : undefined,
            whereClause: whereClause ? whereClause : undefined,
          };
        }),
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
    isSyncSchemaLoading,
    syncSchemaIssueMessage,
    syncSelectedTables,
    syncTableConfigs,
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
    setApplyUnsafeDeleteConfirmed(false);
    setResultTab("sync");
    try {
      const preview = await hostApi.connections.previewDataApply({
        compareId: diffPreview.compareId,
        sourceConnectionId: syncSourceConnectionId,
        targetConnectionId: syncTargetConnectionId,
        targetSnapshotHash: diffPreview.targetSnapshotHash,
        currentTargetSnapshotHash: diffDetail?.currentTargetSnapshotHash,
        selections,
        deleteWarningThreshold: DATA_SYNC_DELETE_WARNING_THRESHOLD,
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
      setSelectedJobId(detail.jobId);
      setBackgroundJobs((current) => mergeBackgroundJobs(current, [toBackgroundJobSummary(detail)]));
      setApplyExecute((current) =>
        current && current.jobId === detail.jobId
          ? {
              ...current,
              currentTargetSnapshotHash:
                detail.currentTargetSnapshotHash ?? current.currentTargetSnapshotHash,
              status: detail.status,
              statusCounts: detail.statusCounts,
              tableResults: detail.tableResults,
              blockers: detail.blockers,
            }
          : current,
      );
      return detail;
    },
    [hostApi.connections],
  );

  const refreshBackgroundJobs = useCallback(
    async (preserveIssue = false) => {
      setIsRefreshingJobs(true);
      if (!preserveIssue) {
        setJobCenterIssue(null);
      }
      try {
        const response = await hostApi.connections.listBackgroundJobs({ limit: 30 });
        let mergedJobs: DbBackgroundJobSummary[] = [];
        setBackgroundJobs((current) => {
          mergedJobs = mergeBackgroundJobs(current, response.jobs);
          return mergedJobs;
        });
        setSelectedJobId((current) =>
          current && mergedJobs.some((job) => job.jobId === current)
            ? current
            : mergedJobs[0]?.jobId ?? null,
        );
      } catch (error) {
        setJobCenterIssue(
          formatWorkbenchError(error, "Failed to refresh recent background jobs."),
        );
      } finally {
        setIsRefreshingJobs(false);
      }
    },
    [hostApi.connections],
  );

  useEffect(() => {
    void refreshBackgroundJobs();
  }, [connection.id, refreshBackgroundJobs]);

  useEffect(() => {
    if (!selectedJobId) {
      return;
    }
    if (applyJobDetail?.jobId === selectedJobId) {
      return;
    }
    void handleLoadDataApplyJobDetail(selectedJobId).catch((error) => {
      setJobCenterIssue(
        formatWorkbenchError(error, "Failed to load selected background job detail."),
      );
    });
  }, [applyJobDetail?.jobId, handleLoadDataApplyJobDetail, selectedJobId]);

  const selectedBackgroundJob =
    backgroundJobs.find((job) => job.jobId === selectedJobId) ?? null;
  const activeBackgroundJob =
    backgroundJobs.find((job) => isDataApplyJobActive(job.status)) ?? null;
  const activeApplyJobId =
    applyExecute?.jobId ?? activeBackgroundJob?.jobId ?? applyJobDetail?.jobId ?? null;
  const activeApplyJobStatus =
    (applyJobDetail && applyJobDetail.jobId === activeApplyJobId
      ? applyJobDetail.status
      : null) ??
    (applyExecute && applyExecute.jobId === activeApplyJobId ? applyExecute.status : null) ??
    activeBackgroundJob?.status ??
    null;

  const handleOpenJobCenterForJob = useCallback(
    async (jobId: string) => {
      setSelectedJobId(jobId);
      setResultTab("jobs");
      setJobCenterIssue(null);
      try {
        await handleLoadDataApplyJobDetail(jobId);
      } catch (error) {
        setJobCenterIssue(
          formatWorkbenchError(error, "Failed to open background job detail."),
        );
      }
    },
    [handleLoadDataApplyJobDetail],
  );

  const handleReopenSyncContext = useCallback(
    async (jobId: string) => {
      try {
        const detail =
          applyJobDetail?.jobId === jobId
            ? applyJobDetail
            : await handleLoadDataApplyJobDetail(jobId);
        setSyncSourceConnectionId(detail.sourceConnectionId);
        setSyncTargetConnectionId(detail.targetConnectionId);
        setSelectedJobId(jobId);
        setResultTab("sync");
      } catch (error) {
        setSyncIssue(
          formatWorkbenchError(error, "Failed to restore sync context from job history."),
        );
      }
    },
    [applyJobDetail, handleLoadDataApplyJobDetail],
  );

  const handleExecuteDataApply = useCallback(async () => {
    if (!diffPreview || !applyPreview) {
      setSyncIssue("Run compare preview and apply preview before execute.");
      return;
    }

    const selections = buildDataApplySelections();
    if (selections.length === 0) {
      setSyncIssue("No row actions are selected for apply execution.");
      return;
    }

    setIsExecutingApply(true);
    setSyncIssue(null);
    try {
      const result = await hostApi.connections.executeDataApply({
        compareId: diffPreview.compareId,
        sourceConnectionId: syncSourceConnectionId,
        targetConnectionId: syncTargetConnectionId,
        targetSnapshotHash: diffPreview.targetSnapshotHash,
        currentTargetSnapshotHash: applyPreview.currentTargetSnapshotHash,
        selections,
        deleteWarningThreshold: DATA_SYNC_DELETE_WARNING_THRESHOLD,
        confirmUnsafeDelete: applyUnsafeDeleteConfirmed,
        targetDatabaseConfirmation: applyProdConfirmation.trim() || undefined,
      });
      setApplyExecute(result);
      setSelectedJobId(result.jobId);
      const detail = await handleLoadDataApplyJobDetail(result.jobId);
      await refreshBackgroundJobs(true);
      hostApi.notifications.show(buildDataApplyNotification(result.status, result.statusCounts, "execute"));
      if (detail.status !== result.status) {
        setApplyExecute((current) =>
          mergeDataApplyExecutionDetail(current, detail, { refreshCurrentTargetSnapshotHash: false }),
        );
      }
    } catch (error) {
      setSyncIssue(
        formatWorkbenchError(
          error,
          "Failed to execute apply operation.",
        ),
      );
    } finally {
      setIsExecutingApply(false);
    }
  }, [
    applyPreview,
    applyProdConfirmation,
    applyUnsafeDeleteConfirmed,
    buildDataApplySelections,
    diffPreview,
    handleLoadDataApplyJobDetail,
    hostApi.connections,
    hostApi.notifications,
    refreshBackgroundJobs,
    syncSourceConnectionId,
    syncTargetConnectionId,
  ]);

  useEffect(() => {
    if (!activeApplyJobId || !isDataApplyJobActive(activeApplyJobStatus)) {
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;

    const poll = async () => {
      try {
        const detail = await hostApi.connections.fetchDataApplyJobDetail({ jobId: activeApplyJobId });
        if (cancelled) return;

        setApplyJobDetail(detail);
        setBackgroundJobs((current) => mergeBackgroundJobs(current, [toBackgroundJobSummary(detail)]));
        setApplyExecute((current) => mergeDataApplyExecutionDetail(current, detail));

        await refreshBackgroundJobs(true);

        if (isDataApplyJobActive(detail.status)) {
          timerId = window.setTimeout(poll, 1500);
          return;
        }

        hostApi.notifications.show(buildDataApplyNotification(detail.status, detail.statusCounts, "detail"));
      } catch (error) {
        if (cancelled) return;
        setSyncIssue(
          formatWorkbenchError(error, "Failed to refresh apply job detail."),
        );
        timerId = window.setTimeout(poll, 3000);
      }
    };

    timerId = window.setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [
    activeApplyJobId,
    activeApplyJobStatus,
    hostApi.connections,
    hostApi.notifications,
    refreshBackgroundJobs,
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
    setPendingDeleteRows((previous) => {
      if (!previous[patch.rowPkTuple]) return previous;
      const next = { ...previous };
      delete next[patch.rowPkTuple];
      return next;
    });
    setPendingEditCells((previous) => {
      const next = { ...previous };
      const existingPatch = previous[patchKey];
      const beforeValue = existingPatch?.beforeValue ?? patch.beforeValue;
      if (isCellValueEqual(beforeValue, patch.nextValue)) {
        delete next[patchKey];
        return next;
      }
      next[patchKey] = {
        ...patch,
        beforeValue,
      };
      return next;
    });
    setPreparedGridPlan(null);
  }, []);

  const handleDiscardGridEdits = useCallback(() => {
    setPendingEditCells({});
    setPendingDeleteRows({});
    setPreparedGridPlan(null);
  }, []);

  const handleRevertGridCell = useCallback((rowPkTuple: string, columnName: string) => {
    const patchKey = `${rowPkTuple}::${columnName}`;
    setPendingEditCells((previous) => {
      if (!previous[patchKey]) return previous;
      const next = { ...previous };
      delete next[patchKey];
      return next;
    });
    setPreparedGridPlan(null);
  }, []);

  const handleRevertGridRow = useCallback((rowPkTuple: string) => {
    setPendingEditCells((previous) => {
      const nextEntries = Object.entries(previous).filter(
        ([key]) => !key.startsWith(`${rowPkTuple}::`),
      );
      if (nextEntries.length === Object.keys(previous).length) {
        return previous;
      }
      return Object.fromEntries(nextEntries);
    });
    setPendingDeleteRows((previous) => {
      if (!previous[rowPkTuple]) return previous;
      const next = { ...previous };
      delete next[rowPkTuple];
      return next;
    });
    setPreparedGridPlan(null);
  }, []);

  const handleStageDeleteGridRow = useCallback((row: DbGridDeleteRowDraft) => {
    setPendingEditCells((previous) => {
      const nextEntries = Object.entries(previous).filter(
        ([key]) => !key.startsWith(`${row.rowPkTuple}::`),
      );
      return nextEntries.length === Object.keys(previous).length
        ? previous
        : Object.fromEntries(nextEntries);
    });
    setPendingDeleteRows((previous) => ({
      ...previous,
      [row.rowPkTuple]: row,
    }));
    setPreparedGridPlan(null);
  }, []);

  const handleRevertGridDelete = useCallback((rowPkTuple: string) => {
    setPendingDeleteRows((previous) => {
      if (!previous[rowPkTuple]) return previous;
      const next = { ...previous };
      delete next[rowPkTuple];
      return next;
    });
    setPreparedGridPlan(null);
  }, []);

  const handlePrepareGridCommit = useCallback(async () => {
    if (!results) return null;
    const activeBatch = results.batches[activeBatchIndex];
    if (!activeBatch) return null;

    if (activeBatch.editEligibility?.eligible !== true) {
      const reason =
        activeBatch.editEligibility?.reasons[0]?.message ??
        "Current batch is read-only for safe editing.";
      hostApi.notifications.show({
        title: "Cannot prepare commit",
        description: reason,
        variant: "destructive",
      });
      return null;
    }

    const source = activeBatch.editSource ?? lastGridEditSource;
    const tableName = source?.tableName?.trim();
    if (!source || !tableName) {
      hostApi.notifications.show({
        title: "Cannot prepare commit",
        description: "Editable source table context is missing.",
        variant: "destructive",
      });
      return null;
    }

    const primaryKeyColumns = activeBatch.primaryKeyColumns ?? [];
    if (primaryKeyColumns.length === 0) {
      hostApi.notifications.show({
        title: "Cannot prepare commit",
        description: "Primary key columns are missing for this editable batch.",
        variant: "destructive",
      });
      return null;
    }

    const patchCells = uniqueBy(
      Object.values(pendingEditCells),
      (patch) => `${patch.rowPkTuple}::${patch.columnName}`,
    );
    const deletedRows = uniqueBy(
      Object.values(pendingDeleteRows),
      (row) => row.rowPkTuple,
    );
    if (patchCells.length === 0 && deletedRows.length === 0) {
      hostApi.notifications.show({
        title: "No pending changes",
        description: "Stage at least one row edit or delete before preparing commit.",
        variant: "default",
      });
      return null;
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
        deletedRows,
      });
      setPreparedGridPlan(prepared);
      hostApi.notifications.show({
        title: "Commit plan prepared",
        description: `${prepared.updatedRows} updates and ${prepared.deletedRows} deletes ready for review.`,
        variant: "success",
      });
      return prepared;
    } catch (error) {
      hostApi.notifications.show({
        title: "Prepare commit failed",
        description: formatWorkbenchError(
          error,
          "Failed to prepare safe edit commit preview.",
        ),
        variant: "destructive",
      });
      return null;
    } finally {
      setIsPreparingGridCommit(false);
    }
  }, [
    activeBatchIndex,
    connection.id,
    hostApi.connections,
    hostApi.notifications,
    lastGridEditSource,
    pendingDeleteRows,
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
      setPendingDeleteRows({});
      setPreparedGridPlan(null);

      if (selectedTableName) {
        await handleRunStarterQuery(selectedTableName, "select");
      }

      hostApi.notifications.show({
        title: "Commit applied",
        description: `${result.updatedRows} updates and ${result.deletedRows} deletes committed.`,
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
    setPendingDeleteRows,
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
    async (batchIndex: number): Promise<DbQueryBatchResult | null> => {
      if (!results) return null;

      const batch = results.batches[batchIndex];
      if (!batch) return null;
      if (batch.pagingMode !== "offset" || !batch.hasMore) {
        if (batch.pagingMode === "unsupported") {
          hostApi.notifications.show({
            title: "Load more unavailable",
            description:
              batch.pagingReason ?? "Only single result-returning statements support load more.",
            variant: "destructive",
          });
        }
        return null;
      }
      if (typeof batch.nextOffset !== "number") {
        hostApi.notifications.show({
          title: "Load more unavailable",
          description: "Next page offset was not provided by the runtime.",
          variant: "destructive",
        });
        return null;
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

        let droppedRows = 0;
        setResults((prev) => {
          if (!prev) return prev;
          const updatedBatches = prev.batches.map((b, i) => {
            if (i !== batchIndex) return b;
            const mergedRows = [...b.rows, ...moreBatch.rows];
            const priorLoadedOffset = getLoadedRowOffset(b);
            const priorLoadedCount = getLoadedRowCount(b);
            const protectedRowPkTuples = new Set([
              ...Object.values(pendingEditCells).map((patch) => patch.rowPkTuple),
              ...Object.values(pendingDeleteRows).map((row) => row.rowPkTuple),
            ]);
            const loadedRowCount =
              priorLoadedCount +
              Math.max(moreBatch.rows.length, Math.trunc(moreBatch.returnedRows || 0));
            const trimmed =
              b.pagingMode === "offset"
                ? trimRowsForMemory(b, mergedRows, protectedRowPkTuples)
                : { rows: mergedRows, droppedRows: 0 };
            droppedRows = trimmed.droppedRows;
            return {
              ...b,
              rows: trimmed.rows,
              loadedRowOffset: priorLoadedOffset + trimmed.droppedRows,
              loadedRowCount,
              rowWindowTruncated:
                b.rowWindowTruncated === true || trimmed.droppedRows > 0
                  ? true
                  : undefined,
              totalRows: moreBatch.totalRows ?? b.totalRows,
              returnedRows: moreBatch.returnedRows,
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

        if (
          droppedRows > 0 &&
          !trimmedBatchAlertsRef.current.has(batchIndex)
        ) {
          trimmedBatchAlertsRef.current.add(batchIndex);
          hostApi.notifications.show({
            title: "Result window capped",
            description: `Older loaded rows were released to keep this result within the ${QUERY_RESULT_WINDOW_LIMIT.toLocaleString()} row memory window.`,
            variant: "default",
          });
        }
        return moreBatch;
      } catch (error) {
        hostApi.notifications.show({
          title: "Load more failed",
          description: formatWorkbenchError(
            error,
            "Unable to load additional rows for this result.",
          ),
          variant: "destructive",
        });
        return null;
      }
    },
    [
      results,
      hostApi.connections,
      connection.id,
      hostApi.notifications,
      pendingDeleteRows,
      pendingEditCells,
      runtimeSchema,
    ],
  );

  // ──────────────────────────────────────────────
  // エクスポートハンドラー（runtime-backed scope）
  // ──────────────────────────────────────────────

  const handleExport = useCallback(
    async (scope: ExportScope, format: ExportFormat) => {
      if (!results || isExecuting || isExporting) return null;

      const activeBatch = results.batches[activeBatchIndex];
      if (!activeBatch) return null;
      if (scope === "full_result" && activeBatch.pagingMode !== "offset") {
        hostApi.notifications.show({
          title: "Full result unavailable",
          description:
            "Only single pageable SELECT-style results support full result export.",
          variant: "destructive",
        });
        return null;
      }
      if (scope === "loaded_rows" && activeBatch.rowWindowTruncated === true) {
        hostApi.notifications.show({
          title: "Loaded rows limited",
          description: `Loaded-row export includes only the retained ${activeBatch.rows.length.toLocaleString()} row window.`,
          variant: "default",
        });
      }

      const exportRequestId = crypto.randomUUID();
      activeExportRequestIdRef.current = exportRequestId;
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
          currentPageRows:
            scope === "current_page" ? getCurrentPageRows(activeBatch) : undefined,
          loadedRows: scope === "loaded_rows" ? activeBatch.rows : undefined,
          columns: scope === "full_result" ? undefined : activeBatch.columns,
          maxRows: scope === "full_result" ? 100_000 : undefined,
        });
        if (activeExportRequestIdRef.current !== exportRequestId) {
          return null;
        }

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
        return exportResult;
      } catch (error) {
        if (activeExportRequestIdRef.current !== exportRequestId) {
          return null;
        }
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
        return null;
      } finally {
        if (activeExportRequestIdRef.current === exportRequestId) {
          activeExportRequestIdRef.current = null;
          setIsExporting(false);
          setCurrentExportRequestId(null);
        }
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

  useEffect(() => {
    const liveVerification = releaseVerification.live;
    if (!releaseVerification.enabled || !liveVerification?.enabled) {
      return;
    }
    if (liveVerification.driver && liveVerification.driver !== connection.driver) {
      return;
    }
    if (liveVerification.connectionId && liveVerification.connectionId !== connection.id) {
      return;
    }
    if (
      liveVerification.connectionName &&
      connection.name.trim().toLowerCase() !==
        liveVerification.connectionName.trim().toLowerCase()
    ) {
      return;
    }
    if (isSchemaLoading) {
      return;
    }

    const runKey = `${connection.id}:${connection.driver}`;
    if (liveVerificationRunKeyRef.current === runKey) {
      return;
    }
    liveVerificationRunKeyRef.current = runKey;

    let cancelled = false;
    const connectionLabel = connection.name || connection.database;
    const flowMetadata = {
      driver: connection.driver,
      connectionId: connection.id,
      connectionName: connectionLabel,
    } as const;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    const emitFlow = async (
      flowId: string,
      status: "passed" | "failed" | "warning" | "skipped",
      note: string,
    ) => {
      if (cancelled) return;
      await emitLiveVerificationFlow(flowId, status, {
        ...flowMetadata,
        note,
      });
    };
    const complete = async (
      status: "passed" | "failed" | "warning",
      note: string,
    ) => {
      if (cancelled) return;
      await emitLiveVerificationCompleted({
        ...flowMetadata,
        status,
        note,
        database: connection.database,
        readonly: connection.readonly === true,
      });
    };

    const run = async () => {
      if (!schemaSnapshot) {
        await emitFlow(
          "connect",
          "failed",
          schemaErrorMessage ?? "Schema snapshot did not load for the selected connection.",
        );
        await complete(
          "failed",
          "Live verification stopped before query flows because the connection could not be established.",
        );
        return;
      }

      await emitFlow(
        "connect",
        "passed",
        `Connected to ${connection.driver} ${connection.host}:${connection.port}/${connection.database}.`,
      );

      const verificationTable = schemaSnapshot.tables[0];
      if (!verificationTable) {
        for (const flowId of [
          "inspection",
          "query",
          "paging",
          "export",
          "edit",
          "readonly",
          "cancel",
        ] as const) {
          await emitFlow(flowId, "skipped", "No tables were available in the schema snapshot.");
        }
        await complete(
          "warning",
          "Connected successfully, but the schema has no tables so deeper workbench flows were skipped.",
        );
        return;
      }

      const inspected = await handleInspectObject("table", verificationTable.name);
      await emitFlow(
        "inspection",
        inspected ? "passed" : "failed",
        inspected
          ? `Inspected table ${verificationTable.name}.`
          : `Failed to inspect table ${verificationTable.name}.`,
      );

      const source: DbGridEditSource = {
        kind: "starter-select",
        tableName: verificationTable.name,
        schema: runtimeSchema,
        queryMode: "select",
      };
      const querySql = `SELECT *\nFROM ${buildQualifiedTableName(verificationTable.name)}\nLIMIT 100;`;
      updateActiveTabSql(querySql);
      setResultTab("results");
      setLastGridEditSource(source);
      const queryResponse = await executeImmediate(
        querySql,
        false,
        source,
        "statement",
      );
      const queryBatch = queryResponse?.batches[0] ?? null;
      await emitFlow(
        "query",
        queryBatch && !queryBatch.error ? "passed" : "failed",
        queryBatch && !queryBatch.error
          ? `Loaded ${queryBatch.rows.length} rows from ${verificationTable.name}.`
          : `Failed to execute starter query for ${verificationTable.name}.`,
      );

      if (queryBatch && queryBatch.hasMore && queryBatch.pagingMode === "offset") {
        const moreBatch = await handleLoadMore(0);
        await emitFlow(
          "paging",
          moreBatch ? "passed" : "failed",
          moreBatch
            ? `Fetched additional rows for ${verificationTable.name}.`
            : `Load more failed for ${verificationTable.name}.`,
        );
      } else {
        await emitFlow(
          "paging",
          "warning",
          `The starter query for ${verificationTable.name} did not expose offset paging evidence.`,
        );
      }

      const exportResult = await handleExport("current_page", "json");
      await emitFlow(
        "export",
        exportResult ? "passed" : "failed",
        exportResult
          ? `Exported current-page result to ${exportResult.fileName}.`
          : `Export failed for ${verificationTable.name}.`,
      );

      if (
        queryBatch &&
        queryBatch.editEligibility?.eligible === true &&
        queryBatch.rows.length > 0 &&
        (queryBatch.primaryKeyColumns?.length ?? 0) > 0
      ) {
        const firstRow = queryBatch.rows[0];
        const rowPrimaryKey = buildRowPrimaryKey(
          firstRow,
          queryBatch,
          queryBatch.primaryKeyColumns ?? [],
        );
        if (rowPrimaryKey) {
          const rowPkTuple = buildRowPkTuple(
            rowPrimaryKey,
            queryBatch.primaryKeyColumns ?? [],
          );
          handleStageDeleteGridRow({
            rowPrimaryKey,
            rowPkTuple,
          });
          await sleep(0);
          const prepared = await handlePrepareGridCommit();
          handleRevertGridDelete(rowPkTuple);
          setPreparedGridPlan(null);
          await emitFlow(
            "edit",
            prepared ? "passed" : "failed",
            prepared
              ? `Prepared a review-only delete plan for ${verificationTable.name} without committing it.`
              : `Failed to prepare review-only delete plan for ${verificationTable.name}.`,
          );
        } else {
          await emitFlow(
            "edit",
            "warning",
            `Could not resolve primary key values for ${verificationTable.name}.`,
          );
        }
      } else {
        await emitFlow(
          "edit",
          "warning",
          connection.readonly
            ? "The selected connection is read-only, so edit verification was not attempted."
            : `Loaded result for ${verificationTable.name} was not eligible for safe grid editing.`,
        );
      }

      await emitFlow(
        "readonly",
        connection.readonly ? "passed" : "warning",
        connection.readonly
          ? "Selected connection is explicitly marked read-only."
          : "Selected connection is writable; readonly guardrails were not exercised in this run.",
      );

      const cancelSql =
        connection.driver === "postgres" ? "SELECT pg_sleep(8);" : "SELECT SLEEP(8);";
      const cancelRequestId = crypto.randomUUID();
      activeQueryRequestIdRef.current = cancelRequestId;
      setCurrentRequestId(cancelRequestId);
      setIsExecuting(true);
      const cancelPromise = hostApi.connections.executeQuery({
        connectionId: connection.id,
        sql: cancelSql,
        requestId: cancelRequestId,
        schema: runtimeSchema,
      });

      await sleep(400);
      await hostApi.connections.cancelQuery(cancelRequestId).catch(() => undefined);
      let cancelPassed = false;
      try {
        await cancelPromise;
      } catch (error) {
        const message = formatWorkbenchError(error, "Query cancellation did not return a message.");
        cancelPassed = /cancel|cancelled|canceled|キャンセル/i.test(message);
      } finally {
        if (activeQueryRequestIdRef.current === cancelRequestId) {
          activeQueryRequestIdRef.current = null;
        }
        setIsExecuting(false);
        setCurrentRequestId(null);
      }
      await emitFlow(
        "cancel",
        cancelPassed ? "passed" : "failed",
        cancelPassed
          ? `Cancelled verification query on ${connection.driver}.`
          : `Cancellation did not surface a cancellable runtime response on ${connection.driver}.`,
      );

      await complete(
        "passed",
        `Completed live verification flows for ${connectionLabel}.`,
      );
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    buildQualifiedTableName,
    connection.database,
    connection.driver,
    connection.host,
    connection.id,
    connection.name,
    connection.port,
    connection.readonly,
    executeImmediate,
    handleExport,
    handleInspectObject,
    handleLoadMore,
    handlePrepareGridCommit,
    handleRevertGridDelete,
    handleStageDeleteGridRow,
    hostApi.connections,
    isSchemaLoading,
    releaseVerification.enabled,
    releaseVerification.live,
    runtimeSchema,
    schemaErrorMessage,
    schemaSnapshot,
    updateActiveTabSql,
  ]);

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
    setPendingDeleteRows({});
    setPreparedGridPlan(null);
  }, [activeBatchIndex, results?.requestId]);

  // ──────────────────────────────────────────────
  // レンダリング
  // ──────────────────────────────────────────────

  // アクティブバッチ（結果エクスポートメニュー用）
  const activeBatch = results?.batches[Math.min(activeBatchIndex, Math.max(0, (results?.batches.length ?? 1) - 1))];
  const pendingEditCount = Object.keys(pendingEditCells).length;
  const pendingDeleteCount = Object.keys(pendingDeleteRows).length;
  const pendingEditRows = useMemo(
    () => buildPendingEditRowSummaries(pendingEditCells),
    [pendingEditCells],
  );
  const pendingDeletedRows = useMemo(
    () => buildPendingDeleteRowSummaries(pendingDeleteRows),
    [pendingDeleteRows],
  );
  const willOverwriteSnippet = useMemo(() => {
    const normalizedName = pendingSnippetName.trim().toLowerCase();
    if (!normalizedName) return false;
    return savedSnippets.some(
      (snippet) => snippet.name.trim().toLowerCase() === normalizedName,
    );
  }, [pendingSnippetName, savedSnippets]);
  const inspectedObjectKind = objectInspection?.objectKind ?? null;
  const inspectedObjectName = objectInspection?.objectName ?? null;
  const inspectedObjectSignature = objectInspection?.signature ?? null;
  const inspectedParentObjectName = objectInspection?.parentObjectName ?? null;
  const activeEditEligibility = activeBatch?.editEligibility;
  const activePrimaryKeyColumns = activeBatch?.primaryKeyColumns ?? [];
  const activeEditBlockReason =
    activeEditEligibility && !activeEditEligibility.eligible
      ? activeEditEligibility.reasons[0]?.message ?? "Current result is read-only."
      : null;
  const activeDiffRow = diffRows[selectedDiffRowIndex] ?? null;
  const syncConnectionOptions = connections.length > 0 ? connections : [connection];
  const schemaDiffConnectionOptions = connections.length > 0 ? connections : [connection];
  const activeSchemaDiffTargetConnection =
    connections.find((item) => item.id === schemaDiffTargetConnectionId) ?? null;
  const activeSyncSourceConnection =
    connections.find((item) => item.id === syncSourceConnectionId) ?? connection;
  const activeSyncTargetConnection =
    connections.find((item) => item.id === syncTargetConnectionId) ?? connection;
  const driverLabel = connection.driver === "postgres" ? "PostgreSQL" : "MySQL";
  const workbenchContextLabel = `${driverLabel}://${connection.host}:${connection.port}/${connection.database}`;
  const syncRequiresProdTypedConfirmation = activeSyncTargetConnection.environment === "prod";
  const applyPreviewHasBlockingGuard = hasBlockingDataSyncBlocker(applyPreview?.blockers);
  const applyPreviewHasUnsafeDeleteWarning =
    applyPreview?.blockers.some((blocker) => blocker.code === "unsafe_delete_threshold") ?? false;
  const canExecuteDataApply =
    !!applyPreview
    && applyPreview.executable
    && !applyPreviewHasBlockingGuard
    && !isExecutingApply
    && (!applyPreviewHasUnsafeDeleteWarning || applyUnsafeDeleteConfirmed)
    && (
      !syncRequiresProdTypedConfirmation
      || applyProdConfirmation.trim() === activeSyncTargetConnection.database
    );

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

        <div className="shrink-0 border-b border-border bg-background px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-xs font-semibold text-foreground">
                  {connection.name || connection.database}
                </p>
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                  {driverLabel}
                </Badge>
                {connection.environment ? (
                  <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                    {connection.environment}
                  </Badge>
                ) : null}
                {connection.readonly ? (
                  <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                    readonly
                  </Badge>
                ) : null}
                {runtimeSchema ? (
                  <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                    schema:{runtimeSchema}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                {workbenchContextLabel}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-xs"
              onClick={onManageConnections}
            >
              Connection Center
            </Button>
          </div>
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
              inspectedObjectKind={inspectedObjectKind}
              inspectedObjectName={inspectedObjectName}
              inspectedObjectSignature={inspectedObjectSignature}
              inspectedParentObjectName={inspectedParentObjectName}
              onSelectTable={handleSelectTable}
              onOpenTable={handleOpenTable}
              onInspectObject={handleInspectObject}
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
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleOpenSqlLibrary}
              >
                SQL library
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onClick={handleSaveSnippet}
              >
                Save snippet
              </Button>

              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                  {savedSnippets.length} snippet{savedSnippets.length === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                  {queryHistory.length} history
                </Badge>
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                  {recentQueries.length} recent
                </Badge>
                <span className="truncate">
                  {(connection.name || connection.database).trim()}: connection-scoped tabs,
                  drafts, history, and snippets. Preview before replacing the active tab or opening
                  a new one.
                </span>
              </div>
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
                        setResultTab(
                          v as "results" | "explain" | "schema-diff" | "sync" | "inspect" | "jobs",
                        )
                      }
                    >
                      <TabsList className="h-7">
                        <TabsTrigger value="results" className="h-6 text-xs">
                          Results
                        </TabsTrigger>
                        <TabsTrigger value="explain" className="h-6 text-xs">
                          Explain
                        </TabsTrigger>
                        <TabsTrigger value="schema-diff" className="h-6 text-xs">
                          <GitCompare className="mr-1 h-3.5 w-3.5" />
                          Schema Diff
                        </TabsTrigger>
                        <TabsTrigger value="sync" className="h-6 text-xs">
                          <GitCompare className="mr-1 h-3.5 w-3.5" />
                          Sync
                          <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                            Preview
                          </span>
                        </TabsTrigger>
                        <TabsTrigger value="inspect" className="h-6 text-xs">
                          <FileSearch className="mr-1 h-3.5 w-3.5" />
                          Inspect
                        </TabsTrigger>
                        <TabsTrigger value="jobs" className="h-6 text-xs">
                          Jobs
                          <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                            Preview
                          </span>
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>

                    {/* エクスポートメニュー（Results タブかつ結果がある場合のみ表示） */}
                    {resultTab === "results" && activeBatch && (
                      <ResultExportMenu
                        batch={activeBatch}
                        onExport={handleExport}
                        isExporting={isExporting}
                        supportsFullResultExport={activeBatch.pagingMode === "offset"}
                      />
                    )}
                    {resultTab === "schema-diff" && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {connection.name || connection.database} → {activeSchemaDiffTargetConnection?.name ?? "target connection"}
                      </div>
                    )}
                    {resultTab === "sync" && (
                      <div className="text-[11px] text-muted-foreground">
                        Preview surface · source -&gt; target
                      </div>
                    )}
                    {resultTab === "inspect" && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {objectInspection?.displayName ?? "table/view DDL"}
                      </div>
                    )}
                    {resultTab === "jobs" && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        Preview surface · persistent background job history
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
                            stopOnError={stopOnError}
                            onStopOnErrorChange={setStopOnError}
                            editEligibility={activeEditEligibility}
                            primaryKeyColumns={activePrimaryKeyColumns}
                            pendingEditCells={pendingEditCells}
                            pendingEditRows={pendingEditRows}
                            pendingDeleteRows={pendingDeleteRows}
                            pendingDeletedRows={pendingDeletedRows}
                            pendingEditCount={pendingEditCount}
                            pendingDeleteCount={pendingDeleteCount}
                            onEditCell={handleEditCell}
                            onRevertCell={handleRevertGridCell}
                            onRevertRow={handleRevertGridRow}
                            onStageDeleteRow={handleStageDeleteGridRow}
                            onRevertDeleteRow={handleRevertGridDelete}
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
                    ) : resultTab === "schema-diff" ? (
                      <WorkbenchSchemaDiffPane
                        sourceConnection={connection}
                        connections={schemaDiffConnectionOptions}
                        targetConnectionId={schemaDiffTargetConnectionId}
                        onTargetConnectionChange={setSchemaDiffTargetConnectionId}
                        onCompare={() => {
                          void handlePreviewSchemaDiff();
                        }}
                        isComparing={isSchemaDiffing}
                        issue={schemaDiffIssue}
                        sourceSnapshot={schemaDiffSourceSnapshot}
                        targetSnapshot={schemaDiffTargetSnapshot}
                        result={schemaDiffResult}
                        onReset={() => {
                          setSchemaDiffSourceSnapshot(null);
                          setSchemaDiffTargetSnapshot(null);
                          setSchemaDiffResult(null);
                          setSchemaDiffIssue(null);
                        }}
                      />
                    ) : resultTab === "inspect" ? (
                      <ObjectInspectionPane
                        inspection={objectInspection}
                        isLoading={isInspectingObject}
                        error={inspectError}
                        className="h-full"
                      />
                    ) : resultTab === "jobs" ? (
                      <JobCenterPane
                        jobs={backgroundJobs}
                        selectedJobId={selectedJobId}
                        selectedJobDetail={applyJobDetail}
                        connections={connections}
                        activeConnectionId={connection.id}
                        isRefreshing={isRefreshingJobs}
                        issue={jobCenterIssue}
                        onRefresh={() => {
                          void refreshBackgroundJobs();
                        }}
                        onSelectJob={(jobId) => {
                          setSelectedJobId(jobId);
                        }}
                        onReopenSyncContext={(jobId) => {
                          void handleReopenSyncContext(jobId);
                        }}
                      />
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
                              disabled={
                                isDiffPreviewing
                                || isSyncSchemaLoading
                                || !!syncSchemaIssueMessage
                                || syncSelectedTables.length === 0
                              }
                            >
                              {isDiffPreviewing
                                ? "Comparing..."
                                : isSyncSchemaLoading
                                  ? "Loading sync metadata..."
                                  : "Compare source -> target"}
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

                          <div className="mt-2 space-y-2">
                            {syncSchemaIssueMessage ? (
                              <p className="text-[11px] text-destructive">
                                {syncSchemaIssueMessage}
                              </p>
                            ) : null}
                            {!syncSchemaIssueMessage && isSyncSchemaLoading ? (
                              <p className="text-[11px] text-muted-foreground">
                                Loading source/target schema metadata for sync compare.
                              </p>
                            ) : null}
                            {syncSelectedTables.length > 0 ? (
                              <div className="grid gap-2">
                                {syncSelectedTables.map((tableName) => {
                                  const metadata =
                                    syncTableMetadataByName.metadataByName[tableName];
                                  const config = syncTableConfigs[tableName] ?? {
                                    keyColumnsText: "",
                                    compareColumnsText: "",
                                    whereClause: "",
                                  };
                                  const runtimeKeyPreview = formatColumnPreview(
                                    metadata?.defaultKeyColumns ?? [],
                                    "none detected",
                                  );
                                  const runtimeComparePreview = formatColumnPreview(
                                    metadata?.defaultCompareColumns ?? [],
                                    "all non-key columns will be empty",
                                  );
                                  const availableColumnPreview = formatColumnPreview(
                                    metadata?.availableColumns ?? [],
                                    "no shared columns",
                                    8,
                                  );

                                  return (
                                    <div
                                      key={`sync-config-${tableName}`}
                                      className="rounded-sm border border-border bg-background px-2 py-2"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-[11px] font-semibold text-foreground">
                                          {tableName}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                          {metadata?.sourceExists ? "source" : "source missing"} / {" "}
                                          {metadata?.targetExists ? "target" : "target missing"}
                                        </span>
                                      </div>
                                      <div className="mt-1 grid gap-2 md:grid-cols-[1fr_1fr]">
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                            Key columns override
                                          </label>
                                          <input
                                            className="h-8 w-full rounded-sm border border-border bg-panel-muted/30 px-2 font-mono text-[11px]"
                                            value={config.keyColumnsText}
                                            onChange={(event) =>
                                              handleSyncTableConfigChange(
                                                tableName,
                                                "keyColumnsText",
                                                event.target.value,
                                              )}
                                            placeholder={runtimeKeyPreview}
                                          />
                                          <p className="text-[10px] text-muted-foreground">
                                            Runtime default: {runtimeKeyPreview}
                                          </p>
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                            Compare columns override
                                          </label>
                                          <input
                                            className="h-8 w-full rounded-sm border border-border bg-panel-muted/30 px-2 font-mono text-[11px]"
                                            value={config.compareColumnsText}
                                            onChange={(event) =>
                                              handleSyncTableConfigChange(
                                                tableName,
                                                "compareColumnsText",
                                                event.target.value,
                                              )}
                                            placeholder={runtimeComparePreview}
                                          />
                                          <p className="text-[10px] text-muted-foreground">
                                            Runtime default: {runtimeComparePreview}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-2 space-y-1">
                                        <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                          Row filter
                                        </label>
                                        <input
                                          className="h-8 w-full rounded-sm border border-border bg-panel-muted/30 px-2 font-mono text-[11px]"
                                          value={config.whereClause}
                                          onChange={(event) =>
                                            handleSyncTableConfigChange(
                                              tableName,
                                              "whereClause",
                                              event.target.value,
                                            )}
                                          placeholder="Optional SQL expression, e.g. updated_at >= CURRENT_DATE - INTERVAL '7 days'"
                                        />
                                      </div>
                                      <p className="mt-1 text-[10px] text-muted-foreground">
                                        Available columns: {availableColumnPreview}
                                      </p>
                                      {(metadata?.defaultKeyColumns.length ?? 0) === 0 ? (
                                        <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                                          No stable key was detected from schema metadata. Enter a business key override before compare if this table should sync.
                                        </p>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
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
                                        <p className="mt-1 text-[10px] text-muted-foreground">
                                          Keys: {formatColumnPreview(summary.keyColumns, "none detected", 4)}
                                        </p>
                                        <p className="mt-1 text-[10px] text-muted-foreground">
                                          Compare: {formatColumnPreview(summary.compareColumns, "runtime default empty", 4)}
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
                          <Alert className="mb-2 rounded-sm border-border bg-background px-3 py-2">
                            <Lock className="h-4 w-4" />
                            <AlertTitle className="text-xs">Data Sync Apply</AlertTitle>
                            <AlertDescription className="text-[11px] text-muted-foreground">
                              {DATA_SYNC_APPLY_READY_MESSAGE}
                            </AlertDescription>
                          </Alert>

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
                              variant="outline"
                              className="h-8 text-xs"
                              disabled={!canExecuteDataApply}
                              onClick={() => {
                                void handleExecuteDataApply();
                              }}
                            >
                              {isExecutingApply ? "Applying..." : "Apply selected changes"}
                            </Button>
                            {activeApplyJobId ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => {
                                  void handleOpenJobCenterForJob(activeApplyJobId);
                                }}
                              >
                                Open Job Center
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
                                <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
                                  <p>
                                    unsafe_delete_threshold warning is active. Review delete volume before execute.
                                  </p>
                                  <label className="mt-2 inline-flex items-center gap-2 text-[11px]">
                                    <input
                                      type="checkbox"
                                      checked={applyUnsafeDeleteConfirmed}
                                      onChange={(event) => setApplyUnsafeDeleteConfirmed(event.target.checked)}
                                    />
                                    <span>
                                      I confirm that delete volume above {DATA_SYNC_DELETE_WARNING_THRESHOLD} rows is intentional.
                                    </span>
                                  </label>
                                </div>
                              ) : null}
                              <p className="text-muted-foreground">
                                Review the SQL preview and blockers, then run apply when the target is ready.
                              </p>
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
                              {applyExecute.status === "running" ? (
                                <p className="mt-1 text-muted-foreground">
                                  Background job is running. Monitor it from Job Center.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {selectedBackgroundJob ? (
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              Selected job in Job Center: {selectedBackgroundJob.jobId} ({selectedBackgroundJob.status})
                            </p>
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
        updatedRows={preparedGridPlan?.updatedRows ?? 0}
        deletedRows={preparedGridPlan?.deletedRows ?? 0}
        changedColumnsSummary={preparedGridPlan?.changedColumnsSummary ?? []}
        pendingRows={pendingEditRows}
        pendingDeletedRows={pendingDeletedRows}
        sqlPreviewLines={preparedGridPlan?.sqlPreviewLines ?? []}
        previewTruncated={preparedGridPlan?.previewTruncated ?? false}
        isConfirming={isCommittingGridEdit}
        onConfirm={handleCommitGridEdits}
        onCancel={() => setPreparedGridPlan(null)}
      />

      <SqlLibraryDialog
        open={sqlLibraryOpen}
        searchValue={sqlLibrarySearch}
        entries={filteredSqlLibraryEntries}
        selectedEntryId={selectedSqlLibraryEntry?.id ?? ""}
        onSearchValueChange={setSqlLibrarySearch}
        onSelectedEntryChange={setSelectedSqlLibraryEntryId}
        onReplaceActiveTab={handleReplaceSqlFromLibrary}
        onOpenInNewTab={handleOpenSqlFromLibraryInNewTab}
        onDeleteSnippet={handleDeleteSnippetFromLibrary}
        onClose={() => setSqlLibraryOpen(false)}
      />

      <SqlParametersDialog
        open={pendingParameterReview !== null}
        parameters={pendingParameterReview?.parameters ?? []}
        values={parameterValues}
        renderedSqlPreview={renderedParameterReview?.sql ?? pendingParameterReview?.sql ?? ""}
        onValueChange={handleParameterValueChange}
        onConfirm={handleConfirmParameterReview}
        onCancel={handleCancelParameterReview}
      />

      <SqlScriptReviewDialog
        open={pendingScriptReview !== null}
        statements={pendingScriptReview?.statements ?? []}
        stopOnError={stopOnError}
        onConfirm={handleConfirmScriptReview}
        onCancel={handleCancelScriptReview}
      />

      <SaveSnippetDialog
        open={saveSnippetDialogOpen}
        snippetName={pendingSnippetName}
        sqlPreview={activeTab?.sql ?? ""}
        willOverwrite={willOverwriteSnippet}
        onSnippetNameChange={setPendingSnippetName}
        onConfirm={handleConfirmSaveSnippet}
        onCancel={handleCancelSaveSnippet}
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
