import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { performance } from 'node:perf_hooks';
import type {
  TableInfo,
  ColumnInfo,
  CodeReference,
  CodeValueOption,
  CellSourceRef,
  TableSourceRef,
} from '../../shared/schema.ts';

const DEFAULT_PK_MARKERS = ['〇'];

export interface SearchIndexItem {
  type: 'sheet' | 'table';
  sheetName: string;
  displayName: string;
  physicalTableName?: string;
  logicalTableName?: string;
}

export type WorkbookParseMode = 'fast' | 'fallback' | 'mixed';

export interface WorkbookParseStats {
  fileSize: number;
  sheetCount: number;
  parseMode: WorkbookParseMode;
  readMode: 'fast' | 'compat';
  readFallbackTriggered: boolean;
  totalMs: number;
  xlsxReadMs: number;
  sheetJsonMs: number;
  extractMs: number;
  fallbackSheetCount: number;
  fallbackSheets: string[];
  cacheHit: boolean;
}

export interface WorkbookBundle {
  sheetSummaries: Array<{
    name: string;
    hasTableDefinitions: boolean;
  }>;
  tablesBySheet: Record<string, TableInfo[]>;
  searchIndex: SearchIndexItem[];
  stats: WorkbookParseStats;
}

export interface ReferenceExtractionRule {
  source?: string;
  pattern: string;
  flags?: string;
  codeIdGroup?: number;
  optionsGroup?: number;
}

export interface ReferenceExtractionConfig {
  enabled?: boolean;
  rules?: ReferenceExtractionRule[];
}

interface CompiledReferenceExtractionRule {
  source: string;
  pattern: RegExp;
  codeIdGroup: number;
  optionsGroup?: number;
}

const FAST_WORKBOOK_READ_OPTIONS = {
  type: 'buffer' as const,
  dense: true,
  cellFormula: false,
  cellHTML: false,
  cellNF: false,
  cellStyles: false,
  cellText: false,
};

const COMPAT_WORKBOOK_READ_OPTIONS = {
  type: 'buffer' as const,
};

const DEFAULT_REFERENCE_SOURCE = 'code_master';
const CODE_MASTER_KEYWORD = '\\u30b3\\u30fc\\u30c9\\u30de\\u30b9\\u30bf';
const CODE_MASTER_DISPLAY = '\u30b3\u30fc\u30c9\u30de\u30b9\u30bf';
const CODE_MASTER_REF_PATTERN_SOURCE =
  `${CODE_MASTER_KEYWORD}(?:\\s*[\\.\\uFF0E:\\uFF1A]\\s*|\\s+)([A-Za-z][A-Za-z0-9_-]{1,})` +
  `(?:\\s*[\\(\\uFF08]([^\\)\\uFF09]+)[\\)\\uFF09])?`;
const CODE_OPTION_PATTERN_SOURCE =
  '([A-Za-z0-9_-]+)\\s*[:\\uFF1A]\\s*(.+?)(?=(?:\\s*[,\\u3001;\\uFF1B]?\\s*[A-Za-z0-9_-]+\\s*[:\\uFF1A])|$)';
const ALLOWED_REFERENCE_REGEX_FLAGS = new Set(['g', 'i', 'm', 's', 'u']);
const MAX_REFERENCE_RULE_PATTERN_LENGTH = 1000;
const MAX_REFERENCE_REGEX_MATCHES_PER_COMMENT = 200;
const MAX_REFERENCE_REGEX_STEPS_PER_COMMENT = 5000;
const MAX_REFERENCE_EXTRACTION_TIME_MS = 20;
const AUTO_INCREMENT_POSITIVE_PATTERNS: RegExp[] = [
  /\bauto[\s_-]*increment\b/i,
  /\bidentity\b/i,
  /\u81ea\u52d5\s*\u63a1\u756a/, // 自動採番
  /\u81ea\u52d5\s*\u9023\u756a/, // 自動連番
  /\u81ea\u589e/, // 自增
];

const AUTO_INCREMENT_NEGATIVE_PATTERNS: RegExp[] = [
  /\b(?:not|no)\s+auto[\s_-]*increment\b/i,
  /\bauto[\s_-]*increment\s*[:\uFF1A]?\s*(?:false|off|0)\b/i,
  /\u975e\s*\u81ea\u589e/, // 非自增
  /\u81ea\u52d5\s*\u63a1\u756a\s*(?:\u7121\u3057|\u3067\u306f\u306a\u3044|\u3057\u306a\u3044)/,
];

function normalizeRegexFlags(flags?: string): string {
  const raw = String(flags ?? '').trim();
  const deduped = Array.from(new Set(raw.split('').filter(Boolean)));
  const invalid = deduped.find((flag) => !ALLOWED_REFERENCE_REGEX_FLAGS.has(flag));
  if (invalid) {
    return '';
  }
  if (!deduped.includes('g')) {
    deduped.push('g');
  }
  return deduped.join('');
}

function compileReferenceRule(rule: ReferenceExtractionRule): CompiledReferenceExtractionRule | null {
  const patternSource = String(rule.pattern ?? '').trim();
  if (!patternSource || patternSource.length > MAX_REFERENCE_RULE_PATTERN_LENGTH) {
    return null;
  }

  const source = String(rule.source ?? DEFAULT_REFERENCE_SOURCE).trim() || DEFAULT_REFERENCE_SOURCE;
  const codeIdGroup = Number(rule.codeIdGroup ?? 1);
  const optionsGroupValue = rule.optionsGroup;
  const optionsGroup = optionsGroupValue === undefined ? undefined : Number(optionsGroupValue);

  if (!Number.isInteger(codeIdGroup) || codeIdGroup < 1) {
    return null;
  }
  if (optionsGroup !== undefined && (!Number.isInteger(optionsGroup) || optionsGroup < 1)) {
    return null;
  }

  try {
    const normalizedFlags = normalizeRegexFlags(rule.flags);
    if (!normalizedFlags) {
      return null;
    }
    const pattern = new RegExp(patternSource, normalizedFlags);
    return {
      source,
      pattern,
      codeIdGroup,
      optionsGroup,
    };
  } catch {
    return null;
  }
}

function getReferenceExtractionRules(config?: ReferenceExtractionConfig): CompiledReferenceExtractionRule[] {
  const enabled = config?.enabled ?? true;
  if (!enabled) {
    return [];
  }

  const configuredRules = Array.isArray(config?.rules) ? config.rules : undefined;
  if (configuredRules && configuredRules.length > 0) {
    return configuredRules
      .map((rule) => compileReferenceRule(rule))
      .filter((rule): rule is CompiledReferenceExtractionRule => rule !== null);
  }

  return DEFAULT_REFERENCE_EXTRACTION_RULES
    .map((rule) => compileReferenceRule(rule))
    .filter((rule): rule is CompiledReferenceExtractionRule => rule !== null);
}
const DEFAULT_REFERENCE_EXTRACTION_RULES: ReferenceExtractionRule[] = [
  {
    source: DEFAULT_REFERENCE_SOURCE,
    pattern: CODE_MASTER_REF_PATTERN_SOURCE,
    flags: 'g',
    codeIdGroup: 1,
    optionsGroup: 2,
  },
];

