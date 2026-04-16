use std::collections::HashMap;

use sqlx::Row;
use tauri::AppHandle;

use super::introspect::resolve_postgres_schema;
use super::query::{get_or_create_pool, load_connection_config};
use super::{
  introspect_schema, AnyPool, DbColumnSchema, DbConnectionConfig, DbDriver, DbForeignKeySchema,
  DbIndexSchema, DbObjectInspectionRequest, DbObjectInspectionResponse, DbObjectKind,
  DbPoolRegistry, DbRoutineKind, DbRoutineSchema, DbSequenceSchema, DbTableSchema,
  DbTriggerSchema,
};

const COVERAGE_NOTES: [&str; 2] = [
  "DDL inspection currently supports tables, views, indexes, foreign keys, functions, procedures, triggers, and PostgreSQL sequences.",
  "Indexes, foreign keys, and PostgreSQL sequences use generated DDL based on live schema snapshot metadata.",
];

const POSTGRES_VIEW_DEFINITION_SQL: &str = "SELECT pg_get_viewdef(
    (quote_ident($1) || '.' || quote_ident($2))::regclass,
    true
  ) AS definition";
const POSTGRES_FORMATTED_COLUMN_TYPES_SQL: &str = "SELECT
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c
    ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace ns
    ON ns.oid = c.relnamespace
  WHERE ns.nspname = $1
    AND c.relname = $2
    AND a.attnum > 0
    AND NOT a.attisdropped
  ORDER BY a.attnum";
const POSTGRES_ROUTINE_DEFINITION_SQL: &str = "SELECT
    CASE p.prokind
      WHEN 'p' THEN 'procedure'
      ELSE 'function'
    END AS routine_kind,
    pg_catalog.pg_get_functiondef(p.oid) AS definition
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace ns
    ON ns.oid = p.pronamespace
  WHERE ns.nspname = $1
    AND p.proname = $2
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = $3
    AND p.prokind IN ('f', 'p')";
const POSTGRES_TRIGGER_DEFINITION_SQL: &str = "SELECT
    pg_catalog.pg_get_triggerdef(t.oid, true) AS definition
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c
    ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace ns
    ON ns.oid = c.relnamespace
  WHERE ns.nspname = $1
    AND c.relname = $2
    AND t.tgname = $3
    AND NOT t.tgisinternal";
const POSTGRES_SEQUENCE_METADATA_SQL: &str = "SELECT
    seq.seqstart AS start_value,
    seq.seqincrement AS increment_by,
    seq.seqmin AS min_value,
    seq.seqmax AS max_value,
    seq.seqcache AS cache_size,
    seq.seqcycle AS is_cycled
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace ns
    ON ns.oid = c.relnamespace
  JOIN pg_catalog.pg_sequence seq
    ON seq.seqrelid = c.oid
  WHERE ns.nspname = $1
    AND c.relname = $2";

pub async fn db_inspect_object(
  app: &AppHandle,
  pool_registry: &DbPoolRegistry,
  request: DbObjectInspectionRequest,
) -> Result<DbObjectInspectionResponse, String> {
  let mut config = load_connection_config(app, &request.connection_id)?;
  if config.driver == DbDriver::Postgres {
    if let Some(schema) = normalized_optional(&request.schema) {
      config.default_schema = Some(schema.to_string());
    }
  }

  let schema_name = active_schema_name(&config);

  match request.object_kind {
    DbObjectKind::Table => inspect_table(pool_registry, &config, &schema_name, request).await,
    DbObjectKind::View => inspect_view(pool_registry, &config, &schema_name, request).await,
    DbObjectKind::Index => inspect_index(&config, &schema_name, request).await,
    DbObjectKind::ForeignKey => inspect_foreign_key(&config, &schema_name, request).await,
    DbObjectKind::Function | DbObjectKind::Procedure => {
      inspect_routine(pool_registry, &config, &schema_name, request).await
    }
    DbObjectKind::Trigger => inspect_trigger(pool_registry, &config, &schema_name, request).await,
    DbObjectKind::Sequence => inspect_sequence(pool_registry, &config, &schema_name, request).await,
  }
}

