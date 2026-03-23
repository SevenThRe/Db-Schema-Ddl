/**
 * 構造化差分ビューアの型定義
 *
 * DDLテキスト差分ではなく、テーブル/カラム/フィールド単位の
 * セマンティック差分を表現する型群。
 */

import type { ColumnInfo, TableInfo, DbColumnSchema } from "@shared/schema";

// ---------------------------------------------------------------------------
// フィールド変更の人間可読ラベルマッピング
// ---------------------------------------------------------------------------

/** カラムフィールドキー */
export type ColumnFieldKey =
  | "physicalName"
  | "logicalName"
  | "dataType"
  | "size"
  | "notNull"
  | "isPk"
  | "autoIncrement"
  | "comment";

/** テーブルフィールドキー */
export type TableFieldKey = "physicalTableName" | "logicalTableName";

/** フィールド変更の1エントリ */
export interface FieldChange {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
  /** 値が実質的に同一か（空白・改行差のみ） */
  semanticEqual: boolean;
}

// ---------------------------------------------------------------------------
// 構造化カラム変更
// ---------------------------------------------------------------------------

export interface StructuredColumnChange {
  action: "added" | "removed" | "modified" | "renamed" | "rename_suggest";
  confidence?: number;
  requiresConfirmation: boolean;
  entityKey?: string;
  oldColumn?: ColumnInfo;
  newColumn?: ColumnInfo;
  changedFields: string[];
  /** 各フィールドの before/after（UIレンダリング用に正規化済み） */
  fieldChanges: FieldChange[];
  /** 表示用のカラム名 */
  displayName: string;
  /** rename の場合の旧名 → 新名 */
  oldDisplayName?: string;
}

// ---------------------------------------------------------------------------
// 構造化テーブル変更
// ---------------------------------------------------------------------------

export interface StructuredDiffEntry {
  /** 一意キー */
  key: string;
  /** 物理テーブル名 */
  tableName: string;
  /** 論理テーブル名 */
  logicalName?: string;
  /** シート名 */
  sheetName?: string;
  /** 変更アクション */
  action: "added" | "removed" | "modified" | "renamed" | "rename_suggest" | "changed";
  /** 信頼度 */
  confidence?: number;
  /** 確認が必要か */
  requiresConfirmation: boolean;
  /** テーブルレベルのフィールド変更 */
  tableFieldChanges: FieldChange[];
  /** カラムレベルの変更リスト */
  columnChanges: StructuredColumnChange[];
  /** 旧テーブルスナップショット */
  oldTable?: TableInfo;
  /** 新テーブルスナップショット */
  newTable?: TableInfo;
  /** DDL差分のfallback用（既存互換） */
  oldDdl: string;
  newDdl: string;
}

// ---------------------------------------------------------------------------
// DB スナップショット用の構造化カラム変更
// ---------------------------------------------------------------------------

export interface DbStructuredColumnChange {
  action: "added" | "removed" | "modified";
  columnName: string;
  oldColumn?: DbColumnSchema;
  newColumn?: DbColumnSchema;
  fieldChanges: FieldChange[];
}

// ---------------------------------------------------------------------------
// 差分表示タブモード
// ---------------------------------------------------------------------------

export type DiffTabMode = "structured" | "ddl";
