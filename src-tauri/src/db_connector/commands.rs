// DB 接続管理 Tauri コマンド

use tauri::AppHandle;

use super::{
  compute_schema_diff, introspect_schema, test_connection, DbConnectionConfig, DbSchemaDiffResult,
  DbSchemaSnapshot,
};
use crate::storage;

// ──────────────────────────────────────────────
// 接続 CRUD
// ──────────────────────────────────────────────

/// 保存済み DB 接続一覧を返す
#[tauri::command]
pub fn db_conn_list(app: AppHandle) -> Result<Vec<DbConnectionConfig>, String> {
  storage::list_db_connections(&app)
}

/// DB 接続設定を保存する（id が空なら新規作成、既存 id なら上書き）
#[tauri::command]
pub fn db_conn_save(app: AppHandle, config: DbConnectionConfig) -> Result<DbConnectionConfig, String> {
  storage::save_db_connection(&app, config)
}

/// DB 接続設定を削除する
#[tauri::command]
pub fn db_conn_delete(app: AppHandle, id: String) -> Result<(), String> {
  storage::delete_db_connection(&app, &id)
}

// ──────────────────────────────────────────────
// 接続テスト
// ──────────────────────────────────────────────

/// 接続設定で実際に接続テストを行い、DB バージョン文字列を返す
#[tauri::command]
pub async fn db_conn_test(config: DbConnectionConfig) -> Result<String, String> {
  test_connection(&config).await
}

// ──────────────────────────────────────────────
// スキーマ取得
// ──────────────────────────────────────────────

/// 指定 ID の接続設定でスキーマをイントロスペクトする
#[tauri::command]
pub async fn db_introspect(app: AppHandle, connection_id: String) -> Result<DbSchemaSnapshot, String> {
  let configs = storage::list_db_connections(&app)?;
  let config = configs
    .into_iter()
    .find(|c| c.id == connection_id)
    .ok_or_else(|| format!("接続設定が見つかりません: {connection_id}"))?;
  introspect_schema(&config).await
}

// ──────────────────────────────────────────────
// スキーマ差分
// ──────────────────────────────────────────────

/// 2つの接続設定のスキーマを取得して差分を返す
#[tauri::command]
pub async fn db_diff(
  app: AppHandle,
  source_connection_id: String,
  target_connection_id: String,
) -> Result<DbSchemaDiffResult, String> {
  let configs = storage::list_db_connections(&app)?;
  let find = |id: &str| {
    configs
      .iter()
      .find(|c| c.id == id)
      .cloned()
      .ok_or_else(|| format!("接続設定が見つかりません: {id}"))
  };

  let src_config = find(&source_connection_id)?;
  let tgt_config = find(&target_connection_id)?;

  // 並列でスキーマ取得
  let (src_result, tgt_result) = futures_util::join!(
    introspect_schema(&src_config),
    introspect_schema(&tgt_config),
  );

  let source = src_result?;
  let target = tgt_result?;

  Ok(compute_schema_diff(&source, &target))
}
