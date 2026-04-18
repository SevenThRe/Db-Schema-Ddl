// DB 工作台 — 左サイドバー: 接続セレクター + 環境インジケーター
//
// 現在アクティブな接続情報（名前・環境・ドライバー・読み取り専用）を表示し、
// 接続切替ドロップダウンを提供する。
// Phase 2 の object tree はこのサイドバーの下部エリアに配置予定。

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Lock,
  Play,
  RefreshCw,
  Search,
  Star,
  X,
  Table2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  DbColumnSchema,
  DbForeignKeySchema,
  DbConnectionConfig,
  DbEnvironment,
  DbIndexSchema,
  DbObjectKind,
  DbRoutineSchema,
  DbSchemaSnapshot,
  DbSequenceSchema,
  DbTableSchema,
  DbTriggerSchema,
  DbViewSchema,
} from "@shared/schema";

// ──────────────────────────────────────────────
// 環境設定定数
// ──────────────────────────────────────────────

/** 環境ごとのドット色 CSS クラス（Plan 02 で定義した CSS 変数を使用） */
const ENV_DOT_CLASS: Record<DbEnvironment, string> = {
  prod: "bg-[hsl(var(--env-prod))]",
  test: "bg-[hsl(var(--env-test))]",
  dev: "bg-[hsl(var(--env-dev))]",
};

/** 環境ラベルの文字色 CSS クラス */
const ENV_TEXT_CLASS: Record<DbEnvironment, string> = {
  prod: "text-[hsl(var(--env-prod))]",
  test: "text-[hsl(var(--env-test))]",
  dev: "text-[hsl(var(--env-dev))]",
};

/** ドライバー表示名マッピング */
const DRIVER_LABEL: Record<string, string> = {
  mysql: "MySQL",
  postgres: "PostgreSQL",
};

// ──────────────────────────────────────────────
// 環境インジケータードット
// ──────────────────────────────────────────────

function EnvDot({
  environment,
}: {
  environment: DbEnvironment | undefined;
}) {
  if (!environment) return null;

  return (
    <div
      className={cn("h-2 w-2 shrink-0 rounded-full", ENV_DOT_CLASS[environment])}
      aria-label={`Environment: ${environment}`}
    />
  );
}

// ──────────────────────────────────────────────
// プロップ型
// ──────────────────────────────────────────────

export interface ConnectionSidebarProps {
  /** 現在アクティブな接続設定 */
  connection: DbConnectionConfig;
  /** 切替先として表示する全接続リスト */
  connections: DbConnectionConfig[];
  /** 接続切替コールバック */
  onSwitchConnection: (id: string) => void;
  /** PostgreSQL の実行スキーマ */
  activeSchema?: string;
  /** PostgreSQL スキーマ候補 */
  schemaOptions?: string[];
  /** PostgreSQL スキーマ候補取得中 */
  isSchemaListLoading?: boolean;
  /** PostgreSQL スキーマ変更コールバック */
  onSchemaChange?: (schema: string) => void;
  /** 当前连接的 Schema 快照 */
  schemaSnapshot?: DbSchemaSnapshot | null;
  /** 当前连接的 Schema 加载错误 */
  schemaError?: string | null;
  /** Schema 是否正在刷新 */
  isSchemaLoading?: boolean;
  /** 刷新 Schema */
  onRefreshSchema?: () => void;
  /** 当前选中的表 */
  selectedTableName?: string | null;
  /** 当前 inspection 目标类型 */
  inspectedObjectKind?: DbObjectKind | null;
  /** 当前 inspection 目标名称 */
  inspectedObjectName?: string | null;
  /** 当前 inspection 目标签名（函数/过程重载识别） */
  inspectedObjectSignature?: string | null;
  /** 当前 inspection 的父对象名称（例如 trigger 所属表） */
  inspectedParentObjectName?: string | null;
  /** 从对象树选中表 */
  onSelectTable?: (tableName: string) => void;
  /** 从对象树打开表 */
  onOpenTable?: (tableName: string) => void;
  /** 从对象树打开对象 inspection */
  onInspectObject?: (
    objectKind: DbObjectKind,
    objectName: string,
    options?: {
      signature?: string | null;
      parentObjectName?: string | null;
    },
  ) => void;
  /** 从对象树快速插入/执行查询模板 */
  onRunStarterQuery?: (
    tableName: string,
    mode: "select" | "count" | "columns",
  ) => void;
}

function ColumnBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 rounded-sm px-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
        className,
      )}
    >
      {children}
    </Badge>
  );
}

type ExplorerBadgeTone = "neutral" | "success" | "warning";

const EXPLORER_BADGE_TONE_CLASS: Record<ExplorerBadgeTone, string> = {
  neutral:
    "border-border bg-muted/60 text-foreground/75 dark:bg-muted/40 dark:text-foreground/70",
  success:
    "border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-300",
  warning:
    "border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-300",
};

function ExplorerBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: ExplorerBadgeTone;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 rounded-sm px-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] shadow-none",
        EXPLORER_BADGE_TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </Badge>
  );
}

function ColumnRow({ column }: { column: DbColumnSchema }) {
  return (
    <div className="rounded-sm border border-border bg-background px-2.5 py-2">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-foreground">
          {column.name}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {column.primaryKey ? (
            <ColumnBadge className="border-amber-200 bg-amber-500/10 text-amber-700">
              PK
            </ColumnBadge>
          ) : null}
          {!column.nullable ? <ColumnBadge>NOT NULL</ColumnBadge> : null}
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="font-mono">{column.dataType}</span>
        {column.defaultValue ? (
          <span className="truncate">default {column.defaultValue}</span>
        ) : null}
      </div>
      {column.comment ? (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
          {column.comment}
        </p>
      ) : null}
    </div>
  );
}

function normalizeFilterText(value: string): string {
  return value.trim().toLowerCase();
}

function includesFilter(haystack: string, filterText: string): boolean {
  return haystack.toLowerCase().includes(filterText);
}

function getColumnSearchText(column: DbColumnSchema): string {
  return [column.name, column.dataType, column.comment ?? ""].join(" ");
}

function getIndexSearchText(index: DbIndexSchema): string {
  return [index.name, index.columns.join(" ")].join(" ");
}

function getForeignKeySearchText(foreignKey: DbForeignKeySchema): string {
  return [
    foreignKey.name,
    foreignKey.columns.join(" "),
    foreignKey.referencedTable,
    foreignKey.referencedColumns.join(" "),
  ].join(" ");
}

function tableMatchesFilter(table: DbTableSchema, filterText: string): boolean {
  if (!filterText) return true;

  const tableText = [table.name, table.comment ?? ""].join(" ");
  if (includesFilter(tableText, filterText)) return true;

  return (
    table.columns.some((column) => includesFilter(getColumnSearchText(column), filterText)) ||
    (table.indexes ?? []).some((index) => includesFilter(getIndexSearchText(index), filterText)) ||
    (table.foreignKeys ?? []).some((foreignKey) =>
      includesFilter(getForeignKeySearchText(foreignKey), filterText),
    )
  );
}

function viewMatchesFilter(view: DbViewSchema, filterText: string): boolean {
  if (!filterText) return true;

  const viewText = [view.name, view.comment ?? ""].join(" ");
  if (includesFilter(viewText, filterText)) return true;

  return view.columns.some((column) => includesFilter(getColumnSearchText(column), filterText));
}

function routineMatchesFilter(routine: DbRoutineSchema, filterText: string): boolean {
  if (!filterText) return true;
  return includesFilter(
    [routine.name, routine.kind, routine.signature ?? "", routine.returnType ?? "", routine.comment ?? ""].join(" "),
    filterText,
  );
}

function triggerMatchesFilter(trigger: DbTriggerSchema, filterText: string): boolean {
  if (!filterText) return true;
  return includesFilter(
    [trigger.name, trigger.tableName, trigger.timing ?? "", trigger.event].join(" "),
    filterText,
  );
}

function sequenceMatchesFilter(sequence: DbSequenceSchema, filterText: string): boolean {
  if (!filterText) return true;
  return includesFilter([sequence.name, sequence.comment ?? ""].join(" "), filterText);
}