function normalizePkMarkers(pkMarkers?: string[]): string[] {
  const source = Array.isArray(pkMarkers) ? pkMarkers : DEFAULT_PK_MARKERS;
  const cleaned = source
    .map((marker) => String(marker ?? '').trim())
    .filter((marker) => marker.length > 0);

  const unique = Array.from(new Set(cleaned));
  return unique.length > 0 ? unique : DEFAULT_PK_MARKERS;
}

export function getSheetNames(filePath: string): string[] {
  const fileBuffer = fs.readFileSync(filePath);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, FAST_WORKBOOK_READ_OPTIONS);
    if (!Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
      throw new Error('No sheets from fast workbook read');
    }
  } catch {
    workbook = XLSX.read(fileBuffer, COMPAT_WORKBOOK_READ_OPTIONS);
  }
  return workbook.SheetNames;
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function str(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function isEmpty(v: any): boolean {
  return v === null || v === undefined || String(v).trim() === '' || String(v).trim() === '　';
}

/**
 * Convert column index (0-based) to Excel column label (A, B, ... Z, AA, AB, ...)
 */
function colToLabel(col: number): string {
  let label = '';
  let num = col;
  while (num >= 0) {
    label = String.fromCharCode(65 + (num % 26)) + label;
    num = Math.floor(num / 26) - 1;
  }
  return label;
}

function normalizeIdentifierSegment(raw: string): string {
  let normalized = String(raw ?? '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  if (!normalized) {
    normalized = 'sheet';
  }
  if (/^\d/.test(normalized)) {
    normalized = `s_${normalized}`;
  }
  return normalized;
}

function buildRegionPhysicalTableName(sheetName: string, startRow: number, startCol: number): string {
  const sheetSegment = normalizeIdentifierSegment(sheetName);
  return `region_${sheetSegment}_r${startRow + 1}_c${startCol + 1}`;
}

/**
 * Format Excel range notation (e.g., "A15:N40")
 */
function formatExcelRange(startRow: number, endRow: number, startCol: number, endCol: number): string {
  return `${colToLabel(startCol)}${startRow + 1}:${colToLabel(endCol)}${endRow + 1}`;
}

function cellAddress(row: number, col: number): string {
  return `${colToLabel(col)}${row + 1}`;
}

function buildCellSourceRef(sheetName: string, row: number, col: number): CellSourceRef {
  return {
    sheetName,
    row,
    col,
    address: cellAddress(row, col),
  };
}

function parseCodeValueOptions(raw?: string): CodeValueOption[] | undefined {
  if (!raw) return undefined;

  const input = raw.replace(/\u3000/g, ' ').trim();
  if (!input) return undefined;

  const optionPattern = new RegExp(CODE_OPTION_PATTERN_SOURCE, 'g');
  const options: CodeValueOption[] = [];
  let optionMatch: RegExpExecArray | null;
  while ((optionMatch = optionPattern.exec(input)) !== null) {
    const match = optionMatch;
    const code = String(match[1] ?? '').trim();
    const label = String(match[2] ?? '').trim();
    if (!code || !label) {
      continue;
    }
    options.push({ code, label });
  }

  return options.length > 0 ? options : undefined;
}

function extractCodeReferencesFromComment(
  comment: string | undefined,
  referenceExtraction?: ReferenceExtractionConfig,
): CodeReference[] | undefined {
  if (!comment) return undefined;

  const rules = getReferenceExtractionRules(referenceExtraction);
  if (rules.length === 0) {
    return undefined;
  }

  const input = comment.replace(/\u3000/g, ' ');
  const references: CodeReference[] = [];
  let stepCount = 0;
  const startedAt = performance.now();
  let limitReached = false;

  outer: 
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let referenceMatch: RegExpExecArray | null;
    while ((referenceMatch = rule.pattern.exec(input)) !== null) {
      stepCount++;
      if (stepCount > MAX_REFERENCE_REGEX_STEPS_PER_COMMENT) {
        limitReached = true;
        break outer;
      }
      if (performance.now() - startedAt > MAX_REFERENCE_EXTRACTION_TIME_MS) {
        limitReached = true;
        break outer;
      }

      const match = referenceMatch;
      const codeId = String(match[rule.codeIdGroup] ?? '').trim();
      if (!codeId) {
        if (match[0] === '') {
          rule.pattern.lastIndex += 1;
        }
        continue;
      }

      const rawMatch = String(match[0] ?? '').trim();
      const optionsRaw = rule.optionsGroup !== undefined
        ? String(match[rule.optionsGroup] ?? '').trim()
        : '';
      const options = parseCodeValueOptions(optionsRaw);

      references.push({
        source: rule.source,
        codeId,
        raw: rawMatch || `${CODE_MASTER_DISPLAY}.${codeId}`,
        options,
      });

      if (references.length >= MAX_REFERENCE_REGEX_MATCHES_PER_COMMENT) {
        limitReached = true;
        break outer;
      }

      if (match[0] === '') {
        rule.pattern.lastIndex += 1;
      }
    }
  }

  if (references.length === 0) {
    return undefined;
  }

  const deduped = new Map<string, CodeReference>();
  references.forEach((ref) => {
    const key = `${ref.source}:${ref.codeId}:${ref.raw}`;
    if (!deduped.has(key)) {
      deduped.set(key, ref);
    }
  });

  const dedupedValues = Array.from(deduped.values());
  if (!limitReached) {
    return dedupedValues;
  }
  return dedupedValues.slice(0, MAX_REFERENCE_REGEX_MATCHES_PER_COMMENT);
}

function detectAutoIncrementFromComment(comment: string | undefined): boolean {
  if (!comment) {
    return false;
  }
  const input = comment.replace(/\u3000/g, ' ').trim();
  if (!input) {
    return false;
  }
  if (AUTO_INCREMENT_NEGATIVE_PATTERNS.some((pattern) => pattern.test(input))) {
    return false;
  }
  return AUTO_INCREMENT_POSITIVE_PATTERNS.some((pattern) => pattern.test(input));
}

// ─── Format A: Single-table sheet ─────────────────────────────────────────────
// Structure: Row 0 = "テーブル情報"
//   Row ~4: label "論理テーブル名" + value in the next col
//   Row ~5: label "物理テーブル名" + value in the next col
//   Row ~11: "カラム情報"
//   Row ~12: column headers (No, 論理名, 物理名, データ型, Size, Not Null, PK, ...)
//   Row 13+: data rows
// Can also appear as a horizontal block at a column offset within Format B sheets.

