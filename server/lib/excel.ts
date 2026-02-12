import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { type TableInfo, type ColumnInfo } from '@shared/schema';

export function getSheetNames(filePath: string): string[] {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  return workbook.SheetNames;
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

    const columns = parseColumns(data, headerRowIndex + 1, boundary, colMap);

    yield {
      logicalTableName: String(logicalTableName || ''),
      physicalTableName: String(physicalTableName || ''),
      columns,
    };

    cursor = boundary;
  }
}

function findCellRow(data: any[][], startRow: number, label: string): number {
  for (let i = startRow; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      if (String(row[j]).trim() === label) {
        return i;
      }
    }
  }
  return -1;
}

function getCellValue(data: any[][], rowIndex: number, label: string): string {
  const row = data[rowIndex];
  if (!row) return '';
  for (let j = 0; j < row.length; j++) {
    if (String(row[j]).trim() === label) {
      // First check the same row, columns to the right
      for (let k = j + 1; k < row.length; k++) {
        const val = row[k];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
      // If not found in the same row, check the row below at the same column index
      const nextRow = data[rowIndex + 1];
      if (nextRow && nextRow[j] !== null && nextRow[j] !== undefined && String(nextRow[j]).trim() !== '') {
        return String(nextRow[j]).trim();
      }
    }
  }
  return '';
}

function findHeaderRow(data: any[][], startRow: number): number {
  const requiredHeaders = ['No', '論理名', '物理名', 'データ型'];
  for (let i = startRow; i < Math.min(startRow + 30, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const rowVals = row.map((v: any) => String(v).trim());
    if (requiredHeaders.every(h => rowVals.includes(h))) {
      return i;
    }
  }
  return -1;
}

function buildColumnMap(headerRow: any[]): Record<string, number> {
  const colMap: Record<string, number> = {};
  headerRow.forEach((val: any, idx: number) => {
    if (val !== null && val !== undefined) {
      colMap[String(val).trim()] = idx;
    }
  });
  return colMap;
}

function parseColumns(data: any[][], startRow: number, endRow: number, colMap: Record<string, number>): ColumnInfo[] {
  const idxNo = colMap['No'];
  const idxLogical = colMap['論理名'];
  const idxPhysical = colMap['物理名'];
  const idxType = colMap['データ型'];
  const idxSize = colMap['Size'];
  const idxNotNull = colMap['Not Null'];
  const idxPk = colMap['PK'];
  const idxComment = colMap['備考'];

  const columns: ColumnInfo[] = [];

  for (let i = startRow; i < endRow; i++) {
    const row = data[i];
    if (!row || row.length === 0) break;

    const physicalName = row[idxPhysical];
    if (!physicalName || String(physicalName).trim() === '') break;

    const col: ColumnInfo = {
      no: row[idxNo] != null ? Number(row[idxNo]) : undefined,
      logicalName: row[idxLogical] ? String(row[idxLogical]).trim() : undefined,
      physicalName: String(physicalName).trim(),
      dataType: row[idxType] ? String(row[idxType]).trim() : undefined,
      size: row[idxSize] != null && String(row[idxSize]).trim() !== '' ? String(row[idxSize]).trim() : undefined,
      notNull: String(row[idxNotNull] || '').toLowerCase().includes('not null'),
      isPk: String(row[idxPk] || '') === '〇',
      comment: row[idxComment] ? String(row[idxComment]).trim() : undefined,
    };
    columns.push(col);
  }

  return columns;
}

export function parseTableDefinitions(filePath: string, sheetName: string): TableInfo[] {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Sheet ${sheetName} not found`);
  }

  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  const tables: TableInfo[] = [];

  for (const table of findTablesInSheet(data)) {
    tables.push(table);
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
