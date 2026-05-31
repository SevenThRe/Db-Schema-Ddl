import { useId, useState } from "react";
import {
  ArrowLeftRight,
  ChevronRight,
  Loader2,
  RefreshCw,
  Table2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type {
  DbConnectionConfig,
  DbSchemaDiffResult,
  DbSchemaSnapshot,
} from "@shared/schema";
import { DbSchemaDiffViewer } from "./SchemaDiffPane";

function SchemaBrowser({ snapshot }: { snapshot: DbSchemaSnapshot }) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const toggle = (name: string) =>
    setExpandedTables((prev) => {
      const s = new Set(prev);
      if (s.has(name)) {
        s.delete(name);
      } else {
        s.add(name);
      }
      return s;
    });

  return (
    <ScrollArea className="h-full">
      <div className="space-y-0.5 px-3 py-2">
        <p className="mb-2 text-[10px] text-muted-foreground">
          {snapshot.tables.length} 张表 · {snapshot.database}
        </p>
        {snapshot.tables.map((table) => (
          <div key={table.name} className="overflow-hidden rounded-md border border-border">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-muted/40"
              onClick={() => toggle(table.name)}
            >
              <Table2 className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-left font-medium">{table.name}</span>
              <span className="text-muted-foreground">{table.columns.length}</span>
              <ChevronRight
                className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform",
                  expandedTables.has(table.name) && "rotate-90",
                )}
              />
            </button>
            {expandedTables.has(table.name) ? (
              <div className="space-y-0.5 border-t border-border bg-muted/10 px-3 py-2">
                {table.columns.map((col) => (
                  <div key={col.name} className="flex items-center gap-2 text-[11px]">
                    <span className={cn("font-medium", col.primaryKey && "text-amber-600")}>{col.name}</span>
                    <span className="text-muted-foreground">{col.dataType}</span>
                    {col.nullable ? null : <Badge className="h-3.5 border-border px-1 text-[9px]">NOT NULL</Badge>}
                    {col.primaryKey ? (
                      <Badge className="h-3.5 border-amber-200 bg-amber-500/10 px-1 text-[9px] text-amber-600">
                        PK
                      </Badge>
                    ) : null}
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

export function SchemaCompatibilityView({
  connections,
  selectedConnId,
  snapshot,
  isIntrospecting,
  onSelectedConnectionChange,
  onRefreshSchema,
  onReturnToWorkspace,
}: {
  connections: DbConnectionConfig[];
  selectedConnId: string | null;
  snapshot: DbSchemaSnapshot | undefined;
  isIntrospecting: boolean;
  onSelectedConnectionChange: (connectionId: string | null) => void;
  onRefreshSchema: () => void;
  onReturnToWorkspace: () => void;
}) {
  const schemaSelectId = useId();
  const activeConnection = selectedConnId
    ? connections.find((connection) => connection.id === selectedConnId) ?? null
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-end gap-2 px-3 py-2">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor={schemaSelectId} className="text-xs text-muted-foreground">
            连接
          </label>
          <select
            id={schemaSelectId}
            value={selectedConnId ?? ""}
            onChange={(e) => onSelectedConnectionChange(e.target.value || null)}
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
          onClick={onRefreshSchema}
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
            onClick={onReturnToWorkspace}
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
  );
}

export function SchemaDiffCompatibilityView({
  connections,
  diffSourceId,
  diffTargetId,
  diffResult,
  diffSourceSnapshot,
  diffTargetSnapshot,
  isDiffing,
  onSourceChange,
  onTargetChange,
  onRunDiff,
  onReset,
}: {
  connections: DbConnectionConfig[];
  diffSourceId: string;
  diffTargetId: string;
  diffResult: DbSchemaDiffResult | null;
  diffSourceSnapshot: DbSchemaSnapshot | null;
  diffTargetSnapshot: DbSchemaSnapshot | null;
  isDiffing: boolean;
  onSourceChange: (connectionId: string) => void;
  onTargetChange: (connectionId: string) => void;
  onRunDiff: () => void;
  onReset: () => void;
}) {
  const diffSourceSelectId = useId();
  const diffTargetSelectId = useId();

  if (diffResult && diffSourceSnapshot && diffTargetSnapshot) {
    return (
      <DbSchemaDiffViewer
        source={diffSourceSnapshot}
        target={diffTargetSnapshot}
        result={diffResult}
        onReset={onReset}
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 px-3 py-3">
      <div>
        <p className="text-xs font-medium text-foreground">Schema Diff</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Compatibility-only surface. 保留用于跨连接结构对比、迁移期 parity review 与回归验证，不作为统一工作台的主路径。
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={diffSourceSelectId} className="text-xs text-muted-foreground">源（Source）</label>
        <select
          id={diffSourceSelectId}
          value={diffSourceId}
          onChange={(e) => onSourceChange(e.target.value)}
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
          onChange={(e) => onTargetChange(e.target.value)}
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
        onClick={onRunDiff}
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
  );
}
