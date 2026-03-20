import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Files,
  FileCode2,
  FileSpreadsheet,
  RefreshCw,
  Upload,
} from "lucide-react";
import type {
  DdlImportDialect,
  DdlImportIssue,
  DdlImportPreviewResponse,
  DdlImportSourceMode,
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
  onActivateFile?: (fileId: number) => void;
}

const ISSUE_STYLES: Record<DdlImportIssue["severity"], string> = {
  blocking: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200",
  confirm: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200",
};

const SOURCE_OPTIONS: Array<{
  mode: DdlImportSourceMode;
  label: string;
  description: string;
  dialect: DdlImportDialect;
  upload: boolean;
  bundle?: boolean;
}> = [
  {
    mode: "mysql-paste",
    label: "粘贴 SQL",
    description: "主入口，适合直接粘贴 MySQL 建表 DDL。",
    dialect: "mysql",
    upload: false,
  },
  {
    mode: "mysql-file",
    label: "上传 SQL 文件",
    description: "读取单个 MySQL .sql / .ddl 文件。",
    dialect: "mysql",
    upload: true,
  },
  {
    mode: "mysql-bundle",
    label: "上传 SQL 导入包",
    description: "结构导向的多语句导入包，不是任意 SQL 执行器。",
    dialect: "mysql",
    upload: true,
    bundle: true,
  },
  {
    mode: "oracle-paste",
    label: "Oracle 子集粘贴",
    description: "只支持首批可识别子集，不追求完整兼容。",
    dialect: "oracle",
    upload: false,
  },
  {
    mode: "oracle-file",
    label: "Oracle 子集文件",
    description: "上传 Oracle 子集 DDL 文件，继续走同一条审阅/导出链路。",
    dialect: "oracle",
    upload: true,
  },
];

