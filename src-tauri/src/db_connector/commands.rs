// DB 接続管理 Tauri コマンド

use std::sync::Arc;
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde_json::{Map, Value};
use sqlx::Row;
use tauri::{AppHandle, State};
use tokio_util::sync::CancellationToken;

use super::query::{
  execute_statement, export_request_key, get_or_create_pool, invalidate_connection_pool,
  load_connection_config, resolve_active_schema, split_sql_statements,
  supports_full_result_export,
};
use super::{
  compute_schema_diff, introspect_schema, test_connection, AnyPool, CancellationRegistry,
  DbConnectionConfig, DbDataApplyExecuteRequest, DbDataApplyExecuteResponse,
  DbDataApplyJobDetailRequest, DbDataApplyJobDetailResponse,
  DbDataApplyPreviewRequest, DbDataApplyPreviewResponse, DbDataDiffDetailRequest,
  DbDataDiffDetailResponse, DbDataDiffPreviewRequest, DbDataDiffPreviewResponse, DbDriver,
  DbPoolRegistry, DbQueryColumn, DbQueryPagingMode, DbQueryRow, DbSchemaDiffResult,
  DbSchemaListResponse, DbSchemaSnapshot, ExportRowsRequest, ExportRowsResponse, ExportRowsScope,
};
use crate::storage;

const MAX_EXPORT_ROWS: u32 = 100_000;
const EXPORT_PAGE_SIZE: u32 = 1_000;

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
pub fn db_conn_save(
  app: AppHandle,
  pool_registry: State<'_, Arc<DbPoolRegistry>>,
  config: DbConnectionConfig,
) -> Result<DbConnectionConfig, String> {
  let saved = storage::save_db_connection(&app, config)?;
  invalidate_connection_pool(&pool_registry, &saved.id)?;
  Ok(saved)
}

/// DB 接続設定を削除する
#[tauri::command]
pub fn db_conn_delete(
  app: AppHandle,
  pool_registry: State<'_, Arc<DbPoolRegistry>>,
  id: String,
) -> Result<(), String> {
  storage::delete_db_connection(&app, &id)?;
  invalidate_connection_pool(&pool_registry, &id)?;
  Ok(())
}

// ──────────────────────────────────────────────
// 接続テスト
// ──────────────────────────────────────────────

/// 接続設定で実際に接続テストを行い、DB バージョン文字列を返す
#[tauri::command]
pub async fn db_conn_test(config: DbConnectionConfig) -> Result<String, String> {
  let hydrated = storage::hydrate_runtime_db_connection(config)?;
  test_connection(&hydrated).await
}

// ──────────────────────────────────────────────
// スキーマ取得
// ──────────────────────────────────────────────

/// 指定 ID の接続設定でスキーマをイントロスペクトする
#[tauri::command]
pub async fn db_introspect(app: AppHandle, connection_id: String) -> Result<DbSchemaSnapshot, String> {
  let config = load_connection_config(&app, &connection_id)?;
  introspect_schema(&config).await
}

/// 指定接続で利用可能なスキーマ一覧を返す（PostgreSQL）
#[tauri::command]
pub async fn db_list_schemas(
  app: AppHandle,
  pool_registry: State<'_, Arc<DbPoolRegistry>>,
  connection_id: String,
) -> Result<DbSchemaListResponse, String> {
  let config = load_connection_config(&app, &connection_id)?;
  if config.driver != DbDriver::Postgres {
    return Ok(vec![config.database]);
  }

  let pool = get_or_create_pool(&pool_registry, &config).await?;
  match pool.as_ref() {
    AnyPool::Postgres(pg_pool) => {
      let rows = sqlx::query(
        "SELECT schema_name
         FROM information_schema.schemata
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
           AND schema_name NOT LIKE 'pg_toast%'
         ORDER BY schema_name",
      )
      .fetch_all(pg_pool)
      .await
      .map_err(|e| format!("スキーマ一覧取得失敗: {e}"))?;

      let mut schemas: Vec<String> = rows
        .iter()
        .filter_map(|row| row.try_get::<String, _>("schema_name").ok())
        .collect();

      if schemas.is_empty() {
        if let Some(schema) = resolve_active_schema(&config, None) {
          schemas.push(schema);
        }
      }

      Ok(schemas)
    }
    _ => Err("PostgreSQL 接続プールの取得に失敗しました".to_string()),
  }
}