function isFormatA(data: any[][]): boolean {
  if (data.length < 5) return false;
  return str(data[0]?.[0]) === 'テーブル情報';
}

/**
 * Parse a Format A table block starting at a given column offset.
 * Handles standalone Format A sheets AND horizontal table blocks in Format B sheets.
 */
function parseFormatABlock(
  sheetName: string,
  data: any[][],
  colOffset: number,
  startRow: number,
  endRow?: number,
  maxConsecutiveEmpty: number = 10,
  pkMarkers: string[] = DEFAULT_PK_MARKERS,
  referenceExtraction?: ReferenceExtractionConfig,
): TableInfo | null {
  const maxRow = endRow ?? data.length;

  let logicalTableName = '';
  let physicalTableName = '';
  let logicalTableNameRef: CellSourceRef | undefined;
  let physicalTableNameRef: CellSourceRef | undefined;

  // Find 論理テーブル名 and 物理テーブル名 labels within the header area
  for (let i = startRow; i < Math.min(startRow + 15, maxRow); i++) {
    const row = data[i];
    if (!row) continue;

    // Check at colOffset and colOffset+1 for labels
    for (let c = colOffset; c <= colOffset + 1; c++) {
      const label = str(row[c]);
      if (label === '論理テーブル名') {
        logicalTableName = str(row[c + 1]);
        logicalTableNameRef = buildCellSourceRef(sheetName, i, c + 1);
      } else if (label === '物理テーブル名') {
        physicalTableName = str(row[c + 1]);
        physicalTableNameRef = buildCellSourceRef(sheetName, i, c + 1);
      }
    }
  }

  if (!logicalTableName && !physicalTableName) return null;

  // Find column header row (must contain 論理名, 物理名, データ型)
  let headerRowIdx = -1;
  for (let i = startRow; i < Math.min(startRow + 30, maxRow); i++) {
    const row = data[i];
    if (!row) continue;
    const vals: string[] = [];
    for (let j = colOffset; j < Math.min(colOffset + 15, row.length); j++) {
      vals.push(str(row[j]));
    }
    if (vals.includes('論理名') && vals.includes('物理名') && vals.includes('データ型')) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) return null;

  // Build column map from header row and detect column boundaries
  const headerRow = data[headerRowIdx];
  const colMap: Record<string, number> = {};
  let tableStartCol = colOffset;
  let tableEndCol = colOffset;

  for (let j = colOffset; j < headerRow.length; j++) {
    const v = str(headerRow[j]);
    if (v !== '') colMap[v] = j;
  }

  // Detect actual column boundaries: from 'No' to '備考' or last standard column
  const standardHeaders = ['No', 'No.', '論理名', '物理名', 'データ型', 'Size', 'サイズ', 'Not Null', 'PK', '備考', '列とコードの説明 / 備考'];

  // Find first standard header
  for (let j = colOffset; j < headerRow.length; j++) {
    const v = str(headerRow[j]);
    if (standardHeaders.includes(v)) {
      tableStartCol = j;
      break;
    }
  }

  // Find last standard header
  for (let j = tableStartCol; j < headerRow.length; j++) {
    const v = str(headerRow[j]);
    if (standardHeaders.includes(v)) {
      tableEndCol = j;
    } else if (v !== '' && !standardHeaders.includes(v)) {
      // Hit a non-standard column, stop here
      break;
    }
  }

  const columns = parseColumnsGeneric(
    sheetName,
    data,
    headerRowIdx + 1,
    maxRow,
    colMap,
    maxConsecutiveEmpty,
    pkMarkers,
    referenceExtraction,
  );

  // Determine actual data end row
  const dataEndRow = columns.length > 0 ? headerRowIdx + columns.length : headerRowIdx + 1;

  return {
    logicalTableName: logicalTableName || physicalTableName,
    physicalTableName: physicalTableName || logicalTableName,
    columns,
    columnRange: {
      startCol: tableStartCol,
      endCol: tableEndCol,
      startColLabel: colToLabel(tableStartCol),
      endColLabel: colToLabel(tableEndCol),
    },
    rowRange: {
      startRow: startRow,
      endRow: dataEndRow,
    },
    excelRange: formatExcelRange(startRow, dataEndRow, tableStartCol, tableEndCol),
    sourceRef: {
      sheetName,
      logicalName: logicalTableNameRef,
      physicalName: physicalTableNameRef,
    } satisfies TableSourceRef,
  };
}

// ─── Format B: Multi-table sheet ──────────────────────────────────────────────
// Structure: Row 0 = "データベース定義書"
//   Vertical table blocks starting with [No., 論理テーブル名, 物理テーブル名, 説明]
//   Horizontal Format A blocks at column offsets (15, 26, etc.)

function isFormatB(data: any[][]): boolean {
  if (data.length < 5) return false;
  return str(data[0]?.[0]) === 'データベース定義書';
}

/**
 * Find all vertical table blocks in a Format B sheet (at columns 0-14).
 */
