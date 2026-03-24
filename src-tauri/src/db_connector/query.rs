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
  DbQueryRow, FetchMoreRequest, QueryExecutionRequest, QueryExecutionResponse,
};
use crate::storage;

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
      let dangers = detect_dangerous_sql(stmt_sql, &config.driver);
      if !dangers.is_empty() {
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

  'stmt_loop: for stmt_sql in statements {
    let start = Instant::now();

    // キャンセル確認
    if token.is_cancelled() {
      break 'stmt_loop;
    }

    // ステートメント実行
    let result = select! {
      res = execute_statement(&pool, &stmt_sql, limit) => res,
      _ = token.cancelled() => {
        // キャンセル発生 — 現在のステートメントを中断
        batches.push(DbQueryBatchResult {
          sql: stmt_sql.clone(),
          columns: vec![],
          rows: vec![],
          total_rows: 0,
          elapsed_ms: start.elapsed().as_millis() as u64,
          affected_rows: None,
          error: Some("キャンセルされました".to_string()),
        });
        break 'stmt_loop;
      }
    };

    let elapsed_ms = start.elapsed().as_millis() as u64;

    match result {
      Ok(batch) => {
        batches.push(DbQueryBatchResult { elapsed_ms, ..batch });
      }
      Err(e) => {
        batches.push(DbQueryBatchResult {
          sql: stmt_sql,
          columns: vec![],
          rows: vec![],
          total_rows: 0,
          elapsed_ms,
          affected_rows: None,
          error: Some(e),
        });
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

  if let Some(token) = tokens.remove(&request_id) {
    token.cancel();
    Ok(())
  } else {
    // 既に完了済みの requestId は無視
    Ok(())
  }
}

/// "Load more" ページネーション — LIMIT/OFFSET を付与して次ページを取得する
/// フロントエンドが現在の rows.length を offset として送信する
#[tauri::command]
pub async fn db_query_fetch_more(
  app: AppHandle,
  pool_registry: State<'_, Arc<DbPoolRegistry>>,
  request: FetchMoreRequest,
) -> Result<DbQueryBatchResult, String> {
  let config = load_connection_config(&app, &request.connection_id)?;
  let pool = get_or_create_pool(&pool_registry, &config).await?;

  // SELECT ステートメントに LIMIT/OFFSET を追加（末尾セミコロン除去）
  let base_sql = request.sql.trim().trim_end_matches(';');
  let paginated_sql = format!(
    "{} LIMIT {} OFFSET {}",
    base_sql, request.limit, request.offset
  );

  let start = Instant::now();
  let mut batch = execute_statement(&pool, &paginated_sql, request.limit as usize).await?;
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
fn load_connection_config(app: &AppHandle, connection_id: &str) -> Result<DbConnectionConfig, String> {
  let configs = storage::list_db_connections(app)?;
  configs
    .into_iter()
    .find(|c| c.id == connection_id)
    .ok_or_else(|| format!("接続設定が見つかりません: {connection_id}"))
}

/// 単一ステートメントを実行してバッチ結果を返す
async fn execute_statement(
  pool: &AnyPool,
  sql: &str,
  limit: usize,
) -> Result<DbQueryBatchResult, String> {
  match pool {
    AnyPool::Mysql(p) => execute_mysql_statement(p, sql, limit).await,
    AnyPool::Postgres(p) => execute_postgres_statement(p, sql, limit).await,
  }
}

async fn execute_mysql_statement(
  pool: &sqlx::MySqlPool,
  sql: &str,
  limit: usize,
) -> Result<DbQueryBatchResult, String> {
  use sqlx::TypeInfo;

  // SELECT / SHOW / EXPLAIN かどうかで処理を分岐
  let trimmed = sql.trim_start().to_uppercase();
  let is_query = trimmed.starts_with("SELECT")
    || trimmed.starts_with("SHOW")
    || trimmed.starts_with("EXPLAIN")
    || trimmed.starts_with("WITH");

  if is_query {
    let rows = sqlx::query(sql)
      .fetch_all(pool)
      .await
      .map_err(|e| format!("MySQL クエリエラー: {e}"))?;

    if rows.is_empty() {
      return Ok(DbQueryBatchResult {
        sql: sql.to_string(),
        columns: vec![],
        rows: vec![],
        total_rows: 0,
        elapsed_ms: 0,
        affected_rows: None,
        error: None,
      });
    }

    // カラム情報を取得
    let columns: Vec<DbQueryColumn> = rows[0]
      .columns()
      .iter()
      .map(|c| DbQueryColumn {
        name: c.name().to_string(),
        data_type: c.type_info().name().to_string(),
      })
      .collect();

    let total_rows = rows.len() as u64;
    let limited_rows: Vec<DbQueryRow> = rows
      .iter()
      .take(limit)
      .map(|row| {
        let values: Vec<serde_json::Value> = row
          .columns()
          .iter()
          .enumerate()
          .map(|(i, _)| mysql_value_to_json(row, i))
          .collect();
        DbQueryRow { values }
      })
      .collect();

    Ok(DbQueryBatchResult {
      sql: sql.to_string(),
      columns,
      rows: limited_rows,
      total_rows,
      elapsed_ms: 0,
      affected_rows: None,
      error: None,
    })
  } else {
    // DML / DDL
    let result = sqlx::query(sql)
      .execute(pool)
      .await
      .map_err(|e| format!("MySQL 実行エラー: {e}"))?;

    Ok(DbQueryBatchResult {
      sql: sql.to_string(),
      columns: vec![],
      rows: vec![],
      total_rows: 0,
      elapsed_ms: 0,
      affected_rows: Some(result.rows_affected()),
      error: None,
    })
  }
}

async fn execute_postgres_statement(
  pool: &sqlx::PgPool,
  sql: &str,
  limit: usize,
) -> Result<DbQueryBatchResult, String> {
  use sqlx::TypeInfo;

  let trimmed = sql.trim_start().to_uppercase();
  let is_query = trimmed.starts_with("SELECT")
    || trimmed.starts_with("WITH")
    || trimmed.starts_with("EXPLAIN")
    || trimmed.starts_with("TABLE");

  if is_query {
    let rows = sqlx::query(sql)
      .fetch_all(pool)
      .await
      .map_err(|e| format!("PostgreSQL クエリエラー: {e}"))?;

    if rows.is_empty() {
      return Ok(DbQueryBatchResult {
        sql: sql.to_string(),
        columns: vec![],
        rows: vec![],
        total_rows: 0,
        elapsed_ms: 0,
        affected_rows: None,
        error: None,
      });
    }

    let columns: Vec<DbQueryColumn> = rows[0]
      .columns()
      .iter()
      .map(|c| DbQueryColumn {
        name: c.name().to_string(),
        data_type: c.type_info().name().to_string(),
      })
      .collect();

    let total_rows = rows.len() as u64;
    let limited_rows: Vec<DbQueryRow> = rows
      .iter()
      .take(limit)
      .map(|row| {
        let values: Vec<serde_json::Value> = row
          .columns()
          .iter()
          .enumerate()
          .map(|(i, _)| pg_value_to_json(row, i))
          .collect();
        DbQueryRow { values }
      })
      .collect();

    Ok(DbQueryBatchResult {
      sql: sql.to_string(),
      columns,
      rows: limited_rows,
      total_rows,
      elapsed_ms: 0,
      affected_rows: None,
      error: None,
    })
  } else {
    let result = sqlx::query(sql)
      .execute(pool)
      .await
      .map_err(|e| format!("PostgreSQL 実行エラー: {e}"))?;

    Ok(DbQueryBatchResult {
      sql: sql.to_string(),
      columns: vec![],
      rows: vec![],
      total_rows: 0,
      elapsed_ms: 0,
      affected_rows: Some(result.rows_affected()),
      error: None,
    })
  }
}

/// MySQL の行値を serde_json::Value に変換する
fn mysql_value_to_json(row: &sqlx::mysql::MySqlRow, index: usize) -> serde_json::Value {
  // 一般的な型順に try_get を試みる
  if let Ok(v) = row.try_get::<Option<i64>, _>(index) {
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
  if let Ok(v) = row.try_get::<Option<f64>, _>(index) {
    return v
      .and_then(|f| serde_json::Number::from_f64(f).map(serde_json::Value::Number))
      .unwrap_or(serde_json::Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<bool>, _>(index) {
    return v.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null);
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
}
