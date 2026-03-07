import { APP_DEFAULTS } from "../../shared/config.ts";

export const EXCEL_PARSER_DEFAULTS = {
  maxConsecutiveEmptyRows: APP_DEFAULTS.excel.maxConsecutiveEmptyRows,
  formatATableMetaScanRows: 15,
  formatAHeaderScanRows: 30,
  formatBHeaderScanRows: 30,
  formatBColumnScanLimit: 15,
  horizontalBlockMinColumn: 10,
  adjacentTableNameSearchRows: 30,
  formatMarkerScanRows: 25,
  formatMarkerScanCols: 20,
  sideBySideLogicalNameNeighborRows: 5,
  tableNameSearchColLeftPadding: 2,
  tableNameSearchColRightPadding: 4,
} as const;

export const EXCEL_PARSER_FALLBACKS = {
  unknownPhysicalTableName: "unknown",
  unknownLogicalTableName: "Unknown",
} as const;

export const EXCEL_LABELS = {
  tableInfo: "\u30c6\u30fc\u30d6\u30eb\u60c5\u5831", // テーブル情報
  databaseDefinition: "\u30c7\u30fc\u30bf\u30d9\u30fc\u30b9\u5b9a\u7fa9\u66f8", // データベース定義書
  logicalTableName: "\u8ad6\u7406\u30c6\u30fc\u30d6\u30eb\u540d", // 論理テーブル名
  physicalTableName: "\u7269\u7406\u30c6\u30fc\u30d6\u30eb\u540d", // 物理テーブル名
  logicalName: "\u8ad6\u7406\u540d", // 論理名
  physicalName: "\u7269\u7406\u540d", // 物理名
  dataType: "\u30c7\u30fc\u30bf\u578b", // データ型
  size: "Size",
  sizeAlt: "\u30b5\u30a4\u30ba", // サイズ
  notNull: "Not Null",
  pk: "PK",
  no: "No",
  noDot: "No.",
  remarks: "\u5099\u8003", // 備考
  remarksAlt: "\u5217\u3068\u30b3\u30fc\u30c9\u306e\u8aac\u660e / \u5099\u8003", // 列とコードの説明 / 備考
} as const;

export const EXCEL_STANDARD_HEADERS = [
  EXCEL_LABELS.no,
  EXCEL_LABELS.noDot,
  EXCEL_LABELS.logicalName,
  EXCEL_LABELS.physicalName,
  EXCEL_LABELS.dataType,
  EXCEL_LABELS.size,
  EXCEL_LABELS.sizeAlt,
  EXCEL_LABELS.notNull,
  EXCEL_LABELS.pk,
  EXCEL_LABELS.remarks,
  EXCEL_LABELS.remarksAlt,
] as const;

export const EXCEL_REQUIRED_COLUMN_HEADERS = [
  EXCEL_LABELS.logicalName,
  EXCEL_LABELS.physicalName,
  EXCEL_LABELS.dataType,
] as const;

export const EXCEL_NO_HEADER_TOKENS = ["no", "no.", "no,"] as const;