function* findFormatBVerticalTables(
  sheetName: string,
  data: any[][],
  maxConsecutiveEmpty: number = 10,
  pkMarkers: string[] = DEFAULT_PK_MARKERS,
  referenceExtraction?: ReferenceExtractionConfig,
): Generator<TableInfo> {
  const totalRows = data.length;
  let cursor = 0;

  while (cursor < totalRows) {
    // Find next table header: [No., 論理テーブル名, 物理テーブル名, ...]
    let tableHeaderIdx = -1;
    for (let i = cursor; i < totalRows; i++) {
      const row = data[i];
      if (!row) continue;
      const c0 = str(row[0]);
      const c1 = str(row[1]);
      const c2 = str(row[2]);
      if ((c0 === 'No.' || c0 === 'No') && c1 === '論理テーブル名' && c2 === '物理テーブル名') {
        tableHeaderIdx = i;
        break;
      }
    }
    if (tableHeaderIdx === -1) break;

    // Next row has the table info
    const infoRow = data[tableHeaderIdx + 1];
    if (!infoRow) { cursor = tableHeaderIdx + 1; continue; }

    const logicalTableName = str(infoRow[1]);
    const physicalTableName = str(infoRow[2]);
    const tableSourceRef: TableSourceRef = {
      sheetName,
      logicalName: buildCellSourceRef(sheetName, tableHeaderIdx + 1, 1),
      physicalName: buildCellSourceRef(sheetName, tableHeaderIdx + 1, 2),
    };

    if (!logicalTableName && !physicalTableName) {
      cursor = tableHeaderIdx + 1;
      continue;
    }

    // Find column header row within cols 0-14
    let colHeaderIdx = -1;
    for (let i = tableHeaderIdx + 2; i < Math.min(tableHeaderIdx + 30, totalRows); i++) {
      const row = data[i];
      if (!row) continue;
      const vals: string[] = [];
      for (let j = 0; j < Math.min(15, row.length); j++) {
        vals.push(str(row[j]));
      }
      if (vals.includes('論理名') && vals.includes('物理名') && vals.includes('データ型')) {
        colHeaderIdx = i;
        break;
      }
    }

    if (colHeaderIdx === -1) {
      cursor = tableHeaderIdx + 1;
      continue;
    }

    // Boundary: next table header row or end of sheet
    let nextTableHeader = totalRows;
    for (let i = colHeaderIdx + 1; i < totalRows; i++) {
      const row = data[i];
      if (!row) continue;
      const c0 = str(row[0]);
      const c1 = str(row[1]);
      if ((c0 === 'No.' || c0 === 'No') && c1 === '論理テーブル名') {
        nextTableHeader = i;
        break;
      }
    }

    // Build column map and detect column boundaries
    const headerRow = data[colHeaderIdx];
    const colMap: Record<string, number> = {};
    const standardHeaders = ['No', 'No.', '論理名', '物理名', 'データ型', 'Size', 'サイズ', 'Not Null', 'PK', '備考', '列とコードの説明 / 備考'];

    let tableStartCol = 0;
    let tableEndCol = 0;

    for (let j = 0; j < Math.min(15, headerRow.length); j++) {
      const v = str(headerRow[j]);
      if (v !== '') colMap[v] = j;
    }

    // Find first and last standard header columns
    for (let j = 0; j < Math.min(15, headerRow.length); j++) {
      const v = str(headerRow[j]);
      if (standardHeaders.includes(v)) {
        tableStartCol = j;
        break;
      }
    }

    for (let j = tableStartCol; j < Math.min(15, headerRow.length); j++) {
      const v = str(headerRow[j]);
      if (standardHeaders.includes(v)) {
        tableEndCol = j;
      } else if (v !== '' && !standardHeaders.includes(v)) {
        break;
      }
    }

    const columns = parseColumnsGeneric(
      sheetName,
      data,
      colHeaderIdx + 1,
      nextTableHeader,
      colMap,
      maxConsecutiveEmpty,
      pkMarkers,
      referenceExtraction,
    );

    if (columns.length > 0) {
      yield {
        logicalTableName,
        physicalTableName,
        columns,
        columnRange: {
          startCol: tableStartCol,
          endCol: tableEndCol,
          startColLabel: colToLabel(tableStartCol),
          endColLabel: colToLabel(tableEndCol),
        },
        rowRange: {
          startRow: tableHeaderIdx,
          endRow: colHeaderIdx + columns.length,
        },
        excelRange: formatExcelRange(tableHeaderIdx, colHeaderIdx + columns.length, tableStartCol, tableEndCol),
        sourceRef: tableSourceRef,
      };
    }

    cursor = nextTableHeader;
  }
}

/**
 * Find all horizontal Format A table blocks embedded in a Format B sheet.
 * These appear as "テーブル情報" markers at column offsets >= 10.
 */
function* findFormatBHorizontalTables(
  sheetName: string,
  data: any[][],
  maxConsecutiveEmpty: number = 10,
  pkMarkers: string[] = DEFAULT_PK_MARKERS,
  referenceExtraction?: ReferenceExtractionConfig,
): Generator<TableInfo> {
  const foundBlocks = new Set<string>();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    for (let j = 10; j < row.length; j++) {
      if (str(row[j]) === 'テーブル情報') {
        const key = `${i},${j}`;
        if (foundBlocks.has(key)) continue;
        foundBlocks.add(key);

        // End row: next テーブル情報 in same column, or end of sheet
        let endRow = data.length;
        for (let k = i + 1; k < data.length; k++) {
          const r = data[k];
          if (r && str(r[j]) === 'テーブル情報') {
            endRow = k;
            break;
          }
        }

        const table = parseFormatABlock(
          sheetName,
          data,
          j,
          i,
          endRow,
          maxConsecutiveEmpty,
          pkMarkers,
          referenceExtraction,
        );
        if (table && table.columns.length > 0) {
          yield table;
        }
      }
    }
  }
}

/**
 * Detect multiple tables arranged side-by-side horizontally.
 * Scans for multiple '物理テーブル名' labels in the same row range.
 */
