// DB 接続管理ワークスペース — ルーティングシェル
//
/**
 * レガシービュー回帰保護：
 * - workbenchMode === "legacy" || 接続未選択 → 既存UI（接続フォーム・スキーマ・Diff）
 * - workbenchMode === "workbench" && 接続選択済 → WorkbenchLayout
 * 既存機能（接続管理・スキーマ閲覧・Diff比較）は削除禁止
 */

import { useState, useCallback, useMemo, useEffect, useId, useRef } from "react";
import {
  Database, Plus, Trash2, TestTube2, RefreshCw, ChevronRight,
  ArrowLeftRight, Loader2, CheckCircle2, XCircle, Table2,
  Clipboard, Copy, Search, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHostApiFor } from "@/extensions/host-context";
import {
  DEFAULT_DB_PORTS,
  autoNameFrom,
  buildReleaseVerificationBootstrapConfig,
  parseConnectionString,
} from "@/lib/db-connection-string";
import { cn } from "@/lib/utils";
import {
  emitLiveVerificationCompleted,
  emitLiveVerificationFlow,
  emitReleaseCheckpoint,
  readReleaseVerificationConfig,
} from "@/lib/release-verification";
import type {
  DbConnectionConfig, DbDiscoveredEndpoint, DbDriver, DbSchemaSnapshot, DbSchemaDiffResult,
} from "@shared/schema";
import { WorkbenchLayout } from "./db-workbench/WorkbenchLayout";
import { DbSchemaDiffViewer } from "./db-workbench/SchemaDiffPane";
import type { ExtensionWorkspaceProps } from "@/extensions/panel-registry";
import {
  dispatchDbConnectorConnectionSelection,
  subscribeDbConnectorConnectionSelection,
} from "./db-workbench/sidebar/db-connector-sidebar-events";

type WorkspaceView = "connections" | "schema" | "diff" | "sql";

const WORKSPACE_VIEW_STORAGE_KEY = "db-workbench:workspace-view:v1";
const WORKSPACE_CONNECTION_STORAGE_KEY = "db-workbench:selected-connection:v1";
const WORKSPACE_VIEW_QUERY_KEY = "db-workbench-view";
const WORKSPACE_CONNECTION_QUERY_KEY = "db-workbench-connection";
const PRIMARY_WORKSPACE_VIEW: WorkspaceView = "sql";
const CONNECTION_GROUP_UNGROUPED = "未分组";

// ──────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────

function isWorkspaceView(value: string | null): value is WorkspaceView {
  return value === "connections" || value === "schema" || value === "diff" || value === "sql";
}

function readInitialWorkspaceView(selectedConnId: string | null): WorkspaceView {
  if (typeof window === "undefined") return "connections";
  if (selectedConnId) {
    return PRIMARY_WORKSPACE_VIEW;
  }

  const params = new URLSearchParams(window.location.search);
  const routeValue = params.get(WORKSPACE_VIEW_QUERY_KEY);
  if (isWorkspaceView(routeValue)) {
    return routeValue;
  }

  try {
    const storedValue = window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY);
    return isWorkspaceView(storedValue) ? storedValue : "connections";
  } catch {
    return "connections";
  }
}

function readInitialSelectedConnectionId(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const routeValue = params.get(WORKSPACE_CONNECTION_QUERY_KEY);
  if (routeValue) {
    return routeValue;
  }

  try {
    const storedValue = window.localStorage.getItem(WORKSPACE_CONNECTION_STORAGE_KEY);
    return storedValue && storedValue.trim() ? storedValue : null;
  } catch {
    return null;
  }
}

function persistWorkspaceRoute(view: WorkspaceView, connectionId: string | null): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, view);
    if (connectionId) {
      window.localStorage.setItem(WORKSPACE_CONNECTION_STORAGE_KEY, connectionId);
    } else {
      window.localStorage.removeItem(WORKSPACE_CONNECTION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures inside sandboxed runtime iframes.
  }

  try {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set(WORKSPACE_VIEW_QUERY_KEY, view);
    if (connectionId) {
      nextUrl.searchParams.set(WORKSPACE_CONNECTION_QUERY_KEY, connectionId);
    } else {
      nextUrl.searchParams.delete(WORKSPACE_CONNECTION_QUERY_KEY);
    }

    window.history.replaceState(window.history.state, "", nextUrl);
  } catch {
    // Ignore history update failures inside constrained runtime mounts.
  }
}

function emptyConfig(): DbConnectionConfig {
  return {
    id: "",
    name: "",
    driver: "mysql",
    host: "localhost",
    port: DEFAULT_DB_PORTS.mysql,
    database: "",
    username: "root",
    password: "",
    favorite: false,
  };
}

function configFromDiscoveredEndpoint(candidate: DbDiscoveredEndpoint): DbConnectionConfig {
  const database = candidate.databaseHint ?? "";
  const base = emptyConfig();
  return {
    ...base,
    name: autoNameFrom(candidate.host, candidate.port, database),
    driver: candidate.driver,
    host: candidate.host,
    port: candidate.port,
    database,
    username: candidate.usernameHint ?? base.username,
    defaultSchema: candidate.defaultSchemaHint,
  };
}