function buildPreviewRequest(args: {
  sourceMode: DdlImportSourceMode;
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
  onActivateFile,
}: DdlImportWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const { data: templates = [] } = useWorkbookTemplates();
  const previewMutation = usePreviewDdlImport();
  const exportMutation = useExportWorkbookFromDdl();

  const [sourceMode, setSourceMode] = useState<DdlImportSourceMode>("mysql-paste");
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
  const sourceConfig = SOURCE_OPTIONS.find((option) => option.mode === sourceMode) ?? SOURCE_OPTIONS[0]!;
  const summary = previewResult?.issueSummary ?? {
    blockingCount: 0,
    confirmCount: 0,
    infoCount: 0,
  };
  const hasBlockingIssues = summary.blockingCount > 0;
  const needsLossyConfirmation = summary.confirmCount > 0;

  const sourcePlaceholder = useMemo(() => {
    if (sourceMode === "oracle-paste") {
      return `CREATE TABLE users (\n  id NUMBER(19) NOT NULL,\n  name VARCHAR2(255) NOT NULL,\n  CONSTRAINT pk_users PRIMARY KEY (id)\n);\nCOMMENT ON TABLE users IS 'user master';`;
    }
    if (sourceMode === "mysql-bundle") {
      return `CREATE TABLE orgs (\n  id BIGINT NOT NULL,\n  PRIMARY KEY (id)\n);\n\nCREATE TABLE users (\n  id BIGINT NOT NULL AUTO_INCREMENT,\n  org_id BIGINT,\n  name VARCHAR(255) NOT NULL,\n  PRIMARY KEY (id),\n  KEY idx_users_org (org_id),\n  CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES orgs(id)\n);`;
    }
    return `CREATE TABLE users (\n  id BIGINT NOT NULL AUTO_INCREMENT,\n  name VARCHAR(255) NOT NULL,\n  PRIMARY KEY (id)\n);`;
  }, [sourceMode]);

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
      setSourceFileName(file.name);
      setSqlText(text);
      setPreviewResult(null);
      setSelectedTableNames(new Set());
    } catch (error) {
      toast({
        title: "DDL 导入",
        description: error instanceof Error ? error.message : "无法读取 SQL 文件。",
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleOpenUploadPicker = (nextMode?: DdlImportSourceMode) => {
    if (nextMode) {
      setSourceMode(nextMode);
    } else if (!sourceConfig.upload) {
      setSourceMode("mysql-file");
    }
    fileInputRef.current?.click();
  };

  const handlePreview = async () => {
    const trimmedSql = sqlText.trim();
    if (!trimmedSql) {
      toast({
        title: "DDL 导入",
        description: "请先提供 SQL 内容，再根据当前来源模式预览导入。",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await previewMutation.mutateAsync(
        buildPreviewRequest({
          sourceMode,
          sqlText: trimmedSql,
          fileName: sourceConfig.upload ? sourceFileName : undefined,
        }),
      );
      setPreviewResult(result);
      toast({
        title: "DDL 导入",
        description: `已按 ${result.dialect.toUpperCase()} ${result.sourceMode} 解析 ${result.catalog.tables.length} 张表。`,
      });
    } catch (error) {
      toast({
        title: "DDL 导入",
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
        title: "DDL 导入",
        description: "请先选择导出的官方模板。",
        variant: "destructive",
      });
      return;
    }

    if (selectedTableNames.size === 0) {
      toast({
        title: "DDL 导入",
        description: "请至少勾选一张已解析的表。",
        variant: "destructive",
      });
      return;
    }

    if (hasBlockingIssues) {
      toast({
        title: "DDL 导入",
        description: "当前仍有阻断项，先处理后才能导出。",
        variant: "destructive",
      });
      return;
    }

    if (needsLossyConfirmation && !allowLossyExport) {
      toast({
        title: "DDL 导入",
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
        title: "DDL 导入",
        description: `已生成 ${result.file.originalName}，并加入文件列表。`,
      });
      onActivateFile?.(result.file.id);
    } catch (error) {
      toast({
        title: "DDL 导入",
        description: error instanceof Error ? error.message : "导出 XLSX 失败。",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="border-b border-border bg-background px-3 py-2">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-foreground">DDL 导入</div>
              <Badge variant="outline">导入</Badge>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">导入、审阅、导出。</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenUploadPicker()}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              上传 .sql / .ddl
            </Button>
            <Button
              size="sm"
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
        <section className="min-h-0 border-r border-border">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">导入来源</h3>
                <p className="text-xs text-muted-foreground">支持粘贴 SQL、上传 SQL 文件和结构导向导入包。</p>
              </div>
              <Badge variant="outline" className="uppercase">
                {sourceConfig.dialect}
              </Badge>
            </div>
            <div className="mt-2 border border-border">
              {SOURCE_OPTIONS.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  className={`w-full border-b border-border px-3 py-2 text-left transition last:border-b-0 ${
                    sourceMode === option.mode
                      ? "bg-primary/10"
                      : "bg-background hover:bg-muted/20"
                  }`}
                  onClick={() => {
                    setSourceMode(option.mode);
                    setPreviewResult(null);
                    setSelectedTableNames(new Set());
                    if (!option.upload) {
                      setSourceFileName(undefined);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{option.label}</span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {option.bundle ? <Files className="h-3.5 w-3.5" /> : null}
                      <span>{option.upload ? "文件" : "粘贴"}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{option.description}</p>
                </button>
              ))}
            </div>
            {sourceFileName ? (
              <div className="mt-2 border border-border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
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
                if (!sourceConfig.upload) {
                  setSourceFileName(undefined);
                }
              }}
              placeholder={sourcePlaceholder}
              className="h-full min-h-[360px] resize-none font-mono text-xs leading-6"
            />
          </div>
        </section>

        <section className="min-h-0 border-r border-border">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">结构审阅</h3>
                <p className="text-xs text-muted-foreground">默认全选所有解析出的表，导出前可以缩小范围。</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                {previewResult ? `${previewResult.catalog.tables.length} 张表 / ${previewResult.dialect.toUpperCase()}` : "等待预览"}
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
                    onClick={() => setSelectedTableNames(new Set(previewResult.selectableTableNames))}
                  >
                    全选
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedTableNames(new Set())}
                  >
                    清空
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    已选 {selectedTableNames.size}/{previewResult.selectableTableNames.length}
                  </span>
                </div>

                {selectableTables.map((table) => (
                  <div key={table.name} className="border border-border bg-background">
                    <div className="flex items-start gap-3 border-b border-border px-3 py-3">
                      <Checkbox
                        checked={selectedTableNames.has(table.name)}
                        onCheckedChange={(checked) => handleToggleTable(table.name, checked === true)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate font-semibold">{table.name}</div>
                          <Badge variant="outline">
                            {table.columns.length} 列
                          </Badge>
                          {table.foreignKeys.length > 0 ? (
                            <Badge variant="outline">
                              FK {table.foreignKeys.length}
                            </Badge>
                          ) : null}
                          {table.indexes.length > 0 ? (
                            <Badge variant="outline">
                              IDX {table.indexes.length}
                            </Badge>
                          ) : null}
                        </div>
                        {table.comment ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{table.comment}</p>
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
                            {!column.nullable ? <Badge variant="secondary">NN</Badge> : null}
                            {column.primaryKey ? <Badge>PK</Badge> : null}
                            {column.autoIncrement ? <Badge variant="outline">AI</Badge> : null}
                            {column.defaultValue ? <Badge variant="outline">DEFAULT</Badge> : null}
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

        <section className="min-h-0 bg-background text-foreground">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">问题与导出</h3>
                <p className="text-xs text-muted-foreground">不受支持项会拦截导出，有损项需要明确确认。</p>
              </div>
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="flex h-[calc(100%-77px)] flex-col">
            <div className="grid grid-cols-3 gap-2 border-b border-border px-3 py-3">
              <div className="border border-red-500/30 bg-red-500/10 p-2 text-center">
                <div className="text-[10px] text-muted-foreground">阻断</div>
                <div className="text-lg font-semibold text-red-700 dark:text-red-200">{summary.blockingCount}</div>
              </div>
              <div className="border border-amber-500/30 bg-amber-500/10 p-2 text-center">
                <div className="text-[10px] text-muted-foreground">确认</div>
                <div className="text-lg font-semibold text-amber-700 dark:text-amber-200">{summary.confirmCount}</div>
              </div>
              <div className="border border-sky-500/30 bg-sky-500/10 p-2 text-center">
                <div className="text-[10px] text-muted-foreground">提示</div>
                <div className="text-lg font-semibold text-sky-700 dark:text-sky-200">{summary.infoCount}</div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-3 px-4 py-4">
                {previewResult?.issues.length ? (
                  previewResult.issues.map((issue) => (
                    <div
                      key={issue.entityKey}
                      className={`border px-3 py-3 text-xs ${ISSUE_STYLES[issue.severity]}`}
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
                  <div className="border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-xs text-emerald-700 dark:text-emerald-100">
                    当前没有检测到阻断项或有损项，可以直接导出官方模板。
                  </div>
                )}
                {previewResult?.dialect === "oracle" ? (
                  <div className="border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                    Oracle 当前按子集规则处理。identity、tablespace/storage、virtual column、partition 等结构会标记为不支持或有损项。
                  </div>
                ) : null}
                {previewResult?.sourceMode === "mysql-bundle" ? (
                  <div className="border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                    SQL 导入包只用于结构导向反向导入，不会把任意 SQL 当作可执行迁移脚本处理。
                  </div>
                ) : null}
              </div>
            </ScrollArea>

            <div className="border-t border-border px-3 py-4">
              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">模板</div>
                  <Select
                    value={selectedTemplateId}
                    onValueChange={(value) => setSelectedTemplateId(value as WorkbookTemplateVariantId)}
                  >
                    <SelectTrigger>
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
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    第一次需要明确选择模板；之后会记住你上次成功导出的选择。
                  </p>
                </div>

                {needsLossyConfirmation ? (
                  <label className="flex items-start gap-2 border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-100">
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
                  <div className="text-[11px] text-red-600 dark:text-red-300">
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
