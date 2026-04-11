// DB 接続管理ワークスペース — ルーティングシェル
//
/**
 * レガシービュー回帰保護：
 * - workbenchMode === "legacy" || 接続未選択 → 既存UI（接続フォーム・スキーマ・Diff）
 * - workbenchMode === "workbench" && 接続選択済 → WorkbenchLayout
 * 既存機能（接続管理・スキーマ閲覧・Diff比較）は削除禁止
 */

import { useState, useCallback, useMemo, useEffect, useId } from "react";
import {
  Database, Plus, Trash2, TestTube2, RefreshCw, ChevronRight,
  ArrowLeftRight, Loader2, CheckCircle2, XCircle, Table2, Columns2, List,
  Clipboard, Copy, Layers, Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHostApiFor } from "@/extensions/host-context";
import { cn } from "@/lib/utils";
import { DiffContent, dbSnapshotDiffToDiffEntries } from "@/components/diff-viewer";
import { dbSnapshotDiffToStructuredEntries } from "@/components/diff-viewer/structured-adapter";
import { StructuredDiffContent } from "@/components/diff-viewer/StructuredDiffContent";
import { MonacoDdlDiff } from "@/components/diff-viewer/MonacoDdlDiff";
import type { DiffViewMode, DiffTableEntry } from "@/components/diff-viewer";
import type { StructuredDiffEntry } from "@/components/diff-viewer/structured-types";
import type {
  DbConnectionConfig, DbDriver, DbSchemaSnapshot, DbSchemaDiffResult,
} from "@shared/schema";
import { WorkbenchLayout } from "./db-workbench/WorkbenchLayout";

const DEFAULT_PORTS: Record<DbDriver, number> = { mysql: 3306, postgres: 5432 };
type WorkspaceView = "connections" | "schema" | "diff" | "sql";

const WORKSPACE_VIEW_STORAGE_KEY = "db-workbench:workspace-view:v1";
const WORKSPACE_CONNECTION_STORAGE_KEY = "db-workbench:selected-connection:v1";
const WORKSPACE_VIEW_QUERY_KEY = "db-workbench-view";
const WORKSPACE_CONNECTION_QUERY_KEY = "db-workbench-connection";
const PRIMARY_WORKSPACE_VIEW: WorkspaceView = "sql";

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

  const storedValue = window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY);
  return isWorkspaceView(storedValue) ? storedValue : "connections";
}

function readInitialSelectedConnectionId(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const routeValue = params.get(WORKSPACE_CONNECTION_QUERY_KEY);
  if (routeValue) {
    return routeValue;
  }

  const storedValue = window.localStorage.getItem(WORKSPACE_CONNECTION_STORAGE_KEY);
  return storedValue && storedValue.trim() ? storedValue : null;
}

function persistWorkspaceRoute(view: WorkspaceView, connectionId: string | null): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, view);
  if (connectionId) {
    window.localStorage.setItem(WORKSPACE_CONNECTION_STORAGE_KEY, connectionId);
  } else {
    window.localStorage.removeItem(WORKSPACE_CONNECTION_STORAGE_KEY);
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(WORKSPACE_VIEW_QUERY_KEY, view);
  if (connectionId) {
    nextUrl.searchParams.set(WORKSPACE_CONNECTION_QUERY_KEY, connectionId);
  } else {
    nextUrl.searchParams.delete(WORKSPACE_CONNECTION_QUERY_KEY);
  }

  window.history.replaceState(window.history.state, "", nextUrl);
}

function emptyConfig(): DbConnectionConfig {
  return { id: "", name: "", driver: "mysql", host: "localhost", port: 3306, database: "", username: "root", password: "" };
}

// ホスト・ポート・データベース名から自動生成する接続名を返す
function autoNameFrom(host: string, port: number, database: string): string {
  return database ? `${host}:${port}@${database}` : "";
}

