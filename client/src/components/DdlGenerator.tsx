import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  useApplyNameFix,
  useFiles,
  useGenerateDdl,
  useNameFixPreview,
  useSettings,
  useSheets,
  useTableInfo,
} from "@/hooks/use-ddl";
import type {
  LengthOverflowStrategy,
  NameFixConflictStrategy,
  NameFixMode,
  NameFixPreviewResponse,
  NameFixScope,
  ReservedWordStrategy,
  TableInfo,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { translateApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { desktopBridge } from "@/lib/desktop-bridge";
import { autoFixTablePhysicalNames, validateTablePhysicalNames } from "@/lib/physical-name-utils";
import {
  formatLogicalPhysicalName,
  getSheetNameValue,
  parseUploadedAtMillis,
  renderNameDiffPair,
} from "@/components/ddl/name-fix-display-utils";
import {
  buildNameFixDialogOptions,
  NameFixLabelWithHelp,
} from "@/components/ddl/name-fix-options";
import { NameFixExecutionPanels } from "@/components/ddl/name-fix-panels";
import type { NameFixApplyResultState } from "@/components/ddl/name-fix-types";
import { Copy, Check, Code, Database, ArrowRight, Download, Search, SortAsc, AlertTriangle, WandSparkles, TextSelect } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStatusBarScope } from "@/status-bar/context";

interface DdlGeneratorProps {
  fileId: number | null;
  sheetName: string | null;
  overrideTables?: TableInfo[] | null;
  currentTable?: TableInfo | null;
  selectedTableNames?: Set<string>;
  onSelectedTableNamesChange?: (next: Set<string>) => void;
  onOpenImportWorkspace?: () => void;
}

interface MissingDataTypeIssue {
  key: string;
  tableIndex: number;
  columnIndex: number;
  tableLogicalName: string;
  tablePhysicalName: string;
  columnLogicalName: string;
  columnPhysicalName: string;
}

interface MissingDataTypeIssueGroup {
  groupKey: string;
  tableIndex: number;
  tableLogicalName: string;
  tablePhysicalName: string;
  issues: MissingDataTypeIssue[];
}

type NameFixBatchMode = "current_file" | "selected_files" | "all_files";

const DATA_TYPE_SELECTION_OPTIONS = [
  "varchar",
  "char",
  "tinyint",
  "smallint",
  "int",
  "integer",
  "bigint",
  "date",
  "datetime",
  "timestamp",
  "text",
  "mediumtext",
  "longtext",
  "decimal",
  "numeric",
  "float",
  "double",
  "boolean",
  "bool",
  "blob",
  "json",
] as const;

const DATA_TYPE_SIZE_RULES: Partial<Record<(typeof DATA_TYPE_SELECTION_OPTIONS)[number], "none" | "integer" | "numeric">> = {
  varchar: "integer",
  char: "integer",
  tinyint: "integer",
  smallint: "integer",
  int: "integer",
  integer: "integer",
  bigint: "integer",
  datetime: "integer",
  timestamp: "integer",
  decimal: "numeric",
  numeric: "numeric",
  float: "numeric",
  double: "numeric",
};

const INTEGER_SIZE_PATTERN = /^\d+$/;
const NUMERIC_SIZE_PATTERN = /^\d+(?:\s*,\s*\d+)?$/;

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
  plain: "text-slate-800 dark:text-[#cccccc]",
  keyword: "font-semibold text-slate-700 dark:text-[#569cd6]",
  type: "text-sky-700 dark:text-[#4ec9b0]",
  identifier: "text-slate-900 dark:text-[#d4d4d4]",
  string: "text-emerald-800 dark:text-[#ce9178]",
  comment: "italic text-slate-500 dark:text-[#6a9955]",
  number: "text-violet-700 dark:text-[#b5cea8]",
  operator: "text-slate-500 dark:text-[#888888]",
};

function DialectMark({ dialect }: { dialect: "mysql" | "oracle" }) {
  const isMySql = dialect === "mysql";
  return (
    <span
      className={
        isMySql
          ? "inline-flex h-5 w-5 items-center justify-center rounded-sm border border-sky-300/80 bg-sky-50 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
          : "inline-flex h-5 w-5 items-center justify-center rounded-sm border border-rose-300/80 bg-rose-50 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
      }
      aria-hidden="true"
    >
      {isMySql ? "MY" : "OR"}
    </span>
  );
}

interface NameFixFileVersionMeta {
  versionNumber: number;
  versionCount: number;
  shortHash: string;
}

interface DdlGenerationWarning {
  code: "AUTO_INCREMENT_IGNORED" | "AUTO_INCREMENT_DIALECT_UNSUPPORTED";
  tableName: string;
  columnName: string;
  message: string;
  reason?: string;
}

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

function formatZipTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function sanitizeSheetNameForFilename(sheetName: string): string {
  return sheetName
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "")
    .slice(0, 64);
}

