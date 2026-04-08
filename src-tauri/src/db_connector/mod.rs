// DB 接続管理モジュール
// MySQL / PostgreSQL への接続設定を管理し、スキーマのイントロスペクションと差分比較を提供する

pub mod commands;
mod introspect;
pub mod query;
pub mod explain;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use sqlx::{MySqlPool, PgPool};
use tokio_util::sync::CancellationToken;

// ──────────────────────────────────────────────
// 公開型定義
// ──────────────────────────────────────────────

/// 対応 DB ドライバー種別
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DbDriver {
  Mysql,
  Postgres,
}

/// 接続環境ラベル（dev / test / prod）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DbEnvironment {
  Dev,
  Test,
  Prod,
}

/// DB 接続設定（パスワードは平文保存。本番では OS キーチェーンへの移行を推奨）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbConnectionConfig {
  pub id: String,
  pub name: String,
  pub driver: DbDriver,
  pub host: String,
  pub port: u16,
  pub database: String,
  pub username: String,
  pub password: String,
  /// 環境ラベル（dev / test / prod）— 旧設定には存在しないためオプション
  #[serde(skip_serializing_if = "Option::is_none")]
  pub environment: Option<DbEnvironment>,
  /// 読み取り専用モード — true の場合 DML/DDL を Rust 側でブロック（旧設定は false として扱う）
  #[serde(default)]
  pub readonly: bool,
  /// ワークベンチヘッダーの色タグ（CSS カラー文字列）
  #[serde(skip_serializing_if = "Option::is_none")]
  pub color_tag: Option<String>,
  /// デフォルトスキーマ名
  #[serde(skip_serializing_if = "Option::is_none")]
  pub default_schema: Option<String>,
}

// ──────────────────────────────────────────────
// Phase 1 クエリ実行 / EXPLAIN 型定義
// ──────────────────────────────────────────────

/// クエリ実行リクエスト
/// confirmed が false の場合、危険な SQL は Rust 側でブロックされる
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryExecutionRequest {
  pub connection_id: String,
  pub sql: String,
  pub request_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub schema: Option<String>,
  /// 1フェッチあたりの最大行数（デフォルト 1000）
  #[serde(default = "default_limit")]
  pub limit: u32,
  pub offset: Option<u32>,
  /// エラー時に後続ステートメントを継続するか（デフォルト false）
  #[serde(default)]
  pub continue_on_error: bool,
  /// 危険な SQL 確認済みフラグ — false の場合 Rust 側で実行を拒否する
  #[serde(default)]
  pub confirmed: bool,
}

fn default_limit() -> u32 {
  1000
}

