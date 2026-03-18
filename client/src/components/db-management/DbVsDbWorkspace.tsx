import { useEffect, useMemo, useState } from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowRightLeft, GitCompareArrows, Loader2, Network, ShieldAlert, Waypoints } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useDbComparePolicy,
  useDbConnections,
  useDbDatabases,
  useDbVsDbGraphData,
  usePreviewDbVsDbCompare,
  usePreviewDbVsDbSql,
  useReviewDbVsDbRenames,
} from "@/hooks/use-db-management";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type {
  DbConnectionSummary,
  DbRenameDecision,
  DbRenameDecisionItem,
  DbVsDbCompareRequest,
  DbVsDbCompareResponse,
  DbVsDbPreviewResponse,
} from "@shared/schema";

const elk = new ELK();

type ResultFilter = "all" | "changed" | "blocking" | "rename";

const TABLE_ACTION_LABELS: Record<string, string> = {
  added: "source 新增",
  removed: "target 多出",
  modified: "已修改",
  rename_suggest: "rename 建议",
  renamed: "rename 已确认",
};

async function layoutGraph(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  const graph = await elk.layout({
    id: "db-vs-db-graph",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "72",
      "elk.layered.spacing.nodeNodeBetweenLayers": "108",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: (node.style?.width as number | undefined) ?? 240,
      height: (node.style?.height as number | undefined) ?? 160,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });

  const positions = new Map(
    (graph.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]),
  );
  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));
}

function tableLabel(change: DbVsDbCompareResponse["tableChanges"][number]): string {
  return change.fileTable?.physicalTableName || change.dbTable?.name || "unknown_table";
}

function tableHasBlocking(change: DbVsDbCompareResponse["tableChanges"][number]): boolean {
  return change.blockers.length > 0 || change.columnChanges.some((column) => column.blockers.length > 0);
}

function isRenamePending(change: DbVsDbCompareResponse["tableChanges"][number], renameDecisions: Record<string, DbRenameDecision>): boolean {
  if (change.action === "rename_suggest") {
    return (renameDecisions[change.entityKey] ?? "pending") === "pending";
  }
  return change.columnChanges.some(
    (column) => column.action === "rename_suggest" && (renameDecisions[column.entityKey] ?? "pending") === "pending",
  );
}

