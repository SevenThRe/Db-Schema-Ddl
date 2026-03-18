import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type {
  DbConnectionSummary,
  DbLiveExportIssue,
  DbLiveExportPreviewResponse,
  DbSnapshotCompareLiveFreshness,
  WorkbookTemplateVariantId,
} from "@shared/schema";
import { useWorkbookTemplates } from "@/hooks/use-ddl";
import {
  useExecuteLiveDbWorkbookExport,
  usePreviewLiveDbWorkbookExport,
} from "@/hooks/use-db-management";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const TEMPLATE_PREFERENCE_STORAGE_KEY = "db-management.live-export.template-id";

const ISSUE_STYLES: Record<DbLiveExportIssue["severity"], string> = {
  blocking: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200",
  confirm: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  info: "border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-200",
};

function readStoredTemplateId(): WorkbookTemplateVariantId | "" {
  if (typeof window === "undefined") {
    return "";
  }
  const value = window.localStorage.getItem(TEMPLATE_PREFERENCE_STORAGE_KEY);
  return value === "format-a-table-sheet" || value === "format-b-multi-table-sheet" ? value : "";
}

function persistTemplateId(templateId: WorkbookTemplateVariantId) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TEMPLATE_PREFERENCE_STORAGE_KEY, templateId);
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function summarizeIssues(issues: DbLiveExportIssue[]) {
  return issues.reduce(
    (summary, issue) => {
      if (issue.severity === "blocking") {
        summary.blockingCount += 1;
      } else if (issue.severity === "confirm") {
        summary.confirmCount += 1;
      } else {
        summary.infoCount += 1;
      }
      return summary;
    },
    { blockingCount: 0, confirmCount: 0, infoCount: 0 },
  );
}

function filterIssuesForSelection(issues: DbLiveExportIssue[], selectedTableNames: string[]) {
  const selected = new Set(selectedTableNames.map((name) => normalizeName(name)));
  return issues.filter((issue) => !issue.tableName || selected.has(normalizeName(issue.tableName)));
}

function freshnessLabel(mode: DbSnapshotCompareLiveFreshness) {
  return mode === "refresh_live" ? "导出前刷新 live" : "使用最近 snapshot";
}

function reviewArtifact(
  artifact: DbLiveExportPreviewResponse | null,
  selectedTableNames: string[],
  templateId: WorkbookTemplateVariantId | "",
) {
  if (!artifact) {
    return null;
  }

  const effectiveSelection = selectedTableNames.length > 0
    ? selectedTableNames
    : artifact.selectableTableNames;
  const issues = filterIssuesForSelection(artifact.issues, effectiveSelection);
  const issueSummary = summarizeIssues(issues);

  return {
    ...artifact,
    selectedTableNames: effectiveSelection,
    templateId: (templateId || artifact.templateId) as WorkbookTemplateVariantId,
    issues,
    issueSummary,
    canExport: effectiveSelection.length > 0 && issueSummary.blockingCount === 0,
  };
}