function* findSideBySideTables(
  sheetName: string,
  data: any[][],
  maxConsecutiveEmpty: number = 10,
  pkMarkers: string[] = DEFAULT_PK_MARKERS,
  referenceExtraction?: ReferenceExtractionConfig,
): Generator<TableInfo> {
  const totalRows = data.length;
  const processedRanges = new Set<string>();

  for (let i = 0; i < totalRows; i++) {
    const row = data[i];
    if (!row) continue;

    // Find all '物理テーブル名' labels in this row
    const tableNamePositions: number[] = [];
    for (let j = 0; j < row.length; j++) {
      if (str(row[j]) === '物理テーブル名') {
        tableNamePositions.push(j);
      }
    }

    // If we found multiple table names in the same row, process each as a separate table
    if (tableNamePositions.length > 1) {
      for (let idx = 0; idx < tableNamePositions.length; idx++) {
        const colPos = tableNamePositions[idx];
        const key = `${i},${colPos}`;
        if (processedRanges.has(key)) continue;
        processedRanges.add(key);

        // Determine the column range for this table
        const nextTableCol = idx < tableNamePositions.length - 1 ? tableNamePositions[idx + 1] : row.length;

        // Search for header row starting from this column position
        let headerRowIdx = -1;
        const searchStartCol = Math.max(0, colPos - 2);

        for (let r = i; r < Math.min(i + 30, totalRows); r++) {
          const searchRow = data[r];
          if (!searchRow) continue;

          const vals: string[] = [];
          for (let c = searchStartCol; c < Math.min(nextTableCol, searchRow.length); c++) {
            vals.push(str(searchRow[c]));
          }

          if (vals.includes('論理名') && vals.includes('物理名') && vals.includes('データ型')) {
            headerRowIdx = r;
            break;
          }
        }

        if (headerRowIdx === -1) continue;

        // Build column map and detect boundaries
        const headerRow = data[headerRowIdx];
        const colMap: Record<string, number> = {};
        const standardHeaders = ['No', 'No.', '論理名', '物理名', 'データ型', 'Size', 'サイズ', 'Not Null', 'PK', '備考', '列とコードの説明 / 備考'];

        let tableStartCol = searchStartCol;
        let tableEndCol = searchStartCol;

        // Build column map for this table's range
        for (let c = searchStartCol; c < Math.min(nextTableCol, headerRow.length); c++) {
          const v = str(headerRow[c]);
          if (v !== '') colMap[v] = c;
        }

        // Find first and last standard header columns
        for (let c = searchStartCol; c < Math.min(nextTableCol, headerRow.length); c++) {
          const v = str(headerRow[c]);
          if (standardHeaders.includes(v)) {
            tableStartCol = c;
            break;
          }
        }

        for (let c = tableStartCol; c < Math.min(nextTableCol, headerRow.length); c++) {
          const v = str(headerRow[c]);
          if (standardHeaders.includes(v)) {
            tableEndCol = c;
          } else if (v !== '' && !standardHeaders.includes(v)) {
            break;
          }
        }

        // Find table name
        const physicalTableName = str(row[colPos + 1]) || str(data[i + 1]?.[colPos]);
        const physicalNameRef =
          str(row[colPos + 1]) !== ''
            ? buildCellSourceRef(sheetName, i, colPos + 1)
            : str(data[i + 1]?.[colPos]) !== ''
              ? buildCellSourceRef(sheetName, i + 1, colPos)
              : undefined;
        let logicalTableName = '';
        let logicalNameRef: CellSourceRef | undefined;

        // Search for logical table name nearby
        for (let r = Math.max(0, i - 5); r <= Math.min(i + 5, totalRows - 1); r++) {
          const searchRow = data[r];
          if (!searchRow) continue;
          for (let c = searchStartCol; c < Math.min(nextTableCol, searchRow.length); c++) {
            if (str(searchRow[c]) === '論理テーブル名' && c + 1 < searchRow.length) {
              logicalTableName = str(searchRow[c + 1]);
              logicalNameRef = buildCellSourceRef(sheetName, r, c + 1);
              break;
            }
          }
          if (logicalTableName) break;
        }

        // Find boundary for data rows
        let endRow = totalRows;
        for (let r = headerRowIdx + 1; r < totalRows; r++) {
          const searchRow = data[r];
          if (!searchRow) continue;

          // Check if we hit another table name marker
          for (let c = searchStartCol; c < Math.min(nextTableCol, searchRow.length); c++) {
            if (str(searchRow[c]) === '物理テーブル名' || str(searchRow[c]) === 'テーブル情報') {
              endRow = r;
              break;
            }
          }
          if (endRow !== totalRows) break;
        }

        const columns = parseColumnsGeneric(
          sheetName,
          data,
          headerRowIdx + 1,
          Math.min(endRow, totalRows),
          colMap,
          maxConsecutiveEmpty,
          pkMarkers,
          referenceExtraction,
        );

        if (columns.length > 0) {
          yield {
            logicalTableName: logicalTableName || physicalTableName,
            physicalTableName: physicalTableName || logicalTableName || 'unknown',
            columns,
            columnRange: {
              startCol: tableStartCol,
              endCol: tableEndCol,
              startColLabel: colToLabel(tableStartCol),
              endColLabel: colToLabel(tableEndCol),
            },
            rowRange: {
              startRow: i,
              endRow: headerRowIdx + columns.length,
            },
            excelRange: formatExcelRange(i, headerRowIdx + columns.length, tableStartCol, tableEndCol),
            sourceRef: {
              sheetName,
              logicalName: logicalNameRef,
              physicalName: physicalNameRef,
            },
          };
        }
      }
    }
  }
}

// ─── Generic column parser ────────────────────────────────────────────────────

const HEADER_ALIASES: Record<string, string[]> = {
  'no':          ['No', 'No.', 'No,', 'NO'],
  'logicalName': ['論理名'],
  'physicalName':['物理名'],
  'dataType':    ['データ型'],
  'size':        ['Size', 'サイズ'],
  'notNull':     ['Not Null', 'NOT NULL', 'NotNull', 'NOTNULL', 'not null'],
  'pk':          ['PK'],
  'comment':     ['備考', '列とコードの説明 / 備考'],
};

function resolveColumn(colMap: Record<string, number>, field: string): number | undefined {
  const aliases = HEADER_ALIASES[field];
  if (!aliases) return undefined;
  for (const alias of aliases) {
    if (colMap[alias] !== undefined) return colMap[alias];
  }
  return undefined;
}

function parseColumnsGeneric(
  sheetName: string,
  data: any[][],
  startRow: number,
  endRow: number,
  colMap: Record<string, number>,
  maxConsecutiveEmpty: number = 10,
  pkMarkers: string[] = DEFAULT_PK_MARKERS,
  referenceExtraction?: ReferenceExtractionConfig,
): ColumnInfo[] {
  const idxNo       = resolveColumn(colMap, 'no');
  const idxLogical  = resolveColumn(colMap, 'logicalName');
  const idxPhysical = resolveColumn(colMap, 'physicalName');
  const idxType     = resolveColumn(colMap, 'dataType');
  const idxSize     = resolveColumn(colMap, 'size');
  const idxNotNull  = resolveColumn(colMap, 'notNull');
  const idxPk       = resolveColumn(colMap, 'pk');
  const idxComment  = resolveColumn(colMap, 'comment');
  const pkMarkerSet = new Set(normalizePkMarkers(pkMarkers));

  const columns: ColumnInfo[] = [];
  let consecutiveEmpty = 0;

  for (let i = startRow; i < endRow; i++) {
    const row = data[i];
    if (!row || row.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= maxConsecutiveEmpty && columns.length > 0) break;
      continue;
    }

    const physicalName = idxPhysical !== undefined ? str(row[idxPhysical]) : '';
    if (physicalName === '') {
      consecutiveEmpty++;
      if (consecutiveEmpty >= maxConsecutiveEmpty && columns.length > 0) break;
      continue;
    }
    consecutiveEmpty = 0;

    // Skip metadata rows
    const logicalName = idxLogical !== undefined ? str(row[idxLogical]) : '';
    if (['RDBMS', 'ENGINE', 'CHARSET', '作成日 / 作成者', '更新日 / 更新者'].includes(logicalName)) continue;
    if (['MySQL', 'InnoDB', 'utf8mb4'].includes(physicalName)) continue;

    // Skip rows where No column isn't a number (like repeated header rows)
    const noVal = idxNo !== undefined ? row[idxNo] : undefined;
    if (noVal !== undefined && noVal !== null) {
      const num = Number(noVal);
      if (isNaN(num)) continue;
    }

    const rawCommentCell = idxComment !== undefined ? row[idxComment] : undefined;
    const commentRaw =
      rawCommentCell === undefined || rawCommentCell === null
        ? undefined
        : String(rawCommentCell);
    const comment = commentRaw?.trim() || undefined;
    const codeReferences = extractCodeReferencesFromComment(commentRaw ?? comment, referenceExtraction);
    const autoIncrement = detectAutoIncrementFromComment(commentRaw ?? comment);

    const col: ColumnInfo = {
      no: noVal != null ? Number(noVal) : undefined,
      logicalName: logicalName || undefined,
      physicalName,
      dataType: idxType !== undefined ? str(row[idxType]) || undefined : undefined,
      size: idxSize !== undefined && !isEmpty(row[idxSize]) ? str(row[idxSize]) : undefined,
      notNull: idxNotNull !== undefined ? str(row[idxNotNull]).toLowerCase().includes('not null') : false,
      isPk: idxPk !== undefined ? pkMarkerSet.has(str(row[idxPk])) : false,
      autoIncrement,
      comment,
      commentRaw,
      codeReferences,
      sourceRef:
        idxPhysical !== undefined
          ? buildCellSourceRef(sheetName, i, idxPhysical)
          : undefined,
    };

    columns.push(col);
  }

  return columns;
}