/// "Load more" ページネーションリクエスト
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchMoreRequest {
  pub request_id: String,
  pub batch_index: u32,
  pub sql: String,
  pub connection_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub schema: Option<String>,
  pub offset: u32,
  #[serde(default = "default_limit")]
  pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DbQueryPagingMode {
  Offset,
  None,
  Unsupported,
}

/// クエリ結果カラム情報
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbQueryColumn {
  pub name: String,
  pub data_type: String,
}

/// クエリ結果の1行
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbQueryRow {
  pub values: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum DbGridEditSourceKind {
  TableOpen,
  StarterSelect,
  StarterColumns,
  StarterCount,
  CustomSql,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbGridEditSource {
  pub kind: DbGridEditSourceKind,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub table_name: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub schema: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub query_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DbGridEditEligibilityCode {
  ReadonlyConnection,
  UnsupportedSource,
  CountResult,
  MissingPrimaryKey,
  MissingPrimaryKeyColumn,
  DuplicatePrimaryKeyTuple,
  EmptyResult,
  ResultError,
  TableNotFound,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbGridEditEligibilityReason {
  pub code: DbGridEditEligibilityCode,
  pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbGridEditEligibility {
  pub eligible: bool,
  #[serde(default)]
  pub reasons: Vec<DbGridEditEligibilityReason>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbGridEditPatchCell {
  pub row_primary_key: HashMap<String, serde_json::Value>,
  pub row_pk_tuple: String,
  pub column_name: String,
  pub before_value: serde_json::Value,
  pub next_value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbGridPrepareCommitRequest {
  pub connection_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub schema: Option<String>,
  pub table_name: String,
  pub source: DbGridEditSource,
  pub primary_key_columns: Vec<String>,
  pub patch_cells: Vec<DbGridEditPatchCell>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbGridPrepareCommitResponse {
  pub plan_id: String,
  pub plan_hash: String,
  pub affected_rows: u64,
  #[serde(default)]
  pub changed_columns_summary: Vec<String>,
  #[serde(default)]
  pub sql_preview_lines: Vec<String>,
  pub preview_truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbGridCommitRequest {
  pub connection_id: String,
  pub plan_id: String,
  pub plan_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbGridCommitResponse {
  pub plan_id: String,
  pub plan_hash: String,
  pub committed_rows: u64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub failed_sql_index: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub failed_row_pk_tuple: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub message: Option<String>,
}

/// 1ステートメント分の実行結果バッチ
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbQueryBatchResult {
  pub sql: String,
  pub columns: Vec<DbQueryColumn>,
  pub rows: Vec<DbQueryRow>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub total_rows: Option<u64>,
  pub returned_rows: u64,
  pub has_more: bool,
  pub paging_mode: DbQueryPagingMode,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub paging_reason: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub next_offset: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub schema: Option<String>,
  pub elapsed_ms: u64,
  pub affected_rows: Option<u64>,
  pub error: Option<String>,
}

/// クエリ実行レスポンス（マルチステートメント対応）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryExecutionResponse {
  pub batches: Vec<DbQueryBatchResult>,
  pub request_id: String,
}

/// EXPLAIN プランの1ノード（再帰構造）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanNode {
  pub id: String,
  pub label: String,
  pub node_type: String,
  pub relation_name: Option<String>,
  pub cost: Option<f64>,
  pub rows: Option<u64>,
  pub children: Vec<PlanNode>,
  /// 警告タグ: FULL_TABLE_SCAN, LARGE_ROWS_ESTIMATE など
  pub warnings: Vec<String>,
}

/// Rust 側で正規化済みの EXPLAIN プラン
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbExplainPlan {
  pub dialect: DbDriver,
  pub root: PlanNode,
  pub raw_json: String,
}

/// EXPLAIN 実行リクエスト
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainRequest {
  pub connection_id: String,
  pub sql: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub schema: Option<String>,
}

/// 危険な SQL の分類
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DangerClass {
  Drop,
  Truncate,
  AlterTable,
  AlterDatabase,
  DeleteWithoutWhere,
  UpdateWithoutWhere,
}

/// 危険な SQL のプレビュー情報（確認ダイアログ用）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DangerousSqlPreview {
  pub dangers: Vec<DangerClass>,
  pub sql: String,
  pub connection_name: String,
  pub environment: DbEnvironment,
  pub database: String,
}

/// 危険な SQL プレビューリクエスト
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DangerousSqlPreviewRequest {
  pub connection_id: String,
  pub sql: String,
}

/// 結果行エクスポートリクエスト
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRowsRequest {
  pub connection_id: String,
  pub request_id: String,
  pub sql: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub schema: Option<String>,
  pub format: String,
  pub scope: ExportRowsScope,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub batch_index: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub loaded_rows: Option<Vec<DbQueryRow>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub columns: Option<Vec<DbQueryColumn>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub max_rows: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExportRowsScope {
  CurrentPage,
  LoadedRows,
  FullResult,
}

pub type ExportRowsResponse = crate::models::BinaryCommandResult;
pub type DbSchemaListResponse = Vec<String>;

/// コネクションプールのドライバーラッパー
pub enum AnyPool {
  Mysql(MySqlPool),
  Postgres(PgPool),
}

/// コネクションプールレジストリ（Tauri managed state）
/// connectionId をキーとして Arc<AnyPool> をキャッシュする
pub struct DbPoolRegistry {
  pub pools: Mutex<HashMap<String, Arc<AnyPool>>>,
}

/// クエリキャンセルトークンレジストリ（Tauri managed state）
/// requestId をキーとして CancellationToken を管理する
pub struct CancellationRegistry {
  pub tokens: Mutex<HashMap<String, CancellationToken>>,
}

/// カラムスキーマ
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbColumnSchema {
  pub name: String,
  pub data_type: String,
  pub nullable: bool,
  pub primary_key: bool,
  pub default_value: Option<String>,
  pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbIndexSchema {
  pub name: String,
  pub columns: Vec<String>,
  pub unique: bool,
  pub primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbForeignKeySchema {
  pub name: String,
  pub columns: Vec<String>,
  pub referenced_table: String,
  pub referenced_columns: Vec<String>,
}

/// テーブルスキーマ
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbTableSchema {
  pub name: String,
  pub comment: Option<String>,
  pub columns: Vec<DbColumnSchema>,
  pub indexes: Vec<DbIndexSchema>,
  pub foreign_keys: Vec<DbForeignKeySchema>,
}

/// ビュースキーマ
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbViewSchema {
  pub name: String,
  pub comment: Option<String>,
  pub columns: Vec<DbColumnSchema>,
}

/// DB スキーマスナップショット
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbSchemaSnapshot {
  pub connection_id: String,
  pub connection_name: String,
  pub database: String,
  pub schema: String,
  pub tables: Vec<DbTableSchema>,
  pub views: Vec<DbViewSchema>,
}

/// カラムレベルの差分
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbColumnDiff {
  pub column_name: String,
  pub change_type: String, // "added" | "removed" | "modified"
  pub before: Option<DbColumnSchema>,
  pub after: Option<DbColumnSchema>,
}

/// テーブルレベルの差分
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbTableDiff {
  pub table_name: String,
  pub change_type: String, // "added" | "removed" | "modified"
  pub column_diffs: Vec<DbColumnDiff>,
}

/// スキーマ差分結果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbSchemaDiffResult {
  pub source_label: String,
  pub target_label: String,
  pub table_diffs: Vec<DbTableDiff>,
  pub added_tables: usize,
  pub removed_tables: usize,
  pub modified_tables: usize,
  pub unchanged_tables: usize,
}

// ──────────────────────────────────────────────
// スキーマ差分計算
// ──────────────────────────────────────────────

pub fn compute_schema_diff(
  source: &DbSchemaSnapshot,
  target: &DbSchemaSnapshot,
) -> DbSchemaDiffResult {
  use std::collections::HashMap;

  let source_map: HashMap<&str, &DbTableSchema> =
    source.tables.iter().map(|t| (t.name.as_str(), t)).collect();
  let target_map: HashMap<&str, &DbTableSchema> =
    target.tables.iter().map(|t| (t.name.as_str(), t)).collect();

  let mut table_diffs: Vec<DbTableDiff> = Vec::new();
  let mut added = 0_usize;
  let mut removed = 0_usize;
  let mut modified = 0_usize;
  let mut unchanged = 0_usize;

  // Source 側にあるテーブル
  for (name, src_table) in &source_map {
    if let Some(tgt_table) = target_map.get(name) {
      // 両方に存在 → カラムレベルの差分を計算
      let col_diffs = diff_columns(&src_table.columns, &tgt_table.columns);
      if col_diffs.is_empty() {
        unchanged += 1;
      } else {
        modified += 1;
        table_diffs.push(DbTableDiff {
          table_name: name.to_string(),
          change_type: "modified".to_string(),
          column_diffs: col_diffs,
        });
      }
    } else {
      // Source のみに存在 → removed (source 視点では削除された)
      removed += 1;
      table_diffs.push(DbTableDiff {
        table_name: name.to_string(),
        change_type: "removed".to_string(),
        column_diffs: vec![],
      });
    }
  }

  // Target にのみ存在するテーブル → added
  for (name, _) in &target_map {
    if !source_map.contains_key(name) {
      added += 1;
      table_diffs.push(DbTableDiff {
        table_name: name.to_string(),
        change_type: "added".to_string(),
        column_diffs: vec![],
      });
    }
  }

  table_diffs.sort_by(|a, b| a.table_name.cmp(&b.table_name));

  DbSchemaDiffResult {
    source_label: format!("{} / {}", source.connection_name, source.database),
    target_label: format!("{} / {}", target.connection_name, target.database),
    table_diffs,
    added_tables: added,
    removed_tables: removed,
    modified_tables: modified,
    unchanged_tables: unchanged,
  }
}

fn diff_columns(source: &[DbColumnSchema], target: &[DbColumnSchema]) -> Vec<DbColumnDiff> {
  use std::collections::HashMap;

  let src_map: HashMap<&str, &DbColumnSchema> =
    source.iter().map(|c| (c.name.as_str(), c)).collect();
  let tgt_map: HashMap<&str, &DbColumnSchema> =
    target.iter().map(|c| (c.name.as_str(), c)).collect();

  let mut diffs: Vec<DbColumnDiff> = Vec::new();

  for (name, src_col) in &src_map {
    if let Some(tgt_col) = tgt_map.get(name) {
      // 型・nullable・pk が変わっていれば modified
      if src_col.data_type != tgt_col.data_type
        || src_col.nullable != tgt_col.nullable
        || src_col.primary_key != tgt_col.primary_key
      {
        diffs.push(DbColumnDiff {
          column_name: name.to_string(),
          change_type: "modified".to_string(),
          before: Some((*src_col).clone()),
          after: Some((*tgt_col).clone()),
        });
      }
    } else {
      diffs.push(DbColumnDiff {
        column_name: name.to_string(),
        change_type: "removed".to_string(),
        before: Some((*src_col).clone()),
        after: None,
      });
    }
  }

  for (name, tgt_col) in &tgt_map {
    if !src_map.contains_key(name) {
      diffs.push(DbColumnDiff {
        column_name: name.to_string(),
        change_type: "added".to_string(),
        before: None,
        after: Some((*tgt_col).clone()),
      });
    }
  }

  diffs.sort_by(|a, b| a.column_name.cmp(&b.column_name));
  diffs
}

// イントロスペクション公開 API
pub use introspect::{introspect_schema, test_connection};
