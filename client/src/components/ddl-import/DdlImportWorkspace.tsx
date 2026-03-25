// DdlImportWorkspace — DDL インポートワークスペース
//
// タブ構成:
//   Tab 1: "导出到 Excel" — 既存の DDL→Excel エクスポートフロー（変更なし）
//   Tab 2: "导入到数据库" — 新規 live-DB 実行タブ（接続選択→SQL 分割→per-stmt 実行）

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Files,
  FileCode2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  SkipForward,
  Upload,
  XCircle,
} from "lucide-react";
import type {
  DdlImportDialect,
  DdlImportIssue,
  DdlImportPreviewResponse,
  DdlImportSourceMode,
  WorkbookTemplateVariantId,
  DangerousSqlPreview,
  DbConnectionConfig,
} from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useExportWorkbookFromDdl,
  usePreviewDdlImport,
  useWorkbookTemplates,
} from "@/hooks/use-ddl";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useStatusBarScope } from "@/status-bar/context";
import { DangerousSqlDialog } from "@/components/extensions/db-workbench/DangerousSqlDialog";
import { useHostApi } from "@/extensions/host-context";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

interface DdlImportWorkspaceProps {
  onActivateFile?: (fileId: number) => void;
}

/** ライブ実行タブ — ステートメント単位の実行状態 */
interface LiveStatement {
  index: number;
  sql: string;
  lineNumber: number;
  /** 実行ステータス */
  status: "pending" | "running" | "success" | "error" | "skipped";
  error?: string;
  elapsedMs?: number;
}

// ──────────────────────────────────────────────
// 定数
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
// ユーティリティ
// ──────────────────────────────────────────────

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

/**
 * SQL テキストをセミコロンで分割してステートメント配列に変換する
 * コメント行と空行はスキップし、開始行番号を保持する
 */
function splitSqlStatements(sql: string): Array<{ sql: string; lineNumber: number }> {
  const statements: Array<{ sql: string; lineNumber: number }> = [];
  let current = "";
  let lineNum = 1;
  let stmtStartLine = 1;

  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    // コメント行・空行をスキップ（現在のステートメントが空の場合は開始行をずらす）
    if (trimmed.startsWith("--") || trimmed === "") {
      lineNum++;
      if (!current.trim()) stmtStartLine = lineNum;
      continue;
    }
    current += line + "\n";
    // セミコロンでステートメント終端を判定
    if (trimmed.endsWith(";")) {
      const stmt = current.trim().replace(/;$/, "").trim();
      if (stmt) statements.push({ sql: stmt, lineNumber: stmtStartLine });
      current = "";
      stmtStartLine = lineNum + 1;
    }
    lineNum++;
  }
  // 末尾にセミコロンなしのステートメントが残っている場合
  const remaining = current.trim().replace(/;$/, "").trim();
  if (remaining) statements.push({ sql: remaining, lineNumber: stmtStartLine });
  return statements;
}

// ──────────────────────────────────────────────
// コンポーネント
// ──────────────────────────────────────────────

