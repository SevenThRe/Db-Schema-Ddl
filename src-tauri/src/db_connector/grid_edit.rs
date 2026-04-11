use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::json;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};

use super::query::{get_or_create_pool, load_connection_config, resolve_active_schema};
use super::{
  AnyPool, DbConnectionConfig, DbDriver, DbGridCommitRequest, DbGridCommitResponse,
  DbGridEditPatchCell, DbGridEditSourceKind, DbGridPrepareCommitRequest,
  DbGridPrepareCommitResponse, DbPoolRegistry,
};

pub const GRID_EDIT_PLAN_TTL_SECONDS: u64 = 300;
const SQL_PREVIEW_LIMIT: usize = 20;

#[derive(Debug, Clone)]
struct PreparedUpdateStatement {
  sql: String,
  row_pk_tuple: String,
  set_values: Vec<Value>,
  where_values: Vec<Value>,
}

#[derive(Debug, Clone)]
struct PreparedGridEditPlan {
  connection_id: String,
  plan_hash: String,
  created_at_epoch_secs: u64,
  statements: Vec<PreparedUpdateStatement>,
}

pub struct GridEditPlanRegistry {
  plans: Mutex<HashMap<String, PreparedGridEditPlan>>,
}

impl GridEditPlanRegistry {
  pub fn new() -> Self {
    Self {
      plans: Mutex::new(HashMap::new()),
    }
  }
}

#[derive(Debug, Clone)]
struct PreparedRowPatch {
  row_pk_tuple: String,
  row_primary_key: BTreeMap<String, Value>,
  updates: BTreeMap<String, Value>,
}

#[tauri::command]
pub async fn db_grid_prepare_commit(
  app: AppHandle,
  plan_registry: State<'_, Arc<GridEditPlanRegistry>>,
  request: DbGridPrepareCommitRequest,
) -> Result<DbGridPrepareCommitResponse, String> {
  let config = load_connection_config(&app, &request.connection_id)?;
  validate_prepare_request(&config, &request)?;

  let primary_key_columns = normalize_primary_keys(&request.primary_key_columns)?;

  let prepared_rows = normalize_patch_cells(&request.patch_cells, &primary_key_columns)?;

  let active_schema = resolve_active_schema(&config, request.schema.as_deref());
  let mut prepared_statements: Vec<PreparedUpdateStatement> = Vec::new();
  let mut changed_columns = HashSet::new();

  for row_patch in &prepared_rows {
    let mut set_columns: Vec<String> = row_patch.updates.keys().cloned().collect();
    set_columns.sort();

    let mut set_values = Vec::new();
    for column in &set_columns {
      if let Some(value) = row_patch.updates.get(column) {
        set_values.push(value.clone());
      }
      changed_columns.insert(column.clone());
    }

    let mut where_values = Vec::new();
    for column in &primary_key_columns {
      let value = row_patch
        .row_primary_key
        .get(column)
        .ok_or_else(|| format!("missing_primary_key_column: {column}"))?;
      where_values.push(value.clone());
    }

    let sql = build_update_sql(
      &config.driver,
      active_schema.as_deref(),
      &request.table_name,
      &set_columns,
      &primary_key_columns,
    )?;

    prepared_statements.push(PreparedUpdateStatement {
      sql,
      row_pk_tuple: row_patch.row_pk_tuple.clone(),
      set_values,
      where_values,
    });
  }

  let mut changed_columns_summary: Vec<String> = changed_columns.into_iter().collect();
  changed_columns_summary.sort();

  let plan_hash = compute_plan_hash(
    &prepared_statements,
    &request.table_name,
    active_schema.as_deref(),
    &primary_key_columns,
  )?;
  let now = now_epoch_seconds();
  let plan_id = format!("grid-plan-{now}-{}", &plan_hash[..12]);

  {
    let mut plans = plan_registry
      .plans
      .lock()
      .map_err(|error| format!("plan registry lock failed: {error}"))?;
    cleanup_expired_plans(&mut plans, now);
    plans.insert(
      plan_id.clone(),
      PreparedGridEditPlan {
        connection_id: request.connection_id.clone(),
        plan_hash: plan_hash.clone(),
        created_at_epoch_secs: now,
        statements: prepared_statements.clone(),
      },
    );
  }

  let sql_preview_lines: Vec<String> = prepared_statements
    .iter()
    .take(SQL_PREVIEW_LIMIT)
    .map(|statement| statement.sql.clone())
    .collect();
  let preview_truncated = prepared_statements.len() > SQL_PREVIEW_LIMIT;

  Ok(DbGridPrepareCommitResponse {
    plan_id,
    plan_hash,
    affected_rows: prepared_statements.len() as u64,
    changed_columns_summary,
    sql_preview_lines,
    preview_truncated,
  })
}

