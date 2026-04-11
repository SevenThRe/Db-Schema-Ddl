// クエリ実行モジュール
// SQL 実行、危険な SQL 検出、ページネーション、キャンセルを管理する

use std::sync::Arc;
use std::time::Instant;

use sqlparser::ast::Statement;
use sqlparser::dialect::{MySqlDialect, PostgreSqlDialect};
use sqlparser::parser::Parser;
use sqlx::{Column, ConnectOptions as _, Row};
use tauri::{AppHandle, State};
use tokio::select;

use super::{
  AnyPool, CancellationRegistry, DangerClass, DangerousSqlPreview, DangerousSqlPreviewRequest,
  DbConnectionConfig, DbDriver, DbEnvironment, DbPoolRegistry, DbQueryBatchResult, DbQueryColumn,
  DbQueryPagingMode, DbQueryRow, FetchMoreRequest, QueryExecutionRequest, QueryExecutionResponse,
};
use crate::storage;

const LOAD_MORE_UNSUPPORTED_REASON: &str = "Only single result-returning statements support load more.";
const PAGE_WRAPPER_ALIAS: &str = "__db_workbench_page";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StatementExecutionMode {
  PageableQuery,
  UnsupportedResultQuery,
  NonQuery,
}

// ──────────────────────────────────────────────
// 危険な SQL 検出
// ──────────────────────────────────────────────

/// SQL テキストを解析し、危険なステートメント種別を列挙する
/// パースエラー時は空の Vec を返し、実行をブロックしない
pub fn detect_dangerous_sql(sql: &str, driver: &DbDriver) -> Vec<DangerClass> {
  let statements = match driver {
    DbDriver::Mysql => {
      let dialect = MySqlDialect {};
      Parser::parse_sql(&dialect, sql).unwrap_or_default()
    }
    DbDriver::Postgres => {
      let dialect = PostgreSqlDialect {};
      Parser::parse_sql(&dialect, sql).unwrap_or_default()
    }
  };

  let mut dangers = Vec::new();

  for stmt in &statements {
    match stmt {
      Statement::Drop { .. } => {
        dangers.push(DangerClass::Drop);
      }
      Statement::Truncate { .. } => {
        dangers.push(DangerClass::Truncate);
      }
      Statement::AlterTable { .. } => {
        dangers.push(DangerClass::AlterTable);
      }
      // sqlparser 0.53 では AlterDatabase は未サポートのため未実装
      // TODO: sqlparser の将来バージョンで Statement::AlterDatabase が追加された場合に対応
      Statement::Delete(del) => {
        // WHERE 句なしの DELETE は危険
        if del.selection.is_none() {
          dangers.push(DangerClass::DeleteWithoutWhere);
        }
      }
      Statement::Update { selection, .. } => {
        // WHERE 句なしの UPDATE は危険
        if selection.is_none() {
          dangers.push(DangerClass::UpdateWithoutWhere);
        }
      }
      _ => {}
    }
  }

  dangers
}

fn parse_sql_for_driver(
  sql: &str,
  driver: &DbDriver,
) -> Result<Vec<Statement>, sqlparser::parser::ParserError> {
  match driver {
    DbDriver::Mysql => {
      let dialect = MySqlDialect {};
      Parser::parse_sql(&dialect, sql)
    }
    DbDriver::Postgres => {
      let dialect = PostgreSqlDialect {};
      Parser::parse_sql(&dialect, sql)
    }
  }
}

fn statement_is_read_only(statement: &Statement) -> bool {
  match statement {
    Statement::Query(_) => true,
    Statement::ExplainTable { .. } => true,
    Statement::Explain {
      analyze,
      statement,
      ..
    } => !*analyze && statement_is_read_only(statement),
    _ => false,
  }
}

pub(crate) fn sql_is_read_only_statement(sql: &str, driver: &DbDriver) -> bool {
  let trimmed_upper = sql.trim_start().to_uppercase();
  if trimmed_upper.starts_with("SHOW")
    || trimmed_upper.starts_with("DESC ")
    || trimmed_upper.starts_with("DESCRIBE ")
  {
    return true;
  }

  match parse_sql_for_driver(sql, driver) {
    Ok(statements) if statements.len() == 1 => statement_is_read_only(&statements[0]),
    Ok(_) => false,
    Err(_) => {
      trimmed_upper.starts_with("SELECT")
        || trimmed_upper.starts_with("WITH")
        || trimmed_upper.starts_with("TABLE")
    }
  }
}

// ──────────────────────────────────────────────
// コネクションプール管理
// ──────────────────────────────────────────────