export function DbVsDbWorkspace({
  seedConnection,
}: {
  seedConnection: DbConnectionSummary | null;
}) {
  const { toast } = useToast();
  const { data: connections = [] } = useDbConnections();
  const { data: policy } = useDbComparePolicy();
  const compareMutation = usePreviewDbVsDbCompare();
  const reviewRenames = useReviewDbVsDbRenames();
  const previewSql = usePreviewDbVsDbSql();

  const [sourceConnectionId, setSourceConnectionId] = useState<number | null>(seedConnection?.id ?? null);
  const [targetConnectionId, setTargetConnectionId] = useState<number | null>(null);
  const [sourceDatabaseName, setSourceDatabaseName] = useState<string | null>(seedConnection?.lastSelectedDatabase ?? null);
  const [targetDatabaseName, setTargetDatabaseName] = useState<string | null>(null);
  const [refreshSourceSchema, setRefreshSourceSchema] = useState(false);
  const [refreshTargetSchema, setRefreshTargetSchema] = useState(false);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null);
  const [compareInput, setCompareInput] = useState<DbVsDbCompareRequest | null>(null);
  const [compareResult, setCompareResult] = useState<DbVsDbCompareResponse | null>(null);
  const [previewResult, setPreviewResult] = useState<DbVsDbPreviewResponse | null>(null);
  const [renameDecisions, setRenameDecisions] = useState<Record<string, DbRenameDecision>>({});
  const [graphNodes, setGraphNodes] = useState<Node[]>([]);
  const [graphEdges, setGraphEdges] = useState<Edge[]>([]);

  const sourceConnection = useMemo(
    () => connections.find((connection) => connection.id === sourceConnectionId) ?? null,
    [connections, sourceConnectionId],
  );
  const targetConnection = useMemo(
    () => connections.find((connection) => connection.id === targetConnectionId) ?? null,
    [connections, targetConnectionId],
  );

  const sourceDatabases = useDbDatabases(sourceConnectionId);
  const targetDatabases = useDbDatabases(targetConnectionId);

  useEffect(() => {
    if (!sourceConnectionId && connections.length > 0) {
      setSourceConnectionId(seedConnection?.id ?? connections[0]?.id ?? null);
    }
    if (!targetConnectionId && connections.length > 0) {
      const fallback = connections.find((connection) => connection.id !== (seedConnection?.id ?? connections[0]?.id));
      setTargetConnectionId(fallback?.id ?? seedConnection?.id ?? connections[0]?.id ?? null);
    }
  }, [connections, seedConnection?.id, sourceConnectionId, targetConnectionId]);

  useEffect(() => {
    if (!sourceDatabaseName && sourceConnection?.lastSelectedDatabase) {
      setSourceDatabaseName(sourceConnection.lastSelectedDatabase);
    }
  }, [sourceConnection?.lastSelectedDatabase, sourceDatabaseName]);

  useEffect(() => {
    if (!targetDatabaseName && targetConnection?.lastSelectedDatabase) {
      setTargetDatabaseName(targetConnection.lastSelectedDatabase);
    }
  }, [targetConnection?.lastSelectedDatabase, targetDatabaseName]);

  useEffect(() => {
    if (!compareResult) {
      setSelectedTableName(null);
      setRenameDecisions({});
      return;
    }
    setRenameDecisions(
      Object.fromEntries(compareResult.renameSuggestions.map((suggestion) => [suggestion.entityKey, suggestion.decision])),
    );
    setSelectedTableName((current) => current ?? compareResult.tableChanges[0]?.fileTable?.physicalTableName ?? compareResult.tableChanges[0]?.dbTable?.name ?? null);
  }, [compareResult]);

  const graphRequest = useMemo(() => {
    if (!compareInput || !compareResult) {
      return null;
    }
    return {
      compare: compareInput,
      decisions: compareResult.renameSuggestions
        .map((suggestion) => ({
          entityKey: suggestion.entityKey,
          entityType: suggestion.entityType,
          decision: renameDecisions[suggestion.entityKey] ?? suggestion.decision,
        }))
        .filter((item): item is DbRenameDecisionItem => item.decision === "accept" || item.decision === "reject"),
      mode: selectedTableName ? "selection" : "changed",
      selectedTableNames: selectedTableName ? [selectedTableName] : [],
      includeNeighbors: true,
    } as const;
  }, [compareInput, compareResult, renameDecisions, selectedTableName]);

  const graph = useDbVsDbGraphData(graphRequest);

  useEffect(() => {
    if (!graph.data) {
      setGraphNodes([]);
      setGraphEdges([]);
      return;
    }

    const nextNodes: Node[] = graph.data.nodes.map((node) => ({
      id: node.id,
      position: node.position,
      data: {
        label: (
          <div
            className={cn(
              "min-w-[210px] rounded-2xl border p-3",
              node.highlighted
                ? "border-primary bg-primary/10"
                : node.changed
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border bg-background",
            )}
          >
            <div className="text-sm font-semibold">{node.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              columns {node.columnCount} · fk {node.foreignKeyCount}
            </div>
          </div>
        ),
      },
      style: {
        width: node.width ?? 240,
        height: node.height ?? 160,
      },
      draggable: false,
      selectable: true,
    }));

    const nextEdges: Edge[] = graph.data.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      label: edge.relationshipName,
      animated: edge.changed,
      style: {
        stroke: edge.changed ? "#f59e0b" : "#64748b",
        strokeWidth: edge.changed ? 2.5 : 1.5,
      },
    }));

    void layoutGraph(nextNodes, nextEdges).then((laidOut) => {
      setGraphNodes(laidOut);
      setGraphEdges(nextEdges);
    });
  }, [graph.data]);

  const filteredTableChanges = useMemo(() => {
    const source = compareResult?.tableChanges ?? [];
    switch (resultFilter) {
      case "blocking":
        return source.filter(tableHasBlocking);
      case "rename":
        return source.filter((change) => isRenamePending(change, renameDecisions));
      case "changed":
        return source.filter((change) => change.action !== "removed" || change.changedFields.length > 0 || change.columnChanges.length > 0);
      default:
        return source;
    }
  }, [compareResult?.tableChanges, renameDecisions, resultFilter]);

  const focusedChange = useMemo(
    () =>
      filteredTableChanges.find((change) => tableLabel(change) === selectedTableName) ??
      compareResult?.tableChanges.find((change) => tableLabel(change) === selectedTableName) ??
      null,
    [compareResult?.tableChanges, filteredTableChanges, selectedTableName],
  );

  const runCompare = async () => {
    if (!sourceConnectionId || !targetConnectionId || !sourceDatabaseName || !targetDatabaseName) {
      toast({
        title: "DB vs DB",
        description: "请先完整选择 source 和 target。",
        variant: "destructive",
      });
      return;
    }

    const input: DbVsDbCompareRequest = {
      source: {
        connectionId: sourceConnectionId,
        databaseName: sourceDatabaseName,
      },
      target: {
        connectionId: targetConnectionId,
        databaseName: targetDatabaseName,
      },
      scope: "database",
      refreshSourceSchema,
      refreshTargetSchema,
    };

    try {
      const result = await compareMutation.mutateAsync(input);
      setCompareInput(input);
      setCompareResult(result);
      setPreviewResult(null);
      toast({
        title: "DB vs DB",
        description: `已比较 ${result.context.sourceConnectionName}/${result.context.sourceDatabaseName} -> ${result.context.targetConnectionName}/${result.context.targetDatabaseName}`,
      });
    } catch (error) {
      toast({
        title: "DB vs DB",
        description: error instanceof Error ? error.message : "比较失败。",
        variant: "destructive",
      });
    }
  };

  const swapTargets = () => {
    setSourceConnectionId(targetConnectionId);
    setTargetConnectionId(sourceConnectionId);
    setSourceDatabaseName(targetDatabaseName);
    setTargetDatabaseName(sourceDatabaseName);
    setCompareResult(null);
    setPreviewResult(null);
  };

  const applyRenameReview = async () => {
    if (!compareInput || !compareResult) return;
    const decisions = compareResult.renameSuggestions
      .map((suggestion) => ({
        entityKey: suggestion.entityKey,
        entityType: suggestion.entityType,
        decision: renameDecisions[suggestion.entityKey] ?? suggestion.decision,
      }))
      .filter((item): item is DbRenameDecisionItem => item.decision === "accept" || item.decision === "reject");

    if (decisions.length === 0) {
      return;
    }

    try {
      const result = await reviewRenames.mutateAsync({
        compare: compareInput,
        decisions,
      });
      setCompareResult(result);
      setPreviewResult(null);
    } catch (error) {
      toast({
        title: "Rename Review",
        description: error instanceof Error ? error.message : "rename 决策应用失败。",
        variant: "destructive",
      });
    }
  };

  const generatePreview = async () => {
    if (!compareInput || !compareResult) return;
    const decisions = compareResult.renameSuggestions
      .map((suggestion) => ({
        entityKey: suggestion.entityKey,
        entityType: suggestion.entityType,
        decision: renameDecisions[suggestion.entityKey] ?? suggestion.decision,
      }))
      .filter((item): item is DbRenameDecisionItem => item.decision === "accept" || item.decision === "reject");

    try {
      const result = await previewSql.mutateAsync({
        compare: compareInput,
        decisions,
        dialect: "mysql",
      });
      setPreviewResult(result);
      setCompareResult(result.compareResult);
    } catch (error) {
      toast({
        title: "Directional Preview",
        description: error instanceof Error ? error.message : "生成方向性 preview 失败。",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">DB vs DB Compare</CardTitle>
            <CardDescription>
              先整库比较，再筛选表；同时联动差异树、方向性 SQL preview 和关系图高亮。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">默认整库 compare</Badge>
            <Badge variant="outline">
              table {policy?.tableRenameAutoAcceptThreshold ?? "manual"}
            </Badge>
            <Badge variant="outline">
              column {policy?.columnRenameAutoAcceptThreshold ?? "manual"}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/25 p-4 xl:grid-cols-[1fr_auto_1fr_auto_auto]">
          <div className="space-y-3 rounded-2xl border border-border/60 bg-background p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">source</div>
            <Select value={sourceConnectionId ? String(sourceConnectionId) : ""} onValueChange={(value) => setSourceConnectionId(Number(value))}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="选择 source 连接" /></SelectTrigger>
              <SelectContent>
                {connections.map((connection) => (
                  <SelectItem key={connection.id} value={String(connection.id)}>{connection.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceDatabaseName ?? ""} onValueChange={setSourceDatabaseName} disabled={!sourceConnectionId}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="选择 source database" /></SelectTrigger>
              <SelectContent>
                {(sourceDatabases.data ?? []).map((database) => (
                  <SelectItem key={database.name} value={database.name}>{database.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              <Checkbox checked={refreshSourceSchema} onCheckedChange={(checked) => setRefreshSourceSchema(checked === true)} />
              刷新 source schema
            </label>
          </div>

          <div className="flex items-center justify-center">
            <Button type="button" variant="outline" size="icon" onClick={swapTargets} aria-label="swap-source-target">
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3 rounded-2xl border border-border/60 bg-background p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">target</div>
            <Select value={targetConnectionId ? String(targetConnectionId) : ""} onValueChange={(value) => setTargetConnectionId(Number(value))}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="选择 target 连接" /></SelectTrigger>
              <SelectContent>
                {connections.map((connection) => (
                  <SelectItem key={connection.id} value={String(connection.id)}>{connection.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={targetDatabaseName ?? ""} onValueChange={setTargetDatabaseName} disabled={!targetConnectionId}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="选择 target database" /></SelectTrigger>
              <SelectContent>
                {(targetDatabases.data ?? []).map((database) => (
                  <SelectItem key={database.name} value={database.name}>{database.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              <Checkbox checked={refreshTargetSchema} onCheckedChange={(checked) => setRefreshTargetSchema(checked === true)} />
              刷新 target schema
            </label>
          </div>

          <div className="flex items-center">
            <Button onClick={runCompare} disabled={compareMutation.isPending}>
              {compareMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitCompareArrows className="mr-2 h-4 w-4" />}
              Compare
            </Button>
          </div>

          <div className="flex items-center">
            <Button variant="secondary" onClick={generatePreview} disabled={!compareResult || previewSql.isPending}>
              {previewSql.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Waypoints className="mr-2 h-4 w-4" />}
              Directional Preview
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {compareResult ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge variant="secondary">added {compareResult.summary.addedTables}</Badge>
            <Badge variant="secondary">removed {compareResult.summary.removedTables}</Badge>
            <Badge variant="secondary">changed {compareResult.summary.changedTables}</Badge>
            <Badge variant={compareResult.summary.blockingCount > 0 ? "destructive" : "outline"}>
              blockers {compareResult.summary.blockingCount}
            </Badge>
            <Badge variant={compareResult.summary.pendingRenameConfirmations > 0 ? "destructive" : "outline"}>
              rename 待确认 {compareResult.summary.pendingRenameConfirmations}
            </Badge>
          </div>
        ) : null}

        <div className="grid min-h-[620px] gap-4 xl:grid-cols-[0.9fr_1fr_1.1fr]">
          <Card className="min-h-0 border-border/70">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">差异树</CardTitle>
                  <CardDescription>先看整库，再筛表。</CardDescription>
                </div>
                <div className="flex gap-2">
                  {(["all", "changed", "blocking", "rename"] as const).map((filter) => (
                    <Button
                      key={filter}
                      variant={resultFilter === filter ? "default" : "outline"}
                      size="sm"
                      onClick={() => setResultFilter(filter)}
                    >
                      {filter === "all" ? "全部" : filter === "changed" ? "有变化" : filter === "blocking" ? "阻断" : "rename"}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="min-h-0">
              <ScrollArea className="h-[500px] pr-3">
                {!compareResult ? (
                  <div className="text-sm text-muted-foreground">先运行整库 compare。</div>
                ) : filteredTableChanges.length === 0 ? (
                  <div className="text-sm text-muted-foreground">当前筛选下没有表。</div>
                ) : (
                  filteredTableChanges.map((change) => {
                    const label = tableLabel(change);
                    return (
                      <button
                        key={change.entityKey}
                        type="button"
                        className={cn(
                          "mb-3 w-full rounded-2xl border px-3 py-3 text-left",
                          selectedTableName === label ? "border-primary/70 bg-primary/10" : "border-border/60 bg-background",
                        )}
                        onClick={() => setSelectedTableName(label)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">{label}</div>
                          <Badge variant={tableHasBlocking(change) ? "destructive" : "outline"}>
                            {TABLE_ACTION_LABELS[change.action] ?? change.action}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          fields {change.changedFields.length} · columns {change.columnChanges.length}
                        </div>
                      </button>
                    );
                  })
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="min-h-0 border-border/70">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">方向性 Preview</CardTitle>
                  <CardDescription>让 target 追上 source，需要改什么。</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={applyRenameReview} disabled={reviewRenames.isPending || !compareResult}>
                  {reviewRenames.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  应用 rename 决策
                </Button>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 space-y-4">
              {compareResult?.renameSuggestions.length ? (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ShieldAlert className="h-4 w-4" />
                    Rename / 等价建议
                  </div>
                  <div className="space-y-3">
                    {compareResult.renameSuggestions.map((suggestion) => (
                      <div key={suggestion.entityKey} className="rounded-xl border border-border/60 bg-background/80 p-3">
                        <div className="text-sm">
                          {suggestion.entityType === "table"
                            ? `${suggestion.tableNameBefore} -> ${suggestion.tableNameAfter}`
                            : `${suggestion.tableNameBefore}.${suggestion.columnNameBefore} -> ${suggestion.tableNameAfter}.${suggestion.columnNameAfter}`}
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <Badge variant="secondary">confidence {(suggestion.confidence * 100).toFixed(0)}%</Badge>
                          <Select
                            value={renameDecisions[suggestion.entityKey] ?? suggestion.decision}
                            onValueChange={(value: DbRenameDecision) =>
                              setRenameDecisions((current) => ({ ...current, [suggestion.entityKey]: value }))
                            }
                          >
                            <SelectTrigger className="w-[180px] bg-background"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">待确认</SelectItem>
                              <SelectItem value="accept">接受建议</SelectItem>
                              <SelectItem value="reject">拒绝建议</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <ScrollArea className="h-[360px] pr-3">
                {!focusedChange ? (
                  <div className="text-sm text-muted-foreground">从左侧选择一张表，查看差异和 SQL 方向。</div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border/60 bg-background p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold">{tableLabel(focusedChange)}</div>
                          <div className="text-sm text-muted-foreground">
                            source {compareResult?.context.sourceDatabaseName} {"->"} target {compareResult?.context.targetDatabaseName}
                          </div>
                        </div>
                        <Badge variant={tableHasBlocking(focusedChange) ? "destructive" : "outline"}>
                          {TABLE_ACTION_LABELS[focusedChange.action] ?? focusedChange.action}
                        </Badge>
                      </div>
                      <Separator className="my-4" />
                      <div className="flex flex-wrap gap-2">
                        {focusedChange.changedFields.map((field) => (
                          <Badge key={field} variant="secondary">{field}</Badge>
                        ))}
                        {focusedChange.changedFields.length === 0 ? (
                          <span className="text-sm text-muted-foreground">这张表主要由列变化驱动。</span>
                        ) : null}
                      </div>
                      <div className="mt-4 space-y-2">
                        {[...focusedChange.blockers, ...focusedChange.columnChanges.flatMap((column) => column.blockers)].map((blocker) => (
                          <div key={`${blocker.entityKey}:${blocker.code}`} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
                            {blocker.message}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-background p-4">
                      <div className="mb-3 text-sm font-semibold">Directional SQL / DDL preview</div>
                      {!previewResult ? (
                        <div className="text-sm text-muted-foreground">
                          点击上方 `Directional Preview` 生成 source {"->"} target 的 SQL/DDL 风格预览。
                        </div>
                      ) : previewResult.blocked ? (
                        <div className="text-sm text-red-300">
                          当前还有阻断项，preview 已识别但不会生成可执行 SQL。
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {previewResult.artifacts
                            .filter((artifact) => !selectedTableName || artifact.tableName === selectedTableName)
                            .map((artifact) => (
                              <div key={artifact.artifactName} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                  {artifact.artifactName}
                                </div>
                                <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-6">{artifact.sql}</pre>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="min-h-0 border-border/70">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Graph Linkage</CardTitle>
                  <CardDescription>整库关系图，高亮变更表，并联动当前筛选。</CardDescription>
                </div>
                <Network className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="h-[540px]">
              {!graphRequest ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  先运行 compare，图才会联动显示。
                </div>
              ) : (
                <ReactFlow nodes={graphNodes} edges={graphEdges} fitView nodesDraggable={false} elementsSelectable>
                  <MiniMap />
                  <Controls />
                  <Background gap={24} size={1} />
                </ReactFlow>
              )}
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
