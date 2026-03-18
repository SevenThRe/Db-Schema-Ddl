import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, History } from "lucide-react";
import type { DbConnectionSummary } from "@shared/schema";
import { useDbHistory, useDbHistoryDetail } from "@/hooks/use-db-management";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DbSnapshotCompareWorkspaceSeed } from "./DbSnapshotCompareWorkspace";

interface DbHistoryPanelProps {
  selectedConnection: DbConnectionSummary | null;
  selectedFileId: number | null;
  selectedFileName?: string | null;
  selectedSheet: string | null;
  onOpenSnapshotCompare: (seed: DbSnapshotCompareWorkspaceSeed) => void;
}

export function DbHistoryPanel({
  selectedConnection,
  selectedFileId,
  selectedFileName,
  selectedSheet,
  onOpenSnapshotCompare,
}: DbHistoryPanelProps) {
  const databaseName = selectedConnection?.lastSelectedDatabase ?? null;
  const history = useDbHistory(
    selectedConnection?.id ?? null,
    databaseName ? { databaseName, changedOnly: true, limit: 50 } : null,
  );
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  useEffect(() => {
    if (!history.data?.entries.length) {
      setSelectedEventId(null);
      return;
    }
    setSelectedEventId((current) => current ?? history.data?.entries[0]?.scanEvent.id ?? null);
  }, [history.data?.entries]);

  const selectedEvent = history.data?.entries.find((entry) => entry.scanEvent.id === selectedEventId) ?? null;
  const historyDetail = useDbHistoryDetail(selectedConnection?.id ?? null, selectedEventId);
  const previousEntry = useMemo(() => {
    if (!history.data?.entries.length || !selectedEventId) {
      return null;
    }
    const currentIndex = history.data.entries.findIndex((entry) => entry.scanEvent.id === selectedEventId);
    return currentIndex >= 0 ? history.data.entries[currentIndex + 1] ?? null : null;
  }, [history.data?.entries, selectedEventId]);

  const openLiveVsSnapshot = () => {
    if (!selectedConnection || !databaseName || !selectedEvent?.snapshot) {
      return;
    }
    onOpenSnapshotCompare({
      left: {
        connectionId: selectedConnection.id,
        databaseName,
        sourceKind: "live",
        freshness: "latest_snapshot",
      },
      right: {
        connectionId: selectedConnection.id,
        databaseName,
        sourceKind: "snapshot",
        snapshotHash: selectedEvent.snapshot.snapshotHash,
      },
    });
  };

  const openSnapshotVsPrevious = () => {
    if (!selectedConnection || !databaseName || !selectedEvent?.snapshot || !previousEntry?.snapshot) {
      return;
    }
    onOpenSnapshotCompare({
      left: {
        connectionId: selectedConnection.id,
        databaseName,
        sourceKind: "snapshot",
        snapshotHash: selectedEvent.snapshot.snapshotHash,
      },
      right: {
        connectionId: selectedConnection.id,
        databaseName,
        sourceKind: "snapshot",
        snapshotHash: previousEntry.snapshot.snapshotHash,
      },
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.15fr_0.9fr]">
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">DB 版本历史</CardTitle>
              <CardDescription>这里只保留单库时间线和版本详情。</CardDescription>
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
                      <span className="text-sm font-semibold">Scan #{history.data.entries.length - index}</span>
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
          <CardTitle className="text-sm">版本详情</CardTitle>
          <CardDescription>判断这次变化是 DB 漂移，还是文档版本推进。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedEvent ? (
            <div className="text-sm text-muted-foreground">从左侧选一个 snapshot 历史节点查看细节。</div>
          ) : (
            <>
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="text-sm font-semibold">Snapshot</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {selectedEvent.snapshot?.snapshotHash ?? selectedEvent.scanEvent.snapshotHash}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {selectedEvent.scanEvent.createdAt ?? "unknown"}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/60 bg-background p-4">
                  <div className="text-sm font-semibold">上一版本</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {selectedEvent.previousSnapshot?.snapshotHash ?? "无"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background p-4">
                  <div className="text-sm font-semibold">表数量</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {historyDetail.data?.entry.snapshot?.tableCount ?? selectedEvent.snapshot?.tableCount ?? 0} tables
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-background p-4">
                <div className="text-sm font-semibold">当前文件上下文</div>
                <div className="mt-2 text-sm text-muted-foreground">{selectedFileName ?? "未选文件"}</div>
                <div className="text-xs text-muted-foreground">{selectedSheet ?? "未选 sheet"}</div>
                {selectedFileId ? (
                  <div className="mt-1 text-xs text-muted-foreground">file #{selectedFileId}</div>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">跳转比较</CardTitle>
          <CardDescription>任意双源比较现在由 Snapshot Compare 负责。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full justify-start"
            variant="secondary"
            onClick={openLiveVsSnapshot}
            disabled={!selectedEvent?.snapshot || !selectedConnection || !databaseName}
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            在 Snapshot Compare 打开
          </Button>
          <Button
            className="w-full justify-start"
            variant="outline"
            onClick={openSnapshotVsPrevious}
            disabled={!selectedEvent?.snapshot || !previousEntry?.snapshot || !selectedConnection || !databaseName}
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            当前 snapshot vs 上一个 snapshot
          </Button>
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            History 现在只保留时间线和详情。任意双源比较、freshness 选择、Markdown / JSON 报告导出，都统一放到 Snapshot Compare。
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
