import type { DbDriver } from "@shared/schema";

export interface SqlAutocompleteCatalogItem {
  label: string;
  insertText: string;
  detail: string;
  insertAsSnippet?: boolean;
}

export interface SqlKeywordCatalogItem extends SqlAutocompleteCatalogItem {
  kind: "keyword" | "template";
}

export const DRIVER_FUNCTION_ITEMS: Record<DbDriver, SqlAutocompleteCatalogItem[]> = {
  postgres: [
    { label: "NOW", insertText: "NOW()", detail: "builtin function (postgres)" },
    { label: "CURRENT_DATE", insertText: "CURRENT_DATE", detail: "builtin keyword (postgres)" },
    {
      label: "CURRENT_TIMESTAMP",
      insertText: "CURRENT_TIMESTAMP",
      detail: "builtin keyword (postgres)",
    },
    { label: "COALESCE", insertText: "COALESCE($1)", detail: "builtin function (postgres)", insertAsSnippet: true },
    { label: "STRING_AGG", insertText: "STRING_AGG($1, $2)", detail: "builtin function (postgres)", insertAsSnippet: true },
    { label: "DATE_TRUNC", insertText: "DATE_TRUNC($1, $2)", detail: "builtin function (postgres)", insertAsSnippet: true },
    { label: "JSONB_BUILD_OBJECT", insertText: "JSONB_BUILD_OBJECT($1)", detail: "builtin function (postgres)", insertAsSnippet: true },
  ],
  mysql: [
    { label: "NOW", insertText: "NOW()", detail: "builtin function (mysql)" },
    { label: "CURRENT_DATE", insertText: "CURRENT_DATE()", detail: "builtin function (mysql)" },
    { label: "CURRENT_TIMESTAMP", insertText: "CURRENT_TIMESTAMP()", detail: "builtin function (mysql)" },
    { label: "IFNULL", insertText: "IFNULL($1, $2)", detail: "builtin function (mysql)", insertAsSnippet: true },
    { label: "CONCAT", insertText: "CONCAT($1)", detail: "builtin function (mysql)", insertAsSnippet: true },
    { label: "DATE_FORMAT", insertText: "DATE_FORMAT($1, $2)", detail: "builtin function (mysql)", insertAsSnippet: true },
    { label: "JSON_OBJECT", insertText: "JSON_OBJECT($1)", detail: "builtin function (mysql)", insertAsSnippet: true },
  ],
};

export const DRIVER_TYPE_ITEMS: Record<DbDriver, SqlAutocompleteCatalogItem[]> = {
  postgres: [
    { label: "text", insertText: "text", detail: "type (postgres)" },
    { label: "integer", insertText: "integer", detail: "type (postgres)" },
    { label: "bigint", insertText: "bigint", detail: "type (postgres)" },
    { label: "boolean", insertText: "boolean", detail: "type (postgres)" },
    { label: "timestamp", insertText: "timestamp", detail: "type (postgres)" },
    { label: "timestamptz", insertText: "timestamptz", detail: "type (postgres)" },
    { label: "jsonb", insertText: "jsonb", detail: "type (postgres)" },
    { label: "uuid", insertText: "uuid", detail: "type (postgres)" },
    { label: "numeric", insertText: "numeric", detail: "type (postgres)" },
  ],
  mysql: [
    { label: "varchar", insertText: "varchar", detail: "type (mysql)" },
    { label: "int", insertText: "int", detail: "type (mysql)" },
    { label: "bigint", insertText: "bigint", detail: "type (mysql)" },
    { label: "tinyint", insertText: "tinyint", detail: "type (mysql)" },
    { label: "decimal", insertText: "decimal", detail: "type (mysql)" },
    { label: "datetime", insertText: "datetime", detail: "type (mysql)" },
    { label: "timestamp", insertText: "timestamp", detail: "type (mysql)" },
    { label: "json", insertText: "json", detail: "type (mysql)" },
    { label: "text", insertText: "text", detail: "type (mysql)" },
  ],
};

export const DRIVER_SYSTEM_SCHEMAS: Record<DbDriver, string[]> = {
  postgres: ["public", "information_schema", "pg_catalog", "pg_toast"],
  mysql: ["information_schema", "mysql", "performance_schema", "sys"],
};

export const SQL_KEYWORD_ITEMS: SqlKeywordCatalogItem[] = [
  { label: "SELECT", insertText: "SELECT ", detail: "keyword", kind: "keyword" },
  { label: "FROM", insertText: "FROM ", detail: "keyword", kind: "keyword" },
  { label: "WHERE", insertText: "WHERE ", detail: "keyword", kind: "keyword" },
  { label: "JOIN", insertText: "JOIN ", detail: "keyword", kind: "keyword" },
  { label: "GROUP BY", insertText: "GROUP BY ", detail: "keyword", kind: "keyword" },
  { label: "ORDER BY", insertText: "ORDER BY ", detail: "keyword", kind: "keyword" },
  { label: "INSERT", insertText: "INSERT INTO ", detail: "keyword", kind: "keyword" },
  { label: "UPDATE", insertText: "UPDATE ", detail: "keyword", kind: "keyword" },
  { label: "DELETE", insertText: "DELETE FROM ", detail: "keyword", kind: "keyword" },
  {
    label: "SELECT template",
    insertText: "SELECT ${1:*}\nFROM ${2:table}\nWHERE ${3:condition};",
    detail: "template",
    kind: "template",
    insertAsSnippet: true,
  },
  {
    label: "INSERT template",
    insertText: "INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});",
    detail: "template",
    kind: "template",
    insertAsSnippet: true,
  },
  {
    label: "UPDATE template",
    insertText: "UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};",
    detail: "template",
    kind: "template",
    insertAsSnippet: true,
  },
  {
    label: "DELETE template",
    insertText: "DELETE FROM ${1:table}\nWHERE ${2:condition};",
    detail: "template",
    kind: "template",
    insertAsSnippet: true,
  },
];