// 現在の名称が自動生成値（または空）であれば true
function isAutoName(cfg: DbConnectionConfig): boolean {
  return cfg.name === "" || cfg.name === autoNameFrom(cfg.host, cfg.port, cfg.database);
}

// 接続文字列をパースして DbConnectionConfig の一部を返す
// 対応フォーマット:
//   mysql://user:pass@host:port/db
//   postgresql://user:pass@host:port/db
//   jdbc:mysql://host:port/db?user=u&password=p
//   jdbc:postgresql://host:port/db?user=u&password=p
//   host=h port=p dbname=d user=u password=p  (psql キーバリュー形式)
//   DB_HOST=h DB_PORT=p DB_NAME=d DB_USER=u DB_PASSWORD=p  (.env 形式)
//   JetBrains DataSourceSettings XML / clipboard dump
function parseConnectionString(input: string): Partial<DbConnectionConfig> | null {
  const s = input.trim();
  if (!s) return null;

  // ── URL 形式（mysql:// / postgresql:// / jdbc:mysql:// / jdbc:postgresql://）──
  const urlMatch = s.match(
    /^(?:jdbc:)?(mysql|postgresql|postgres):\/\/([^:@/\s]*)(?::([^@/\s]*))?@([^:/\s]+)(?::(\d+))?\/([^?#\s]*)/i,
  );
  if (urlMatch) {
    const [, proto, user, pass, host, portStr, db] = urlMatch;
    const driver: DbDriver = proto.toLowerCase().startsWith("postgres") ? "postgres" : "mysql";
    const port = portStr ? Number(portStr) : DEFAULT_PORTS[driver];
    // クエリパラメータからも user / password を取得（jdbc 形式）
    const qUser = s.match(/[?&]user=([^&\s]+)/i)?.[1] ?? user;
    const qPass = s.match(/[?&]password=([^&\s]+)/i)?.[1] ?? pass;
    return {
      driver,
      host: host || "localhost",
      port,
      database: db || "",
      username: qUser || "",
      password: qPass || "",
    };
  }

  // ── psql キーバリュー形式（host=… port=… dbname=… user=… password=…）──
  if (/\bhost\s*=/.test(s) || /\bdbname\s*=/.test(s)) {
    const kv = (key: string) => s.match(new RegExp(`\\b${key}\\s*=\\s*([^\\s]+)`))?.[1] ?? "";
    const portVal = kv("port");
    const driver: DbDriver = "postgres";
    return {
      driver,
      host: kv("host") || "localhost",
      port: portVal ? Number(portVal) : DEFAULT_PORTS[driver],
      database: kv("dbname") || kv("database"),
      username: kv("user") || kv("username"),
      password: kv("password"),
    };
  }

  // ── .env / 環境変数形式（DB_HOST=… DB_PORT=… DB_NAME=…）──
  if (/DB_HOST\s*=/i.test(s) || /DATABASE_URL\s*=/i.test(s)) {
    // DATABASE_URL が含まれている場合は再帰でパース
    const urlLine = s.match(/DATABASE_URL\s*=\s*["']?([^\s"']+)/i)?.[1];
    if (urlLine) return parseConnectionString(urlLine);

    const ev = (key: string) =>
      s.match(new RegExp(`${key}\\s*=\\s*["']?([^"'\\s]+)`, "i"))?.[1] ?? "";
    const driverRaw = ev("DB_DRIVER") || ev("DB_CONNECTION") || "mysql";
    const driver: DbDriver = driverRaw.toLowerCase().startsWith("postgres") ? "postgres" : "mysql";
    const portVal = ev("DB_PORT");
    return {
      driver,
      host: ev("DB_HOST") || "localhost",
      port: portVal ? Number(portVal) : DEFAULT_PORTS[driver],
      database: ev("DB_NAME") || ev("DB_DATABASE"),
      username: ev("DB_USER") || ev("DB_USERNAME"),
      password: ev("DB_PASSWORD") || ev("DB_PASS"),
    };
  }

  // ── JetBrains DataSourceSettings XML / clipboard dump ──
  if (/<data-source\b/i.test(s) || /<jdbc-url>/i.test(s)) {
    const readTag = (tagName: string) => s.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"))?.[1]?.trim() ?? "";
    const readAttr = (attrName: string) => s.match(new RegExp(`${attrName}="([^"]+)"`, "i"))?.[1]?.trim() ?? "";

    const jdbcUrl = readTag("jdbc-url");
    const userName = readTag("user-name");
    const dsName = readAttr("name");
    const product = readAttr("product");
    const driverRef = readTag("driver-ref") || readAttr("dbms");

    const parsedUrl = jdbcUrl ? parseConnectionString(jdbcUrl) : null;
    if (parsedUrl) {
      return {
        ...parsedUrl,
        username: userName || parsedUrl.username,
        name: dsName || undefined,
        driver: parsedUrl.driver,
      };
    }

    const driverText = `${product} ${driverRef}`.toLowerCase();
    const driver: DbDriver = driverText.includes("postgres") ? "postgres" : "mysql";
    const host = s.match(/jdbc:[^:]+:\/\/([^:/\s]+)(?::(\d+))?\/([^\s<]+)/i);
    if (host) {
      return {
        driver,
        host: host[1] || "localhost",
        port: host[2] ? Number(host[2]) : DEFAULT_PORTS[driver],
        database: host[3] || "",
        username: userName || "",
        name: dsName || "",
      };
    }
  }

  return null;
}

function diffActionBadge(action: DiffTableEntry["action"]) {
  if (action === "added") return <Badge className="h-4 px-1 text-[10px] bg-emerald-500/15 text-emerald-600 border-emerald-200">+追加</Badge>;
  if (action === "removed") return <Badge className="h-4 px-1 text-[10px] bg-red-500/15 text-red-600 border-red-200">−削除</Badge>;
  return <Badge className="h-4 px-1 text-[10px] bg-amber-500/15 text-amber-600 border-amber-200">△変更</Badge>;
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
    setForm((prev) => ({ ...prev, driver, port: DEFAULT_PORTS[driver] }));
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
// DIFF コードビュー
// ──────────────────────────────────────────────

interface DbDiffPanelProps {
  source: DbSchemaSnapshot;
  target: DbSchemaSnapshot;
  result: DbSchemaDiffResult;
  onReset: () => void;
}

function DbDiffPanel({ source, target, result, onReset }: DbDiffPanelProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tabMode, setTabMode] = useState<"structured" | "ddl">("structured");
  const [monacoSideBySide, setMonacoSideBySide] = useState(true);

  /** DDL diff 用エントリ（旧互換） */
  const entries = useMemo(
    () => dbSnapshotDiffToDiffEntries(source, target, result),
    [source, target, result],
  );

  /** 構造化 diff エントリ */
  const structuredEntries = useMemo(
    () => dbSnapshotDiffToStructuredEntries(source, target, result),
    [source, target, result],
  );

  const selectedEntry = entries.find((e) => e.key === selectedKey) ?? entries[0] ?? null;
  const selectedStructured = structuredEntries.find((e) => e.key === selectedKey) ?? structuredEntries[0] ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* ヘッダーバー */}
      <div className="shrink-0 flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onReset}>
          ← 重新配置
        </Button>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] text-muted-foreground truncate block">
            {result.sourceLabel} → {result.targetLabel}
          </span>
        </div>
        {/* DDL モードのみ: side-by-side 切替 */}
        {tabMode === "ddl" && (
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            <Button
              size="icon"
              variant={!monacoSideBySide ? "secondary" : "ghost"}
              className="h-5 w-5"
              onClick={() => setMonacoSideBySide(false)}
              aria-label="Show inline diff"
              title="Inline"
            >
              <List className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant={monacoSideBySide ? "secondary" : "ghost"}
              className="h-5 w-5"
              onClick={() => setMonacoSideBySide(true)}
              aria-label="Show side by side diff"
              title="Side by side"
            >
              <Columns2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* サマリーバー */}
      <div className="shrink-0 flex gap-3 border-b border-border px-3 py-1 text-[11px]">
        {result.addedTables > 0 && <span className="text-emerald-600">+{result.addedTables} 追加</span>}
        {result.removedTables > 0 && <span className="text-red-600">−{result.removedTables} 削除</span>}
        {result.modifiedTables > 0 && <span className="text-amber-600">△{result.modifiedTables} 変更</span>}
        {result.unchangedTables > 0 && <span className="text-muted-foreground">{result.unchangedTables} 変更なし</span>}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-500 opacity-60" />
          <p className="text-sm text-muted-foreground">两个 Schema 完全一致</p>
        </div>
      ) : (
        <>
          {/* テーブルセレクター */}
          <div className="shrink-0 border-b border-border px-3 py-1.5">
            <select
              value={selectedEntry?.key ?? ""}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs h-7"
            >
              {entries.map((entry, idx) => {
                const se = structuredEntries[idx];
                const colCount = se?.columnChanges.length ?? 0;
                return (
                  <option key={entry.key} value={entry.key}>
                    {entry.action === "added" ? "+" : entry.action === "removed" ? "−" : "△"}
                    {" "}{entry.tableName}
                    {colCount > 0 ? `  (${colCount} cols)` : ""}
                  </option>
                );
              })}
            </select>
          </div>

          {/* タブバー: Structured / DDL Diff */}
          <div className="shrink-0 flex items-center gap-0.5 border-b border-border/50 bg-muted/20 px-2 py-0.5">
            <button
              type="button"
              onClick={() => setTabMode("structured")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                tabMode === "structured"
                  ? "bg-background text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Layers className="h-3 w-3" />
              Structured
            </button>
            <button
              type="button"
              onClick={() => setTabMode("ddl")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                tabMode === "ddl"
                  ? "bg-background text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Code2 className="h-3 w-3" />
              DDL Diff
            </button>
          </div>

          {/* コンテンツ: タブに応じて切替 */}
          <div className="flex-1 overflow-hidden">
            {tabMode === "structured" && selectedStructured ? (
              <StructuredDiffContent entry={selectedStructured} />
            ) : selectedEntry ? (
              <MonacoDdlDiff
                oldValue={selectedEntry.oldDdl}
                newValue={selectedEntry.newDdl}
                sideBySide={monacoSideBySide}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

export function DbConnectorWorkspace({ extensionId }: { extensionId: string }) {
  // Capability スコープ済み HostApi を使用する（extensionId で権限を絞り込む）
  const host = useHostApiFor(extensionId);
  const toast = host.notifications.show;
  const qc = useQueryClient();
  const [selectedConnId, setSelectedConnId] = useState<string | null>(() => readInitialSelectedConnectionId());
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() => readInitialWorkspaceView(selectedConnId));
  const [editingConfig, setEditingConfig] = useState<DbConnectionConfig | null>(null);
  const [diffSourceId, setDiffSourceId] = useState<string>("");
  const [diffTargetId, setDiffTargetId] = useState<string>("");
  const [diffResult, setDiffResult] = useState<DbSchemaDiffResult | null>(null);
  const [diffSourceSnapshot, setDiffSourceSnapshot] = useState<DbSchemaSnapshot | null>(null);
  const [diffTargetSnapshot, setDiffTargetSnapshot] = useState<DbSchemaSnapshot | null>(null);
  const schemaSelectId = useId();
  const diffSourceSelectId = useId();
  const diffTargetSelectId = useId();

  // 接続一覧
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["/db/connections"],
    queryFn: () => host.connections.list(),
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

  const openConnectionView = useCallback(() => {
    setEditingConfig(null);
    setWorkspaceView("connections");
  }, []);

  const activateConnection = useCallback((connectionId: string, nextView: WorkspaceView = PRIMARY_WORKSPACE_VIEW) => {
    setSelectedConnId(connectionId);
    setWorkspaceView(nextView);
  }, []);

  const activeConnectionLabel = activeConnection
    ? `${activeConnection.name || activeConnection.database} · ${activeConnection.driver}://${activeConnection.host}:${activeConnection.port}/${activeConnection.database}`
    : "未选择活动连接";

  const hasConnections = connections.length > 0;
  const activeTabValue = editingConfig ? "connections" : workspaceView;

  useEffect(() => {
    persistWorkspaceRoute(activeTabValue, selectedConnId);
  }, [activeTabValue, selectedConnId]);

  useEffect(() => {
    if (!selectedConnId) return;
    if (connections.some((connection) => connection.id === selectedConnId)) return;

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
              在一个统一工作区里完成连接管理、Schema 浏览、Diff 和 SQL 操作。
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
          <div className="flex min-w-0 items-center gap-2">
            <TabsList className="h-7 w-auto shrink-0 justify-start rounded-md border border-border bg-muted/20 p-0.5">
              <TabsTrigger value="connections" className="h-6 rounded-md px-3 text-xs">连接</TabsTrigger>
              <TabsTrigger value="schema" className="h-6 rounded-md px-3 text-xs">Schema</TabsTrigger>
              <TabsTrigger value="diff" className="h-6 rounded-md px-3 text-xs">Diff</TabsTrigger>
              <TabsTrigger value="sql" className="h-6 rounded-md px-3 text-xs">SQL 工作台</TabsTrigger>
            </TabsList>
            <span className="hidden text-[10px] text-muted-foreground lg:inline">
              Legacy tools
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {connections.length} 个连接
            {activeConnection ? ` · 当前 ${activeConnection.name || activeConnection.database}` : ""}
          </div>
        </div>

        <TabsContent value="connections" className="mt-0 min-h-0 flex-1 overflow-hidden">
          {editingConfig ? (
            <div className="h-full overflow-y-auto">
              <ConnectionForm
                initial={editingConfig}
                onSave={(c) => saveMutation.mutate(c)}
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
                    先配置连接，再进入查询、Schema 和 Diff 工作流。
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
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : !hasConnections ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                      <Database className="h-8 w-8 opacity-30" />
                      <p className="text-xs">暂无连接，先添加一个数据库连接来启动工作台。</p>
                    </div>
                  ) : connections.map((conn) => {
                    const isSelected = conn.id === selectedConnId;
                    const displayName = conn.name || conn.database;
                    return (
                      <div
                        key={conn.id}
                        className={cn(
                          "flex items-center gap-2 rounded-md border border-border px-3 py-2",
                          isSelected && "border-primary/40 bg-primary/5",
                        )}
                      >
                        <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 flex-col items-start text-left"
                          onClick={() => activateConnection(conn.id, PRIMARY_WORKSPACE_VIEW)}
                        >
                          <p className="w-full truncate text-xs font-medium text-foreground">
                            {displayName}
                          </p>
                          <p className="w-full truncate text-[10px] text-muted-foreground">
                            {conn.driver}://{conn.host}:{conn.port}/{conn.database}
                          </p>
                        </button>
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
                          onClick={() => setEditingConfig({ ...conn, id: "", name: `${displayName} - 副本` })}
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
                    );
                  })}
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
                  打开 SQL 工作台
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
            <DbDiffPanel
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
                  选择两个连接，直接在同一工作区里比较结构差异。
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
              onSwitchToLegacy={openConnectionView}
              onSwitchConnection={(connectionId) => activateConnection(connectionId, PRIMARY_WORKSPACE_VIEW)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <Database className="h-10 w-10 text-muted-foreground/40" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">先选择一个连接，再进入 SQL 工作台</p>
                <p className="text-xs text-muted-foreground">
                  工作台会保留当前连接上下文，并把查询、Schema 和结果浏览放在同一个操作面里。
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