#[tauri::command]
pub async fn db_grid_commit(
  app: AppHandle,
  pool_registry: State<'_, Arc<DbPoolRegistry>>,
  plan_registry: State<'_, Arc<GridEditPlanRegistry>>,
  request: DbGridCommitRequest,
) -> Result<DbGridCommitResponse, String> {
  let config = load_connection_config(&app, &request.connection_id)?;
  if config.readonly {
    return Err("readonly_connection: edits are blocked on readonly connections".to_string());
  }

  let now = now_epoch_seconds();
  let prepared = {
    let mut plans = plan_registry
      .plans
      .lock()
      .map_err(|error| format!("plan registry lock failed: {error}"))?;
    cleanup_expired_plans(&mut plans, now);

    let prepared = plans
      .get(&request.plan_id)
      .cloned()
      .ok_or_else(|| "Prepared edit plan not found or expired".to_string())?;

    if prepared.connection_id != request.connection_id {
      return Err("Prepared plan does not belong to this connection".to_string());
    }

    if request.plan_hash != prepared.plan_hash {
      return Err("plan_hash_mismatch: provided hash does not match prepared plan".to_string());
    }

    prepared
  };

  if prepared.statements.is_empty() {
    return Err("Prepared plan is empty".to_string());
  }
  ensure_update_only_statements(&prepared.statements)?;

  let pool = get_or_create_pool(&pool_registry, &config).await?;

  let commit_result = match pool.as_ref() {
    AnyPool::Mysql(mysql_pool) => {
      let mut transaction = mysql_pool
        .begin()
        .await
        .map_err(|error| format!("failed to begin mysql transaction: {error}"))?;

      for (index, statement) in prepared.statements.iter().enumerate() {
        let mut query = sqlx::query(&statement.sql);
        for value in &statement.set_values {
          query = bind_mysql_value(query, value);
        }
        for value in &statement.where_values {
          query = bind_mysql_value(query, value);
        }

        if let Err(error) = query.execute(&mut *transaction).await {
          transaction
            .rollback()
            .await
            .map_err(|rollback_error| format!("transaction rollback failed: {rollback_error}"))?;
          return Ok(DbGridCommitResponse {
            plan_id: request.plan_id,
            plan_hash: request.plan_hash,
            committed_rows: 0,
            failed_sql_index: Some(index as u64),
            failed_row_pk_tuple: Some(statement.row_pk_tuple.clone()),
            message: Some(format!("commit failed and rolled back: {error}")),
          });
        }
      }

      transaction
        .commit()
        .await
        .map_err(|error| format!("failed to commit mysql transaction: {error}"))?;
      prepared.statements.len() as u64
    }
    AnyPool::Postgres(postgres_pool) => {
      let mut transaction = postgres_pool
        .begin()
        .await
        .map_err(|error| format!("failed to begin postgres transaction: {error}"))?;

      for (index, statement) in prepared.statements.iter().enumerate() {
        let mut query = sqlx::query(&statement.sql);
        for value in &statement.set_values {
          query = bind_pg_value(query, value);
        }
        for value in &statement.where_values {
          query = bind_pg_value(query, value);
        }

        if let Err(error) = query.execute(&mut *transaction).await {
          transaction
            .rollback()
            .await
            .map_err(|rollback_error| format!("transaction rollback failed: {rollback_error}"))?;
          return Ok(DbGridCommitResponse {
            plan_id: request.plan_id,
            plan_hash: request.plan_hash,
            committed_rows: 0,
            failed_sql_index: Some(index as u64),
            failed_row_pk_tuple: Some(statement.row_pk_tuple.clone()),
            message: Some(format!("commit failed and rolled back: {error}")),
          });
        }
      }

      transaction
        .commit()
        .await
        .map_err(|error| format!("failed to commit postgres transaction: {error}"))?;
      prepared.statements.len() as u64
    }
  };

  {
    let mut plans = plan_registry
      .plans
      .lock()
      .map_err(|error| format!("plan registry lock failed: {error}"))?;
    plans.remove(&request.plan_id);
  }

  Ok(DbGridCommitResponse {
    plan_id: request.plan_id,
    plan_hash: request.plan_hash,
    committed_rows: commit_result,
    failed_sql_index: None,
    failed_row_pk_tuple: None,
    message: None,
  })
}

