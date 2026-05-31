use std::collections::{BTreeMap, HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{DateTime, Duration, Utc};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{Column, Row};
use tauri::AppHandle;

use super::introspect::introspect_schema;
use super::query::{get_or_create_pool, load_connection_config, resolve_active_schema, split_sql_statements};
use super::{
  AnyPool, DbColumnSchema, DbConnectionConfig, DbDataDiffActionCounts, DbDataDiffDetailRequest,
  DbDataDiffDetailResponse, DbDataDiffFieldDelta, DbDataDiffPreviewRequest,
  DbDataDiffPreviewResponse, DbDataDiffRowDelta, DbDataDiffTableRequest,
  DbDataDiffTableSummary, DbDataRowStatus, DbDataSyncAction, DbDataSyncBlocker,
  DbDataSyncBlockerCode, DbPoolRegistry, DbSchemaSnapshot, DbTableSchema,
};
use crate::storage;

fn epoch_millis() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as i64)
    .unwrap_or(0)
}

fn validate_distinct_connection_pair(
  source_connection_id: &str,
  target_connection_id: &str,
) -> Result<(), String> {
  if source_connection_id.trim().is_empty() || target_connection_id.trim().is_empty() {
    return Err("source and target connections are required for data sync".to_string());
  }
  if source_connection_id == target_connection_id {
    return Err("source and target connections must be different for data sync".to_string());
  }
  Ok(())
}

fn empty_counts() -> DbDataDiffActionCounts {
  DbDataDiffActionCounts {
    insert: 0,
    update: 0,
    delete: 0,
    unchanged: 0,
  }
}

fn add_counts(left: &mut DbDataDiffActionCounts, right: &DbDataDiffActionCounts) {
  left.insert += right.insert;
  left.update += right.update;
  left.delete += right.delete;
  left.unchanged += right.unchanged;
}

pub fn resolve_stable_keys(
  primary_key_columns: &[String],
  unique_key_columns: &[String],
  business_key_columns: Option<&Vec<String>>,
) -> Vec<String> {
  if !primary_key_columns.is_empty() {
    return primary_key_columns.to_vec();
  }
  if !unique_key_columns.is_empty() {
    return unique_key_columns.to_vec();
  }
  business_key_columns.cloned().unwrap_or_default()
}

fn normalize_identifier_list(values: &[String]) -> Vec<String> {
  let mut seen = HashSet::new();
  let mut normalized = Vec::new();
  for value in values {
    let trimmed = value.trim();
    if trimmed.is_empty() {
      continue;
    }
    if seen.insert(trimmed.to_string()) {
      normalized.push(trimmed.to_string());
    }
  }
  normalized
}

fn build_key_tuple(row: &HashMap<String, Value>, key_columns: &[String]) -> Option<String> {
  if key_columns.is_empty() {
    return None;
  }

  let mut pieces = Vec::with_capacity(key_columns.len());
  for column in key_columns {
    let value = row.get(column)?;
    pieces.push(format!("{column}={}", value));
  }
  Some(pieces.join("|"))
}

fn build_row_key(
  key_columns: &[String],
  source_row: Option<&HashMap<String, Value>>,
  target_row: Option<&HashMap<String, Value>>,
) -> HashMap<String, Value> {
  let mut row_key = HashMap::new();
  for column_name in key_columns {
    let value = source_row
      .and_then(|row| row.get(column_name))
      .cloned()
      .or_else(|| target_row.and_then(|row| row.get(column_name)).cloned())
      .unwrap_or(Value::Null);
    row_key.insert(column_name.clone(), value);
  }
  row_key
}

fn compute_field_diffs(
  compare_columns: &[String],
  source_row: Option<&HashMap<String, Value>>,
  target_row: Option<&HashMap<String, Value>>,
) -> (Vec<DbDataDiffFieldDelta>, bool) {
  let mut changed_any = false;
  let mut field_diffs = Vec::with_capacity(compare_columns.len());

  for column_name in compare_columns {
    let source_value = source_row.and_then(|row| row.get(column_name)).cloned();
    let target_value = target_row.and_then(|row| row.get(column_name)).cloned();
    let changed = source_value != target_value;
    if changed {
      changed_any = true;
    }
    field_diffs.push(DbDataDiffFieldDelta {
      column_name: column_name.clone(),
      source_value,
      target_value,
      changed,
    });
  }

  (field_diffs, changed_any)
}