// ──────────────────────────────────────────────
// エクスポート
// ──────────────────────────────────────────────

/// クエリ結果をバックエンドでシリアライズしてバイナリとして返す
#[tauri::command]
pub async fn db_export_rows(
  app: AppHandle,
  pool_registry: State<'_, Arc<DbPoolRegistry>>,
  cancel_registry: State<'_, Arc<CancellationRegistry>>,
  request: ExportRowsRequest,
) -> Result<ExportRowsResponse, String> {
  let export_key = export_request_key(&request.request_id);
  let token = CancellationToken::new();

  {
    let mut tokens = cancel_registry
      .tokens
      .lock()
      .map_err(|e| e.to_string())?;
    tokens.insert(export_key.clone(), token.clone());
  }

  let export_result = execute_export_request(&app, &pool_registry, &request, &token).await;

  {
    let mut tokens = cancel_registry
      .tokens
      .lock()
      .map_err(|e| e.to_string())?;
    tokens.remove(&export_key);
  }

  export_result
}

async fn execute_export_request(
  app: &AppHandle,
  pool_registry: &DbPoolRegistry,
  request: &ExportRowsRequest,
  token: &CancellationToken,
) -> Result<ExportRowsResponse, String> {
  let format = normalize_export_format(&request.format)?;

  // scope values handled here: current_page / loaded_rows / full_result
  let (columns, rows, truncated) = match request.scope {
    ExportRowsScope::CurrentPage | ExportRowsScope::LoadedRows => {
      let (columns, rows) = resolve_inline_export_rows(request)?;
      (columns, rows, false)
    }
    ExportRowsScope::FullResult => {
      export_full_result_rows(app, pool_registry, request, token).await?
    }
  };

  if token.is_cancelled() {
    return Err("エクスポートがキャンセルされました".to_string());
  }

  let (bytes, mime_type, extension) = serialize_export_content(&columns, &rows, format)?;
  let row_count = i64::try_from(rows.len()).map_err(|_| "行数が上限を超えました".to_string())?;
  let file_name = if truncated {
    format!("export-truncated-{}.{}", rows.len(), extension)
  } else {
    format!("export.{}", extension)
  };

  Ok(ExportRowsResponse {
    base64: STANDARD.encode(bytes),
    file_name,
    mime_type: mime_type.to_string(),
    success_count: row_count,
    skipped_count: 0,
    skipped_tables: vec![],
  })
}

fn resolve_inline_export_rows(
  request: &ExportRowsRequest,
) -> Result<(Vec<DbQueryColumn>, Vec<DbQueryRow>), String> {
  let columns = request
    .columns
    .clone()
    .ok_or_else(|| "columns が指定されていません".to_string())?;

  let rows = match request.scope {
    ExportRowsScope::CurrentPage => request
      .current_page_rows
      .clone()
      .ok_or_else(|| "currentPageRows が指定されていません".to_string())?,
    ExportRowsScope::LoadedRows => request
      .loaded_rows
      .clone()
      .ok_or_else(|| "loadedRows が指定されていません".to_string())?,
    ExportRowsScope::FullResult => {
      return Err("full_result scope cannot use inline rows".to_string());
    }
  };

  Ok((columns, rows))
}