async fn inspect_table(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  request: DbObjectInspectionRequest,
) -> Result<DbObjectInspectionResponse, String> {
  let snapshot = introspect_schema(config).await?;
  let table = snapshot
    .tables
    .into_iter()
    .find(|item| item.name == request.object_name)
    .ok_or_else(|| format!("テーブルが見つかりません: {}", request.object_name))?;

  let ddl = match config.driver {
    DbDriver::Mysql => {
      fetch_mysql_table_like_ddl(
        pool_registry,
        config,
        schema_name,
        &request.object_name,
        "TABLE",
        &["Create Table"],
      )
      .await?
    }
    DbDriver::Postgres => render_postgres_table_ddl(pool_registry, config, schema_name, &table).await?,
  };

  Ok(DbObjectInspectionResponse {
    connection_id: request.connection_id,
    database: config.database.clone(),
    schema: schema_name.to_string(),
    object_kind: request.object_kind,
    object_name: request.object_name.clone(),
    signature: None,
    parent_object_name: None,
    display_name: format!("{schema_name}.{}", request.object_name),
    supported: true,
    ddl: Some(ddl),
    comment: table.comment.clone(),
    columns: table.columns,
    indexes: table.indexes,
    foreign_keys: table.foreign_keys,
    definition_sql: None,
    unsupported_message: None,
    coverage_notes: coverage_notes(),
  })
}

async fn inspect_view(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  request: DbObjectInspectionRequest,
) -> Result<DbObjectInspectionResponse, String> {
  let snapshot = introspect_schema(config).await?;
  let view = snapshot
    .views
    .into_iter()
    .find(|item| item.name == request.object_name)
    .ok_or_else(|| format!("ビューが見つかりません: {}", request.object_name))?;

  let (ddl, definition_sql) = match config.driver {
    DbDriver::Mysql => {
      let ddl = fetch_mysql_table_like_ddl(
        pool_registry,
        config,
        schema_name,
        &request.object_name,
        "VIEW",
        &["Create View"],
      )
      .await?;
      (ddl, None)
    }
    DbDriver::Postgres => {
      let definition_sql =
        fetch_postgres_view_definition(pool_registry, config, schema_name, &request.object_name).await?;
      let ddl = format!(
        "CREATE OR REPLACE VIEW {} AS\n{};",
        qualify_postgres_identifier(schema_name, &request.object_name),
        definition_sql.trim().trim_end_matches(';'),
      );
      (ddl, Some(definition_sql))
    }
  };

  Ok(DbObjectInspectionResponse {
    connection_id: request.connection_id,
    database: config.database.clone(),
    schema: schema_name.to_string(),
    object_kind: request.object_kind,
    object_name: request.object_name.clone(),
    signature: None,
    parent_object_name: None,
    display_name: format!("{schema_name}.{}", request.object_name),
    supported: true,
    ddl: Some(ddl),
    comment: view.comment.clone(),
    columns: view.columns,
    indexes: vec![],
    foreign_keys: vec![],
    definition_sql,
    unsupported_message: None,
    coverage_notes: coverage_notes(),
  })
}

async fn inspect_index(
  config: &DbConnectionConfig,
  schema_name: &str,
  request: DbObjectInspectionRequest,
) -> Result<DbObjectInspectionResponse, String> {
  let snapshot = introspect_schema(config).await?;
  let parent_table_name = normalized_optional(&request.parent_object_name)
    .ok_or_else(|| "Index inspection requires parent table context.".to_string())?;
  let table = snapshot
    .tables
    .into_iter()
    .find(|item| item.name == parent_table_name)
    .ok_or_else(|| format!("テーブルが見つかりません: {}", parent_table_name))?;
  let index = table
    .indexes
    .iter()
    .find(|item| item.name == request.object_name)
    .cloned()
    .ok_or_else(|| format!("インデックスが見つかりません: {}", request.object_name))?;

  let ddl = build_index_ddl(&config.driver, schema_name, &table.name, &index);

  Ok(DbObjectInspectionResponse {
    connection_id: request.connection_id,
    database: config.database.clone(),
    schema: schema_name.to_string(),
    object_kind: request.object_kind,
    object_name: request.object_name.clone(),
    signature: None,
    parent_object_name: Some(table.name.clone()),
    display_name: format!("{schema_name}.{}.{}", table.name, request.object_name),
    supported: true,
    ddl: Some(ddl),
    comment: None,
    columns: filter_table_columns(&table, &index.columns),
    indexes: vec![index],
    foreign_keys: vec![],
    definition_sql: None,
    unsupported_message: None,
    coverage_notes: coverage_notes(),
  })
}

