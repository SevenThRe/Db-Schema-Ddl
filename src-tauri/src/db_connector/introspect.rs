// DB スキーマイントロスペクション
// MySQL / PostgreSQL の INFORMATION_SCHEMA からテーブル・カラム情報を取得する

use sqlx::{
  mysql::{MySqlConnectOptions, MySqlPoolOptions},
  postgres::{PgConnectOptions, PgPoolOptions},
  ConnectOptions as _, Row,
};
use std::time::Duration;

use super::{
  DbColumnSchema, DbConnectionConfig, DbDriver, DbForeignKeySchema, DbIndexSchema,
  DbSchemaSnapshot, DbTableSchema, DbViewSchema,
};

const ACQUIRE_TIMEOUT_SECS: u64 = 15;
const POSTGRES_TABLES_SQL: &str = "SELECT t.table_name,
            obj_description(
              (quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass
            ) AS table_comment
     FROM information_schema.tables t
     WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
     ORDER BY t.table_name";
const POSTGRES_VIEWS_SQL: &str = "SELECT
       v.table_name AS view_name,
       obj_description(
         (quote_ident(v.table_schema) || '.' || quote_ident(v.table_name))::regclass
       ) AS view_comment
     FROM information_schema.views v
     WHERE v.table_schema = $1
     ORDER BY v.table_name";
const POSTGRES_COLUMNS_SQL: &str = "SELECT
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
       WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1
     ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
     LEFT JOIN pg_catalog.pg_statio_all_tables st
       ON c.table_name = st.relname AND st.schemaname = $1
     LEFT JOIN pg_catalog.pg_description pgd
       ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
     WHERE c.table_schema = $1
     ORDER BY c.table_name, c.ordinal_position";
const POSTGRES_INDEXES_SQL: &str = "SELECT
       t.relname AS table_name,
       i.relname AS index_name,
       ix.indisunique AS is_unique,
       ix.indisprimary AS is_primary,
       COALESCE(array_agg(a.attname ORDER BY a.attnum)
         FILTER (WHERE a.attname IS NOT NULL), '{}') AS column_names
     FROM pg_class t
     JOIN pg_index ix ON t.oid = ix.indrelid
     JOIN pg_class i ON i.oid = ix.indexrelid
     JOIN pg_namespace ns ON ns.oid = t.relnamespace
     LEFT JOIN pg_attribute a
       ON a.attrelid = t.oid
      AND a.attnum = ANY(ix.indkey)
     WHERE ns.nspname = $1
     GROUP BY t.relname, i.relname, ix.indisunique, ix.indisprimary
     ORDER BY t.relname, i.relname";
const POSTGRES_FOREIGN_KEYS_SQL: &str = "SELECT
       tc.table_name,
       tc.constraint_name,
       kcu.column_name,
       ccu.table_name AS referenced_table_name,
       ccu.column_name AS referenced_column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = $1
     ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position";

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

  let view_rows = sqlx::query(
    "SELECT TABLE_NAME, TABLE_COMMENT
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW'
     ORDER BY TABLE_NAME",
  )
  .bind(&config.database)
  .fetch_all(&pool)
  .await
  .map_err(|e| format!("ビュー一覧取得失敗: {e}"))?;

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

  let index_rows = sqlx::query(
    "SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, COLUMN_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX",
  )
  .bind(&config.database)
  .fetch_all(&pool)
  .await
  .map_err(|e| format!("インデックス情報取得失敗: {e}"))?;

  let fk_rows = sqlx::query(
    "SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME,
            REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION",
  )
  .bind(&config.database)
  .fetch_all(&pool)
  .await
  .map_err(|e| format!("外部キー情報取得失敗: {e}"))?;

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

  let mut index_map: HashMap<String, Vec<DbIndexSchema>> = HashMap::new();
  let mut index_lookup: HashMap<(String, String), usize> = HashMap::new();
  for row in &index_rows {
    let table_name: String = row.try_get("TABLE_NAME").unwrap_or_default();
    let index_name: String = row.try_get("INDEX_NAME").unwrap_or_default();
    let column_name: String = row.try_get("COLUMN_NAME").unwrap_or_default();
    let unique = row.try_get::<i32, _>("NON_UNIQUE").unwrap_or(1) == 0;
    let key = (table_name.clone(), index_name.clone());

    if let Some(existing_index) = index_lookup.get(&key).copied() {
      if let Some(existing) = index_map
        .get_mut(&table_name)
        .and_then(|items| items.get_mut(existing_index))
      {
        existing.columns.push(column_name);
      }
      continue;
    }

    let indexes = index_map.entry(table_name.clone()).or_default();
    let position = indexes.len();
    indexes.push(DbIndexSchema {
      name: index_name.clone(),
      columns: vec![column_name],
      unique,
      primary: index_name.eq_ignore_ascii_case("PRIMARY"),
    });
    index_lookup.insert(key, position);
  }

  let mut foreign_key_map: HashMap<String, Vec<DbForeignKeySchema>> = HashMap::new();
  let mut foreign_key_lookup: HashMap<(String, String), usize> = HashMap::new();
  for row in &fk_rows {
    let table_name: String = row.try_get("TABLE_NAME").unwrap_or_default();
    let constraint_name: String = row.try_get("CONSTRAINT_NAME").unwrap_or_default();
    let column_name: String = row.try_get("COLUMN_NAME").unwrap_or_default();
    let referenced_table: String = row.try_get("REFERENCED_TABLE_NAME").unwrap_or_default();
    let referenced_column: String = row.try_get("REFERENCED_COLUMN_NAME").unwrap_or_default();
    let key = (table_name.clone(), constraint_name.clone());

    if let Some(existing_index) = foreign_key_lookup.get(&key).copied() {
      if let Some(existing) = foreign_key_map
        .get_mut(&table_name)
        .and_then(|items| items.get_mut(existing_index))
      {
        existing.columns.push(column_name);
        existing.referenced_columns.push(referenced_column);
      }
      continue;
    }

    let foreign_keys = foreign_key_map.entry(table_name.clone()).or_default();
    let position = foreign_keys.len();
    foreign_keys.push(DbForeignKeySchema {
      name: constraint_name.clone(),
      columns: vec![column_name],
      referenced_table,
      referenced_columns: vec![referenced_column],
    });
    foreign_key_lookup.insert(key, position);
  }

  let tables: Vec<DbTableSchema> = table_rows
    .iter()
    .map(|row| {
      let name: String = row.try_get("TABLE_NAME").unwrap_or_default();
      let comment_raw: String = row.try_get("TABLE_COMMENT").unwrap_or_default();
      let columns = col_map.remove(&name).unwrap_or_default();
      let indexes = index_map.remove(&name).unwrap_or_default();
      let foreign_keys = foreign_key_map.remove(&name).unwrap_or_default();
      DbTableSchema {
        name,
        comment: if comment_raw.is_empty() { None } else { Some(comment_raw) },
        columns,
        indexes,
        foreign_keys,
      }
    })
    .collect();

  let views: Vec<DbViewSchema> = view_rows
    .iter()
    .map(|row| {
      let name: String = row.try_get("TABLE_NAME").unwrap_or_default();
      let comment_raw: String = row.try_get("TABLE_COMMENT").unwrap_or_default();
      let columns = col_map.remove(&name).unwrap_or_default();
      DbViewSchema {
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
    schema: config.database.clone(),
    tables,
    views,
  })
}

// ── PostgreSQL ─────────────────────────────────

async fn introspect_postgres(config: &DbConnectionConfig) -> Result<DbSchemaSnapshot, String> {
  let active_schema = resolve_postgres_schema(config.default_schema.as_deref());

  let opts = pg_opts(config)?;
  let pool = PgPoolOptions::new()
    .max_connections(2)
    .acquire_timeout(Duration::from_secs(ACQUIRE_TIMEOUT_SECS))
    .connect_with(opts)
    .await
    .map_err(|e| format!("PostgreSQL 连接失败: {e}"))?;

  let table_rows = sqlx::query(POSTGRES_TABLES_SQL)
  .bind(&active_schema)
  .fetch_all(&pool)
  .await
  .map_err(|e| format!("テーブル一覧取得失敗: {e}"))?;

  let view_rows = sqlx::query(POSTGRES_VIEWS_SQL)
  .bind(&active_schema)
  .fetch_all(&pool)
  .await
  .map_err(|e| format!("ビュー一覧取得失敗: {e}"))?;

  let col_rows = sqlx::query(POSTGRES_COLUMNS_SQL)
  .bind(&active_schema)
  .fetch_all(&pool)
  .await
  .map_err(|e| format!("カラム情報取得失敗: {e}"))?;

  let index_rows = sqlx::query(POSTGRES_INDEXES_SQL)
  .bind(&active_schema)
  .fetch_all(&pool)
  .await
  .map_err(|e| format!("インデックス情報取得失敗: {e}"))?;

  let fk_rows = sqlx::query(POSTGRES_FOREIGN_KEYS_SQL)
  .bind(&active_schema)
  .fetch_all(&pool)
  .await
  .map_err(|e| format!("外部キー情報取得失敗: {e}"))?;

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

  let mut index_map: HashMap<String, Vec<DbIndexSchema>> = HashMap::new();
  for row in &index_rows {
    let table_name: String = row.try_get("table_name").unwrap_or_default();
    let index_name: String = row.try_get("index_name").unwrap_or_default();
    let columns: Vec<String> = row.try_get("column_names").unwrap_or_default();
    let index = DbIndexSchema {
      name: index_name,
      columns,
      unique: row.try_get("is_unique").unwrap_or(false),
      primary: row.try_get("is_primary").unwrap_or(false),
    };
    index_map.entry(table_name).or_default().push(index);
  }

  let mut foreign_key_map: HashMap<String, Vec<DbForeignKeySchema>> = HashMap::new();
  let mut foreign_key_lookup: HashMap<(String, String), usize> = HashMap::new();
  for row in &fk_rows {
    let table_name: String = row.try_get("table_name").unwrap_or_default();
    let constraint_name: String = row.try_get("constraint_name").unwrap_or_default();
    let column_name: String = row.try_get("column_name").unwrap_or_default();
    let referenced_table: String = row.try_get("referenced_table_name").unwrap_or_default();
    let referenced_column: String = row.try_get("referenced_column_name").unwrap_or_default();
    let key = (table_name.clone(), constraint_name.clone());

    if let Some(existing_index) = foreign_key_lookup.get(&key).copied() {
      if let Some(existing) = foreign_key_map
        .get_mut(&table_name)
        .and_then(|items| items.get_mut(existing_index))
      {
        existing.columns.push(column_name);
        existing.referenced_columns.push(referenced_column);
      }
      continue;
    }

    let foreign_keys = foreign_key_map.entry(table_name.clone()).or_default();
    let position = foreign_keys.len();
    foreign_keys.push(DbForeignKeySchema {
      name: constraint_name.clone(),
      columns: vec![column_name],
      referenced_table,
      referenced_columns: vec![referenced_column],
    });
    foreign_key_lookup.insert(key, position);
  }

  let tables: Vec<DbTableSchema> = table_rows
    .iter()
    .map(|row| {
      let name: String = row.try_get("table_name").unwrap_or_default();
      let comment: Option<String> = row.try_get("table_comment").ok().flatten();
      let columns = col_map.remove(&name).unwrap_or_default();
      let indexes = index_map.remove(&name).unwrap_or_default();
      let foreign_keys = foreign_key_map.remove(&name).unwrap_or_default();
      DbTableSchema {
        name,
        comment,
        columns,
        indexes,
        foreign_keys,
      }
    })
    .collect();

  let views: Vec<DbViewSchema> = view_rows
    .iter()
    .map(|row| {
      let name: String = row.try_get("view_name").unwrap_or_default();
      let comment: Option<String> = row.try_get("view_comment").ok().flatten();
      let columns = col_map.remove(&name).unwrap_or_default();
      DbViewSchema {
        name,
        comment,
        columns,
      }
    })
    .collect();

  Ok(DbSchemaSnapshot {
    connection_id: config.id.clone(),
    connection_name: config.name.clone(),
    database: config.database.clone(),
    schema: active_schema,
    tables,
    views,
  })
}

pub(crate) fn resolve_postgres_schema(default_schema: Option<&str>) -> String {
  default_schema
    .map(str::trim)
    .filter(|schema| !schema.is_empty())
    .unwrap_or("public")
    .to_string()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn resolve_postgres_schema_prefers_explicit_non_public_schema() {
    let schema = resolve_postgres_schema(Some("tenant_reporting"));
    assert_eq!(schema, "tenant_reporting");
  }

  #[test]
  fn resolve_postgres_schema_defaults_to_public_when_missing_or_blank() {
    assert_eq!(resolve_postgres_schema(None), "public");
    assert_eq!(resolve_postgres_schema(Some("   ")), "public");
  }

  #[test]
  fn postgres_introspection_sql_binds_schema_parameter_without_public_literal() {
    for sql in [
      POSTGRES_TABLES_SQL,
      POSTGRES_VIEWS_SQL,
      POSTGRES_COLUMNS_SQL,
      POSTGRES_INDEXES_SQL,
      POSTGRES_FOREIGN_KEYS_SQL,
    ] {
      assert!(
        sql.contains("$1"),
        "schema-aware SQL should bind schema via $1: {sql}"
      );
      assert!(
        !sql.contains("table_schema = 'public'"),
        "schema-aware SQL must avoid hardcoded public literal: {sql}"
      );
      assert!(
        !sql.contains("ns.nspname = 'public'"),
        "index SQL must avoid hardcoded public literal: {sql}"
      );
    }
  }
}
