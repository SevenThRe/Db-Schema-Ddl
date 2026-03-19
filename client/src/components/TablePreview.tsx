import { useTableInfo } from "@/hooks/use-ddl";
import { Loader2, AlertTriangle, Key, ChevronLeft, ChevronRight, Filter, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TableInfo, ColumnInfo } from "@shared/schema";
import { validateTablePhysicalNames } from "@/lib/physical-name-utils";
import { translateApiError } from "@/lib/api-error";
import { useTranslation } from "react-i18next";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";

interface TablePreviewProps {
  fileId: number | null;
  sheetName: string | null;
  selectionMemoryKey?: string | null;
  jumpToPhysicalTableName?: string | null;
  jumpToken?: number;
  onTablesLoaded?: (tables: TableInfo[]) => void;
  onCurrentTableChange?: (table: TableInfo | null, index: number) => void;
}

const TABLE_COLUMN_GRID_CLASS =
  "grid grid-cols-[56px_44px_minmax(180px,_1fr)_minmax(180px,_1fr)_120px_88px_84px] gap-2 px-4";
const COMPACT_TABLE_GRID_CLASS =
  "grid grid-cols-[56px_minmax(240px,_1.1fr)_minmax(220px,_1fr)] gap-2 px-4";
const COMPACT_TABLE_BREAKPOINT = 980;
const TOOLBAR_ICON_BUTTON_CLASS =
  "h-8 w-8 shrink-0 rounded-full border-[color:var(--button-outline)] bg-white/86 text-[hsl(var(--workspace-ink-soft))] shadow-sm hover:bg-accent/80";
const TOOLBAR_BUTTON_CLASS =
  "h-8 px-3 text-[11px] rounded-full border-[color:var(--button-outline)] bg-white/86 font-medium text-[hsl(var(--workspace-ink-soft))] shadow-sm hover:bg-accent/80";
const LAST_SELECTED_TABLE_STORAGE_KEY = "tablePreview:lastSelectedTableByFileSheet";

type StoredTableSelections = Record<string, string>;