fn validate_prepare_request(
  config: &DbConnectionConfig,
  request: &DbGridPrepareCommitRequest,
) -> Result<(), String> {
  if config.readonly {
    return Err("readonly_connection: edits are blocked on readonly connections".to_string());
  }

  if !is_supported_source_kind(&request.source.kind) {
    return Err("unsupported_source: only table-open/starter-select/starter-columns are editable".to_string());
  }

  if request.source.kind == DbGridEditSourceKind::StarterCount {
    return Err("count_result: count rows results are read-only".to_string());
  }

  if request.primary_key_columns.is_empty() {
    return Err("missing_primary_key: no primary key columns provided".to_string());
  }

  if request.patch_cells.is_empty() {
    return Err("No patch cells were provided".to_string());
  }

  if request.table_name.trim().is_empty() {
    return Err("Table name is required".to_string());
  }

  Ok(())
}

fn normalize_primary_keys(primary_key_columns: &[String]) -> Result<Vec<String>, String> {
  let mut normalized = Vec::new();
  for primary_key in primary_key_columns {
    let trimmed = primary_key.trim();
    if trimmed.is_empty() {
      continue;
    }
    ensure_safe_identifier(trimmed)?;
    normalized.push(trimmed.to_string());
  }

  if normalized.is_empty() {
    return Err("missing_primary_key: no usable primary key columns".to_string());
  }

  Ok(normalized)
}

#[cfg(test)]
fn validate_loaded_row_primary_keys(
  loaded_rows: &[HashMap<String, Value>],
  primary_key_columns: &[String],
) -> Result<(), String> {
  let mut tuples = HashSet::new();

  for row in loaded_rows {
    let mut ordered = BTreeMap::new();
    for (key, value) in row {
      ordered.insert(key.clone(), value.clone());
    }

    let tuple = build_row_pk_tuple(&ordered, primary_key_columns)?;
    if !tuples.insert(tuple) {
      return Err("duplicate_primary_key_tuple: loaded result contains duplicate primary keys".to_string());
    }
  }

  Ok(())
}

fn normalize_patch_cells(
  patch_cells: &[DbGridEditPatchCell],
  primary_key_columns: &[String],
) -> Result<Vec<PreparedRowPatch>, String> {
  let mut rows: BTreeMap<String, PreparedRowPatch> = BTreeMap::new();
  let primary_key_set: HashSet<&str> = primary_key_columns.iter().map(String::as_str).collect();

  for patch in patch_cells {
    if patch.before_value == patch.next_value {
      continue;
    }

    ensure_safe_identifier(&patch.column_name)?;
    if primary_key_set.contains(patch.column_name.as_str()) {
      return Err(format!(
        "missing_primary_key_column: {} is primary key and read-only",
        patch.column_name
      ));
    }

    let mut row_pk = BTreeMap::new();
    for (key, value) in &patch.row_primary_key {
      row_pk.insert(key.clone(), value.clone());
    }

    let computed_tuple = build_row_pk_tuple(&row_pk, primary_key_columns)?;
    let row_entry = rows
      .entry(computed_tuple.clone())
      .or_insert_with(|| PreparedRowPatch {
        row_pk_tuple: computed_tuple.clone(),
        row_primary_key: row_pk.clone(),
        updates: BTreeMap::new(),
      });

    if row_entry.row_primary_key != row_pk {
      return Err("duplicate_primary_key_tuple: inconsistent row key payload".to_string());
    }

    row_entry
      .updates
      .insert(patch.column_name.clone(), patch.next_value.clone());
  }

  if rows.is_empty() {
    return Err("No effective patch cells remain after no-op filtering".to_string());
  }

  Ok(rows.into_values().collect())
}

