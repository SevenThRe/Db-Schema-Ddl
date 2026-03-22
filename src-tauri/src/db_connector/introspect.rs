// DB スキーマイントロスペクション
// MySQL / PostgreSQL の INFORMATION_SCHEMA からテーブル・カラム情報を取得する

use sqlx::{
  mysql::{MySqlConnectOptions, MySqlPoolOptions},
  postgres::{PgConnectOptions, PgPoolOptions},
  ConnectOptions as _, Row,
};
use std::time::Duration;

use super::{DbColumnSchema, DbConnectionConfig, DbDriver, DbSchemaSnapshot, DbTableSchema};

const ACQUIRE_TIMEOUT_SECS: u64 = 15;

// ──────────────────────────────────────────────
// 接続テスト
// ──────────────────────────────────────────────

pub async fn test_connection(config: &DbConnectionConfig) -> Result<String, String> {
  match config.driver {
    DbDriver::Mysql => {
      let opts = mysql_opts(config)?;
      let pool = MySqlPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(ACQUIRE_TIMEOUT_SECS))
        .connect_with(opts)
        .await
        .map_err(|e| format!("MySQL 连接失败: {e}"))?;
      let row: (String,) = sqlx::query_as("SELECT VERSION()")
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("MySQL 版本查询失败: {e}"))?;
      pool.close().await;
      Ok(format!("MySQL {}", row.0))
    }
    DbDriver::Postgres => {
      let opts = pg_opts(config)?;
      let pool = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(ACQUIRE_TIMEOUT_SECS))
        .connect_with(opts)
        .await
        .map_err(|e| format!("PostgreSQL 连接失败: {e}"))?;
      let row: (String,) = sqlx::query_as("SELECT version()")
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("PostgreSQL 版本查询失败: {e}"))?;
      pool.close().await;
      Ok(row.0)
    }
  }
}

// ──────────────────────────────────────────────
// スキーマ取得
// ──────────────────────────────────────────────

pub async fn introspect_schema(config: &DbConnectionConfig) -> Result<DbSchemaSnapshot, String> {
  match config.driver {
    DbDriver::Mysql => introspect_mysql(config).await,
    DbDriver::Postgres => introspect_postgres(config).await,
  }
}

// ── 接続オプションビルダー ─────────────────────

fn mysql_opts(config: &DbConnectionConfig) -> Result<MySqlConnectOptions, String> {
  let opts = MySqlConnectOptions::new()
    .host(&config.host)
    .port(config.port)
    .database(&config.database)
    .username(&config.username)
    .password(&config.password)
    .disable_statement_logging();
  Ok(opts)
}

fn pg_opts(config: &DbConnectionConfig) -> Result<PgConnectOptions, String> {
  let opts = PgConnectOptions::new()
    .host(&config.host)
    .port(config.port)
    .database(&config.database)
    .username(&config.username)
    .password(&config.password)
    .disable_statement_logging();
  Ok(opts)
}

// ── MySQL ──────────────────────────────────────

async fn introspect_mysql(config: &DbConnectionConfig) -> Result<DbSchemaSnapshot, String> {
  let opts = mysql_opts(config)?;
  let pool = MySqlPoolOptions::new()
    .max_connections(2)
    .acquire_timeout(Duration::from_secs(ACQUIRE_TIMEOUT_SECS))
    .connect_with(opts)
    .await
    .map_err(|e| format!("MySQL 连接失败: {e}"))?;

  let table_rows = sqlx::query(
    "SELECT TABLE_NAME, TABLE_COMMENT
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME",
  )
  .bind(&config.database)
  .fetch_all(&pool)
  .await
  .map_err(|e| format!("テーブル一覧取得失敗: {e}"))?;

  let col_rows = sqlx::query(
    "SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE,
            COLUMN_KEY, COLUMN_DEFAULT, COLUMN_COMMENT, COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME, ORDINAL_POSITION",
  )
  .bind(&config.database)
  .fetch_all(&pool)
  .await
  .map_err(|e| format!("カラム情報取得失敗: {e}"))?;

  pool.close().await;

  use std::collections::HashMap;
  let mut col_map: HashMap<String, Vec<DbColumnSchema>> = HashMap::new();
  for row in &col_rows {
    let table_name: String = row.try_get("TABLE_NAME").unwrap_or_default();
    let col = DbColumnSchema {
      name: row.try_get("COLUMN_NAME").unwrap_or_default(),
      data_type: row.try_get("COLUMN_TYPE").unwrap_or_default(),
      nullable: row
        .try_get::<String, _>("IS_NULLABLE")
        .unwrap_or_default()
        .eq_ignore_ascii_case("YES"),
      primary_key: row.try_get::<String, _>("COLUMN_KEY").unwrap_or_default() == "PRI",
      default_value: row.try_get("COLUMN_DEFAULT").ok(),
      comment: {
        let c: String = row.try_get("COLUMN_COMMENT").unwrap_or_default();
        if c.is_empty() { None } else { Some(c) }
      },
    };
    col_map.entry(table_name).or_default().push(col);
  }

  let tables: Vec<DbTableSchema> = table_rows
    .iter()
    .map(|row| {
      let name: String = row.try_get("TABLE_NAME").unwrap_or_default();
      let comment_raw: String = row.try_get("TABLE_COMMENT").unwrap_or_default();
      let columns = col_map.remove(&name).unwrap_or_default();
      DbTableSchema {
        name,
        comment: if comment_raw.is_empty() { None } else { Some(comment_raw) },
        columns,
      }
    })
    .collect();

  Ok(DbSchemaSnapshot {
    connection_id: config.id.clone(),
    connection_name: config.name.clone(),
    database: config.database.clone(),
    tables,
  })
}

