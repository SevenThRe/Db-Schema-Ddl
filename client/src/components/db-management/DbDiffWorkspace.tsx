import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, CheckCheck, FileCode2, Loader2, Sparkles, TableProperties } from "lucide-react";
import { useTableInfo } from "@/hooks/use-ddl";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDbRenames, useDbDryRun, usePreviewDbDiff, usePreviewDbSql } from "@/hooks/use-db-management";
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
  DbDiffColumnChange,
  DbDiffPreviewRequest,
  DbDiffPreviewResponse,
  DbDryRunResponse,
  DbDiffTableChange,
  DbRenameDecision,
  DbRenameDecisionItem,
  DbSqlPreviewResponse,
  DbSqlPreviewStatement,
} from "@shared/schema";

interface DbDiffWorkspaceProps {
  selectedConnection: DbConnectionSummary | null;
  selectedFileId: number | null;
  selectedFileName?: string | null;
  selectedSheet: string | null;
  onStateChange?: (state: DbDiffWorkspaceStateSnapshot) => void;
}

export interface DbDiffWorkspaceStateSnapshot {
  compareResult: DbDiffPreviewResponse | null;
  lastCompareInput: DbDiffPreviewRequest | null;
  renameDecisions: Record<string, DbRenameDecision>;
  sqlPreviewResult: DbSqlPreviewResponse | null;
  dryRunResult: DbDryRunResponse | null;
}

type TreeFilter = "all" | "blocking" | "pending";

const ACTION_LABELS: Record<DbDiffTableChange["action"], string> = {
  added: "新增",
  removed: "DB 多出",
  modified: "已修改",
  rename_suggest: "待确认 rename",
  renamed: "已确认 rename",
};

const COLUMN_ACTION_LABELS: Record<DbDiffColumnChange["action"], string> = {
  added: "新增字段",
  removed: "待移除字段",
  modified: "字段变更",
  rename_suggest: "字段 rename 建议",
  renamed: "字段 rename 已确认",
};

const BLOCKER_LABELS = {
  drop_table: "DROP TABLE",
  drop_column: "DROP COLUMN",
  type_shrink: "类型收缩",
  rename_unconfirmed: "rename 未确认",
  not_null_without_fill: "NULL -> NOT NULL",
} as const;

function tableLabel(change: DbDiffTableChange): string {
  return change.fileTable?.physicalTableName || change.dbTable?.name || change.fileTable?.logicalTableName || "unknown_table";
}

function columnLabel(change: DbDiffColumnChange): string {
  return change.fileColumn?.physicalName || change.dbColumn?.name || change.fileColumn?.logicalName || "unknown_column";
}

function hasBlockingItems(change: DbDiffTableChange): boolean {
  return change.blockers.length > 0 || change.columnChanges.some((column) => column.blockers.length > 0);
}

function filterTableChanges(tableChanges: DbDiffTableChange[], treeFilter: TreeFilter): DbDiffTableChange[] {
  if (treeFilter === "blocking") return tableChanges.filter(hasBlockingItems);
  if (treeFilter === "pending") {
    return tableChanges.filter((change) => change.requiresConfirmation || change.columnChanges.some((column) => column.requiresConfirmation));
  }
  return tableChanges;
}

function findSelectedItem(result: DbDiffPreviewResponse | null, entityKey: string | null) {
  if (!result || !entityKey) return null;
  for (const tableChange of result.tableChanges) {
    if (tableChange.entityKey === entityKey) return { type: "table" as const, tableChange };
    for (const columnChange of tableChange.columnChanges) {
      if (columnChange.entityKey === entityKey) return { type: "column" as const, tableChange, columnChange };
    }
  }
  return null;
}

function statementMatchesSelection(statement: DbSqlPreviewStatement, entityKey: string | null): boolean {
  return Boolean(entityKey && statement.relatedEntityKeys.includes(entityKey));
}