async fn export_full_result_rows(
  app: &AppHandle,
  pool_registry: &DbPoolRegistry,
  request: &ExportRowsRequest,
  token: &CancellationToken,
) -> Result<(Vec<DbQueryColumn>, Vec<DbQueryRow>, bool), String> {
  let statements = split_sql_statements(&request.sql);
  if statements.len() != 1 {
    return Err("full_result export は単一ステートメントのみ対応です".to_string());
  }

  let statement_sql = statements
    .first()
    .cloned()
    .ok_or_else(|| "実行する SQL がありません".to_string())?;
  let config = load_connection_config(app, &request.connection_id)?;
  if !supports_full_result_export(&statement_sql, &config.driver) {
    return Err(
      "full_result export only supports single SELECT-style queries with load more."
        .to_string(),
    );
  }
  let active_schema = resolve_active_schema(&config, request.schema.as_deref());
  let pool = get_or_create_pool(pool_registry, &config).await?;
  let max_rows = request.max_rows.unwrap_or(MAX_EXPORT_ROWS).min(MAX_EXPORT_ROWS);

  let mut columns: Vec<DbQueryColumn> = vec![];
  let mut rows: Vec<DbQueryRow> = vec![];
  let mut offset = 0_u32;
  let mut truncated = false;

  while (rows.len() as u32) < max_rows {
    if token.is_cancelled() {
      return Err("エクスポートがキャンセルされました".to_string());
    }

    let remaining = (max_rows - rows.len() as u32) as usize;
    let step_limit = remaining.min(EXPORT_PAGE_SIZE as usize);
    let batch = execute_statement(
      pool.as_ref(),
      &statement_sql,
      step_limit,
      offset,
      true,
      active_schema.as_deref(),
    )
    .await?;

    if let Some(error) = batch.error {
      return Err(error);
    }
    if batch.paging_mode == DbQueryPagingMode::Unsupported {
      return Err(
        batch
          .paging_reason
          .unwrap_or_else(|| "この SQL 形式は full_result export に対応していません".to_string()),
      );
    }

    if columns.is_empty() {
      columns = batch.columns.clone();
    }

    let fetched_count = batch.rows.len() as u32;
    if fetched_count == 0 {
      break;
    }

    rows.extend(batch.rows);
    offset = offset.saturating_add(fetched_count);

    if !batch.has_more {
      break;
    }
    if (rows.len() as u32) >= max_rows {
      truncated = true;
      break;
    }
  }

  Ok((columns, rows, truncated))
}

#[derive(Debug, Clone, Copy)]
enum ExportFormat {
  Json,
  Csv,
  Markdown,
  SqlInsert,
}

fn normalize_export_format(raw: &str) -> Result<ExportFormat, String> {
  match raw.trim().to_lowercase().as_str() {
    "json" => Ok(ExportFormat::Json),
    "csv" => Ok(ExportFormat::Csv),
    "markdown" => Ok(ExportFormat::Markdown),
    "sql-insert" => Ok(ExportFormat::SqlInsert),
    _ => Err(format!("未対応の export format です: {raw}")),
  }
}

fn serialize_export_content(
  columns: &[DbQueryColumn],
  rows: &[DbQueryRow],
  format: ExportFormat,
) -> Result<(Vec<u8>, &'static str, &'static str), String> {
  match format {
    ExportFormat::Json => {
      let payload: Vec<Value> = rows
        .iter()
        .map(|row| {
          let mut object = Map::new();
          for (index, column) in columns.iter().enumerate() {
            object.insert(
              column.name.clone(),
              row.values.get(index).cloned().unwrap_or(Value::Null),
            );
          }
          Value::Object(object)
        })
        .collect();
      let bytes = serde_json::to_vec_pretty(&payload).map_err(|e| format!("JSON 変換失敗: {e}"))?;
      Ok((bytes, "application/json;charset=utf-8", "json"))
    }
    ExportFormat::Csv => {
      let header = columns
        .iter()
        .map(|column| csv_escape(&column.name))
        .collect::<Vec<_>>()
        .join(",");
      let mut lines = vec![header];
      for row in rows {
        let line = row
          .values
          .iter()
          .map(csv_value)
          .collect::<Vec<_>>()
          .join(",");
        lines.push(line);
      }
      Ok((lines.join("\n").into_bytes(), "text/csv;charset=utf-8", "csv"))
    }
    ExportFormat::Markdown => {
      let header = format!(
        "| {} |",
        columns
          .iter()
          .map(|column| markdown_cell(&column.name))
          .collect::<Vec<_>>()
          .join(" | ")
      );
      let separator = format!("| {} |", columns.iter().map(|_| "---").collect::<Vec<_>>().join(" | "));
      let mut lines = vec![header, separator];
      for row in rows {
        let line = format!(
          "| {} |",
          row
            .values
            .iter()
            .map(markdown_value)
            .collect::<Vec<_>>()
            .join(" | ")
        );
        lines.push(line);
      }
      Ok((lines.join("\n").into_bytes(), "text/markdown;charset=utf-8", "md"))
    }
    ExportFormat::SqlInsert => {
      let table_name = "query_result";
      let column_list = columns
        .iter()
        .map(|column| column.name.as_str())
        .collect::<Vec<_>>()
        .join(", ");
      let statements: Vec<String> = rows
        .iter()
        .map(|row| {
          let values = row
            .values
            .iter()
            .map(sql_literal)
            .collect::<Vec<_>>()
            .join(", ");
          format!("INSERT INTO {table_name} ({column_list}) VALUES ({values});")
        })
        .collect();
      Ok((statements.join("\n").into_bytes(), "text/plain;charset=utf-8", "sql"))
    }
  }
}