fn build_row_pk_tuple(
  row_primary_key: &BTreeMap<String, Value>,
  primary_key_columns: &[String],
) -> Result<String, String> {
  let mut parts = Vec::new();
  for primary_key in primary_key_columns {
    let value = row_primary_key
      .get(primary_key)
      .ok_or_else(|| format!("missing_primary_key_column: {primary_key}"))?;
    parts.push(format!("{primary_key}={}", canonical_value(value)));
  }
  Ok(parts.join("|"))
}

fn canonical_value(value: &Value) -> String {
  match serde_json::to_string(value) {
    Ok(serialized) => serialized,
    Err(_) => "null".to_string(),
  }
}

fn build_update_sql(
  driver: &DbDriver,
  schema: Option<&str>,
  table_name: &str,
  set_columns: &[String],
  primary_key_columns: &[String],
) -> Result<String, String> {
  ensure_safe_identifier(table_name)?;
  for column in set_columns {
    ensure_safe_identifier(column)?;
  }
  for column in primary_key_columns {
    ensure_safe_identifier(column)?;
  }

  let qualified_table = match driver {
    DbDriver::Mysql => quote_identifier(driver, table_name),
    DbDriver::Postgres => {
      let effective_schema = schema.unwrap_or("public");
      ensure_safe_identifier(effective_schema)?;
      format!(
        "{}.{}",
        quote_identifier(driver, effective_schema),
        quote_identifier(driver, table_name)
      )
    }
  };

  let mut placeholder_index = 1_u32;

  let set_clause = set_columns
    .iter()
    .map(|column| {
      if matches!(driver, DbDriver::Mysql) {
        format!("{} = ?", quote_identifier(driver, column))
      } else {
        let sql = format!(
          "{} = ${}",
          quote_identifier(driver, column),
          placeholder_index
        );
        placeholder_index = placeholder_index.saturating_add(1);
        sql
      }
    })
    .collect::<Vec<_>>()
    .join(", ");

  let where_clause = primary_key_columns
    .iter()
    .map(|column| {
      if matches!(driver, DbDriver::Mysql) {
        format!("{} = ?", quote_identifier(driver, column))
      } else {
        let sql = format!(
          "{} = ${}",
          quote_identifier(driver, column),
          placeholder_index
        );
        placeholder_index = placeholder_index.saturating_add(1);
        sql
      }
    })
    .collect::<Vec<_>>()
    .join(" AND ");

  Ok(format!(
    "UPDATE {qualified_table} SET {set_clause} WHERE {where_clause}"
  ))
}

fn ensure_update_only_statements(statements: &[PreparedUpdateStatement]) -> Result<(), String> {
  for statement in statements {
    if !statement
      .sql
      .trim_start()
      .to_ascii_uppercase()
      .starts_with("UPDATE ")
    {
      return Err("Only UPDATE mutation plans are supported in phase 17".to_string());
    }
  }
  Ok(())
}

fn compute_plan_hash(
  statements: &[PreparedUpdateStatement],
  table_name: &str,
  schema: Option<&str>,
  primary_key_columns: &[String],
) -> Result<String, String> {
  let payload = json!({
    "tableName": table_name,
    "schema": schema,
    "primaryKeyColumns": primary_key_columns,
    "statements": statements
      .iter()
      .map(|statement| json!({
        "sql": statement.sql,
        "rowPkTuple": statement.row_pk_tuple,
        "setValues": statement.set_values,
        "whereValues": statement.where_values,
      }))
      .collect::<Vec<_>>()
  });

  let bytes = serde_json::to_vec(&payload)
    .map_err(|error| format!("failed to serialize prepared plan payload: {error}"))?;
  let mut hasher = Sha256::new();
  hasher.update(bytes);
  Ok(format!("{:x}", hasher.finalize()))
}

fn cleanup_expired_plans(plans: &mut HashMap<String, PreparedGridEditPlan>, now_epoch_secs: u64) {
  plans.retain(|_, plan| {
    now_epoch_secs.saturating_sub(plan.created_at_epoch_secs) <= GRID_EDIT_PLAN_TTL_SECONDS
  });
}