async fn inspect_foreign_key(
  config: &DbConnectionConfig,
  schema_name: &str,
  request: DbObjectInspectionRequest,
) -> Result<DbObjectInspectionResponse, String> {
  let snapshot = introspect_schema(config).await?;
  let parent_table_name = normalized_optional(&request.parent_object_name)
    .ok_or_else(|| "Foreign key inspection requires parent table context.".to_string())?;
  let table = snapshot
    .tables
    .into_iter()
    .find(|item| item.name == parent_table_name)
    .ok_or_else(|| format!("テーブルが見つかりません: {}", parent_table_name))?;
  let foreign_key = table
    .foreign_keys
    .iter()
    .find(|item| item.name == request.object_name)
    .cloned()
    .ok_or_else(|| format!("外部キーが見つかりません: {}", request.object_name))?;

  let ddl = build_foreign_key_ddl(&config.driver, schema_name, &table.name, &foreign_key);

  Ok(DbObjectInspectionResponse {
    connection_id: request.connection_id,
    database: config.database.clone(),
    schema: schema_name.to_string(),
    object_kind: request.object_kind,
    object_name: request.object_name.clone(),
    signature: None,
    parent_object_name: Some(table.name.clone()),
    display_name: format!("{schema_name}.{}.{}", table.name, request.object_name),
    supported: true,
    ddl: Some(ddl),
    comment: None,
    columns: filter_table_columns(&table, &foreign_key.columns),
    indexes: vec![],
    foreign_keys: vec![foreign_key],
    definition_sql: None,
    unsupported_message: None,
    coverage_notes: coverage_notes(),
  })
}

async fn inspect_routine(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  request: DbObjectInspectionRequest,
) -> Result<DbObjectInspectionResponse, String> {
  let snapshot = introspect_schema(config).await?;
  let expected_kind = expected_routine_kind(&request.object_kind)
    .ok_or_else(|| format!("Unsupported routine object kind: {:?}", request.object_kind))?;
  let routine_name = parse_routine_name(&request.object_name);
  let requested_signature =
    request.signature.as_deref().map(str::trim).or_else(|| parse_routine_signature(&request.object_name));

  let routine = snapshot
    .routines
    .into_iter()
    .find(|item| routine_matches(item, &expected_kind, routine_name, requested_signature))
    .ok_or_else(|| format!("ルーチンが見つかりません: {}", request.object_name))?;

  let ddl = match config.driver {
    DbDriver::Mysql => fetch_mysql_routine_ddl(pool_registry, config, schema_name, &routine).await?,
    DbDriver::Postgres => {
      let signature = requested_signature
        .or_else(|| routine.signature.as_deref().map(str::trim))
        .unwrap_or("");
      fetch_postgres_routine_definition(pool_registry, config, schema_name, &routine, signature).await?
    }
  };

  Ok(DbObjectInspectionResponse {
    connection_id: request.connection_id,
    database: config.database.clone(),
    schema: schema_name.to_string(),
    object_kind: request.object_kind,
    object_name: request.object_name.clone(),
    signature: routine.signature.clone(),
    parent_object_name: None,
    display_name: build_routine_display_name(schema_name, &routine.name, routine.signature.as_deref()),
    supported: true,
    ddl: Some(ddl),
    comment: routine.comment.clone(),
    columns: vec![],
    indexes: vec![],
    foreign_keys: vec![],
    definition_sql: None,
    unsupported_message: None,
    coverage_notes: coverage_notes(),
  })
}

