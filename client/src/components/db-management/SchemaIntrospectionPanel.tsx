import type { DbConnectionSummary, DbSchemaIntrospectResponse } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <Card className="border-border/70">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-primary" />
          Schema Introspection
        </CardTitle>
        <CardDescription>
          读取当前 database 的表、列、主键、外键、索引和注释，并生成后续 diff 可复用的 canonical snapshot。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">当前连接</div>
            <div className="mt-1 text-sm font-medium">{connection?.name ?? "未选择"}</div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">当前 database</div>
            <div className="mt-1 text-sm font-medium">{selectedDatabase ?? "未选择"}</div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">最近 snapshot</div>
            <div className="mt-1 text-sm font-medium">
              {lastResult?.snapshot.capturedAt ?? "尚未生成"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onIntrospect} disabled={!connection || !selectedDatabase || isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            读取 schema
          </Button>
          {lastResult ? (
            <>
              <Badge variant="outline">表数 {lastResult.snapshot.tableCount}</Badge>
              <Badge variant="outline">{lastResult.cacheHit ? "使用缓存" : "新快照"}</Badge>
              <Badge variant="outline">Hash {lastResult.snapshot.snapshotHash.slice(0, 8)}</Badge>
            </>
          ) : null}
        </div>

        {lastResult ? (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="text-sm font-medium">最近读取到的表</div>
              <div className="flex flex-wrap gap-2">
                {latestTables.slice(0, 12).map((table) => (
                  <Badge key={table.name} variant="secondary">
                    {table.name}
                  </Badge>
                ))}
                {latestTables.length > 12 ? (
                  <Badge variant="outline">+{latestTables.length - 12}</Badge>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
            选定 database 后点击“读取 schema”，这里会显示最新 snapshot 摘要。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
