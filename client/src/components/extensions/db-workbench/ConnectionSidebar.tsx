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
  Table2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  DbColumnSchema,
  DbConnectionConfig,
  DbEnvironment,
  DbSchemaSnapshot,
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
  /** 从对象树选中表 */
  onSelectTable?: (tableName: string) => void;
  /** 从对象树打开表 */
  onOpenTable?: (tableName: string) => void;
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
      className={cn("h-4 rounded-sm px-1 text-[9px] font-medium", className)}
    >
      {children}
    </Badge>
  );
}

function ColumnRow({ column }: { column: DbColumnSchema }) {
  return (
    <div className="rounded-sm border border-border bg-background px-2 py-1.5">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium text-foreground">
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
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="font-mono">{column.dataType}</span>
        {column.defaultValue ? (
          <span className="truncate">default {column.defaultValue}</span>
        ) : null}
      </div>
      {column.comment ? (
        <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
          {column.comment}
        </p>
      ) : null}
    </div>
  );
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
  onSelectTable,
  onOpenTable,
}: ConnectionSidebarProps) {
  // 接続切替ドロップダウンの開閉状態
  const [switchOpen, setSwitchOpen] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  const env = connection.environment;
  const driverLabel = DRIVER_LABEL[connection.driver] ?? connection.driver;
  const isPostgres = connection.driver === "postgres";
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
  const selectedTable =
    tables.find((table) => table.name === selectedTableName) ?? tables[0] ?? null;
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
    <div className="flex h-full w-[240px] min-w-[240px] flex-col gap-2 border-r border-border bg-sidebar p-2">
      {/* アクティブ接続情報エリア */}
      <div className="flex flex-col gap-1">
        {/* 接続名 + 環境ドット + 読み取り専用アイコン */}
        <div className="flex items-center gap-1.5">
          <EnvDot environment={env} />
          <span className="max-w-[140px] truncate text-xs font-semibold text-sidebar-foreground">
            {connection.name || connection.database}
          </span>
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
                "text-[10px] font-semibold uppercase",
                ENV_TEXT_CLASS[env],
              )}
            >
              {env}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{driverLabel}</span>
        </div>

        {/* データベース名 */}
        <span className="truncate text-xs text-muted-foreground">
          {connection.database}
        </span>

        <div className="flex items-center gap-1.5">
          <span className={cn("text-[10px] font-semibold uppercase", connectionStateClass)}>
            {connectionStateLabel}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {tables.length > 0 ? `${tables.length} tables` : "schema pending"}
          </span>
        </div>
      </div>

      <Separator />

      {/* 接続切替トリガー */}
      <button
        type="button"
        className="flex items-center gap-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
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
                  "flex items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                  conn.id === connection.id && "bg-muted font-semibold",
                )}
                onClick={() => {
                  onSwitchConnection(conn.id);
                  setSwitchOpen(false);
                }}
              >
                {/* 接続ごとの環境ドット */}
                <EnvDot environment={conn.environment} />
                <span className="flex-1 truncate">{conn.name || conn.database}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {DRIVER_LABEL[conn.driver] ?? conn.driver}
                </span>
              </button>
            ))}
            {connections.length === 0 && (
              <span className="px-2 py-1.5 text-xs text-muted-foreground">
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
              className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
            >
              Schema
            </label>
            <select
              id={`schema-select-${connection.id}`}
              value={effectiveSchema}
              className="h-6 min-w-0 flex-1 rounded-sm border border-border bg-background px-1.5 py-0 text-[11px]"
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
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Object Explorer
          </span>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Tables ·{" "}
            {isPostgres
              ? `Schema ${schemaSnapshot?.schema ?? effectiveSchema}`
              : "单击预览，双击生成查询"}
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
          ) : tables.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              {isSchemaLoading ? "Loading schema..." : "No tables loaded"}
            </div>
          ) : (
            tables.map((table) => {
              const isSelected = table.name === selectedTable?.name;
              const isExpanded = expandedTables[table.name] ?? isSelected;
              const primaryColumns = table.columns.filter((column) => column.primaryKey);
              const secondaryIndexes = (table.indexes ?? []).filter((index) => !index.primary);

              return (
                <div key={table.name} className="px-1 py-0.5">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                      isSelected && "bg-muted font-medium",
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
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {table.columns.length}
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border/70 pl-2">
                      <div className="flex items-center justify-between rounded-sm px-2 py-1 text-[11px] text-muted-foreground">
                        <span>列</span>
                        <span>{table.columns.length}</span>
                      </div>
                      {table.columns.map((column) => (
                        <div
                          key={`${table.name}:column:${column.name}`}
                          className="flex items-center gap-2 rounded-sm px-2 py-1 text-[11px] hover:bg-muted/50"
                        >
                          <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                            {column.name}
                          </span>
                          {column.primaryKey ? (
                            <span className="text-[9px] font-semibold uppercase text-amber-700">
                              PK
                            </span>
                          ) : null}
                          {!column.nullable ? (
                            <span className="text-[9px] font-semibold uppercase text-muted-foreground">
                              NN
                            </span>
                          ) : null}
                        </div>
                      ))}

                      <div className="flex items-center justify-between rounded-sm px-2 py-1 text-[11px] text-muted-foreground">
                        <span>键</span>
                        <span>{primaryColumns.length + (table.foreignKeys?.length ?? 0)}</span>
                      </div>
                      {primaryColumns.map((column) => (
                        <div
                          key={`${table.name}:pk:${column.name}`}
                          className="flex items-center gap-2 rounded-sm px-2 py-1 text-[11px] hover:bg-muted/50"
                        >
                          <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                            {column.name}
                          </span>
                          <span className="text-[9px] font-semibold uppercase text-amber-700">
                            PRIMARY
                          </span>
                        </div>
                      ))}
                      {(table.foreignKeys ?? []).map((foreignKey) => (
                        <div
                          key={`${table.name}:fk:${foreignKey.name}`}
                          className="rounded-sm px-2 py-1 text-[11px] hover:bg-muted/50"
                        >
                          <div className="truncate font-mono text-foreground">
                            {foreignKey.name}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {foreignKey.columns.join(", ")} → {foreignKey.referencedTable}
                          </div>
                        </div>
                      ))}

                      <div className="flex items-center justify-between rounded-sm px-2 py-1 text-[11px] text-muted-foreground">
                        <span>索引</span>
                        <span>{secondaryIndexes.length}</span>
                      </div>
                      {secondaryIndexes.map((index) => (
                        <div
                          key={`${table.name}:index:${index.name}`}
                          className="rounded-sm px-2 py-1 text-[11px] hover:bg-muted/50"
                        >
                          <div className="truncate font-mono text-foreground">
                            {index.name}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {index.columns.join(", ")}
                            {index.unique ? " · UNIQUE" : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <Separator />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background/70">
        <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Structure
            </span>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {selectedTable?.name ?? "No table selected"}
            </p>
          </div>
          {selectedTable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[10px]"
              onClick={() => onOpenTable?.(selectedTable.name)}
            >
              <Play className="h-3 w-3" />
              Open
            </Button>
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
                  <div className="text-[10px] text-muted-foreground">Columns</div>
                  <div className="text-[11px] font-semibold text-foreground">
                    {selectedTable.columns.length}
                  </div>
                </div>
                <div className="rounded-sm border border-border bg-muted/20 px-2 py-1">
                  <div className="text-[10px] text-muted-foreground">Keys</div>
                  <div className="text-[11px] font-semibold text-foreground">
                    {selectedTable.columns.filter((column) => column.primaryKey).length +
                      (selectedTable.foreignKeys?.length ?? 0)}
                  </div>
                </div>
                <div className="rounded-sm border border-border bg-muted/20 px-2 py-1">
                  <div className="text-[10px] text-muted-foreground">Indexes</div>
                  <div className="text-[11px] font-semibold text-foreground">
                    {(selectedTable.indexes ?? []).filter((index) => !index.primary).length}
                  </div>
                </div>
              </div>

              <div className="rounded-sm border border-border bg-muted/20 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px] font-medium text-foreground">
                    {selectedTable.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {selectedTable.columns.length} cols
                  </span>
                </div>
                {selectedTable.comment ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {selectedTable.comment}
                  </p>
                ) : null}
              </div>

              {(selectedTable.indexes ?? []).filter((index) => !index.primary).length > 0 ? (
                <div className="rounded-sm border border-border bg-background px-2 py-1.5">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Indexes
                  </div>
                  <div className="space-y-1">
                    {(selectedTable.indexes ?? [])
                      .filter((index) => !index.primary)
                      .map((index) => (
                        <div key={index.name} className="text-[10px]">
                          <div className="font-mono text-foreground">{index.name}</div>
                          <div className="text-muted-foreground">
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