/// 既存のプールを返すか、新規作成してレジストリに登録する
/// CRITICAL: std::sync::Mutex のロックを .await をまたいで保持しない
pub async fn get_or_create_pool(
  registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
) -> Result<Arc<AnyPool>, String> {
  // まず既存プールを確認（ロックを即座に解放）
  {
    let pools = registry.pools.lock().map_err(|e| e.to_string())?;
    if let Some(pool) = pools.get(&config.id) {
      return Ok(Arc::clone(pool));
    }
  }

  // プールが存在しない場合は新規作成（.await 中はロック不保持）
  let new_pool = create_pool(config).await?;
  let new_pool_arc = Arc::new(new_pool);

  {
    let mut pools = registry.pools.lock().map_err(|e| e.to_string())?;
    // 二重挿入を避けるため再チェック（別スレッドが先に作成した可能性）
    if let Some(existing) = pools.get(&config.id) {
      return Ok(Arc::clone(existing));
    }
    pools.insert(config.id.clone(), Arc::clone(&new_pool_arc));
  }

  Ok(new_pool_arc)
}

pub fn invalidate_connection_pool(
  registry: &DbPoolRegistry,
  connection_id: &str,
) -> Result<(), String> {
  let mut pools = registry.pools.lock().map_err(|error| error.to_string())?;
  pools.remove(connection_id);
  Ok(())
}

async fn create_pool(config: &DbConnectionConfig) -> Result<AnyPool, String> {
  use sqlx::mysql::MySqlPoolOptions;
  use sqlx::postgres::PgPoolOptions;
  use std::time::Duration;

  const ACQUIRE_TIMEOUT_SECS: u64 = 15;

  match config.driver {
    DbDriver::Mysql => {
      use sqlx::mysql::MySqlConnectOptions;
      let opts = MySqlConnectOptions::new()
        .host(&config.host)
        .port(config.port)
        .database(&config.database)
        .username(&config.username)
        .password(&config.password)
        .disable_statement_logging();
      let pool = MySqlPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(ACQUIRE_TIMEOUT_SECS))
        .connect_with(opts)
        .await
        .map_err(|e| format!("MySQL プール作成失敗: {e}"))?;
      Ok(AnyPool::Mysql(pool))
    }
    DbDriver::Postgres => {
      use sqlx::postgres::PgConnectOptions;
      let opts = PgConnectOptions::new()
        .host(&config.host)
        .port(config.port)
        .database(&config.database)
        .username(&config.username)
        .password(&config.password)
        .disable_statement_logging();
      let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(ACQUIRE_TIMEOUT_SECS))
        .connect_with(opts)
        .await
        .map_err(|e| format!("PostgreSQL プール作成失敗: {e}"))?;
      Ok(AnyPool::Postgres(pool))
    }
  }
}

// ──────────────────────────────────────────────
// SQL ステートメント分割
// ──────────────────────────────────────────────

/// SQL テキストをセミコロンで分割する（シングルクォート・ダブルクォート内のセミコロンを無視）
/// これはカノニカルなステートメント分割器 — フロントエンドは独自に分割しない
pub fn split_sql_statements(sql: &str) -> Vec<String> {
  let mut statements = Vec::new();
  let mut current = String::new();
  let mut chars = sql.chars().peekable();
  let mut in_single_quote = false;
  let mut in_double_quote = false;
  let mut in_line_comment = false;
  let mut in_block_comment = false;

  while let Some(ch) = chars.next() {
    // 行コメント処理
    if in_line_comment {
      if ch == '\n' {
        in_line_comment = false;
      }
      current.push(ch);
      continue;
    }

    // ブロックコメント処理
    if in_block_comment {
      if ch == '*' {
        if chars.peek() == Some(&'/') {
          chars.next();
          current.push_str("*/");
          in_block_comment = false;
          continue;
        }
      }
      current.push(ch);
      continue;
    }

    // シングルクォート内のエスケープ処理
    if in_single_quote {
      if ch == '\'' {
        if chars.peek() == Some(&'\'') {
          // エスケープされたシングルクォート（''）
          chars.next();
          current.push_str("''");
          continue;
        }
        in_single_quote = false;
      }
      current.push(ch);
      continue;
    }

    // ダブルクォート内
    if in_double_quote {
      if ch == '"' {
        in_double_quote = false;
      }
      current.push(ch);
      continue;
    }

    // 通常テキスト内の特殊文字判定
    match ch {
      '\'' => {
        in_single_quote = true;
        current.push(ch);
      }
      '"' => {
        in_double_quote = true;
        current.push(ch);
      }
      '-' if chars.peek() == Some(&'-') => {
        // 行コメント開始
        chars.next();
        current.push_str("--");
        in_line_comment = true;
      }
      '/' if chars.peek() == Some(&'*') => {
        // ブロックコメント開始
        chars.next();
        current.push_str("/*");
        in_block_comment = true;
      }
      ';' => {
        // ステートメント区切り
        let trimmed = current.trim().to_string();
        if !trimmed.is_empty() {
          statements.push(trimmed);
        }
        current.clear();
      }
      _ => {
        current.push(ch);
      }
    }
  }

  // 末尾のセミコロンなしステートメント
  let trimmed = current.trim().to_string();
  if !trimmed.is_empty() {
    statements.push(trimmed);
  }

  statements
}

// ──────────────────────────────────────────────
// Tauri コマンド
// ──────────────────────────────────────────────

