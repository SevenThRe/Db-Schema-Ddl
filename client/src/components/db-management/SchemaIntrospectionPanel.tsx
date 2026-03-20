import type { DbConnectionSummary, DbSchemaIntrospectResponse } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Database, Loader2, RefreshCw } from "lucide-react";

interface SchemaIntrospectionPanelProps {
  connection: DbConnectionSummary | null;
  selectedDatabase: string | null;
  lastResult: DbSchemaIntrospectResponse | null;
  isPending: boolean;
  onIntrospect: () => void;
}

export function SchemaIntrospectionPanel({
  connection,
  selectedDatabase,
  lastResult,
  isPending,
  onIntrospect,
}: SchemaIntrospectionPanelProps) {
  const latestTables = lastResult?.schema.tables ?? [];

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="border-b border-border pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-[hsl(var(--workspace-ink))]">
            <Database className="h-4 w-4 text-primary" />
            结构快照
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            读取当前数据库的结构快照。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="border border-border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">当前连接</div>
            <div className="mt-1 text-sm font-medium">{connection?.name ?? "未选择"}</div>
          </div>
          <div className="border border-border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">当前数据库</div>
            <div className="mt-1 text-sm font-medium">{selectedDatabase ?? "未选择"}</div>
          </div>
          <div className="border border-border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">最近快照</div>
            <div className="mt-1 text-sm font-medium">
              {lastResult?.snapshot.capturedAt ?? "尚未生成"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button className="rounded-sm px-4" onClick={onIntrospect} disabled={!connection || !selectedDatabase || isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            读取快照
          </Button>
          {lastResult ? (
            <div className="text-sm text-muted-foreground">
              表数 <span className="font-medium text-[hsl(var(--workspace-ink))]">{lastResult.snapshot.tableCount}</span>
              <span className="mx-2">·</span>
              {lastResult.cacheHit ? "使用缓存" : "新快照"}
              <span className="mx-2">·</span>
              <span className="font-mono text-[11px]">{lastResult.snapshot.snapshotHash.slice(0, 8)}</span>
            </div>
          ) : null}
        </div>

        {lastResult ? (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="text-sm font-medium">最近读取到的表</div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {latestTables.slice(0, 8).map((table) => (
                  <span key={table.name} className="border border-border bg-muted/20 px-2 py-1">
                    {table.name}
                  </span>
                ))}
                {latestTables.length > 8 ? (
                  <span className="border border-border px-2 py-1">+{latestTables.length - 8}</span>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
            选定数据库后点击“读取快照”。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
