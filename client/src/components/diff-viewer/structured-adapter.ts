/**
 * 構造化差分アダプタ
 *
 * バックエンドの SchemaDiff / DbSnapshotDiff レスポンスを
 * StructuredDiffEntry[] に変換する。
 * DDLテキスト生成を経由せず、セマンティック情報をそのまま保持する。
 */

import type {
  ColumnInfo,
  TableInfo,
  SchemaDiffTableChange,
  SchemaDiffColumnChange,
  DbSchemaSnapshot,
  DbSchemaDiffResult,
  DbColumnSchema,
  DbColumnDiff,
  DbTableDiff,
} from "@shared/schema";
import type {
  StructuredDiffEntry,
  StructuredColumnChange,
  FieldChange,
  DbStructuredColumnChange,
} from "./structured-types";

// ---------------------------------------------------------------------------
// フィールドラベル定義
// ---------------------------------------------------------------------------

const COLUMN_FIELD_LABELS: Record<string, string> = {
  physicalName: "物理名",
  logicalName: "論理名",
  dataType: "データ型",
  size: "長さ",
  notNull: "NULL制約",
  isPk: "主キー",
  autoIncrement: "自増",
  comment: "備考",
};

const TABLE_FIELD_LABELS: Record<string, string> = {
  physicalTableName: "物理テーブル名",
  logicalTableName: "論理テーブル名",
};

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function normalizeText(value: string | undefined | null | boolean): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = String(value).trim();
  return text.length > 0 ? text : "-";
}