/// SQL クエリを実行し、マルチステートメント対応の結果を返す
/// - readonly 接続では DML/DDL をブロック
/// - 危険な SQL は confirmed=true なしではブロック（サーバー側安全強制）
/// - CancellationToken によるキャンセル対応
#[tauri::command]
pub async fn db_query_execute(
  app: AppHandle,
  pool_registry: State<'_, Arc<DbPoolRegistry>>,
  cancel_registry: State<'_, Arc<CancellationRegistry>>,
  request: QueryExecutionRequest,
) -> Result<QueryExecutionResponse, String> {
  // 接続設定を取得
  let config = load_connection_config(&app, &request.connection_id)?;

  // readonly 接続チェック
  if config.readonly {
    let statements = split_sql_statements(&request.sql);
    for stmt_sql in &statements {
      if !sql_is_read_only_statement(stmt_sql, &config.driver) {
        return Err("読み取り専用接続では DML/DDL は実行できません".to_string());
      }
    }
  }

  // サーバー側安全強制: 危険な SQL が confirmed=false の場合はブロック
  let all_dangers = detect_dangerous_sql(&request.sql, &config.driver);
  if !all_dangers.is_empty() && !request.confirmed {
    return Err(
      "危険な SQL が検出されました。confirmed=true を設定して再実行してください。".to_string(),
    );
  }

  // プール取得
  let pool = get_or_create_pool(&pool_registry, &config).await?;
  let active_schema = resolve_active_schema(&config, request.schema.as_deref());

  // キャンセルトークンを登録
  use tokio_util::sync::CancellationToken;
  let token = CancellationToken::new();
  {
    let mut tokens = cancel_registry
      .tokens
      .lock()
      .map_err(|e| e.to_string())?;
    tokens.insert(request.request_id.clone(), token.clone());
  }

  // ステートメント分割・順次実行
  let statements = split_sql_statements(&request.sql);
  let mut batches: Vec<DbQueryBatchResult> = Vec::new();
  let limit = request.limit as usize;
  let offset = request.offset.unwrap_or(0);
  let paging_allowed = statements.len() == 1;

  'stmt_loop: for stmt_sql in statements {
    let start = Instant::now();

    // キャンセル確認
    if token.is_cancelled() {
      break 'stmt_loop;
    }

    // ステートメント実行
    let result = select! {
      res = execute_statement(
        &pool,
        &stmt_sql,
        limit,
        offset,
        paging_allowed,
        active_schema.as_deref(),
      ) => res,
      _ = token.cancelled() => {
        // キャンセル発生 — 現在のステートメントを中断
        batches.push(canceled_batch(
          &stmt_sql,
          active_schema.as_deref(),
          start.elapsed().as_millis() as u64,
        ));
        break 'stmt_loop;
      }
    };

    let elapsed_ms = start.elapsed().as_millis() as u64;

    match result {
      Ok(batch) => {
        batches.push(DbQueryBatchResult { elapsed_ms, ..batch });
      }
      Err(e) => {
        batches.push(error_batch(&stmt_sql, active_schema.as_deref(), elapsed_ms, e));
        if !request.continue_on_error {
          break 'stmt_loop;
        }
      }
    }
  }

  // キャンセルトークンを削除
  {
    let mut tokens = cancel_registry
      .tokens
      .lock()
      .map_err(|e| e.to_string())?;
    tokens.remove(&request.request_id);
  }

  Ok(QueryExecutionResponse {
    batches,
    request_id: request.request_id,
  })
}

/// 実行中のクエリをキャンセルする
#[tauri::command]
pub async fn db_query_cancel(
  cancel_registry: State<'_, Arc<CancellationRegistry>>,
  request_id: String,
) -> Result<(), String> {
  let mut tokens = cancel_registry
    .tokens
    .lock()
    .map_err(|e| e.to_string())?;

  if let Some(token) = take_registered_token(&mut tokens, &request_id) {
    token.cancel();
  }

  // 既に完了済みの requestId は無視
  Ok(())
}

/// "Load more" ページネーション — 初回実行と同じ安全なラップ方式で次ページを取得する
/// フロントエンドが現在の rows.length を offset として送信する
#[tauri::command]
pub async fn db_query_fetch_more(
  app: AppHandle,
  pool_registry: State<'_, Arc<DbPoolRegistry>>,
  request: FetchMoreRequest,
) -> Result<DbQueryBatchResult, String> {
  let config = load_connection_config(&app, &request.connection_id)?;
  let pool = get_or_create_pool(&pool_registry, &config).await?;
  let active_schema = resolve_active_schema(&config, request.schema.as_deref());

  let start = Instant::now();
  let mut batch = execute_statement(
    &pool,
    &request.sql,
    request.limit as usize,
    request.offset,
    true,
    active_schema.as_deref(),
  )
  .await?;
  batch.elapsed_ms = start.elapsed().as_millis() as u64;
  batch.sql = request.sql;

  Ok(batch)
}

