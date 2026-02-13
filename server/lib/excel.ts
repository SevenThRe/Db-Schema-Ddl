import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { type TableInfo, type ColumnInfo } from '@shared/schema';

export function getSheetNames(filePath: string): string[] {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
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
function parseFormatABlock(data: any[][], colOffset: number, startRow: number, endRow?: number): TableInfo | null {
  const maxRow = endRow ?? data.length;

  let logicalTableName = '';
  let physicalTableName = '';

  // Find 論理テーブル名 and 物理テーブル名 labels within the header area
  for (let i = startRow; i < Math.min(startRow + 15, maxRow); i++) {
    const row = data[i];
    if (!row) continue;

    // Check at colOffset and colOffset+1 for labels
    for (let c = colOffset; c <= colOffset + 1; c++) {
      const label = str(row[c]);
      if (label === '論理テーブル名') {
        logicalTableName = str(row[c + 1]);
      } else if (label === '物理テーブル名') {
        physicalTableName = str(row[c + 1]);
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

  // Build column map from header row
  const headerRow = data[headerRowIdx];
  const colMap: Record<string, number> = {};
  for (let j = colOffset; j < headerRow.length; j++) {
    const v = str(headerRow[j]);
    if (v !== '') colMap[v] = j;
  }

  const columns = parseColumnsGeneric(data, headerRowIdx + 1, maxRow, colMap);

  return {
    logicalTableName: logicalTableName || physicalTableName,
    physicalTableName: physicalTableName || logicalTableName,
    columns,
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
function* findFormatBVerticalTables(data: any[][]): Generator<TableInfo> {
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

    // Build column map for cols 0-14
    const headerRow = data[colHeaderIdx];
    const colMap: Record<string, number> = {};
    for (let j = 0; j < Math.min(15, headerRow.length); j++) {
      const v = str(headerRow[j]);
      if (v !== '') colMap[v] = j;
    }

    const columns = parseColumnsGeneric(data, colHeaderIdx + 1, nextTableHeader, colMap);

    if (columns.length > 0) {
      yield {
        logicalTableName,
        physicalTableName,
        columns,
      };
    }

    cursor = nextTableHeader;
  }
}

/**
 * Find all horizontal Format A table blocks embedded in a Format B sheet.
 * These appear as "テーブル情報" markers at column offsets >= 10.
 */
function* findFormatBHorizontalTables(data: any[][]): Generator<TableInfo> {
  const foundBlocks = new Set<string>();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    for (let j = 10; j < row.length; j++) {
      if (str(row[j]) === 'テーブル情報') {
        const key = `${i},${j}`;
        if (foundBlocks.has(key)) continue;
        foundBlocks.add(key);

        // End row: next テーブル情報 in same column, or 200 rows max
        let endRow = Math.min(i + 200, data.length);
        for (let k = i + 1; k < data.length; k++) {
          const r = data[k];
          if (r && str(r[j]) === 'テーブル情報') {
            endRow = k;
            break;
          }
        }

        const table = parseFormatABlock(data, j, i, endRow);
        if (table && table.columns.length > 0) {
          yield table;
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
  data: any[][],
  startRow: number,
  endRow: number,
  colMap: Record<string, number>
): ColumnInfo[] {
  const idxNo       = resolveColumn(colMap, 'no');
  const idxLogical  = resolveColumn(colMap, 'logicalName');
  const idxPhysical = resolveColumn(colMap, 'physicalName');
  const idxType     = resolveColumn(colMap, 'dataType');
  const idxSize     = resolveColumn(colMap, 'size');
  const idxNotNull  = resolveColumn(colMap, 'notNull');
  const idxPk       = resolveColumn(colMap, 'pk');
  const idxComment  = resolveColumn(colMap, 'comment');

  const columns: ColumnInfo[] = [];
  let consecutiveEmpty = 0;

  for (let i = startRow; i < endRow; i++) {
    const row = data[i];
    if (!row || row.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 3 && columns.length > 0) break;
      continue;
    }

    const physicalName = idxPhysical !== undefined ? str(row[idxPhysical]) : '';
    if (physicalName === '') {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 3 && columns.length > 0) break;
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

    const col: ColumnInfo = {
      no: noVal != null ? Number(noVal) : undefined,
      logicalName: logicalName || undefined,
      physicalName,
      dataType: idxType !== undefined ? str(row[idxType]) || undefined : undefined,
      size: idxSize !== undefined && !isEmpty(row[idxSize]) ? str(row[idxSize]) : undefined,
      notNull: idxNotNull !== undefined ? str(row[idxNotNull]).toLowerCase().includes('not null') : false,
      isPk: idxPk !== undefined ? str(row[idxPk]) === '〇' : false,
      comment: idxComment !== undefined ? str(row[idxComment]) || undefined : undefined,
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

function* findTablesInSheet(data: any[][]): Generator<TableInfo> {
  const totalRows = data.length;
  let cursor = 0;

  while (cursor < totalRows) {
    const tableStartIndex = findCellRow(data, cursor, '論理テーブル名');
    if (tableStartIndex === -1) break;

    const logicalTableName = getCellValue(data, tableStartIndex, '論理テーブル名');
    const physicalTableNameRow = findCellRow(data, tableStartIndex, '物理テーブル名');
    const physicalTableName = physicalTableNameRow !== -1
      ? getCellValue(data, physicalTableNameRow, '物理テーブル名')
      : logicalTableName;

    const headerRowIndex = findHeaderRow(data, tableStartIndex + 1);
    if (headerRowIndex === -1) {
      cursor = tableStartIndex + 1;
      continue;
    }

    const headerRow = data[headerRowIndex];
    const colMap = buildColumnMap(headerRow);

    const nextTableStart = findCellRow(data, headerRowIndex + 1, '論理テーブル名');
    const boundary = nextTableStart !== -1 ? nextTableStart : totalRows;

    const columns = parseColumnsGeneric(data, headerRowIndex + 1, boundary, colMap);

    yield {
      logicalTableName: String(logicalTableName || ''),
      physicalTableName: String(physicalTableName || ''),
      columns,
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
  endCol: number
): TableInfo[] {
  const data = getSheetData(filePath, sheetName);

  let logicalTableName = '';
  let physicalTableName = '';

  // 1) First, look for table name WITHIN the selection
  for (let i = startRow; i <= Math.min(endRow, data.length - 1); i++) {
    const row = data[i] || [];
    for (let j = startCol; j <= endCol; j++) {
      const v = str(row[j]);
      if (v === '論理テーブル名' && j + 1 <= endCol) {
        logicalTableName = str(row[j + 1]);
      }
      if (v === '物理テーブル名' && j + 1 <= endCol) {
        physicalTableName = str(row[j + 1]);
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
            if (!isEmpty(row[k])) { logicalTableName = str(row[k]); break; }
          }
        }
        if (v === '物理テーブル名') {
          for (let k = j + 1; k < row.length; k++) {
            if (!isEmpty(row[k])) { physicalTableName = str(row[k]); break; }
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

  const columns = parseColumnsGeneric(data, headerRowIdx + 1, Math.min(endRow + 1, data.length), colMap);

  if (columns.length === 0) return [];

  return [{
    logicalTableName: logicalTableName || physicalTableName || 'Unknown',
    physicalTableName: physicalTableName || logicalTableName || 'unknown',
    columns,
  }];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseTableDefinitions(filePath: string, sheetName: string): TableInfo[] {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Sheet ${sheetName} not found`);
  }

  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
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
    const table = parseFormatABlock(data, 0, 0);
    if (table) addTable(table);
  } else if (isFormatB(data)) {
    // Format B: multi-table sheet (e.g. テーブル定義-社会)
    const vertGen = findFormatBVerticalTables(data);
    let vertNext = vertGen.next();
    while (!vertNext.done) { addTable(vertNext.value); vertNext = vertGen.next(); }

    const horizGen = findFormatBHorizontalTables(data);
    let horizNext = horizGen.next();
    while (!horizNext.done) { addTable(horizNext.value); horizNext = horizGen.next(); }
  } else {
    // Fallback: flexible scanner for unknown layouts
    const fallbackGen = findTablesInSheet(data);
    let fbNext = fallbackGen.next();
    while (!fbNext.done) { addTable(fbNext.value); fbNext = fallbackGen.next(); }
  }

  return tables;
}

export function parseTableDefinition(filePath: string, sheetName: string): TableInfo {
  const tables = parseTableDefinitions(filePath, sheetName);
  if (tables.length === 0) {
    return { logicalTableName: sheetName, physicalTableName: sheetName, columns: [] };
  }
  return tables[0];
}
