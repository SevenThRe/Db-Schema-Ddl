// DDL → Excel 変換ワークスペース
// SQL DDL テキストを解析し、データベース定義書 XLSX として出力する内蔵拡張

import { useState, useCallback, useEffect } from "react";
import { FileDown, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePreviewDdlImport, useExportWorkbookFromDdl } from "@/hooks/use-ddl";
import { cn } from "@/lib/utils";
import type { DdlImportTable } from "@shared/schema";
import { useScopedHostApi } from "@/extensions/ExtensionWorkspaceHost";

import type { WorkbookTemplateVariantId } from "@shared/schema";

// テンプレート選択肢（workbook_template_variants と同期）
const TEMPLATES: { id: WorkbookTemplateVariantId; label: string }[] = [
  { id: "format-a-table-sheet", label: "Format A（1テーブル = 1シート）" },
  { id: "format-b-multi-table-sheet", label: "Format B（全テーブル = 1シート）" },
];

// ──────────────────────────────────────────────
// テーブル選択カード
// ──────────────────────────────────────────────

function TableSelectCard({
  table,
  selected,
  onToggle,
}: {
  table: DdlImportTable;
  selected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-md border text-xs transition-colors",
        selected ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {/* チェックボックス相当のクリック領域 */}
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "h-4 w-4 shrink-0 rounded border transition-colors",
            selected ? "border-primary bg-primary" : "border-border bg-background",
          )}
          aria-checked={selected}
          role="checkbox"
        >
          {selected ? (
            <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
          ) : null}
        </button>

        <span className="flex-1 font-medium text-foreground">{table.name}</span>
        <span className="text-muted-foreground">{table.columns.length} 列</span>

        {/* 展開ボタン */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5" />
            : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-border px-3 pb-2 pt-1">
          <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-muted-foreground">
            {table.columns.map((col) => (
              <span key={col.entityKey} className="truncate">
                {col.name}
                <span className="ml-1 opacity-60">{col.dataType}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

export function DdlToExcelWorkspace() {
  const { toast } = useToast();
  const host = useScopedHostApi();

  const [sqlText, setSqlText] = useState("");
  const [templateId, setTemplateId] = useState<WorkbookTemplateVariantId>(TEMPLATES[0].id);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [parsedTables, setParsedTables] = useState<DdlImportTable[] | null>(null);

  const previewMutation = usePreviewDdlImport();
  const exportMutation = useExportWorkbookFromDdl();

  useEffect(() => () => {
    host?.statusBar.clearAll();
  }, [host]);

  // ── 解析 ──────────────────────────────────────

  const handleParse = useCallback(async () => {
    const trimmed = sqlText.trim();
    if (!trimmed) return;
    try {
      host?.statusBar.set({
        id: "ddl-to-excel-parse",
        label: "Parsing DDL",
        detail: "MySQL",
        tone: "progress",
        progress: null,
        order: 30,
      });
      const result = await previewMutation.mutateAsync({
        sourceMode: "mysql-paste",
        sqlText: trimmed,
      });
      const tables = result.catalog?.tables ?? [];
      setParsedTables(tables);
      // 全テーブルをデフォルト選択
      setSelectedNames(new Set(tables.map((t: DdlImportTable) => t.name)));
      host?.statusBar.set({
        id: "ddl-to-excel-parse",
        label: "DDL parsed",
        detail: `${tables.length} tables`,
        tone: "success",
        order: 30,
        expiresInMs: 4_000,
      });
    } catch (e) {
      host?.statusBar.set({
        id: "ddl-to-excel-parse",
        label: "DDL parse failed",
        detail: String(e),
        tone: "error",
        order: 30,
        expiresInMs: 6_000,
      });
      toast({ title: "解析失败", description: String(e), variant: "destructive" });
    }
  }, [host, previewMutation, sqlText, toast]);

  // ── エクスポート ──────────────────────────────

  const handleExport = useCallback(async () => {
    if (!parsedTables || selectedNames.size === 0) return;
    try {
      host?.statusBar.set({
        id: "ddl-to-excel-export",
        label: "Exporting workbook",
        detail: `${selectedNames.size} tables`,
        tone: "progress",
        progress: null,
        order: 31,
      });
      await exportMutation.mutateAsync({
        sourceMode: "mysql-paste",
        sqlText: sqlText.trim(),
        templateId,
        selectedTableNames: Array.from(selectedNames),
        allowLossyExport: true,
      });
      host?.statusBar.set({
        id: "ddl-to-excel-export",
        label: "Workbook exported",
        detail: `${selectedNames.size} tables`,
        tone: "success",
        order: 31,
        expiresInMs: 5_000,
      });
      toast({ title: "导出成功", description: "已保存到文件列表，可在左侧打开。", variant: "success" });
    } catch (e) {
      host?.statusBar.set({
        id: "ddl-to-excel-export",
        label: "Workbook export failed",
        detail: String(e),
        tone: "error",
        order: 31,
        expiresInMs: 6_000,
      });
      toast({ title: "导出失败", description: String(e), variant: "destructive" });
    }
  }, [exportMutation, host, parsedTables, selectedNames, sqlText, templateId, toast]);

  const toggleAll = useCallback(() => {
    if (!parsedTables) return;
    if (selectedNames.size === parsedTables.length) {
      setSelectedNames(new Set());
    } else {
      setSelectedNames(new Set(parsedTables.map((t) => t.name)));
    }
  }, [parsedTables, selectedNames]);

  const toggleTable = useCallback((name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const isParsing = previewMutation.isPending;
  const isExporting = exportMutation.isPending;

  return (
    <div className="flex h-full flex-col gap-0">
      {/* ── DDL 入力エリア ── */}
      <div className="shrink-0 space-y-2 border-b border-border p-4">
        <label className="text-xs font-medium text-muted-foreground">SQL DDL テキスト</label>
        <Textarea
          value={sqlText}
          onChange={(e) => {
            setSqlText(e.target.value);
            // テキストが変わったら解析結果をリセット
            if (parsedTables !== null) setParsedTables(null);
          }}
          placeholder={"CREATE TABLE users (\n  id INT PRIMARY KEY,\n  name VARCHAR(100) NOT NULL\n);"}
          className="h-40 resize-none font-mono text-xs"
          spellCheck={false}
        />
        <Button
          size="sm"
          className="w-full h-8 text-xs"
          onClick={() => void handleParse()}
          disabled={!sqlText.trim() || isParsing}
        >
          {isParsing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {isParsing ? "解析中…" : "解析 DDL"}
        </Button>
      </div>

      {/* ── テーブル選択エリア ── */}
      {parsedTables !== null ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {parsedTables.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <AlertCircle className="h-7 w-7 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">未能识别任何 CREATE TABLE 语句</p>
            </div>
          ) : (
            <>
              {/* ヘッダー */}
              <div className="flex items-center justify-between shrink-0 px-4 py-2">
                <span className="text-xs text-muted-foreground">
                  已识别 {parsedTables.length} 张表，已选 {selectedNames.size} 张
                </span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={toggleAll}>
                  {selectedNames.size === parsedTables.length ? "取消全选" : "全选"}
                </Button>
              </div>

              {/* テーブルカード一覧 */}
              <ScrollArea className="flex-1">
                <div className="space-y-1.5 px-4 pb-2">
                  {parsedTables.map((table) => (
                    <TableSelectCard
                      key={table.name}
                      table={table}
                      selected={selectedNames.has(table.name)}
                      onToggle={() => toggleTable(table.name)}
                    />
                  ))}
                </div>
              </ScrollArea>

              {/* テンプレート & エクスポートボタン */}
              <div className="shrink-0 space-y-2 border-t border-border p-4">
                <div className="flex items-center gap-2">
                  <label className="shrink-0 text-xs font-medium text-muted-foreground">输出格式</label>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value as WorkbookTemplateVariantId)}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    {TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => void handleExport()}
                  disabled={selectedNames.size === 0 || isExporting}
                >
                  {isExporting
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <FileDown className="mr-1.5 h-3.5 w-3.5" />}
                  {isExporting ? "导出中…" : `导出 Excel（${selectedNames.size} 张表）`}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
          <p className="text-xs">粘贴 DDL 后点击「解析 DDL」</p>
        </div>
      )}
    </div>
  );
}