async fn inspect_trigger(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  request: DbObjectInspectionRequest,
) -> Result<DbObjectInspectionResponse, String> {
  let snapshot = introspect_schema(config).await?;
  let requested_parent = normalized_optional(&request.parent_object_name);
  let matching_triggers: Vec<DbTriggerSchema> = snapshot
    .triggers
    .into_iter()
    .filter(|item| item.name == request.object_name)
    .collect();

  let trigger = if let Some(parent_object_name) = requested_parent {
    matching_triggers
      .iter()
      .find(|item| item.table_name == parent_object_name)
      .cloned()
      .ok_or_else(|| format!("トリガーが見つかりません: {} on {}", request.object_name, parent_object_name))?
  } else if matching_triggers.len() == 1 {
    matching_triggers[0].clone()
  } else if matching_triggers.is_empty() {
    return Err(format!("トリガーが見つかりません: {}", request.object_name));
  } else {
    return Err(format!(
      "トリガー名が曖昧です: {}。所属テーブル情報が必要です。",
      request.object_name
    ));
  };

  let ddl = match config.driver {
    DbDriver::Mysql => fetch_mysql_trigger_ddl(pool_registry, config, schema_name, &trigger.name).await?,
    DbDriver::Postgres => {
      fetch_postgres_trigger_definition(pool_registry, config, schema_name, &trigger.table_name, &trigger.name)
        .await?
    }
  };

  Ok(DbObjectInspectionResponse {
    connection_id: request.connection_id,
    database: config.database.clone(),
    schema: schema_name.to_string(),
    object_kind: request.object_kind,
    object_name: request.object_name.clone(),
    signature: None,
    parent_object_name: Some(trigger.table_name.clone()),
    display_name: format!("{schema_name}.{}.{}", trigger.table_name, trigger.name),
    supported: true,
    ddl: Some(ddl),
    comment: None,
    columns: vec![],
    indexes: vec![],
    foreign_keys: vec![],
    definition_sql: None,
    unsupported_message: None,
    coverage_notes: coverage_notes(),
  })
}

async fn inspect_sequence(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  request: DbObjectInspectionRequest,
) -> Result<DbObjectInspectionResponse, String> {
  if config.driver != DbDriver::Postgres {
    return Ok(build_unsupported_response(
      config,
      schema_name,
      request,
      Some("Sequence inspection is only supported for PostgreSQL in this build.".to_string()),
    ));
  }

  let snapshot = introspect_schema(config).await?;
  let sequence = snapshot
    .sequences
    .into_iter()
    .find(|item| item.name == request.object_name)
    .ok_or_else(|| format!("シーケンスが見つかりません: {}", request.object_name))?;

  let ddl = fetch_postgres_sequence_ddl(pool_registry, config, schema_name, &sequence).await?;

  Ok(DbObjectInspectionResponse {
    connection_id: request.connection_id,
    database: config.database.clone(),
    schema: schema_name.to_string(),
    object_kind: request.object_kind,
    object_name: request.object_name.clone(),
    signature: None,
    parent_object_name: None,
    display_name: format!("{schema_name}.{}", request.object_name),
    supported: true,
    ddl: Some(ddl),
    comment: sequence.comment.clone(),
    columns: vec![],
    indexes: vec![],
    foreign_keys: vec![],
    definition_sql: None,
    unsupported_message: None,
    coverage_notes: coverage_notes(),
  })
}

fn build_unsupported_response(
  config: &DbConnectionConfig,
  schema_name: &str,
  request: DbObjectInspectionRequest,
  custom_message: Option<String>,
) -> DbObjectInspectionResponse {
  DbObjectInspectionResponse {
    connection_id: request.connection_id,
    database: config.database.clone(),
    schema: schema_name.to_string(),
    object_kind: request.object_kind,
    object_name: request.object_name.clone(),
    signature: request.signature.clone(),
    parent_object_name: request.parent_object_name.clone(),
    display_name: format!("{schema_name}.{}", request.object_name),
    supported: false,
    ddl: None,
    comment: None,
    columns: vec![],
    indexes: vec![],
    foreign_keys: vec![],
    definition_sql: None,
    unsupported_message: Some(custom_message.unwrap_or_else(|| {
      "Standalone inspection is not implemented for this object kind in the current build."
        .to_string()
    })),
    coverage_notes: coverage_notes(),
  }
}

async fn fetch_mysql_table_like_ddl(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  object_name: &str,
  object_keyword: &str,
  candidate_columns: &[&str],
) -> Result<String, String> {
  let statement = format!(
    "SHOW CREATE {} {}",
    object_keyword,
    qualify_mysql_identifier(schema_name, object_name),
  );
  fetch_mysql_show_create_value(pool_registry, config, statement, candidate_columns).await
}

async fn fetch_mysql_routine_ddl(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  routine: &DbRoutineSchema,
) -> Result<String, String> {
  let (keyword, candidate_columns): (&str, &[&str]) = match routine.kind {
    DbRoutineKind::Function => ("FUNCTION", &["Create Function"]),
    DbRoutineKind::Procedure => ("PROCEDURE", &["Create Procedure"]),
  };
  let statement = format!(
    "SHOW CREATE {} {}",
    keyword,
    qualify_mysql_identifier(schema_name, &routine.name),
  );
  fetch_mysql_show_create_value(pool_registry, config, statement, candidate_columns).await
}