function normalizeComparable(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildFieldChange(
  field: string,
  oldValue: string | undefined | null | boolean,
  newValue: string | undefined | null | boolean,
  labels: Record<string, string>,
): FieldChange {
  const old = normalizeText(oldValue);
  const nw = normalizeText(newValue);
  return {
    field,
    label: labels[field] ?? field,
    oldValue: old,
    newValue: nw,
    semanticEqual: old === nw || normalizeComparable(old) === normalizeComparable(nw),
  };
}

function resolveColumnDisplayName(col?: ColumnInfo): string {
  if (!col) return "-";
  return col.physicalName || col.logicalName || "-";
}

// ---------------------------------------------------------------------------
// Excel Schema Diff → StructuredDiffEntry[]
// ---------------------------------------------------------------------------

function buildColumnFieldChanges(
  oldCol?: ColumnInfo,
  newCol?: ColumnInfo,
  changedFields?: string[],
  action?: string,
): FieldChange[] {
  const allFields = ["logicalName", "physicalName", "dataType", "size", "notNull", "isPk", "autoIncrement", "comment"];
  const fields = (action === "added" || action === "removed")
    ? allFields
    : (changedFields && changedFields.length > 0 ? changedFields : allFields);

  return fields
    .map((field) => {
      const oldVal = oldCol ? (oldCol as Record<string, unknown>)[field] : undefined;
      const newVal = newCol ? (newCol as Record<string, unknown>)[field] : undefined;
      return buildFieldChange(field, oldVal as string | boolean | undefined, newVal as string | boolean | undefined, COLUMN_FIELD_LABELS);
    })
    .filter((fc) => !(fc.oldValue === "-" && fc.newValue === "-"));
}

function adaptColumnChange(cc: SchemaDiffColumnChange): StructuredColumnChange {
  const fieldChanges = buildColumnFieldChanges(cc.oldColumn, cc.newColumn, cc.changedFields, cc.action);

  const newName = resolveColumnDisplayName(cc.newColumn);
  const oldName = resolveColumnDisplayName(cc.oldColumn);
  const isRename = (cc.action === "renamed" || cc.action === "rename_suggest") && oldName !== newName;

  return {
    action: cc.action,
    confidence: cc.confidence,
    requiresConfirmation: cc.requiresConfirmation,
    entityKey: cc.entityKey,
    oldColumn: cc.oldColumn,
    newColumn: cc.newColumn,
    changedFields: cc.changedFields,
    fieldChanges,
    displayName: newName !== "-" ? newName : oldName,
    oldDisplayName: isRename ? oldName : undefined,
  };
}

function buildTableFieldChanges(
  oldTable?: TableInfo,
  newTable?: TableInfo,
  changedFields?: string[],
  action?: string,
): FieldChange[] {
  const defaultFields = ["logicalTableName", "physicalTableName"];
  const fields = (action === "added" || action === "removed")
    ? defaultFields
    : (changedFields && changedFields.length > 0 ? changedFields : defaultFields);

  return fields.map((field) => {
    if (field === "logicalTableName") {
      return buildFieldChange(field, oldTable?.logicalTableName, newTable?.logicalTableName, TABLE_FIELD_LABELS);
    }
    return buildFieldChange(field, oldTable?.physicalTableName, newTable?.physicalTableName, TABLE_FIELD_LABELS);
  });
}

/**
 * SchemaDiff（Excel差分）のレスポンスからStructuredDiffEntry配列を生成する
 */
export function schemaDiffToStructuredEntries(
  sheets: Array<{ sheetName: string; tableChanges: SchemaDiffTableChange[] }>,
): StructuredDiffEntry[] {
  const entries: StructuredDiffEntry[] = [];

  for (const sheet of sheets) {
    for (let i = 0; i < sheet.tableChanges.length; i++) {
      const tc = sheet.tableChanges[i];
      const tableName = tc.newTable?.physicalTableName || tc.oldTable?.physicalTableName || `table_${i}`;
      const logicalName = tc.newTable?.logicalTableName || tc.oldTable?.logicalTableName;

      const tableFieldChanges = buildTableFieldChanges(tc.oldTable, tc.newTable, tc.changedFields, tc.action);
      const columnChanges = tc.columnChanges.map(adaptColumnChange);

      entries.push({
        key: tc.entityKey || `schema-${sheet.sheetName}-${i}`,
        tableName,
        logicalName,
        sheetName: sheet.sheetName,
        action: tc.action === "changed" ? "modified" : tc.action as StructuredDiffEntry["action"],
        confidence: tc.confidence,
        requiresConfirmation: tc.requiresConfirmation,
        tableFieldChanges,
        columnChanges,
        oldTable: tc.oldTable,
        newTable: tc.newTable,
        oldDdl: "",
        newDdl: "",
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// DB Snapshot Diff → StructuredDiffEntry[]
// ---------------------------------------------------------------------------

function buildDbColumnFieldChanges(
  before?: DbColumnSchema,
  after?: DbColumnSchema,
  action?: string,
): FieldChange[] {
  const fields: Array<{ key: string; label: string; old: unknown; new: unknown }> = [
    { key: "name", label: "物理名", old: before?.name, new: after?.name },
    { key: "dataType", label: "データ型", old: before?.dataType, new: after?.dataType },
    { key: "nullable", label: "NULL許容", old: before?.nullable, new: after?.nullable },
    { key: "primaryKey", label: "主キー", old: before?.primaryKey, new: after?.primaryKey },
    { key: "defaultValue", label: "デフォルト", old: before?.defaultValue, new: after?.defaultValue },
    { key: "comment", label: "備考", old: before?.comment, new: after?.comment },
  ];

  return fields
    .map((f) => buildFieldChange(f.key, f.old as string | boolean | undefined, f.new as string | boolean | undefined, { [f.key]: f.label }))
    .filter((fc) => !(fc.oldValue === "-" && fc.newValue === "-"));
}

/** DbColumnSchema → ColumnInfo 互換オブジェクトへ変換 */
function dbColToColumnInfo(col: DbColumnSchema): ColumnInfo {
  return {
    physicalName: col.name,
    dataType: col.dataType,
    notNull: !col.nullable,
    isPk: col.primaryKey,
    comment: col.comment ?? undefined,
  };
}

/** 追加/削除テーブルの全カラムをStructuredColumnChangeに展開する */
function synthesizeColumnsFromSnapshot(
  columns: DbColumnSchema[],
  action: "added" | "removed",
): StructuredColumnChange[] {
  return columns.map((col) => {
    const fieldChanges = buildDbColumnFieldChanges(
      action === "removed" ? col : undefined,
      action === "added" ? col : undefined,
      action,
    );
    return {
      action,
      requiresConfirmation: false,
      changedFields: fieldChanges.map((f) => f.field),
      fieldChanges,
      displayName: col.name,
      oldColumn: action === "removed" ? dbColToColumnInfo(col) : undefined,
      newColumn: action === "added" ? dbColToColumnInfo(col) : undefined,
    };
  });
}

/**
 * DBスナップショット差分からStructuredDiffEntry配列を生成する
 */
export function dbSnapshotDiffToStructuredEntries(
  source: DbSchemaSnapshot,
  target: DbSchemaSnapshot,
  result: DbSchemaDiffResult,
): StructuredDiffEntry[] {
  const sourceMap = new Map(source.tables.map((t) => [t.name, t]));
  const targetMap = new Map(target.tables.map((t) => [t.name, t]));

  return result.tableDiffs.map((diff, index) => {
    const srcTable = sourceMap.get(diff.tableName);
    const tgtTable = targetMap.get(diff.tableName);

    const tableFieldChanges: FieldChange[] = [];
    const srcComment = srcTable?.comment;
    const tgtComment = tgtTable?.comment;
    if (srcComment || tgtComment) {
      const fc = buildFieldChange("comment", srcComment, tgtComment, { comment: "テーブル備考" });
      if (!fc.semanticEqual || diff.changeType === "added" || diff.changeType === "removed") {
        tableFieldChanges.push(fc);
      }
    }

    let columnChanges: StructuredColumnChange[];

    if (diff.changeType === "added" && tgtTable) {
      columnChanges = synthesizeColumnsFromSnapshot(tgtTable.columns, "added");
    } else if (diff.changeType === "removed" && srcTable) {
      columnChanges = synthesizeColumnsFromSnapshot(srcTable.columns, "removed");
    } else {
      columnChanges = diff.columnDiffs.map((cd) => {
        const fieldChanges = buildDbColumnFieldChanges(cd.before, cd.after, cd.changeType);
        const displayName = cd.after?.name || cd.before?.name || cd.columnName;
        return {
          action: cd.changeType,
          requiresConfirmation: false,
          changedFields: fieldChanges.filter((f) => !f.semanticEqual).map((f) => f.field),
          fieldChanges,
          displayName,
          oldColumn: cd.before ? dbColToColumnInfo(cd.before) : undefined,
          newColumn: cd.after ? dbColToColumnInfo(cd.after) : undefined,
        };
      });
    }

    const action: StructuredDiffEntry["action"] =
      diff.changeType === "added" ? "added"
      : diff.changeType === "removed" ? "removed"
      : "modified";

    return {
      key: `db-diff-${diff.tableName}-${index}`,
      tableName: diff.tableName,
      logicalName: tgtComment ?? srcComment ?? undefined,
      action,
      confidence: undefined,
      requiresConfirmation: false,
      tableFieldChanges,
      columnChanges,
      oldDdl: "",
      newDdl: "",
    };
  });
}
