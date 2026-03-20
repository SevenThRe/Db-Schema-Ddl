import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowRightLeft, Download, FileJson, FileText, Loader2, ScanSearch } from "lucide-react";
import type {
  DbConnectionSummary,
  DbSnapshotCompareArtifact,
  DbSnapshotCompareLiveFreshness,
  DbSnapshotCompareReportFormat,
  DbSnapshotCompareRequest,
  DbSnapshotCompareSource,
} from "@shared/schema";
import {
  useDbConnections,
  useDbDatabases,
  useDbHistory,
  useExportDbSnapshotCompareReport,
  usePreviewDbSnapshotCompare,
} from "@/hooks/use-db-management";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type SnapshotSourceKind = "live" | "snapshot";

interface SnapshotCompareSideSeed {
  connectionId?: number | null;
  databaseName?: string | null;
  sourceKind?: SnapshotSourceKind;
  snapshotHash?: string | null;
  freshness?: DbSnapshotCompareLiveFreshness;
}

export interface DbSnapshotCompareWorkspaceSeed {
  left?: SnapshotCompareSideSeed;
  right?: SnapshotCompareSideSeed;
}

interface DbSnapshotCompareWorkspaceProps {
  seedConnection: DbConnectionSummary | null;
  initialSeed?: DbSnapshotCompareWorkspaceSeed | null;
}