async fn fetch_mysql_trigger_ddl(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  trigger_name: &str,
) -> Result<String, String> {
  let statement = format!(
    "SHOW CREATE TRIGGER {}",
    qualify_mysql_identifier(schema_name, trigger_name),
  );
  fetch_mysql_show_create_value(
    pool_registry,
    config,
    statement,
    &["SQL Original Statement", "Create Trigger"],
  )
  .await
}

async fn fetch_mysql_show_create_value(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  statement: String,
  candidate_columns: &[&str],
) -> Result<String, String> {
  let pool = get_or_create_pool(pool_registry, config).await?;

  match pool.as_ref() {
    AnyPool::Mysql(mysql_pool) => {
      let row = sqlx::query(&statement)
        .fetch_one(mysql_pool)
        .await
        .map_err(|error| format!("MySQL DDL 取得失敗: {error}"))?;

      for column_name in candidate_columns {
        if let Ok(value) = row.try_get::<String, _>(*column_name) {
          if !value.trim().is_empty() {
            return Ok(value);
          }
        }
      }

      row
        .try_get::<String, _>(1)
        .map_err(|error| format!("MySQL DDL 行の解析に失敗しました: {error}"))
    }
    _ => Err("MySQL 接続プールの取得に失敗しました".to_string()),
  }
}

async fn fetch_postgres_view_definition(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  object_name: &str,
) -> Result<String, String> {
  let pool = get_or_create_pool(pool_registry, config).await?;

  match pool.as_ref() {
    AnyPool::Postgres(pg_pool) => {
      let row = sqlx::query(POSTGRES_VIEW_DEFINITION_SQL)
        .bind(schema_name)
        .bind(object_name)
        .fetch_one(pg_pool)
        .await
        .map_err(|error| format!("PostgreSQL ビュー定義取得失敗: {error}"))?;

      row
        .try_get::<String, _>("definition")
        .map_err(|error| format!("PostgreSQL ビュー定義の解析に失敗しました: {error}"))
    }
    _ => Err("PostgreSQL 接続プールの取得に失敗しました".to_string()),
  }
}

async fn fetch_postgres_routine_definition(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  routine: &DbRoutineSchema,
  signature: &str,
) -> Result<String, String> {
  let pool = get_or_create_pool(pool_registry, config).await?;

  match pool.as_ref() {
    AnyPool::Postgres(pg_pool) => {
      let rows = sqlx::query(POSTGRES_ROUTINE_DEFINITION_SQL)
        .bind(schema_name)
        .bind(&routine.name)
        .bind(signature)
        .fetch_all(pg_pool)
        .await
        .map_err(|error| format!("PostgreSQL ルーチン定義取得失敗: {error}"))?;

      let expected_kind = match routine.kind {
        DbRoutineKind::Function => "function",
        DbRoutineKind::Procedure => "procedure",
      };

      for row in rows {
        let routine_kind: String = row.try_get("routine_kind").unwrap_or_default();
        if routine_kind.eq_ignore_ascii_case(expected_kind) {
          return row
            .try_get::<String, _>("definition")
            .map_err(|error| format!("PostgreSQL ルーチン定義の解析に失敗しました: {error}"));
        }
      }

      Err(format!(
        "PostgreSQL ルーチン定義が見つかりません: {}({})",
        routine.name, signature
      ))
    }
    _ => Err("PostgreSQL 接続プールの取得に失敗しました".to_string()),
  }
}

async fn fetch_postgres_trigger_definition(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  table_name: &str,
  trigger_name: &str,
) -> Result<String, String> {
  let pool = get_or_create_pool(pool_registry, config).await?;

  match pool.as_ref() {
    AnyPool::Postgres(pg_pool) => {
      let row = sqlx::query(POSTGRES_TRIGGER_DEFINITION_SQL)
        .bind(schema_name)
        .bind(table_name)
        .bind(trigger_name)
        .fetch_one(pg_pool)
        .await
        .map_err(|error| format!("PostgreSQL トリガー定義取得失敗: {error}"))?;

      let definition = row
        .try_get::<String, _>("definition")
        .map_err(|error| format!("PostgreSQL トリガー定義の解析に失敗しました: {error}"))?;

      Ok(format!("{};", definition.trim().trim_end_matches(';')))
    }
    _ => Err("PostgreSQL 接続プールの取得に失敗しました".to_string()),
  }
}

