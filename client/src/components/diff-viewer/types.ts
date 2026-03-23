/**
 * 差分ビューアの共有型定義
 *
 * 全ての差分ビュー（SchemaDiff, DbDiff, DbVsDb, SnapshotCompare）で
 * 共通に使用されるインターフェースを定義する。
 */

/** 差分表示モード */
export type DiffViewMode = "side-by-side" | "unified";

/** 差分行の種類 */
export type DiffLineType = "added" | "removed" | "unchanged";

/** 差分の1行データ */
export interface DiffLineData {
  type: DiffLineType;
  /** 旧側の行番号（追加行の場合はnull） */
  oldLineNumber: number | null;
  /** 新側の行番号（削除行の場合はnull） */
  newLineNumber: number | null;
  /** 行のテキスト内容 */
  content: string;
}

/** 差分ハンク（連続する変更行 or 折りたたまれた未変更行のグループ） */
export interface DiffHunk {
  type: "changed" | "collapsed";
  lines: DiffLineData[];
  /** 折りたたまれた行数（type=collapsedの場合のみ） */
  collapsedCount?: number;
}

/** テーブル差分エントリ（DiffViewerShellに渡す正規化データ） */
export interface DiffTableEntry {
  /** 一意キー（entityKey等） */
  key: string;
  /** 物理テーブル名 */
  tableName: string;
  /** 論理テーブル名 */
  logicalName?: string;
  /** シート名 */
  sheetName?: string;
  /** 変更アクション */
  action: "added" | "removed" | "modified" | "renamed" | "rename_suggest" | "changed";
  /** 追加行数 */
  addedLines: number;
  /** 削除行数 */
  removedLines: number;
  /** 旧CREATE TABLE DDL */
  oldDdl: string;
  /** 新CREATE TABLE DDL */
  newDdl: string;
  /** 計算済み差分ハンク */
  diffHunks: DiffHunk[];
  /** 構造化差分データ（セマンティック差分ビュー用、任意） */
  structuredEntry?: import("./structured-types").StructuredDiffEntry;
}

/** 差分タブモード */
export type DiffTabMode = "structured" | "ddl";

/** DiffViewerShellのプロパティ */
export interface DiffViewerShellProps {
  tables: DiffTableEntry[];
  selectedTableKey: string | null;
  onSelectTable: (key: string) => void;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  className?: string;
}

/** DiffContentのプロパティ */
export interface DiffContentProps {
  hunks: DiffHunk[];
  viewMode: DiffViewMode;
  oldTitle?: string;
  newTitle?: string;
}

/** DiffFileTreeのプロパティ */
export interface DiffFileTreeProps {
  tables: DiffTableEntry[];
  selectedTableKey: string | null;
  onSelectTable: (key: string) => void;
}

/** DiffHeaderのプロパティ */
export interface DiffHeaderProps {
  tableName: string;
  logicalName?: string;
  action: string;
  addedLines: number;
  removedLines: number;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  oldTitle?: string;
  newTitle?: string;
}