// ── PostgreSQL ─────────────────────────────────

async fn introspect_postgres(config: &DbConnectionConfig) -> Result<DbSchemaSnapshot, String> {
  let opts = pg_opts(config)?;
  let pool = PgPoolOptions::new()
    .max_connections(2)
    .acquire_timeout(Duration::from_secs(ACQUIRE_TIMEOUT_SECS))
    .connect_with(opts)
    .await
    .map_err(|e| format!("PostgreSQL 连接失败: {e}"))?;

  let table_rows = sqlx::query(
    "SELECT t.table_name,
            obj_description(
              (quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass
            ) AS table_comment
     FROM information_schema.tables t
     WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
     ORDER BY t.table_name",
  )
  .fetch_all(&pool)
  .await
  .map_err(|e| format!("テーブル一覧取得失敗: {e}"))?;

  let col_rows = sqlx::query(
    "SELECT
       c.table_name,
       c.column_name,
       c.udt_name            AS data_type,
       c.is_nullable,
       c.column_default,
       COALESCE(pk.is_pk, false) AS is_primary_key,
       pgd.description        AS column_comment
     FROM information_schema.columns c
     LEFT JOIN (
       SELECT ku.table_name, ku.column_name, true AS is_pk
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage ku
         ON tc.constraint_name = ku.constraint_name
         AND tc.table_schema   = ku.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
     ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
     LEFT JOIN pg_catalog.pg_statio_all_tables st
       ON c.table_name = st.relname AND st.schemaname = 'public'
     LEFT JOIN pg_catalog.pg_description pgd
       ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
     WHERE c.table_schema = 'public'
     ORDER BY c.table_name, c.ordinal_position",
  )
  .fetch_all(&pool)
  .await
  .map_err(|e| format!("カラム情報取得失敗: {e}"))?;

  pool.close().await;

  use std::collections::HashMap;
  let mut col_map: HashMap<String, Vec<DbColumnSchema>> = HashMap::new();
  for row in &col_rows {
    let table_name: String = row.try_get("table_name").unwrap_or_default();
    let col = DbColumnSchema {
      name: row.try_get("column_name").unwrap_or_default(),
      data_type: row.try_get("data_type").unwrap_or_default(),
      nullable: row
        .try_get::<String, _>("is_nullable")
        .unwrap_or_default()
        .eq_ignore_ascii_case("YES"),
      primary_key: row.try_get("is_primary_key").unwrap_or(false),
      default_value: row.try_get("column_default").ok(),
      comment: row.try_get("column_comment").ok().flatten(),
    };
    col_map.entry(table_name).or_default().push(col);
  }

  let tables: Vec<DbTableSchema> = table_rows
    .iter()
    .map(|row| {
      let name: String = row.try_get("table_name").unwrap_or_default();
      let comment: Option<String> = row.try_get("table_comment").ok().flatten();
      let columns = col_map.remove(&name).unwrap_or_default();
      DbTableSchema { name, comment, columns }
    })
    .collect();

  Ok(DbSchemaSnapshot {
    connection_id: config.id.clone(),
    connection_name: config.name.clone(),
    database: config.database.clone(),
    tables,
  })
}