pub fn classify_table_rows(
  table_name: &str,
  key_columns: &[String],
  compare_columns: &[String],
  source_rows: &[HashMap<String, Value>],
  target_rows: &[HashMap<String, Value>],
) -> (DbDataDiffActionCounts, Vec<DbDataDiffRowDelta>) {
  let mut counts = empty_counts();
  let mut deltas = Vec::new();

  let mut source_by_key = HashMap::new();
  for row in source_rows {
    if let Some(tuple) = build_key_tuple(row, key_columns) {
      source_by_key.insert(tuple, row);
    }
  }

  let mut target_by_key = HashMap::new();
  for row in target_rows {
    if let Some(tuple) = build_key_tuple(row, key_columns) {
      target_by_key.insert(tuple, row);
    }
  }

  let mut all_keys = source_by_key
    .keys()
    .chain(target_by_key.keys())
    .cloned()
    .collect::<Vec<_>>();
  all_keys.sort();
  all_keys.dedup();

  for tuple in all_keys {
    let source_row = source_by_key.get(&tuple).copied();
    let target_row = target_by_key.get(&tuple).copied();
    let row_key = build_row_key(key_columns, source_row, target_row);

    match (source_row, target_row) {
      (Some(source), None) => {
        counts.insert += 1;
        deltas.push(DbDataDiffRowDelta {
          table_name: table_name.to_string(),
          row_key,
          status: DbDataRowStatus::SourceOnly,
          suggested_action: DbDataSyncAction::Insert,
          source_row: Some(source.clone()),
          target_row: None,
          field_diffs: vec![],
        });
      }
      (None, Some(target)) => {
        counts.delete += 1;
        deltas.push(DbDataDiffRowDelta {
          table_name: table_name.to_string(),
          row_key,
          status: DbDataRowStatus::TargetOnly,
          suggested_action: DbDataSyncAction::Delete,
          source_row: None,
          target_row: Some(target.clone()),
          field_diffs: vec![],
        });
      }
      (Some(source), Some(target)) => {
        let (field_diffs, changed_any) =
          compute_field_diffs(compare_columns, Some(source), Some(target));
        if changed_any {
          counts.update += 1;
          deltas.push(DbDataDiffRowDelta {
            table_name: table_name.to_string(),
            row_key,
            status: DbDataRowStatus::ValueChanged,
            suggested_action: DbDataSyncAction::Update,
            source_row: Some(source.clone()),
            target_row: Some(target.clone()),
            field_diffs,
          });
        } else {
          counts.unchanged += 1;
          deltas.push(DbDataDiffRowDelta {
            table_name: table_name.to_string(),
            row_key,
            status: DbDataRowStatus::Unchanged,
            suggested_action: DbDataSyncAction::Ignore,
            source_row: Some(source.clone()),
            target_row: Some(target.clone()),
            field_diffs,
          });
        }
      }
      _ => {}
    }
  }

  (counts, deltas)
}

pub fn compute_target_snapshot_hash(
  payload: &[(String, Vec<HashMap<String, Value>>)],
) -> Result<String, String> {
  let mut canonical = BTreeMap::<String, Vec<BTreeMap<String, String>>>::new();

  for (table_name, rows) in payload {
    let mut canonical_rows = Vec::with_capacity(rows.len());
    for row in rows {
      let mut canonical_row = BTreeMap::new();
      for (key, value) in row {
        canonical_row.insert(key.clone(), value.to_string());
      }
      canonical_rows.push(canonical_row);
    }
    canonical_rows.sort_by(|left, right| {
      let left_json = serde_json::to_string(left).unwrap_or_default();
      let right_json = serde_json::to_string(right).unwrap_or_default();
      left_json.cmp(&right_json)
    });
    canonical.insert(table_name.clone(), canonical_rows);
  }

  let bytes = serde_json::to_vec(&canonical)
    .map_err(|error| format!("serialize snapshot payload failed: {error}"))?;
  let mut hasher = Sha256::new();
  hasher.update(bytes);
  Ok(format!("{:x}", hasher.finalize()))
}