/// 危険な SQL のプレビュー情報を返す（確認ダイアログ用）
#[tauri::command]
pub async fn db_preview_dangerous_sql(
  app: AppHandle,
  request: DangerousSqlPreviewRequest,
) -> Result<DangerousSqlPreview, String> {
  let config = load_connection_config(&app, &request.connection_id)?;
  let dangers = detect_dangerous_sql(&request.sql, &config.driver);

  // environment が未設定の場合は dev として扱う
  let environment = config.environment.clone().unwrap_or(DbEnvironment::Dev);

  Ok(DangerousSqlPreview {
    dangers,
    sql: request.sql,
    connection_name: config.name.clone(),
    environment,
    database: config.database.clone(),
  })
}

// ──────────────────────────────────────────────
// 内部ヘルパー
// ──────────────────────────────────────────────

/// ストレージから接続設定を読み込む
pub(crate) fn load_connection_config(
  app: &AppHandle,
  connection_id: &str,
) -> Result<DbConnectionConfig, String> {
  storage::load_db_connection_for_runtime(app, connection_id)
}

/// エクスポートジョブのキャンセルキー（db_query_cancel と共通化）
pub fn export_request_key(request_id: &str) -> String {
  format!("export:{request_id}")
}

fn take_registered_token(
  tokens: &mut std::collections::HashMap<String, tokio_util::sync::CancellationToken>,
  request_id: &str,
) -> Option<tokio_util::sync::CancellationToken> {
  let export_request_id = export_request_key(request_id);
  tokens
    .remove(request_id)
    .or_else(|| tokens.remove(&export_request_id))
}

/// PostgreSQL の実行スキーマを request/schema/default_schema から解決する
pub(crate) fn resolve_active_schema(
  config: &DbConnectionConfig,
  request_schema: Option<&str>,
) -> Option<String> {
  if config.driver != DbDriver::Postgres {
    return None;
  }

  request_schema
    .and_then(non_empty_schema)
    .map(ToString::to_string)
    .or_else(|| config.default_schema.as_deref().and_then(non_empty_schema).map(ToString::to_string))
    .or_else(|| Some("public".to_string()))
}

fn non_empty_schema(value: &str) -> Option<&str> {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    None
  } else {
    Some(trimmed)
  }
}

/// 単一ステートメントを実行してバッチ結果を返す
pub(crate) async fn execute_statement(
  pool: &AnyPool,
  sql: &str,
  limit: usize,
  offset: u32,
  paging_allowed: bool,
  active_schema: Option<&str>,
) -> Result<DbQueryBatchResult, String> {
  match pool {
    AnyPool::Mysql(p) => execute_mysql_statement(p, sql, limit, offset, paging_allowed).await,
    AnyPool::Postgres(p) => {
      execute_postgres_statement(p, sql, limit, offset, paging_allowed, active_schema).await
    }
  }
}

pub(crate) fn supports_full_result_export(sql: &str, driver: &DbDriver) -> bool {
  classify_statement_mode(sql, driver) == StatementExecutionMode::PageableQuery
}

fn classify_statement_mode(sql: &str, driver: &DbDriver) -> StatementExecutionMode {
  let trimmed_upper = sql.trim_start().to_uppercase();

  if trimmed_upper.starts_with("SHOW") || trimmed_upper.starts_with("EXPLAIN") {
    return StatementExecutionMode::UnsupportedResultQuery;
  }

  if trimmed_upper.starts_with("SELECT")
    || trimmed_upper.starts_with("WITH")
    || trimmed_upper.starts_with("TABLE")
  {
    return StatementExecutionMode::PageableQuery;
  }

  let parsed = parse_sql_for_driver(sql, driver);

  match parsed {
    Ok(statements) if statements.len() == 1 => {
      if matches!(statements.first(), Some(Statement::Query(_))) {
        StatementExecutionMode::PageableQuery
      } else {
        StatementExecutionMode::NonQuery
      }
    }
    Ok(_) => StatementExecutionMode::UnsupportedResultQuery,
    Err(_) => StatementExecutionMode::UnsupportedResultQuery,
  }
}

fn normalize_statement_sql(sql: &str) -> String {
  sql.trim().trim_end_matches(';').trim().to_string()
}

fn build_wrapped_page_sql(base_sql: &str, limit_plus_one: usize, offset: u32) -> String {
  format!(
    "SELECT * FROM ({base_sql}) AS {PAGE_WRAPPER_ALIAS} LIMIT {limit_plus_one} OFFSET {offset}"
  )
}

fn result_batch_from_rows(
  sql: &str,
  columns: Vec<DbQueryColumn>,
  rows: Vec<DbQueryRow>,
  limit: usize,
  offset: u32,
  paging_mode: DbQueryPagingMode,
  schema: Option<&str>,
  total_rows: Option<u64>,
) -> DbQueryBatchResult {
  let returned_rows = rows.len().min(limit) as u64;
  let has_more = rows.len() > limit;
  let paging_reason = if paging_mode == DbQueryPagingMode::Unsupported {
    Some(LOAD_MORE_UNSUPPORTED_REASON.to_string())
  } else {
    None
  };

  let next_offset = if paging_mode == DbQueryPagingMode::Offset && has_more {
    Some(offset.saturating_add(returned_rows as u32))
  } else {
    None
  };

  DbQueryBatchResult {
    sql: sql.to_string(),
    columns,
    rows: rows.into_iter().take(limit).collect(),
    total_rows,
    returned_rows,
    has_more,
    paging_mode,
    paging_reason,
    next_offset,
    schema: schema.map(ToString::to_string),
    elapsed_ms: 0,
    affected_rows: None,
    error: None,
  }
}