export function DbLiveExportWorkspace({
  selectedConnection,
  onActivateFile,
}: {
  selectedConnection: DbConnectionSummary | null;
  onActivateFile?: (fileId: number) => void;
}) {
  const { toast } = useToast();
  const { data: templates = [] } = useWorkbookTemplates();
  const previewMutation = usePreviewLiveDbWorkbookExport();
  const exportMutation = useExecuteLiveDbWorkbookExport();

  const [freshnessMode, setFreshnessMode] = useState<DbSnapshotCompareLiveFreshness>("latest_snapshot");
  const [selectedTemplateId, setSelectedTemplateId] = useState<WorkbookTemplateVariantId | "">(() => readStoredTemplateId());
  const [artifact, setArtifact] = useState<DbLiveExportPreviewResponse | null>(null);
  const [tableFilter, setTableFilter] = useState("");
  const [selectedTableNames, setSelectedTableNames] = useState<string[]>([]);
  const [allowLossyExport, setAllowLossyExport] = useState(false);

  const selectedDatabase = selectedConnection?.lastSelectedDatabase ?? null;

  useEffect(() => {
    if (selectedConnection?.lastSelectedDatabase && artifact?.databaseName !== selectedConnection.lastSelectedDatabase) {
      setArtifact(null);
      setSelectedTableNames([]);
      setAllowLossyExport(false);
    }
  }, [artifact?.databaseName, selectedConnection?.lastSelectedDatabase]);

  useEffect(() => {
    if (templates.length === 0) {
      return;
    }
    setSelectedTemplateId((current) => current || templates[0]?.id || "");
  }, [templates]);

  useEffect(() => {
    if (!artifact) {
      return;
    }
    setSelectedTableNames(artifact.selectedTableNames.length > 0 ? artifact.selectedTableNames : artifact.selectableTableNames);
    setAllowLossyExport(false);
  }, [artifact]);

  const filteredTables = useMemo(() => {
    const source = artifact?.catalog.tables ?? [];
    const keyword = tableFilter.trim().toLowerCase();
    if (!keyword) {
      return source;
    }
    return source.filter((table) =>
      table.name.toLowerCase().includes(keyword) || (table.comment ?? "").toLowerCase().includes(keyword),
    );
  }, [artifact?.catalog.tables, tableFilter]);

  const reviewedArtifact = useMemo(
    () => reviewArtifact(artifact, selectedTableNames, selectedTemplateId),
    [artifact, selectedTableNames, selectedTemplateId],
  );

  const selectedSet = useMemo(
    () => new Set(selectedTableNames.map((name) => normalizeName(name))),
    [selectedTableNames],
  );

  const canReadCatalog = Boolean(selectedConnection?.id && selectedDatabase && selectedTemplateId);
  const hasBlockingIssues = (reviewedArtifact?.issueSummary.blockingCount ?? 0) > 0;
  const requiresLossyConfirmation = (reviewedArtifact?.issueSummary.confirmCount ?? 0) > 0;

  const handleRefreshPreview = async () => {
    if (!selectedConnection?.id || !selectedDatabase) {
      toast({
        title: "Live DB to XLSX",
        description: "还没有可导出的数据库目录。先选择连接、database 和 freshness 模式，再读取当前目录开始审阅。",
        variant: "destructive",
      });
      return;
    }
    if (!selectedTemplateId) {
      toast({
        title: "Live DB to XLSX",
        description: "请先选择导出的官方模板。",
        variant: "destructive",
      });
      return;
    }

    if (
      freshnessMode === "refresh_live" &&
      typeof window !== "undefined" &&
      !window.confirm("这会重新扫描当前数据库，并可能生成新的 snapshot 版本。确认继续刷新吗？")
    ) {
      return;
    }

    try {
      const result = await previewMutation.mutateAsync({
        connectionId: selectedConnection.id,
        databaseName: selectedDatabase,
        freshnessMode,
        selectedTableNames,
        templateId: selectedTemplateId,
      });
      setArtifact(result);
      toast({
        title: "导出准备",
        description: `${result.databaseName} 已读取 ${result.catalog.tables.length} 张表，可以继续筛选并生成 XLSX 工作簿。`,
      });
    } catch (error) {
      toast({
        title: "导出未完成。请先处理阻断项，或切换 freshness 后重新读取目录。",
        description: error instanceof Error ? error.message : "读取导出目录失败。",
        variant: "destructive",
      });
    }
  };

  const toggleTable = (tableName: string, checked: boolean) => {
    setSelectedTableNames((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(tableName);
      } else {
        next.delete(tableName);
      }
      return artifact?.selectableTableNames.filter((name) => next.has(name)) ?? Array.from(next);
    });
  };

  const toggleAllFiltered = (checked: boolean) => {
    const filteredNames = filteredTables.map((table) => table.name);
    setSelectedTableNames((current) => {
      const next = new Set(current);
      filteredNames.forEach((name) => {
        if (checked) {
          next.add(name);
        } else {
          next.delete(name);
        }
      });
      return artifact?.selectableTableNames.filter((name) => next.has(name)) ?? Array.from(next);
    });
  };

  const handleExport = async () => {
    if (!artifact || !reviewedArtifact || !selectedTemplateId) {
      return;
    }
    if (!reviewedArtifact.canExport) {
      toast({
        title: "导出未完成。请先处理阻断项，或切换 freshness 后重新读取目录。",
        description: "当前仍有阻断项，无法继续生成工作簿。",
        variant: "destructive",
      });
      return;
    }
    if (requiresLossyConfirmation && !allowLossyExport) {
      toast({
        title: "导出准备",
        description: "存在有损项，请先确认后再继续导出。",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await exportMutation.mutateAsync({
        artifact,
        selectedTableNames: reviewedArtifact.selectedTableNames,
        templateId: selectedTemplateId,
        allowLossyExport,
        originalName: `${reviewedArtifact.databaseName}.xlsx`,
      });
      persistTemplateId(selectedTemplateId);
      toast({
        title: "生成 XLSX 工作簿",
        description: `已创建 ${result.file.originalName}，并加入文件列表。`,
      });
      onActivateFile?.(result.file.id);
    } catch (error) {
      toast({
        title: "导出未完成。请先处理阻断项，或切换 freshness 后重新读取目录。",
        description: error instanceof Error ? error.message : "生成 XLSX 工作簿失败。",
        variant: "destructive",
      });
    }
  };

  const allFilteredSelected = filteredTables.length > 0 && filteredTables.every((table) => selectedSet.has(normalizeName(table.name)));

  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle className="text-base">Live DB to XLSX</CardTitle>
            <CardDescription>
              从当前 live DB / snapshot 目录生成官方模板工作簿，成功后立即回到标准文件列表流程。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">whole catalog first</Badge>
            <Badge variant="outline">parser round-trip gated</Badge>
            <Badge variant="secondary">{freshnessLabel(freshnessMode)}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/20 lg:grid-cols-[0.95fr_1.15fr_0.9fr]">
        <section className="min-h-[580px] border-b border-border/60 bg-background lg:border-b-0 lg:border-r">
          <div className="space-y-4 p-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Source</div>
              <h3 className="mt-2 text-base font-semibold">读取导出目录</h3>
              <p className="text-sm text-muted-foreground">
                先确认当前连接、database 和 freshness，再读取完整目录进入审阅。
              </p>
            </div>

            <Card className="border-border/70 bg-slate-50/70 dark:bg-slate-950/20">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Database className="h-4 w-4 text-primary" />
                  当前来源
                </div>
                <div className="rounded-xl border border-border/60 bg-background px-3 py-2 text-sm">
                  <div className="font-medium">{selectedConnection?.name ?? "未选择连接"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{selectedDatabase ?? "请先在上方选择 database"}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Freshness</div>
                  <div className="grid gap-2">
                    <Button
                      type="button"
                      variant={freshnessMode === "latest_snapshot" ? "default" : "outline"}
                      className="justify-start"
                      onClick={() => setFreshnessMode("latest_snapshot")}
                    >
                      使用最近 snapshot
                    </Button>
                    <Button
                      type="button"
                      variant={freshnessMode === "refresh_live" ? "default" : "outline"}
                      className="justify-start"
                      onClick={() => setFreshnessMode("refresh_live")}
                    >
                      导出前刷新 live
                    </Button>
                  </div>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleRefreshPreview}
                  disabled={!canReadCatalog || previewMutation.isPending}
                >
                  {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  读取导出目录
                </Button>
              </CardContent>
            </Card>

            {!artifact ? (
              <Alert>
                <FileSpreadsheet className="h-4 w-4" />
                <AlertTitle>还没有可导出的数据库目录</AlertTitle>
                <AlertDescription>
                  先选择连接、database 和 freshness 模式，再读取当前目录开始审阅。
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-primary/30 bg-primary/5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertTitle>目录已载入</AlertTitle>
                <AlertDescription>
                  当前基于 <span className="font-mono">{artifact.resolvedSnapshotHash.slice(0, 12)}</span> 审阅，
                  共 {artifact.catalog.tables.length} 张表。
                </AlertDescription>
              </Alert>
            )}
          </div>
        </section>

        <section className="min-h-[580px] border-b border-border/60 bg-background lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            <div className="border-b border-border/60 px-6 py-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h3 className="text-base font-semibold">表选择</h3>
                  <p className="text-sm text-muted-foreground">
                    先看整库，再筛选要带入工作簿的表。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={tableFilter}
                    onChange={(event) => setTableFilter(event.target.value)}
                    placeholder="筛选表名或备注"
                    className="h-9 w-[220px]"
                  />
                  <Badge variant="secondary">{selectedTableNames.length} selected</Badge>
                </div>
              </div>
            </div>

            <div className="border-b border-border/60 px-6 py-3">
              <div className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={(checked) => toggleAllFiltered(Boolean(checked))}
                  id="live-export-select-all"
                />
                <label htmlFor="live-export-select-all" className="cursor-pointer font-medium">
                  选中当前筛选结果
                </label>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-6">
                {(filteredTables.length === 0 ? artifact?.catalog.tables ?? [] : filteredTables).map((table) => {
                  const isSelected = selectedSet.has(normalizeName(table.name));
                  return (
                    <div key={table.name} className="rounded-2xl border border-border/60 bg-background p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => toggleTable(table.name, Boolean(checked))}
                          id={`live-export-${table.name}`}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <label htmlFor={`live-export-${table.name}`} className="cursor-pointer font-medium">
                              {table.name}
                            </label>
                            <Badge variant="outline">{table.columns.length} columns</Badge>
                            {table.foreignKeys.length > 0 ? <Badge variant="outline">{table.foreignKeys.length} FK</Badge> : null}
                            {table.indexes.filter((index) => !index.primary).length > 0 ? (
                              <Badge variant="outline">{table.indexes.filter((index) => !index.primary).length} IDX</Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {table.comment || "无表备注"} · {table.engine || "engine unknown"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {artifact && filteredTables.length === 0 && tableFilter.trim() ? (
                  <div className="rounded-2xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
                    当前筛选没有匹配到表，请调整关键字后重试。
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </section>

        <section className="min-h-[580px] bg-slate-50/70 dark:bg-slate-950/20">
          <div className="flex h-full flex-col">
            <div className="border-b border-border/60 px-6 py-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold">导出准备</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                右侧是整个工作流的 trust gate：先看 blocker / 有损项，再选择模板并生成 XLSX 工作簿。
              </p>
            </div>

            <div className="space-y-4 p-6">
              <Card className={cn("border-border/70", hasBlockingIssues && "border-red-500/40 bg-red-500/10")}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Issue Summary</div>
                    <Badge variant={hasBlockingIssues ? "destructive" : "secondary"}>
                      {reviewedArtifact?.selectedTableNames.length ?? 0} tables
                    </Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-red-700 dark:text-red-200">blocking</div>
                      <div className="mt-1 text-lg font-semibold">{reviewedArtifact?.issueSummary.blockingCount ?? 0}</div>
                    </div>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">confirm</div>
                      <div className="mt-1 text-lg font-semibold">{reviewedArtifact?.issueSummary.confirmCount ?? 0}</div>
                    </div>
                    <div className="rounded-xl border border-slate-400/30 bg-slate-500/10 px-3 py-2 text-sm">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200">info</div>
                      <div className="mt-1 text-lg font-semibold">{reviewedArtifact?.issueSummary.infoCount ?? 0}</div>
                    </div>
                  </div>
                  <Select value={selectedTemplateId} onValueChange={(value: WorkbookTemplateVariantId) => setSelectedTemplateId(value)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="选择导出的官方模板" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {requiresLossyConfirmation ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <div className="text-sm font-medium text-amber-800 dark:text-amber-100">存在有损项</div>
                      <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
                        当前选择仍包含不会被工作簿结构完整保存的数据库信息，继续前请明确确认。
                      </div>
                      <div className="mt-3 flex items-start gap-2">
                        <Checkbox
                          checked={allowLossyExport}
                          onCheckedChange={(checked) => setAllowLossyExport(Boolean(checked))}
                          id="live-export-lossy-confirm"
                        />
                        <label htmlFor="live-export-lossy-confirm" className="cursor-pointer text-sm">
                          我已确认这些有损项，允许继续导出
                        </label>
                      </div>
                    </div>
                  ) : null}
                  {hasBlockingIssues ? (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>导出未完成。请先处理阻断项，或切换 freshness 后重新读取目录。</AlertTitle>
                      <AlertDescription>
                        当前仍有结构无法安全映射到官方模板，导出按钮会保持禁用。
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleExport}
                    disabled={!reviewedArtifact?.canExport || exportMutation.isPending || !selectedTemplateId}
                  >
                    {exportMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                    生成 XLSX 工作簿
                  </Button>
                </CardContent>
              </Card>

              <Separator />

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-3 pr-1">
                  {(reviewedArtifact?.issues ?? []).map((issue) => (
                    <div key={`${issue.entityKey}:${issue.kind}`} className={cn("rounded-xl border p-3 text-sm", ISSUE_STYLES[issue.severity])}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{issue.message}</div>
                        <Badge variant="outline">{issue.severity}</Badge>
                      </div>
                      <div className="mt-2 font-mono text-[11px] opacity-80">{issue.entityKey}</div>
                      {issue.detail ? <div className="mt-2 text-xs opacity-80">{issue.detail}</div> : null}
                    </div>
                  ))}
                  {reviewedArtifact && reviewedArtifact.issues.length === 0 ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-100">
                      当前选择没有阻断项，也没有需要额外确认的有损项，可以直接生成 XLSX 工作簿。
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
