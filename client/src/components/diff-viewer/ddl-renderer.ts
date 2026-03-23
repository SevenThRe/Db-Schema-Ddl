/**
 * DDLレンダラー
 *
 * 差分データから軽量なCREATE TABLE DDLテキストを生成する。
 * server/lib/ddl.ts の generateMySQL()/generateOracle() を参考にした
 * クライアント側の簡易版。
 */

import type { ColumnInfo, TableInfo, DbColumnSchema, DbSchemaSnapshot, DbSchemaDiffResult } from "@shared/schema";
import type { DiffTableEntry } from "./types";

type Dialect = "mysql" | "oracle";

/** 正規化された列情報（全ソースから共通形式に変換） */
interface NormalizedColumn {
  physicalName: string;
  logicalName?: string;
  dataType?: string;
  size?: string;
  notNull?: boolean;
  isPk?: boolean;
  autoIncrement?: boolean;
  comment?: string;
}

// ---------------------------------------------------------------------------
// 型マッピング（server/lib/ddl.ts から簡易移植）
// ---------------------------------------------------------------------------

/** MySQLデータ型マッピング */
function mapTypeMySQL(type?: string, size?: string): string {
  if (!type) return `VARCHAR(255)`;
  const t = type.toLowerCase().trim();
  if (t === "varchar" || t === "char") return `${t.toUpperCase()}(${size || "255"})`;
  if (t === "tinyint" || t === "smallint" || t === "int" || t === "integer" || t === "bigint") {
    return size ? `${t.toUpperCase()}(${size})` : t.toUpperCase();
  }
  if (t === "date") return "DATE";
  if (t === "datetime") return size ? `DATETIME(${size})` : "DATETIME";
  if (t === "timestamp") return size ? `TIMESTAMP(${size})` : "TIMESTAMP";
  if (t === "text") return size ? `TEXT(${size})` : "TEXT";
  if (t === "longtext") return "LONGTEXT";
  if (t === "mediumtext") return "MEDIUMTEXT";
  if (t === "decimal" || t === "numeric") return `DECIMAL(${size || "10,2"})`;
  if (t === "float") return size ? `FLOAT(${size})` : "FLOAT";
  if (t === "double") return size ? `DOUBLE(${size})` : "DOUBLE";
  if (t === "boolean" || t === "bool") return "TINYINT(1)";
  if (t === "blob") return "BLOB";
  return size ? `${t.toUpperCase()}(${size})` : t.toUpperCase();
}

/** Oracleデータ型マッピング */
function mapTypeOracle(type?: string, size?: string): string {
  if (!type) return "VARCHAR2(255)";
  const t = type.toLowerCase().trim();
  if (t === "varchar") return `VARCHAR2(${size || "255"})`;
  if (t === "char") return `CHAR(${size || "1"})`;
  if (t === "tinyint" || t === "smallint" || t === "int" || t === "integer" || t === "bigint") {
    return size ? `NUMBER(${size})` : "NUMBER";
  }
  if (t === "date") return "DATE";
  if (t === "datetime" || t === "timestamp") return size ? `TIMESTAMP(${size})` : "TIMESTAMP";
  if (t === "text" || t === "longtext" || t === "mediumtext") return "CLOB";
  if (t === "decimal" || t === "numeric") return `NUMBER(${size || "10,2"})`;
  if (t === "float") return size ? `FLOAT(${size})` : "FLOAT";
  if (t === "double") return "BINARY_DOUBLE";
  if (t === "boolean" || t === "bool") return "NUMBER(1)";
  if (t === "blob") return "BLOB";
  return size ? `${t.toUpperCase()}(${size})` : t.toUpperCase();
}

/** SQLエスケープ（シングルクォートの二重化） */
function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// DDLテキスト生成
// ---------------------------------------------------------------------------

/**
 * MySQL CREATE TABLE DDL を生成する
 */