// ─── Legacy helpers (for fallback) ────────────────────────────────────────────

function findCellRow(data: any[][], startRow: number, label: string): number {
  for (let i = startRow; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      if (str(row[j]) === label) return i;
    }
  }
  return -1;
}

function getCellValue(data: any[][], rowIndex: number, label: string): string {
  const row = data[rowIndex];
  if (!row) return '';
  for (let j = 0; j < row.length; j++) {
    if (str(row[j]) === label) {
      for (let k = j + 1; k < row.length; k++) {
        if (!isEmpty(row[k])) return str(row[k]);
      }
      const nextRow = data[rowIndex + 1];
      if (nextRow && !isEmpty(nextRow[j])) return str(nextRow[j]);
    }
  }
  return '';
}

function findHeaderRow(data: any[][], startRow: number): number {
  const requiredHeaders = ['論理名', '物理名', 'データ型'];
  for (let i = startRow; i < Math.min(startRow + 30, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const rowVals = row.map((v: any) => str(v));
    if (requiredHeaders.every(h => rowVals.includes(h))) return i;
  }
  return -1;
}

function buildColumnMap(headerRow: any[]): Record<string, number> {
  const colMap: Record<string, number> = {};
  headerRow.forEach((val: any, idx: number) => {
    if (!isEmpty(val)) colMap[str(val)] = idx;
  });
  return colMap;
}

function* findTablesInSheet(
  sheetName: string,
  data: any[][],
  maxConsecutiveEmpty: number = 10,
  pkMarkers: string[] = DEFAULT_PK_MARKERS,
  referenceExtraction?: ReferenceExtractionConfig,
): Generator<TableInfo> {
  const totalRows = data.length;
  let cursor = 0;

  while (cursor < totalRows) {
    const tableStartIndex = findCellRow(data, cursor, '論理テーブル名');
    if (tableStartIndex === -1) break;

    const logicalTableName = getCellValue(data, tableStartIndex, '論理テーブル名');
    const logicalTableNameRef = getCellValueSourceRef(data, tableStartIndex, '論理テーブル名', sheetName);
    const physicalTableNameRow = findCellRow(data, tableStartIndex, '物理テーブル名');
    const physicalTableName = physicalTableNameRow !== -1
      ? getCellValue(data, physicalTableNameRow, '物理テーブル名')
      : logicalTableName;
    const physicalTableNameRef = physicalTableNameRow !== -1
      ? getCellValueSourceRef(data, physicalTableNameRow, '物理テーブル名', sheetName)
      : logicalTableNameRef;

    const headerRowIndex = findHeaderRow(data, tableStartIndex + 1);
    if (headerRowIndex === -1) {
      cursor = tableStartIndex + 1;
      continue;
    }

    const headerRow = data[headerRowIndex];
    const colMap = buildColumnMap(headerRow);

    // Detect column boundaries
    const standardHeaders = ['No', 'No.', '論理名', '物理名', 'データ型', 'Size', 'サイズ', 'Not Null', 'PK', '備考', '列とコードの説明 / 備考'];
    let tableStartCol = 0;
    let tableEndCol = 0;

    for (let j = 0; j < headerRow.length; j++) {
      const v = str(headerRow[j]);
      if (standardHeaders.includes(v)) {
        tableStartCol = j;
        break;
      }
    }

    for (let j = tableStartCol; j < headerRow.length; j++) {
      const v = str(headerRow[j]);
      if (standardHeaders.includes(v)) {
        tableEndCol = j;
      } else if (v !== '' && !standardHeaders.includes(v)) {
        break;
      }
    }

    const nextTableStart = findCellRow(data, headerRowIndex + 1, '論理テーブル名');
    const boundary = nextTableStart !== -1 ? nextTableStart : totalRows;

    const columns = parseColumnsGeneric(
      sheetName,
      data,
      headerRowIndex + 1,
      boundary,
      colMap,
      maxConsecutiveEmpty,
      pkMarkers,
      referenceExtraction,
    );

    yield {
      logicalTableName: String(logicalTableName || ''),
      physicalTableName: String(physicalTableName || ''),
      columns,
      columnRange: {
        startCol: tableStartCol,
        endCol: tableEndCol,
        startColLabel: colToLabel(tableStartCol),
        endColLabel: colToLabel(tableEndCol),
      },
      rowRange: {
        startRow: tableStartIndex,
        endRow: headerRowIndex + columns.length,
      },
      excelRange: formatExcelRange(tableStartIndex, headerRowIndex + columns.length, tableStartCol, tableEndCol),
      sourceRef: {
        sheetName,
        logicalName: logicalTableNameRef,
        physicalName: physicalTableNameRef,
      },
    };

    cursor = boundary;
  }
}

// ─── Sheet data API (for spreadsheet viewer) ─────────────────────────────────

export function getSheetData(filePath: string, sheetName: string): any[][] {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Sheet ${sheetName} not found`);
  }
  return XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
}

export function parseSheetRegion(
  filePath: string,
  sheetName: string,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  options: ParseOptions = {}
): TableInfo[] {
  const maxConsecutiveEmpty = options.maxConsecutiveEmptyRows ?? 10;
  const pkMarkers = normalizePkMarkers(options.pkMarkers);
  const referenceExtraction = options.referenceExtraction;
  const data = getSheetData(filePath, sheetName);

  let logicalTableName = '';
  let physicalTableName = '';
  let logicalTableNameRef: CellSourceRef | undefined;
  let physicalTableNameRef: CellSourceRef | undefined;

  // 1) First, look for table name WITHIN the selection
  for (let i = startRow; i <= Math.min(endRow, data.length - 1); i++) {
    const row = data[i] || [];
    for (let j = startCol; j <= endCol; j++) {
      const v = str(row[j]);
      if (v === '論理テーブル名' && j + 1 <= endCol) {
        logicalTableName = str(row[j + 1]);
        logicalTableNameRef = buildCellSourceRef(sheetName, i, j + 1);
      }
      if (v === '物理テーブル名' && j + 1 <= endCol) {
        physicalTableName = str(row[j + 1]);
        physicalTableNameRef = buildCellSourceRef(sheetName, i, j + 1);
      }
    }
  }

  // 2) If not found, search UPWARD from startRow (the name is usually above the column area)
  //    Also widen column search range since table name labels may be in adjacent columns
  if (!logicalTableName && !physicalTableName) {
    const searchFromRow = Math.max(0, startRow - 30);
    const colSearchMin = Math.max(0, startCol - 2);
    const colSearchMax = endCol + 4; // widen rightward to catch values next to labels

    for (let i = startRow - 1; i >= searchFromRow; i--) {
      const row = data[i] || [];
      for (let j = colSearchMin; j <= Math.min(colSearchMax, row.length - 1); j++) {
        const v = str(row[j]);
        if (v === '論理テーブル名') {
          // Look right for value
          for (let k = j + 1; k < row.length; k++) {
            if (!isEmpty(row[k])) {
              logicalTableName = str(row[k]);
              logicalTableNameRef = buildCellSourceRef(sheetName, i, k);
              break;
            }
          }
        }
        if (v === '物理テーブル名') {
          for (let k = j + 1; k < row.length; k++) {
            if (!isEmpty(row[k])) {
              physicalTableName = str(row[k]);
              physicalTableNameRef = buildCellSourceRef(sheetName, i, k);
              break;
            }
          }
        }
      }
      // Stop once both found
      if (logicalTableName && physicalTableName) break;
    }
  }

  // 3) For Format B vertical tables, also check the table list header pattern:
  //    [No., 論理テーブル名, 物理テーブル名, 説明] followed by [N, name, physical, ...]
  if (!logicalTableName && !physicalTableName) {
    const searchFromRow = Math.max(0, startRow - 30);
    for (let i = startRow - 1; i >= searchFromRow; i--) {
      const row = data[i] || [];
      const c0 = str(row[0]);
      const c1 = str(row[1]);
      const c2 = str(row[2]);
      if ((c0 === 'No.' || c0 === 'No') && c1 === '論理テーブル名' && c2 === '物理テーブル名') {
        const infoRow = data[i + 1];
        if (infoRow) {
          logicalTableName = str(infoRow[1]);
          physicalTableName = str(infoRow[2]);
          logicalTableNameRef = buildCellSourceRef(sheetName, i + 1, 1);
          physicalTableNameRef = buildCellSourceRef(sheetName, i + 1, 2);
        }
        break;
      }
    }
  }

  // Find header row within region
  let headerRowIdx = -1;
  for (let i = startRow; i <= Math.min(endRow, data.length - 1); i++) {
    const row = data[i] || [];
    const vals: string[] = [];
    for (let j = startCol; j <= endCol; j++) {
      vals.push(str(row[j]));
    }
    if (vals.includes('論理名') && vals.includes('物理名') && vals.includes('データ型')) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) return [];

  const headerRow = data[headerRowIdx] || [];
  const colMap: Record<string, number> = {};
  for (let j = startCol; j <= endCol; j++) {
    const v = str(headerRow[j]);
    if (v !== '') colMap[v] = j;
  }

  const columns = parseColumnsGeneric(
    sheetName,
    data,
    headerRowIdx + 1,
    Math.min(endRow + 1, data.length),
    colMap,
    maxConsecutiveEmpty,
    pkMarkers,
    referenceExtraction,
  );

  if (columns.length === 0) return [];

  // Detect column boundaries
  const standardHeaders = ['No', 'No.', '論理名', '物理名', 'データ型', 'Size', 'サイズ', 'Not Null', 'PK', '備考', '列とコードの説明 / 備考'];
  let tableStartCol = startCol;
  let tableEndCol = startCol;

  for (let j = startCol; j <= endCol; j++) {
    const v = str(headerRow[j]);
    if (standardHeaders.includes(v)) {
      tableStartCol = j;
      break;
    }
  }

  for (let j = tableStartCol; j <= endCol; j++) {
    const v = str(headerRow[j]);
    if (standardHeaders.includes(v)) {
      tableEndCol = j;
    } else if (v !== '' && !standardHeaders.includes(v)) {
      break;
    }
  }

  const fallbackPhysicalTableName = buildRegionPhysicalTableName(
    sheetName,
    startRow,
    tableStartCol,
  );

  return [{
    logicalTableName: logicalTableName || physicalTableName || sheetName || 'Unknown',
    physicalTableName: physicalTableName || fallbackPhysicalTableName,
    columns,
    columnRange: {
      startCol: tableStartCol,
      endCol: tableEndCol,
      startColLabel: colToLabel(tableStartCol),
      endColLabel: colToLabel(tableEndCol),
    },
    rowRange: {
      startRow,
      endRow: headerRowIdx + columns.length,
    },
    excelRange: formatExcelRange(startRow, headerRowIdx + columns.length, tableStartCol, tableEndCol),
    sourceRef: {
      sheetName,
      logicalName: logicalTableNameRef,
      physicalName: physicalTableNameRef,
    },
  }];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ParseOptions {
  maxConsecutiveEmptyRows?: number;
  pkMarkers?: string[];
  referenceExtraction?: ReferenceExtractionConfig;
}

function getCellValueSourceRef(
  data: any[][],
  rowIndex: number,
  label: string,
  sheetName: string,
): CellSourceRef | undefined {
  const row = data[rowIndex];
  if (!row) return undefined;
  for (let j = 0; j < row.length; j++) {
    if (str(row[j]) === label) {
      for (let k = j + 1; k < row.length; k++) {
        if (!isEmpty(row[k])) {
          return buildCellSourceRef(sheetName, rowIndex, k);
        }
      }
      const nextRow = data[rowIndex + 1];
      if (nextRow && !isEmpty(nextRow[j])) {
        return buildCellSourceRef(sheetName, rowIndex + 1, j);
      }
    }
  }
  return undefined;
}

function parseTablesFromSheetData(sheetName: string, data: any[][], options: ParseOptions = {}): TableInfo[] {
  const maxConsecutiveEmpty = options.maxConsecutiveEmptyRows ?? 10;
  const pkMarkers = normalizePkMarkers(options.pkMarkers);
  const referenceExtraction = options.referenceExtraction;
  const tables: TableInfo[] = [];
  const seen = new Set<string>();

  function addTable(t: TableInfo) {
    if (t.columns.length === 0) return;
    const key = t.physicalTableName;
    if (seen.has(key)) return;
    seen.add(key);
    tables.push(t);
  }

  if (isFormatA(data)) {
    // Format A: single table per sheet (most common — 136 sheets)
    const table = parseFormatABlock(
      sheetName,
      data,
      0,
      0,
      undefined,
      maxConsecutiveEmpty,
      pkMarkers,
      referenceExtraction,
    );
    if (table) addTable(table);
  } else if (isFormatB(data)) {
    // Format B: multi-table sheet (e.g. テーブル定義-社会)
    const vertGen = findFormatBVerticalTables(sheetName, data, maxConsecutiveEmpty, pkMarkers, referenceExtraction);
    let vertNext = vertGen.next();
    while (!vertNext.done) { addTable(vertNext.value); vertNext = vertGen.next(); }

    const horizGen = findFormatBHorizontalTables(sheetName, data, maxConsecutiveEmpty, pkMarkers, referenceExtraction);
    let horizNext = horizGen.next();
    while (!horizNext.done) { addTable(horizNext.value); horizNext = horizGen.next(); }

    // Check for side-by-side tables
    const sideBySideGen = findSideBySideTables(sheetName, data, maxConsecutiveEmpty, pkMarkers, referenceExtraction);
    let sbNext = sideBySideGen.next();
    while (!sbNext.done) { addTable(sbNext.value); sbNext = sideBySideGen.next(); }
  } else {
    // Fallback: flexible scanner for unknown layouts
    const fallbackGen = findTablesInSheet(sheetName, data, maxConsecutiveEmpty, pkMarkers, referenceExtraction);
    let fbNext = fallbackGen.next();
    while (!fbNext.done) { addTable(fbNext.value); fbNext = fallbackGen.next(); }

    // Also check for side-by-side tables in unknown formats
    const sideBySideGen = findSideBySideTables(sheetName, data, maxConsecutiveEmpty, pkMarkers, referenceExtraction);
    let sbNext = sideBySideGen.next();
    while (!sbNext.done) { addTable(sbNext.value); sbNext = sideBySideGen.next(); }
  }

  return tables;
}

function parseTableDefinitionsLegacyFromWorkbook(
  workbook: XLSX.WorkBook,
  sheetName: string,
  options: ParseOptions = {},
): TableInfo[] {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Sheet ${sheetName} not found`);
  }

  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  return parseTablesFromSheetData(sheetName, data, options);
}