fn csv_escape(value: &str) -> String {
  if value.contains(',') || value.contains('"') || value.contains('\n') {
    format!("\"{}\"", value.replace('"', "\"\""))
  } else {
    value.to_string()
  }
}

fn csv_value(value: &Value) -> String {
  if value.is_null() {
    String::new()
  } else {
    csv_escape(&json_value_to_string(value))
  }
}

fn markdown_cell(value: &str) -> String {
  value.replace('|', "\\|")
}

fn markdown_value(value: &Value) -> String {
  if value.is_null() {
    String::new()
  } else {
    markdown_cell(&json_value_to_string(value))
  }
}

fn sql_literal(value: &Value) -> String {
  if value.is_null() {
    return "NULL".to_string();
  }
  match value {
    Value::Bool(v) => {
      if *v {
        "TRUE".to_string()
      } else {
        "FALSE".to_string()
      }
    }
    Value::Number(v) => v.to_string(),
    _ => format!("'{}'", json_value_to_string(value).replace('\'', "''")),
  }
}

fn json_value_to_string(value: &Value) -> String {
  match value {
    Value::String(v) => v.clone(),
    _ => value.to_string(),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn sample_columns() -> Vec<DbQueryColumn> {
    vec![DbQueryColumn {
      name: "id".to_string(),
      data_type: "INT".to_string(),
    }]
  }

  fn sample_row(value: i64) -> DbQueryRow {
    DbQueryRow {
      values: vec![Value::from(value)],
    }
  }

  #[test]
  fn current_page_export_uses_current_page_rows_only() {
    let request = ExportRowsRequest {
      connection_id: "conn-1".to_string(),
      request_id: "req-1".to_string(),
      sql: "SELECT * FROM users".to_string(),
      schema: None,
      format: "json".to_string(),
      scope: ExportRowsScope::CurrentPage,
      batch_index: Some(0),
      current_page_rows: Some(vec![sample_row(2)]),
      loaded_rows: Some(vec![sample_row(1), sample_row(2)]),
      columns: Some(sample_columns()),
      max_rows: None,
    };

    let (_, rows) = resolve_inline_export_rows(&request).expect("current page rows should resolve");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].values[0], Value::from(2));
  }

  #[test]
  fn loaded_rows_export_keeps_full_loaded_set() {
    let request = ExportRowsRequest {
      connection_id: "conn-1".to_string(),
      request_id: "req-1".to_string(),
      sql: "SELECT * FROM users".to_string(),
      schema: None,
      format: "json".to_string(),
      scope: ExportRowsScope::LoadedRows,
      batch_index: Some(0),
      current_page_rows: Some(vec![sample_row(2)]),
      loaded_rows: Some(vec![sample_row(1), sample_row(2)]),
      columns: Some(sample_columns()),
      max_rows: None,
    };

    let (_, rows) = resolve_inline_export_rows(&request).expect("loaded rows should resolve");
    assert_eq!(rows.len(), 2);
  }
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

#[tauri::command]
pub async fn db_data_diff_preview(
  app: AppHandle,
  request: DbDataDiffPreviewRequest,
) -> Result<DbDataDiffPreviewResponse, String> {
  super::data_diff::db_data_diff_preview(&app, request).await
}

#[tauri::command]
pub async fn db_data_diff_detail(
  app: AppHandle,
  request: DbDataDiffDetailRequest,
) -> Result<DbDataDiffDetailResponse, String> {
  super::data_diff::db_data_diff_detail(&app, request).await
}

#[tauri::command]
pub async fn db_data_apply_preview(
  app: AppHandle,
  request: DbDataApplyPreviewRequest,
) -> Result<DbDataApplyPreviewResponse, String> {
  super::data_apply::db_data_apply_preview(&app, request).await
}

#[tauri::command]
pub async fn db_data_apply_execute(
  app: AppHandle,
  request: DbDataApplyExecuteRequest,
) -> Result<DbDataApplyExecuteResponse, String> {
  super::data_apply::db_data_apply_execute(&app, request).await
}

#[tauri::command]
pub async fn db_data_apply_job_detail(
  app: AppHandle,
  request: DbDataApplyJobDetailRequest,
) -> Result<DbDataApplyJobDetailResponse, String> {
  super::data_apply::db_data_apply_job_detail(&app, request).await
}
