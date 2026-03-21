import { useTableInfo } from "@/hooks/use-ddl";
import { Loader2, AlertTriangle, Key, ChevronLeft, ChevronRight, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue } from "react";

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
  "h-8 w-8 shrink-0 rounded-md border border-border bg-background text-muted-foreground hover:bg-muted/40";
const TOOLBAR_BUTTON_CLASS =
  "h-8 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40";
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
    <div className="space-y-0 border-b border-border bg-background">
      <div className="border-b border-border px-4 py-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-semibold text-foreground">
              {table.logicalTableName || "Untitled Table"}
            </h2>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {table.physicalTableName || "NO_PHYSICAL_NAME"}
            </p>
          </div>
          {validation.hasIssues ? (
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">
              Warning
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {table.columns.length} {t("table.columns")} · {compactMode ? "紧凑视图" : "完整视图"}
        </p>
      </div>

      {validation.hasIssues && (
        <div className="border-b border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-200">
          <div className="text-xs font-medium">{t("table.namingWarningTitle")}</div>
          <div className="mt-1 text-xs leading-5">
            {validation.hasInvalidTableName ? (
              <span className="font-mono break-all">
                {validation.tableNameCurrent || "(empty)"} {"->"} {validation.tableNameSuggested}
              </span>
            ) : null}
            {validation.hasInvalidTableName && validation.invalidColumns.length > 0 ? " · " : null}
            {validation.invalidColumns.length > 0 ? t("table.namingWarningColumns", { count: validation.invalidColumns.length }) : null}
          </div>
        </div>
      )}

      <div className="overflow-hidden bg-background">
        {compactMode ? (
          <div>
            <div className={cn(COMPACT_TABLE_GRID_CLASS, "border-b border-border bg-muted/20 py-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground")}>
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
                    "items-start border-b border-border py-2.5 text-xs transition-colors hover:bg-muted/20",
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
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {toTypeDisplay(col)}
                      </span>
                      {col.notNull && <Badge variant="outline" className="text-red-700 dark:text-red-300">{t("table.notNull")}</Badge>}
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
              <div className={cn(TABLE_COLUMN_GRID_CLASS, "border-b border-border bg-muted/20 py-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground")}>
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
                      "items-center border-b border-border py-2.5 text-xs transition-colors hover:bg-muted/20",
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
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {toTypeDisplay(col)}
                    </div>
                    <div className="font-mono text-xs">{col.size}</div>
                    <div className="text-center">
                      {col.notNull ? (
                        <Badge variant="outline" className="px-1.5 text-red-700 dark:text-red-300" title={t("table.notNull")}>NN</Badge>
                      ) : (
                        <Badge variant="outline" className="px-1.5 text-muted-foreground" title={t("table.nullable")}>NULL</Badge>
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
  const [isTableSelectOpen, setIsTableSelectOpen] = useState(false);
  const contentContainerRef = useRef<HTMLDivElement | null>(null);
  const [isCompactColumns, setIsCompactColumns] = useState(false);
  const [lastSelectedTableByScope, setLastSelectedTableByScope] = useState<StoredTableSelections>(() =>
    readStoredTableSelections(),
  );
  const restoredSelectionScopeRef = useRef<string | null>(null);
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
  const rememberedTableName = tableSelectionStorageKey
    ? lastSelectedTableByScope[tableSelectionStorageKey] ?? null
    : null;

  const deferredTableFilterQuery = useDeferredValue(tableFilterQuery);
  const deferredColumnFilterQuery = useDeferredValue(columnFilterQuery);

  const handleFilterInputFocus = useCallback(() => {
    setIsTableSelectOpen(false);
  }, []);

  const handleFilterInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    setIsTableSelectOpen(false);
  }, []);

  const handleTableFilterChange = useCallback((value: string) => {
    setIsTableSelectOpen(false);
    setTableFilterQuery(value);
  }, []);

  const handleColumnFilterChange = useCallback((value: string) => {
    setIsTableSelectOpen(false);
    setColumnFilterQuery(value);
  }, []);

  useEffect(() => {
    setCurrentTableIndex(0);
    setTableFilterQuery("");
    setColumnFilterQuery("");
    setShowFilterBar(false);
    setIsTableSelectOpen(false);
    restoredSelectionScopeRef.current = null;
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
    const query = deferredTableFilterQuery.trim().toLowerCase();
    const columnRangeFilter = extractColumnRangeFromInput(deferredColumnFilterQuery);

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
  }, [deferredColumnFilterQuery, deferredTableFilterQuery, tableList]);

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

    if (restoredSelectionScopeRef.current === tableSelectionStorageKey) {
      return;
    }

    if (!rememberedTableName) {
      restoredSelectionScopeRef.current = tableSelectionStorageKey;
      return;
    }

    const normalizedRemembered = rememberedTableName.trim().toLowerCase();
    if (!normalizedRemembered) {
      restoredSelectionScopeRef.current = tableSelectionStorageKey;
      return;
    }

    const targetIndex = tableList.findIndex((table) => {
      return (table.physicalTableName || "").trim().toLowerCase() === normalizedRemembered;
    });
    if (targetIndex < 0) {
      restoredSelectionScopeRef.current = tableSelectionStorageKey;
      return;
    }

    restoredSelectionScopeRef.current = tableSelectionStorageKey;
    setCurrentTableIndex((previousIndex) => {
      const currentPhysicalTableName = (tableList[previousIndex]?.physicalTableName || "").trim().toLowerCase();
      return currentPhysicalTableName === normalizedRemembered ? previousIndex : targetIndex;
    });
  }, [rememberedTableName, tableList, tableSelectionStorageKey]);

  useEffect(() => {
    if (!tableSelectionStorageKey || !currentTable) {
      return;
    }
    if (restoredSelectionScopeRef.current !== tableSelectionStorageKey) {
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
        <AlertTriangle className="mb-3 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">{t("table.selectSheet")}</p>
        <p className="mt-1 text-xs">先选择工作表。</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">{t("table.parsing")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center p-8 text-center">
        <AlertTriangle className="mb-3 h-8 w-8 text-red-500" />
        <h3 className="mb-2 text-base font-semibold text-foreground">{t("table.invalidDefinition")}</h3>
        <p className="text-muted-foreground text-sm">
          {translatedError?.description || t("table.parseError")}
        </p>
      </div>
    );
  }

  if (tableList.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-muted-foreground">
        <AlertTriangle className="mb-3 h-8 w-8 opacity-50" />
        <p className="text-sm">{t("table.noTables")}</p>
        <p className="mt-1 text-xs">当前工作表没有可预览的表定义。</p>
      </div>
    );
  }

  if (filteredEntries.length === 0) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="space-y-2 border-b border-border bg-background px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[220px] flex-1">
              <div className="text-sm font-semibold text-foreground">表预览</div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{sheetName}</span> · {t("table.tablesFound", { count: tableList.length })}
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
                  onChange={(event) => handleTableFilterChange(event.target.value)}
                  placeholder={t("ddl.searchTables")}
                  className="h-8 pl-8 text-xs"
                  onFocus={handleFilterInputFocus}
                  onKeyDown={handleFilterInputKeyDown}
                />
              </div>
              <div className="relative w-[96px] sm:w-[108px] shrink-0">
                <Input
                  value={columnFilterQuery}
                  onChange={(event) => handleColumnFilterChange(event.target.value)}
                  placeholder="B-E"
                  className="h-8 text-xs px-2.5"
                  title={t("ddl.filterByColumn")}
                  onFocus={handleFilterInputFocus}
                  onKeyDown={handleFilterInputKeyDown}
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
          <AlertTriangle className="mb-3 h-8 w-8 opacity-50" />
          <p className="text-sm">{t("search.noResults")}</p>
          <p className="mt-1 text-xs">清空筛选后再试。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="space-y-2 border-b border-border bg-background px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="text-sm font-semibold text-foreground">表预览</div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{sheetName}</span> · {t("table.tablesFound", { count: filteredEntries.length })}
              {tableList.length > 0 && filteredEntries.length !== tableList.length && (
                <span className="ml-2 text-xs text-muted-foreground">({filteredEntries.length}/{tableList.length})</span>
              )}
            </p>
            {tablesWithNamingWarnings > 0 && (
              <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
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
                open={isTableSelectOpen}
                onOpenChange={setIsTableSelectOpen}
              >
                <SelectTrigger className={cn(
                  "max-w-[60vw] h-8 shrink-0 rounded-md border border-border bg-background text-xs",
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
                            <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
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

              <span className="ml-1 shrink-0 hidden text-xs text-muted-foreground sm:inline">
                {currentVisiblePosition} / {filteredEntries.length}
              </span>
            </div>
          )}
        </div>

        {(showFilterBar || hasActiveFilters) && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-muted/10 px-3 py-2">
            <div className="relative w-full max-w-[360px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={tableFilterQuery}
                onChange={(event) => handleTableFilterChange(event.target.value)}
                placeholder={t("ddl.searchTables")}
                className="h-8 pl-8 text-xs"
                onFocus={handleFilterInputFocus}
                onKeyDown={handleFilterInputKeyDown}
              />
            </div>
            <div className="relative w-[96px] sm:w-[108px] shrink-0">
              <Input
                value={columnFilterQuery}
                onChange={(event) => handleColumnFilterChange(event.target.value)}
                placeholder="B-E"
                className="h-8 text-xs px-2.5"
                title={t("ddl.filterByColumn")}
                onFocus={handleFilterInputFocus}
                onKeyDown={handleFilterInputKeyDown}
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
            <span className="text-[10px] text-muted-foreground">
              {hasActiveFilters ? "筛选已应用" : "表名 / 列区间"}
            </span>
          </div>
        )}
      </div>

      <div ref={contentContainerRef} className="flex-1 overflow-auto px-3 py-3 md:px-4 md:py-4">
        {currentTable && <SingleTablePreview table={currentTable} compactMode={isCompactColumns} />}
      </div>
    </div>
  );
}
