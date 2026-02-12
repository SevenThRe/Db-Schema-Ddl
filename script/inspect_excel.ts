import * as XLSX from 'xlsx';
import * as fs from 'fs';
import path from 'path';

const filePath = 'attached_assets/30.データベース定義書-給与_ISI_20260209_1770863427874.xlsx';

try {
  // Read file buffer
  const fileBuffer = fs.readFileSync(filePath);
  
  // Parse buffer
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = '会社銀行';
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON (array of arrays)
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log(`Sheet Name: ${sheetName}`);
  console.log('First 20 rows:');
  // Log first 20 rows to console
  for (let i = 0; i < Math.min(20, data.length); i++) {
    console.log(JSON.stringify(data[i]));
  }

  // Also check other sheets
  console.log('All Sheets:', workbook.SheetNames);
} catch (error) {
  console.error('Error reading file:', error);
}
