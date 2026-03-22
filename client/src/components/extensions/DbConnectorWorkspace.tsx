// DB 接続管理ワークスペース
// MySQL / PostgreSQL への接続設定管理・スキーマ閲覧・差分比較 UI

import { useState, useCallback } from "react";
import {
  Database, Plus, Trash2, TestTube2, RefreshCw, ChevronRight,
  ArrowLeftRight, Loader2, CheckCircle2, XCircle, Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { desktopBridge } from "@/lib/desktop-bridge";
import { cn } from "@/lib/utils";
import type {
  DbConnectionConfig, DbDriver, DbSchemaSnapshot, DbSchemaDiffResult, DbTableDiff,
} from "@shared/schema";

const DEFAULT_PORTS: Record<DbDriver, number> = { mysql: 3306, postgres: 5432 };

// ──────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────

function emptyConfig(): DbConnectionConfig {
  return { id: "", name: "", driver: "mysql", host: "localhost", port: 3306, database: "", username: "", password: "" };
}

function diffBadge(type: string) {
  if (type === "added") return <Badge className="h-4 px-1 text-[10px] bg-emerald-500/15 text-emerald-600 border-emerald-200">+追加</Badge>;
  if (type === "removed") return <Badge className="h-4 px-1 text-[10px] bg-red-500/15 text-red-600 border-red-200">−削除</Badge>;
  return <Badge className="h-4 px-1 text-[10px] bg-amber-500/15 text-amber-600 border-amber-200">△変更</Badge>;
}

// ──────────────────────────────────────────────
// 接続フォーム
// ──────────────────────────────────────────────

function ConnectionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: DbConnectionConfig;
  onSave: (c: DbConnectionConfig) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<DbConnectionConfig>(initial);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const { toast } = useToast();

  const set = <K extends keyof DbConnectionConfig>(key: K, value: DbConnectionConfig[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleDriverChange = (driver: DbDriver) => {
    setForm((prev) => ({ ...prev, driver, port: DEFAULT_PORTS[driver] }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await desktopBridge.db.testConnection(form);
      setTestResult({ ok: true, msg });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-muted-foreground">名称</label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="生产环境 MySQL" className="h-7 text-xs" />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">驱动</label>
          <select
            value={form.driver}
            onChange={(e) => handleDriverChange(e.target.value as DbDriver)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs h-7"
          >
            <option value="mysql">MySQL</option>
            <option value="postgres">PostgreSQL</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">端口</label>
          <Input
            type="number"
            value={form.port}
            onChange={(e) => set("port", Number(e.target.value))}
            className="h-7 text-xs"
          />
        </div>

        <div className="col-span-2 space-y-1">
          <label className="text-xs text-muted-foreground">主机</label>
          <Input value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="localhost" className="h-7 text-xs" />
        </div>

        <div className="col-span-2 space-y-1">
          <label className="text-xs text-muted-foreground">数据库名</label>
          <Input value={form.database} onChange={(e) => set("database", e.target.value)} placeholder="mydb" className="h-7 text-xs" />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">用户名</label>
          <Input value={form.username} onChange={(e) => set("username", e.target.value)} className="h-7 text-xs" />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">密码</label>
          <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="h-7 text-xs" />
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
// DIFF ビュー
// ──────────────────────────────────────────────

function DiffView({ result }: { result: DbSchemaDiffResult }) {
  const changedTables = result.tableDiffs.filter((t) => t.changeType !== "modified" || t.columnDiffs.length > 0);

  return (
    <div className="flex h-full flex-col">
      {/* サマリーバー */}
      <div className="shrink-0 flex items-center gap-3 border-b border-border px-4 py-2 text-xs">
        <span className="text-muted-foreground truncate">{result.sourceLabel}</span>
        <ArrowLeftRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground truncate">{result.targetLabel}</span>
      </div>
      <div className="shrink-0 flex gap-3 border-b border-border px-4 py-1.5 text-[11px]">
        {result.addedTables > 0 && <span className="text-emerald-600">+{result.addedTables} 追加</span>}
        {result.removedTables > 0 && <span className="text-red-600">−{result.removedTables} 削除</span>}
        {result.modifiedTables > 0 && <span className="text-amber-600">△{result.modifiedTables} 変更</span>}
        {result.unchangedTables > 0 && <span className="text-muted-foreground">{result.unchangedTables} 変更なし</span>}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 px-3 py-2">
          {changedTables.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-500 opacity-60" />
              <p className="text-sm text-muted-foreground">两个 Schema 完全一致</p>
            </div>
          ) : changedTables.map((table) => (
            <TableDiffCard key={table.tableName} diff={table} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function TableDiffCard({ diff }: { diff: DbTableDiff }) {
  const [expanded, setExpanded] = useState(diff.changeType === "modified");

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/30"
        onClick={() => setExpanded((v) => !v)}
      >
        <Table2 className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left font-medium">{diff.tableName}</span>
        {diffBadge(diff.changeType)}
        {diff.columnDiffs.length > 0 && (
          <span className="text-muted-foreground text-[10px]">{diff.columnDiffs.length} 列変更</span>
        )}
        <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && diff.columnDiffs.length > 0 ? (
        <div className="border-t border-border px-3 py-2 space-y-1 bg-muted/10">
          {diff.columnDiffs.map((col) => (
            <div key={col.columnName} className="flex items-start gap-2 text-[11px]">
              {diffBadge(col.changeType)}
              <span className="font-medium">{col.columnName}</span>
              {col.before && col.after ? (
                <span className="text-muted-foreground">
                  {col.before.dataType} → {col.after.dataType}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

export function DbConnectorWorkspace() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editingConfig, setEditingConfig] = useState<DbConnectionConfig | null>(null);
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [diffSourceId, setDiffSourceId] = useState<string>("");
  const [diffTargetId, setDiffTargetId] = useState<string>("");
  const [diffResult, setDiffResult] = useState<DbSchemaDiffResult | null>(null);

  // 接続一覧
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["/db/connections"],
    queryFn: () => desktopBridge.db.listConnections(),
  });

  // スキーマ取得
  const { data: snapshot, isFetching: isIntrospecting, refetch: refetchSchema } = useQuery({
    queryKey: ["/db/schema", selectedConnId],
    queryFn: () => desktopBridge.db.introspect(selectedConnId!),
    enabled: selectedConnId !== null,
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: (config: DbConnectionConfig) => desktopBridge.db.saveConnection(config),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["/db/connections"] });
      setEditingConfig(null);
      toast({ title: "已保存", variant: "success" });
    },
    onError: (e) => toast({ title: "保存失败", description: String(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => desktopBridge.db.deleteConnection(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["/db/connections"] });
      toast({ title: "已删除", variant: "success" });
    },
    onError: (e) => toast({ title: "删除失败", description: String(e), variant: "destructive" }),
  });

  const [isDiffing, setIsDiffing] = useState(false);
  const handleDiff = useCallback(async () => {
    if (!diffSourceId || !diffTargetId) return;
    setIsDiffing(true);
    setDiffResult(null);
    try {
      const result = await desktopBridge.db.diff(diffSourceId, diffTargetId);
      setDiffResult(result);
    } catch (e) {
      toast({ title: "对比失败", description: String(e), variant: "destructive" });
    } finally {
      setIsDiffing(false);
    }
  }, [diffSourceId, diffTargetId, toast]);

  // ── 接続フォーム表示中 ──────────────────────
  if (editingConfig) {
    return (
      <div className="h-full overflow-y-auto">
        <ConnectionForm
          initial={editingConfig}
          onSave={(c) => saveMutation.mutate(c)}
          onCancel={() => setEditingConfig(null)}
        />
      </div>
    );
  }

  return (
    <Tabs defaultValue="connections" className="flex h-full flex-col overflow-hidden">
      <TabsList className="mx-3 mt-2 mb-0 h-7 w-auto shrink-0 justify-start rounded-md border border-border bg-muted/20 p-0.5">
        <TabsTrigger value="connections" className="h-6 rounded-md px-3 text-xs">连接</TabsTrigger>
        <TabsTrigger value="schema" className="h-6 rounded-md px-3 text-xs">Schema</TabsTrigger>
        <TabsTrigger value="diff" className="h-6 rounded-md px-3 text-xs">DIFF</TabsTrigger>
      </TabsList>

      {/* ── 接続一覧タブ ── */}
      <TabsContent value="connections" className="flex-1 overflow-hidden mt-0 pt-2">
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between px-3 pb-1">
            <span className="text-xs text-muted-foreground">{connections.length} 个连接</span>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setEditingConfig(emptyConfig())}>
              <Plus className="h-3 w-3 mr-1" /> 添加
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1.5 px-3 pb-3">
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : connections.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                  <Database className="h-8 w-8 opacity-30" />
                  <p className="text-xs">暂无连接，点击「添加」配置第一个 DB</p>
                </div>
              ) : connections.map((conn) => (
                <div key={conn.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                  <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{conn.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {conn.driver}://{conn.host}:{conn.port}/{conn.database}
                    </p>
                  </div>
                  <Button
                    size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                    onClick={() => setEditingConfig(conn)}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(conn.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </TabsContent>

      {/* ── Schema タブ ── */}
      <TabsContent value="schema" className="flex-1 overflow-hidden mt-0 pt-2">
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center gap-2 px-3 pb-2">
            <select
              value={selectedConnId ?? ""}
              onChange={(e) => setSelectedConnId(e.target.value || null)}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs h-7"
            >
              <option value="">选择连接…</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <Button
              size="icon" variant="outline" className="h-7 w-7 shrink-0"
              onClick={() => void refetchSchema()}
              disabled={!selectedConnId || isIntrospecting}
            >
              {isIntrospecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            {!selectedConnId ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">请先选择连接</div>
            ) : isIntrospecting ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />正在获取 Schema…
              </div>
            ) : snapshot ? (
              <SchemaBrowser snapshot={snapshot} />
            ) : null}
          </div>
        </div>
      </TabsContent>

      {/* ── DIFF タブ ── */}
      <TabsContent value="diff" className="flex-1 overflow-hidden mt-0 pt-2">
        {diffResult ? (
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center gap-2 px-3 pb-2">
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setDiffResult(null)}>
                ← 重新配置
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <DiffView result={diffResult} />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-3 px-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">源（Source）</label>
              <select
                value={diffSourceId}
                onChange={(e) => setDiffSourceId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs h-7"
              >
                <option value="">选择连接…</option>
                {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">目标（Target）</label>
              <select
                value={diffTargetId}
                onChange={(e) => setDiffTargetId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs h-7"
              >
                <option value="">选择连接…</option>
                {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Button
              className="w-full h-8 text-xs"
              onClick={() => void handleDiff()}
              disabled={!diffSourceId || !diffTargetId || isDiffing}
            >
              {isDiffing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />}
              {isDiffing ? "对比中…" : "开始对比"}
            </Button>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