function parseTableDefinitionsLegacy(filePath: string, sheetName: string, options: ParseOptions = {}): TableInfo[] {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, COMPAT_WORKBOOK_READ_OPTIONS);
  return parseTableDefinitionsLegacyFromWorkbook(workbook, sheetName, options);
}

function shouldFallbackToLegacy(data: any[][], fastTables: TableInfo[]): boolean {
  if (fastTables.length > 0) {
    return false;
  }

  // Fast parser should have found something for explicit structured sheets with a valid header row.
  if (!isFormatA(data) && !isFormatB(data)) {
    return false;
  }
  return findHeaderRow(data, 0) !== -1;
}

function parseWorkbookBundleFromWorkbook(
  fileBuffer: Buffer,
  workbook: XLSX.WorkBook,
  options: ParseOptions,
  startedAt: number,
  xlsxReadMs: number,
  readMode: 'fast' | 'compat',
  readFallbackTriggered: boolean,
): WorkbookBundle {
  const tablesBySheet: Record<string, TableInfo[]> = {};
  const sheetSummaries: WorkbookBundle['sheetSummaries'] = [];
  const searchIndex: SearchIndexItem[] = [];
  const fallbackSheets: string[] = [];

  let sheetJsonMs = 0;
  let extractMs = 0;
  let legacyWorkbook: XLSX.WorkBook | null = readMode === 'compat' ? workbook : null;

  const parseLegacyForSheet = (sheetName: string): TableInfo[] => {
    if (!legacyWorkbook) {
      legacyWorkbook = XLSX.read(fileBuffer, COMPAT_WORKBOOK_READ_OPTIONS);
    }
    return parseTableDefinitionsLegacyFromWorkbook(legacyWorkbook, sheetName, options);
  };

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      tablesBySheet[sheetName] = [];
      sheetSummaries.push({ name: sheetName, hasTableDefinitions: false });
      searchIndex.push({
        type: 'sheet',
        sheetName,
        displayName: sheetName,
      });
      continue;
    }

    const convertStart = performance.now();
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    sheetJsonMs += performance.now() - convertStart;

    const parseStart = performance.now();
    let tables = parseTablesFromSheetData(sheetName, data, options);
    let usedFallback = false;

    if (shouldFallbackToLegacy(data, tables)) {
      try {
        tables = parseLegacyForSheet(sheetName);
        usedFallback = true;
      } catch {
        // Keep fast path result when fallback fails.
      }
    }

    extractMs += performance.now() - parseStart;

    if (usedFallback) {
      fallbackSheets.push(sheetName);
    }

    tablesBySheet[sheetName] = tables;
    const hasTableDefinitions = tables.length > 0;
    sheetSummaries.push({
      name: sheetName,
      hasTableDefinitions,
    });
    searchIndex.push({
      type: 'sheet',
      sheetName,
      displayName: sheetName,
    });
    tables.forEach((table) => {
      searchIndex.push({
        type: 'table',
        sheetName,
        displayName: `${table.physicalTableName} (${table.logicalTableName})`,
        physicalTableName: table.physicalTableName,
        logicalTableName: table.logicalTableName,
      });
    });
  }

  const totalMs = performance.now() - startedAt;
  const fallbackSheetCount = fallbackSheets.length;
  const parseMode: WorkbookParseMode = readMode === 'compat'
    ? 'fallback'
    : fallbackSheetCount === 0
    ? 'fast'
    : fallbackSheetCount === workbook.SheetNames.length
    ? 'fallback'
    : 'mixed';

  return {
    sheetSummaries,
    tablesBySheet,
    searchIndex,
    stats: {
      fileSize: fileBuffer.byteLength,
      sheetCount: workbook.SheetNames.length,
      parseMode,
      readMode,
      readFallbackTriggered,
      totalMs,
      xlsxReadMs,
      sheetJsonMs,
      extractMs,
      fallbackSheetCount,
      fallbackSheets,
      cacheHit: false,
    },
  };
}