fn is_artifact_expired(expires_at: &str, now: DateTime<Utc>) -> bool {
  DateTime::parse_from_rfc3339(expires_at)
    .map(|value| value.with_timezone(&Utc) <= now)
    .unwrap_or(true)
}

fn parse_row_status(raw: &str) -> DbDataRowStatus {
  match raw {
    "source_only" => DbDataRowStatus::SourceOnly,
    "target_only" => DbDataRowStatus::TargetOnly,
    "value_changed" => DbDataRowStatus::ValueChanged,
    _ => DbDataRowStatus::Unchanged,
  }
}

fn suggested_action_for_status(status: DbDataRowStatus) -> DbDataSyncAction {
  match status {
    DbDataRowStatus::SourceOnly => DbDataSyncAction::Insert,
    DbDataRowStatus::TargetOnly => DbDataSyncAction::Delete,
    DbDataRowStatus::ValueChanged => DbDataSyncAction::Update,
    DbDataRowStatus::Unchanged => DbDataSyncAction::Ignore,
  }
}

fn normalize_primary_key_columns(table: Option<&DbTableSchema>) -> Vec<String> {
  table
    .map(|schema| {
      schema
        .columns
        .iter()
        .filter(|column| column.primary_key)
        .map(|column| column.name.clone())
        .collect::<Vec<_>>()
    })
    .unwrap_or_default()
}

fn normalize_unique_key_columns(table: Option<&DbTableSchema>) -> Vec<String> {
  table
    .and_then(|schema| {
      schema
        .indexes
        .iter()
        .find(|index| index.unique && !index.columns.is_empty())
        .map(|index| index.columns.clone())
    })
    .unwrap_or_default()
}

fn find_table_schema<'a>(
  snapshot: &'a DbSchemaSnapshot,
  table_name: &str,
) -> Option<&'a DbTableSchema> {
  snapshot.tables.iter().find(|table| table.name == table_name)
}

fn collect_union_column_names(
  source_table: Option<&DbTableSchema>,
  target_table: Option<&DbTableSchema>,
) -> Vec<String> {
  let mut seen = HashSet::new();
  let mut columns = Vec::new();

  let mut push_columns = |items: &[DbColumnSchema]| {
    for column in items {
      if seen.insert(column.name.clone()) {
        columns.push(column.name.clone());
      }
    }
  };

  if let Some(table) = source_table {
    push_columns(&table.columns);
  }
  if let Some(table) = target_table {
    push_columns(&table.columns);
  }

  columns
}

fn derive_compare_columns(
  requested_compare_columns: Option<&Vec<String>>,
  source_table: Option<&DbTableSchema>,
  target_table: Option<&DbTableSchema>,
  key_columns: &[String],
) -> Vec<String> {
  let union_columns = collect_union_column_names(source_table, target_table);
  let key_set = key_columns.iter().cloned().collect::<HashSet<_>>();

  if let Some(requested) = requested_compare_columns {
    let requested = normalize_identifier_list(requested);
    if union_columns.is_empty() {
      return requested;
    }
    return requested
      .into_iter()
      .filter(|column| union_columns.contains(column))
      .collect();
  }

  union_columns
    .into_iter()
    .filter(|column| !key_set.contains(column))
    .collect()
}

fn has_all_key_columns(available_columns: &[String], key_columns: &[String]) -> bool {
  if key_columns.is_empty() {
    return false;
  }
  if available_columns.is_empty() {
    return true;
  }

  let available = available_columns.iter().cloned().collect::<HashSet<_>>();
  key_columns.iter().all(|column| available.contains(column))
}