export function DbDiffWorkspace({ selectedConnection, selectedFileId, selectedFileName, selectedSheet, onStateChange }: DbDiffWorkspaceProps) {
  const { toast } = useToast();
  const { data: fileTablesRaw, isLoading: isTablesLoading } = useTableInfo(selectedFileId, selectedSheet);
  const previewDiff = usePreviewDbDiff();
  const confirmRenames = useConfirmDbRenames();
  const previewSql = usePreviewDbSql();
  const dryRun = useDbDryRun();
  const fileTables = fileTablesRaw ?? [];

  const [scope, setScope] = useState<"sheet" | "table">("sheet");
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null);
  const [refreshLiveSchema, setRefreshLiveSchema] = useState(false);
  const [compareResult, setCompareResult] = useState<DbDiffPreviewResponse | null>(null);
  const [selectedEntityKey, setSelectedEntityKey] = useState<string | null>(null);
  const [treeFilter, setTreeFilter] = useState<TreeFilter>("all");
  const [lastCompareInput, setLastCompareInput] = useState<DbDiffPreviewRequest | null>(null);
  const [renameDecisions, setRenameDecisions] = useState<Record<string, DbRenameDecision>>({});
  const [sqlPreviewResult, setSqlPreviewResult] = useState<Awaited<ReturnType<typeof previewSql.mutateAsync>> | null>(null);
  const [dryRunResult, setDryRunResult] = useState<Awaited<ReturnType<typeof dryRun.mutateAsync>> | null>(null);

  const tableOptions = useMemo(
    () => fileTables.map((table) => ({ value: table.physicalTableName || table.logicalTableName, label: table.physicalTableName || table.logicalTableName })),
    [fileTables],
  );

  useEffect(() => {
    if (!tableOptions.length) {
      setSelectedTableName(null);
      return;
    }
    if (!selectedTableName || !tableOptions.some((table) => table.value === selectedTableName)) {
      setSelectedTableName(tableOptions[0]?.value ?? null);
    }
  }, [selectedTableName, tableOptions]);

  useEffect(() => {
    setCompareResult(null);
    setSqlPreviewResult(null);
    setDryRunResult(null);
    setSelectedEntityKey(null);
    setRenameDecisions({});
    setLastCompareInput(null);
  }, [selectedConnection?.id, selectedFileId, selectedSheet]);

  useEffect(() => {
    if (!compareResult) return;
    setRenameDecisions(Object.fromEntries(compareResult.renameSuggestions.map((suggestion) => [suggestion.entityKey, suggestion.decision])));
    const fallbackKey = compareResult.tableChanges[0]?.entityKey ?? compareResult.tableChanges[0]?.columnChanges[0]?.entityKey ?? null;
    setSelectedEntityKey((current) => (current && findSelectedItem(compareResult, current) ? current : fallbackKey));
  }, [compareResult]);

  useEffect(() => {
    onStateChange?.({
      compareResult,
      lastCompareInput,
      renameDecisions,
      sqlPreviewResult,
      dryRunResult,
    });
  }, [compareResult, dryRunResult, lastCompareInput, onStateChange, renameDecisions, sqlPreviewResult]);

  const pendingRenameSuggestions =
    compareResult?.renameSuggestions.filter((suggestion) => (renameDecisions[suggestion.entityKey] ?? suggestion.decision) === "pending") ?? [];
  const filteredTableChanges = useMemo(() => filterTableChanges(compareResult?.tableChanges ?? [], treeFilter), [compareResult?.tableChanges, treeFilter]);
  const selectedItem = useMemo(() => findSelectedItem(compareResult, selectedEntityKey), [compareResult, selectedEntityKey]);

  const runCompare = async () => {
    if (!selectedConnection?.lastSelectedDatabase || !selectedFileId || !selectedSheet) {
      toast({ title: "DB Diff", description: "请先选好 connection、database、文件和 sheet。", variant: "destructive" });
      return;
    }
    if (scope === "table" && !selectedTableName) {
      toast({ title: "DB Diff", description: "表级比较需要先选择一张表。", variant: "destructive" });
      return;
    }
    const compareInput: DbDiffPreviewRequest = {
      fileId: selectedFileId,
      sheetName: selectedSheet,
      scope,
      tableName: scope === "table" ? selectedTableName ?? undefined : undefined,
      databaseName: selectedConnection.lastSelectedDatabase,
      refreshLiveSchema,
    };
    try {
      const result = await previewDiff.mutateAsync({ connectionId: selectedConnection.id, input: compareInput });
      setLastCompareInput(compareInput);
      setCompareResult(result);
      setSqlPreviewResult(null);
      setDryRunResult(null);
    } catch (error) {
      toast({ title: "DB Diff", description: error instanceof Error ? error.message : "比较失败。", variant: "destructive" });
    }
  };

  const applyRenames = async () => {
    if (!selectedConnection || !lastCompareInput || !compareResult) return;
    const decisions: DbRenameDecisionItem[] = compareResult.renameSuggestions
      .map((suggestion) => ({
        entityKey: suggestion.entityKey,
        entityType: suggestion.entityType,
        decision: renameDecisions[suggestion.entityKey] ?? suggestion.decision,
      }))
      .filter((decision): decision is DbRenameDecisionItem => decision.decision === "accept" || decision.decision === "reject");
    try {
      const result = await confirmRenames.mutateAsync({ connectionId: selectedConnection.id, input: { compare: lastCompareInput, decisions } });
      setCompareResult(result);
      setSqlPreviewResult(null);
      setDryRunResult(null);
    } catch (error) {
      toast({ title: "Rename Review", description: error instanceof Error ? error.message : "应用 rename 决策失败。", variant: "destructive" });
    }
  };

  const generatePreview = async () => {
    if (!selectedConnection || !lastCompareInput || !compareResult) return;
    const decisions: DbRenameDecisionItem[] = compareResult.renameSuggestions
      .map((suggestion) => ({
        entityKey: suggestion.entityKey,
        entityType: suggestion.entityType,
        decision: renameDecisions[suggestion.entityKey] ?? suggestion.decision,
      }))
      .filter((decision): decision is DbRenameDecisionItem => decision.decision === "accept" || decision.decision === "reject");
    try {
      const [previewResult, dryRunSummary] = await Promise.all([
        previewSql.mutateAsync({ connectionId: selectedConnection.id, input: { compare: lastCompareInput, decisions, dialect: "mysql" } }),
        dryRun.mutateAsync({ connectionId: selectedConnection.id, input: { compare: lastCompareInput, decisions, dialect: "mysql" } }),
      ]);
      setSqlPreviewResult(previewResult);
      setDryRunResult(dryRunSummary);
      setCompareResult(previewResult.compareResult);
    } catch (error) {
      toast({ title: "SQL Preview", description: error instanceof Error ? error.message : "生成 SQL preview 失败。", variant: "destructive" });
    }
  };

  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">File vs Live DB Diff</CardTitle>
            <CardDescription>在 `DB 管理` 里完成 sheet/table compare、rename review 和 SQL preview。</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{selectedConnection?.name ?? "未选连接"}</Badge>
            <Badge variant="outline">{selectedConnection?.lastSelectedDatabase ?? "未选 database"}</Badge>
            <Badge variant="outline">{selectedFileName ?? "未选文件"}</Badge>
            <Badge variant="outline">{selectedSheet ?? "未选 sheet"}</Badge>
          </div>
        </div>
        <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/25 p-4 xl:grid-cols-[1fr_1fr_auto_auto]">
          <Select value={scope} onValueChange={(value: "sheet" | "table") => setScope(value)}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sheet">Sheet 级比较</SelectItem>
              <SelectItem value="table">Table 级比较</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedTableName ?? ""} onValueChange={setSelectedTableName} disabled={scope !== "table" || tableOptions.length === 0}>
            <SelectTrigger className="bg-background"><SelectValue placeholder={isTablesLoading ? "加载表中..." : "选择一张表"} /></SelectTrigger>
            <SelectContent>
              {tableOptions.map((table) => (
                <SelectItem key={table.value} value={table.value}>{table.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 bg-background px-3">
            <Checkbox checked={refreshLiveSchema} onCheckedChange={(checked) => setRefreshLiveSchema(checked === true)} />
            <span className="text-sm text-muted-foreground">刷新 live schema</span>
          </div>
          <Button onClick={runCompare} disabled={previewDiff.isPending || isTablesLoading}>
            {previewDiff.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-2 h-4 w-4" />}
            开始比较
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {compareResult ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">表新增 {compareResult.summary.addedTables}</Badge>
            <Badge variant="secondary">表修改 {compareResult.summary.changedTables}</Badge>
            <Badge variant="secondary">字段修改 {compareResult.summary.changedColumns}</Badge>
            <Badge variant={compareResult.summary.blockingCount > 0 ? "destructive" : "outline"}>阻断 {compareResult.summary.blockingCount}</Badge>
            <Badge variant={compareResult.summary.pendingRenameConfirmations > 0 ? "destructive" : "outline"}>待确认 rename {compareResult.summary.pendingRenameConfirmations}</Badge>
          </div>
        ) : null}
        <div className="grid min-h-[540px] gap-4 xl:grid-cols-[1fr_1.15fr_1.15fr]">
          <Card className="min-h-0 border-border/70">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div><CardTitle className="text-sm">对象树</CardTitle><CardDescription>sheet 级进入，再钻到 table / column。</CardDescription></div>
                <TableProperties className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex gap-2">
                {(["all", "blocking", "pending"] as const).map((value) => (
                  <Button key={value} variant={treeFilter === value ? "default" : "outline"} size="sm" onClick={() => setTreeFilter(value)}>
                    {value === "all" ? "全部" : value === "blocking" ? "只看阻断" : "只看待确认"}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="min-h-0">
              <ScrollArea className="h-[430px] pr-3">
                {!compareResult ? <div className="text-sm text-muted-foreground">先运行 compare。</div> : filteredTableChanges.map((tableChange) => (
                  <div key={tableChange.entityKey} className="mb-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
                    <button type="button" className={cn("w-full rounded-xl border px-3 py-3 text-left", selectedEntityKey === tableChange.entityKey ? "border-primary/70 bg-primary/10" : "border-border/60 bg-background")} onClick={() => setSelectedEntityKey(tableChange.entityKey)}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">{tableLabel(tableChange)}</div>
                        <Badge variant={hasBlockingItems(tableChange) ? "destructive" : "outline"}>{ACTION_LABELS[tableChange.action]}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">字段变更 {tableChange.columnChanges.length}</div>
                    </button>
                    <div className="mt-2 space-y-2">
                      {tableChange.columnChanges.map((columnChange) => (
                        <button key={columnChange.entityKey} type="button" className={cn("flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs", selectedEntityKey === columnChange.entityKey ? "border-primary/60 bg-primary/10" : "border-border/60 bg-background")} onClick={() => setSelectedEntityKey(columnChange.entityKey)}>
                          <span className="truncate font-medium">{columnLabel(columnChange)}</span>
                          <Badge variant={columnChange.blockers.length > 0 ? "destructive" : "outline"}>{COLUMN_ACTION_LABELS[columnChange.action]}</Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
          <Card className="min-h-0 border-border/70">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div><CardTitle className="text-sm">差异详情</CardTitle><CardDescription>默认先集中确认 rename，也能单条细看。</CardDescription></div>
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="min-h-0 space-y-4">
              {compareResult && compareResult.renameSuggestions.length > 0 ? (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Rename 集中确认</div>
                      <div className="text-xs text-muted-foreground">高置信建议先在这里确认，再进入 SQL preview。</div>
                    </div>
                    <Button size="sm" onClick={applyRenames} disabled={confirmRenames.isPending || !lastCompareInput}>
                      {confirmRenames.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
                      应用 rename 决策
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {compareResult.renameSuggestions.map((suggestion) => (
                      <div key={suggestion.entityKey} className="rounded-xl border border-border/60 bg-background/80 p-3">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div className="text-sm">
                            {suggestion.entityType === "table"
                              ? `${suggestion.tableNameBefore} -> ${suggestion.tableNameAfter}`
                              : `${suggestion.tableNameBefore}.${suggestion.columnNameBefore} -> ${suggestion.tableNameAfter}.${suggestion.columnNameAfter}`}
                          </div>
                          <Select value={renameDecisions[suggestion.entityKey] ?? suggestion.decision} onValueChange={(value: DbRenameDecision) => setRenameDecisions((current) => ({ ...current, [suggestion.entityKey]: value }))}>
                            <SelectTrigger className="w-full bg-background xl:w-[180px]"><SelectValue /></SelectTrigger>
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
              <ScrollArea className="h-[380px] pr-3">
                {!compareResult ? <div className="text-sm text-muted-foreground">这里会显示表级摘要、字段级 diff 和单条对象细节。</div> : !selectedItem ? <div className="text-sm text-muted-foreground">从左侧对象树选择一项来查看细节。</div> : (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border/70 bg-background p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold">{selectedItem.type === "table" ? tableLabel(selectedItem.tableChange) : columnLabel(selectedItem.columnChange)}</div>
                          <div className="text-sm text-muted-foreground">{selectedItem.type === "table" ? "Table 级差异" : `所属表: ${tableLabel(selectedItem.tableChange)}`}</div>
                        </div>
                        <Badge variant={(selectedItem.type === "table" ? selectedItem.tableChange.blockers.length : selectedItem.columnChange.blockers.length) > 0 ? "destructive" : "outline"}>
                          {selectedItem.type === "table" ? ACTION_LABELS[selectedItem.tableChange.action] : COLUMN_ACTION_LABELS[selectedItem.columnChange.action]}
                        </Badge>
                      </div>
                      <Separator className="my-4" />
                      <div className="flex flex-wrap gap-2">
                        {(selectedItem.type === "table" ? selectedItem.tableChange.changedFields : selectedItem.columnChange.changedFields).map((field) => (
                          <Badge key={field} variant="secondary">{field}</Badge>
                        ))}
                      </div>
                      <div className="mt-4 space-y-2">
                        {(selectedItem.type === "table" ? selectedItem.tableChange.blockers : selectedItem.columnChange.blockers).map((blocker) => (
                          <div key={`${blocker.entityKey}:${blocker.code}`} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                            {BLOCKER_LABELS[blocker.code]}: {blocker.message}
                          </div>
                        ))}
                      </div>
                    </div>
                    {selectedItem.type === "table" ? (
                      <div className="space-y-2">
                        {selectedItem.tableChange.columnChanges.map((columnChange) => (
                          <button key={columnChange.entityKey} type="button" className="w-full rounded-xl border border-border/60 bg-background px-3 py-3 text-left hover:border-primary/40" onClick={() => setSelectedEntityKey(columnChange.entityKey)}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">{columnLabel(columnChange)}</span>
                              <Badge variant={columnChange.blockers.length > 0 ? "destructive" : "outline"}>{COLUMN_ACTION_LABELS[columnChange.action]}</Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
          <Card className="min-h-0 border-border/70">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div><CardTitle className="text-sm">SQL Preview / Dry Run</CardTitle><CardDescription>选中对象后，右侧高亮关联 SQL。</CardDescription></div>
                <FileCode2 className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="min-h-0 space-y-4">
              {compareResult?.blockers.length ? (
                <div className="rounded-2xl border border-red-500/35 bg-red-500/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-200"><AlertTriangle className="h-4 w-4" />当前 compare 仍有阻断项</div>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="text-sm text-muted-foreground">没有未确认 rename 且没有阻断项时，才会生成 preview。</div>
                <Button onClick={generatePreview} disabled={!compareResult || !lastCompareInput || pendingRenameSuggestions.length > 0 || compareResult.blockers.length > 0 || previewSql.isPending || dryRun.isPending}>
                  {previewSql.isPending || dryRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCode2 className="mr-2 h-4 w-4" />}
                  生成 SQL Preview
                </Button>
              </div>
              {dryRunResult ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">statement {dryRunResult.summary.statementCount}</Badge>
                  <Badge variant="secondary">executable {dryRunResult.summary.executableStatementCount}</Badge>
                  <Badge variant={dryRunResult.summary.blockingCount > 0 ? "destructive" : "outline"}>blockers {dryRunResult.summary.blockingCount}</Badge>
                </div>
              ) : null}
              <ScrollArea className="h-[390px] pr-3">
                {!compareResult ? <div className="text-sm text-muted-foreground">先完成 compare。</div> : !sqlPreviewResult ? <div className="text-sm text-muted-foreground">compare 完成后点击“生成 SQL Preview”。</div> : sqlPreviewResult.artifacts.length === 0 ? <div className="text-sm text-muted-foreground">当前没有可生成的 SQL 片段。</div> : (
                  <div className="space-y-4">
                    {sqlPreviewResult.artifacts.map((artifact) => (
                      <div key={artifact.artifactName} className="rounded-2xl border border-border/70 bg-background p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">{artifact.artifactName}</div>
                          <Badge variant="outline">{artifact.statements.length} statements</Badge>
                        </div>
                        <div className="space-y-3">
                          {artifact.statements.map((statement) => (
                            <div key={statement.id} className={cn("rounded-xl border p-3", statementMatchesSelection(statement, selectedEntityKey) ? "border-primary/60 bg-primary/10" : "border-border/60 bg-muted/15")}>
                              <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{statement.kind}</div>
                              <pre className="overflow-x-auto rounded-lg bg-black/[0.92] p-3 font-mono text-[11px] leading-relaxed text-slate-200">{statement.sql}</pre>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