export function parseWorkbookBundle(filePath: string, options: ParseOptions = {}): WorkbookBundle {
  const startedAt = performance.now();
  const fileBuffer = fs.readFileSync(filePath);
  let totalReadMs = 0;

  try {
    const readStart = performance.now();
    const workbook = XLSX.read(fileBuffer, FAST_WORKBOOK_READ_OPTIONS);
    totalReadMs += performance.now() - readStart;

    if (!Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
      throw new Error('Fast workbook read produced no sheets');
    }

    return parseWorkbookBundleFromWorkbook(
      fileBuffer,
      workbook,
      options,
      startedAt,
      totalReadMs,
      'fast',
      false,
    );
  } catch {
    const readStart = performance.now();
    const workbook = XLSX.read(fileBuffer, COMPAT_WORKBOOK_READ_OPTIONS);
    totalReadMs += performance.now() - readStart;

    return parseWorkbookBundleFromWorkbook(
      fileBuffer,
      workbook,
      options,
      startedAt,
      totalReadMs,
      'compat',
      true,
    );
  }
}

export function parseTableDefinitions(filePath: string, sheetName: string, options: ParseOptions = {}): TableInfo[] {
  return parseTableDefinitionsLegacy(filePath, sheetName, options);
}

export function parseTableDefinition(filePath: string, sheetName: string, options: ParseOptions = {}): TableInfo {
  const tables = parseTableDefinitions(filePath, sheetName, options);
  if (tables.length === 0) {
    return { logicalTableName: sheetName, physicalTableName: sheetName, columns: [] };
  }
  return tables[0];
}