fn default_batch(
  sql: &str,
  paging_mode: DbQueryPagingMode,
  paging_reason: Option<String>,
  schema: Option<&str>,
) -> DbQueryBatchResult {
  DbQueryBatchResult {
    sql: sql.to_string(),
    columns: vec![],
    rows: vec![],
    total_rows: None,
    returned_rows: 0,
    has_more: false,
    paging_mode,
    paging_reason,
    next_offset: None,
    schema: schema.map(ToString::to_string),
    elapsed_ms: 0,
    affected_rows: None,
    error: None,
  }
}

fn error_batch(sql: &str, schema: Option<&str>, elapsed_ms: u64, message: String) -> DbQueryBatchResult {
  let mut batch = default_batch(
    sql,
    DbQueryPagingMode::Unsupported,
    Some(LOAD_MORE_UNSUPPORTED_REASON.to_string()),
    schema,
  );
  batch.elapsed_ms = elapsed_ms;
  batch.error = Some(message);
  batch
}

fn canceled_batch(sql: &str, schema: Option<&str>, elapsed_ms: u64) -> DbQueryBatchResult {
  error_batch(sql, schema, elapsed_ms, "キャンセルされました".to_string())
}

#[cfg(test)]
fn unsupported_paging_batch(sql: &str, schema: Option<&str>) -> DbQueryBatchResult {
  default_batch(
    sql,
    DbQueryPagingMode::Unsupported,
    Some(LOAD_MORE_UNSUPPORTED_REASON.to_string()),
    schema,
  )
}

async fn execute_mysql_statement(
  pool: &sqlx::MySqlPool,
  sql: &str,
  limit: usize,
  offset: u32,
  paging_allowed: bool,
) -> Result<DbQueryBatchResult, String> {
  match classify_statement_mode(sql, &DbDriver::Mysql) {
    StatementExecutionMode::PageableQuery => {
      let base_sql = normalize_statement_sql(sql);
      if base_sql.is_empty() {
        return Err("空の SQL は実行できません".to_string());
      }

      let limit_plus_one = limit.saturating_add(1);
      let paged_sql = build_wrapped_page_sql(&base_sql, limit_plus_one, offset);
      let rows = sqlx::query(&paged_sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("MySQL クエリエラー: {e}"))?;
      let (columns, query_rows) = mysql_rows_to_query_data(&rows);
      let paging_mode = if paging_allowed {
        DbQueryPagingMode::Offset
      } else {
        DbQueryPagingMode::Unsupported
      };

      Ok(result_batch_from_rows(
        sql,
        columns,
        query_rows,
        limit,
        offset,
        paging_mode,
        None,
        None,
      ))
    }
    StatementExecutionMode::UnsupportedResultQuery => {
      let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("MySQL クエリエラー: {e}"))?;
      let total_rows = rows.len() as u64;
      let (columns, query_rows) = mysql_rows_to_query_data(&rows);

      Ok(result_batch_from_rows(
        sql,
        columns,
        query_rows,
        limit,
        offset,
        DbQueryPagingMode::Unsupported,
        None,
        Some(total_rows),
      ))
    }
    StatementExecutionMode::NonQuery => {
      let result = sqlx::query(sql)
        .execute(pool)
        .await
        .map_err(|e| format!("MySQL 実行エラー: {e}"))?;
      let mut batch = default_batch(sql, DbQueryPagingMode::None, None, None);
      batch.total_rows = Some(0);
      batch.affected_rows = Some(result.rows_affected());
      Ok(batch)
    }
  }
}

