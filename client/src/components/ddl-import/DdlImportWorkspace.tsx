import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  FileCode2,
  FileSpreadsheet,
  RefreshCw,
  Upload,
} from "lucide-react";
import type {
  DdlImportIssue,
  DdlImportPreviewResponse,
  WorkbookTemplateVariantId,
} from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useExportWorkbookFromDdl,
  usePreviewDdlImport,
  useWorkbookTemplates,
} from "@/hooks/use-ddl";
import { useToast } from "@/hooks/use-toast";

interface DdlImportWorkspaceProps {
  onBack: () => void;
  onActivateFile?: (fileId: number) => void;
}

type SourceMode = "paste" | "upload";

const ISSUE_STYLES: Record<DdlImportIssue["severity"], string> = {
  blocking: "border-red-500/40 bg-red-500/10 text-red-100",
  confirm: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-100",
};

function buildPreviewRequest(args: {
  sourceMode: SourceMode;
  sqlText: string;
  fileName?: string;
}) {
  return {
    sourceMode: args.sourceMode,
    sqlText: args.sqlText,
    fileName: args.fileName,
  } as const;
}

export function DdlImportWorkspace({
  onBack,
  onActivateFile,
}: DdlImportWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const { data: templates = [] } = useWorkbookTemplates();
  const previewMutation = usePreviewDdlImport();
  const exportMutation = useExportWorkbookFromDdl();

  const [sourceMode, setSourceMode] = useState<SourceMode>("paste");
  const [sqlText, setSqlText] = useState("");
  const [sourceFileName, setSourceFileName] = useState<string | undefined>(undefined);
  const [previewResult, setPreviewResult] = useState<DdlImportPreviewResponse | null>(null);
  const [selectedTableNames, setSelectedTableNames] = useState<Set<string>>(new Set());
  const [selectedTemplateId, setSelectedTemplateId] = useState<WorkbookTemplateVariantId | "">("");
  const [allowLossyExport, setAllowLossyExport] = useState(false);

  const selectedTableNameList = useMemo(
    () => Array.from(selectedTableNames),
    [selectedTableNames],
  );

  const selectableTables = previewResult?.catalog.tables ?? [];
  const summary = previewResult?.issueSummary ?? {
    blockingCount: 0,
    confirmCount: 0,
    infoCount: 0,
  };
  const hasBlockingIssues = summary.blockingCount > 0;
  const needsLossyConfirmation = summary.confirmCount > 0;

  useEffect(() => {
    if (!previewResult) {
      return;
    }

    setSelectedTableNames(new Set(previewResult.selectableTableNames));
    setAllowLossyExport(false);
    setSelectedTemplateId((previous) => {
      if (previous) {
        return previous;
      }
      return previewResult.rememberedTemplateId ?? "";
    });
  }, [previewResult]);

  const handleUploadSource = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      setSourceMode("upload");
      setSourceFileName(file.name);
      setSqlText(text);
      setPreviewResult(null);
      setSelectedTableNames(new Set());
    } catch (error) {
      toast({
        title: "DDL Import",
        description: error instanceof Error ? error.message : "无法读取 SQL 文件。",
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };

  const handlePreview = async () => {
    const trimmedSql = sqlText.trim();
    if (!trimmedSql) {
      toast({
        title: "DDL Import",
        description: "请先粘贴 MySQL DDL，或者上传一个 .sql / .ddl 文件。",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await previewMutation.mutateAsync(
        buildPreviewRequest({
          sourceMode,
          sqlText: trimmedSql,
          fileName: sourceMode === "upload" ? sourceFileName : undefined,
        }),
      );
      setPreviewResult(result);
      toast({
        title: "DDL Import",
        description: `已解析 ${result.catalog.tables.length} 张表，右侧可以审阅风险并导出 XLSX。`,
      });
    } catch (error) {
      toast({
        title: "DDL Import",
        description: error instanceof Error ? error.message : "DDL 预览失败。",
        variant: "destructive",
      });
    }
  };

  const handleToggleTable = (tableName: string, nextChecked: boolean) => {
    setSelectedTableNames((previous) => {
      const next = new Set(previous);
      if (nextChecked) {
        next.add(tableName);
      } else {
        next.delete(tableName);
      }
      return next;
    });
  };

  const handleExport = async () => {
    if (!previewResult) {
      return;
    }

    if (!selectedTemplateId) {
      toast({
        title: "DDL Import",
        description: "请先选择导出的官方模板。",
        variant: "destructive",
      });
      return;
    }

    if (selectedTableNames.size === 0) {
      toast({
        title: "DDL Import",
        description: "请至少勾选一张已解析的表。",
        variant: "destructive",
      });
      return;
    }

    if (hasBlockingIssues) {
      toast({
        title: "DDL Import",
        description: "当前仍有阻断项，先处理后才能导出。",
        variant: "destructive",
      });
      return;
    }

    if (needsLossyConfirmation && !allowLossyExport) {
      toast({
        title: "DDL Import",
        description: "当前存在有损导出项，请先确认后再继续。",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await exportMutation.mutateAsync({
        sourceMode,
        sqlText: previewResult.sourceSql,
        fileName: previewResult.fileName,
        templateId: selectedTemplateId,
        selectedTableNames: selectedTableNameList,
        allowLossyExport,
      });

      toast({
        title: "DDL Import",
        description: `已生成 ${result.file.originalName}，并加入文件列表。`,
      });
      onActivateFile?.(result.file.id);
      onBack();
    } catch (error) {
      toast({
        title: "DDL Import",
        description: error instanceof Error ? error.message : "导出 XLSX 失败。",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="border-b border-border/60 bg-background/95 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 px-2" onClick={onBack}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                返回
              </Button>
              <Badge variant="outline" className="h-6 px-2 text-[10px] uppercase">
                Phase 3
              </Badge>
            </div>
            <h2 className="mt-2 text-base font-semibold">DDL Import to XLSX</h2>
            <p className="text-xs text-muted-foreground">
              左侧输入 MySQL DDL，中间审阅 canonical 结构，右侧确认有损/阻断项后导出官方模板。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              上传 .sql / .ddl
            </Button>
            <Button
              size="sm"
              className="h-8"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
            >
              {previewMutation.isPending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileCode2 className="mr-1.5 h-3.5 w-3.5" />}
              预览解析
            </Button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".sql,.ddl,.txt"
        className="hidden"
        onChange={handleUploadSource}
      />

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1.1fr_1fr_0.9fr]">
        <section className="min-h-0 border-r border-border/60">
          <div className="border-b border-border/60 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Source SQL</h3>
                <p className="text-xs text-muted-foreground">粘贴是主入口，上传文件是辅助入口。</p>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-border/70 bg-muted/20 p-1">
                <Button
                  variant={sourceMode === "paste" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setSourceMode("paste")}
                >
                  粘贴
                </Button>
                <Button
                  variant={sourceMode === "upload" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => fileInputRef.current?.click()}
                >
                  上传
                </Button>
              </div>
            </div>
            {sourceFileName ? (
              <div className="mt-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
                当前文件: {sourceFileName}
              </div>
            ) : null}
          </div>
          <div className="h-[calc(100%-77px)] p-4">
            <Textarea
              data-testid="ddl-import-sql-input"
              value={sqlText}
              onChange={(event) => {
                setSqlText(event.target.value);
                if (sourceMode === "paste") {
                  setSourceFileName(undefined);
                }
              }}
              placeholder={`CREATE TABLE users (\n  id BIGINT NOT NULL AUTO_INCREMENT,\n  name VARCHAR(255) NOT NULL,\n  PRIMARY KEY (id)\n);`}
              className="h-full min-h-[360px] resize-none font-mono text-xs leading-6"
            />
          </div>
        </section>

        <section className="min-h-0 border-r border-border/60">
          <div className="border-b border-border/60 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Canonical Review</h3>
                <p className="text-xs text-muted-foreground">默认全选所有解析出的表，导出前可以缩小范围。</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                {previewResult ? `${previewResult.catalog.tables.length} tables` : "等待预览"}
              </div>
            </div>
          </div>
          <ScrollArea className="h-[calc(100%-77px)]">
            {!previewResult ? (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 text-center text-muted-foreground">
                <Database className="mb-4 h-10 w-10 opacity-30" />
                <p className="text-sm">先预览解析，再在这里审阅表结构。</p>
              </div>
            ) : (
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => setSelectedTableNames(new Set(previewResult.selectableTableNames))}
                  >
                    全选
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => setSelectedTableNames(new Set())}
                  >
                    清空
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    已选 {selectedTableNames.size}/{previewResult.selectableTableNames.length}
                  </span>
                </div>

                {selectableTables.map((table) => (
                  <div key={table.name} className="rounded-xl border border-border/70 bg-background">
                    <div className="flex items-start gap-3 border-b border-border/60 px-3 py-3">
                      <Checkbox
                        checked={selectedTableNames.has(table.name)}
                        onCheckedChange={(checked) => handleToggleTable(table.name, checked === true)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate font-semibold">{table.name}</div>
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                            {table.columns.length} cols
                          </Badge>
                          {table.foreignKeys.length > 0 ? (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              FK {table.foreignKeys.length}
                            </Badge>
                          ) : null}
                          {table.indexes.length > 0 ? (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              IDX {table.indexes.length}
                            </Badge>
                          ) : null}
                        </div>
                        {table.comment ? (
                          <p className="mt-1 text-xs text-muted-foreground">{table.comment}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="divide-y divide-border/50">
                      {table.columns.map((column) => (
                        <div key={`${table.name}:${column.name}`} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{column.name}</span>
                              <span className="font-mono text-muted-foreground">
                                {column.columnType}
                                {column.dataTypeArgs ? ` (${column.dataTypeArgs})` : ""}
                              </span>
                            </div>
                            {column.comment ? (
                              <div className="mt-1 text-muted-foreground">{column.comment}</div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {!column.nullable ? <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">NN</Badge> : null}
                            {column.primaryKey ? <Badge className="h-5 px-1.5 text-[10px]">PK</Badge> : null}
                            {column.autoIncrement ? <Badge variant="outline" className="h-5 px-1.5 text-[10px]">AI</Badge> : null}
                            {column.defaultValue ? <Badge variant="outline" className="h-5 px-1.5 text-[10px]">DEFAULT</Badge> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </section>

        <section className="min-h-0 bg-slate-950/95 text-slate-100">
          <div className="border-b border-slate-800/80 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Warnings + Export</h3>
                <p className="text-xs text-slate-400">阻断项会直接拦截导出，有损项需要明确确认。</p>
              </div>
              <FileSpreadsheet className="h-4 w-4 text-slate-400" />
            </div>
          </div>
          <div className="flex h-[calc(100%-77px)] flex-col">
            <div className="grid grid-cols-3 gap-2 border-b border-slate-800/80 px-4 py-3">
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-center">
                <div className="text-[10px] text-slate-300">Blocking</div>
                <div className="text-lg font-semibold text-red-200">{summary.blockingCount}</div>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-center">
                <div className="text-[10px] text-slate-300">Confirm</div>
                <div className="text-lg font-semibold text-amber-200">{summary.confirmCount}</div>
              </div>
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2 text-center">
                <div className="text-[10px] text-slate-300">Info</div>
                <div className="text-lg font-semibold text-sky-200">{summary.infoCount}</div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-3 px-4 py-4">
                {previewResult?.issues.length ? (
                  previewResult.issues.map((issue) => (
                    <div
                      key={issue.entityKey}
                      className={`rounded-xl border px-3 py-3 text-xs ${ISSUE_STYLES[issue.severity]}`}
                    >
                      <div className="flex items-start gap-2">
                        {issue.severity === "blocking" ? (
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold">{issue.message}</div>
                          <div className="mt-1 text-[11px] opacity-80">
                            {issue.tableName ? `${issue.tableName}` : issue.entityKey}
                            {issue.columnName ? ` / ${issue.columnName}` : ""}
                            {issue.constraintName ? ` / ${issue.constraintName}` : ""}
                          </div>
                          {issue.detail ? (
                            <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] opacity-80">
                              {issue.detail}
                            </pre>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-xs text-emerald-100">
                    当前没有检测到阻断项或有损项，可以直接导出官方模板。
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t border-slate-800/80 px-4 py-4">
              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-400">Template</div>
                  <Select
                    value={selectedTemplateId}
                    onValueChange={(value) => setSelectedTemplateId(value as WorkbookTemplateVariantId)}
                  >
                    <SelectTrigger className="border-slate-700 bg-slate-900 text-slate-100">
                      <SelectValue placeholder="选择官方模板" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-slate-400">
                    第一次需要明确选择模板；之后会记住你上次成功导出的选择。
                  </p>
                </div>

                {needsLossyConfirmation ? (
                  <label className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    <Checkbox
                      checked={allowLossyExport}
                      onCheckedChange={(checked) => setAllowLossyExport(checked === true)}
                    />
                    <span>我了解这次导出存在有损项，仍然继续生成官方模板。</span>
                  </label>
                ) : null}

                <Button
                  data-testid="button-export-ddl-workbook"
                  className="w-full"
                  onClick={handleExport}
                  disabled={
                    exportMutation.isPending ||
                    !previewResult ||
                    selectedTableNames.size === 0 ||
                    !selectedTemplateId ||
                    hasBlockingIssues ||
                    (needsLossyConfirmation && !allowLossyExport)
                  }
                >
                  {exportMutation.isPending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />}
                  导出 XLSX 并加入文件列表
                </Button>

                {hasBlockingIssues ? (
                  <div className="text-[11px] text-red-300">
                    当前还有阻断项，所以导出按钮会保持禁用。
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