function deriveSheetNameHintFromTables(tables: TableInfo[]): string | undefined {
  const uniqueSheetNames = Array.from(
    new Set(
      tables
        .map((table) => table.sourceRef?.sheetName?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (uniqueSheetNames.length === 1) {
    return uniqueSheetNames[0];
  }
  return undefined;
}

function buildZipDownloadFilename(
  dialect: "mysql" | "oracle",
  sheetNameHint?: string,
  date: Date = new Date(),
): string {
  const timestamp = formatZipTimestamp(date);
  if (!sheetNameHint) {
    return `ddl_${dialect}_${timestamp}.zip`;
  }
  const safeSheetName = sanitizeSheetNameForFilename(sheetNameHint);
  if (!safeSheetName) {
    return `ddl_${dialect}_${timestamp}.zip`;
  }
  return `ddl_${dialect}_${safeSheetName}_${timestamp}.zip`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildSqlDownloadFilename(
  prefix: string,
  suffix: string,
  physicalName: string,
): string {
  return `${prefix}${physicalName}${suffix}.sql`;
}

function toDdlTablePayload(table: TableInfo): TableInfo {
  return {
    logicalTableName: table.logicalTableName,
    physicalTableName: table.physicalTableName,
    columns: table.columns.map((column) => ({
      no: column.no,
      logicalName: column.logicalName,
      physicalName: column.physicalName,
      dataType: column.dataType,
      size: column.size,
      notNull: column.notNull,
      isPk: column.isPk,
      autoIncrement: column.autoIncrement,
      comment: column.comment,
      commentRaw: column.commentRaw,
    })),
  };
}

interface SelectedTableEntry {
  sourceIndex: number;
  table: TableInfo;
}

interface TableReferenceOverridePayload {
  tableIndex: number;
  table: TableInfo;
}

function buildStableTableKey(table: TableInfo): string {
  return `${table.logicalTableName}::${table.physicalTableName}::${table.columns.length}`;
}

function alignEntriesWithResolvedTables(
  originalEntries: SelectedTableEntry[],
  resolvedTables: TableInfo[],
): SelectedTableEntry[] {
  if (resolvedTables.length === originalEntries.length) {
    return resolvedTables.map((table, index) => ({
      sourceIndex: originalEntries[index].sourceIndex,
      table,
    }));
  }

  const byReference = new Map<TableInfo, number>();
  originalEntries.forEach((entry, index) => {
    byReference.set(entry.table, index);
  });

  const usedIndexes = new Set<number>();
  const alignedEntries: SelectedTableEntry[] = [];

  resolvedTables.forEach((table) => {
    const referenceMatchIndex = byReference.get(table);
    if (referenceMatchIndex != null && !usedIndexes.has(referenceMatchIndex)) {
      usedIndexes.add(referenceMatchIndex);
      alignedEntries.push({
        sourceIndex: originalEntries[referenceMatchIndex].sourceIndex,
        table,
      });
      return;
    }

    const tableKey = buildStableTableKey(table);
    const keyMatchIndex = originalEntries.findIndex((entry, index) => {
      if (usedIndexes.has(index)) {
        return false;
      }
      return buildStableTableKey(entry.table) === tableKey;
    });
    if (keyMatchIndex >= 0) {
      usedIndexes.add(keyMatchIndex);
      alignedEntries.push({
        sourceIndex: originalEntries[keyMatchIndex].sourceIndex,
        table,
      });
      return;
    }

    const nextAvailableIndex = originalEntries.findIndex((_entry, index) => !usedIndexes.has(index));
    if (nextAvailableIndex >= 0) {
      usedIndexes.add(nextAvailableIndex);
      alignedEntries.push({
        sourceIndex: originalEntries[nextAvailableIndex].sourceIndex,
        table,
      });
    }
  });

  return alignedEntries;
}

function buildReferenceOverrides(
  sourceTables: TableInfo[],
  selectedEntries: SelectedTableEntry[],
): TableReferenceOverridePayload[] {
  return selectedEntries.flatMap((entry) => {
    const sourceTable = sourceTables[entry.sourceIndex];
    if (!sourceTable) {
      return [];
    }

    const sourcePayload = JSON.stringify(toDdlTablePayload(sourceTable));
    const currentPayload = toDdlTablePayload(entry.table);
    const currentPayloadSerialized = JSON.stringify(currentPayload);

    if (sourcePayload === currentPayloadSerialized) {
      return [];
    }

    return [
      {
        tableIndex: entry.sourceIndex,
        table: currentPayload,
      },
    ];
  });
}

function findTableIndex(sourceTables: TableInfo[], targetTable: TableInfo): number {
  const strictIndex = sourceTables.indexOf(targetTable);
  if (strictIndex >= 0) {
    return strictIndex;
  }

  const rangeAwareIndex = sourceTables.findIndex((table) => (
    table.physicalTableName === targetTable.physicalTableName
    && table.logicalTableName === targetTable.logicalTableName
    && table.excelRange === targetTable.excelRange
  ));
  if (rangeAwareIndex >= 0) {
    return rangeAwareIndex;
  }

  return sourceTables.findIndex((table) => (
    table.physicalTableName === targetTable.physicalTableName
    && table.logicalTableName === targetTable.logicalTableName
  ));
}

export function DdlGenerator({
  fileId,
  sheetName,
  overrideTables,
  currentTable,
  selectedTableNames,
  onSelectedTableNamesChange,
  onOpenImportWorkspace,
}: DdlGeneratorProps) {
  const CONTROL_BUTTON_CLASS = "h-8 rounded-lg text-xs";
  const desktopCapabilities = desktopBridge.getCapabilities();
  const supportsNameFix = desktopCapabilities.features.nameFix;
  const supportsDirectNameFixWrite = desktopCapabilities.runtime === "tauri";
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
  const [showMissingTypeDialog, setShowMissingTypeDialog] = useState(false);
  const [pendingMissingTypeTables, setPendingMissingTypeTables] = useState<TableInfo[]>([]);
  const [missingDataTypeIssues, setMissingDataTypeIssues] = useState<MissingDataTypeIssue[]>([]);
  const [missingDataTypeValues, setMissingDataTypeValues] = useState<Record<string, string>>({});
  const [missingDataTypeSizes, setMissingDataTypeSizes] = useState<Record<string, string>>({});
  const [missingTypeSelectedTableIndexes, setMissingTypeSelectedTableIndexes] = useState<Set<number>>(new Set());
  const [zipExportSummary, setZipExportSummary] = useState<{
    open: boolean;
    selectedCount: number;
    successCount: number;
    skippedCount: number;
    skippedTables: string[];
  }>({
    open: false,
    selectedCount: 0,
    successCount: 0,
    skippedCount: 0,
    skippedTables: [],
  });
  const [showSyncNameFixDialog, setShowSyncNameFixDialog] = useState(false);
  const [nameFixBatchMode, setNameFixBatchMode] = useState<NameFixBatchMode>("current_file");
  const [nameFixScope, setNameFixScope] = useState<NameFixScope>("current_sheet");
  const [nameFixSelectedFileIds, setNameFixSelectedFileIds] = useState<number[]>([]);
  const [nameFixSelectedSheetNames, setNameFixSelectedSheetNames] = useState<string[]>([]);
  const [nameFixSelectedTableIndexes, setNameFixSelectedTableIndexes] = useState<Set<number>>(new Set());
  const [nameFixTableFilterQuery, setNameFixTableFilterQuery] = useState("");
  const [nameFixConflictStrategy, setNameFixConflictStrategy] = useState<NameFixConflictStrategy>("suffix_increment");
  const [nameFixReservedWordStrategy, setNameFixReservedWordStrategy] = useState<ReservedWordStrategy>("prefix");
  const [nameFixLengthOverflowStrategy, setNameFixLengthOverflowStrategy] = useState<LengthOverflowStrategy>("truncate_hash");
  const [nameFixMaxIdentifierLength, setNameFixMaxIdentifierLength] = useState(64);
  const [nameFixApplyMode, setNameFixApplyMode] = useState<NameFixMode>("copy");
  const [nameFixPreviewResult, setNameFixPreviewResult] = useState<NameFixPreviewResponse | null>(null);
  const [nameFixApplyResult, setNameFixApplyResult] = useState<NameFixApplyResultState | null>(null);
  const [nameFixRunningStep, setNameFixRunningStep] = useState<"idle" | "preview" | "apply" | "rollback">("idle");
  const [generatedTables, setGeneratedTables] = useState<TableInfo[] | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGeneratingByReference, setIsGeneratingByReference] = useState(false);
  const nameFixResolverRef = useRef<((tables: TableInfo[] | null) => void) | null>(null);
  const missingTypeResolverRef = useRef<((tables: TableInfo[] | null) => void) | null>(null);
  const nameFixBatchModeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const { data: uploadedFiles = [] } = useFiles();
  const { data: availableSheets = [] } = useSheets(fileId);
  const { data: autoTables } = useTableInfo(fileId, sheetName);
  const tables = overrideTables || autoTables;
  const { mutate: generate, isPending } = useGenerateDdl();
  const { mutateAsync: previewNameFix, isPending: isPreviewingNameFix } = useNameFixPreview();
  const { mutateAsync: applyNameFix, isPending: isApplyingNameFix } = useApplyNameFix();
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const { t } = useTranslation();
  const statusBar = useStatusBarScope("app:ddl");
  const highlightedDdlTokens = useMemo(() => (generatedDdl ? tokenizeSql(generatedDdl) : []), [generatedDdl]);
  const codeRef = useRef<HTMLElement | null>(null);
  const nameFixFileVersionMetaById = useMemo(() => {
    const map = new Map<number, NameFixFileVersionMeta>();
    if (uploadedFiles.length === 0) {
      return map;
    }

    const groups = new Map<string, typeof uploadedFiles>();
    uploadedFiles.forEach((file) => {
      const key = file.originalName;
      const list = groups.get(key) ?? [];
      list.push(file);
      groups.set(key, list);
    });

    groups.forEach((groupFiles) => {
      const ordered = [...groupFiles].sort((a, b) => {
        const timeA = parseUploadedAtMillis(a.uploadedAt);
        const timeB = parseUploadedAtMillis(b.uploadedAt);
        if (timeA !== timeB) {
          return timeA - timeB;
        }
        return a.id - b.id;
      });
      const versionCount = ordered.length;
      ordered.forEach((file, index) => {
        map.set(file.id, {
          versionNumber: index + 1,
          versionCount,
          shortHash: (file.fileHash ?? "").slice(0, 8),
        });
      });
    });

    return map;
  }, [uploadedFiles]);
  const sortedUploadedFilesForNameFix = useMemo(() => {
    return [...uploadedFiles].sort((a, b) => {
      const timeA = parseUploadedAtMillis(a.uploadedAt);
      const timeB = parseUploadedAtMillis(b.uploadedAt);
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return b.id - a.id;
    });
  }, [uploadedFiles]);
  const availableSheetNames = useMemo<string[]>(
    () => (availableSheets as unknown[])
      .map((sheet: unknown) => getSheetNameValue(sheet))
      .filter((name: string) => Boolean(name && name.trim())),
    [availableSheets],
  );
  const nameFixFilteredCurrentSheetTables = useMemo(() => {
    if (!tables || tables.length === 0) {
      return [];
    }
    const query = nameFixTableFilterQuery.trim().toLowerCase();
    return tables
      .map((table: TableInfo, tableIndex: number) => ({ table, tableIndex }))
      .filter(({ table }: { table: TableInfo; tableIndex: number }) => {
        if (!query) {
          return true;
        }
        const logicalName = table.logicalTableName?.toLowerCase() ?? "";
        const physicalName = table.physicalTableName?.toLowerCase() ?? "";
        return logicalName.includes(query) || physicalName.includes(query);
      });
  }, [tables, nameFixTableFilterQuery]);
  const tableDisplayNameByPhysicalName = useMemo(() => {
    const map = new Map<string, string>();
    (tables ?? []).forEach((table: TableInfo) => {
      const physicalName = (table.physicalTableName ?? "").trim();
      if (!physicalName) {
        return;
      }
      map.set(physicalName, formatLogicalPhysicalName(table.logicalTableName, table.physicalTableName));
    });
    return map;
  }, [tables]);
  const isNameFixScopeLocked = nameFixBatchMode !== "current_file";
  const displayedNameFixScope: NameFixScope = isNameFixScopeLocked ? "all_sheets" : nameFixScope;
  const nameFixCurrentSheetTableCount = tables?.length ?? 0;
  const shouldShowNameFixTableFilter =
    nameFixBatchMode === "current_file"
    && displayedNameFixScope === "current_sheet"
    && nameFixCurrentSheetTableCount > 0;
  const isNameFixPartialTableSelection =
    nameFixSelectedTableIndexes.size > 0
    && nameFixSelectedTableIndexes.size < nameFixCurrentSheetTableCount;
  const hasNameFixBlockingIssues =
    (nameFixPreviewResult?.summary.blockingConflictCount ?? 0) > 0
    || (nameFixPreviewResult?.summary.unresolvedSourceRefCount ?? 0) > 0;
  const effectiveSelectedTableNames = selectedTableNames ?? localSelectedTableNames;
  const groupedMissingDataTypeIssues = useMemo<MissingDataTypeIssueGroup[]>(() => {
    if (missingDataTypeIssues.length === 0) {
      return [];
    }

    const grouped = new Map<string, MissingDataTypeIssueGroup>();
    for (const issue of missingDataTypeIssues) {
      const groupKey = `${issue.tableIndex}:${issue.tablePhysicalName}`;
      const existing = grouped.get(groupKey);
      if (existing) {
        existing.issues.push(issue);
      } else {
        grouped.set(groupKey, {
          groupKey,
          tableIndex: issue.tableIndex,
          tableLogicalName: issue.tableLogicalName,
          tablePhysicalName: issue.tablePhysicalName,
          issues: [issue],
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => a.tableIndex - b.tableIndex);
  }, [missingDataTypeIssues]);
  const missingTypeInvalidTableIndexes = useMemo(
    () => new Set(missingDataTypeIssues.map((issue) => issue.tableIndex)),
    [missingDataTypeIssues],
  );
  const missingTypeSelectedIssueCount = useMemo(
    () => missingDataTypeIssues.filter((issue) => missingTypeSelectedTableIndexes.has(issue.tableIndex)).length,
    [missingDataTypeIssues, missingTypeSelectedTableIndexes],
  );

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
  const selectAllCurrentTables = useCallback(() => {
    if (!tables || tables.length === 0) {
      return;
    }
    commitSelectedTableNames(
      new Set(tables.map((table: TableInfo) => table.physicalTableName).filter(Boolean)),
    );
  }, [commitSelectedTableNames, tables]);
  const clearSelectedTables = useCallback(() => {
    commitSelectedTableNames(new Set());
  }, [commitSelectedTableNames]);

  useEffect(() => () => {
    statusBar.clearAll();
  }, [statusBar]);

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

  useEffect(() => {
    setGeneratedDdl(null);
    setGeneratedTables(null);
    setGenerationError(null);
    setCopied(false);
    setZipExportSummary((previous) => (previous.open ? { ...previous, open: false } : previous));
  }, [fileId, sheetName]);

  useEffect(() => {
    if (!settings) {
      return;
    }
    setNameFixConflictStrategy(settings.nameFixConflictStrategy);
    setNameFixReservedWordStrategy(settings.nameFixReservedWordStrategy);
    setNameFixLengthOverflowStrategy(settings.nameFixLengthOverflowStrategy);
    setNameFixMaxIdentifierLength(settings.nameFixMaxIdentifierLength);
    const preferredMode = settings.nameFixDefaultMode;
    if (!supportsDirectNameFixWrite) {
      setNameFixApplyMode("replace_download");
      return;
    }
    setNameFixApplyMode(preferredMode === "replace_download" ? "copy" : preferredMode);
  }, [settings, supportsDirectNameFixWrite]);

  useEffect(() => {
    if (!supportsDirectNameFixWrite && nameFixApplyMode !== "replace_download") {
      setNameFixApplyMode("replace_download");
    }
  }, [nameFixApplyMode, supportsDirectNameFixWrite]);

  useEffect(() => {
    if (fileId) {
      setNameFixSelectedFileIds([fileId]);
    } else {
      setNameFixSelectedFileIds([]);
    }
  }, [fileId]);

  useEffect(() => {
    if (sheetName) {
      setNameFixSelectedSheetNames((previous) =>
        previous.length === 1 && previous[0] === sheetName ? previous : [sheetName],
      );
      return;
    }

    setNameFixSelectedSheetNames((previous) => (previous.length === 0 ? previous : []));
    setNameFixScope((previous) =>
      previous === "current_sheet" || previous === "selected_sheets"
        ? "all_sheets"
        : previous,
    );
  }, [sheetName]);

  useEffect(() => {
    if (nameFixBatchMode !== "current_file" && nameFixScope !== "all_sheets") {
      setNameFixScope("all_sheets");
    }
    if (nameFixBatchMode !== "current_file" && nameFixSelectedSheetNames.length > 0) {
      setNameFixSelectedSheetNames([]);
    }
  }, [nameFixBatchMode, nameFixScope, nameFixSelectedSheetNames.length]);

  useEffect(() => {
    if (!shouldShowNameFixTableFilter) {
      return;
    }
    setNameFixSelectedTableIndexes((previous) => {
      const sanitized = new Set(
        Array.from(previous).filter(
          (index) => Number.isInteger(index) && index >= 0 && index < nameFixCurrentSheetTableCount,
        ),
      );
      if (sanitized.size === 0 && previous.size === 0 && nameFixCurrentSheetTableCount > 0) {
        return new Set(Array.from({ length: nameFixCurrentSheetTableCount }, (_, index) => index));
      }
      if (sanitized.size !== previous.size) {
        return sanitized;
      }
      const hasDifference = Array.from(previous).some((value) => !sanitized.has(value));
      if (hasDifference) {
        return sanitized;
      }
      return previous;
    });
  }, [shouldShowNameFixTableFilter, nameFixCurrentSheetTableCount]);

  const tablesWithNameIssues = useMemo(() => {
    return (tables ?? []).filter((table: TableInfo) => validateTablePhysicalNames(table).hasIssues);
  }, [tables]);

  const invalidNameFixEntries = useMemo(
    () =>
      pendingNameFixTables
        .map((table, index) => {
          const key = getNameFixKey(table, index);
          const validation = validateTablePhysicalNames(table);
          return { key, table, validation };
        })
        .filter((entry) => entry.validation.hasIssues),
    [pendingNameFixTables],
  );

  const {
    conflictStrategyOptions,
    reservedWordStrategyOptions,
    lengthOverflowStrategyOptions,
  } = useMemo(() => buildNameFixDialogOptions(t), [t]);

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

  const outputTargetLabel =
    currentTable?.physicalTableName || sheetName || "当前对象";
  const selectedTableCount = effectiveSelectedTableNames.size;
  const candidateTableCount = filteredAndSortedTables?.length || tables?.length || 0;

  function getNameFixKey(_table: TableInfo, index: number): string {
    return String(index);
  }

  const collectMissingDataTypeIssues = (targetTables: TableInfo[]): MissingDataTypeIssue[] => {
    const issues: MissingDataTypeIssue[] = [];
    targetTables.forEach((table, tableIndex) => {
      table.columns.forEach((column, columnIndex) => {
        const dataType = column.dataType?.trim() ?? "";
        if (dataType.length > 0) {
          return;
        }
        issues.push({
          key: `${tableIndex}:${columnIndex}`,
          tableIndex,
          columnIndex,
          tableLogicalName: table.logicalTableName || "",
          tablePhysicalName: table.physicalTableName || "",
          columnLogicalName: column.logicalName || "",
          columnPhysicalName: column.physicalName || "",
        });
      });
    });
    return issues;
  };

  const resetNameFixDialog = () => {
    setShowNameFixDialog(false);
    setPendingNameFixTables([]);
    setNameFixCandidateKeys(new Set());
    nameFixResolverRef.current = null;
  };

  const resetMissingTypeDialog = () => {
    setShowMissingTypeDialog(false);
    setPendingMissingTypeTables([]);
    setMissingDataTypeIssues([]);
    setMissingDataTypeValues({});
    setMissingDataTypeSizes({});
    setMissingTypeSelectedTableIndexes(new Set());
    missingTypeResolverRef.current = null;
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

  const askMissingTypeResolutionIfNeeded = (targetTables: TableInfo[]): Promise<TableInfo[] | null> => {
    const issues = collectMissingDataTypeIssues(targetTables);
    if (issues.length === 0) {
      return Promise.resolve(targetTables);
    }

    return new Promise((resolve) => {
      missingTypeResolverRef.current = resolve;
      setPendingMissingTypeTables(targetTables);
      setMissingDataTypeIssues(issues);
      setMissingDataTypeValues(
        issues.reduce<Record<string, string>>((acc, issue) => {
          acc[issue.key] = "";
          return acc;
        }, {}),
      );
      setMissingDataTypeSizes(
        issues.reduce<Record<string, string>>((acc, issue) => {
          acc[issue.key] = "";
          return acc;
        }, {}),
      );
      setMissingTypeSelectedTableIndexes(new Set(issues.map((issue) => issue.tableIndex)));
      setShowMissingTypeDialog(true);
    });
  };

  const cancelMissingTypeDialog = () => {
    const resolver = missingTypeResolverRef.current;
    if (resolver) {
      resolver(null);
    }
    resetMissingTypeDialog();
  };

  const toggleMissingTypeTableSelection = (tableIndex: number, selected: boolean) => {
    setMissingTypeSelectedTableIndexes((previous) => {
      const next = new Set(previous);
      if (selected) {
        next.add(tableIndex);
      } else {
        next.delete(tableIndex);
      }
      return next;
    });
  };

  const toggleAllMissingTypeTableSelections = (selected: boolean) => {
    if (selected) {
      setMissingTypeSelectedTableIndexes(new Set(missingTypeInvalidTableIndexes));
      return;
    }
    setMissingTypeSelectedTableIndexes(new Set());
  };

  const resolveMissingTypeBySkippingInvalidTables = () => {
    const resolver = missingTypeResolverRef.current;
    if (!resolver) {
      return;
    }
    const filteredTables = pendingMissingTypeTables.filter(
      (_table, index) => !missingTypeInvalidTableIndexes.has(index),
    );

    if (filteredTables.length === 0) {
      toast({
        title: t("ddl.missingTypeNoExportableTitle"),
        description: t("ddl.missingTypeNoExportableDescription"),
        variant: "destructive",
      });
      return;
    }

    resolver(filteredTables);
    resetMissingTypeDialog();
  };

  const resolveMissingTypeByManualSelection = () => {
    const resolver = missingTypeResolverRef.current;
    if (!resolver) {
      return;
    }

    const selectedIssueList = missingDataTypeIssues.filter((issue) =>
      missingTypeSelectedTableIndexes.has(issue.tableIndex),
    );
    const selectedTableIndexes = new Set(selectedIssueList.map((issue) => issue.tableIndex));
    const skippedInvalidTableIndexes = new Set<number>();
    missingTypeInvalidTableIndexes.forEach((tableIndex) => {
      if (!selectedTableIndexes.has(tableIndex)) {
        skippedInvalidTableIndexes.add(tableIndex);
      }
    });

    for (const issue of selectedIssueList) {
      const value = (missingDataTypeValues[issue.key] || "").trim();
      if (!value) {
        const tableDisplayName = formatLogicalPhysicalName(
          issue.tableLogicalName,
          issue.tablePhysicalName,
        );
        const columnDisplayName = formatLogicalPhysicalName(
          issue.columnLogicalName,
          issue.columnPhysicalName,
        );
        toast({
          title: t("ddl.missingTypeRequiredTitle"),
          description: t("ddl.missingTypeRequiredDescription", {
            tableName: tableDisplayName,
            columnName: columnDisplayName,
          }),
          variant: "destructive",
        });
        return;
      }
    }

    const issueMap = new Map<string, string>();
    const sizeMap = new Map<string, string>();
    for (const issue of selectedIssueList) {
      issueMap.set(issue.key, (missingDataTypeValues[issue.key] || "").trim());
      sizeMap.set(issue.key, (missingDataTypeSizes[issue.key] || "").trim());
    }

    for (const issue of selectedIssueList) {
      const type = issueMap.get(issue.key) as (typeof DATA_TYPE_SELECTION_OPTIONS)[number] | undefined;
      if (!type) {
        continue;
      }
      const sizeRule = DATA_TYPE_SIZE_RULES[type] ?? "none";
      const sizeValue = sizeMap.get(issue.key) ?? "";

      if (sizeValue === "") {
        continue;
      }

      if (sizeRule === "integer" && !INTEGER_SIZE_PATTERN.test(sizeValue)) {
        const tableDisplayName = formatLogicalPhysicalName(
          issue.tableLogicalName,
          issue.tablePhysicalName,
        );
        const columnDisplayName = formatLogicalPhysicalName(
          issue.columnLogicalName,
          issue.columnPhysicalName,
        );
        toast({
          title: t("ddl.missingTypeInvalidSizeTitle"),
          description: t("ddl.missingTypeInvalidIntegerSizeDescription", {
            tableName: tableDisplayName,
            columnName: columnDisplayName,
            size: sizeValue,
          }),
          variant: "destructive",
        });
        return;
      }

      if (sizeRule === "numeric" && !NUMERIC_SIZE_PATTERN.test(sizeValue)) {
        const tableDisplayName = formatLogicalPhysicalName(
          issue.tableLogicalName,
          issue.tablePhysicalName,
        );
        const columnDisplayName = formatLogicalPhysicalName(
          issue.columnLogicalName,
          issue.columnPhysicalName,
        );
        toast({
          title: t("ddl.missingTypeInvalidSizeTitle"),
          description: t("ddl.missingTypeInvalidNumericSizeDescription", {
            tableName: tableDisplayName,
            columnName: columnDisplayName,
            size: sizeValue,
          }),
          variant: "destructive",
        });
        return;
      }
    }

    const patchedTables = pendingMissingTypeTables.flatMap((table, tableIndex) => {
      if (skippedInvalidTableIndexes.has(tableIndex)) {
        return [];
      }

      return [{
        ...table,
        columns: table.columns.map((column, columnIndex) => {
          const key = `${tableIndex}:${columnIndex}`;
          const selectedType = issueMap.get(key) as (typeof DATA_TYPE_SELECTION_OPTIONS)[number] | undefined;
          const selectedSize = (sizeMap.get(key) ?? "").trim();
          const sizeRule = selectedType ? (DATA_TYPE_SIZE_RULES[selectedType] ?? "none") : "none";
          const inlineDataType = selectedType
            ? selectedSize && sizeRule !== "none"
              ? `${selectedType}(${selectedSize})`
              : selectedType
            : undefined;

          const nextSize = selectedType
            ? selectedSize
              ? undefined
              : sizeRule === "none"
                ? undefined
                : column.size
            : column.size;

          if (!selectedType) {
            return column;
          }
          return {
            ...column,
            dataType: inlineDataType,
            size: nextSize,
          };
        }),
      }];
    });

    if (patchedTables.length === 0) {
      toast({
        title: t("ddl.missingTypeNoExportableTitle"),
        description: t("ddl.missingTypeNoExportableDescription"),
        variant: "destructive",
      });
      return;
    }

    if (skippedInvalidTableIndexes.size > 0) {
      toast({
        title: t("ddl.missingTypePartialSelectionTitle", {
          defaultValue: "已应用部分表选择",
        }),
        description: t("ddl.missingTypePartialSelectionDescription", {
          defaultValue:
            "将继续处理 {{selectedCount}} 张表，并跳过 {{skippedCount}} 张无效表。",
          selectedCount: patchedTables.length,
          skippedCount: skippedInvalidTableIndexes.size,
        }),
        variant: "warning",
      });
    }

    resolver(patchedTables);
    resetMissingTypeDialog();
  };

  const notifyDdlWarnings = (warnings?: DdlGenerationWarning[]) => {
    if (!warnings || warnings.length === 0) {
      return;
    }
    const previewLines = warnings
      .slice(0, 3)
      .map((warning) => `${warning.tableName}.${warning.columnName}: ${warning.message}`)
      .join("\n");
    const remainingCount = warnings.length - Math.min(3, warnings.length);
    toast({
      title: `DDL warnings (${warnings.length})`,
      description: remainingCount > 0 ? `${previewLines}\n... +${remainingCount} more` : previewLines,
      variant: "warning",
    });
  };

  const handleGenerate = async () => {
    if (!tables || tables.length === 0) return;
    setGenerationError(null);

    if (exportMode !== "single") {
      if (effectiveSelectedTableNames.size === 0) {
        commitSelectedTableNames(
          new Set(tables.map((table: TableInfo) => table.physicalTableName).filter(Boolean)),
        );
      }
      setShowTableSelector(true);
      return;
    }

    const selectedEntries: SelectedTableEntry[] = tables
      .map((table: TableInfo, sourceIndex: number) => ({ sourceIndex, table }))
      .filter((entry: SelectedTableEntry) => effectiveSelectedTableNames.has(entry.table.physicalTableName));
    const fallbackTargetTable = currentTable || (tables.length === 1 ? tables[0] : null);
    const targetEntries = selectedEntries.length > 0
      ? selectedEntries
      : fallbackTargetTable
        ? [{ sourceIndex: findTableIndex(tables, fallbackTargetTable), table: fallbackTargetTable }]
        : [];

    if (targetEntries.length === 0) {
      toast({
        title: t("ddl.noTableSelected"),
        description: t("ddl.pleaseSelectTable"),
        variant: "destructive",
      });
      return;
    }

    const tablesForGeneration = await askAutoFixIfNeeded(targetEntries.map((entry) => entry.table));
    if (!tablesForGeneration) {
      return;
    }

    const canUseReferenceMode = fileId != null && sheetName != null;
    const nameFixedEntries = tablesForGeneration.map((table: TableInfo, index: number) => ({
      sourceIndex: targetEntries[index]?.sourceIndex ?? index,
      table,
    }));

    if (canUseReferenceMode && nameFixedEntries.every((entry) => entry.sourceIndex >= 0)) {
      const tableOverrides = buildReferenceOverrides(tables, nameFixedEntries);

      try {
        setIsGeneratingByReference(true);
        const data = await desktopBridge.ddl.generateByReference({
          fileId,
          sheetName,
          selectedTableIndexes: nameFixedEntries.map((entry) => entry.sourceIndex),
          tableOverrides,
          dialect,
          settings,
        });
        setGeneratedDdl(data.ddl);
        setGeneratedTables(tablesForGeneration);
        setGenerationError(null);
        notifyDdlWarnings(data.warnings);
        toast({
          title: t("ddl.generated"),
          description: t("ddl.generatedSuccess", { count: tablesForGeneration.length, dialect: dialect.toUpperCase() }),
          variant: "success",
        });
        return;
      } catch (error) {
        setGeneratedTables(null);
        const translated = translateApiError(error, t);
        const friendlyDescription = translated.description;
        setGenerationError(friendlyDescription);
        toast({
          title: translated.title || t("ddl.generationFailed"),
          description: friendlyDescription,
          variant: "destructive",
        });
        return;
      } finally {
        setIsGeneratingByReference(false);
      }
    }

    generate(
      { tables: tablesForGeneration.map(toDdlTablePayload), dialect, settings },
      {
        onSuccess: (data) => {
          setGeneratedDdl(data.ddl);
          setGeneratedTables(tablesForGeneration);
          setGenerationError(null);
          notifyDdlWarnings(data.warnings);
          toast({
            title: t("ddl.generated"),
            description: t("ddl.generatedSuccess", { count: tablesForGeneration.length, dialect: dialect.toUpperCase() }),
            variant: "success",
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
      },
    );
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

    const selectedEntries: SelectedTableEntry[] = tables
      .map((table: TableInfo, sourceIndex: number) => ({ sourceIndex, table }))
      .filter((entry: SelectedTableEntry) => effectiveSelectedTableNames.has(entry.table.physicalTableName));

    const tablesAfterNameFix = await askAutoFixIfNeeded(selectedEntries.map((entry) => entry.table));
    if (!tablesAfterNameFix) {
      return;
    }

    const nameFixedEntries = tablesAfterNameFix.map((table: TableInfo, index: number) => ({
      sourceIndex: selectedEntries[index].sourceIndex,
      table,
    }));

    const tablesForExport = await askMissingTypeResolutionIfNeeded(nameFixedEntries.map((entry) => entry.table));
    if (!tablesForExport) {
      return;
    }

    try {
      statusBar.set({
        id: "export",
        label: "Exporting ZIP",
        detail: `${tablesForExport.length} tables`,
        tone: "progress",
        progress: null,
        order: 10,
      });
      const fallbackSheetNameHint = sheetName ?? deriveSheetNameHintFromTables(tablesForExport);
      const fallbackZipFilename = buildZipDownloadFilename(dialect, fallbackSheetNameHint);
      let exportResult: Awaited<ReturnType<typeof desktopBridge.ddl.exportZip>> | null = null;

      const canUseReferenceMode = fileId != null && sheetName != null;
      if (canUseReferenceMode) {
        const resolvedEntries = alignEntriesWithResolvedTables(nameFixedEntries, tablesForExport);
        if (resolvedEntries.length === tablesForExport.length && resolvedEntries.length > 0) {
          exportResult = await desktopBridge.ddl.exportZipByReference({
            fileId,
            sheetName,
            selectedTableIndexes: resolvedEntries.map((entry) => entry.sourceIndex),
            tableOverrides: buildReferenceOverrides(tables, resolvedEntries),
            dialect,
            settings,
            tolerantMode: true,
            includeErrorReport: true,
          });
        }
      }

      if (!exportResult) {
        exportResult = await desktopBridge.ddl.exportZip({
          tables: tablesForExport.map(toDdlTablePayload),
          dialect,
          settings,
          tolerantMode: true,
          includeErrorReport: true,
        });
      }
      const successCount = exportResult.successCount > 0 ? exportResult.successCount : tablesForExport.length;
      const skippedCount = exportResult.skippedCount;
      const skippedTables = exportResult.skippedTables;
      const zipFileName = exportResult.fileName || fallbackZipFilename;
      statusBar.set({
        id: "export",
        label: "Saving ZIP",
        detail: zipFileName,
        tone: "progress",
        progress: null,
        order: 10,
        mono: true,
      });
      const exportBytes = new Uint8Array(await exportResult.blob.arrayBuffer());
      const savedPath = await desktopBridge.saveBinaryFile({
        bytes: exportBytes,
        defaultFileName: zipFileName,
        defaultDirectory: settings?.downloadPath,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
        revealAfterSave: true,
      });

      if (!savedPath) {
        downloadBlob(exportResult.blob, zipFileName);
      }

      toast({
        title: t("ddl.exported"),
        description:
          skippedCount > 0
            ? t("ddl.exportedZipPartial", { successCount, skippedCount })
            : t("ddl.exportedZip", { count: successCount }),
        variant: "success",
      });
      statusBar.set({
        id: "export",
        label: t("ddl.exported"),
        detail:
          skippedCount > 0
            ? t("ddl.exportedZipPartial", { successCount, skippedCount })
            : t("ddl.exportedZip", { count: successCount }),
        tone: "success",
        order: 10,
        expiresInMs: 5_000,
      });

      setZipExportSummary({
        open: true,
        selectedCount: tablesForExport.length,
        successCount,
        skippedCount,
        skippedTables,
      });

      setShowTableSelector(false);
    } catch (error) {
      console.error('ZIP export error:', error);
      const translated = translateApiError(error, t);
      statusBar.set({
        id: "export",
        label: translated.title || t("ddl.exportFailed"),
        detail: translated.description,
        tone: "error",
        order: 10,
        expiresInMs: 6_000,
      });
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
      variant: "success",
    });
  };

  const selectAllOutput = useCallback(() => {
    if (!codeRef.current || typeof window === "undefined") return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(codeRef.current);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

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
    const selectedGeneratedCount = generatedTables?.length ?? 1;
    const physicalName = selectedGeneratedCount > 1
      ? (sheetName?.trim() || "selected_tables")
      : table.physicalTableName;
    const filename = buildSqlDownloadFilename(prefix, suffix, physicalName);

    try {
      statusBar.set({
        id: "export",
        label: "Exporting SQL",
        detail: filename,
        tone: "progress",
        progress: null,
        order: 10,
        mono: true,
      });
      const blob = new Blob([generatedDdl], { type: "text/plain;charset=utf-8" });
      const savedPath = await desktopBridge.saveBinaryFile({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        defaultFileName: filename,
        defaultDirectory: settings?.downloadPath,
        filters: [{ name: "SQL", extensions: ["sql"] }],
        revealAfterSave: true,
      });

      if (!savedPath) {
        downloadBlob(blob, filename);
      }

      statusBar.set({
        id: "export",
        label: t("ddl.exported"),
        detail: t("ddl.exportedAs", { filename }),
        tone: "success",
        order: 10,
        expiresInMs: 5_000,
        mono: true,
      });
      toast({
        title: t("ddl.exported"),
        description: t("ddl.exportedAs", { filename }),
        variant: "success",
      });
    } catch (error) {
      const translated = translateApiError(error, t);
      statusBar.set({
        id: "export",
        label: translated.title || t("ddl.exportFailed"),
        detail: translated.description,
        tone: "error",
        order: 10,
        expiresInMs: 6_000,
      });
      toast({
        title: translated.title || t("ddl.exportFailed"),
        description: translated.description,
        variant: "destructive",
      });
    }
  };

  const resolveNameFixTargetFileIds = (): number[] => {
    if (nameFixBatchMode === "current_file") {
      return fileId ? [fileId] : [];
    }
    if (nameFixBatchMode === "all_files") {
      return uploadedFiles.map((file) => file.id);
    }
    return nameFixSelectedFileIds;
  };

  const toggleNameFixFileSelection = (targetFileId: number, selected: boolean) => {
    setNameFixSelectedFileIds((previous) => {
      const next = new Set(previous);
      if (selected) {
        next.add(targetFileId);
      } else {
        next.delete(targetFileId);
      }
      return Array.from(next).sort((a, b) => a - b);
    });
  };

  const toggleNameFixSheetSelection = (targetSheetName: string, selected: boolean) => {
    setNameFixSelectedSheetNames((previous) => {
      const next = new Set(previous);
      if (selected) {
        next.add(targetSheetName);
      } else {
        next.delete(targetSheetName);
      }
      return Array.from(next);
    });
  };

  const toggleNameFixTableSelection = (tableIndex: number, selected: boolean) => {
    setNameFixSelectedTableIndexes((previous) => {
      const next = new Set(previous);
      if (selected) {
        next.add(tableIndex);
      } else {
        next.delete(tableIndex);
      }
      return next;
    });
  };

  const toggleAllNameFixTableSelections = (selected: boolean) => {
    if (!tables || tables.length === 0) {
      setNameFixSelectedTableIndexes(new Set());
      return;
    }
    if (!selected) {
      setNameFixSelectedTableIndexes(new Set());
      return;
    }
    setNameFixSelectedTableIndexes(new Set(tables.map((_: TableInfo, index: number) => index)));
  };

  const openSyncNameFixDialog = () => {
    if (!fileId && uploadedFiles.length === 0) {
      toast({
        title: t("ddl.nameFix.toastNoFileSelectedTitle"),
        description: t("ddl.nameFix.toastNoFileSelectedDescription"),
        variant: "destructive",
      });
      return;
    }
    const initialFileIds = fileId ? [fileId] : sortedUploadedFilesForNameFix.slice(0, 1).map((file) => file.id);
    setNameFixBatchMode(fileId ? "current_file" : "selected_files");
    setNameFixScope(sheetName ? "current_sheet" : "all_sheets");
    setNameFixSelectedFileIds(initialFileIds);
    setNameFixSelectedSheetNames(sheetName ? [sheetName] : []);
    setNameFixSelectedTableIndexes(new Set((tables ?? []).map((_: TableInfo, index: number) => index)));
    setNameFixTableFilterQuery("");
    setNameFixApplyMode((previousMode) => {
      if (!supportsDirectNameFixWrite) {
        return "replace_download";
      }
      return previousMode === "replace_download" ? "copy" : previousMode;
    });
    setNameFixPreviewResult(null);
    setNameFixApplyResult(null);
    setShowSyncNameFixDialog(true);
  };

  const handleRunNameFixPreview = async () => {
    const targetFileIds = resolveNameFixTargetFileIds();
    if (targetFileIds.length === 0) {
      toast({
        title: t("ddl.nameFix.toastNoTargetFilesTitle"),
        description: t("ddl.nameFix.toastNoTargetFilesDescription"),
        variant: "destructive",
      });
      return;
    }

    const multiFileMode = nameFixBatchMode !== "current_file";
    const effectiveScope: NameFixScope = multiFileMode ? "all_sheets" : nameFixScope;

    if (!multiFileMode && effectiveScope === "current_sheet" && !sheetName) {
      toast({
        title: t("ddl.nameFix.toastCurrentSheetUnavailableTitle"),
        description: t("ddl.nameFix.toastCurrentSheetUnavailableDescription"),
        variant: "destructive",
      });
      return;
    }

    if (!multiFileMode && effectiveScope === "selected_sheets" && nameFixSelectedSheetNames.length === 0) {
      toast({
        title: t("ddl.nameFix.toastNoSelectedSheetsTitle"),
        description: t("ddl.nameFix.toastNoSelectedSheetsDescription"),
        variant: "destructive",
      });
      return;
    }

    if (
      !multiFileMode
      && effectiveScope === "current_sheet"
      && shouldShowNameFixTableFilter
      && nameFixSelectedTableIndexes.size === 0
    ) {
      toast({
        title: t("ddl.noTableSelected"),
        description: t("ddl.pleaseSelectTable"),
        variant: "destructive",
      });
      return;
    }

    const selectedTableIndexesForPreview =
      !multiFileMode
      && effectiveScope === "current_sheet"
      && shouldShowNameFixTableFilter
      && isNameFixPartialTableSelection
        ? Array.from(nameFixSelectedTableIndexes).sort((a, b) => a - b)
        : undefined;

    try {
      setNameFixRunningStep("preview");
      const preview = await previewNameFix({
        fileIds: targetFileIds,
        scope: effectiveScope,
        currentSheetName: !multiFileMode && effectiveScope === "current_sheet" ? (sheetName ?? undefined) : undefined,
        selectedSheetNames:
          !multiFileMode && effectiveScope === "selected_sheets"
            ? nameFixSelectedSheetNames
            : undefined,
        selectedTableIndexes: selectedTableIndexesForPreview,
        conflictStrategy: nameFixConflictStrategy,
        reservedWordStrategy: nameFixReservedWordStrategy,
        lengthOverflowStrategy: nameFixLengthOverflowStrategy,
        maxIdentifierLength: nameFixMaxIdentifierLength,
      });
      setNameFixPreviewResult(preview);
      setNameFixApplyResult(null);
        toast({
        title: t("ddl.nameFix.toastPreviewReadyTitle"),
        description: t("ddl.nameFix.toastPreviewReadyDescription", {
          changedTableCount: preview.summary.changedTableCount,
          changedColumnCount: preview.summary.changedColumnCount,
        }),
      });
    } catch (error) {
      const translated = translateApiError(error, t);
      toast({
        title: translated.title || t("ddl.nameFix.toastPreviewFailedTitle"),
        description: translated.description,
        variant: "destructive",
      });
    } finally {
      setNameFixRunningStep("idle");
    }
  };

  const handleRunNameFixApply = async () => {
    if (!nameFixPreviewResult) {
      toast({
        title: t("ddl.nameFix.toastPreviewRequiredTitle"),
        description: t("ddl.nameFix.toastPreviewRequiredDescription"),
        variant: "destructive",
      });
      return;
    }

    if (hasNameFixBlockingIssues) {
      toast({
        title: t("ddl.nameFix.toastApplyFailedTitle"),
        description: `当前无法执行，因为预览发现 ${
          nameFixPreviewResult?.summary.blockingConflictCount ?? 0
        } 个阻断冲突，以及 ${
          nameFixPreviewResult?.summary.unresolvedSourceRefCount ?? 0
        } 个未解决的 sourceRef 项。`,
        variant: "destructive",
      });
      return;
    }

    if (nameFixApplyMode === "overwrite" && !supportsDirectNameFixWrite) {
      toast({
        title: t("ddl.nameFix.toastOverwriteUnavailableTitle"),
        description: t("ddl.nameFix.toastOverwriteUnavailableDescription"),
        variant: "destructive",
      });
      return;
    }

    try {
      setNameFixRunningStep("apply");
      const applyResult = await applyNameFix({
        planId: nameFixPreviewResult.planId,
        mode: nameFixApplyMode,
        includeReport: true,
      });
      setNameFixApplyResult({
        jobId: applyResult.jobId,
        status: applyResult.status,
        downloadBundleToken: applyResult.downloadBundleToken,
        downloadBundleFilename: applyResult.downloadBundleFilename,
        successCount: applyResult.summary.successCount,
        failedCount: applyResult.summary.failedCount,
        changedTableCount: applyResult.summary.changedTableCount,
        changedColumnCount: applyResult.summary.changedColumnCount,
        files: applyResult.files,
      });
      toast({
        title: t("ddl.nameFix.toastApplyFinishedTitle"),
        description: t("ddl.nameFix.toastApplyFinishedDescription", {
          successCount: applyResult.summary.successCount,
          failedCount: applyResult.summary.failedCount,
        }),
        variant: applyResult.summary.failedCount > 0 ? "destructive" : "default",
      });
    } catch (error) {
      const translated = translateApiError(error, t);
      toast({
        title: translated.title || t("ddl.nameFix.toastApplyFailedTitle"),
        description: translated.description,
        variant: "destructive",
      });
    } finally {
      setNameFixRunningStep("idle");
    }
  };

  if (!tables || tables.length === 0) {
    return (
      <div className="flex h-full flex-col bg-transparent">
        <div className="border-b border-slate-200/80 bg-slate-50/75 px-4 py-3 dark:border-[#2d2d2d] dark:bg-[#1e1e1e]">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-[#cccccc]" data-testid="text-ddl-header">
              <Code className="h-4 w-4 text-slate-500 dark:text-[#888888]" />
              DDL
            </h3>
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-[#888888]">
              {t("ddl.inspectorHint")}
            </p>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center text-muted-foreground">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200/90 bg-white dark:border-[#2d2d2d] dark:bg-[#161616]">
            <Database className="h-8 w-8 text-slate-500 dark:text-[#888888]" />
          </div>
          <div className="max-w-sm">
            <p className="text-base font-semibold text-foreground">{t("ddl.emptySelectionTitle")}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-[#888888]">{t("ddl.emptySelectionDescription")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-transparent">
      <div className="border-b border-slate-200/80 bg-slate-50/75 px-4 py-3 dark:border-[#2d2d2d] dark:bg-[#1e1e1e]">
        <div className="space-y-2">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-[#cccccc]" data-testid="text-ddl-header">
                <Code className="h-4 w-4 text-slate-500 dark:text-[#888888]" />
                {t("ddl.generatedPanelTitle")}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-[#888888]">
                {t("ddl.selectionSummary", {
                  dialect: dialect.toUpperCase(),
                  selected: selectedTableCount,
                  total: candidateTableCount,
                })}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-slate-200/80 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 dark:border-[#2d2d2d] dark:bg-[#161616] dark:text-[#888888]">
                  {t("ddl.selected")}: {selectedTableCount}/{candidateTableCount}
                </span>
                {generatedDdl ? (
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/8 dark:text-emerald-300">
                    {t("ddl.generated")}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-x-auto rounded-lg border border-slate-200/80 bg-slate-50/80 p-2 dark:border-[#2d2d2d] dark:bg-[#1e1e1e]">
            <Select value={dialect} onValueChange={(v) => setDialect(v as any)}>
              <SelectTrigger className="h-8 w-[108px] shrink-0 rounded-lg border-slate-200/90 bg-white text-xs dark:border-[#2d2d2d] dark:bg-[#161616] dark:text-[#888888] sm:w-[116px]" data-testid="select-dialect">
                <SelectValue placeholder={t("ddl.dialectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mysql" data-testid="option-mysql">MySQL</SelectItem>
                <SelectItem value="oracle" data-testid="option-oracle">Oracle</SelectItem>
              </SelectContent>
            </Select>

            <Select value={exportMode} onValueChange={(v) => setExportMode(v as any)}>
              <SelectTrigger className="h-8 w-[128px] shrink-0 rounded-lg border-slate-200/90 bg-white text-xs dark:border-[#2d2d2d] dark:bg-[#161616] dark:text-[#888888] sm:w-[138px]" data-testid="select-export-mode">
                <SelectValue placeholder={t("ddl.exportModePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single" data-testid="option-single">{t("ddl.exportModeSingle")}</SelectItem>
                <SelectItem value="per-table" data-testid="option-per-table">{t("ddl.exportModePerTable")}</SelectItem>
              </SelectContent>
            </Select>

            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={isPending || isGeneratingByReference}
              className="h-8 shrink-0 rounded-lg px-4 text-xs font-semibold"
              data-testid="button-generate"
            >
              {isPending || isGeneratingByReference ? t("ddl.generating") : (
                <>
                  {t("ddl.generate")} <ArrowRight className="ml-1 h-3 w-3" />
                </>
              )}
            </Button>
            {supportsNameFix ? (
              <Button
                size="sm"
                variant="outline"
                onClick={openSyncNameFixDialog}
                className="h-8 shrink-0 rounded-lg px-3 text-xs"
              >
                <WandSparkles className="mr-1 h-3 w-3" />
                {t("ddl.nameFix.button")}
              </Button>
            ) : null}
            {tables && tables.length > 1 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowTableSelector(true)}
                className="h-8 shrink-0 rounded-lg px-3 text-xs"
              >
                <Search className="mr-1 h-3.5 w-3.5" />
                {t("ddl.selectTables")}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={selectAllCurrentTables}
              className="h-8 shrink-0 rounded-lg px-3 text-xs"
            >
              {t("common.selectAll")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelectedTables}
              className="h-8 shrink-0 rounded-lg px-3 text-xs"
            >
              {t("common.clearSelection")}
            </Button>
          </div>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden bg-gradient-to-b from-slate-50/30 to-white dark:from-[#0f0f0f] dark:to-[#0f0f0f]">
        {!generatedDdl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200/90 bg-white dark:border-[#2d2d2d] dark:bg-[#161616]">
              <Database className="h-7 w-7 opacity-70" />
            </div>
            {generationError ? (
              <div className="mt-5 max-w-[90%] rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-left">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">{t("ddl.generationFailed")}</p>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-red-700/90 dark:text-red-200/90">{generationError}</pre>
              </div>
            ) : (
              <div className="mt-5 max-w-sm text-center">
                <p className="text-base font-semibold text-foreground">{t("ddl.readyToGenerate")}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-[#888888]">
                  {t("ddl.readyHint")}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col bg-transparent">
            <div className="flex justify-between gap-3 border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-[#2d2d2d] dark:bg-[#1e1e1e]">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-950 dark:text-[#cccccc]">
                  <DialectMark dialect={dialect} />
                  {outputTargetLabel}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {dialect.toUpperCase()} · {generatedTables?.length ?? 1} table payload{(generatedTables?.length ?? 1) > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="group relative flex-1 overflow-auto border-t border-slate-200 bg-[#f6f7f9] custom-scrollbar dark:border-[#2d2d2d] dark:bg-[#0f0f0f]">
              <div className="pointer-events-none sticky top-0 z-10 flex justify-end p-2">
                <div className="pointer-events-auto inline-flex items-center gap-0.5 rounded-md border border-slate-200/80 bg-white/78 p-0.5 opacity-100 backdrop-blur sm:opacity-0 sm:transition-opacity sm:duration-150 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 dark:border-[#2d2d2d] dark:bg-[#161616]/88">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleExport}
                    className="h-6 gap-1 rounded-sm px-2 text-[10px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-[#888888] dark:hover:bg-[#1e1e1e] dark:hover:text-white"
                    data-testid="button-export"
                  >
                    <Download className="h-3 w-3" />
                    <span className="hidden sm:inline">{t("ddl.export")}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyToClipboard}
                    className="h-6 gap-1 rounded-sm px-2 text-[10px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-[#888888] dark:hover:bg-[#1e1e1e] dark:hover:text-white"
                    data-testid="button-copy"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span className="hidden sm:inline">{copied ? t("ddl.copied") : t("ddl.copy")}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAllOutput}
                    className="h-6 gap-1 rounded-sm px-2 text-[10px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-[#888888] dark:hover:bg-[#1e1e1e] dark:hover:text-white"
                  >
                    <TextSelect className="h-3 w-3" />
                    <span className="hidden sm:inline">{t("ddl.selectAllCode")}</span>
                  </Button>
                </div>
              </div>
              <pre
                className="min-h-full bg-[#f6f7f9] p-4 font-mono text-[12px] leading-7 text-slate-800 selection:bg-sky-200/60 dark:bg-[#0f0f0f] dark:text-[#cccccc] dark:selection:bg-[#007acc]/25"
                data-testid="text-ddl-output"
              >
                <code ref={codeRef}>
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

      {supportsNameFix ? (
        <Dialog open={showSyncNameFixDialog} onOpenChange={setShowSyncNameFixDialog}>
        <DialogContent
          className="w-[min(96vw,1100px)] max-w-5xl max-h-[92vh] p-0 overflow-hidden flex flex-col"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameFixBatchModeTriggerRef.current?.focus({ preventScroll: true });
          }}
        >
          <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <WandSparkles className="w-4 h-4 text-primary" />
              {t("ddl.nameFix.dialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("ddl.nameFix.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <NameFixLabelWithHelp
                  label={t("ddl.nameFix.batchModeLabel")}
                  helpText={t("ddl.nameFix.helpBatchMode", {
                    defaultValue: "选择只处理当前文件、指定文件，还是全部已上传文件。",
                  })}
                />
                <Select value={nameFixBatchMode} onValueChange={(value) => setNameFixBatchMode(value as NameFixBatchMode)}>
                  <SelectTrigger ref={nameFixBatchModeTriggerRef} className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current_file">{t("ddl.nameFix.batchModeCurrentFile")}</SelectItem>
                    <SelectItem value="selected_files">{t("ddl.nameFix.batchModeSelectedFiles")}</SelectItem>
                    <SelectItem value="all_files">{t("ddl.nameFix.batchModeAllFiles")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <NameFixLabelWithHelp
                  label={t("ddl.nameFix.scopeLabel")}
                  helpText={t("ddl.nameFix.helpScope", {
                    defaultValue: "选择分析时使用的工作表范围。多文件模式下会固定为全部工作表。",
                  })}
                />
                <Select
                  value={displayedNameFixScope}
                  onValueChange={(value) => {
                    if (isNameFixScopeLocked) {
                      return;
                    }
                    setNameFixScope(value as NameFixScope);
                  }}
                  disabled={isNameFixScopeLocked}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current_sheet">{t("ddl.nameFix.scopeCurrentSheet")}</SelectItem>
                    <SelectItem value="selected_sheets">{t("ddl.nameFix.scopeSelectedSheets")}</SelectItem>
                    <SelectItem value="all_sheets">{t("ddl.nameFix.scopeAllSheets")}</SelectItem>
                  </SelectContent>
                </Select>
                {nameFixBatchMode !== "current_file" && (
                  <p className="text-xs text-muted-foreground">{t("ddl.nameFix.scopeMultiFileHint")}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <NameFixLabelWithHelp
                  label={t("ddl.nameFix.applyModeLabel")}
                  helpText={t("ddl.nameFix.helpApplyMode", {
                    defaultValue: "复制会保留原文件，覆盖会直接替换文件，下载替换会生成可下载的替换结果。",
                  })}
                />
                <Select value={nameFixApplyMode} onValueChange={(value) => setNameFixApplyMode(value as NameFixMode)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {supportsDirectNameFixWrite ? (
                      <>
                        <SelectItem value="copy">{t("ddl.nameFix.applyModeCopy")}</SelectItem>
                        <SelectItem value="overwrite">{t("ddl.nameFix.applyModeOverwrite")}</SelectItem>
                      </>
                    ) : (
                      <SelectItem value="replace_download">{t("ddl.nameFix.applyModeReplaceDownload")}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {!supportsDirectNameFixWrite && (
                  <p className="text-xs text-muted-foreground">{t("ddl.nameFix.browserReplaceDownloadHint")}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <NameFixLabelWithHelp
                  label={t("ddl.nameFix.conflictStrategyLabel")}
                  helpText={t("ddl.nameFix.helpConflictStrategy", {
                    defaultValue: "当规范化后出现重名时，决定如何处理。",
                  })}
                />
                <Select value={nameFixConflictStrategy} onValueChange={(value) => setNameFixConflictStrategy(value as NameFixConflictStrategy)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {conflictStrategyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <NameFixLabelWithHelp
                  label={t("ddl.nameFix.reservedWordStrategyLabel")}
                  helpText={t("ddl.nameFix.helpReservedWordStrategy", {
                    defaultValue: "选择如何处理表名或字段名里的 SQL 保留字。",
                  })}
                />
                <Select value={nameFixReservedWordStrategy} onValueChange={(value) => setNameFixReservedWordStrategy(value as ReservedWordStrategy)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reservedWordStrategyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <NameFixLabelWithHelp
                  label={t("ddl.nameFix.lengthOverflowStrategyLabel")}
                  helpText={t("ddl.nameFix.helpLengthOverflowStrategy", {
                    defaultValue: "选择如何处理超过标识符长度限制的名称。",
                  })}
                />
                <Select value={nameFixLengthOverflowStrategy} onValueChange={(value) => setNameFixLengthOverflowStrategy(value as LengthOverflowStrategy)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lengthOverflowStrategyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <NameFixLabelWithHelp
                  label={t("ddl.nameFix.maxIdentifierLengthLabel")}
                  helpText={t("ddl.nameFix.helpMaxIdentifierLength", {
                    defaultValue: "MySQL 常见限制是 64。这里填写你的目标数据库标识符长度限制。",
                  })}
                />
                <Input
                  type="number"
                  min={8}
                  max={255}
                  value={nameFixMaxIdentifierLength}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    if (!Number.isFinite(parsed)) {
                      setNameFixMaxIdentifierLength(64);
                      return;
                    }
                    setNameFixMaxIdentifierLength(Math.max(8, Math.min(255, parsed)));
                  }}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {nameFixBatchMode === "selected_files" && (
              <div className="border border-border p-3 space-y-2">
                <div className="text-sm font-semibold">{t("ddl.nameFix.fileQueueTitle")}</div>
                <ScrollArea className="h-[120px] border border-border p-2">
                  <div className="space-y-1.5">
                    {sortedUploadedFilesForNameFix.length === 0 ? (
                      <div className="text-xs text-muted-foreground">{t("ddl.nameFix.noUploadedFiles")}</div>
                    ) : (
                      sortedUploadedFilesForNameFix.map((file) => {
                        const checked = nameFixSelectedFileIds.includes(file.id);
                        const versionMeta = nameFixFileVersionMetaById.get(file.id);
                        const versionLabel = versionMeta
                          ? `v${versionMeta.versionNumber}/${versionMeta.versionCount}`
                          : "v1/1";
                        const hashLabel = versionMeta?.shortHash || (file.fileHash ?? "").slice(0, 8) || "n/a";
                        return (
                          <label key={file.id} className="flex items-start gap-2 border border-border p-2 text-xs cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => toggleNameFixFileSelection(file.id, value === true)}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-mono break-all">{file.originalName}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                UID:{file.id} · {versionLabel} · hash:{hashLabel}
                              </div>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
                <div className="text-xs text-muted-foreground">
                  {t("ddl.nameFix.selectedFilesCount", { count: nameFixSelectedFileIds.length })}
                </div>
              </div>
            )}

            {nameFixBatchMode === "current_file" && nameFixScope === "selected_sheets" && (
              <div className="border border-border p-3 space-y-2">
                <div className="text-sm font-semibold">{t("ddl.nameFix.sheetSelectorTitle")}</div>
                <ScrollArea className="h-[120px] border border-border p-2">
                  <div className="space-y-1.5">
                    {availableSheetNames.length === 0 ? (
                      <div className="text-xs text-muted-foreground">{t("ddl.nameFix.noSheetsAvailable")}</div>
                    ) : (
                      availableSheetNames.map((sheet: string) => {
                        const checked = nameFixSelectedSheetNames.includes(sheet);
                        return (
                          <label key={sheet} className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => toggleNameFixSheetSelection(sheet, value === true)}
                            />
                            <span>{sheet}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
                <div className="text-xs text-muted-foreground">
                  {t("ddl.nameFix.selectedSheetsCount", { count: nameFixSelectedSheetNames.length })}
                </div>
              </div>
            )}

            {shouldShowNameFixTableFilter && (
              <div className="border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">当前工作表筛选</div>
                  <div className="text-xs text-muted-foreground">
                    {nameFixSelectedTableIndexes.size} / {nameFixCurrentSheetTableCount}
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={nameFixTableFilterQuery}
                    onChange={(event) => setNameFixTableFilterQuery(event.target.value)}
                    placeholder={t("ddl.searchTables")}
                    className="h-8 text-xs pl-9"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => toggleAllNameFixTableSelections(true)}
                  >
                    {t("common.selectAll")}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => toggleAllNameFixTableSelections(false)}
                  >
                    {t("common.clearSelection")}
                  </Button>
                </div>

                <ScrollArea className="h-[140px] border border-border p-2">
                  <div className="space-y-1.5">
                    {nameFixFilteredCurrentSheetTables.length === 0 ? (
                      <div className="text-xs text-muted-foreground">{t("search.noResults")}</div>
                    ) : (
                      nameFixFilteredCurrentSheetTables.map(({ table, tableIndex }: { table: TableInfo; tableIndex: number }) => (
                        <label key={`${tableIndex}-${table.physicalTableName}`} className="flex items-start gap-2 border border-border p-2 text-xs cursor-pointer">
                          <Checkbox
                            checked={nameFixSelectedTableIndexes.has(tableIndex)}
                            onCheckedChange={(value) => toggleNameFixTableSelection(tableIndex, value === true)}
                          />
                          <div className="min-w-0 flex-1 leading-relaxed">
                            <div className="font-mono break-all">{table.physicalTableName || "(empty)"}</div>
                            <div className="text-xs text-muted-foreground break-all">
                              {formatLogicalPhysicalName(table.logicalTableName, table.physicalTableName)}
                            </div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </ScrollArea>

                {isNameFixPartialTableSelection && (
                  <div className="text-xs text-muted-foreground">
                    已对当前工作表启用部分表选择，预览和执行都会按此范围处理。
                  </div>
                )}
              </div>
            )}

            <NameFixExecutionPanels
              t={t}
              nameFixPreviewResult={nameFixPreviewResult}
              nameFixApplyResult={nameFixApplyResult}
            />
            </div>
          </div>

          <DialogFooter className="px-4 py-3 border-t border-border gap-2 flex-wrap shrink-0">
            <Button variant="outline" className="h-8 text-xs" onClick={() => setShowSyncNameFixDialog(false)}>
              {t("ddl.nameFix.close")}
            </Button>
            <Button
              variant="outline"
              className="h-8 text-xs"
              onClick={handleRunNameFixPreview}
              disabled={isPreviewingNameFix || nameFixRunningStep !== "idle"}
            >
              {isPreviewingNameFix || nameFixRunningStep === "preview"
                ? t("ddl.nameFix.previewing")
                : t("ddl.nameFix.runPreview")}
            </Button>
            <Button
              variant="outline"
              className="h-8 text-xs"
              onClick={handleRunNameFixApply}
              disabled={
                !nameFixPreviewResult
                || isApplyingNameFix
                || nameFixRunningStep !== "idle"
                || (nameFixApplyMode === "overwrite" && !supportsDirectNameFixWrite)
                || hasNameFixBlockingIssues
              }
            >
              {isApplyingNameFix || nameFixRunningStep === "apply"
                ? t("ddl.nameFix.applying")
                : t("ddl.nameFix.apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>
      ) : null}

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
              <div className="flex flex-wrap items-center gap-2 border border-border bg-muted/30 p-3">
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

            <ScrollArea className="h-[400px] border border-border p-4">
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
                            <span className="truncate">
                              {formatLogicalPhysicalName(table.logicalTableName, table.physicalTableName)}
                            </span>
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
                          <div className="text-xs text-muted-foreground font-mono">
                            {t("ddl.missingTypeNameFormatHint", {
                              defaultValue: "Logical (Physical)",
                            })}
                          </div>
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
            <Button
              onClick={async () => {
                if (exportMode === "single") {
                  setShowTableSelector(false);
                  await handleGenerate();
                  return;
                }
                await handleGenerateZip();
              }}
              disabled={effectiveSelectedTableNames.size === 0}
            >
              {exportMode === "single" ? t("ddl.generate") : t("ddl.generateZip")} ({effectiveSelectedTableNames.size})
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
        <DialogContent className="max-w-2xl w-[min(92vw,860px)] p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              {t("ddl.namingFixDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("ddl.namingFixDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="px-4 py-2 border-b border-border bg-muted/20 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setNameFixCandidateKeys(new Set(invalidNameFixEntries.map((entry) => entry.key)))}
            >
              {t("ddl.selectAll")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setNameFixCandidateKeys(new Set())}
            >
              {t("ddl.deselectAll")}
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {t("ddl.selected")}: {nameFixCandidateKeys.size}/{invalidNameFixEntries.length}
            </span>
          </div>

          <ScrollArea className="h-[360px] px-4 py-3">
            <div className="space-y-2.5">
              {invalidNameFixEntries.length > 0 ? (
                invalidNameFixEntries.map(({ key, table, validation }) => (
                  <div
                    key={`${key}-${table.physicalTableName}`}
                    className="flex items-start gap-3 border border-border bg-background p-2.5"
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
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="text-xs font-semibold truncate">
                        {formatLogicalPhysicalName(table.logicalTableName, table.physicalTableName)}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {t("ddl.missingTypeNameFormatHint", {
                          defaultValue: "Logical (Physical)",
                        })}
                      </div>
                      <div className="grid grid-cols-1 gap-1">
                        <div className="border border-border bg-muted/30 px-2 py-1">
                          <div className="text-[10px] text-muted-foreground mb-0.5">Current</div>
                          <div className="text-[10px] font-mono break-all whitespace-normal">
                            {validation.tableNameCurrent || "(empty)"}
                          </div>
                        </div>
                        {validation.hasInvalidTableName && (
                          <div className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1">
                            <div className="text-[10px] text-amber-700 dark:text-amber-300 mb-0.5">Suggested</div>
                            <div className="text-[10px] font-mono break-all whitespace-normal text-amber-700 dark:text-amber-300">
                              {validation.tableNameSuggested}
                            </div>
                          </div>
                        )}
                      </div>
                      {validation.invalidColumns.length > 0 && (
                        <div className="text-[10px] text-amber-700 dark:text-amber-300">
                          {t("ddl.namingFixColumnsSummary", { count: validation.invalidColumns.length })}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  {t("search.noResults")}
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="px-4 py-3 border-t border-border gap-2 sm:gap-0">
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

      <Dialog
        open={showMissingTypeDialog}
        onOpenChange={(open) => {
          if (!open) {
            cancelMissingTypeDialog();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                {t("ddl.missingTypeDialogTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("ddl.missingTypeDialogDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="border border-amber-400/40 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-300">
              {t("ddl.missingTypeSelectionHint", {
                defaultValue:
                  "选择要手动补全的无效表。未选中的无效表会被跳过。",
              })}
              <span className="ml-1 font-semibold">
                {t("ddl.missingTypeSelectionStats", {
                  defaultValue: "（已选问题: {{selected}} / 总问题: {{total}}）",
                  selected: missingTypeSelectedIssueCount,
                  total: missingDataTypeIssues.length,
                })}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => toggleAllMissingTypeTableSelections(true)}
              >
                {t("common.selectAll")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => toggleAllMissingTypeTableSelections(false)}
              >
                {t("common.clearSelection", {
                  defaultValue: "Clear selection",
                })}
              </Button>
            </div>

            <ScrollArea className="h-[360px] border border-border p-3">
              <div className="space-y-3">
                {groupedMissingDataTypeIssues.map((group) => (
                  <div
                    key={group.groupKey}
                    className="border border-border bg-muted/20 overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b bg-muted/40 flex items-start gap-2">
                      <Checkbox
                        checked={missingTypeSelectedTableIndexes.has(group.tableIndex)}
                        onCheckedChange={(value) =>
                          toggleMissingTypeTableSelection(group.tableIndex, value === true)
                        }
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">
                          {formatLogicalPhysicalName(group.tableLogicalName, group.tablePhysicalName)}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono truncate">
                          {t("ddl.missingTypeNameFormatHint", {
                            defaultValue: "Logical (Physical)",
                          })}
                        </div>
                        {!missingTypeSelectedTableIndexes.has(group.tableIndex) && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                            {t("ddl.missingTypeSkippedTableHint", {
                              defaultValue: "这张无效表会被跳过。",
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-2.5 space-y-2">
                      {group.issues.map((issue) => (
                        <div
                          key={issue.key}
                          className="grid grid-cols-1 gap-2 border border-border bg-background/70 p-2 md:grid-cols-[1fr_220px]"
                        >
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground font-mono truncate">
                              {formatLogicalPhysicalName(
                                issue.columnLogicalName,
                                issue.columnPhysicalName,
                              )}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Select
                              value={missingDataTypeValues[issue.key] || ""}
                              disabled={!missingTypeSelectedTableIndexes.has(group.tableIndex)}
                              onValueChange={(value) => {
                                setMissingDataTypeValues((prev) => ({
                                  ...prev,
                                  [issue.key]: value,
                                }));
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs font-mono">
                                <SelectValue placeholder={t("ddl.missingTypeSelectPlaceholder")} />
                              </SelectTrigger>
                              <SelectContent>
                                {DATA_TYPE_SELECTION_OPTIONS.map((dataType) => (
                                  <SelectItem key={dataType} value={dataType}>
                                    {dataType.toUpperCase()}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {(() => {
                              const selectedType = missingDataTypeValues[issue.key] as (typeof DATA_TYPE_SELECTION_OPTIONS)[number] | undefined;
                              const sizeRule = selectedType ? (DATA_TYPE_SIZE_RULES[selectedType] ?? "none") : "none";
                              if (sizeRule === "none") {
                                return null;
                              }
                                return (
                                <Input
                                  value={missingDataTypeSizes[issue.key] || ""}
                                  disabled={!missingTypeSelectedTableIndexes.has(group.tableIndex)}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setMissingDataTypeSizes((prev) => ({
                                      ...prev,
                                      [issue.key]: value,
                                    }));
                                  }}
                                  placeholder={sizeRule === "integer"
                                    ? t("ddl.missingTypeIntegerSizePlaceholder")
                                    : t("ddl.missingTypeNumericSizePlaceholder")}
                                  className="h-8 text-xs font-mono"
                                />
                              );
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
          </ScrollArea>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={cancelMissingTypeDialog}>
              {t("common.cancel")}
            </Button>
            <Button variant="outline" onClick={resolveMissingTypeBySkippingInvalidTables}>
              {t("ddl.skipInvalidTables")}
            </Button>
            <Button onClick={resolveMissingTypeByManualSelection}>
              {t("ddl.fillTypeAndContinue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={zipExportSummary.open}
        onOpenChange={(open) => setZipExportSummary((previous) => ({ ...previous, open }))}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("ddl.exportSummaryTitle")}</DialogTitle>
            <DialogDescription>
              {t("ddl.exportSummaryDescription", {
                selectedCount: zipExportSummary.selectedCount,
                successCount: zipExportSummary.successCount,
                skippedCount: zipExportSummary.skippedCount,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="border border-border p-2">
                <div className="text-xs text-muted-foreground">{t("ddl.exportSummarySelected")}</div>
                <div className="text-lg font-semibold">{zipExportSummary.selectedCount}</div>
              </div>
              <div className="border border-border p-2">
                <div className="text-xs text-muted-foreground">{t("ddl.exportSummaryGenerated")}</div>
                <div className="text-lg font-semibold text-emerald-600">{zipExportSummary.successCount}</div>
              </div>
              <div className="border border-border p-2">
                <div className="text-xs text-muted-foreground">{t("ddl.exportSummarySkipped")}</div>
                <div className="text-lg font-semibold text-amber-600">{zipExportSummary.skippedCount}</div>
              </div>
            </div>

            {zipExportSummary.skippedCount > 0 && (
              <div className="border border-border p-3 space-y-2">
                <div className="text-sm font-medium">{t("ddl.exportSummarySkippedTablesTitle")}</div>
                {zipExportSummary.skippedTables.length > 0 ? (
                  <ScrollArea className="h-[140px]">
                    <ul className="space-y-1.5 text-xs font-mono">
                      {zipExportSummary.skippedTables.map((tableName) => (
                        <li key={tableName} className="truncate">
                          {tableDisplayNameByPhysicalName.get(tableName) ?? tableName}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {t("ddl.exportSummarySkippedTablesHint")}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setZipExportSummary((previous) => ({ ...previous, open: false }))}>
              {t("ddl.exportSummaryClose")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