async fn execute_postgres_statement(
  pool: &sqlx::PgPool,
  sql: &str,
  limit: usize,
  offset: u32,
  paging_allowed: bool,
  active_schema: Option<&str>,
) -> Result<DbQueryBatchResult, String> {
  let mut conn = pool
    .acquire()
    .await
    .map_err(|e| format!("PostgreSQL 接続取得失敗: {e}"))?;

  if let Some(schema) = active_schema {
    apply_search_path(&mut conn, schema).await?;
  }

  match classify_statement_mode(sql, &DbDriver::Postgres) {
    StatementExecutionMode::PageableQuery => {
      let base_sql = normalize_statement_sql(sql);
      if base_sql.is_empty() {
        return Err("空の SQL は実行できません".to_string());
      }

      let limit_plus_one = limit.saturating_add(1);
      let paged_sql = build_wrapped_page_sql(&base_sql, limit_plus_one, offset);
      let rows = sqlx::query(&paged_sql)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| format!("PostgreSQL クエリエラー: {e}"))?;
      let (columns, query_rows) = pg_rows_to_query_data(&rows);
      let paging_mode = if paging_allowed {
        DbQueryPagingMode::Offset
      } else {
        DbQueryPagingMode::Unsupported
      };

      Ok(result_batch_from_rows(
        sql,
        columns,
        query_rows,
        limit,
        offset,
        paging_mode,
        active_schema,
        None,
      ))
    }
    StatementExecutionMode::UnsupportedResultQuery => {
      let rows = sqlx::query(sql)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| format!("PostgreSQL クエリエラー: {e}"))?;
      let total_rows = rows.len() as u64;
      let (columns, query_rows) = pg_rows_to_query_data(&rows);

      Ok(result_batch_from_rows(
        sql,
        columns,
        query_rows,
        limit,
        offset,
        DbQueryPagingMode::Unsupported,
        active_schema,
        Some(total_rows),
      ))
    }
    StatementExecutionMode::NonQuery => {
      let result = sqlx::query(sql)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("PostgreSQL 実行エラー: {e}"))?;
      let mut batch = default_batch(sql, DbQueryPagingMode::None, None, active_schema);
      batch.total_rows = Some(0);
      batch.affected_rows = Some(result.rows_affected());
      Ok(batch)
    }
  }
}

fn quote_identifier(identifier: &str) -> String {
  format!("\"{}\"", identifier.replace('"', "\"\""))
}

fn build_search_path_sql(schema: &str) -> String {
  format!("SET search_path TO {}, public", quote_identifier(schema))
}

async fn apply_search_path(
  conn: &mut sqlx::pool::PoolConnection<sqlx::Postgres>,
  schema: &str,
) -> Result<(), String> {
  let search_path_sql = build_search_path_sql(schema);
  sqlx::query(&search_path_sql)
    .execute(&mut **conn)
    .await
    .map_err(|e| format!("search_path 設定失敗: {e}"))?;
  Ok(())
}

fn mysql_rows_to_query_data(
  rows: &[sqlx::mysql::MySqlRow],
) -> (Vec<DbQueryColumn>, Vec<DbQueryRow>) {
  use sqlx::TypeInfo;

  let columns: Vec<DbQueryColumn> = rows
    .first()
    .map(|first| {
      first
        .columns()
        .iter()
        .map(|c| DbQueryColumn {
          name: c.name().to_string(),
          data_type: c.type_info().name().to_string(),
        })
        .collect()
    })
    .unwrap_or_default();

  let query_rows = rows
    .iter()
    .map(|row| {
      let values = row
        .columns()
        .iter()
        .enumerate()
        .map(|(i, _)| mysql_value_to_json(row, i))
        .collect();
      DbQueryRow { values }
    })
    .collect();

  (columns, query_rows)
}

fn pg_rows_to_query_data(rows: &[sqlx::postgres::PgRow]) -> (Vec<DbQueryColumn>, Vec<DbQueryRow>) {
  use sqlx::TypeInfo;

  let columns: Vec<DbQueryColumn> = rows
    .first()
    .map(|first| {
      first
        .columns()
        .iter()
        .map(|c| DbQueryColumn {
          name: c.name().to_string(),
          data_type: c.type_info().name().to_string(),
        })
        .collect()
    })
    .unwrap_or_default();

  let query_rows = rows
    .iter()
    .map(|row| {
      let values = row
        .columns()
        .iter()
        .enumerate()
        .map(|(i, _)| pg_value_to_json(row, i))
        .collect();
      DbQueryRow { values }
    })
    .collect();

  (columns, query_rows)
}