async fn fetch_postgres_sequence_ddl(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  sequence: &DbSequenceSchema,
) -> Result<String, String> {
  let pool = get_or_create_pool(pool_registry, config).await?;

  match pool.as_ref() {
    AnyPool::Postgres(pg_pool) => {
      let row = sqlx::query(POSTGRES_SEQUENCE_METADATA_SQL)
        .bind(schema_name)
        .bind(&sequence.name)
        .fetch_one(pg_pool)
        .await
        .map_err(|error| format!("PostgreSQL シーケンス定義取得失敗: {error}"))?;

      let qualified_sequence = qualify_postgres_identifier(schema_name, &sequence.name);
      let start_value: i64 = row.try_get("start_value").unwrap_or(1);
      let increment_by: i64 = row.try_get("increment_by").unwrap_or(1);
      let min_value: i64 = row.try_get("min_value").unwrap_or(1);
      let max_value: i64 = row.try_get("max_value").unwrap_or(i64::MAX);
      let cache_size: i64 = row.try_get("cache_size").unwrap_or(1);
      let is_cycled: bool = row.try_get("is_cycled").unwrap_or(false);

      let mut ddl = format!(
        "CREATE SEQUENCE {}\n  INCREMENT BY {}\n  MINVALUE {}\n  MAXVALUE {}\n  START WITH {}\n  CACHE {}\n  {};",
        qualified_sequence,
        increment_by,
        min_value,
        max_value,
        start_value,
        cache_size,
        if is_cycled { "CYCLE" } else { "NO CYCLE" },
      );

      if let Some(comment) = &sequence.comment {
        ddl.push_str(&format!(
          "\n\nCOMMENT ON SEQUENCE {} IS '{}';",
          qualified_sequence,
          escape_sql_literal(comment),
        ));
      }

      Ok(ddl)
    }
    _ => Err("PostgreSQL 接続プールの取得に失敗しました".to_string()),
  }
}

async fn fetch_postgres_formatted_column_types(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  table_name: &str,
) -> Result<HashMap<String, String>, String> {
  let pool = get_or_create_pool(pool_registry, config).await?;

  match pool.as_ref() {
    AnyPool::Postgres(pg_pool) => {
      let rows = sqlx::query(POSTGRES_FORMATTED_COLUMN_TYPES_SQL)
        .bind(schema_name)
        .bind(table_name)
        .fetch_all(pg_pool)
        .await
        .map_err(|error| format!("PostgreSQL 列型取得失敗: {error}"))?;

      let mut formatted_types = HashMap::new();
      for row in rows {
        let column_name: String = row.try_get("column_name").unwrap_or_default();
        let formatted_type: String = row
          .try_get("formatted_type")
          .unwrap_or_else(|_| "text".to_string());
        formatted_types.insert(column_name, formatted_type);
      }
      Ok(formatted_types)
    }
    _ => Err("PostgreSQL 接続プールの取得に失敗しました".to_string()),
  }
}

async fn render_postgres_table_ddl(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  schema_name: &str,
  table: &DbTableSchema,
) -> Result<String, String> {
  let formatted_types =
    fetch_postgres_formatted_column_types(pool_registry, config, schema_name, &table.name).await?;
  Ok(build_postgres_table_ddl(schema_name, table, &formatted_types))
}

