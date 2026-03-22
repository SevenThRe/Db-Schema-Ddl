// DB 接続管理モジュール
// MySQL / PostgreSQL への接続設定を管理し、スキーマのイントロスペクションと差分比較を提供する

pub mod commands;
mod introspect;

use serde::{Deserialize, Serialize};

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

/// テーブルスキーマ
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbTableSchema {
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
  pub tables: Vec<DbTableSchema>,
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
