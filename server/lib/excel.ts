import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { type TableInfo, type ColumnInfo } from '@shared/schema';

export function getSheetNames(filePath: string): string[] {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  return workbook.SheetNames;
}

export function parseTableDefinition(filePath: string, sheetName: string): TableInfo {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Sheet ${sheetName} not found`);
  }

  // Convert to array of arrays to inspect layout
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

  // Helper to safely get value
  const getVal = (row: number, col: number): any => {
    if (row >= data.length || !data[row]) return null;
    return data[row][col];
  };

  // Extract Table Names
  // Row 4 (index 3): Logical Name at index 2
  // Row 5 (index 4): Physical Name at index 2
  console.log('Row 3:', data[3]);
  console.log('Row 4:', data[4]);
  const logicalTableName = getVal(3, 2) || sheetName;
  const physicalTableName = getVal(4, 2) || sheetName;

  // Find Header Row (Look for "No", "論理名", "物理名")
  // Search first 20 rows
  let headerRowIndex = -1;
  for (let i = 0; i < 20; i++) {
    const row = data[i];
    if (row && row.includes('No') && row.includes('論理名') && row.includes('物理名')) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    // If not found, return empty or try default structure
    return {
      logicalTableName: String(logicalTableName),
      physicalTableName: String(physicalTableName),
      columns: []
    };
  }

  // Get Column Indices from Header Row
  const headerRow = data[headerRowIndex];
  const colMap: Record<string, number> = {};
  headerRow.forEach((val: any, idx: number) => {
    if (typeof val === 'string') {
      colMap[val] = idx;
    }
  });

  const idxNo = colMap['No'];
  const idxLogical = colMap['論理名'];
  const idxPhysical = colMap['物理名'];
  const idxType = colMap['データ型'];
  const idxSize = colMap['Size'];
  const idxNotNull = colMap['Not Null'];
  const idxPk = colMap['PK'];
  const idxComment = colMap['備考'];

  const columns: ColumnInfo[] = [];
  
  // Data starts after header row
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue; // Skip empty rows

    // Stop if "No" column is empty or not a number (end of table usually)
    // Actually some formats have footer text.
    // Check if we have a valid No or Physical Name
    if (!row[idxPhysical]) continue;

    const col: ColumnInfo = {
      no: Number(row[idxNo]),
      logicalName: row[idxLogical],
      physicalName: row[idxPhysical],
      dataType: row[idxType],
      size: row[idxSize] ? String(row[idxSize]) : undefined,
      notNull: String(row[idxNotNull]).toLowerCase().includes('not null'),
      isPk: String(row[idxPk]) === '〇',
      comment: row[idxComment],
    };
    columns.push(col);
  }

  return {
    logicalTableName: String(logicalTableName),
    physicalTableName: String(physicalTableName),
    columns
  };
}
