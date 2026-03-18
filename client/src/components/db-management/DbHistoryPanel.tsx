import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, History, Loader2, ScanSearch } from "lucide-react";
import type { DbConnectionSummary, DbHistoryCompareRequest } from "@shared/schema";
import { useCompareDbHistory, useDbHistory, useDbHistoryDetail } from "@/hooks/use-db-management";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface DbHistoryPanelProps {
  selectedConnection: DbConnectionSummary | null;
  selectedFileId: number | null;
  selectedFileName?: string | null;
  selectedSheet: string | null;
}

type ComparePreset = "live_previous" | "live_snapshot" | "snapshot_snapshot" | "file_live";

export function DbHistoryPanel({
  selectedConnection,
  selectedFileId,
  selectedFileName,
  selectedSheet,
}: DbHistoryPanelProps) {
  const { toast } = useToast();
  const databaseName = selectedConnection?.lastSelectedDatabase ?? null;
  const history = useDbHistory(
    selectedConnection?.id ?? null,
    databaseName ? { databaseName, changedOnly: true, limit: 50 } : null,
  );
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [preset, setPreset] = useState<ComparePreset>("live_previous");
  const [leftSnapshotHash, setLeftSnapshotHash] = useState<string | null>(null);
  const [rightSnapshotHash, setRightSnapshotHash] = useState<string | null>(null);
  const selectedEvent = history.data?.entries.find((entry) => entry.scanEvent.id === selectedEventId) ?? null;
  const historyDetail = useDbHistoryDetail(selectedConnection?.id ?? null, selectedEventId);
  const compareHistory = useCompareDbHistory();

  useEffect(() => {
    if (!history.data?.entries.length) {
      setSelectedEventId(null);
      return;
    }
    setSelectedEventId((current) => current ?? history.data?.entries[0]?.scanEvent.id ?? null);
    setLeftSnapshotHash((current) => current ?? history.data?.entries[0]?.snapshot?.snapshotHash ?? null);
    setRightSnapshotHash((current) => current ?? history.data?.entries[1]?.snapshot?.snapshotHash ?? history.data?.entries[0]?.snapshot?.snapshotHash ?? null);
  }, [history.data?.entries]);

  const latestEntry = history.data?.entries[0] ?? null;
  const previousChangedEntry = history.data?.entries[1] ?? null;
  const compareSummary = compareHistory.data?.summary;
  const selectedSnapshotOptions = history.data?.entries
    .map((entry) => entry.snapshot)
    .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot)) ?? [];

  const comparisonInput = useMemo<DbHistoryCompareRequest | null>(() => {
    if (!selectedConnection || !databaseName) {
      return null;
    }
    if (preset === "file_live") {
      if (!selectedFileId || !selectedSheet) return null;
      return {
        left: {
          kind: "file",
          fileId: selectedFileId,
          fileName: selectedFileName ?? `file-${selectedFileId}`,
          sheetName: selectedSheet,
        },
        right: {
          kind: "live",
          connectionId: selectedConnection.id,
          databaseName,
        },
        scope: "database",
        refreshLiveSchema: false,
      };
    }
    if (preset === "live_previous") {
      if (!previousChangedEntry?.snapshot) return null;
      return {
        left: {
          kind: "live",
          connectionId: selectedConnection.id,
          databaseName,
        },
        right: {
          kind: "snapshot",
          connectionId: selectedConnection.id,
          databaseName,
          snapshotHash: previousChangedEntry.snapshot.snapshotHash,
        },
        scope: "database",
        refreshLiveSchema: false,
      };
    }
    if (preset === "live_snapshot") {
      if (!rightSnapshotHash) return null;
      return {
        left: {
          kind: "live",
          connectionId: selectedConnection.id,
          databaseName,
        },
        right: {
          kind: "snapshot",
          connectionId: selectedConnection.id,
          databaseName,
          snapshotHash: rightSnapshotHash,
        },
        scope: "database",
        refreshLiveSchema: false,
      };
    }
    if (!leftSnapshotHash || !rightSnapshotHash) return null;
    return {
      left: {
        kind: "snapshot",
        connectionId: selectedConnection.id,
        databaseName,
        snapshotHash: leftSnapshotHash,
      },
      right: {
        kind: "snapshot",
        connectionId: selectedConnection.id,
        databaseName,
        snapshotHash: rightSnapshotHash,
      },
      scope: "database",
      refreshLiveSchema: false,
    };
  }, [databaseName, leftSnapshotHash, preset, previousChangedEntry?.snapshot, rightSnapshotHash, selectedConnection, selectedFileId, selectedFileName, selectedSheet]);

  const runCompare = async () => {
    if (!selectedConnection || !comparisonInput) {
      toast({
        title: "DB 历史",
        description: "当前上下文不足，暂时无法执行历史比较。",
        variant: "destructive",
      });
      return;
    }
    try {
      await compareHistory.mutateAsync({ connectionId: selectedConnection.id, input: comparisonInput });
    } catch (error) {
      toast({
        title: "DB 历史",
        description: error instanceof Error ? error.message : "历史比较失败。",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.15fr_1.1fr]">
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">DB 版本历史</CardTitle>
              <CardDescription>只展示真正发生结构变化的 snapshot。</CardDescription>
            </div>
            <History className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{selectedConnection?.name ?? "未选连接"}</Badge>
            <Badge variant="outline">{databaseName ?? "未选 database"}</Badge>
            <Badge variant="secondary">{selectedFileName ?? "未选文件"}</Badge>
          </div>
          <ScrollArea className="h-[420px] pr-3">
            {!history.data?.entries.length ? (
              <div className="text-sm text-muted-foreground">先扫描一次数据库后，这里才会出现 snapshot 历史。</div>
            ) : (
              <div className="space-y-3">
                {history.data.entries.map((entry, index) => (
                  <button
                    key={entry.scanEvent.id}
                    type="button"
                    className={cn(
                      "w-full rounded-2xl border px-3 py-3 text-left",
                      selectedEventId === entry.scanEvent.id
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/60 bg-background",
                    )}
                    onClick={() => setSelectedEventId(entry.scanEvent.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">
                        Scan #{history.data.entries.length - index}
                      </span>
                      <Badge variant={index === 0 ? "default" : "outline"}>
                        {index === 0 ? "最新" : "历史"}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {entry.snapshot?.snapshotHash.slice(0, 12) ?? entry.scanEvent.snapshotHash.slice(0, 12)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {entry.scanEvent.createdAt ?? "unknown time"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">历史比较</CardTitle>
              <CardDescription>默认比较 live DB 与上一个有变化的 snapshot。</CardDescription>
            </div>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
            <Select value={preset} onValueChange={(value: ComparePreset) => setPreset(value)}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="live_previous">当前 live vs 上一个 snapshot</SelectItem>
                <SelectItem value="live_snapshot">当前 live vs 任意 snapshot</SelectItem>
                <SelectItem value="snapshot_snapshot">snapshot vs snapshot</SelectItem>
                <SelectItem value="file_live">当前文件 vs live DB</SelectItem>
              </SelectContent>
            </Select>

            {(preset === "live_snapshot" || preset === "snapshot_snapshot") ? (
              <Select value={rightSnapshotHash ?? ""} onValueChange={setRightSnapshotHash}>
                <SelectTrigger className="bg-background"><SelectValue placeholder="选择右侧 snapshot" /></SelectTrigger>
                <SelectContent>
                  {selectedSnapshotOptions.map((snapshot) => (
                    <SelectItem key={`right:${snapshot.snapshotHash}`} value={snapshot.snapshotHash}>
                      {snapshot.snapshotHash.slice(0, 12)} · {snapshot.capturedAt ?? "unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {preset === "snapshot_snapshot" ? (
              <Select value={leftSnapshotHash ?? ""} onValueChange={setLeftSnapshotHash}>
                <SelectTrigger className="bg-background"><SelectValue placeholder="选择左侧 snapshot" /></SelectTrigger>
                <SelectContent>
                  {selectedSnapshotOptions.map((snapshot) => (
                    <SelectItem key={`left:${snapshot.snapshotHash}`} value={snapshot.snapshotHash}>
                      {snapshot.snapshotHash.slice(0, 12)} · {snapshot.capturedAt ?? "unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Button onClick={runCompare} disabled={!comparisonInput || compareHistory.isPending}>
              {compareHistory.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
              执行历史比较
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">文件基准: {selectedFileName ?? "未选"}</Badge>
            <Badge variant="outline">Sheet: {selectedSheet ?? "未选"}</Badge>
          </div>

          {compareSummary ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">表新增 {compareSummary.addedTables}</Badge>
              <Badge variant="secondary">表变更 {compareSummary.changedTables}</Badge>
              <Badge variant="secondary">字段变更 {compareSummary.changedColumns}</Badge>
              <Badge variant={compareSummary.blockingCount > 0 ? "destructive" : "outline"}>
                阻断 {compareSummary.blockingCount}
              </Badge>
            </div>
          ) : null}

          <ScrollArea className="h-[320px] pr-3">
            {!compareHistory.data ? (
              <div className="text-sm text-muted-foreground">比较结果会显示在这里，默认建议先看 live 与上一个 snapshot 的差异。</div>
            ) : (
              <div className="space-y-3">
                {compareHistory.data.tableChanges.map((change) => (
                  <div key={change.entityKey} className="rounded-2xl border border-border/60 bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">
                        {change.fileTable?.physicalTableName ?? change.dbTable?.name ?? "unknown_table"}
                      </div>
                      <Badge variant={change.blockers.length > 0 ? "destructive" : "outline"}>
                        {change.action}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      字段差异 {change.columnChanges.length}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">选中详情</CardTitle>
          <CardDescription>帮助判断是 DB 新，还是文档版本更新更快。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="text-sm font-semibold">当前文件上下文</div>
            <div className="mt-2 text-sm text-muted-foreground">{selectedFileName ?? "未选文件"}</div>
            <div className="text-xs text-muted-foreground">{selectedSheet ?? "未选 sheet"}</div>
          </div>

          <Separator />

          {!selectedEvent ? (
            <div className="text-sm text-muted-foreground">从左侧选一个 snapshot 历史节点查看细节。</div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold">Snapshot</div>
                <div className="text-xs text-muted-foreground">
                  {selectedEvent.snapshot?.snapshotHash ?? selectedEvent.scanEvent.snapshotHash}
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold">创建时间</div>
                <div className="text-xs text-muted-foreground">{selectedEvent.scanEvent.createdAt ?? "unknown"}</div>
              </div>
              <div>
                <div className="text-sm font-semibold">上一版本</div>
                <div className="text-xs text-muted-foreground">
                  {selectedEvent.previousSnapshot?.snapshotHash ?? "无"}
                </div>
              </div>
              {historyDetail.data?.entry.snapshot ? (
                <div>
                  <div className="text-sm font-semibold">表数量</div>
                  <div className="text-xs text-muted-foreground">
                    {historyDetail.data.entry.snapshot.tableCount} tables
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