export function DdlImportWorkspace({
  onActivateFile,
}: DdlImportWorkspaceProps) {
  // ── 既存 Export タブの状態 ──────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();
  const statusBar = useStatusBarScope("app:ddl-import");
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

  // ── ライブ Import タブの状態 ────────────────
  const hostApi = useHostApi();
  const [activeTab, setActiveTab] = useState<string>("export");
  const [connections, setConnections] = useState<DbConnectionConfig[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [liveStatements, setLiveStatements] = useState<LiveStatement[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [dangerPreview, setDangerPreview] = useState<DangerousSqlPreview | null>(null);
  const [dangerDialogOpen, setDangerDialogOpen] = useState(false);

  // Promise ベースの危険 SQL ダイアログ確認を橋渡しする ref
  const dangerResolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  // ライブファイルピッカーの hidden input ref
  const liveFileInputRef = useRef<HTMLInputElement>(null);

  // ──────────────────────────────────────────────
  // 派生状態
  // ──────────────────────────────────────────────

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

  // ──────────────────────────────────────────────
  // エフェクト
  // ──────────────────────────────────────────────

  useEffect(() => () => {
    statusBar.clearAll();
  }, [statusBar]);

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

  // Import タブに切り替えたときに接続リストを取得する
  useEffect(() => {
    if (activeTab === "import") {
      hostApi.connections.list().then(setConnections).catch(() => setConnections([]));
    }
  }, [activeTab, hostApi.connections]);

  // ──────────────────────────────────────────────
  // Export タブ ハンドラ
  // ──────────────────────────────────────────────

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
        title: t("dashboard.ddlImport"),
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
        title: t("dashboard.ddlImport"),
        description: "请先提供 SQL 内容，再根据当前来源模式预览导入。",
        variant: "destructive",
      });
      return;
    }

    try {
      statusBar.set({
        id: "preview",
        label: "Parsing DDL",
        detail: sourceConfig.dialect.toUpperCase(),
        tone: "progress",
        progress: null,
        order: 20,
      });
      const result = await previewMutation.mutateAsync(
        buildPreviewRequest({
          sourceMode,
          sqlText: trimmedSql,
          fileName: sourceConfig.upload ? sourceFileName : undefined,
        }),
      );
      setPreviewResult(result);
      statusBar.set({
        id: "preview",
        label: "DDL parsed",
        detail: `${result.catalog.tables.length} tables`,
        tone: "success",
        order: 20,
        expiresInMs: 4_000,
      });
      toast({
        title: t("dashboard.ddlImport"),
        description: `已按 ${result.dialect.toUpperCase()} ${result.sourceMode} 解析 ${result.catalog.tables.length} 张表。`,
      });
    } catch (error) {
      statusBar.set({
        id: "preview",
        label: "DDL parse failed",
        detail: error instanceof Error ? error.message : "DDL 预览失败。",
        tone: "error",
        order: 20,
        expiresInMs: 6_000,
      });
      toast({
        title: t("dashboard.ddlImport"),
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
        title: t("dashboard.ddlImport"),
        description: "请先选择导出的官方模板。",
        variant: "destructive",
      });
      return;
    }

    if (selectedTableNames.size === 0) {
      toast({
        title: t("dashboard.ddlImport"),
        description: "请至少勾选一张已解析的表。",
        variant: "destructive",
      });
      return;
    }

    if (hasBlockingIssues) {
      toast({
        title: t("dashboard.ddlImport"),
        description: "当前仍有阻断项，先处理后才能导出。",
        variant: "destructive",
      });
      return;
    }

    if (needsLossyConfirmation && !allowLossyExport) {
      toast({
        title: t("dashboard.ddlImport"),
        description: "当前存在有损导出项，请先确认后再继续。",
        variant: "destructive",
      });
      return;
    }

    try {
      statusBar.set({
        id: "export",
        label: "Generating workbook",
        detail: selectedTemplateId,
        tone: "progress",
        progress: null,
        order: 21,
        mono: true,
      });
      const result = await exportMutation.mutateAsync({
        sourceMode,
        sqlText: previewResult.sourceSql,
        fileName: previewResult.fileName,
        templateId: selectedTemplateId,
        selectedTableNames: selectedTableNameList,
        allowLossyExport,
      });

      statusBar.set({
        id: "export",
        label: "Workbook created",
        detail: result.file.originalName,
        tone: "success",
        order: 21,
        expiresInMs: 5_000,
      });
      toast({
        title: t("dashboard.ddlImport"),
        description: `已生成 ${result.file.originalName}，并加入文件列表。`,
      });
      onActivateFile?.(result.file.id);
    } catch (error) {
      statusBar.set({
        id: "export",
        label: "Workbook export failed",
        detail: error instanceof Error ? error.message : "导出 XLSX 失败。",
        tone: "error",
        order: 21,
        expiresInMs: 6_000,
      });
      toast({
        title: t("dashboard.ddlImport"),
        description: error instanceof Error ? error.message : "导出 XLSX 失败。",
        variant: "destructive",
      });
    }
  };

  // ──────────────────────────────────────────────
  // Import タブ ハンドラ
  // ──────────────────────────────────────────────

  /** SQL ファイルを読み込んでステートメントリストにセットする */
  function handleLoadSqlFile() {
    liveFileInputRef.current?.click();
  }

  async function handleLiveFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = splitSqlStatements(text);
    setLiveStatements(parsed.map((s, i) => ({
      index: i,
      sql: s.sql,
      lineNumber: s.lineNumber,
      status: "pending" as const,
    })));
    e.target.value = "";
  }

  /**
   * ステートメントを 1 本ずつ実行するループ
   * 危険な SQL は DangerousSqlDialog で確認を取ってから executeQuery を呼ぶ
   */
  async function executeLiveImport() {
    if (!selectedConnectionId || liveStatements.length === 0) return;
    setIsExecuting(true);

    for (let i = 0; i < liveStatements.length; i++) {
      const stmt = liveStatements[i];
      // ステータスを running に更新
      setLiveStatements(prev =>
        prev.map((s, idx) => idx === i ? { ...s, status: "running" } : s),
      );

      try {
        // 危険 SQL 事前チェック（previewDangerousSql）
        const preview = await hostApi.connections.previewDangerousSql(selectedConnectionId, stmt.sql);

        let confirmed = false;
        if (preview.dangers && preview.dangers.length > 0) {
          // DangerousSqlDialog を開いてユーザー確認を待つ（Promise で橋渡し）
          confirmed = await new Promise<boolean>((resolve) => {
            setDangerPreview(preview);
            setDangerDialogOpen(true);
            dangerResolveRef.current = resolve;
          });
          setDangerDialogOpen(false);
          setDangerPreview(null);

          if (!confirmed) {
            setLiveStatements(prev =>
              prev.map((s, idx) => idx === i ? { ...s, status: "skipped" } : s),
            );
            continue;
          }
        } else {
          // 危険なし → confirmed は不要
          confirmed = false;
        }

        // executeQuery 呼び出し
        const result = await hostApi.connections.executeQuery({
          connectionId: selectedConnectionId,
          sql: stmt.sql,
          requestId: `ddl-import-${Date.now()}-${i}`,
          confirmed: preview.dangers && preview.dangers.length > 0,
        });

        // バッチ結果から最初のエラーを取得（DDL は通常 1 ステートメント = 1 バッチ）
        const firstBatch = result.batches[0];
        if (firstBatch?.error) {
          setLiveStatements(prev =>
            prev.map((s, idx) =>
              idx === i
                ? { ...s, status: "error", error: firstBatch.error, elapsedMs: firstBatch.elapsedMs }
                : s,
            ),
          );
        } else {
          setLiveStatements(prev =>
            prev.map((s, idx) =>
              idx === i
                ? { ...s, status: "success", elapsedMs: firstBatch?.elapsedMs }
                : s,
            ),
          );
        }
      } catch (err) {
        setLiveStatements(prev =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: "error", error: String(err) } : s,
          ),
        );
      }
    }
    setIsExecuting(false);
  }

  // ──────────────────────────────────────────────
  // Import タブ UI レンダラ
  // ──────────────────────────────────────────────

  function renderLiveImportTab() {
    // 接続が未設定の場合の空状態（D-14）
    if (connections.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <Database className="h-12 w-12 text-muted-foreground/30" />
          <h3 className="text-base font-semibold text-muted-foreground">未连接数据库</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            请先在 DB 工作台中配置并激活数据库连接，然后再使用 DDL 导入功能。
          </p>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        {/* 接続選択ストリップ — 48px */}
        <div className="flex items-center gap-3 border-b px-4 py-2">
          <span className="shrink-0 text-xs text-muted-foreground">选择连接:</span>
          <Select value={selectedConnectionId ?? ""} onValueChange={setSelectedConnectionId}>
            <SelectTrigger className="h-8 w-64 text-xs">
              <SelectValue placeholder="选择数据库连接" />
            </SelectTrigger>
            <SelectContent>
              {connections.map(conn => (
                <SelectItem key={conn.id} value={conn.id} className="text-xs">
                  {conn.name} {conn.environment ? `(${conn.environment})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ステートメントプレビューリスト */}
        <ScrollArea className="flex-1 px-4 py-2">
          {liveStatements.length === 0 ? (
            <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground">
              选择 SQL 文件以开始
            </div>
          ) : (
            <div className="space-y-1">
              {liveStatements.map((stmt, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-md border px-3 py-2"
                  style={{ minHeight: 40 }}
                >
                  <span className="w-8 shrink-0 text-xs text-muted-foreground">{stmt.lineNumber}</span>
                  {stmt.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                  ) : stmt.status === "error" ? (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  ) : stmt.status === "running" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : stmt.status === "skipped" ? (
                    <SkipForward className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate font-mono text-xs">{stmt.sql.slice(0, 80)}</span>
                  {stmt.elapsedMs != null && (
                    <span className="text-xs text-muted-foreground">{stmt.elapsedMs}ms</span>
                  )}
                </div>
              ))}
              {/* per-statement エラー詳細 */}
              {liveStatements
                .filter(s => s.status === "error")
                .map((stmt, idx) => (
                  <div
                    key={`err-${idx}`}
                    className="ml-10 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive"
                  >
                    执行失败：{stmt.error}（第 {stmt.lineNumber} 行）
                  </div>
                ))}
            </div>
          )}
        </ScrollArea>

        {/* フッターストリップ — 48px */}
        <div className="flex items-center justify-between border-t px-4 py-2">
          <div className="flex items-center gap-3">
            {/* SQL ファイルピッカーボタン */}
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleLoadSqlFile}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              选择 SQL 文件
            </Button>
            {liveStatements.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {liveStatements.length} 条语句
                {liveStatements.filter(s => s.status === "success").length > 0 &&
                  ` · ${liveStatements.filter(s => s.status === "success").length} 成功`}
                {liveStatements.filter(s => s.status === "error").length > 0 &&
                  ` · ${liveStatements.filter(s => s.status === "error").length} 失败`}
              </span>
            )}
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!selectedConnectionId || liveStatements.length === 0 || isExecuting}
            onClick={executeLiveImport}
          >
            {isExecuting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            导入到数据库
          </Button>
        </div>

        {/* DangerousSqlDialog — Phase 1 からの再利用（D-13） */}
        <DangerousSqlDialog
          preview={dangerPreview}
          open={dangerDialogOpen}
          onConfirm={() => {
            dangerResolveRef.current?.(true);
            dangerResolveRef.current = null;
          }}
          onCancel={() => {
            dangerResolveRef.current?.(false);
            dangerResolveRef.current = null;
          }}
        />

        {/* hidden ファイル input — ライブ SQL ファイル選択用 */}
        <input
          ref={liveFileInputRef}
          type="file"
          accept=".sql,.ddl"
          onChange={handleLiveFileChange}
          className="hidden"
        />
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // メインレンダリング
  // ──────────────────────────────────────────────

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex h-full flex-col bg-background"
    >
      {/* タブヘッダー */}
      <div className="border-b border-border bg-background px-3 py-2">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{t("dashboard.ddlImport")}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">1 选择来源  2 审阅结构  3 导出模板</p>
          </div>
          <div className="flex items-center gap-2">
            <TabsList className="h-8">
              <TabsTrigger value="export" className="h-7 px-3 text-xs">导出到 Excel</TabsTrigger>
              <TabsTrigger value="import" className="h-7 px-3 text-xs">导入到数据库</TabsTrigger>
            </TabsList>
            {activeTab === "export" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenUploadPicker()}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Upload .sql / .ddl
                </Button>
                <Button
                  size="sm"
                  onClick={handlePreview}
                  disabled={previewMutation.isPending}
                >
                  {previewMutation.isPending ? (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileCode2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  预览解析
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 既存の Export タブ用 hidden ファイル input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".sql,.ddl,.txt"
        className="hidden"
        onChange={handleUploadSource}
      />

      {/* ── Tab 1: 导出到 Excel（既存フロー、変更なし） ── */}
      <TabsContent value="export" className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
        <div className="grid h-full min-h-0 gap-0 lg:grid-cols-[minmax(420px,0.95fr)_minmax(540px,1.05fr)]">
          <section className="min-h-0 border-r border-border">
              <div className="border-b border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">导入来源</h3>
                    <p className="text-xs text-muted-foreground">先确定来源模式，再粘贴或上传内容。</p>
                  </div>
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    {sourceConfig.dialect}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {SOURCE_OPTIONS.map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      className={`rounded-md px-3 py-2.5 text-left transition ${
                        sourceMode === option.mode
                        ? "bg-slate-100 ring-1 ring-inset ring-slate-300 dark:bg-slate-900 dark:ring-slate-700"
                        : "hover:bg-slate-50 dark:hover:bg-slate-900/60"
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
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{option.description}</p>
                  </button>
                ))}
              </div>
              {sourceFileName ? (
                <div className="mt-2 rounded-md border border-border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
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
                spellCheck={false}
                className="h-full min-h-[360px] resize-none overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 [overflow-wrap:anywhere] [word-break:break-word]"
              />
            </div>
          </section>

          <section className="min-h-0 bg-background text-foreground">
            <div className="flex h-full flex-col">
              <div className="border-b border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">结构审阅</h3>
                    <p className="text-xs text-muted-foreground">先确认解析出的表结构，再决定是否导出。</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] text-muted-foreground">
                    <Database className="h-3.5 w-3.5" />
                    {previewResult ? `${previewResult.catalog.tables.length} 张表 / ${previewResult.dialect.toUpperCase()}` : "等待预览"}
                  </div>
                </div>
              </div>
              <div className="grid min-h-0 flex-1 lg:grid-rows-[minmax(0,1fr)_minmax(280px,0.78fr)]">
                <ScrollArea className="min-h-0 border-b border-border">
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
                        <div key={table.name} className="overflow-hidden rounded-lg border border-border bg-background">
                          <div className="flex items-start gap-3 border-b border-border px-3 py-3">
                            <Checkbox
                              checked={selectedTableNames.has(table.name)}
                              onCheckedChange={(checked) => handleToggleTable(table.name, checked === true)}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="truncate font-semibold">{table.name}</div>
                                <span className="text-[11px] text-muted-foreground">{table.columns.length} 列</span>
                                {table.foreignKeys.length > 0 ? <span className="text-[11px] text-muted-foreground">FK {table.foreignKeys.length}</span> : null}
                                {table.indexes.length > 0 ? <span className="text-[11px] text-muted-foreground">IDX {table.indexes.length}</span> : null}
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
                                <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                                  {!column.nullable ? <span>NN</span> : null}
                                  {column.primaryKey ? <span>PK</span> : null}
                                  {column.autoIncrement ? <span>AI</span> : null}
                                  {column.defaultValue ? <span>DEFAULT</span> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                <div className="min-h-0 bg-background">
                  <div className="border-b border-border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">问题与导出</h3>
                        <p className="text-xs text-muted-foreground">不受支持项会拦截导出，有损项需要明确确认。</p>
                      </div>
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex h-[calc(100%-61px)] flex-col">
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
                </div>
              </div>
            </div>
          </section>
        </div>
      </TabsContent>

      {/* ── Tab 2: 导入到数据库（新規 live-DB 実行タブ） ── */}
      <TabsContent value="import" className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
        {renderLiveImportTab()}
      </TabsContent>
    </Tabs>
  );
}