/// MySQL の行値を serde_json::Value に変換する
fn mysql_value_to_json(row: &sqlx::mysql::MySqlRow, index: usize) -> serde_json::Value {
  // 一般的な型順に try_get を試みる
  if let Ok(v) = row.try_get::<Option<i64>, _>(index) {
    return v.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<i32>, _>(index) {
    return v.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<f64>, _>(index) {
    return v
      .and_then(|f| serde_json::Number::from_f64(f).map(serde_json::Value::Number))
      .unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<bool>, _>(index) {
    return v.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::NaiveDateTime>, _>(index) {
    return v
      .map(|value| serde_json::Value::String(value.format("%Y-%m-%d %H:%M:%S").to_string()))
      .unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::NaiveDate>, _>(index) {
    return v
      .map(|value| serde_json::Value::String(value.format("%Y-%m-%d").to_string()))
      .unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::NaiveTime>, _>(index) {
    return v
      .map(|value| serde_json::Value::String(value.format("%H:%M:%S").to_string()))
      .unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<String>, _>(index) {
    return v.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null);
  }
  serde_json::Value::Null
}

/// PostgreSQL の行値を serde_json::Value に変換する
fn pg_value_to_json(row: &sqlx::postgres::PgRow, index: usize) -> serde_json::Value {
  if let Ok(v) = row.try_get::<Option<i64>, _>(index) {
    return v.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<i32>, _>(index) {
    return v.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<f64>, _>(index) {
    return v
      .and_then(|f| serde_json::Number::from_f64(f).map(serde_json::Value::Number))
      .unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<bool>, _>(index) {
    return v.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>(index) {
    return v
      .map(|value| serde_json::Value::String(value.to_rfc3339()))
      .unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::NaiveDateTime>, _>(index) {
    return v
      .map(|value| serde_json::Value::String(value.format("%Y-%m-%d %H:%M:%S").to_string()))
      .unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::NaiveDate>, _>(index) {
    return v
      .map(|value| serde_json::Value::String(value.format("%Y-%m-%d").to_string()))
      .unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::NaiveTime>, _>(index) {
    return v
      .map(|value| serde_json::Value::String(value.format("%H:%M:%S").to_string()))
      .unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<String>, _>(index) {
    return v.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null);
  }
  serde_json::Value::Null
}

// ──────────────────────────────────────────────
// ユニットテスト
// ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
  use super::*;
  use tokio_util::sync::CancellationToken;

  #[test]
  fn test_detect_drop() {
    let dangers = detect_dangerous_sql("DROP TABLE users", &DbDriver::Mysql);
    assert!(dangers.contains(&DangerClass::Drop), "DROP TABLE が検出されるべき");
  }

  #[test]
  fn test_detect_truncate() {
    let dangers = detect_dangerous_sql("TRUNCATE TABLE users", &DbDriver::Mysql);
    assert!(
      dangers.contains(&DangerClass::Truncate),
      "TRUNCATE TABLE が検出されるべき"
    );
  }

  #[test]
  fn test_detect_delete_without_where() {
    let dangers = detect_dangerous_sql("DELETE FROM users", &DbDriver::Mysql);
    assert!(
      dangers.contains(&DangerClass::DeleteWithoutWhere),
      "WHERE なし DELETE が検出されるべき"
    );
  }

  #[test]
  fn test_detect_update_without_where() {
    let dangers = detect_dangerous_sql("UPDATE users SET active = false", &DbDriver::Mysql);
    assert!(
      dangers.contains(&DangerClass::UpdateWithoutWhere),
      "WHERE なし UPDATE が検出されるべき"
    );
  }

  #[test]
  fn test_detect_alter_table() {
    let dangers = detect_dangerous_sql(
      "ALTER TABLE users ADD COLUMN age INT",
      &DbDriver::Mysql,
    );
    assert!(
      dangers.contains(&DangerClass::AlterTable),
      "ALTER TABLE が検出されるべき"
    );
  }

  #[test]
  fn test_safe_select() {
    let dangers = detect_dangerous_sql("SELECT * FROM users WHERE id = 1", &DbDriver::Mysql);
    assert!(dangers.is_empty(), "安全な SELECT は危険なし");
  }

  #[test]
  fn test_safe_delete_with_where() {
    let dangers = detect_dangerous_sql("DELETE FROM users WHERE id = 1", &DbDriver::Mysql);
    assert!(dangers.is_empty(), "WHERE 付き DELETE は安全");
  }

  #[test]
  fn test_readonly_guard_blocks_mutating_statements_even_when_not_marked_dangerous() {
    assert!(
      !sql_is_read_only_statement(
        "INSERT INTO users(id, name) VALUES (1, 'neo')",
        &DbDriver::Mysql,
      ),
      "INSERT should be blocked on read-only connections"
    );
    assert!(
      !sql_is_read_only_statement(
        "UPDATE users SET active = false WHERE id = 1",
        &DbDriver::Mysql,
      ),
      "UPDATE with WHERE should still be blocked on read-only connections"
    );
    assert!(
      !sql_is_read_only_statement("CREATE TABLE users(id INT)", &DbDriver::Mysql),
      "DDL should be blocked on read-only connections"
    );
  }

  #[test]
  fn test_readonly_guard_allows_read_queries_and_metadata_inspection() {
    assert!(sql_is_read_only_statement("SELECT * FROM users", &DbDriver::Mysql));
    assert!(sql_is_read_only_statement("SHOW TABLES", &DbDriver::Mysql));
    assert!(sql_is_read_only_statement("DESC users", &DbDriver::Mysql));
  }

  #[test]
  fn test_cancel_token_register_unregister() {
    let registry = CancellationRegistry {
      tokens: std::sync::Mutex::new(std::collections::HashMap::new()),
    };

    let token = CancellationToken::new();
    {
      let mut tokens = registry.tokens.lock().unwrap();
      tokens.insert("req-001".to_string(), token.clone());
      assert!(tokens.contains_key("req-001"));
    }

    // キャンセル実行
    token.cancel();

    {
      let mut tokens = registry.tokens.lock().unwrap();
      tokens.remove("req-001");
      assert!(!tokens.contains_key("req-001"));
    }
  }

  #[test]
  fn test_split_statements_respects_quotes() {
    // シングルクォート内のセミコロンは分割しない
    let stmts = split_sql_statements("SELECT 'a;b'; SELECT 1");
    assert_eq!(stmts.len(), 2, "クォート内セミコロンを無視して2ステートメントになるべき");
    assert!(stmts[0].contains("'a;b'"), "クォート内の文字列が保持されるべき");
  }

  #[test]
  fn test_split_statements_respects_comments() {
    // 行コメント内のセミコロンは分割しない
    let stmts = split_sql_statements("-- comment with ;\nSELECT 1");
    assert_eq!(stmts.len(), 1, "コメント内セミコロンを無視して1ステートメントになるべき");
  }

  #[test]
  fn test_split_statements_empty() {
    let stmts = split_sql_statements("   ;  ;  ");
    assert!(stmts.is_empty(), "空のセミコロンのみはゼロステートメント");
  }

  #[test]
  fn test_split_statements_no_trailing_semicolon() {
    let stmts = split_sql_statements("SELECT 1");
    assert_eq!(stmts.len(), 1, "末尾セミコロンなしでも1ステートメント");
  }

  #[test]
  fn test_build_wrapped_page_sql_uses_wrapper_and_limit_plus_one() {
    let limit = 200usize;
    let limit_plus_one = limit.saturating_add(1);
    let paged_sql = build_wrapped_page_sql("SELECT id FROM users", limit_plus_one, 400);

    assert!(
      paged_sql.contains("SELECT * FROM (SELECT id FROM users) AS __db_workbench_page"),
      "wrapper 形式で SQL を構築するべき"
    );
    assert!(
      paged_sql.contains("LIMIT 201 OFFSET 400"),
      "limit + 1 の境界付きフェッチを使うべき"
    );
  }

  #[test]
  fn test_unsupported_paging_batch_marks_paging_mode() {
    let batch = unsupported_paging_batch("SHOW TABLES", None);

    assert_eq!(batch.paging_mode, DbQueryPagingMode::Unsupported);
    assert_eq!(
      batch.paging_reason.as_deref(),
      Some(LOAD_MORE_UNSUPPORTED_REASON)
    );
  }

  #[test]
  fn test_classify_statement_mode_marks_show_and_explain_as_supported_non_pageable_results() {
    assert_eq!(
      classify_statement_mode("SHOW TABLES", &DbDriver::Mysql),
      StatementExecutionMode::UnsupportedResultQuery
    );
    assert_eq!(
      classify_statement_mode("EXPLAIN SELECT * FROM users", &DbDriver::Postgres),
      StatementExecutionMode::UnsupportedResultQuery
    );
  }

  #[test]
  fn test_supports_full_result_export_only_for_pageable_queries() {
    assert!(supports_full_result_export("SELECT * FROM users", &DbDriver::Mysql));
    assert!(!supports_full_result_export("SHOW TABLES", &DbDriver::Mysql));
    assert!(!supports_full_result_export("DELETE FROM users", &DbDriver::Mysql));
  }

  #[test]
  fn test_result_batch_from_rows_keeps_rows_visible_when_paging_is_unsupported() {
    let rows = vec![
      DbQueryRow {
        values: vec![serde_json::json!(1)],
      },
      DbQueryRow {
        values: vec![serde_json::json!(2)],
      },
      DbQueryRow {
        values: vec![serde_json::json!(3)],
      },
    ];

    let batch = result_batch_from_rows(
      "SHOW TABLES",
      vec![DbQueryColumn {
        name: "Tables_in_app".to_string(),
        data_type: "TEXT".to_string(),
      }],
      rows,
      2,
      0,
      DbQueryPagingMode::Unsupported,
      None,
      Some(3),
    );

    assert_eq!(batch.rows.len(), 2, "unsupported paging still returns visible rows");
    assert!(batch.has_more, "runtime should signal truncation even when load-more is disabled");
    assert_eq!(batch.total_rows, Some(3));
    assert_eq!(batch.next_offset, None, "load-more cursor must stay disabled");
    assert_eq!(
      batch.paging_reason.as_deref(),
      Some(LOAD_MORE_UNSUPPORTED_REASON)
    );
  }

  #[test]
  fn test_take_registered_token_removes_query_request_token() {
    let mut tokens = std::collections::HashMap::new();
    tokens.insert("req-123".to_string(), CancellationToken::new());

    let removed = take_registered_token(&mut tokens, "req-123");

    assert!(removed.is_some(), "query request token should be removed");
    assert!(
      !tokens.contains_key("req-123"),
      "query request token key should be cleaned up"
    );
  }

  #[test]
  fn test_take_registered_token_removes_export_request_token() {
    let mut tokens = std::collections::HashMap::new();
    tokens.insert(export_request_key("exp-456"), CancellationToken::new());

    let removed = take_registered_token(&mut tokens, "exp-456");

    assert!(removed.is_some(), "export request token should be removed");
    assert!(
      !tokens.contains_key(&export_request_key("exp-456")),
      "export request token key should be cleaned up"
    );
  }

  #[test]
  fn test_build_search_path_sql_escapes_embedded_quotes() {
    let sql = build_search_path_sql("tenant\"core");
    assert_eq!(sql, "SET search_path TO \"tenant\"\"core\", public");
  }
}