function readStoredTableSelections(): StoredTableSelections {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(LAST_SELECTED_TABLE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const normalized: StoredTableSelections = {};
    for (const [scopeKey, tableName] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof tableName === "string" && tableName.trim()) {
        normalized[scopeKey] = tableName.trim();
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

function buildTableSelectionStorageKey(scopeKey: string | null, sheetName: string | null): string | null {
  if (!scopeKey || !sheetName) {
    return null;
  }
  const normalizedSheetName = sheetName.trim();
  if (!normalizedSheetName) {
    return null;
  }
  return `${scopeKey}::${normalizedSheetName}`;
}

function columnLabelToNumber(label: string): number {
  let result = 0;
  const normalized = label.toUpperCase();
  for (let index = 0; index < normalized.length; index += 1) {
    result = result * 26 + (normalized.charCodeAt(index) - 64);
  }
  return result;
}

function extractColumnRangeFromInput(input: string): { start: number; end: number } | null {
  const matches = Array.from(input.toUpperCase().matchAll(/([A-Z]+)\d*/g)).map((match) => match[1]);
  if (matches.length === 0) return null;

  const first = columnLabelToNumber(matches[0]);
  if (matches.length === 1) {
    return { start: first, end: first };
  }

  const second = columnLabelToNumber(matches[1]);
  return {
    start: Math.min(first, second),
    end: Math.max(first, second),
  };
}

function getTableColumnSpan(table: TableInfo): { start: number; end: number } | null {
  if (table.excelRange) {
    const matched = table.excelRange.toUpperCase().match(/^([A-Z]+)\d+(?::([A-Z]+)\d+)?$/);
    if (matched) {
      const start = columnLabelToNumber(matched[1]);
      const end = columnLabelToNumber(matched[2] || matched[1]);
      return { start: Math.min(start, end), end: Math.max(start, end) };
    }
  }

  const startLabel = table.columnRange?.startColLabel;
  if (startLabel) {
    const endLabel = table.columnRange?.endColLabel || startLabel;
    const start = columnLabelToNumber(startLabel);
    const end = columnLabelToNumber(endLabel);
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }

  return null;
}

function toTypeDisplay(column: ColumnInfo): string {
  const rawType = (column.dataType || "").trim();
  const rawSize = (column.size || "").trim();
  if (!rawType && !rawSize) return "-";
  if (!rawType) return rawSize;
  if (!rawSize || rawType.includes("(")) return rawType;
  return `${rawType}(${rawSize})`;
}

// 单个表格预览组件
function SingleTablePreview({ table, compactMode }: { table: TableInfo; compactMode: boolean }) {
  const { t } = useTranslation();
  const validation = useMemo(() => validateTablePhysicalNames(table), [table]);
  const invalidColumnIndexSet = useMemo(() => {
    return new Set(validation.invalidColumns.map((item) => item.columnIndex));
  }, [validation.invalidColumns]);
  const invalidColumnMap = useMemo(() => {
    return new Map(validation.invalidColumns.map((item) => [item.columnIndex, item]));
  }, [validation.invalidColumns]);

  return (
    <div className="space-y-4">
      <div className="panel-surface-muted p-4">
        <p className="section-kicker">Selected Table</p>
        <h2 className="mt-2 flex flex-wrap items-center gap-2.5 text-[1.15rem] font-semibold tracking-tight text-[hsl(var(--workspace-ink))]">
          {table.logicalTableName || "Untitled Table"}
          <Badge variant="outline" className="rounded-full border-white/80 bg-white/80 font-mono font-normal text-xs text-muted-foreground">
            {table.physicalTableName || "NO_PHYSICAL_NAME"}
          </Badge>
          {validation.hasIssues && (
            <Badge
              variant="destructive"
              className="h-5 px-2 py-0.5 font-normal text-xs leading-none"
            >
              {t("table.namingWarningBadge")}
            </Badge>
          )}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-full border-white/80 bg-white/82 px-2.5 py-1 text-[10px] font-medium">
            {table.columns.length} {t("table.columns")}
          </Badge>
          <Badge variant="outline" className="rounded-full border-white/80 bg-white/82 px-2.5 py-1 text-[10px] font-medium">
            {compactMode ? "Compact grid" : "Full grid"}
          </Badge>
        </div>
      </div>

      {validation.hasIssues && (
        <div className="rounded-[22px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <div className="font-medium text-amber-700 dark:text-amber-300">
            {t("table.namingWarningTitle")}
          </div>
          <ul className="mt-1.5 list-disc pl-5 text-amber-700/90 dark:text-amber-200/90 space-y-1">
            {validation.hasInvalidTableName && (
              <li className="font-mono text-xs break-all whitespace-normal">
                {validation.tableNameCurrent || "(empty)"} {"->"} {validation.tableNameSuggested}
              </li>
            )}
            {validation.invalidColumns.length > 0 && (
              <li>
                {t("table.namingWarningColumns", { count: validation.invalidColumns.length })}
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-[24px] border border-white/70 bg-white/84 shadow-[0_18px_60px_-34px_hsl(var(--workspace-shadow)/0.3)]">
        {compactMode ? (
          <div>
            <div className={cn(COMPACT_TABLE_GRID_CLASS, "border-b border-border/70 bg-[hsl(var(--panel-muted)/0.92)] py-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground")}>
              <div>No.</div>
              <div>{t("table.logicalName")}</div>
              <div>{t("table.physicalName")}</div>
            </div>
            <div>
              {table.columns.map((col, index) => (
                <div
                  key={index}
                  className={cn(
                    COMPACT_TABLE_GRID_CLASS,
                    "items-start border-b border-border/70 py-2.5 text-xs transition-colors hover:bg-[hsl(var(--panel-muted)/0.62)]",
                  )}
                >
                  <div className="pt-0.5 font-mono text-xs text-muted-foreground">{col.no || index + 1}</div>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "font-medium min-w-0 truncate",
                        col.isPk ? "text-amber-700 dark:text-amber-300" : "text-foreground",
                      )}
                      title={col.logicalName}
                    >
                      <span className="inline-flex items-center gap-1 min-w-0">
                        {col.isPk && <Key className="w-3.5 h-3.5 rotate-45 shrink-0" />}
                        <span className="truncate">{col.logicalName || "-"}</span>
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="font-mono text-[10px] uppercase font-bold tracking-wider">
                        {toTypeDisplay(col)}
                      </Badge>
                      {col.notNull && (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-semibold text-[#f87171] border-[#f87171]/40 bg-[#f87171]/10"
                        >
                          {t("table.notNull")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "font-mono text-xs min-w-0 truncate pt-0.5",
                      invalidColumnIndexSet.has(index) ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                    )}
                    title={col.physicalName}
                  >
                    <div>{col.physicalName || "-"}</div>
                    {invalidColumnIndexSet.has(index) && (
                      <div className="text-[10px] leading-tight mt-0.5 opacity-90 break-all whitespace-normal">
                        {"->"} {invalidColumnMap.get(index)?.suggestedName}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className={cn(TABLE_COLUMN_GRID_CLASS, "border-b border-border/70 bg-[hsl(var(--panel-muted)/0.92)] py-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground")}>
                <div>No.</div>
                <div></div>
                <div>{t("table.logicalName")}</div>
                <div>{t("table.physicalName")}</div>
                <div>{t("table.type")}</div>
                <div>{t("table.size")}</div>
                <div className="text-center">{t("table.null")}</div>
              </div>
              <div>
                {table.columns.map((col, index) => (
                  <div
                    key={index}
                  className={cn(
                      TABLE_COLUMN_GRID_CLASS,
                      "items-center border-b border-border/70 py-2.5 text-xs transition-colors hover:bg-[hsl(var(--panel-muted)/0.62)]",
                    )}
                  >
                    <div className="font-mono text-xs text-muted-foreground">{col.no || index + 1}</div>
                    <div>
                      {col.isPk && (
                        <Key className="w-3.5 h-3.5 text-amber-500 rotate-45" />
                      )}
                    </div>
                    <div className="font-medium text-foreground min-w-0 truncate" title={col.logicalName}>
                      {col.logicalName || "-"}
                    </div>
                    <div
                      className={cn(
                        "font-mono text-xs min-w-0 truncate",
                        invalidColumnIndexSet.has(index) ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                      )}
                      title={col.physicalName}
                    >
                      <div>{col.physicalName || "-"}</div>
                      {invalidColumnIndexSet.has(index) && (
                        <div className="text-[10px] leading-tight mt-0.5 opacity-90 break-all whitespace-normal">
                          {"->"} {invalidColumnMap.get(index)?.suggestedName}
                        </div>
                      )}
                    </div>
                    <div>
                      <Badge variant="secondary" className="font-mono text-[10px] uppercase font-bold tracking-wider">
                        {col.dataType}
                      </Badge>
                    </div>
                    <div className="font-mono text-xs">{col.size}</div>
                    <div className="text-center">
                      {col.notNull ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-red-400" title={t("table.notNull")} />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700" title={t("table.nullable")} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TablePreview({
  fileId,
  sheetName,
  selectionMemoryKey,
  jumpToPhysicalTableName,
  jumpToken,
  onTablesLoaded,
  onCurrentTableChange,
}: TablePreviewProps) {
  const { data: tables, isLoading, error } = useTableInfo(fileId, sheetName);
  const tableList = (tables ?? []) as TableInfo[];
  const { t } = useTranslation();
  const translatedError = useMemo(
    () => (error ? translateApiError(error, t, { includeIssues: true, maxIssues: 2 }) : null),
    [error, t],
  );
  const [currentTableIndex, setCurrentTableIndex] = useState(0);
  const [tableFilterQuery, setTableFilterQuery] = useState("");
  const [columnFilterQuery, setColumnFilterQuery] = useState("");
  const [showFilterBar, setShowFilterBar] = useState(false);
  const contentContainerRef = useRef<HTMLDivElement | null>(null);
  const [isCompactColumns, setIsCompactColumns] = useState(false);
  const [lastSelectedTableByScope, setLastSelectedTableByScope] = useState<StoredTableSelections>(() =>
    readStoredTableSelections(),
  );
  const selectionScopeKey = useMemo(() => {
    const normalizedMemoryKey = (selectionMemoryKey || "").trim();
    if (normalizedMemoryKey) {
      return normalizedMemoryKey;
    }
    if (fileId == null) {
      return null;
    }
    return `id:${fileId}`;
  }, [fileId, selectionMemoryKey]);
  const tableSelectionStorageKey = useMemo(
    () => buildTableSelectionStorageKey(selectionScopeKey, sheetName),
    [selectionScopeKey, sheetName],
  );

  useEffect(() => {
    setCurrentTableIndex(0);
    setTableFilterQuery("");
    setColumnFilterQuery("");
    setShowFilterBar(false);
  }, [fileId, sheetName]);

  useEffect(() => {
    const container = contentContainerRef.current;
    if (!container) {
      return;
    }

    const updateCompactState = () => {
      setIsCompactColumns(container.clientWidth < COMPACT_TABLE_BREAKPOINT);
    };

    updateCompactState();
    const observer = new ResizeObserver(updateCompactState);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onTablesLoaded?.(tableList);
  }, [tableList, onTablesLoaded]);

  const filteredEntries = useMemo(() => {
    const query = tableFilterQuery.trim().toLowerCase();
    const columnRangeFilter = extractColumnRangeFromInput(columnFilterQuery);

    return tableList
      .map((table, absoluteIndex) => ({ table, absoluteIndex }))
      .filter(({ table }) => {
        if (query) {
          const logicalName = (table.logicalTableName || "").toLowerCase();
          const physicalName = (table.physicalTableName || "").toLowerCase();
          const matchedByText = logicalName.includes(query) || physicalName.includes(query);
          if (!matchedByText) return false;
        }

        if (columnRangeFilter) {
          const tableSpan = getTableColumnSpan(table);
          if (!tableSpan) return false;
          const intersects =
            tableSpan.start <= columnRangeFilter.end &&
            tableSpan.end >= columnRangeFilter.start;
          if (!intersects) return false;
        }

        return true;
      });
  }, [tableList, tableFilterQuery, columnFilterQuery]);

  const hasActiveFilters = tableFilterQuery.trim().length > 0 || columnFilterQuery.trim().length > 0;

  useEffect(() => {
    if (filteredEntries.length === 0) {
      return;
    }
    const stillVisible = filteredEntries.some((entry) => entry.absoluteIndex === currentTableIndex);
    if (!stillVisible) {
      setCurrentTableIndex(filteredEntries[0].absoluteIndex);
    }
  }, [filteredEntries, currentTableIndex]);

  const currentTable = useMemo(() => {
    if (tableList.length === 0) return null;
    return tableList[currentTableIndex] || tableList[0];
  }, [tableList, currentTableIndex]);

  const currentVisiblePosition = useMemo(() => {
    if (filteredEntries.length === 0) return 0;
    const foundIndex = filteredEntries.findIndex((entry) => entry.absoluteIndex === currentTableIndex);
    return foundIndex >= 0 ? foundIndex + 1 : 1;
  }, [filteredEntries, currentTableIndex]);

  useEffect(() => {
    if (!tableSelectionStorageKey || tableList.length === 0) {
      return;
    }

    const rememberedTableName = lastSelectedTableByScope[tableSelectionStorageKey];
    if (!rememberedTableName) {
      return;
    }

    const normalizedRemembered = rememberedTableName.trim().toLowerCase();
    if (!normalizedRemembered) {
      return;
    }

    const targetIndex = tableList.findIndex((table) => {
      return (table.physicalTableName || "").trim().toLowerCase() === normalizedRemembered;
    });
    if (targetIndex >= 0 && targetIndex !== currentTableIndex) {
      setCurrentTableIndex(targetIndex);
    }
  }, [currentTableIndex, lastSelectedTableByScope, tableList, tableSelectionStorageKey]);

  useEffect(() => {
    if (!tableSelectionStorageKey || !currentTable) {
      return;
    }

    const physicalTableName = (currentTable.physicalTableName || "").trim();
    if (!physicalTableName) {
      return;
    }

    setLastSelectedTableByScope((previous) =>
      previous[tableSelectionStorageKey] === physicalTableName
        ? previous
        : { ...previous, [tableSelectionStorageKey]: physicalTableName },
    );
  }, [currentTable, tableSelectionStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(
        LAST_SELECTED_TABLE_STORAGE_KEY,
        JSON.stringify(lastSelectedTableByScope),
      );
    } catch {
      // Ignore storage write errors.
    }
  }, [lastSelectedTableByScope]);

  // 通知父组件当前选中的表发生了变化
  useEffect(() => {
    if (onCurrentTableChange) {
      onCurrentTableChange(currentTable, currentTableIndex);
    }
  }, [currentTable, currentTableIndex, onCurrentTableChange]);

  useEffect(() => {
    if (!jumpToPhysicalTableName || tableList.length === 0) {
      return;
    }

    const target = jumpToPhysicalTableName.trim().toLowerCase();
    if (!target) {
      return;
    }

    const targetIndex = tableList.findIndex((table: TableInfo) => {
      return (table.physicalTableName || "").trim().toLowerCase() === target;
    });

    if (targetIndex >= 0) {
      const hiddenByFilter = !filteredEntries.some((entry) => entry.absoluteIndex === targetIndex);
      if (hiddenByFilter) {
        setTableFilterQuery("");
      }
      setCurrentTableIndex(targetIndex);
    }
  }, [tableList, filteredEntries, jumpToPhysicalTableName, jumpToken]);

  // 检测是否有重复的表名（同一个表的多个版本）
  const tablesWithNamingWarnings = useMemo(() => {
    if (filteredEntries.length === 0) return 0;
    return filteredEntries.filter(({ table }) => validateTablePhysicalNames(table).hasIssues).length;
  }, [filteredEntries]);

  // 为表生成显示名称（包含 Excel 范围）
  const getTableDisplayName = useCallback((table: TableInfo, index: number) => {
    const baseName = table.logicalTableName || table.physicalTableName || `Table ${index + 1}`;

    // 如果有 Excel 范围信息，添加到名称后面
    if (table.excelRange) {
      return `${baseName} [${table.excelRange}]`;
    }

    // 如果没有完整的 excelRange 但有列范围，构造简化版本
    if (table.columnRange?.startColLabel && table.rowRange) {
      const rangeLabel = `${table.columnRange.startColLabel}${table.rowRange.startRow + 1}:${table.columnRange.endColLabel || '?'}${table.rowRange.endRow + 1}`;
      return `${baseName} [${rangeLabel}]`;
    }

    return baseName;
  }, []);

  if (!fileId || !sheetName) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-muted-foreground">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/80">
          <AlertTriangle className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-foreground">{t("table.selectSheet")}</p>
        <p className="mt-1 text-xs">先锁定工作表，再进入表结构预览。</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
        <p>{t("table.parsing")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-500">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{t("table.invalidDefinition")}</h3>
        <p className="text-muted-foreground text-sm">
          {translatedError?.description || t("table.parseError")}
        </p>
      </div>
    );
  }

  if (tableList.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-muted-foreground">
        <AlertTriangle className="mb-4 h-8 w-8 opacity-50" />
        <p className="text-sm">{t("table.noTables")}</p>
        <p className="mt-1 text-xs">这个工作表还没有形成可预览的表定义。</p>
      </div>
    );
  }

  if (filteredEntries.length === 0) {
    return (
      <div className="flex flex-col h-full bg-background/40">
        <div className="space-y-2 border-b border-white/70 bg-white/70 px-4 py-3 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[220px]">
              <p className="section-kicker">Table Preview</p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {t("table.tablesFound", { count: tableList.length })} <span className="font-medium text-foreground">{sheetName}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showFilterBar || hasActiveFilters ? "secondary" : "outline"}
                size="icon"
                className={TOOLBAR_ICON_BUTTON_CLASS}
                aria-label={t("ddl.filterByColumn")}
                onClick={() => setShowFilterBar((previous) => !previous)}
              >
                <Filter className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {(showFilterBar || hasActiveFilters) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="relative w-full max-w-[360px]">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={tableFilterQuery}
                  onChange={(event) => setTableFilterQuery(event.target.value)}
                  placeholder={t("ddl.searchTables")}
                  className="h-7 pl-8 text-xs"
                />
              </div>
              <div className="relative w-[96px] sm:w-[108px] shrink-0">
                <Input
                  value={columnFilterQuery}
                  onChange={(event) => setColumnFilterQuery(event.target.value)}
                  placeholder="B-E"
                  className="h-7 text-xs px-2.5"
                  title={t("ddl.filterByColumn")}
                />
              </div>
              {hasActiveFilters ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className={TOOLBAR_ICON_BUTTON_CLASS}
                  onClick={() => {
                    setTableFilterQuery("");
                    setColumnFilterQuery("");
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mb-4 opacity-50" />
          <p className="text-sm">{t("search.noResults")}</p>
          <p className="mt-1 text-xs">试试清空筛选条件，或者回到工作表列表重新选择范围。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,hsl(var(--panel-muted)/0.48),transparent_24%)]">
      <div className="space-y-2 border-b border-white/70 bg-white/70 px-4 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[220px]">
            <p className="section-kicker">Table Preview</p>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {t("table.tablesFound", { count: filteredEntries.length })} <span className="font-medium text-foreground">{sheetName}</span>
              {tableList.length > 0 && filteredEntries.length !== tableList.length && (
                <span className="ml-2 text-[11px] text-muted-foreground">({filteredEntries.length}/{tableList.length})</span>
              )}
            </p>
            {tablesWithNamingWarnings > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                {t("table.namingWarningSummary", { count: tablesWithNamingWarnings })}
              </p>
            )}
          </div>

          {filteredEntries.length > 0 && (
            <div className="min-w-0 flex items-center gap-1.5 overflow-x-auto">
              <Button
                variant={showFilterBar || hasActiveFilters ? "secondary" : "outline"}
                size="icon"
                className={TOOLBAR_ICON_BUTTON_CLASS}
                aria-label={t("ddl.searchTables")}
                onClick={() => setShowFilterBar((previous) => !previous)}
              >
                <Filter className="w-3.5 h-3.5" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                className={cn(TOOLBAR_BUTTON_CLASS, "shrink-0")}
                aria-label="Previous table"
                onClick={() => {
                  const currentPosition = filteredEntries.findIndex((entry) => entry.absoluteIndex === currentTableIndex);
                  if (currentPosition <= 0) return;
                  setCurrentTableIndex(filteredEntries[currentPosition - 1].absoluteIndex);
                }}
                disabled={currentVisiblePosition <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <Select
                value={currentTableIndex.toString()}
                onValueChange={(value) => setCurrentTableIndex(Number.parseInt(value, 10))}
              >
                <SelectTrigger className={cn(
                  "max-w-[60vw] h-8 shrink-0 rounded-full border-[color:var(--button-outline)] bg-white/86 text-xs shadow-sm hover:bg-accent/80",
                  isCompactColumns ? "w-[180px] min-w-[130px] sm:w-[210px] sm:min-w-[150px]" : "w-[220px] min-w-[140px] sm:w-[270px] sm:min-w-[170px]",
                )}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filteredEntries.map(({ table, absoluteIndex }, idx: number) => {
                    const hasNameIssues = validateTablePhysicalNames(table).hasIssues;
                    return (
                      <SelectItem
                        key={`${table.physicalTableName || "table"}-${absoluteIndex}`}
                        value={absoluteIndex.toString()}
                        className={cn(
                          hasNameIssues &&
                            "bg-amber-50 text-amber-800 focus:bg-amber-100 focus:text-amber-900 dark:bg-amber-900/25 dark:text-amber-200 dark:focus:bg-amber-900/40",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate">{getTableDisplayName(table, idx)}</span>
                          {hasNameIssues && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              {t("table.namingWarningBadge")}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                className={cn(TOOLBAR_BUTTON_CLASS, "shrink-0")}
                aria-label="Next table"
                onClick={() => {
                  const currentPosition = filteredEntries.findIndex((entry) => entry.absoluteIndex === currentTableIndex);
                  if (currentPosition < 0 || currentPosition >= filteredEntries.length - 1) return;
                  setCurrentTableIndex(filteredEntries[currentPosition + 1].absoluteIndex);
                }}
                disabled={currentVisiblePosition >= filteredEntries.length}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>

              <span className="text-[11px] text-muted-foreground ml-1 shrink-0 hidden sm:inline">
                {currentVisiblePosition} / {filteredEntries.length}
              </span>
            </div>
          )}
        </div>

        {(showFilterBar || hasActiveFilters) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="relative w-full max-w-[360px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={tableFilterQuery}
                onChange={(event) => setTableFilterQuery(event.target.value)}
                placeholder={t("ddl.searchTables")}
                className="h-7 pl-8 text-xs"
              />
            </div>
            <div className="relative w-[96px] sm:w-[108px] shrink-0">
              <Input
                value={columnFilterQuery}
                onChange={(event) => setColumnFilterQuery(event.target.value)}
                placeholder="B-E"
                className="h-7 text-xs px-2.5"
                title={t("ddl.filterByColumn")}
              />
            </div>
            {hasActiveFilters ? (
              <Button
                variant="ghost"
                size="icon"
                className={TOOLBAR_ICON_BUTTON_CLASS}
                onClick={() => {
                  setTableFilterQuery("");
                  setColumnFilterQuery("");
                }}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <div ref={contentContainerRef} className="flex-1 overflow-auto px-4 py-4 md:px-5 md:py-5">
        {currentTable && <SingleTablePreview table={currentTable} compactMode={isCompactColumns} />}
      </div>
    </div>
  );
}