fn build_postgres_table_ddl(
  schema_name: &str,
  table: &DbTableSchema,
  formatted_types: &HashMap<String, String>,
) -> String {
  let qualified_table = qualify_postgres_identifier(schema_name, &table.name);
  let mut column_lines: Vec<String> = table
    .columns
    .iter()
    .map(|column| build_postgres_column_line(column, formatted_types))
    .collect();

  let primary_key_columns: Vec<String> = table
    .columns
    .iter()
    .filter(|column| column.primary_key)
    .map(|column| quote_postgres_identifier(&column.name))
    .collect();

  if !primary_key_columns.is_empty() {
    column_lines.push(format!("  PRIMARY KEY ({})", primary_key_columns.join(", ")));
  }

  let mut ddl_sections = vec![format!(
    "CREATE TABLE {} (\n{}\n);",
    qualified_table,
    column_lines.join(",\n"),
  )];

  let secondary_indexes: Vec<&DbIndexSchema> = table.indexes.iter().filter(|index| !index.primary).collect();
  if !secondary_indexes.is_empty() {
    ddl_sections.extend(secondary_indexes.into_iter().map(|index| {
      let unique_sql = if index.unique { "UNIQUE " } else { "" };
      let columns_sql = index
        .columns
        .iter()
        .map(|column| quote_postgres_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
      format!(
        "CREATE {}INDEX {} ON {} ({});",
        unique_sql,
        quote_postgres_identifier(&index.name),
        qualified_table,
        columns_sql,
      )
    }));
  }

  if !table.foreign_keys.is_empty() {
    ddl_sections.extend(table.foreign_keys.iter().map(|foreign_key| {
      let columns_sql = foreign_key
        .columns
        .iter()
        .map(|column| quote_postgres_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
      let referenced_columns_sql = foreign_key
        .referenced_columns
        .iter()
        .map(|column| quote_postgres_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
      format!(
        "ALTER TABLE {} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({});",
        qualified_table,
        quote_postgres_identifier(&foreign_key.name),
        columns_sql,
        qualify_postgres_identifier(schema_name, &foreign_key.referenced_table),
        referenced_columns_sql,
      )
    }));
  }

  if let Some(comment) = &table.comment {
    ddl_sections.push(format!(
      "COMMENT ON TABLE {} IS '{}';",
      qualified_table,
      escape_sql_literal(comment),
    ));
  }

  ddl_sections.extend(
    table
      .columns
      .iter()
      .filter_map(|column| {
        column.comment.as_ref().map(|comment| {
          format!(
            "COMMENT ON COLUMN {}.{} IS '{}';",
            qualified_table,
            quote_postgres_identifier(&column.name),
            escape_sql_literal(comment),
          )
        })
      }),
  );

  ddl_sections.join("\n\n")
}

fn build_postgres_column_line(
  column: &DbColumnSchema,
  formatted_types: &HashMap<String, String>,
) -> String {
  let data_type = formatted_types
    .get(&column.name)
    .cloned()
    .unwrap_or_else(|| column.data_type.clone());

  let mut line = format!("  {} {}", quote_postgres_identifier(&column.name), data_type);
  if let Some(default_value) = &column.default_value {
    line.push_str(&format!(" DEFAULT {default_value}"));
  }
  if !column.nullable {
    line.push_str(" NOT NULL");
  }
  line
}

fn build_index_ddl(
  driver: &DbDriver,
  schema_name: &str,
  table_name: &str,
  index: &DbIndexSchema,
) -> String {
  let qualified_table = match driver {
    DbDriver::Mysql => qualify_mysql_identifier(schema_name, table_name),
    DbDriver::Postgres => qualify_postgres_identifier(schema_name, table_name),
  };
  let columns_sql = join_quoted_columns(driver, &index.columns);

  match driver {
    DbDriver::Mysql => {
      if index.primary {
        format!("ALTER TABLE {} ADD PRIMARY KEY ({});", qualified_table, columns_sql)
      } else if index.unique {
        format!(
          "ALTER TABLE {} ADD UNIQUE INDEX {} ({});",
          qualified_table,
          quote_identifier(driver, &index.name),
          columns_sql,
        )
      } else {
        format!(
          "ALTER TABLE {} ADD INDEX {} ({});",
          qualified_table,
          quote_identifier(driver, &index.name),
          columns_sql,
        )
      }
    }
    DbDriver::Postgres => {
      if index.primary {
        format!(
          "ALTER TABLE {} ADD CONSTRAINT {} PRIMARY KEY ({});",
          qualified_table,
          quote_identifier(driver, &index.name),
          columns_sql,
        )
      } else {
        let unique_sql = if index.unique { "UNIQUE " } else { "" };
        format!(
          "CREATE {}INDEX {} ON {} ({});",
          unique_sql,
          quote_identifier(driver, &index.name),
          qualified_table,
          columns_sql,
        )
      }
    }
  }
}

fn build_foreign_key_ddl(
  driver: &DbDriver,
  schema_name: &str,
  table_name: &str,
  foreign_key: &DbForeignKeySchema,
) -> String {
  let qualified_table = match driver {
    DbDriver::Mysql => qualify_mysql_identifier(schema_name, table_name),
    DbDriver::Postgres => qualify_postgres_identifier(schema_name, table_name),
  };
  let qualified_referenced_table = match driver {
    DbDriver::Mysql => qualify_mysql_identifier(schema_name, &foreign_key.referenced_table),
    DbDriver::Postgres => qualify_postgres_identifier(schema_name, &foreign_key.referenced_table),
  };
  let columns_sql = join_quoted_columns(driver, &foreign_key.columns);
  let referenced_columns_sql = join_quoted_columns(driver, &foreign_key.referenced_columns);

  format!(
    "ALTER TABLE {} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({});",
    qualified_table,
    quote_identifier(driver, &foreign_key.name),
    columns_sql,
    qualified_referenced_table,
    referenced_columns_sql,
  )
}

fn filter_table_columns(table: &DbTableSchema, column_names: &[String]) -> Vec<DbColumnSchema> {
  table
    .columns
    .iter()
    .filter(|column| column_names.iter().any(|name| name == &column.name))
    .cloned()
    .collect()
}

fn expected_routine_kind(object_kind: &DbObjectKind) -> Option<DbRoutineKind> {
  match object_kind {
    DbObjectKind::Function => Some(DbRoutineKind::Function),
    DbObjectKind::Procedure => Some(DbRoutineKind::Procedure),
    _ => None,
  }
}

fn routine_matches(
  routine: &DbRoutineSchema,
  expected_kind: &DbRoutineKind,
  routine_name: &str,
  requested_signature: Option<&str>,
) -> bool {
  routine.kind == *expected_kind
    && routine.name == routine_name
    && routine_signature_matches(routine.signature.as_deref(), requested_signature)
}

fn routine_signature_matches(candidate: Option<&str>, requested: Option<&str>) -> bool {
  let normalized_candidate = candidate.map(str::trim).unwrap_or("");
  let normalized_requested = requested.map(str::trim).unwrap_or("");
  normalized_candidate == normalized_requested
}

fn parse_routine_name(object_name: &str) -> &str {
  split_routine_object_name(object_name)
    .map(|(name, _)| name)
    .unwrap_or_else(|| object_name.trim())
}

fn parse_routine_signature(object_name: &str) -> Option<&str> {
  split_routine_object_name(object_name).map(|(_, signature)| signature)
}

fn split_routine_object_name(object_name: &str) -> Option<(&str, &str)> {
  let trimmed = object_name.trim();
  if !trimmed.ends_with(')') {
    return None;
  }

  let open_index = trimmed.rfind('(')?;
  let name = trimmed[..open_index].trim();
  if name.is_empty() {
    return None;
  }

  let signature = trimmed[open_index + 1..trimmed.len() - 1].trim();
  Some((name, signature))
}

fn build_routine_display_name(schema_name: &str, routine_name: &str, signature: Option<&str>) -> String {
  match signature {
    Some(signature) => format!("{schema_name}.{routine_name}({signature})"),
    None => format!("{schema_name}.{routine_name}"),
  }
}

fn active_schema_name(config: &DbConnectionConfig) -> String {
  match config.driver {
    DbDriver::Mysql => config.database.clone(),
    DbDriver::Postgres => resolve_postgres_schema(config.default_schema.as_deref()),
  }
}

fn qualify_mysql_identifier(schema_name: &str, object_name: &str) -> String {
  format!(
    "{}.{}",
    quote_mysql_identifier(schema_name),
    quote_mysql_identifier(object_name),
  )
}

fn qualify_postgres_identifier(schema_name: &str, object_name: &str) -> String {
  format!(
    "{}.{}",
    quote_postgres_identifier(schema_name),
    quote_postgres_identifier(object_name),
  )
}

fn quote_mysql_identifier(identifier: &str) -> String {
  format!("`{}`", identifier.replace('`', "``"))
}

fn quote_postgres_identifier(identifier: &str) -> String {
  format!("\"{}\"", identifier.replace('"', "\"\""))
}

fn quote_identifier(driver: &DbDriver, identifier: &str) -> String {
  match driver {
    DbDriver::Mysql => quote_mysql_identifier(identifier),
    DbDriver::Postgres => quote_postgres_identifier(identifier),
  }
}

fn join_quoted_columns(driver: &DbDriver, columns: &[String]) -> String {
  columns
    .iter()
    .map(|column| quote_identifier(driver, column))
    .collect::<Vec<_>>()
    .join(", ")
}

fn escape_sql_literal(value: &str) -> String {
  value.replace('\'', "''")
}

fn normalized_optional(value: &Option<String>) -> Option<&str> {
  value
    .as_deref()
    .map(str::trim)
    .filter(|item| !item.is_empty())
}

fn coverage_notes() -> Vec<String> {
  COVERAGE_NOTES.iter().map(|item| (*item).to_string()).collect()
}