function filterTableContents(table: DbTableSchema, filterText: string) {
  if (!filterText) {
    return {
      visibleColumns: table.columns,
      visibleIndexes: table.indexes ?? [],
      visibleForeignKeys: table.foreignKeys ?? [],
      matchedByTableName: true,
    };
  }

  const matchedByTableName = includesFilter([table.name, table.comment ?? ""].join(" "), filterText);
  const visibleColumns = matchedByTableName
    ? table.columns
    : table.columns.filter((column) => includesFilter(getColumnSearchText(column), filterText));
  const visibleIndexes = matchedByTableName
    ? (table.indexes ?? [])
    : (table.indexes ?? []).filter((index) => includesFilter(getIndexSearchText(index), filterText));
  const visibleForeignKeys = matchedByTableName
    ? (table.foreignKeys ?? [])
    : (table.foreignKeys ?? []).filter((foreignKey) =>
        includesFilter(getForeignKeySearchText(foreignKey), filterText),
      );

  return {
    visibleColumns,
    visibleIndexes,
    visibleForeignKeys,
    matchedByTableName,
  };
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

/**
 * DB 工作台 左サイドバー
 *
 * アクティブ接続の名前・環境色ドット・読み取り専用アイコン・ドライバーバッジを表示し、
 * 接続切替ドロップダウンを提供する。
 * Phase 2 では下部に object tree が追加される（スペース確保済み）。
 */
export function ConnectionSidebar({
  connection,
  connections,
  onSwitchConnection,
  activeSchema,
  schemaOptions = [],
  isSchemaListLoading = false,
  onSchemaChange,
  schemaSnapshot,
  schemaError,
  isSchemaLoading = false,
  onRefreshSchema,
  selectedTableName,
  inspectedObjectKind,
  inspectedObjectName,
  inspectedObjectSignature,
  inspectedParentObjectName,
  onSelectTable,
  onOpenTable,
  onInspectObject,
  onRunStarterQuery,
}: ConnectionSidebarProps) {
  // 接続切替ドロップダウンの開閉状態
  const [switchOpen, setSwitchOpen] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [objectFilter, setObjectFilter] = useState("");

  const env = connection.environment;
  const driverLabel = DRIVER_LABEL[connection.driver] ?? connection.driver;
  const isPostgres = connection.driver === "postgres";
  const normalizedObjectFilter = objectFilter.trim().toLowerCase();
  const effectiveSchema = activeSchema?.trim() || "public";
  const schemaSelectOptions = useMemo(() => {
    if (!isPostgres) return [];
    const merged = new Set<string>(["public"]);
    if (connection.defaultSchema?.trim()) {
      merged.add(connection.defaultSchema.trim());
    }
    if (effectiveSchema) {
      merged.add(effectiveSchema);
    }
    for (const schemaName of schemaOptions) {
      const normalized = schemaName.trim();
      if (normalized) {
        merged.add(normalized);
      }
    }
    return Array.from(merged).sort((left, right) => left.localeCompare(right));
  }, [connection.defaultSchema, effectiveSchema, isPostgres, schemaOptions]);
  const tables = useMemo(
    () =>
      schemaError
        ? []
        : [...(schemaSnapshot?.tables ?? [])].sort((left, right) =>
            left.name.localeCompare(right.name),
          ),
    [schemaError, schemaSnapshot],
  );
  const views = useMemo(
    () =>
      schemaError
        ? []
        : [...(schemaSnapshot?.views ?? [])].sort((left, right) =>
            left.name.localeCompare(right.name),
          ),
    [schemaError, schemaSnapshot],
  );
  const routines = useMemo(
    () =>
      schemaError
        ? []
        : [...(schemaSnapshot?.routines ?? [])].sort((left, right) =>
            left.name.localeCompare(right.name),
          ),
    [schemaError, schemaSnapshot],
  );
  const triggers = useMemo(
    () =>
      schemaError
        ? []
        : [...(schemaSnapshot?.triggers ?? [])].sort((left, right) => {
            const tableComparison = left.tableName.localeCompare(right.tableName);
            if (tableComparison !== 0) return tableComparison;
            return left.name.localeCompare(right.name);
          }),
    [schemaError, schemaSnapshot],
  );
  const sequences = useMemo(
    () =>
      schemaError
        ? []
        : [...(schemaSnapshot?.sequences ?? [])].sort((left, right) =>
            left.name.localeCompare(right.name),
          ),
    [schemaError, schemaSnapshot],
  );
  const visibleTables = useMemo(
    () =>
      normalizedObjectFilter
        ? tables.filter((table) => tableMatchesFilter(table, normalizedObjectFilter))
        : tables,
    [normalizedObjectFilter, tables],
  );
  const visibleViews = useMemo(
    () =>
      normalizedObjectFilter
        ? views.filter((view) => viewMatchesFilter(view, normalizedObjectFilter))
        : views,
    [normalizedObjectFilter, views],
  );
  const visibleRoutines = useMemo(
    () =>
      normalizedObjectFilter
        ? routines.filter((routine) => routineMatchesFilter(routine, normalizedObjectFilter))
        : routines,
    [normalizedObjectFilter, routines],
  );
  const visibleTriggers = useMemo(
    () =>
      normalizedObjectFilter
        ? triggers.filter((trigger) => triggerMatchesFilter(trigger, normalizedObjectFilter))
        : triggers,
    [normalizedObjectFilter, triggers],
  );
  const visibleSequences = useMemo(
    () =>
      normalizedObjectFilter
        ? sequences.filter((sequence) => sequenceMatchesFilter(sequence, normalizedObjectFilter))
        : sequences,
    [normalizedObjectFilter, sequences],
  );
  const hasExplorerData =
    tables.length > 0 ||
    views.length > 0 ||
    routines.length > 0 ||
    triggers.length > 0 ||
    sequences.length > 0;
  const hasFilteredExplorerData =
    visibleTables.length > 0 ||
    visibleViews.length > 0 ||
    visibleRoutines.length > 0 ||
    visibleTriggers.length > 0 ||
    visibleSequences.length > 0;
  const selectedTable =
    visibleTables.find((table) => table.name === selectedTableName) ?? visibleTables[0] ?? null;
  const isSelectedTableInspected =
    inspectedObjectKind === "table" && inspectedObjectName === selectedTable?.name;
  const filteredSummary = normalizedObjectFilter
    ? `${visibleTables.length}/${tables.length} tables · ${visibleViews.length}/${views.length} views · ${visibleRoutines.length}/${routines.length} routines · ${visibleTriggers.length}/${triggers.length} triggers · ${visibleSequences.length}/${sequences.length} sequences`
    : `${tables.length} tables · ${views.length} views · ${routines.length} routines · ${triggers.length} triggers · ${sequences.length} sequences`;
  const connectionStateLabel = schemaError
    ? "Unavailable"
    : schemaSnapshot
      ? "Connected"
      : isSchemaLoading
        ? "Connecting"
        : "Idle";
  const connectionStateClass = schemaError
    ? "text-destructive"
    : schemaSnapshot
      ? "text-emerald-600"
      : "text-muted-foreground";

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => ({
      ...prev,
      [tableName]: !(prev[tableName] ?? tableName === selectedTable?.name),
    }));
  };

  return (
    <div className="flex h-full w-[256px] min-w-[256px] flex-col gap-2.5 border-r border-border bg-sidebar p-2.5">
      {/* アクティブ接続情報エリア */}
      <div className="flex flex-col gap-1">
        {/* 接続名 + 環境ドット + 読み取り専用アイコン */}
        <div className="flex items-center gap-1.5">
          <EnvDot environment={env} />
          <span className="max-w-[156px] truncate text-[13px] font-semibold text-sidebar-foreground">
            {connection.name || connection.database}
          </span>
          {connection.favorite ? (
            <Star
              size={12}
              className="shrink-0 fill-amber-400 text-amber-500"
              aria-label="Favorite connection"
            />
          ) : null}
          {/* 読み取り専用接続はロックアイコンを表示 */}
          {connection.readonly && (
            <Lock
              size={12}
              className="shrink-0 text-muted-foreground"
              aria-label="Read-only connection"
            />
          )}
        </div>

        {/* 環境ラベル + ドライバーバッジ（サブ情報） */}
        <div className="flex items-center gap-1.5">
          {env && (
            <span
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.08em]",
                ENV_TEXT_CLASS[env],
              )}
            >
              {env}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">{driverLabel}</span>
        </div>

        {/* データベース名 */}
        <span className="truncate text-[11px] text-muted-foreground">
          {connection.database}
        </span>

        {connection.groupName ? (
          <span className="truncate text-[11px] text-muted-foreground">
            Group · {connection.groupName}
          </span>
        ) : null}

        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.08em]",
              connectionStateClass,
            )}
          >
            {connectionStateLabel}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {hasExplorerData ? filteredSummary : "schema pending"}
          </span>
        </div>
      </div>

      <Separator />

      {/* 接続切替トリガー */}
      <button
        type="button"
        className="flex items-center gap-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setSwitchOpen((prev) => !prev)}
        aria-expanded={switchOpen}
      >
        <span>Switch connection</span>
        <ChevronDown
          size={12}
          className={cn("transition-transform", switchOpen && "rotate-180")}
        />
      </button>

      {/* 接続リストドロップダウン */}
      {switchOpen && (
        <ScrollArea className="max-h-[200px] rounded-md border border-border bg-background">
          <div className="flex flex-col py-1">
            {connections.map((conn) => (
              <button
                key={conn.id}
                type="button"
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-2 text-left text-[11px] transition-colors hover:bg-muted",
                  conn.id === connection.id && "bg-muted font-semibold",
                )}
                onClick={() => {
                  onSwitchConnection(conn.id);
                  setSwitchOpen(false);
                }}
              >
                {/* 接続ごとの環境ドット */}
                <EnvDot environment={conn.environment} />
                {conn.favorite ? (
                  <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />
                ) : null}
                <span className="flex-1 truncate">{conn.name || conn.database}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {DRIVER_LABEL[conn.driver] ?? conn.driver}
                </span>
              </button>
            ))}
            {connections.length === 0 && (
              <span className="px-2.5 py-2 text-[11px] text-muted-foreground">
                No connections saved
              </span>
            )}
          </div>
        </ScrollArea>
      )}

      <Separator />

      {isPostgres ? (
        <>
          <div className="flex items-center gap-2 px-1">
            <label
              htmlFor={`schema-select-${connection.id}`}
              className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
            >
              Schema
            </label>
            <select
              id={`schema-select-${connection.id}`}
              value={effectiveSchema}
              className="h-7 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 py-0 text-xs"
              disabled={isSchemaListLoading}
              onChange={(event) => onSchemaChange?.(event.target.value)}
            >
              {schemaSelectOptions.map((schemaName) => (
                <option key={schemaName} value={schemaName}>
                  {schemaName}
                </option>
              ))}
            </select>
          </div>
          <Separator />
        </>
      ) : null}

      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Object Explorer
          </span>
          <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
            Schemas · Tables · Views · Routines · Triggers · Sequences
          </p>
          <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
            Inspect DDL: tables, views, routines, triggers, PostgreSQL sequences, indexes, and foreign keys.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onRefreshSchema}
          disabled={isSchemaLoading}
          aria-label="Refresh schema"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isSchemaLoading && "animate-spin")} />
        </Button>
      </div>

      <div className="relative px-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={objectFilter}
          onChange={(event) => setObjectFilter(event.target.value)}
          placeholder="Search tables, views, routines, triggers, sequences"
          className="h-8 pl-8 pr-8 text-[12px]"
          aria-label="Search tables, views, routines, triggers, sequences, columns, indexes, and foreign keys"
        />
        {objectFilter ? (
          <button
            type="button"
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
            onClick={() => setObjectFilter("")}
            aria-label="Clear object filter"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-md border border-border bg-background/70">
        <div className="flex flex-col py-1">
          {schemaError ? (
            <div className="px-2 py-2">
              <Alert variant="destructive" className="rounded-md px-3 py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-xs">数据库当前不可连接</AlertTitle>
                <AlertDescription className="text-xs break-all">
                  {schemaError}
                </AlertDescription>
              </Alert>
            </div>
          ) : !hasExplorerData ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              {isSchemaLoading ? "Loading schema..." : "No objects loaded"}
            </div>
          ) : !hasFilteredExplorerData ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No objects match the current filter.
            </div>
          ) : (
            <div className="py-1">
              <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Schemas
              </div>
              <div className="px-1">
                <div className="flex items-center justify-between rounded-sm px-2.5 py-2 text-xs hover:bg-muted/50">
                  <span className="truncate font-mono text-foreground">
                    {schemaSnapshot?.schema ?? effectiveSchema}
                  </span>
                  {isPostgres ? (
                    <ExplorerBadge tone="neutral" className="shrink-0">
                      active
                    </ExplorerBadge>
                  ) : null}
                </div>
              </div>

              <div className="mt-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Tables
              </div>
              {visibleTables.length === 0 ? (
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
                  {normalizedObjectFilter ? "No tables match the filter" : "No tables"}
                </div>
              ) : (
                visibleTables.map((table) => {
                  const isSelected = table.name === selectedTable?.name;
                  const isInspected =
                    inspectedObjectKind === "table" && inspectedObjectName === table.name;
                  const tableFilterState = filterTableContents(table, normalizedObjectFilter);
                  const shouldAutoExpand =
                    isSelected || (normalizedObjectFilter.length > 0 && tableMatchesFilter(table, normalizedObjectFilter));
                  const isExpanded = expandedTables[table.name] ?? shouldAutoExpand;
                  const secondaryIndexes = tableFilterState.visibleIndexes.filter(
                    (index) => !index.primary,
                  );

                  return (
                    <div key={table.name} className="px-1 py-0.5">
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted",
                          (isSelected || isInspected) && "bg-muted font-medium",
                        )}
                        onClick={() => {
                          onSelectTable?.(table.name);
                          setExpandedTables((prev) => ({ ...prev, [table.name]: true }));
                        }}
                        onDoubleClick={() => onOpenTable?.(table.name)}
                        title={table.name}
                      >
                        <ChevronDown
                          className={cn(
                            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                            !isExpanded && "-rotate-90",
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleTable(table.name);
                          }}
                        />
                        <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-mono">{table.name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {table.columns.length}
                        </span>
                        {isInspected ? (
                          <ExplorerBadge tone="success" className="shrink-0">
                            DDL
                          </ExplorerBadge>
                        ) : null}
                      </button>

                      {isExpanded ? (
                        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border/70 pl-2">
                          <div className="flex items-center justify-between rounded-sm px-2 py-1.5 text-[11px] text-muted-foreground">
                            <span>Columns</span>
                            <span>{tableFilterState.visibleColumns.length}</span>
                          </div>
                          {tableFilterState.visibleColumns.map((column) => (
                            <div
                              key={`${table.name}:column:${column.name}`}
                              className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[11px] hover:bg-muted/50"
                            >
                              <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                                {column.name}
                              </span>
                              {column.primaryKey ? (
                                <ExplorerBadge tone="warning">
                                  PK
                                </ExplorerBadge>
                              ) : null}
                              {!column.nullable ? (
                                <ExplorerBadge tone="neutral">
                                  NN
                                </ExplorerBadge>
                              ) : null}
                            </div>
                          ))}

                          <div className="flex items-center justify-between rounded-sm px-2 py-1.5 text-[11px] text-muted-foreground">
                            <span>Foreign Keys</span>
                            <span>{tableFilterState.visibleForeignKeys.length}</span>
                          </div>
                          {tableFilterState.visibleForeignKeys.map((foreignKey) => {
                            const isForeignKeyInspected =
                              inspectedObjectKind === "foreign_key" &&
                              inspectedObjectName === foreignKey.name &&
                              (inspectedParentObjectName ?? "") === table.name;
                            const isReferencedTableInspected =
                              inspectedObjectKind === "table" &&
                              inspectedObjectName === foreignKey.referencedTable;
                            return (
                              <div
                                key={`${table.name}:fk:${foreignKey.name}`}
                                className={cn(
                                  "rounded-sm border border-transparent px-2 py-1.5",
                                  (isForeignKeyInspected || isReferencedTableInspected) &&
                                    "border-border bg-muted/40",
                                )}
                              >
                                <button
                                  type="button"
                                  className={cn(
                                    "w-full rounded-sm text-left text-[11px] hover:bg-muted/50",
                                    isForeignKeyInspected && "font-medium",
                                  )}
                                  onClick={() =>
                                    onInspectObject?.("foreign_key", foreignKey.name, {
                                      parentObjectName: table.name,
                                    })
                                  }
                                  title={`Inspect foreign key ${foreignKey.name}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="min-w-0 flex-1 truncate font-mono text-foreground">
                                      {foreignKey.name}
                                    </div>
                                    {isForeignKeyInspected ? (
                                      <ExplorerBadge tone="success" className="shrink-0">
                                        DDL
                                      </ExplorerBadge>
                                    ) : null}
                                  </div>
                                  <div className="truncate text-[11px] text-muted-foreground">
                                    {foreignKey.columns.join(", ")} → {foreignKey.referencedTable}
                                  </div>
                                </button>
                                <div className="mt-1 flex items-center gap-1.5 pl-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => onInspectObject?.("table", foreignKey.referencedTable)}
                                  >
                                    Inspect ref
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => onOpenTable?.(foreignKey.referencedTable)}
                                  >
                                    Open ref
                                  </Button>
                                </div>
                              </div>
                            );
                          })}

                          <div className="flex items-center justify-between rounded-sm px-2 py-1.5 text-[11px] text-muted-foreground">
                            <span>Indexes</span>
                            <span>{secondaryIndexes.length}</span>
                          </div>
                          {secondaryIndexes.map((index) => {
                            const isIndexInspected =
                              inspectedObjectKind === "index" &&
                              inspectedObjectName === index.name &&
                              (inspectedParentObjectName ?? "") === table.name;
                            return (
                              <button
                                key={`${table.name}:index:${index.name}`}
                                type="button"
                                className={cn(
                                  "w-full rounded-sm px-2 py-1.5 text-left text-[11px] hover:bg-muted/50",
                                  isIndexInspected && "bg-muted font-medium",
                                )}
                                onClick={() =>
                                  onInspectObject?.("index", index.name, {
                                    parentObjectName: table.name,
                                  })
                                }
                                title={`Inspect index ${index.name}`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="min-w-0 flex-1 truncate font-mono text-foreground">
                                    {index.name}
                                  </div>
                                  {isIndexInspected ? (
                                    <ExplorerBadge tone="success" className="shrink-0">
                                      DDL
                                    </ExplorerBadge>
                                  ) : null}
                                </div>
                                <div className="truncate text-[11px] text-muted-foreground">
                                  {index.columns.join(", ")}
                                  {index.unique ? " · UNIQUE" : ""}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}

              <div className="mt-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Views
              </div>
              {visibleViews.length === 0 ? (
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
                  {normalizedObjectFilter ? "No views match the filter" : "No views"}
                </div>
              ) : (
                <div className="px-1 pb-1">
                  {visibleViews.map((view) => (
                    <button
                      key={view.name}
                      type="button"
                      className={cn(
                        "w-full rounded-sm px-2 py-2 text-left text-[11px] hover:bg-muted/50",
                        inspectedObjectKind === "view" &&
                          inspectedObjectName === view.name &&
                          "bg-muted font-medium",
                      )}
                      onClick={() => onInspectObject?.("view", view.name)}
                      title={`Inspect ${view.name}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 truncate font-mono text-foreground">
                          {view.name}
                        </div>
                        <ExplorerBadge tone="success" className="shrink-0">
                          DDL
                        </ExplorerBadge>
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {view.columns.length} columns
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Routines
              </div>
              {visibleRoutines.length === 0 ? (
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
                  {normalizedObjectFilter ? "No routines match the filter" : "No routines"}
                </div>
              ) : (
                <div className="px-1 pb-1">
                  {visibleRoutines.map((routine) => {
                    const routineObjectName = routine.signature
                      ? `${routine.name}(${routine.signature})`
                      : routine.name;
                    const isRoutineInspected =
                      inspectedObjectKind === routine.kind &&
                      inspectedObjectName === routine.name &&
                      (inspectedObjectSignature?.trim() ?? "") ===
                        (routine.signature?.trim() ?? "");
                    return (
                      <button
                        key={`${routine.kind}:${routineObjectName}`}
                        type="button"
                        className={cn(
                          "w-full rounded-sm px-2 py-2 text-left text-[11px] hover:bg-muted/50",
                          isRoutineInspected && "bg-muted font-medium",
                        )}
                        onClick={() =>
                          onInspectObject?.(routine.kind, routine.name, {
                            signature: routine.signature ?? null,
                          })
                        }
                        title={`Inspect ${routineObjectName}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1 truncate font-mono text-foreground">
                            {routine.name}
                          </div>
                          <ExplorerBadge tone="warning" className="shrink-0">
                            {routine.kind}
                          </ExplorerBadge>
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {routine.signature ?? "signature unavailable"}
                          {routine.returnType ? ` → ${routine.returnType}` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Triggers
              </div>
              {visibleTriggers.length === 0 ? (
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
                  {normalizedObjectFilter ? "No triggers match the filter" : "No triggers"}
                </div>
              ) : (
                <div className="px-1 pb-1">
                  {visibleTriggers.map((trigger) => {
                    const isTriggerInspected =
                      inspectedObjectKind === "trigger" &&
                      inspectedObjectName === trigger.name &&
                      (inspectedParentObjectName ?? "") === trigger.tableName;
                    return (
                      <button
                        key={`${trigger.tableName}:${trigger.name}`}
                        type="button"
                        className={cn(
                          "w-full rounded-sm px-2 py-2 text-left text-[11px] hover:bg-muted/50",
                          isTriggerInspected && "bg-muted font-medium",
                        )}
                        onClick={() =>
                          onInspectObject?.("trigger", trigger.name, {
                            parentObjectName: trigger.tableName,
                          })
                        }
                        title={`Inspect ${trigger.name}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1 truncate font-mono text-foreground">
                            {trigger.name}
                          </div>
                          <ExplorerBadge tone="warning" className="shrink-0">
                            trigger
                          </ExplorerBadge>
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {trigger.tableName} · {trigger.timing ?? "TIMING?"} · {trigger.event}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Sequences
              </div>
              {visibleSequences.length === 0 ? (
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
                  {normalizedObjectFilter ? "No sequences match the filter" : "No sequences"}
                </div>
              ) : (
                <div className="px-1 pb-1">
                  {visibleSequences.map((sequence) => (
                    <button
                      key={sequence.name}
                      type="button"
                      className={cn(
                        "w-full rounded-sm px-2 py-2 text-left text-[11px] hover:bg-muted/50",
                        inspectedObjectKind === "sequence" &&
                          inspectedObjectName === sequence.name &&
                          "bg-muted font-medium",
                      )}
                      onClick={() => onInspectObject?.("sequence", sequence.name)}
                      title={`Inspect ${sequence.name}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 truncate font-mono text-foreground">
                          {sequence.name}
                        </div>
                        <ExplorerBadge tone="warning" className="shrink-0">
                          sequence
                        </ExplorerBadge>
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {sequence.comment ?? "Sequence DDL available via inspection pane"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background/70">
        <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Structure
            </span>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {selectedTable?.name ?? "No table selected"}
            </p>
          </div>
          {selectedTable ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant={isSelectedTableInspected ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                onClick={() => onInspectObject?.("table", selectedTable.name)}
              >
                Inspect
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-[11px]"
                onClick={() => onOpenTable?.(selectedTable.name)}
              >
                <Play className="h-3 w-3" />
                Open
              </Button>
            </div>
          ) : null}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {!selectedTable ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
                Select a table to preview columns.
              </div>
          ) : (
            <div className="space-y-2 px-2 py-2">
              <div className="grid grid-cols-3 gap-1">
                <div className="rounded-sm border border-border bg-muted/20 px-2 py-1">
                  <div className="text-[11px] text-muted-foreground">Columns</div>
                  <div className="text-xs font-semibold text-foreground">
                    {selectedTable.columns.length}
                  </div>
                </div>
                <div className="rounded-sm border border-border bg-muted/20 px-2 py-1">
                  <div className="text-[11px] text-muted-foreground">Keys</div>
                  <div className="text-xs font-semibold text-foreground">
                    {selectedTable.columns.filter((column) => column.primaryKey).length +
                      (selectedTable.foreignKeys?.length ?? 0)}
                  </div>
                </div>
                <div className="rounded-sm border border-border bg-muted/20 px-2 py-1">
                  <div className="text-[11px] text-muted-foreground">Indexes</div>
                  <div className="text-xs font-semibold text-foreground">
                    {(selectedTable.indexes ?? []).filter((index) => !index.primary).length}
                  </div>
                </div>
              </div>

              <div className="rounded-sm border border-border bg-muted/20 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs font-semibold text-foreground">
                    {selectedTable.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {selectedTable.columns.length} cols
                  </span>
                </div>
                {selectedTable.comment ? (
                  <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                    {selectedTable.comment}
                  </p>
                ) : null}
              </div>

              <div className="rounded-sm border border-border bg-background px-2 py-1.5">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Starter Queries
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 justify-start text-[11px]"
                    onClick={() => onRunStarterQuery?.(selectedTable.name, "select")}
                  >
                    Select top 100
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 justify-start text-[11px]"
                    onClick={() => onRunStarterQuery?.(selectedTable.name, "count")}
                  >
                    Count rows
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 justify-start text-[11px]"
                    onClick={() => onRunStarterQuery?.(selectedTable.name, "columns")}
                  >
                    Select explicit columns
                  </Button>
                </div>
              </div>

              {(selectedTable.indexes ?? []).filter((index) => !index.primary).length > 0 ? (
                <div className="rounded-sm border border-border bg-background px-2 py-1.5">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Indexes
                  </div>
                  <div className="space-y-1">
                    {(selectedTable.indexes ?? [])
                      .filter((index) => !index.primary)
                      .map((index) => (
                        <div key={index.name} className="text-[11px]">
                          <div className="font-mono text-foreground">{index.name}</div>
                          <div className="mt-0.5 text-muted-foreground">
                            {index.columns.join(", ")}
                            {index.unique ? " · UNIQUE" : ""}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              {selectedTable.columns.map((column) => (
                <ColumnRow key={column.name} column={column} />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
