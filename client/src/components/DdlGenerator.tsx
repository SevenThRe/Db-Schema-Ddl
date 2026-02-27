import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useGenerateDdl, useTableInfo, useSettings } from "@/hooks/use-ddl";
import type { TableInfo } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { parseApiErrorResponse, translateApiError } from "@/lib/api-error";
import { autoFixTablePhysicalNames, validateTablePhysicalNames } from "@/lib/physical-name-utils";
import { Copy, Check, Code, Database, ArrowRight, Download, Search, SortAsc, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DdlGeneratorProps {
  fileId: number | null;
  sheetName: string | null;
  overrideTables?: TableInfo[] | null;
  currentTable?: TableInfo | null;
  selectedTableNames?: Set<string>;
  onSelectedTableNamesChange?: (next: Set<string>) => void;
}

type SqlTokenType = "plain" | "keyword" | "type" | "identifier" | "string" | "comment" | "number" | "operator";

interface SqlToken {
  text: string;
  type: SqlTokenType;
}

const SQL_KEYWORDS = new Set([
  "ADD",
  "ALTER",
  "AND",
  "AS",
  "AUTO_INCREMENT",
  "BY",
  "CASCADE",
  "CHARACTER",
  "CHECK",
  "COLLATE",
  "COMMENT",
  "CONSTRAINT",
  "CREATE",
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "DATABASE",
  "DEFAULT",
  "DELETE",
  "DESC",
  "DROP",
  "ENGINE",
  "EXISTS",
  "FOREIGN",
  "FROM",
  "GENERATED",
  "IF",
  "IN",
  "INDEX",
  "INSERT",
  "INTO",
  "IS",
  "KEY",
  "NOT",
  "NULL",
  "ON",
  "OR",
  "ORDER",
  "PRIMARY",
  "REFERENCES",
  "SET",
  "TABLE",
  "THEN",
  "TO",
  "TRIGGER",
  "UNIQUE",
  "UPDATE",
  "USING",
  "VALUES",
  "VIEW",
  "WHEN",
  "WHERE",
]);

const SQL_TYPE_NAMES = new Set([
  "BIGINT",
  "BINARY",
  "BIT",
  "BLOB",
  "BOOLEAN",
  "CHAR",
  "CLOB",
  "DATE",
  "DATETIME",
  "DECIMAL",
  "DOUBLE",
  "FLOAT",
  "INT",
  "INTEGER",
  "JSON",
  "LONGTEXT",
  "MEDIUMINT",
  "MEDIUMTEXT",
  "NCHAR",
  "NCLOB",
  "NUMBER",
  "NUMERIC",
  "NVARCHAR",
  "NVARCHAR2",
  "REAL",
  "SERIAL",
  "SMALLINT",
  "TEXT",
  "TIME",
  "TIMESTAMP",
  "TINYINT",
  "UUID",
  "VARCHAR",
  "VARCHAR2",
]);

const SQL_TOKEN_CLASS_MAP: Record<SqlTokenType, string> = {
  plain: "text-slate-200",
  keyword: "text-cyan-300 font-semibold",
  type: "text-sky-300",
  identifier: "text-amber-300",
  string: "text-emerald-300",
  comment: "text-slate-400 italic",
  number: "text-violet-300",
  operator: "text-slate-300",
};

function classifyWord(word: string): SqlTokenType {
  const normalizedWord = word.toUpperCase();
  if (SQL_KEYWORDS.has(normalizedWord)) {
    return "keyword";
  }
  if (SQL_TYPE_NAMES.has(normalizedWord)) {
    return "type";
  }
  return "plain";
}

function tokenizeSql(sqlText: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const length = sqlText.length;
  let index = 0;

  const isWordStart = (ch: string) => /[A-Za-z_]/.test(ch);
  const isWordPart = (ch: string) => /[A-Za-z0-9_$]/.test(ch);
  const isDigit = (ch: string) => /[0-9]/.test(ch);

  while (index < length) {
    const current = sqlText[index];
    const next = sqlText[index + 1];

    if (current === "-" && next === "-") {
      let end = index + 2;
      while (end < length && sqlText[end] !== "\n") {
        end += 1;
      }
      tokens.push({ text: sqlText.slice(index, end), type: "comment" });
      index = end;
      continue;
    }

    if (current === "/" && next === "*") {
      let end = index + 2;
      while (end < length - 1 && !(sqlText[end] === "*" && sqlText[end + 1] === "/")) {
        end += 1;
      }
      end = end < length - 1 ? end + 2 : length;
      tokens.push({ text: sqlText.slice(index, end), type: "comment" });
      index = end;
      continue;
    }

    if (current === "'" || current === '"' || current === "`") {
      const quote = current;
      let end = index + 1;
      while (end < length) {
        const char = sqlText[end];
        if (char === quote) {
          if (quote === "'" && sqlText[end + 1] === "'") {
            end += 2;
            continue;
          }
          end += 1;
          break;
        }
        if (char === "\\" && quote !== "'" && end + 1 < length) {
          end += 2;
          continue;
        }
        end += 1;
      }
      tokens.push({ text: sqlText.slice(index, end), type: quote === "`" ? "identifier" : "string" });
      index = end;
      continue;
    }

    if (/\s/.test(current)) {
      let end = index + 1;
      while (end < length && /\s/.test(sqlText[end])) {
        end += 1;
      }
      tokens.push({ text: sqlText.slice(index, end), type: "plain" });
      index = end;
      continue;
    }

    if (isDigit(current)) {
      let end = index + 1;
      while (end < length && /[0-9._]/.test(sqlText[end])) {
        end += 1;
      }
      tokens.push({ text: sqlText.slice(index, end), type: "number" });
      index = end;
      continue;
    }

    if (isWordStart(current)) {
      let end = index + 1;
      while (end < length && isWordPart(sqlText[end])) {
        end += 1;
      }
      const word = sqlText.slice(index, end);
      tokens.push({ text: word, type: classifyWord(word) });
      index = end;
      continue;
    }

    tokens.push({ text: current, type: "operator" });
    index += 1;
  }

  return tokens;
}

export function DdlGenerator({
  fileId,
  sheetName,
  overrideTables,
  currentTable,
  selectedTableNames,
  onSelectedTableNamesChange,
}: DdlGeneratorProps) {
  const CONTROL_BUTTON_CLASS = "h-7 text-[11px]";
  const [dialect, setDialect] = useState<"mysql" | "oracle">("mysql");
  const [generatedDdl, setGeneratedDdl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exportMode, setExportMode] = useState<"single" | "per-table">("single");
  const [localSelectedTableNames, setLocalSelectedTableNames] = useState<Set<string>>(new Set());
  const [showTableSelector, setShowTableSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"source" | "column" | "name">("source");
  const [showNameFixDialog, setShowNameFixDialog] = useState(false);
  const [pendingNameFixTables, setPendingNameFixTables] = useState<TableInfo[]>([]);
  const [nameFixCandidateKeys, setNameFixCandidateKeys] = useState<Set<string>>(new Set());
  const [generatedTables, setGeneratedTables] = useState<TableInfo[] | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const nameFixResolverRef = useRef<((tables: TableInfo[] | null) => void) | null>(null);

  const { data: autoTables } = useTableInfo(fileId, sheetName);
  const tables = overrideTables || autoTables;
  const { mutate: generate, isPending } = useGenerateDdl();
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const { t } = useTranslation();
  const highlightedDdlTokens = useMemo(() => (generatedDdl ? tokenizeSql(generatedDdl) : []), [generatedDdl]);
  const effectiveSelectedTableNames = selectedTableNames ?? localSelectedTableNames;

  const commitSelectedTableNames = useCallback((next: Set<string>) => {
    if (onSelectedTableNamesChange) {
      onSelectedTableNamesChange(new Set(next));
      return;
    }
    setLocalSelectedTableNames(new Set(next));
  }, [onSelectedTableNamesChange]);

  const updateSelectedTableNames = useCallback((updater: (previous: Set<string>) => Set<string>) => {
    const next = updater(new Set(effectiveSelectedTableNames));
    commitSelectedTableNames(next);
  }, [commitSelectedTableNames, effectiveSelectedTableNames]);

  useEffect(() => {
    if (!tables || tables.length === 0) {
      if (effectiveSelectedTableNames.size > 0) {
        commitSelectedTableNames(new Set());
      }
      return;
    }

    const availableNames = new Set(
      tables
        .map((table: TableInfo) => table.physicalTableName)
        .filter((name: string): name is string => Boolean(name && name.trim())),
    );

    const next = new Set(
      Array.from(effectiveSelectedTableNames).filter((name) => availableNames.has(name)),
    );

    if (next.size !== effectiveSelectedTableNames.size) {
      commitSelectedTableNames(next);
    }
  }, [tables, effectiveSelectedTableNames, commitSelectedTableNames]);

  const tablesWithNameIssues = useMemo(() => {
    return (tables ?? []).filter((table: TableInfo) => validateTablePhysicalNames(table).hasIssues);
  }, [tables]);

  // 从 Excel 范围中提取列字母（例如 "B79:E824" -> "B"）
  const getColumnLetter = (table: TableInfo): string => {
    if (table.excelRange) {
      const match = table.excelRange.match(/^([A-Z]+)\d+/);
      return match ? match[1] : '';
    }
    if (table.columnRange?.startColLabel) {
      return table.columnRange.startColLabel;
    }
    return '';
  };

  // 将列字母转换为数字（A=1, B=2, ..., Z=26, AA=27, ...）
  const columnToNumber = (col: string): number => {
    let result = 0;
    for (let i = 0; i < col.length; i++) {
      result = result * 26 + (col.charCodeAt(i) - 64);
    }
    return result;
  };

  // 获取所有唯一的列字母（用于筛选按钮）
  const availableColumns = useMemo(() => {
    if (!tables) return [];
    const columns = new Set<string>();
    tables.forEach((table: TableInfo) => {
      const col = getColumnLetter(table);
      if (col) columns.add(col);
    });
    return Array.from(columns).sort((a, b) => columnToNumber(a) - columnToNumber(b));
  }, [tables]);

  // 筛选和排序表格
  const filteredAndSortedTables = useMemo(() => {
    if (!tables) return [];

    let result = [...tables];

    // 搜索过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(table =>
        table.logicalTableName?.toLowerCase().includes(query) ||
        table.physicalTableName?.toLowerCase().includes(query)
      );
    }

    // 排序
    if (sortMode === "column") {
      result.sort((a, b) => {
        const colA = getColumnLetter(a);
        const colB = getColumnLetter(b);
        const numA = colA ? columnToNumber(colA) : 0;
        const numB = colB ? columnToNumber(colB) : 0;
        return numA - numB;
      });
    } else if (sortMode === "name") {
      result.sort((a, b) => {
        const nameA = a.logicalTableName || a.physicalTableName || '';
        const nameB = b.logicalTableName || b.physicalTableName || '';
        return nameA.localeCompare(nameB, 'zh-CN');
      });
    }
    // sortMode === "source" 时保持原顺序

    return result;
  }, [tables, searchQuery, sortMode]);

  const getNameFixKey = (_table: TableInfo, index: number) => String(index);

  const resetNameFixDialog = () => {
    setShowNameFixDialog(false);
    setPendingNameFixTables([]);
    setNameFixCandidateKeys(new Set());
    nameFixResolverRef.current = null;
  };

  const askAutoFixIfNeeded = (targetTables: TableInfo[]): Promise<TableInfo[] | null> => {
    const hasInvalidNames = targetTables.some((table) => validateTablePhysicalNames(table).hasIssues);

    if (!hasInvalidNames) {
      return Promise.resolve(targetTables);
    }

    return new Promise((resolve) => {
      nameFixResolverRef.current = resolve;
      setPendingNameFixTables(targetTables);
      const defaultSelectedKeys = new Set<string>();
      targetTables.forEach((table, index) => {
        if (validateTablePhysicalNames(table).hasIssues) {
          defaultSelectedKeys.add(getNameFixKey(table, index));
        }
      });
      setNameFixCandidateKeys(defaultSelectedKeys);
      setShowNameFixDialog(true);
    });
  };

  const resolveNameFix = (applyFix: boolean) => {
    const resolver = nameFixResolverRef.current;
    if (!resolver) return;

    const resolvedTables = applyFix
      ? pendingNameFixTables.map((table, index) =>
          nameFixCandidateKeys.has(getNameFixKey(table, index))
            ? autoFixTablePhysicalNames(table)
            : table,
        )
      : pendingNameFixTables;

    resolver(resolvedTables);
    resetNameFixDialog();
  };

  const cancelNameFix = () => {
    const resolver = nameFixResolverRef.current;
    if (resolver) {
      resolver(null);
    }
    resetNameFixDialog();
  };

  const handleGenerate = async () => {
    if (!tables || tables.length === 0) return;
    setGenerationError(null);

    // 单文件模式：只生成当前表
    if (exportMode === "single") {
      const targetTable = currentTable || (tables.length === 1 ? tables[0] : null);

      if (!targetTable) {
        toast({
          title: t("ddl.noTableSelected"),
          description: t("ddl.pleaseSelectTable"),
          variant: "destructive",
        });
        return;
      }

      const tablesForGeneration = await askAutoFixIfNeeded([targetTable]);
      if (!tablesForGeneration) {
        return;
      }

      generate(
        { tables: tablesForGeneration, dialect, settings },
        {
          onSuccess: (data) => {
            setGeneratedDdl(data.ddl);
            setGeneratedTables(tablesForGeneration);
            setGenerationError(null);
            toast({
              title: t("ddl.generated"),
              description: t("ddl.generatedSuccess", { count: 1, dialect: dialect.toUpperCase() }),
            });
          },
          onError: (error) => {
            setGeneratedTables(null);
            const translated = translateApiError(error, t);
            const friendlyDescription = translated.description;
            setGenerationError(friendlyDescription);
            toast({
              title: translated.title || t("ddl.generationFailed"),
              description: friendlyDescription,
              variant: "destructive",
            });
          },
        }
      );
    } else {
      // ZIP 模式：显示表格选择对话框
      if (effectiveSelectedTableNames.size === 0) {
        commitSelectedTableNames(
          new Set(tables.map((table: TableInfo) => table.physicalTableName).filter(Boolean)),
        );
      }
      setShowTableSelector(true);
    }
  };

  const handleGenerateZip = async () => {
    if (!tables || effectiveSelectedTableNames.size === 0) {
      toast({
        title: t("ddl.noTableSelected"),
        description: t("ddl.pleaseSelectAtLeastOne"),
        variant: "destructive",
      });
      return;
    }

    const selectedTables = tables.filter((table: TableInfo) =>
      effectiveSelectedTableNames.has(table.physicalTableName),
    );
    const tablesForExport = await askAutoFixIfNeeded(selectedTables);
    if (!tablesForExport) {
      return;
    }

    try {
      const response = await fetch("/api/export-ddl-zip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tables: tablesForExport,
          dialect,
          settings,
        }),
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(response, {
          code: "REQUEST_FAILED",
          message: "Failed to generate ZIP",
        });
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ddl_${dialect}_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: t("ddl.exported"),
        description: t("ddl.exportedZip", { count: tablesForExport.length }),
      });

      setShowTableSelector(false);
    } catch (error) {
      console.error('ZIP export error:', error);
      const translated = translateApiError(error, t);
      toast({
        title: translated.title || t("ddl.exportFailed"),
        description: translated.description,
        variant: "destructive",
      });
    }
  };

  // 选择/取消选择指定列的所有表
  const toggleColumnSelection = (column: string, select: boolean) => {
    if (!tables) return;

    const newSet = new Set(effectiveSelectedTableNames);
    tables.forEach((table: TableInfo) => {
      const tableCol = getColumnLetter(table);
      if (tableCol === column) {
        if (select) {
          newSet.add(table.physicalTableName);
        } else {
          newSet.delete(table.physicalTableName);
        }
      }
    });
    commitSelectedTableNames(newSet);
  };

  const copyToClipboard = () => {
    if (!generatedDdl) return;
    navigator.clipboard.writeText(generatedDdl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: t("ddl.copiedToClipboard"),
    });
  };

  const substituteVariables = (template: string, table: TableInfo): string => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    const author = settings?.authorName || 'ISI';

    return template
      .replace(/\$\{logical_name\}/g, table.logicalTableName)
      .replace(/\$\{physical_name\}/g, table.physicalTableName)
      .replace(/\$\{author\}/g, author)
      .replace(/\$\{date\}/g, dateStr);
  };

  const handleExport = async () => {
    if (!tables || tables.length === 0) return;

    // 单文件导出（导出当前生成的 DDL）
    if (!generatedDdl) return;

    const prefix = settings?.exportFilenamePrefix || "Crt_";
    const suffixTemplate = settings?.exportFilenameSuffix || "";
    const table = generatedTables?.[0] || currentTable || (tables.length === 1 ? tables[0] : {
      logicalTableName: "all_tables",
      physicalTableName: "all_tables",
      columns: []
    });
    const suffix = suffixTemplate ? substituteVariables(suffixTemplate, table) : "";
    const filename = `${prefix}${table.physicalTableName}${suffix}.sql`;

    const blob = new Blob([generatedDdl], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: t("ddl.exported"),
      description: t("ddl.exportedAs", { filename }),
    });
  };

  if (!tables || tables.length === 0) return null;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-3 py-2 border-b border-border/60 bg-background/80 flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex items-center gap-2">
          <Code className="w-3.5 h-3.5 text-primary" />
          <h3 className="font-semibold text-xs tracking-wide uppercase" data-testid="text-ddl-header">{t("ddl.output")}</h3>
          {exportMode === "per-table" && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              {t("ddl.selected")}: {effectiveSelectedTableNames.size}
            </Badge>
          )}
          {tablesWithNameIssues.length > 0 && (
            <Badge variant="destructive" className="h-5 text-[10px]">
              {t("ddl.namingWarningsFound", { count: tablesWithNameIssues.length })}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
          <Select value={dialect} onValueChange={(v) => setDialect(v as any)}>
            <SelectTrigger className="w-[92px] sm:w-[100px] h-7 text-[11px] shrink-0" data-testid="select-dialect">
              <SelectValue placeholder="Dialect" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mysql" data-testid="option-mysql">MySQL</SelectItem>
              <SelectItem value="oracle" data-testid="option-oracle">Oracle</SelectItem>
            </SelectContent>
          </Select>

          <Select value={exportMode} onValueChange={(v) => setExportMode(v as any)}>
            <SelectTrigger className="w-[106px] sm:w-[118px] h-7 text-[11px] shrink-0" data-testid="select-export-mode">
              <SelectValue placeholder="Export Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single" data-testid="option-single">Single File</SelectItem>
              <SelectItem value="per-table" data-testid="option-per-table">Per Table (ZIP)</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={isPending}
            className="h-7 text-[11px] font-semibold shadow-sm px-2.5 shrink-0"
            data-testid="button-generate"
          >
            {isPending ? t("ddl.generating") : (
              <>
                {t("ddl.generate")} <ArrowRight className="w-3 h-3 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative group bg-slate-950/95">
        {!generatedDdl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
            <Database className="w-12 h-12 mb-4 opacity-20" />
            {generationError ? (
              <div className="max-w-[90%] rounded-md border border-red-500/40 bg-red-500/10 p-4 text-left">
                <p className="text-sm font-semibold text-red-200">{t("ddl.generationFailed")}</p>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-red-100/90">{generationError}</pre>
              </div>
            ) : (
              <p className="text-sm">{t("ddl.readyToGenerate")}</p>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <div className="px-3 py-2 flex justify-end gap-1.5 border-b border-slate-800/70">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExport}
                className={`${CONTROL_BUTTON_CLASS} shadow-sm bg-white/10 text-white border-none backdrop-blur-sm`}
                data-testid="button-export"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                <span className="hidden sm:inline">{t("ddl.export")}</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={copyToClipboard}
                className={`${CONTROL_BUTTON_CLASS} shadow-sm bg-white/10 text-white border-none backdrop-blur-sm`}
                data-testid="button-copy"
              >
                {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                <span className="hidden sm:inline">{copied ? t("ddl.copied") : t("ddl.copy")}</span>
              </Button>
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar">
              <pre className="p-4 font-mono text-[12px] text-slate-200 leading-relaxed selection:bg-primary/30" data-testid="text-ddl-output">
                <code>
                  {highlightedDdlTokens.map((token, tokenIndex) => (
                    <span key={`${tokenIndex}-${token.type}-${token.text.length}`} className={SQL_TOKEN_CLASS_MAP[token.type]}>
                      {token.text}
                    </span>
                  ))}
                </code>
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* 表格选择对话框 (ZIP 模式) */}
      <Dialog open={showTableSelector} onOpenChange={setShowTableSelector}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("ddl.selectTables")}</DialogTitle>
            <DialogDescription>
              {t("ddl.selectTablesDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* 搜索和排序 */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t("ddl.searchTables")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as "source" | "column" | "name")}>
                <SelectTrigger className="w-[180px] h-9">
                  <SortAsc className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="source">{t("ddl.sortBySource")}</SelectItem>
                  <SelectItem value="column">{t("ddl.sortByColumn")}</SelectItem>
                  <SelectItem value="name">{t("ddl.sortByName")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 全选/取消全选 和 统计 */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  commitSelectedTableNames(
                    new Set(filteredAndSortedTables?.map((table) => table.physicalTableName) || []),
                  )
                }
              >
                {t("ddl.selectAll")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => commitSelectedTableNames(new Set())}
              >
                {t("ddl.deselectAll")}
              </Button>
              <span className="text-sm text-muted-foreground ml-auto">
                {t("ddl.selected")}: {effectiveSelectedTableNames.size} / {filteredAndSortedTables?.length || 0}
              </span>
            </div>

            {/* 按列快速筛选 */}
            {availableColumns.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-md border">
                <span className="text-xs font-medium text-muted-foreground">{t("ddl.filterByColumn")}:</span>
                {availableColumns.map(column => {
                  const columnTables = tables?.filter((t: TableInfo) => getColumnLetter(t) === column) || [];
                  const selectedCount = columnTables.filter((t: TableInfo) => effectiveSelectedTableNames.has(t.physicalTableName)).length;
                  const allSelected = selectedCount === columnTables.length;

                  return (
                    <Button
                      key={column}
                      variant={allSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleColumnSelection(column, !allSelected)}
                      className="h-7 text-xs"
                    >
                      {t("ddl.column")} {column} ({selectedCount}/{columnTables.length})
                    </Button>
                  );
                })}
              </div>
            )}

            <ScrollArea className="h-[400px] border rounded-md p-4">
              <div className="space-y-2">
                {filteredAndSortedTables && filteredAndSortedTables.length > 0 ? (
                  filteredAndSortedTables.map((table) => {
                    const validation = validateTablePhysicalNames(table);
                    // 生成 Excel 范围显示
                    let rangeLabel = '';
                    if (table.excelRange) {
                      rangeLabel = table.excelRange;
                    } else if (table.columnRange?.startColLabel && table.rowRange) {
                      rangeLabel = `${table.columnRange.startColLabel}${table.rowRange.startRow + 1}:${table.columnRange.endColLabel || '?'}${table.rowRange.endRow + 1}`;
                    }

                    return (
                      <div
                        key={table.physicalTableName}
                        className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={effectiveSelectedTableNames.has(table.physicalTableName)}
                          onCheckedChange={(checked) => {
                            updateSelectedTableNames((previous) => {
                              if (checked) {
                                previous.add(table.physicalTableName);
                              } else {
                                previous.delete(table.physicalTableName);
                              }
                              return previous;
                            });
                          }}
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm flex items-center gap-2">
                            {table.logicalTableName}
                            {validation.hasIssues && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                {t("ddl.namingWarningBadge")}
                              </Badge>
                            )}
                            {rangeLabel && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                {rangeLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">{table.physicalTableName}</div>
                          {validation.hasInvalidTableName && (
                            <div className="text-[10px] text-amber-700 dark:text-amber-300 font-mono mt-0.5">
                              {"->"} {validation.tableNameSuggested}
                            </div>
                          )}
                          {validation.invalidColumns.length > 0 && (
                            <div className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">
                              {t("ddl.invalidColumnsHint", { count: validation.invalidColumns.length })}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {table.columns.length} {t("table.columns")}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {searchQuery ? t("search.noResults") : t("table.noTables")}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTableSelector(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleGenerateZip} disabled={effectiveSelectedTableNames.size === 0}>
              {t("ddl.generateZip")} ({effectiveSelectedTableNames.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showNameFixDialog}
        onOpenChange={(open) => {
          if (!open) {
            cancelNameFix();
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              {t("ddl.namingFixDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("ddl.namingFixDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[320px] border rounded-md p-3">
            <div className="space-y-2">
              {pendingNameFixTables.map((table, index) => {
                const key = getNameFixKey(table, index);
                const validation = validateTablePhysicalNames(table);
                if (!validation.hasIssues) {
                  return null;
                }

                return (
                  <div
                    key={`${key}-${table.physicalTableName}`}
                    className="flex items-start gap-3 p-2.5 rounded-md border bg-muted/20"
                  >
                    <Checkbox
                      checked={nameFixCandidateKeys.has(key)}
                      onCheckedChange={(checked) => {
                        setNameFixCandidateKeys((prev) => {
                          const next = new Set(prev);
                          if (checked === true) {
                            next.add(key);
                          } else {
                            next.delete(key);
                          }
                          return next;
                        });
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {table.logicalTableName || table.physicalTableName}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        {validation.tableNameCurrent || "(empty)"}
                      </div>
                      {validation.hasInvalidTableName && (
                        <div className="text-[10px] text-amber-700 dark:text-amber-300 font-mono mt-1">
                          {validation.tableNameCurrent || "(empty)"} {"->"} {validation.tableNameSuggested}
                        </div>
                      )}
                      {validation.invalidColumns.length > 0 && (
                        <div className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                          {t("ddl.namingFixColumnsSummary", { count: validation.invalidColumns.length })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={cancelNameFix}>
              {t("common.cancel")}
            </Button>
            <Button variant="outline" onClick={() => resolveNameFix(false)}>
              {t("ddl.continueWithoutFix")}
            </Button>
            <Button onClick={() => resolveNameFix(true)}>
              {t("ddl.applySelectedFixes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