// 現在の名称が自動生成値（または空）であれば true
function isAutoName(cfg: DbConnectionConfig): boolean {
  return cfg.name === "" || cfg.name === autoNameFrom(cfg.host, cfg.port, cfg.database);
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeConnectionConfig(config: DbConnectionConfig): DbConnectionConfig {
  return {
    ...config,
    environment: config.environment ?? undefined,
    favorite: config.favorite === true ? true : undefined,
    groupName: normalizeOptionalText(config.groupName),
    colorTag: normalizeOptionalText(config.colorTag),
    defaultSchema: normalizeOptionalText(config.defaultSchema),
    notes: normalizeOptionalText(config.notes),
  };
}

function buildConnectionSearchText(connection: DbConnectionConfig): string {
  return [
    connection.name,
    connection.host,
    connection.database,
    connection.username,
    connection.groupName,
    connection.notes,
    connection.environment,
    connection.defaultSchema,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function asColorInputValue(value: string | undefined): string {
  return /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(value ?? "") ? (value as string) : "#3b82f6";
}

function resolveLiveVerificationConnection(
  connections: DbConnectionConfig[],
  target?: {
    driver?: DbDriver;
    connectionId?: string;
    connectionName?: string;
  },
): DbConnectionConfig | null {
  if (connections.length === 0) {
    return null;
  }

  if (target?.connectionId) {
    const matchedById = connections.find((connection) => connection.id === target.connectionId);
    if (matchedById) {
      return matchedById;
    }
  }

  if (target?.connectionName) {
    const normalizedName = target.connectionName.trim().toLowerCase();
    const matchedByName = connections.find(
      (connection) => connection.name.trim().toLowerCase() === normalizedName,
    );
    if (matchedByName) {
      return matchedByName;
    }
  }

  if (target?.driver) {
    return connections.find((connection) => connection.driver === target.driver) ?? null;
  }

  return connections[0] ?? null;
}


// ──────────────────────────────────────────────
// 接続フォーム
// ──────────────────────────────────────────────

function ConnectionForm({
  initial,
  onSave,
  onCancel,
  extensionId,
}: {
  initial: DbConnectionConfig;
  onSave: (c: DbConnectionConfig) => void;
  onCancel: () => void;
  extensionId: string;
}) {
  const [form, setForm] = useState<DbConnectionConfig>(initial);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parseError, setParseError] = useState(false);
  // Capability スコープ済み HostApi を使用する
  const host = useHostApiFor(extensionId);
  const toast = host.notifications.show;
  const formId = useId();
  const showStoredPasswordControls = form.hasStoredPassword && !form.password;

  // 接続文字列を解析してフォームに反映する
  const handleParsePaste = () => {
    const parsed = parseConnectionString(pasteText);
    if (!parsed) {
      setParseError(true);
      return;
    }
    setParseError(false);
    setForm((prev) => {
      const next = { ...prev, ...parsed };
      // 名前が自動生成状態なら更新する
      if (isAutoName(prev)) {
        next.name = autoNameFrom(next.host, next.port, next.database);
      }
      if (parsed.password) {
        next.clearStoredPassword = false;
      }
      return next;
    });
    setShowPaste(false);
    setPasteText("");
  };

  const set = <K extends keyof DbConnectionConfig>(key: K, value: DbConnectionConfig[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ホスト/ポート/DB名変更時に名称を自動同期する（手動編集済みの場合はスキップ）
  const setWithAutoName = (patch: Partial<DbConnectionConfig>) =>
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (isAutoName(prev)) {
        next.name = autoNameFrom(next.host, next.port, next.database);
      }
      return next;
    });

  const handleDriverChange = (driver: DbDriver) => {
    setForm((prev) => ({ ...prev, driver, port: DEFAULT_DB_PORTS[driver] }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await host.connections.test(form);
      setTestResult({ ok: true, msg });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <div className="rounded-md border border-border bg-panel-muted/30 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          P0 support scope
        </p>
        <p className="mt-1 text-[11px] text-foreground">
          Current build supports direct MySQL / PostgreSQL connections with saved-password handling.
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          SSH / TLS / enterprise auth are not product-supported in this build. Environment, readonly, default schema, favorite, group, color tag, and notes are operator controls, not cosmetic metadata.
        </p>
      </div>

      {/* 接続文字列ペーストエリア */}
      <div className="rounded-md border border-border bg-muted/10">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => { setShowPaste((v) => !v); setParseError(false); }}
        >
          <Clipboard className="h-3 w-3" />
          粘贴连接字符串导入
          <ChevronRight className={cn("ml-auto h-3 w-3 transition-transform", showPaste && "rotate-90")} />
        </button>
        {showPaste && (
          <div className="border-t border-border px-3 pb-3 pt-2 space-y-2">
            <textarea
              id={`${formId}-paste`}
              name="connection-paste"
              value={pasteText}
              onChange={(e) => { setPasteText(e.target.value); setParseError(false); }}
              placeholder={"mysql://user:pass@host:3306/db\npostgresql://user:pass@host:5432/db\njdbc:mysql://host:3306/db?user=u&password=p\nhost=localhost port=5432 dbname=mydb user=u password=p\nDB_HOST=localhost DB_PORT=3306 DB_NAME=mydb DB_USER=root DB_PASSWORD=secret\n<DataSourceSettings>...<jdbc-url>jdbc:mysql://localhost:3306/db</jdbc-url>...</DataSourceSettings>"}
              rows={4}
              className={cn(
                "w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring",
                parseError ? "border-destructive" : "border-border",
              )}
            />
            {parseError && (
              <p className="text-[10px] text-destructive">无法识别格式，请检查后重试</p>
            )}
            <Button size="sm" className="h-6 text-xs w-full" onClick={handleParsePaste} disabled={!pasteText.trim()}>
              解析并填入
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <label htmlFor={`${formId}-name`} className="text-xs text-muted-foreground">名称</label>
          <Input
            id={`${formId}-name`}
            name="connection-name"
            autoComplete="organization"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="生产环境 MySQL"
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={`${formId}-driver`} className="text-xs text-muted-foreground">驱动</label>
          <select
            id={`${formId}-driver`}
            name="driver"
            value={form.driver}
            onChange={(e) => handleDriverChange(e.target.value as DbDriver)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs h-7"
          >
            <option value="mysql">MySQL</option>
            <option value="postgres">PostgreSQL</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor={`${formId}-port`} className="text-xs text-muted-foreground">端口</label>
          <Input
            id={`${formId}-port`}
            name="port"
            type="number"
            value={form.port}
            onChange={(e) => setWithAutoName({ port: Number(e.target.value) })}
            className="h-7 text-xs"
          />
        </div>

        <div className="col-span-2 space-y-1">
          <label htmlFor={`${formId}-host`} className="text-xs text-muted-foreground">主机</label>
          <Input
            id={`${formId}-host`}
            name="host"
            autoComplete="url"
            value={form.host}
            onChange={(e) => setWithAutoName({ host: e.target.value })}
            placeholder="localhost"
            className="h-7 text-xs"
          />
        </div>

        <div className="col-span-2 space-y-1">
          <label htmlFor={`${formId}-database`} className="text-xs text-muted-foreground">数据库名</label>
          <Input
            id={`${formId}-database`}
            name="database"
            autoComplete="off"
            value={form.database}
            onChange={(e) => setWithAutoName({ database: e.target.value })}
            placeholder="mydb"
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={`${formId}-username`} className="text-xs text-muted-foreground">用户名</label>
          <Input
            id={`${formId}-username`}
            name="username"
            autoComplete="username"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={`${formId}-password`} className="text-xs text-muted-foreground">密码</label>
          <Input
            id={`${formId}-password`}
            name="password"
            autoComplete="current-password"
            type="password"
            value={form.password}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                password: e.target.value,
                clearStoredPassword: e.target.value ? false : prev.clearStoredPassword,
              }))}
            placeholder={form.hasStoredPassword ? "已安全保存，留空则保持不变" : ""}
            className="h-7 text-xs"
          />
        </div>
        {showStoredPasswordControls ? (
          <div className="col-span-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            <p>
              当前密码已安全保存在系统凭据库中。留空并保存会继续使用该密码。
            </p>
            <label className="mt-2 flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                checked={Boolean(form.clearStoredPassword)}
                onChange={(e) => set("clearStoredPassword", e.target.checked)}
              />
              <span>保存时移除已保存的密码</span>
            </label>
          </div>
        ) : null}

        <div className="col-span-2 mt-1 rounded-md border border-border/60 bg-muted/10 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-foreground">连接治理</p>
              <p className="text-[10px] text-muted-foreground">
                管理环境、默认 schema、分组、收藏和操作备注。
              </p>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={Boolean(form.favorite)}
                onChange={(e) => set("favorite", e.target.checked)}
              />
              <span>收藏</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-environment`} className="text-xs text-muted-foreground">
                环境
              </label>
              <select
                id={`${formId}-environment`}
                value={form.environment ?? ""}
                onChange={(e) =>
                  set(
                    "environment",
                    (e.target.value || undefined) as DbConnectionConfig["environment"],
                  )}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs h-7"
              >
                <option value="">未分类</option>
                <option value="dev">dev</option>
                <option value="test">test</option>
                <option value="prod">prod</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor={`${formId}-default-schema`} className="text-xs text-muted-foreground">
                默认 Schema
              </label>
              <Input
                id={`${formId}-default-schema`}
                name="default-schema"
                value={form.defaultSchema ?? ""}
                onChange={(e) => set("defaultSchema", e.target.value)}
                placeholder={form.driver === "postgres" ? "public" : "留空使用数据库默认"}
                className="h-7 text-xs"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <label htmlFor={`${formId}-group`} className="text-xs text-muted-foreground">
                分组
              </label>
              <Input
                id={`${formId}-group`}
                name="group-name"
                value={form.groupName ?? ""}
                onChange={(e) => set("groupName", e.target.value)}
                placeholder="例如：Production / Analytics / Local"
                className="h-7 text-xs"
              />
            </div>

            <div className="col-span-2 flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-2">
              <label htmlFor={`${formId}-color`} className="shrink-0 text-xs text-muted-foreground">
                颜色标签
              </label>
              <input
                id={`${formId}-color`}
                type="color"
                value={asColorInputValue(form.colorTag)}
                onChange={(e) => set("colorTag", e.target.value)}
                className="h-7 w-10 shrink-0 rounded border border-border bg-transparent p-0.5"
              />
              <Input
                value={form.colorTag ?? ""}
                onChange={(e) => set("colorTag", e.target.value)}
                placeholder="#3b82f6"
                className="h-7 text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px]"
                onClick={() => set("colorTag", undefined)}
              >
                清除
              </Button>
            </div>

            <div className="col-span-2 rounded-md border border-border/60 bg-background px-2 py-2">
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={Boolean(form.readonly)}
                  onChange={(e) => set("readonly", e.target.checked)}
                />
                <span>只读连接</span>
              </label>
              <p className="mt-1 text-[10px] text-muted-foreground">
                启用后，工作台会在运行时阻止 DML / DDL / Data Sync apply。
              </p>
            </div>

            <div className="col-span-2 space-y-1">
              <label htmlFor={`${formId}-notes`} className="text-xs text-muted-foreground">
                备注
              </label>
              <textarea
                id={`${formId}-notes`}
                name="notes"
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                placeholder="例如：BI 只读账号 / 走跳板机 / 每晚同步后再查"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      </div>

      {testResult ? (
        <div className={cn(
          "flex items-start gap-1.5 rounded-md border px-3 py-2 text-xs",
          testResult.ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
            : "border-destructive/40 bg-destructive/10 text-destructive",
        )}>
          {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-px" /> : <XCircle className="h-3.5 w-3.5 shrink-0 mt-px" />}
          <span className="break-all">{testResult.msg}</span>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void handleTest()} disabled={testing}>
          {testing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <TestTube2 className="h-3 w-3 mr-1" />}
          测试
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>取消</Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => onSave(form)} disabled={!form.name || !form.host || !form.database}>
          保存
        </Button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Schema ブラウザ
// ──────────────────────────────────────────────

function SchemaBrowser({ snapshot }: { snapshot: DbSchemaSnapshot }) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const toggle = (name: string) =>
    setExpandedTables((prev) => {
      const s = new Set(prev);
      if (s.has(name)) s.delete(name); else s.add(name);
      return s;
    });

  return (
    <ScrollArea className="h-full">
      <div className="space-y-0.5 px-3 py-2">
        <p className="mb-2 text-[10px] text-muted-foreground">
          {snapshot.tables.length} 张表 · {snapshot.database}
        </p>
        {snapshot.tables.map((table) => (
          <div key={table.name} className="rounded-md border border-border overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors"
              onClick={() => toggle(table.name)}
            >
              <Table2 className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-left font-medium">{table.name}</span>
              <span className="text-muted-foreground">{table.columns.length}</span>
              <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", expandedTables.has(table.name) && "rotate-90")} />
            </button>
            {expandedTables.has(table.name) ? (
              <div className="border-t border-border px-3 py-2 space-y-0.5 bg-muted/10">
                {table.columns.map((col) => (
                  <div key={col.name} className="flex items-center gap-2 text-[11px]">
                    <span className={cn("font-medium", col.primaryKey && "text-amber-600")}>{col.name}</span>
                    <span className="text-muted-foreground">{col.dataType}</span>
                    {col.nullable ? null : <Badge className="h-3.5 px-1 text-[9px] border-border">NOT NULL</Badge>}
                    {col.primaryKey ? <Badge className="h-3.5 px-1 text-[9px] bg-amber-500/10 text-amber-600 border-amber-200">PK</Badge> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

export function DbConnectorWorkspace({
  extensionId,
  workbenchViewId,
}: Pick<ExtensionWorkspaceProps, "extensionId" | "workbenchViewId">) {
  // Capability スコープ済み HostApi を使用する（extensionId で権限を絞り込む）
  const host = useHostApiFor(extensionId);
  const toast = host.notifications.show;
  const qc = useQueryClient();
  const releaseVerification = readReleaseVerificationConfig();
  const [selectedConnId, setSelectedConnId] = useState<string | null>(() => readInitialSelectedConnectionId());
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() => readInitialWorkspaceView(selectedConnId));
  const [editingConfig, setEditingConfig] = useState<DbConnectionConfig | null>(null);
  const [legacyToolsOpen, setLegacyToolsOpen] = useState(false);
  const [resumeRecoveryNotice, setResumeRecoveryNotice] = useState<string | null>(null);
  const [connectionSearch, setConnectionSearch] = useState("");
  const [environmentFilter, setEnvironmentFilter] = useState<"all" | "dev" | "test" | "prod">("all");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [diffSourceId, setDiffSourceId] = useState<string>("");
  const [diffTargetId, setDiffTargetId] = useState<string>("");
  const [diffResult, setDiffResult] = useState<DbSchemaDiffResult | null>(null);
  const [diffSourceSnapshot, setDiffSourceSnapshot] = useState<DbSchemaSnapshot | null>(null);
  const [diffTargetSnapshot, setDiffTargetSnapshot] = useState<DbSchemaSnapshot | null>(null);
  const schemaSelectId = useId();
  const diffSourceSelectId = useId();
  const diffTargetSelectId = useId();
  const initialRecoveryConnectionIdRef = useRef<string | null>(selectedConnId);
  const sidebarMode = workbenchViewId ? "host" : "embedded";
  const recoveryCheckpointSentRef = useRef(false);
  const lastSurfaceCheckpointKeyRef = useRef<string | null>(null);
  const liveVerificationResolutionSentRef = useRef(false);
  const liveVerificationBootstrapAttemptedRef = useRef(false);
  const liveVerificationBootstrapStartedAtRef = useRef<number | null>(null);
  const liveVerificationBootstrapStateRef = useRef<"idle" | "saving" | "saved" | "failed">("idle");
  const discoveryEnabled = workspaceView === "connections" && !editingConfig;

  // 接続一覧
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["/db/connections"],
    queryFn: () => host.connections.list(),
  });

  const {
    data: discoveredEndpoints = [],
    isFetching: isDiscoveringLocal,
    error: discoveredEndpointsError,
    refetch: refetchDiscoveredEndpoints,
  } = useQuery({
    queryKey: ["/db/connections/discover-local"],
    queryFn: () => host.connections.discoverLocal(),
    enabled: discoveryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // スキーマ取得
  const { data: snapshot, isFetching: isIntrospecting, refetch: refetchSchema } = useQuery({
    queryKey: ["/db/schema", selectedConnId],
    queryFn: () => host.connections.introspect(selectedConnId!),
    enabled: selectedConnId !== null,
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: (config: DbConnectionConfig) => host.connections.save(config),
    onSuccess: (savedConfig) => {
      void qc.invalidateQueries({ queryKey: ["/db/connections"] });
      setEditingConfig(null);
      setResumeRecoveryNotice(null);
      setSelectedConnId(savedConfig.id);
      setWorkspaceView(PRIMARY_WORKSPACE_VIEW);
      toast({ title: "已保存", variant: "success" });
    },
    onError: (e) => toast({ title: "保存失败", description: String(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => host.connections.remove(id),
    onSuccess: (_result, deletedId) => {
      void qc.invalidateQueries({ queryKey: ["/db/connections"] });
      if (selectedConnId === deletedId) {
        setSelectedConnId(null);
        setWorkspaceView("connections");
      }
      if (diffSourceId === deletedId) {
        setDiffSourceId("");
      }
      if (diffTargetId === deletedId) {
        setDiffTargetId("");
      }
      toast({ title: "已删除", variant: "success" });
    },
    onError: (e) => toast({ title: "删除失败", description: String(e), variant: "destructive" }),
  });

  const [isDiffing, setIsDiffing] = useState(false);

  const clearDiff = useCallback(() => {
    setDiffResult(null);
    setDiffSourceSnapshot(null);
    setDiffTargetSnapshot(null);
  }, []);

  const handleDiff = useCallback(async () => {
    if (!diffSourceId || !diffTargetId) return;
    setIsDiffing(true);
    clearDiff();
    try {
      // スナップショットと差分を並列取得
      const [src, tgt, result] = await Promise.all([
        host.connections.introspect(diffSourceId),
        host.connections.introspect(diffTargetId),
        host.connections.diff(diffSourceId, diffTargetId),
      ]);
      setDiffSourceSnapshot(src);
      setDiffTargetSnapshot(tgt);
      setDiffResult(result);
    } catch (e) {
      toast({ title: "对比失败", description: String(e), variant: "destructive" });
    } finally {
      setIsDiffing(false);
    }
  }, [diffSourceId, diffTargetId, clearDiff, toast]);

  // アクティブ接続オブジェクト（selectedConnId から解決）
  const activeConnection = selectedConnId
    ? connections.find((c) => c.id === selectedConnId) ?? null
    : null;
  const liveVerificationBootstrap = useMemo(
    () =>
      buildReleaseVerificationBootstrapConfig({
        driver: releaseVerification.live?.driver,
        connectionName: releaseVerification.live?.connectionName,
        connectionString: releaseVerification.live?.connectionString,
        readonly: releaseVerification.live?.readonly,
        defaultSchema: releaseVerification.live?.defaultSchema,
      }),
    [
      releaseVerification.live?.connectionName,
      releaseVerification.live?.connectionString,
      releaseVerification.live?.defaultSchema,
      releaseVerification.live?.driver,
      releaseVerification.live?.readonly,
    ],
  );
  const liveVerificationTarget = releaseVerification.live?.enabled
    ? resolveLiveVerificationConnection(connections, {
        driver: releaseVerification.live.driver,
        connectionId: releaseVerification.live.connectionId,
        connectionName: releaseVerification.live.connectionName,
      })
    : null;

  const groupedConnections = useMemo(() => {
    const normalizedSearch = connectionSearch.trim().toLowerCase();
    const filtered = connections.filter((connection) => {
      if (favoriteOnly && connection.favorite !== true) {
        return false;
      }
      if (
        environmentFilter !== "all" &&
        connection.environment !== environmentFilter
      ) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return buildConnectionSearchText(connection).includes(normalizedSearch);
    });

    const buckets = new Map<string, DbConnectionConfig[]>();
    for (const connection of filtered) {
      const key = normalizeOptionalText(connection.groupName) ?? CONNECTION_GROUP_UNGROUPED;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(connection);
      } else {
        buckets.set(key, [connection]);
      }
    }

    return Array.from(buckets.entries())
      .map(([groupName, items]) => ({
        groupName,
        items: items.sort((left, right) => {
          if ((left.favorite === true) !== (right.favorite === true)) {
            return left.favorite === true ? -1 : 1;
          }
          return (left.name || left.database).localeCompare(right.name || right.database);
        }),
      }))
      .sort((left, right) => {
        if (left.groupName === CONNECTION_GROUP_UNGROUPED && right.groupName !== CONNECTION_GROUP_UNGROUPED) {
          return 1;
        }
        if (right.groupName === CONNECTION_GROUP_UNGROUPED && left.groupName !== CONNECTION_GROUP_UNGROUPED) {
          return -1;
        }
        return left.groupName.localeCompare(right.groupName);
      });
  }, [connectionSearch, connections, environmentFilter, favoriteOnly]);

  const openConnectionView = useCallback(() => {
    setEditingConfig(null);
    setLegacyToolsOpen(false);
    setWorkspaceView("connections");
  }, []);

  const activateConnection = useCallback((connectionId: string, nextView: WorkspaceView = PRIMARY_WORKSPACE_VIEW) => {
    setResumeRecoveryNotice(null);
    setLegacyToolsOpen(false);
    setSelectedConnId(connectionId);
    setWorkspaceView(nextView);
  }, []);

  useEffect(() => {
    if (!selectedConnId) {
      return;
    }
    dispatchDbConnectorConnectionSelection(selectedConnId);
  }, [selectedConnId]);

  useEffect(
    () =>
      subscribeDbConnectorConnectionSelection((connectionId) => {
        if (!connectionId || connectionId === selectedConnId) {
          return;
        }
        activateConnection(connectionId, PRIMARY_WORKSPACE_VIEW);
      }),
    [activateConnection, selectedConnId],
  );

  const prefillDiscoveredConnection = useCallback((candidate: DbDiscoveredEndpoint) => {
    setResumeRecoveryNotice(null);
    setEditingConfig(configFromDiscoveredEndpoint(candidate));
    setWorkspaceView("connections");
  }, []);

  const activeConnectionLabel = activeConnection
    ? `${activeConnection.name || activeConnection.database} · ${activeConnection.driver}://${activeConnection.host}:${activeConnection.port}/${activeConnection.database}`
    : "未选择活动连接";

  const hasConnections = connections.length > 0;
  const activeTabValue = editingConfig ? "connections" : workspaceView;
  const legacyToolActive = activeTabValue === "schema" || activeTabValue === "diff";
  const shellSurfaceStatus =
    activeTabValue === "schema" || activeTabValue === "diff"
      ? "Secondary"
      : activeTabValue === "sql" && activeConnection
        ? "Primary"
        : "Primary Support";
  const shellTitle =
    activeTabValue === "schema"
      ? "Legacy Schema Browser"
      : activeTabValue === "diff"
        ? "Legacy Schema Diff"
        : activeTabValue === "sql" && activeConnection
          ? "Database Workspace"
          : "Connection Center";
  const shellDescription =
    activeTabValue === "schema"
      ? "Secondary migration surface. 保留用于迁移期验证，但不再作为统一工作台的一级入口。"
      : activeTabValue === "diff"
        ? "Secondary migration surface. 旧版结构 Diff 仍可用，但不再与主工作台平级。"
        : activeTabValue === "sql" && activeConnection
          ? "Primary daily-driver surface. 连接、对象浏览、查询、结果和检查能力应被理解为一个统一工作台。"
          : "Primary support surface. 先配置或选择连接，再进入统一 Database Workspace。";

  useEffect(() => {
    persistWorkspaceRoute(activeTabValue, selectedConnId);
  }, [activeTabValue, selectedConnId]);

  useEffect(() => {
    if (!releaseVerification.enabled) {
      return;
    }

    const checkpointKey =
      activeTabValue === "sql" && activeConnection
        ? `sql:${activeConnection.id}`
        : activeTabValue;
    if (lastSurfaceCheckpointKeyRef.current === checkpointKey) {
      return;
    }
    lastSurfaceCheckpointKeyRef.current = checkpointKey;

    void emitReleaseCheckpoint("db_workbench_surface_ready", {
      activeTabValue,
      selectedConnectionId: activeConnection?.id ?? null,
    });
  }, [activeConnection?.id, activeTabValue, releaseVerification.enabled]);

  useEffect(() => {
    if (!releaseVerification.enabled || isLoading || recoveryCheckpointSentRef.current) {
      return;
    }

    const requestedConnectionId = initialRecoveryConnectionIdRef.current;
    const recoveryClassification = requestedConnectionId
      ? connections.some((connection) => connection.id === requestedConnectionId)
        ? "restored"
        : "missing-fallback"
      : "none";

    recoveryCheckpointSentRef.current = true;
    void emitReleaseCheckpoint("db_workbench_recovery_classified", {
      classification: recoveryClassification,
      requestedConnectionId: requestedConnectionId ?? null,
      activeConnectionId: activeConnection?.id ?? null,
    });
  }, [activeConnection?.id, connections, isLoading, releaseVerification.enabled]);

  useEffect(() => {
    if (
      !releaseVerification.enabled ||
      !releaseVerification.live?.enabled ||
      isLoading ||
      editingConfig
    ) {
      return;
    }

    if (liveVerificationTarget) {
      if (selectedConnId !== liveVerificationTarget.id || workspaceView !== PRIMARY_WORKSPACE_VIEW) {
        activateConnection(liveVerificationTarget.id, PRIMARY_WORKSPACE_VIEW);
      }
      return;
    }

    if (
      liveVerificationBootstrap.config &&
      !liveVerificationBootstrapAttemptedRef.current &&
      liveVerificationBootstrapStateRef.current === "idle"
    ) {
      liveVerificationBootstrapAttemptedRef.current = true;
      liveVerificationBootstrapStartedAtRef.current = Date.now();
      liveVerificationBootstrapStateRef.current = "saving";
      void saveMutation
        .mutateAsync(normalizeConnectionConfig(liveVerificationBootstrap.config))
        .then(() => {
          liveVerificationBootstrapStateRef.current = "saved";
        })
        .catch((error) => {
          liveVerificationBootstrapStateRef.current = "failed";
          if (liveVerificationResolutionSentRef.current) {
            return;
          }
          liveVerificationResolutionSentRef.current = true;
          const note = `Live verification bootstrap connection could not be saved: ${String(error)}`;
          void emitLiveVerificationFlow("connect", "failed", {
            driver: releaseVerification.live?.driver ?? liveVerificationBootstrap.config?.driver,
            note,
          });
          void emitLiveVerificationCompleted({
            driver: releaseVerification.live?.driver ?? liveVerificationBootstrap.config?.driver,
            status: "failed",
            note,
          });
        });
      return;
    }

    if (liveVerificationBootstrapStateRef.current === "saving") {
      return;
    }

    if (liveVerificationBootstrapStateRef.current === "saved") {
      const startedAt = liveVerificationBootstrapStartedAtRef.current;
      if (startedAt && Date.now() - startedAt < 5_000) {
        return;
      }
    }

    if (liveVerificationResolutionSentRef.current) {
      return;
    }
    liveVerificationResolutionSentRef.current = true;
    const resolutionNote =
      liveVerificationBootstrap.error ??
      (liveVerificationBootstrap.config
        ? "Live verification bootstrap connection did not resolve to a saved target."
        : "No saved connection matched the requested live verification target, and no bootstrap connection string was provided.");
    void emitLiveVerificationFlow("connect", "failed", {
      driver: releaseVerification.live.driver,
      note: resolutionNote,
    });
    void emitLiveVerificationCompleted({
      driver: releaseVerification.live.driver,
      status: "failed",
      note: resolutionNote,
    });
  }, [
    activateConnection,
    editingConfig,
    isLoading,
    liveVerificationBootstrap,
    liveVerificationTarget,
    releaseVerification.enabled,
    releaseVerification.live,
    saveMutation,
    selectedConnId,
    workspaceView,
  ]);

  useEffect(() => {
    if (!selectedConnId) return;
    if (connections.some((connection) => connection.id === selectedConnId)) return;

    setResumeRecoveryNotice("未能恢复上次活动连接。该连接已不存在或不可用，已回退到连接中心。");
    setSelectedConnId(null);
    if (workspaceView === "sql") {
      setWorkspaceView("connections");
    }
  }, [connections, selectedConnId, workspaceView]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-panel-muted/40 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">DB Workbench</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              连接管理是辅助面，真正的日常 DB 操作应通过统一的 Database Workspace 完成。
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden max-w-[420px] rounded-md border border-border bg-background px-3 py-1.5 md:block">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Active Context
              </div>
              <p className="mt-0.5 truncate font-mono text-[11px] text-foreground">
                {activeConnectionLabel}
              </p>
              {activeConnection ? (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                    {activeConnection.driver}
                  </Badge>
                  {activeConnection.environment ? (
                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                      {activeConnection.environment}
                    </Badge>
                  ) : null}
                  {activeConnection.readonly ? (
                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                      readonly
                    </Badge>
                  ) : null}
                  {activeConnection.defaultSchema ? (
                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                      schema:{activeConnection.defaultSchema}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setEditingConfig(emptyConfig());
                setWorkspaceView("connections");
              }}
            >
              <Plus className="mr-1 h-3 w-3" />
              新建连接
            </Button>
          </div>
        </div>
      </div>

      {resumeRecoveryNotice ? (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                Connection recovery
              </p>
              <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                {resumeRecoveryNotice}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
              onClick={() => setResumeRecoveryNotice(null)}
            >
              关闭
            </Button>
          </div>
        </div>
      ) : null}

      <Tabs
        value={activeTabValue}
        onValueChange={(value) => {
          if (!isWorkspaceView(value)) return;
          if (editingConfig) {
            setEditingConfig(null);
          }
          setWorkspaceView(value);
        }}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-foreground">{shellTitle}</p>
              <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                {shellSurfaceStatus}
              </Badge>
              {legacyToolActive ? (
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                  Legacy
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {shellDescription}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant={activeTabValue === "connections" ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={openConnectionView}
            >
              连接中心
            </Button>
            <Button
              size="sm"
              variant={activeTabValue === "sql" ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => {
                if (activeConnection) {
                  setEditingConfig(null);
                  setLegacyToolsOpen(false);
                  setWorkspaceView(PRIMARY_WORKSPACE_VIEW);
                } else {
                  openConnectionView();
                }
              }}
            >
              Database workspace
            </Button>
            <div className="ml-1 flex items-center gap-1 border-l border-border pl-2">
              <Button
                size="sm"
                variant={legacyToolActive || legacyToolsOpen ? "outline" : "ghost"}
                className="h-7 px-2 text-xs"
                onClick={() => setLegacyToolsOpen((current) => !current)}
              >
                Legacy tools
              </Button>
              {(legacyToolsOpen || legacyToolActive) ? (
                <>
                  <Button
                    size="sm"
                    variant={activeTabValue === "schema" ? "outline" : "ghost"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setWorkspaceView("schema")}
                    disabled={!selectedConnId}
                  >
                    Schema
                  </Button>
                  <Button
                    size="sm"
                    variant={activeTabValue === "diff" ? "outline" : "ghost"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setWorkspaceView("diff")}
                    disabled={!hasConnections}
                  >
                    Diff
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <TabsContent value="connections" className="mt-0 min-h-0 flex-1 overflow-hidden">
          {editingConfig ? (
            <div className="h-full overflow-y-auto">
              <ConnectionForm
                initial={editingConfig}
                onSave={(c) => saveMutation.mutate(normalizeConnectionConfig(c))}
                onCancel={() => setEditingConfig(null)}
                extensionId={extensionId}
              />
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center justify-between px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-foreground">连接中心</p>
                  <p className="text-[10px] text-muted-foreground">
                    Connection Center is a primary support surface. 配置连接后直接进入统一 Database Workspace；旧版 Schema 和 Diff 仅作为次级工具保留。
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    当前构建仅承诺 direct MySQL / PostgreSQL 连接与安全保存密码；SSH / TLS / 企业认证仍未作为产品能力承诺。
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => setEditingConfig(emptyConfig())}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  添加
                </Button>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-1.5 px-3 pb-3">
                  <div className="rounded-md border border-border bg-panel-muted/30 px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">发现的本地数据库</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          仅探测本机默认 MySQL / PostgreSQL 端口；结果是候选端点，不会自动保存。
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => void refetchDiscoveredEndpoints()}
                        disabled={isDiscoveringLocal}
                      >
                        {isDiscoveringLocal ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 h-3 w-3" />
                        )}
                        重新扫描
                      </Button>
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {isDiscoveringLocal && discoveredEndpoints.length === 0 ? (
                        <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          正在扫描本机默认数据库端口…
                        </div>
                      ) : discoveredEndpointsError ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
                          本地数据库扫描失败：{String(discoveredEndpointsError)}
                        </div>
                      ) : discoveredEndpoints.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">
                          暂未发现本机默认 MySQL / PostgreSQL 实例。你仍然可以手动添加连接。
                        </div>
                      ) : discoveredEndpoints.map((candidate) => {
                        const existingConnection = connections.find((connection) =>
                          connection.driver === candidate.driver
                          && connection.host === candidate.host
                          && connection.port === candidate.port
                        );
                        return (
                          <div
                            key={candidate.id}
                            className="rounded-md border border-border bg-background px-2.5 py-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate text-xs font-medium text-foreground">
                                    {candidate.label}
                                  </p>
                                  <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                                    {candidate.driver}
                                  </Badge>
                                  <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                                    {candidate.confidence}
                                  </Badge>
                                </div>
                                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                                  {candidate.host}:{candidate.port}
                                  {candidate.databaseHint ? `/${candidate.databaseHint}` : ""}
                                  {candidate.usernameHint ? ` · ${candidate.usernameHint}` : ""}
                                </p>
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                  {candidate.detail}
                                </p>
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                  来源：{candidate.source}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {existingConnection ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => activateConnection(existingConnection.id, PRIMARY_WORKSPACE_VIEW)}
                                  >
                                    打开已保存
                                  </Button>
                                ) : null}
                                <Button
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => prefillDiscoveredConnection(candidate)}
                                >
                                  填入连接
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-panel-muted/20 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={connectionSearch}
                          onChange={(e) => setConnectionSearch(e.target.value)}
                          placeholder="搜索名称、主机、数据库、分组或备注"
                          className="h-7 border-border bg-background pl-7 text-xs"
                        />
                      </div>
                      <select
                        value={environmentFilter}
                        onChange={(e) =>
                          setEnvironmentFilter(
                            e.target.value as typeof environmentFilter,
                          )}
                        className="h-7 rounded-md border border-border bg-background px-2 py-1 text-xs"
                      >
                        <option value="all">全部环境</option>
                        <option value="dev">dev</option>
                        <option value="test">test</option>
                        <option value="prod">prod</option>
                      </select>
                      <label className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={favoriteOnly}
                          onChange={(e) => setFavoriteOnly(e.target.checked)}
                        />
                        <Star className="h-3 w-3" />
                        <span>仅收藏</span>
                      </label>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {groupedConnections.reduce((count, section) => count + section.items.length, 0)} 个结果 /
                      {connections.length} 个已保存连接
                    </p>
                  </div>

                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : !hasConnections ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                      <Database className="h-8 w-8 opacity-30" />
                      <p className="text-xs">暂无连接，先添加一个数据库连接来启动工作台。</p>
                    </div>
                  ) : groupedConnections.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-3 py-10 text-center text-muted-foreground">
                      <Search className="h-5 w-5 opacity-40" />
                      <p className="text-xs">当前筛选条件下没有匹配的连接。</p>
                    </div>
                  ) : groupedConnections.map((section) => (
                    <div key={section.groupName} className="rounded-md border border-border bg-panel-muted/10">
                      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {section.groupName}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {section.items.length} 个连接
                          </p>
                        </div>
                        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                          group
                        </Badge>
                      </div>

                      <div className="space-y-1.5 px-2 py-2">
                        {section.items.map((conn) => {
                          const isSelected = conn.id === selectedConnId;
                          const displayName = conn.name || conn.database;
                          return (
                            <div
                              key={conn.id}
                              className={cn(
                                "rounded-md border border-border bg-background px-3 py-2",
                                isSelected && "border-primary/40 bg-primary/5",
                              )}
                              style={
                                conn.colorTag
                                  ? { boxShadow: `inset 3px 0 0 ${conn.colorTag}` }
                                  : undefined
                              }
                            >
                              <div className="flex items-start gap-2">
                                <Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 flex-col items-start text-left"
                                  onClick={() => activateConnection(conn.id, PRIMARY_WORKSPACE_VIEW)}
                                >
                                  <div className="flex w-full items-center gap-1.5">
                                    <p className="truncate text-xs font-medium text-foreground">
                                      {displayName}
                                    </p>
                                    {conn.favorite ? (
                                      <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                                    ) : null}
                                  </div>
                                  <p className="mt-0.5 w-full truncate font-mono text-[10px] text-muted-foreground">
                                    {conn.driver}://{conn.host}:{conn.port}/{conn.database}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                                      {conn.driver}
                                    </Badge>
                                    {conn.environment ? (
                                      <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                                        {conn.environment}
                                      </Badge>
                                    ) : null}
                                    {conn.readonly ? (
                                      <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                                        readonly
                                      </Badge>
                                    ) : null}
                                    {conn.defaultSchema ? (
                                      <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                                        schema:{conn.defaultSchema}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  {conn.notes ? (
                                    <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                                      {conn.notes}
                                    </p>
                                  ) : null}
                                </button>
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 shrink-0"
                                    aria-label={`编辑连接 ${displayName}`}
                                    onClick={() => setEditingConfig(conn)}
                                  >
                                    <ChevronRight className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 shrink-0 text-muted-foreground"
                                    aria-label={`复制连接 ${displayName}`}
                                    onClick={() =>
                                      setEditingConfig({
                                        ...conn,
                                        id: "",
                                        name: `${displayName} - 副本`,
                                        password: "",
                                        hasStoredPassword: false,
                                        clearStoredPassword: false,
                                        favorite: false,
                                      })
                                    }
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                                    aria-label={`删除连接 ${displayName}`}
                                    onClick={() => deleteMutation.mutate(conn.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </TabsContent>

        <TabsContent value="schema" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-end gap-2 px-3 py-2">
              <div className="min-w-0 flex-1 space-y-1">
                <label htmlFor={schemaSelectId} className="text-xs text-muted-foreground">
                  连接
                </label>
                <select
                  id={schemaSelectId}
                  value={selectedConnId ?? ""}
                  onChange={(e) => setSelectedConnId(e.target.value || null)}
                  className="flex h-7 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">选择连接…</option>
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7 shrink-0"
                aria-label="刷新当前 Schema"
                onClick={() => void refetchSchema()}
                disabled={!selectedConnId || isIntrospecting}
              >
                {isIntrospecting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
              {activeConnection ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => setWorkspaceView(PRIMARY_WORKSPACE_VIEW)}
                >
                  返回 Database Workspace
                </Button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden border-t border-border">
              {!selectedConnId ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  请先选择连接
                </div>
              ) : isIntrospecting ? (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在获取 Schema…
                </div>
              ) : snapshot ? (
                <SchemaBrowser snapshot={snapshot} />
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="diff" className="mt-0 min-h-0 flex-1 overflow-hidden">
          {diffResult && diffSourceSnapshot && diffTargetSnapshot ? (
            <DbSchemaDiffViewer
              source={diffSourceSnapshot}
              target={diffTargetSnapshot}
              result={diffResult}
              onReset={clearDiff}
            />
          ) : (
            <div className="flex h-full flex-col gap-3 px-3 py-3">
              <div>
                <p className="text-xs font-medium text-foreground">Schema Diff</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  这是保留中的 legacy diff 路径，用于迁移期结构比较和回归验证。
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={diffSourceSelectId} className="text-xs text-muted-foreground">源（Source）</label>
                <select
                  id={diffSourceSelectId}
                  value={diffSourceId}
                  onChange={(e) => setDiffSourceId(e.target.value)}
                  className="h-7 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">选择连接…</option>
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={diffTargetSelectId} className="text-xs text-muted-foreground">目标（Target）</label>
                <select
                  id={diffTargetSelectId}
                  value={diffTargetId}
                  onChange={(e) => setDiffTargetId(e.target.value)}
                  className="h-7 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">选择连接…</option>
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                className="h-8 w-full text-xs"
                onClick={() => void handleDiff()}
                disabled={!diffSourceId || !diffTargetId || isDiffing}
              >
                {isDiffing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
                )}
                {isDiffing ? "对比中…" : "开始对比"}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sql" className="mt-0 min-h-0 flex-1 overflow-hidden">
          {activeConnection ? (
            <WorkbenchLayout
              connection={activeConnection}
              hostApi={host}
              onManageConnections={openConnectionView}
              onSwitchConnection={(connectionId) => activateConnection(connectionId, PRIMARY_WORKSPACE_VIEW)}
              sidebarMode={sidebarMode}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <Database className="h-10 w-10 text-muted-foreground/40" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">先选择一个连接，再进入统一 Database Workspace</p>
                <p className="text-xs text-muted-foreground">
                  连接选定后，查询、对象浏览、结果和检查能力会在同一个操作面里协同工作。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-7 px-3 text-xs" onClick={openConnectionView}>
                  去连接中心
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs"
                  onClick={() => {
                    setEditingConfig(emptyConfig());
                    setWorkspaceView("connections");
                  }}
                >
                  新建连接
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