function renderMySqlDdl(tableName: string, logicalName: string | undefined, columns: NormalizedColumn[]): string {
  const lines: string[] = [];
  lines.push(`CREATE TABLE \`${tableName}\` (`);

  const pkCols: string[] = [];
  const hasPk = columns.some((col) => col.isPk);

  columns.forEach((col, index) => {
    let line = `  \`${col.physicalName}\` ${mapTypeMySQL(col.dataType, col.size)}`;
    if (col.notNull) line += " NOT NULL";
    if (col.autoIncrement) line += " AUTO_INCREMENT";
    if (col.logicalName) line += ` COMMENT '${escapeSql(col.logicalName)}'`;
    const isLast = index === columns.length - 1 && !hasPk;
    if (!isLast) line += ",";
    lines.push(line);
    if (col.isPk && col.physicalName) pkCols.push(col.physicalName);
  });

  if (pkCols.length > 0) {
    lines.push(`  PRIMARY KEY (${pkCols.map((c) => `\`${c}\``).join(", ")})`);
  }

  let closing = ")";
  if (logicalName) closing += ` COMMENT = '${escapeSql(logicalName)}'`;
  closing += ";";
  lines.push(closing);

  return lines.join("\n");
}

/**
 * Oracle CREATE TABLE DDL を生成する
 */
function renderOracleDdl(tableName: string, logicalName: string | undefined, columns: NormalizedColumn[]): string {
  const lines: string[] = [];
  lines.push(`CREATE TABLE ${tableName} (`);

  const pkCols: string[] = [];
  const hasPk = columns.some((col) => col.isPk);

  columns.forEach((col, index) => {
    let line = `  ${col.physicalName} ${mapTypeOracle(col.dataType, col.size)}`;
    if (col.notNull) line += " NOT NULL";
    const isLast = index === columns.length - 1 && !hasPk;
    if (!isLast) line += ",";
    lines.push(line);
    if (col.isPk && col.physicalName) pkCols.push(col.physicalName);
  });

  if (pkCols.length > 0) {
    lines.push(`  CONSTRAINT pk_${tableName} PRIMARY KEY (${pkCols.join(", ")})`);
  }

  lines.push(");");
  lines.push("");

  if (logicalName) {
    lines.push(`COMMENT ON TABLE ${tableName} IS '${escapeSql(logicalName)}';`);
  }
  columns.forEach((col) => {
    if (col.logicalName) {
      lines.push(`COMMENT ON COLUMN ${tableName}.${col.physicalName} IS '${escapeSql(col.logicalName)}';`);
    }
  });

  return lines.join("\n");
}

/**
 * テーブルのDDLテキストを生成する
 */
function renderTableDdl(
  tableName: string,
  logicalName: string | undefined,
  columns: NormalizedColumn[],
  dialect: Dialect,
): string {
  if (columns.length === 0) return `-- (empty table: ${tableName})`;
  return dialect === "mysql"
    ? renderMySqlDdl(tableName, logicalName, columns)
    : renderOracleDdl(tableName, logicalName, columns);
}

// ---------------------------------------------------------------------------
// 正規化アダプタ
// ---------------------------------------------------------------------------

/** ColumnInfo（Excel解析結果）をNormalizedColumnに変換 */
function normalizeColumnInfo(col: ColumnInfo): NormalizedColumn {
  return {
    physicalName: col.physicalName || col.logicalName || "unknown",
    logicalName: col.logicalName,
    dataType: col.dataType,
    size: col.size,
    notNull: col.notNull,
    isPk: col.isPk,
    autoIncrement: col.autoIncrement,
    comment: col.comment,
  };
}

// ---------------------------------------------------------------------------
// 公開アダプタ関数
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DB スナップショット DDL レンダラー
// ---------------------------------------------------------------------------

/**
 * DB スナップショットのカラム情報から CREATE TABLE DDL を生成する。
 * カラム型は DB から取得済みの完全な型文字列（varchar(255) 等）をそのまま使用する。
 */
function renderDbTableDdl(
  tableName: string,
  tableComment: string | undefined,
  columns: DbColumnSchema[],
): string {
  if (columns.length === 0) return `-- (no columns: ${tableName})`;
  const lines: string[] = [];
  lines.push(`CREATE TABLE \`${tableName}\` (`);

  const pkCols = columns.filter((c) => c.primaryKey).map((c) => c.name);
  const hasPk = pkCols.length > 0;

  columns.forEach((col, index) => {
    let line = `  \`${col.name}\` ${col.dataType}`;
    if (!col.nullable) line += " NOT NULL";
    if (col.defaultValue != null) line += ` DEFAULT ${col.defaultValue}`;
    if (col.comment) line += ` COMMENT '${escapeSql(col.comment)}'`;
    const isLast = index === columns.length - 1 && !hasPk;
    if (!isLast) line += ",";
    lines.push(line);
  });

  if (hasPk) {
    lines.push(`  PRIMARY KEY (${pkCols.map((c) => `\`${c}\``).join(", ")})`);
  }

  let closing = ")";
  if (tableComment) closing += ` COMMENT = '${escapeSql(tableComment)}'`;
  closing += ";";
  lines.push(closing);

  return lines.join("\n");
}

/**
 * DB スナップショット差分から DiffTableEntry 配列を生成する。
 * source/target スナップショットの全カラム情報を使って DDL テキストを生成し、
 * 行レベルの差分を計算する。
 */
export function dbSnapshotDiffToDiffEntries(
  source: DbSchemaSnapshot,
  target: DbSchemaSnapshot,
  result: DbSchemaDiffResult,
): DiffTableEntry[] {
  const sourceMap = new Map(source.tables.map((t) => [t.name, t]));
  const targetMap = new Map(target.tables.map((t) => [t.name, t]));

  return result.tableDiffs.map((diff, index) => {
    const srcTable = sourceMap.get(diff.tableName);
    const tgtTable = targetMap.get(diff.tableName);

    const oldDdl = srcTable
      ? renderDbTableDdl(diff.tableName, srcTable.comment ?? undefined, srcTable.columns)
      : "";
    const newDdl = tgtTable
      ? renderDbTableDdl(diff.tableName, tgtTable.comment ?? undefined, tgtTable.columns)
      : "";

    const action: DiffTableEntry["action"] =
      diff.changeType === "added" ? "added"
      : diff.changeType === "removed" ? "removed"
      : "modified";

    return {
      key: `db-diff-${diff.tableName}-${index}`,
      tableName: diff.tableName,
      action,
      addedLines: 0,
      removedLines: 0,
      oldDdl,
      newDdl,
      diffHunks: [],
    };
  });
}

// ---------------------------------------------------------------------------
// Excel スキーマ差分アダプタ
// ---------------------------------------------------------------------------

/**
 * SchemaDiff（Excel-to-Excel）のテーブル変更からDiffTableEntryを生成する
 */
export function schemaDiffToDiffEntry(
  tableChange: {
    action: string;
    entityKey?: string;
    oldTable?: TableInfo;
    newTable?: TableInfo;
    columnChanges: { oldColumn?: ColumnInfo; newColumn?: ColumnInfo }[];
  },
  dialect: Dialect,
  index: number,
): DiffTableEntry {
  const oldTable = tableChange.oldTable;
  const newTable = tableChange.newTable;
  const tableName = newTable?.physicalTableName || oldTable?.physicalTableName || `table_${index}`;
  const logicalName = newTable?.logicalTableName || oldTable?.logicalTableName;

  // 旧テーブルの列リスト構築
  const oldColumns: NormalizedColumn[] = oldTable
    ? (oldTable.columns || []).map(normalizeColumnInfo)
    : tableChange.columnChanges
        .filter((cc) => cc.oldColumn)
        .map((cc) => normalizeColumnInfo(cc.oldColumn!));

  // 新テーブルの列リスト構築
  const newColumns: NormalizedColumn[] = newTable
    ? (newTable.columns || []).map(normalizeColumnInfo)
    : tableChange.columnChanges
        .filter((cc) => cc.newColumn)
        .map((cc) => normalizeColumnInfo(cc.newColumn!));

  const oldTableName = oldTable?.physicalTableName || tableName;
  const newTableName = newTable?.physicalTableName || tableName;
  const oldLogical = oldTable?.logicalTableName || logicalName;
  const newLogical = newTable?.logicalTableName || logicalName;

  const oldDdl = oldColumns.length > 0 ? renderTableDdl(oldTableName, oldLogical, oldColumns, dialect) : "";
  const newDdl = newColumns.length > 0 ? renderTableDdl(newTableName, newLogical, newColumns, dialect) : "";

  return {
    key: tableChange.entityKey || `schema-${index}`,
    tableName,
    logicalName,
    action: (tableChange.action === "changed" ? "modified" : tableChange.action) as DiffTableEntry["action"],
    addedLines: 0,
    removedLines: 0,
    oldDdl,
    newDdl,
    diffHunks: [],
  };
}