function triggerDownload(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getTableName(artifact: DbSnapshotCompareArtifact["tableChanges"][number]): string {
  return artifact.fileTable?.physicalTableName ?? artifact.dbTable?.name ?? artifact.entityKey;
}

function createInitialSide(
  seedConnection: DbConnectionSummary | null,
  sideSeed?: SnapshotCompareSideSeed | null,
): Required<SnapshotCompareSideSeed> {
  return {
    connectionId: sideSeed?.connectionId ?? seedConnection?.id ?? null,
    databaseName: sideSeed?.databaseName ?? seedConnection?.lastSelectedDatabase ?? null,
    sourceKind: sideSeed?.sourceKind ?? "live",
    snapshotHash: sideSeed?.snapshotHash ?? null,
    freshness: sideSeed?.freshness ?? "latest_snapshot",
  };
}

export function DbSnapshotCompareWorkspace({
  seedConnection,
  initialSeed,
}: DbSnapshotCompareWorkspaceProps) {
  const { toast } = useToast();
  const { data: connections = [] } = useDbConnections();
  const compareMutation = usePreviewDbSnapshotCompare();
  const exportMutation = useExportDbSnapshotCompareReport();
  const [left, setLeft] = useState(() => createInitialSide(seedConnection, initialSeed?.left));
  const [right, setRight] = useState(() => createInitialSide(seedConnection, initialSeed?.right));
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<DbSnapshotCompareArtifact | null>(null);
  const [lastReportFormat, setLastReportFormat] = useState<DbSnapshotCompareReportFormat>("markdown");

  const leftConnection = useMemo(
    () => connections.find((connection) => connection.id === left.connectionId) ?? null,
    [connections, left.connectionId],
  );
  const rightConnection = useMemo(
    () => connections.find((connection) => connection.id === right.connectionId) ?? null,
    [connections, right.connectionId],
  );

  const leftDatabases = useDbDatabases(left.connectionId ?? null);
  const rightDatabases = useDbDatabases(right.connectionId ?? null);
  const leftHistory = useDbHistory(
    left.connectionId ?? null,
    left.databaseName ? { databaseName: left.databaseName, changedOnly: true, limit: 50 } : null,
  );
  const rightHistory = useDbHistory(
    right.connectionId ?? null,
    right.databaseName ? { databaseName: right.databaseName, changedOnly: true, limit: 50 } : null,
  );

  useEffect(() => {
    if (!left.databaseName && leftConnection?.lastSelectedDatabase) {
      setLeft((current) => ({ ...current, databaseName: leftConnection.lastSelectedDatabase ?? null }));
    }
  }, [left.databaseName, leftConnection?.lastSelectedDatabase]);

  useEffect(() => {
    if (!right.databaseName && rightConnection?.lastSelectedDatabase) {
      setRight((current) => ({ ...current, databaseName: rightConnection.lastSelectedDatabase ?? null }));
    }
  }, [right.databaseName, rightConnection?.lastSelectedDatabase]);

  useEffect(() => {
    if (!artifact) {
      setSelectedTableKey(null);
      return;
    }
    setSelectedTableKey((current) => current ?? artifact.tableChanges[0]?.entityKey ?? null);
  }, [artifact]);

  useEffect(() => {
    if (!initialSeed) {
      return;
    }
    setLeft(createInitialSide(seedConnection, initialSeed.left));
    setRight(createInitialSide(seedConnection, initialSeed.right));
    setArtifact(null);
  }, [initialSeed, seedConnection]);

  const compareInput = useMemo<DbSnapshotCompareRequest | null>(() => {
    if (!left.connectionId || !left.databaseName || !right.connectionId || !right.databaseName) {
      return null;
    }

    let leftSource: DbSnapshotCompareSource | null = null;
    if (left.sourceKind === "live") {
      leftSource = {
        kind: "live",
        connectionId: left.connectionId,
        databaseName: left.databaseName,
        freshness: left.freshness,
      };
    } else if (left.snapshotHash) {
      leftSource = {
        kind: "snapshot",
        connectionId: left.connectionId,
        databaseName: left.databaseName,
        snapshotHash: left.snapshotHash,
      };
    }

    let rightSource: DbSnapshotCompareSource | null = null;
    if (right.sourceKind === "live") {
      rightSource = {
        kind: "live",
        connectionId: right.connectionId,
        databaseName: right.databaseName,
        freshness: right.freshness,
      };
    } else if (right.snapshotHash) {
      rightSource = {
        kind: "snapshot",
        connectionId: right.connectionId,
        databaseName: right.databaseName,
        snapshotHash: right.snapshotHash,
      };
    }

    if (!leftSource || !rightSource) {
      return null;
    }

    return {
      left: leftSource,
      right: rightSource,
      scope: "database",
    };
  }, [left, right]);

  const focusedChange = useMemo(
    () => artifact?.tableChanges.find((change) => change.entityKey === selectedTableKey) ?? null,
    [artifact, selectedTableKey],
  );

  const runCompare = async () => {
    if (!compareInput) {
      toast({
        title: "快照对比",
        description: "请先完整选择左右两侧的连接、数据库和来源。",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await compareMutation.mutateAsync(compareInput);
      setArtifact(result);
      toast({
        title: "快照对比",
        description: `${result.context.left.label} -> ${result.context.right.label}`,
      });
    } catch (error) {
      toast({
        title: "快照对比",
        description: error instanceof Error ? error.message : "比较失败。",
        variant: "destructive",
      });
    }
  };

  const exportReport = async (format: DbSnapshotCompareReportFormat) => {
    if (!artifact) {
      return;
    }
    try {
      const result = await exportMutation.mutateAsync({ artifact, format });
      setLastReportFormat(format);
      triggerDownload(result.fileName, result.content, result.mimeType);
      toast({
        title: "快照对比",
        description: `${format.toUpperCase()} 报告已生成。`,
      });
    } catch (error) {
      toast({
        title: "快照对比",
        description: error instanceof Error ? error.message : "导出报告失败。",
        variant: "destructive",
      });
    }
  };

  const swapSides = () => {
    setLeft(right);
    setRight(left);
    setArtifact(null);
  };

  const renderSideCard = (
    title: string,
    side: Required<SnapshotCompareSideSeed>,
    setSide: Dispatch<SetStateAction<Required<SnapshotCompareSideSeed>>>,
    databases: ReturnType<typeof useDbDatabases>,
    history: ReturnType<typeof useDbHistory>,
  ) => (
    <div className="space-y-3 border border-border bg-background p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      <Select
        value={side.connectionId ? String(side.connectionId) : ""}
        onValueChange={(value) =>
          setSide((current) => ({
            ...current,
            connectionId: Number(value),
            databaseName: null,
            snapshotHash: null,
          }))
        }
      >
        <SelectTrigger className="bg-background"><SelectValue placeholder="选择连接" /></SelectTrigger>
        <SelectContent>
          {connections.map((connection) => (
            <SelectItem key={connection.id} value={String(connection.id)}>
              {connection.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={side.databaseName ?? ""}
        onValueChange={(value) => setSide((current) => ({ ...current, databaseName: value, snapshotHash: null }))}
        disabled={!side.connectionId}
      >
      <SelectTrigger className="bg-background"><SelectValue placeholder="选择数据库" /></SelectTrigger>
        <SelectContent>
          {(databases.data ?? []).map((database) => (
            <SelectItem key={database.name} value={database.name}>
              {database.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={side.sourceKind}
        onValueChange={(value: SnapshotSourceKind) =>
          setSide((current) => ({ ...current, sourceKind: value, snapshotHash: value === "snapshot" ? current.snapshotHash : null }))
        }
      >
        <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="live">实时库</SelectItem>
          <SelectItem value="snapshot">历史快照</SelectItem>
        </SelectContent>
      </Select>

      {side.sourceKind === "live" ? (
        <Select
          value={side.freshness}
          onValueChange={(value: DbSnapshotCompareLiveFreshness) => setSide((current) => ({ ...current, freshness: value }))}
        >
          <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="latest_snapshot">使用最近快照</SelectItem>
            <SelectItem value="refresh_live">比较前刷新实时库</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Select
          value={side.snapshotHash ?? ""}
          onValueChange={(value) => setSide((current) => ({ ...current, snapshotHash: value }))}
          disabled={!side.connectionId || !side.databaseName}
        >
          <SelectTrigger className="bg-background"><SelectValue placeholder="选择快照" /></SelectTrigger>
          <SelectContent>
            {(history.data?.entries ?? [])
              .filter((entry) => entry.snapshot)
              .map((entry) => (
                <SelectItem key={entry.scanEvent.id} value={entry.snapshot!.snapshotHash}>
                  {entry.snapshot!.snapshotHash.slice(0, 12)} · {entry.scanEvent.createdAt ?? "未知时间"}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  return (
    <Card className="border-border">
      <CardHeader className="space-y-3 border-b border-border pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">快照对比</CardTitle>
            <CardDescription>
              任意选择左右两侧的快照 / 实时来源，得到稳定对比结果，并导出 Markdown 或 JSON 报告。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">适合 AI / MCP</Badge>
            <Badge variant="outline">Markdown + JSON</Badge>
            <Badge variant="secondary">上次导出 {lastReportFormat}</Badge>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1fr_auto_1fr_auto]">
          {renderSideCard("左侧", left, setLeft, leftDatabases, leftHistory)}
          <div className="flex items-center justify-center">
            <Button type="button" variant="outline" size="icon" onClick={swapSides} aria-label="swap-snapshot-compare-sides">
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
          </div>
          {renderSideCard("右侧", right, setRight, rightDatabases, rightHistory)}
          <div className="flex items-center">
            <Button onClick={runCompare} disabled={!compareInput || compareMutation.isPending}>
              {compareMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
              执行比较
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {artifact ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge variant="secondary">新增 {artifact.summary.addedTables}</Badge>
            <Badge variant="secondary">移除 {artifact.summary.removedTables}</Badge>
            <Badge variant="secondary">变化 {artifact.summary.changedTables}</Badge>
            <Badge variant={artifact.summary.blockingCount > 0 ? "destructive" : "outline"}>
              阻断 {artifact.summary.blockingCount}
            </Badge>
            <Badge variant="outline">
              {artifact.context.left.snapshotHash.slice(0, 8)} {"->"} {artifact.context.right.snapshotHash.slice(0, 8)}
            </Badge>
          </div>
        ) : null}

        <div className="grid min-h-[560px] gap-4 xl:grid-cols-[0.9fr_1fr_1fr]">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">差异树</CardTitle>
              <CardDescription>默认整库比较，再聚焦到单表。</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[460px] pr-3">
                {!artifact ? (
                  <div className="text-sm text-muted-foreground">先运行一次快照对比。</div>
                ) : artifact.tableChanges.length === 0 ? (
                  <div className="text-sm text-muted-foreground">当前两侧没有结构差异。</div>
                ) : (
                  artifact.tableChanges.map((change) => (
                    <button
                      key={change.entityKey}
                      type="button"
                      className={cn(
                        "mb-3 w-full border px-3 py-3 text-left",
                        selectedTableKey === change.entityKey
                          ? "border-primary/70 bg-primary/10"
                          : "border-border bg-background",
                      )}
                      onClick={() => setSelectedTableKey(change.entityKey)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">{getTableName(change)}</div>
                        <Badge variant={change.blockers.length > 0 ? "destructive" : "outline"}>
                          {change.action}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        列 {change.columnChanges.length} · 字段 {change.changedFields.length}
                      </div>
                    </button>
                  ))
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">详情</CardTitle>
              <CardDescription>稳定对比结果的表级 / 字段级明细。</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[460px] pr-3">
                {!focusedChange ? (
                  <div className="text-sm text-muted-foreground">从左侧选一张表查看详细差异。</div>
                ) : (
                  <div className="space-y-4">
                    <div className="border border-border bg-background p-4">
                      <div className="text-lg font-semibold">{getTableName(focusedChange)}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {focusedChange.changedFields.length > 0 ? (
                          focusedChange.changedFields.map((field) => (
                            <Badge key={field} variant="secondary">{field}</Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">表级字段没有直接变化。</span>
                        )}
                      </div>
                    </div>

                    <div className="border border-border bg-background p-4">
                      <div className="mb-3 text-sm font-semibold">列变化</div>
                      <div className="space-y-3">
                        {focusedChange.columnChanges.length === 0 ? (
                          <div className="text-sm text-muted-foreground">这张表没有列级差异。</div>
                        ) : (
                          focusedChange.columnChanges.map((columnChange) => {
                            const columnName =
                              columnChange.fileColumn?.physicalName ??
                              columnChange.dbColumn?.name ??
                              columnChange.entityKey;
                            return (
                              <div key={columnChange.entityKey} className="border border-border bg-muted/20 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-semibold">{columnName}</div>
                                  <Badge variant={columnChange.blockers.length > 0 ? "destructive" : "outline"}>
                                    {columnChange.action}
                                  </Badge>
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground">
                                  {columnChange.changedFields.join(", ") || "没有字段细节"}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">导出与上下文</CardTitle>
              <CardDescription>摘要先行，再导出 Markdown / JSON 给审阅或 MCP。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border border-border bg-muted/20 p-4">
                <div className="text-sm font-semibold">当前上下文</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {artifact ? `${artifact.context.left.label} -> ${artifact.context.right.label}` : "先执行比较"}
                </div>
              </div>

              {artifact?.warnings.length ? (
                <div className="border border-amber-500/40 bg-amber-500/10 p-4">
                  <div className="mb-2 text-sm font-semibold">提示</div>
                  <div className="space-y-2">
                    {artifact.warnings.map((warning) => (
                      <div key={`${warning.side ?? "compare"}:${warning.code}`} className="text-sm">
                        [{warning.code}] {warning.message}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {artifact?.blockers.length ? (
                <div className="border border-red-500/30 bg-red-500/10 p-4">
                  <div className="mb-2 text-sm font-semibold">阻断项</div>
                  <div className="space-y-2">
                    {artifact.blockers.slice(0, 8).map((blocker) => (
                      <div key={`${blocker.entityKey}:${blocker.code}`} className="text-sm">
                        [{blocker.code}] {blocker.message}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <Separator />

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={() => exportReport("markdown")}
                  disabled={!artifact || exportMutation.isPending}
                >
                  {exportMutation.isPending && lastReportFormat === "markdown" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  导出 Markdown
                </Button>
                <Button
                  variant="outline"
                  onClick={() => exportReport("json")}
                  disabled={!artifact || exportMutation.isPending}
                >
                  {exportMutation.isPending && lastReportFormat === "json" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileJson className="mr-2 h-4 w-4" />}
                  导出 JSON
                </Button>
              </div>

              <div className="border border-border bg-background p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Download className="h-4 w-4" />
                  task-friendly JSON
                </div>
                <div className="text-xs text-muted-foreground">
                  JSON 会保留来源 / 目标 / 对比上下文 / 汇总 / 表变化 / 列变化 / 阻断 / 提示 / 稳定 ID。
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