fn select_sample_rows(deltas: &[DbDataDiffRowDelta], sample_limit: usize) -> Vec<DbDataDiffRowDelta> {
  let mut changed = deltas
    .iter()
    .filter(|delta| delta.status != DbDataRowStatus::Unchanged)
    .take(sample_limit)
    .cloned()
    .collect::<Vec<_>>();

  if changed.is_empty() {
    changed = deltas.iter().take(sample_limit).cloned().collect();
  }

  changed
}

fn canonical_row_key_json(row_key: &HashMap<String, Value>) -> Result<String, String> {
  let canonical = row_key
    .iter()
    .map(|(key, value)| (key.clone(), value.clone()))
    .collect::<BTreeMap<_, _>>();
  serde_json::to_string(&canonical)
    .map_err(|error| format!("serialize row key failed: {error}"))
}

fn validate_where_clause(where_clause: Option<&str>) -> Result<Option<String>, String> {
  let Some(where_clause) = where_clause else {
    return Ok(None);
  };

  let trimmed = where_clause.trim();
  if trimmed.is_empty() {
    return Ok(None);
  }

  let statements = split_sql_statements(trimmed);
  if statements.len() > 1 {
    return Err("whereClause must be a single SQL expression".to_string());
  }

  Ok(Some(trimmed.to_string()))
}

fn quote_identifier(driver: &super::DbDriver, identifier: &str) -> String {
  match driver {
    super::DbDriver::Mysql => format!("`{}`", identifier.replace('`', "``")),
    super::DbDriver::Postgres => format!("\"{}\"", identifier.replace('"', "\"\"")),
  }
}

fn qualify_table_name(
  config: &DbConnectionConfig,
  active_schema: Option<&str>,
  table_name: &str,
) -> String {
  match config.driver {
    super::DbDriver::Mysql => format!(
      "{}.{}",
      quote_identifier(&config.driver, &config.database),
      quote_identifier(&config.driver, table_name),
    ),
    super::DbDriver::Postgres => format!(
      "{}.{}",
      quote_identifier(&config.driver, active_schema.unwrap_or("public")),
      quote_identifier(&config.driver, table_name),
    ),
  }
}

fn build_table_query(
  config: &DbConnectionConfig,
  active_schema: Option<&str>,
  table_name: &str,
  where_clause: Option<&str>,
) -> String {
  let qualified_table = qualify_table_name(config, active_schema, table_name);
  if let Some(where_clause) = where_clause {
    format!("SELECT * FROM {qualified_table} WHERE {where_clause}")
  } else {
    format!("SELECT * FROM {qualified_table}")
  }
}

