/**
 * MySQL データベース設定の定数定義
 */

// MySQL ストレージエンジンのオプション
export const MYSQL_ENGINES = [
  { value: "InnoDB", label: "InnoDB" },
  { value: "MyISAM", label: "MyISAM" },
  { value: "MEMORY", label: "MEMORY" },
  { value: "CSV", label: "CSV" },
  { value: "ARCHIVE", label: "ARCHIVE" },
  { value: "BLACKHOLE", label: "BLACKHOLE" },
  { value: "FEDERATED", label: "FEDERATED" },
] as const;

// MySQL 文字セットのオプション
export const MYSQL_CHARSETS = [
  { value: "utf8mb4", label: "utf8mb4 (Recommended)" },
  { value: "utf8mb3", label: "utf8mb3" },
  { value: "utf8", label: "utf8" },
  { value: "latin1", label: "latin1" },
  { value: "ascii", label: "ascii" },
  { value: "sjis", label: "sjis (Shift-JIS)" },
  { value: "cp932", label: "cp932 (Windows-31J)" },
  { value: "eucjpms", label: "eucjpms (EUC-JP)" },
  { value: "ujis", label: "ujis (EUC-JP)" },
] as const;

// utf8mb4 照合順序のオプション
export const UTF8MB4_COLLATIONS = [
  { value: "utf8mb4_bin", label: "utf8mb4_bin (Binary)" },
  { value: "utf8mb4_general_ci", label: "utf8mb4_general_ci (Case-insensitive)" },
  { value: "utf8mb4_unicode_ci", label: "utf8mb4_unicode_ci (Unicode)" },
  { value: "utf8mb4_0900_ai_ci", label: "utf8mb4_0900_ai_ci (MySQL 8.0 Default)" },
  { value: "utf8mb4_ja_0900_as_cs", label: "utf8mb4_ja_0900_as_cs (Japanese)" },
  { value: "utf8mb4_ja_0900_as_cs_ks", label: "utf8mb4_ja_0900_as_cs_ks (Japanese Kana-sensitive)" },
] as const;

// utf8mb3/utf8 照合順序のオプション
export const UTF8_COLLATIONS = [
  { value: "utf8_bin", label: "utf8_bin (Binary)" },
  { value: "utf8_general_ci", label: "utf8_general_ci (Case-insensitive)" },
  { value: "utf8_unicode_ci", label: "utf8_unicode_ci (Unicode)" },
] as const;

// デフォルトの DDL ヘッダーテンプレート
export const DEFAULT_HEADER_TEMPLATE = `TableName: \${logical_name}
Author: \${author}
Date: \${date}`;

export type MysqlEngine = typeof MYSQL_ENGINES[number]['value'];
export type MysqlCharset = typeof MYSQL_CHARSETS[number]['value'];
export type Utf8mb4Collation = typeof UTF8MB4_COLLATIONS[number]['value'];
export type Utf8Collation = typeof UTF8_COLLATIONS[number]['value'];
