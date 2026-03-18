import { useEffect, useMemo, useState } from "react";
import { FileCheck2, Loader2, ShieldCheck } from "lucide-react";
import type { DbConnectionSummary } from "@shared/schema";
import { useApplyDbChanges, useDbDeployJobDetail } from "@/hooks/use-db-management";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { DbDiffWorkspaceStateSnapshot } from "./DbDiffWorkspace";

interface DbApplyPanelProps {
  selectedConnection: DbConnectionSummary | null;
  selectedFileId: number | null;
  selectedFileName?: string | null;
  selectedSheet: string | null;
  diffState: DbDiffWorkspaceStateSnapshot;
}

type DbApplyTableChange = NonNullable<DbDiffWorkspaceStateSnapshot["compareResult"]>["tableChanges"][number];

function tableNameFromChange(change: DbApplyTableChange): string {
  return change.fileTable?.physicalTableName || change.dbTable?.name || change.fileTable?.logicalTableName || "unknown_table";
}

export function DbApplyPanel({
  selectedConnection,
  selectedFileId,
  selectedFileName,
  selectedSheet,
  diffState,
}: DbApplyPanelProps) {
  const { toast } = useToast();
  const applyChanges = useApplyDbChanges();
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const deployJob = useDbDeployJobDetail(selectedConnection?.id ?? null, activeJobId);

  const tableOptions = useMemo(() => {
    const compareResult = diffState.compareResult;
    if (!compareResult) return [];
    return compareResult.tableChanges.map((change) => {
      const blockerMessages = [
        ...change.blockers.map((blocker) => blocker.message),
        ...change.columnChanges.flatMap((column) => column.blockers.map((blocker) => blocker.message)),
      ];
      return {
        tableName: tableNameFromChange(change),
        relatedEntityKeys: [change.entityKey, ...change.columnChanges.map((column) => column.entityKey)],
        blocked: blockerMessages.length > 0 || change.action === "removed",
        blockerMessages: blockerMessages.length > 0 ? blockerMessages : change.action === "removed" ? ["DROP 相关差异仍只允许预览。"] : [],
      };
    });
  }, [diffState.compareResult]);

  useEffect(() => {
    const safeTables = tableOptions.filter((option) => !option.blocked).map((option) => option.tableName);
    setSelectedTables((current) => current.filter((tableName) => safeTables.includes(tableName)));
  }, [tableOptions]);

  const toggleTable = (tableName: string, checked: boolean) => {
    setSelectedTables((current) =>
      checked ? Array.from(new Set([...current, tableName])) : current.filter((value) => value !== tableName),
    );
  };

  const runApply = async () => {
    if (!selectedConnection?.lastSelectedDatabase || !selectedFileId || !selectedSheet || !diffState.compareResult) {
      toast({ title: "安全 Apply", description: "请先在差异视图中完成 compare。", variant: "destructive" });
      return;
    }
    const selections = tableOptions
      .filter((option) => selectedTables.includes(option.tableName))
      .map((option) => ({
        tableName: option.tableName,
        relatedEntityKeys: option.relatedEntityKeys,
        blocked: false,
        blockerCodes: [],
      }));
    if (!selections.length) {
      toast({ title: "安全 Apply", description: "至少勾选一张可执行的表。", variant: "destructive" });
      return;
    }

    try {
      const result = await applyChanges.mutateAsync({
        connectionId: selectedConnection.id,
        input: {
          databaseName: selectedConnection.lastSelectedDatabase,
          compareSource: {
            kind: "file",
            fileId: selectedFileId,
            fileName: selectedFileName ?? `file-${selectedFileId}`,
            sheetName: selectedSheet,
          },
          baselineSource: {
            kind: "snapshot",
            connectionId: selectedConnection.id,
            databaseName: selectedConnection.lastSelectedDatabase,
            snapshotHash: diffState.compareResult.context.snapshotHash,
          },
          compareHash: `cmp-${Date.now()}-${selectedConnection.id}`,
          comparedTargetSnapshotHash: diffState.compareResult.context.snapshotHash,
          currentTargetSnapshotHash: diffState.compareResult.context.snapshotHash,
          selections,
          dialect: "mysql",
        },
      });
      setActiveJobId(result.job.id);
      toast({
        title: "安全 Apply",
        description: `已提交执行作业 ${result.job.id}。`,
      });
    } catch (error) {
      toast({
        title: "安全 Apply",
        description: error instanceof Error ? error.message : "提交执行作业失败。",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.05fr]">
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">安全 Apply</CardTitle>
              <CardDescription>只允许执行无阻断项的表，风险项始终只读展示。</CardDescription>
            </div>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{selectedConnection?.name ?? "未选连接"}</Badge>
            <Badge variant="outline">{selectedConnection?.lastSelectedDatabase ?? "未选 database"}</Badge>
            <Badge variant="secondary">{selectedFileName ?? "未选文件"}</Badge>
          </div>

          {!diffState.compareResult ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
              先在差异视图中完成 compare 和 SQL preview，这里才会出现可执行表清单。
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-3">
              <div className="space-y-3">
                {tableOptions.map((option) => (
                  <div key={option.tableName} className="rounded-2xl border border-border/60 bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedTables.includes(option.tableName)}
                          disabled={option.blocked}
                          onCheckedChange={(checked) => toggleTable(option.tableName, checked === true)}
                        />
                        <div>
                          <div className="text-sm font-semibold">{option.tableName}</div>
                          <div className="text-xs text-muted-foreground">
                            {option.blocked ? "该表当前不可执行" : "该表通过安全规则，可参与 apply"}
                          </div>
                        </div>
                      </div>
                      <Badge variant={option.blocked ? "destructive" : "outline"}>
                        {option.blocked ? "已阻断" : "可执行"}
                      </Badge>
                    </div>
                    {option.blockerMessages.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {option.blockerMessages.map((message) => (
                          <div key={`${option.tableName}:${message}`} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                            {message}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <Button onClick={runApply} disabled={applyChanges.isPending || selectedTables.length === 0}>
            {applyChanges.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}
            执行选中的安全变更
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">执行结果</CardTitle>
          <CardDescription>先看 summary，再下钻到表级和 SQL 级明细。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!deployJob.data ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
              最近一次 apply 作业提交后，会先在这里显示总览，再显示 statement 级细节。
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">job {deployJob.data.job.id}</Badge>
                <Badge variant="outline">status {deployJob.data.job.status}</Badge>
                <Badge variant="secondary">tables {deployJob.data.job.summary?.selectedTableCount ?? 0}</Badge>
                <Badge variant="secondary">executed {deployJob.data.job.summary?.executedStatementCount ?? 0}</Badge>
                <Badge variant={Boolean(deployJob.data.job.summary?.failedStatementCount) ? "destructive" : "outline"}>
                  failed {deployJob.data.job.summary?.failedStatementCount ?? 0}
                </Badge>
              </div>

              <div className="rounded-2xl border border-border/60 bg-background p-4">
                <div className="text-sm font-semibold">Summary</div>
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  <div>选中表数: {deployJob.data.job.summary?.selectedTableCount ?? 0}</div>
                  <div>已执行 statement: {deployJob.data.job.summary?.executedStatementCount ?? 0}</div>
                  <div>失败 statement: {deployJob.data.job.summary?.failedStatementCount ?? 0}</div>
                  <div>阻断或跳过: {deployJob.data.job.summary?.blockedStatementCount ?? 0}</div>
                </div>
              </div>

              <Separator />

              <ScrollArea className="h-[280px] pr-3">
                <div className="space-y-3">
                  {deployJob.data.results.map((result) => (
                    <div key={result.statementId} className="rounded-2xl border border-border/60 bg-background p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{result.tableName ?? result.statementKind}</div>
                          <div className="text-xs text-muted-foreground">{result.statementId}</div>
                        </div>
                        <Badge variant={result.status === "failed" ? "destructive" : "outline"}>
                          {result.status}
                        </Badge>
                      </div>
                      <pre className="mt-3 overflow-x-auto rounded-xl bg-muted/30 p-3 text-xs leading-6 text-muted-foreground">
                        {result.sql}
                      </pre>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