fn mysql_value_to_json(row: &sqlx::mysql::MySqlRow, index: usize) -> Value {
  if let Ok(v) = row.try_get::<Option<i64>, _>(index) {
    return v.map(Value::from).unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<i32>, _>(index) {
    return v.map(Value::from).unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<f64>, _>(index) {
    return v
      .and_then(|f| serde_json::Number::from_f64(f).map(Value::Number))
      .unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<bool>, _>(index) {
    return v.map(Value::Bool).unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::NaiveDateTime>, _>(index) {
    return v
      .map(|value| Value::String(value.format("%Y-%m-%d %H:%M:%S").to_string()))
      .unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::NaiveDate>, _>(index) {
    return v
      .map(|value| Value::String(value.format("%Y-%m-%d").to_string()))
      .unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::NaiveTime>, _>(index) {
    return v
      .map(|value| Value::String(value.format("%H:%M:%S").to_string()))
      .unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<String>, _>(index) {
    return v.map(Value::String).unwrap_or(Value::Null);
  }
  Value::Null
}

fn pg_value_to_json(row: &sqlx::postgres::PgRow, index: usize) -> Value {
  if let Ok(v) = row.try_get::<Option<i64>, _>(index) {
    return v.map(Value::from).unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<i32>, _>(index) {
    return v.map(Value::from).unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<f64>, _>(index) {
    return v
      .and_then(|f| serde_json::Number::from_f64(f).map(Value::Number))
      .unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<bool>, _>(index) {
    return v.map(Value::Bool).unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>(index) {
    return v.map(|value| Value::String(value.to_rfc3339())).unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::NaiveDateTime>, _>(index) {
    return v
      .map(|value| Value::String(value.format("%Y-%m-%d %H:%M:%S").to_string()))
      .unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::NaiveDate>, _>(index) {
    return v
      .map(|value| Value::String(value.format("%Y-%m-%d").to_string()))
      .unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<chrono::NaiveTime>, _>(index) {
    return v
      .map(|value| Value::String(value.format("%H:%M:%S").to_string()))
      .unwrap_or(Value::Null);
  }
  if let Ok(v) = row.try_get::<Option<String>, _>(index) {
    return v.map(Value::String).unwrap_or(Value::Null);
  }
  Value::Null
}

async fn fetch_table_rows(
  pool_registry: &DbPoolRegistry,
  config: &DbConnectionConfig,
  table_request: &DbDataDiffTableRequest,
) -> Result<Vec<HashMap<String, Value>>, String> {
  let active_schema = resolve_active_schema(config, None);
  let where_clause = validate_where_clause(table_request.where_clause.as_deref())?;
  let sql = build_table_query(
    config,
    active_schema.as_deref(),
    &table_request.table_name,
    where_clause.as_deref(),
  );
  let pool = get_or_create_pool(pool_registry, config).await?;

  match pool.as_ref() {
    AnyPool::Mysql(mysql_pool) => {
      let rows = sqlx::query(&sql)
        .fetch_all(mysql_pool)
        .await
        .map_err(|error| format!("fetch source rows failed for {}: {error}", table_request.table_name))?;
      Ok(rows
        .iter()
        .map(|row| {
          row
            .columns()
            .iter()
            .enumerate()
            .map(|(index, column)| (column.name().to_string(), mysql_value_to_json(row, index)))
            .collect::<HashMap<_, _>>()
        })
        .collect())
    }
    AnyPool::Postgres(postgres_pool) => {
      let rows = sqlx::query(&sql)
        .fetch_all(postgres_pool)
        .await
        .map_err(|error| format!("fetch target rows failed for {}: {error}", table_request.table_name))?;
      Ok(rows
        .iter()
        .map(|row| {
          row
            .columns()
            .iter()
            .enumerate()
            .map(|(index, column)| (column.name().to_string(), pg_value_to_json(row, index)))
            .collect::<HashMap<_, _>>()
        })
        .collect())
    }
  }
}

pub async fn db_data_diff_preview(
  app: &AppHandle,
  pool_registry: &DbPoolRegistry,
  request: DbDataDiffPreviewRequest,
) -> Result<DbDataDiffPreviewResponse, String> {
  validate_distinct_connection_pair(
    &request.source_connection_id,
    &request.target_connection_id,
  )?;
  let created_at = Utc::now();
  let expires_at = created_at + Duration::minutes(15);
  let compare_id = format!("cmp-{}", epoch_millis());
  let sample_limit = request.sample_limit.unwrap_or(20).max(1) as usize;

  let source_config = load_connection_config(app, &request.source_connection_id)?;
  let target_config = load_connection_config(app, &request.target_connection_id)?;
  let source_snapshot = introspect_schema(&source_config).await?;
  let target_snapshot = introspect_schema(&target_config).await?;

  let mut status_counts = empty_counts();
  let mut blockers = Vec::new();
  let mut table_summaries = Vec::new();
  let mut snapshot_seed = Vec::new();
  let mut table_records = Vec::new();
  let mut resolved_compare_scope = Vec::new();

  for table in &request.tables {
    let source_table = find_table_schema(&source_snapshot, &table.table_name);
    let target_table = find_table_schema(&target_snapshot, &table.table_name);
    let available_columns = collect_union_column_names(source_table, target_table);
    let fallback_business_keys = request
      .business_key_columns
      .as_ref()
      .and_then(|mapping| mapping.get(&table.table_name));

    let requested_key_columns = table.key_columns.clone().unwrap_or_default();
    let key_columns = if !requested_key_columns.is_empty() {
      normalize_identifier_list(&requested_key_columns)
    } else {
      let primary_key_columns = normalize_identifier_list(
        &normalize_primary_key_columns(source_table)
          .into_iter()
          .chain(normalize_primary_key_columns(target_table))
          .collect::<Vec<_>>(),
      );
      let unique_key_columns = {
        let source_unique = normalize_unique_key_columns(source_table);
        if !source_unique.is_empty() {
          normalize_identifier_list(&source_unique)
        } else {
          normalize_identifier_list(&normalize_unique_key_columns(target_table))
        }
      };
      resolve_stable_keys(
        &primary_key_columns,
        &unique_key_columns,
        fallback_business_keys,
      )
    };
    let compare_columns =
      derive_compare_columns(table.compare_columns.as_ref(), source_table, target_table, &key_columns);

    resolved_compare_scope.push(DbDataDiffTableRequest {
      table_name: table.table_name.clone(),
      key_columns: Some(key_columns.clone()),
      compare_columns: Some(compare_columns.clone()),
      where_clause: validate_where_clause(table.where_clause.as_deref())?,
    });

    let blocked = !has_all_key_columns(&available_columns, &key_columns);
    let blocker_codes = if blocked {
      vec![DbDataSyncBlockerCode::MissingStableKey]
    } else {
      vec![]
    };

    if blocked {
      blockers.push(DbDataSyncBlocker {
        code: DbDataSyncBlockerCode::MissingStableKey,
        message: format!("Table {} has no stable keys.", table.table_name),
        table_name: Some(table.table_name.clone()),
        level: Some("blocking".to_string()),
      });

      let summary = DbDataDiffTableSummary {
        table_name: table.table_name.clone(),
        key_columns: key_columns.clone(),
        compare_columns: compare_columns.clone(),
        status_counts: empty_counts(),
        blocked: true,
        blocker_codes: blocker_codes.clone(),
        sample_rows: vec![],
      };

      table_records.push(storage::DbDataCompareTableRecord {
        compare_id: compare_id.clone(),
        table_name: table.table_name.clone(),
        key_columns_json: serde_json::to_string(&summary.key_columns)
          .map_err(|error| format!("serialize key columns failed: {error}"))?,
        status_counts_json: serde_json::to_string(&summary.status_counts)
          .map_err(|error| format!("serialize status counts failed: {error}"))?,
        blocked: true,
        blocker_code: Some("missing_stable_key".to_string()),
      });
      table_summaries.push(summary);
      continue;
    }

    let source_rows = if source_table.is_some() {
      fetch_table_rows(pool_registry, &source_config, table).await?
    } else {
      Vec::new()
    };
    let target_rows = if target_table.is_some() {
      fetch_table_rows(pool_registry, &target_config, table).await?
    } else {
      Vec::new()
    };
    let (table_counts, deltas) = classify_table_rows(
      &table.table_name,
      &key_columns,
      &compare_columns,
      &source_rows,
      &target_rows,
    );

    add_counts(&mut status_counts, &table_counts);
    snapshot_seed.push((table.table_name.clone(), target_rows.clone()));

    let summary = DbDataDiffTableSummary {
      table_name: table.table_name.clone(),
      key_columns: key_columns.clone(),
      compare_columns: compare_columns.clone(),
      status_counts: table_counts.clone(),
      blocked: false,
      blocker_codes: vec![],
      sample_rows: select_sample_rows(&deltas, sample_limit),
    };

    table_records.push(storage::DbDataCompareTableRecord {
      compare_id: compare_id.clone(),
      table_name: table.table_name.clone(),
      key_columns_json: serde_json::to_string(&summary.key_columns)
        .map_err(|error| format!("serialize key columns failed: {error}"))?,
      status_counts_json: serde_json::to_string(&summary.status_counts)
        .map_err(|error| format!("serialize status counts failed: {error}"))?,
      blocked: false,
      blocker_code: None,
    });

    storage::replace_db_data_compare_rows(
      app,
      &compare_id,
      &table.table_name,
      &deltas
        .iter()
        .map(|delta| storage::DbDataCompareRowRecord {
          compare_id: compare_id.clone(),
          table_name: delta.table_name.clone(),
          row_key_json: canonical_row_key_json(&delta.row_key)
            .unwrap_or_else(|_| "{}".to_string()),
          status: match delta.status {
            DbDataRowStatus::SourceOnly => "source_only".to_string(),
            DbDataRowStatus::TargetOnly => "target_only".to_string(),
            DbDataRowStatus::ValueChanged => "value_changed".to_string(),
            DbDataRowStatus::Unchanged => "unchanged".to_string(),
          },
          source_row_json: delta.source_row.as_ref().and_then(|row| serde_json::to_string(row).ok()),
          target_row_json: delta.target_row.as_ref().and_then(|row| serde_json::to_string(row).ok()),
          field_diffs_json: serde_json::to_string(&delta.field_diffs)
            .unwrap_or_else(|_| "[]".to_string()),
        })
        .collect::<Vec<_>>(),
    )?;

    table_summaries.push(summary);
  }

  let target_snapshot_hash = compute_target_snapshot_hash(&snapshot_seed)?;

  storage::save_db_data_compare(
    app,
    &storage::DbDataCompareRecord {
      compare_id: compare_id.clone(),
      source_connection_id: request.source_connection_id.clone(),
      target_connection_id: request.target_connection_id.clone(),
      target_snapshot_hash: target_snapshot_hash.clone(),
      compare_scope_json: serde_json::to_string(&resolved_compare_scope)
        .map_err(|error| format!("serialize compare scope failed: {error}"))?,
      created_at: created_at.to_rfc3339(),
      expires_at: expires_at.to_rfc3339(),
    },
    &table_records,
  )?;

  for summary in &table_summaries {
    if summary.blocked {
      storage::replace_db_data_compare_rows(app, &compare_id, &summary.table_name, &[])?;
    }
  }

  Ok(DbDataDiffPreviewResponse {
    compare_id,
    source_connection_id: request.source_connection_id,
    target_connection_id: request.target_connection_id,
    target_snapshot_hash,
    created_at: created_at.to_rfc3339(),
    expires_at: expires_at.to_rfc3339(),
    status_counts,
    table_summaries,
    blockers,
  })
}

pub async fn db_data_diff_detail(
  app: &AppHandle,
  _pool_registry: &DbPoolRegistry,
  request: DbDataDiffDetailRequest,
) -> Result<DbDataDiffDetailResponse, String> {
  let compare = storage::get_db_data_compare(app, &request.compare_id)?
    .ok_or_else(|| format!("compare artifact not found: {}", request.compare_id))?;

  if is_artifact_expired(&compare.expires_at, Utc::now()) {
    return Ok(DbDataDiffDetailResponse {
      compare_id: request.compare_id,
      table_name: request.table_name,
      target_snapshot_hash: compare.target_snapshot_hash,
      current_target_snapshot_hash: None,
      key_columns: vec![],
      compare_columns: vec![],
      rows: vec![],
      has_more: false,
      next_offset: None,
      blockers: vec![DbDataSyncBlocker {
        code: DbDataSyncBlockerCode::ArtifactExpired,
        message: "Compare artifact has expired. Run compare again.".to_string(),
        table_name: None,
        level: Some("blocking".to_string()),
      }],
    });
  }

  let compare_scope = serde_json::from_str::<Vec<DbDataDiffTableRequest>>(&compare.compare_scope_json)
    .unwrap_or_default();
  let scope_entry = compare_scope
    .iter()
    .find(|item| item.table_name == request.table_name);

  let table_record = storage::get_db_data_compare_table(
    app,
    &request.compare_id,
    &request.table_name,
  )?;

  let (key_columns, _status_counts, table_blocker_code) = if let Some(record) = table_record {
    let keys = serde_json::from_str::<Vec<String>>(&record.key_columns_json)
      .unwrap_or_default();
    let counts = serde_json::from_str::<DbDataDiffActionCounts>(&record.status_counts_json)
      .unwrap_or_else(|_| empty_counts());
    (keys, counts, record.blocker_code)
  } else {
    (vec![], empty_counts(), None)
  };

  let compare_columns = scope_entry
    .and_then(|entry| entry.compare_columns.clone())
    .unwrap_or_default();

  let mut blockers = Vec::new();
  if table_blocker_code.as_deref() == Some("missing_stable_key") {
    blockers.push(DbDataSyncBlocker {
      code: DbDataSyncBlockerCode::MissingStableKey,
      message: "Table has no stable key for deterministic matching.".to_string(),
      table_name: Some(request.table_name.clone()),
      level: Some("blocking".to_string()),
    });
  }

  let limit = request.limit.unwrap_or(100).max(1);
  let offset = request.offset.unwrap_or(0);
  let include_unchanged = request.include_unchanged.unwrap_or(false);

  let row_records = storage::list_db_data_compare_rows(
    app,
    &request.compare_id,
    &request.table_name,
    limit.saturating_add(1),
    offset,
    include_unchanged,
  )?;

  let has_more = row_records.len() as u32 > limit;
  let rows = row_records
    .iter()
    .take(limit as usize)
    .map(|record| {
      let status = parse_row_status(&record.status);
      DbDataDiffRowDelta {
        table_name: record.table_name.clone(),
        row_key: serde_json::from_str::<HashMap<String, Value>>(&record.row_key_json)
          .unwrap_or_default(),
        status: status.clone(),
        suggested_action: suggested_action_for_status(status),
        source_row: record
          .source_row_json
          .as_ref()
          .and_then(|json| serde_json::from_str::<HashMap<String, Value>>(json).ok()),
        target_row: record
          .target_row_json
          .as_ref()
          .and_then(|json| serde_json::from_str::<HashMap<String, Value>>(json).ok()),
        field_diffs: serde_json::from_str::<Vec<DbDataDiffFieldDelta>>(&record.field_diffs_json)
          .unwrap_or_default(),
      }
    })
    .collect::<Vec<_>>();

  Ok(DbDataDiffDetailResponse {
    compare_id: request.compare_id,
    table_name: request.table_name,
    target_snapshot_hash: compare.target_snapshot_hash.clone(),
    current_target_snapshot_hash: Some(compare.target_snapshot_hash),
    key_columns,
    compare_columns,
    rows,
    has_more,
    next_offset: if has_more { Some(offset + limit) } else { None },
    blockers,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn row(values: &[(&str, Value)]) -> HashMap<String, Value> {
    values
      .iter()
      .map(|(key, value)| ((*key).to_string(), value.clone()))
      .collect()
  }

  #[test]
  fn classify_table_rows_uses_target_key_for_target_only_rows() {
    let target_rows = vec![row(&[
      ("id", Value::from(7)),
      ("name", Value::from("neo")),
    ])];

    let (counts, deltas) = classify_table_rows(
      "users",
      &["id".to_string()],
      &["name".to_string()],
      &[],
      &target_rows,
    );

    assert_eq!(counts.delete, 1);
    assert_eq!(deltas[0].row_key.get("id"), Some(&Value::from(7)));
  }

  #[test]
  fn derive_compare_columns_excludes_key_columns_when_unspecified() {
    let table = DbTableSchema {
      name: "users".to_string(),
      comment: None,
      columns: vec![
        DbColumnSchema {
          name: "id".to_string(),
          data_type: "int".to_string(),
          nullable: false,
          primary_key: true,
          default_value: None,
          comment: None,
        },
        DbColumnSchema {
          name: "name".to_string(),
          data_type: "varchar".to_string(),
          nullable: false,
          primary_key: false,
          default_value: None,
          comment: None,
        },
      ],
      indexes: vec![],
      foreign_keys: vec![],
    };

    let columns = derive_compare_columns(None, Some(&table), None, &["id".to_string()]);
    assert_eq!(columns, vec!["name".to_string()]);
  }

  #[test]
  fn validate_where_clause_rejects_multiple_statements() {
    let error = validate_where_clause(Some("id = 1; DELETE FROM users"))
      .expect_err("multiple statements should fail");
    assert!(error.contains("single SQL expression"));
  }

  #[test]
  fn distinct_connection_pair_is_required_for_data_sync() {
    let error = validate_distinct_connection_pair("conn-a", "conn-a")
      .expect_err("same connection pair should be rejected");
    assert!(error.contains("must be different"));
  }
}