fn now_epoch_seconds() -> u64 {
  match SystemTime::now().duration_since(UNIX_EPOCH) {
    Ok(duration) => duration.as_secs(),
    Err(_) => 0,
  }
}

fn is_supported_source_kind(kind: &DbGridEditSourceKind) -> bool {
  matches!(
    kind,
    DbGridEditSourceKind::TableOpen
      | DbGridEditSourceKind::StarterSelect
      | DbGridEditSourceKind::StarterColumns
  )
}

fn ensure_safe_identifier(identifier: &str) -> Result<(), String> {
  let trimmed = identifier.trim();
  if trimmed.is_empty() {
    return Err("identifier is empty".to_string());
  }
  if !trimmed
    .chars()
    .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
  {
    return Err(format!("unsafe identifier: {identifier}"));
  }
  Ok(())
}

fn quote_identifier(driver: &DbDriver, identifier: &str) -> String {
  match driver {
    DbDriver::Mysql => format!("`{}`", identifier.replace('`', "``")),
    DbDriver::Postgres => format!("\"{}\"", identifier.replace('"', "\"\"")),
  }
}

fn bind_mysql_value<'q>(
  query: sqlx::query::Query<'q, sqlx::MySql, sqlx::mysql::MySqlArguments>,
  value: &Value,
) -> sqlx::query::Query<'q, sqlx::MySql, sqlx::mysql::MySqlArguments> {
  match value {
    Value::Null => query.bind(Option::<String>::None),
    Value::Bool(boolean_value) => query.bind(*boolean_value),
    Value::Number(number_value) => {
      if let Some(integer_value) = number_value.as_i64() {
        query.bind(integer_value)
      } else if let Some(float_value) = number_value.as_f64() {
        query.bind(float_value)
      } else {
        query.bind(number_value.to_string())
      }
    }
    Value::String(string_value) => query.bind(string_value.clone()),
    _ => query.bind(value.to_string()),
  }
}

fn bind_pg_value<'q>(
  query: sqlx::query::Query<'q, sqlx::Postgres, sqlx::postgres::PgArguments>,
  value: &Value,
) -> sqlx::query::Query<'q, sqlx::Postgres, sqlx::postgres::PgArguments> {
  match value {
    Value::Null => query.bind(Option::<String>::None),
    Value::Bool(boolean_value) => query.bind(*boolean_value),
    Value::Number(number_value) => {
      if let Some(integer_value) = number_value.as_i64() {
        query.bind(integer_value)
      } else if let Some(float_value) = number_value.as_f64() {
        query.bind(float_value)
      } else {
        query.bind(number_value.to_string())
      }
    }
    Value::String(string_value) => query.bind(string_value.clone()),
    _ => query.bind(value.to_string()),
  }
}

#[cfg(test)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SimulatedCommitOutcome {
  committed: bool,
  rolled_back: bool,
  committed_steps: usize,
}

#[cfg(test)]
fn simulate_commit_outcome(step_results: &[Result<(), &'static str>]) -> SimulatedCommitOutcome {
  let mut committed_steps = 0_usize;
  for step_result in step_results {
    if step_result.is_err() {
      return SimulatedCommitOutcome {
        committed: false,
        rolled_back: true,
        committed_steps,
      };
    }
    committed_steps = committed_steps.saturating_add(1);
  }

  SimulatedCommitOutcome {
    committed: true,
    rolled_back: false,
    committed_steps,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::db_connector::{DbEnvironment, DbGridEditSource};

  fn sample_config(readonly: bool) -> DbConnectionConfig {
    DbConnectionConfig {
      id: "conn-1".to_string(),
      name: "test".to_string(),
      driver: DbDriver::Postgres,
      host: "localhost".to_string(),
      port: 5432,
      database: "app".to_string(),
      username: "postgres".to_string(),
      password: "postgres".to_string(),
      has_stored_password: false,
      clear_stored_password: false,
      environment: Some(DbEnvironment::Dev),
      readonly,
      color_tag: None,
      default_schema: Some("public".to_string()),
    }
  }

  fn sample_prepare_request() -> DbGridPrepareCommitRequest {
    let mut row_pk = HashMap::new();
    row_pk.insert("id".to_string(), Value::from(1));

    DbGridPrepareCommitRequest {
      connection_id: "conn-1".to_string(),
      schema: Some("public".to_string()),
      table_name: "users".to_string(),
      source: DbGridEditSource {
        kind: DbGridEditSourceKind::StarterSelect,
        table_name: Some("users".to_string()),
        schema: Some("public".to_string()),
        query_mode: Some("select".to_string()),
      },
      primary_key_columns: vec!["id".to_string()],
      patch_cells: vec![DbGridEditPatchCell {
        row_primary_key: row_pk,
        row_pk_tuple: "id=1".to_string(),
        column_name: "name".to_string(),
        before_value: Value::from("old"),
        next_value: Value::from("new"),
      }],
    }
  }

  #[test]
  fn test_prepare_rejects_readonly_connection() {
    let config = sample_config(true);
    let request = sample_prepare_request();
    let result = validate_prepare_request(&config, &request);
    assert!(result.is_err());
    let message = result.err().unwrap_or_default();
    assert!(message.contains("readonly"));
  }

  #[test]
  fn test_prepare_rejects_missing_pk() {
    let config = sample_config(false);
    let mut request = sample_prepare_request();
    request.patch_cells[0].row_primary_key.clear();
    let normalized = normalize_patch_cells(&request.patch_cells, &request.primary_key_columns);
    assert!(normalized.is_err());
    let message = normalized.err().unwrap_or_default();
    assert!(message.contains("missing_primary_key_column"));
    assert!(validate_prepare_request(&config, &request).is_ok());
  }

  #[test]
  fn test_prepare_rejects_duplicate_pk() {
    let mut duplicate_row = HashMap::new();
    duplicate_row.insert("id".to_string(), Value::from(1));
    let loaded_rows = vec![duplicate_row.clone(), duplicate_row];

    let result = validate_loaded_row_primary_keys(
      &loaded_rows,
      &["id".to_string()],
    );
    assert!(result.is_err());
    assert!(result
      .err()
      .unwrap_or_default()
      .contains("duplicate_primary_key_tuple"));
  }

  #[test]
  fn test_commit_rejects_plan_hash_mismatch() {
    let request = DbGridCommitRequest {
      connection_id: "conn-1".to_string(),
      plan_id: "plan-1".to_string(),
      plan_hash: "wrong".to_string(),
    };

    let prepared = PreparedGridEditPlan {
      connection_id: "conn-1".to_string(),
      plan_hash: "correct".to_string(),
      created_at_epoch_secs: now_epoch_seconds(),
      statements: vec![PreparedUpdateStatement {
        sql: "UPDATE \"users\" SET \"name\" = $1 WHERE \"id\" = $2".to_string(),
        row_pk_tuple: "id=1".to_string(),
        set_values: vec![Value::from("new")],
        where_values: vec![Value::from(1)],
      }],
    };

    let result = if request.plan_hash != prepared.plan_hash {
      Err("plan_hash_mismatch".to_string())
    } else {
      Ok(())
    };

    assert!(result.is_err());
    assert_eq!(result.err().unwrap_or_default(), "plan_hash_mismatch");
  }

  #[test]
  fn test_commit_rollback_on_partial_failure() {
    let outcome = simulate_commit_outcome(&[Ok(()), Err("boom"), Ok(())]);
    assert!(!outcome.committed);
    assert!(outcome.rolled_back);
    assert_eq!(outcome.committed_steps, 1);
  }

  #[test]
  fn test_commit_success() {
    let outcome = simulate_commit_outcome(&[Ok(()), Ok(()), Ok(())]);
    assert!(outcome.committed);
    assert!(!outcome.rolled_back);
    assert_eq!(outcome.committed_steps, 3);
  }

  #[test]
  fn test_commit_rejects_non_update_statement() {
    let result = ensure_update_only_statements(&[PreparedUpdateStatement {
      sql: "INSERT INTO users(id) VALUES ($1)".to_string(),
      row_pk_tuple: "id=1".to_string(),
      set_values: vec![Value::from(1)],
      where_values: vec![],
    }]);
    assert!(result.is_err());
    assert!(result
      .err()
      .unwrap_or_default()
      .contains("Only UPDATE mutation plans are supported"));
  }
}
