use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::Value;
use tauri::AppHandle;

use super::query::{get_or_create_pool, load_connection_config, resolve_active_schema};
use super::{
  AnyPool, DbBackgroundJobKind, DbBackgroundJobListRequest, DbBackgroundJobListResponse,
  DbBackgroundJobSummary, DbConnectionConfig, DbDataApplyExecuteRequest,
  DbDataApplyExecuteResponse, DbDataApplyJobDetailRequest, DbDataApplyJobDetailResponse,
  DbDataApplyJobStatus, DbDataApplyPreviewRequest, DbDataApplyPreviewResponse,
  DbDataApplySelection, DbDataApplyTableResult, DbDataDiffActionCounts,
  DbDataDiffFieldDelta, DbDataSyncAction, DbDataSyncBlocker, DbDataSyncBlockerCode, DbDriver,
  DbPoolRegistry,
};
use crate::storage;

const MAX_SQL_PREVIEW_LINES: usize = 200;
const MAX_COMPARE_ROWS_PER_TABLE: u32 = 100_000;

#[derive(Debug, Clone)]
struct PreparedApplyStatement {
  table_name: String,
  action: DbDataSyncAction,
  sql: String,
}

#[derive(Debug, Clone)]
struct PreparedApplyPlan {
  statements: Vec<PreparedApplyStatement>,
  current_target_snapshot_hash: String,
  blockers: Vec<DbDataSyncBlocker>,
}

#[derive(Debug, Clone)]
struct ApplyExecutionFailure {
  table_name: Option<String>,
  action: Option<DbDataSyncAction>,
  statement_index: Option<usize>,
  sql: Option<String>,
  message: String,
}

#[derive(Debug, Clone)]
struct ApplyJobPersistenceContext {
  job_id: String,
  created_at: String,
  compare_id: String,
  source_connection_id: String,
  target_connection_id: String,
  target_snapshot_hash: String,
  current_target_snapshot_hash: String,
  status_counts: DbDataDiffActionCounts,
  blockers: Vec<DbDataSyncBlocker>,
  sql_preview_lines: Vec<String>,
  preview_truncated: bool,
  statement_count: usize,
  started_at: Option<String>,
}

fn empty_counts() -> DbDataDiffActionCounts {
  DbDataDiffActionCounts {
    insert: 0,
    update: 0,
    delete: 0,
    unchanged: 0,
  }
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

fn build_action_counts(selections: &[DbDataApplySelection]) -> DbDataDiffActionCounts {
  let mut counts = empty_counts();
  for selection in selections {
    match selection.action {
      DbDataSyncAction::Insert => counts.insert += 1,
      DbDataSyncAction::Update => counts.update += 1,
      DbDataSyncAction::Delete => counts.delete += 1,
      DbDataSyncAction::Ignore => {}
    }
  }
  counts
}

fn has_target_snapshot_changed(target_snapshot_hash: &str, current_target_snapshot_hash: &str) -> bool {
  target_snapshot_hash.trim() != current_target_snapshot_hash.trim()
}

fn contains_blocker(blockers: &[DbDataSyncBlocker], code: DbDataSyncBlockerCode) -> bool {
  blockers.iter().any(|blocker| blocker.code == code)
}

fn has_blocking_blockers(blockers: &[DbDataSyncBlocker]) -> bool {
  contains_blocker(blockers, DbDataSyncBlockerCode::ArtifactExpired)
    || contains_blocker(blockers, DbDataSyncBlockerCode::TargetSnapshotChanged)
    || contains_blocker(blockers, DbDataSyncBlockerCode::ReadonlyTarget)
    || contains_blocker(blockers, DbDataSyncBlockerCode::MissingStableKey)
    || contains_blocker(blockers, DbDataSyncBlockerCode::UnsafeDeleteConfirmationRequired)
    || contains_blocker(blockers, DbDataSyncBlockerCode::TargetDatabaseConfirmationRequired)
}

fn is_blocking_blocker_code(code: &DbDataSyncBlockerCode) -> bool {
  matches!(
    code,
    DbDataSyncBlockerCode::ArtifactExpired
      | DbDataSyncBlockerCode::TargetSnapshotChanged
      | DbDataSyncBlockerCode::ReadonlyTarget
      | DbDataSyncBlockerCode::MissingStableKey
      | DbDataSyncBlockerCode::UnsafeDeleteConfirmationRequired
      | DbDataSyncBlockerCode::TargetDatabaseConfirmationRequired
  )
}

fn parse_iso_datetime(value: &str) -> Option<DateTime<Utc>> {
  DateTime::parse_from_rfc3339(value)
    .ok()
    .map(|date_time| date_time.with_timezone(&Utc))
}

fn is_artifact_expired(expires_at: &str) -> bool {
  parse_iso_datetime(expires_at)
    .map(|expires_at| expires_at <= Utc::now())
    .unwrap_or(true)
}

fn detect_readonly_target(target_connection_id: &str, connections: &[crate::db_connector::DbConnectionConfig]) -> bool {
  connections
    .iter()
    .find(|connection| connection.id == target_connection_id)
    .map(|connection| connection.readonly)
    .unwrap_or(false)
}

fn target_connection<'a>(
  target_connection_id: &str,
  connections: &'a [crate::db_connector::DbConnectionConfig],
) -> Option<&'a crate::db_connector::DbConnectionConfig> {
  connections
    .iter()
    .find(|connection| connection.id == target_connection_id)
}

fn canonical_row_key_json(row_key: &HashMap<String, Value>) -> Result<String, String> {
  let canonical = row_key
    .iter()
    .map(|(key, value)| (key.clone(), value.clone()))
    .collect::<BTreeMap<_, _>>();
  serde_json::to_string(&canonical)
    .map_err(|error| format!("serialize row key failed: {error}"))
}

fn parse_job_status(raw: &str) -> DbDataApplyJobStatus {
  match raw {
    "pending" => DbDataApplyJobStatus::Pending,
    "running" => DbDataApplyJobStatus::Running,
    "completed" => DbDataApplyJobStatus::Completed,
    "failed" => DbDataApplyJobStatus::Failed,
    "partial" => DbDataApplyJobStatus::Partial,
    _ => DbDataApplyJobStatus::Failed,
  }
}

fn apply_job_status_key(status: &DbDataApplyJobStatus) -> &'static str {
  match status {
    DbDataApplyJobStatus::Pending => "pending",
    DbDataApplyJobStatus::Running => "running",
    DbDataApplyJobStatus::Completed => "completed",
    DbDataApplyJobStatus::Failed => "failed",
    DbDataApplyJobStatus::Partial => "partial",
  }
}

fn build_sql_preview_audit(statements: &[PreparedApplyStatement]) -> (Vec<String>, bool) {
  let sql_preview_lines = statements
    .iter()
    .take(MAX_SQL_PREVIEW_LINES)
    .map(|statement| statement.sql.clone())
    .collect::<Vec<_>>();
  let preview_truncated = statements.len() > MAX_SQL_PREVIEW_LINES;
  (sql_preview_lines, preview_truncated)
}

fn build_job_detail_response(
  job: &storage::DbDataApplyJobRecord,
  results: &[storage::DbDataApplyResultRecord],
) -> DbDataApplyJobDetailResponse {
  let status_counts = serde_json::from_str::<DbDataDiffActionCounts>(&job.action_counts_json)
    .unwrap_or_else(|_| empty_counts());
  let blockers = serde_json::from_str::<Vec<DbDataSyncBlocker>>(&job.blockers_json)
    .unwrap_or_default();
  let sql_preview_lines = serde_json::from_str::<Vec<String>>(&job.sql_preview_json)
    .unwrap_or_default();

  DbDataApplyJobDetailResponse {
    job_id: job.job_id.clone(),
    compare_id: job.compare_id.clone(),
    source_connection_id: job.source_connection_id.clone(),
    target_connection_id: job.target_connection_id.clone(),
    target_snapshot_hash: job.target_snapshot_hash.clone(),
    current_target_snapshot_hash: job.current_target_snapshot_hash.clone(),
    status: parse_job_status(&job.status),
    status_counts,
    table_results: results
      .iter()
      .map(|result| DbDataApplyTableResult {
        table_name: result.table_name.clone(),
        action: match result.action_type.as_str() {
          "insert" => DbDataSyncAction::Insert,
          "update" => DbDataSyncAction::Update,
          "delete" => DbDataSyncAction::Delete,
          _ => DbDataSyncAction::Ignore,
        },
        attempted_rows: result.attempted_rows.max(0) as u64,
        succeeded_rows: result.succeeded_rows.max(0) as u64,
        failed_rows: result.failed_rows.max(0) as u64,
        error: result.failure_json.clone(),
      })
      .collect(),
    blockers,
    sql_preview_lines,
    preview_truncated: job.preview_truncated,
    statement_count: job.statement_count.max(0) as u64,
    created_at: job.created_at.clone(),
    started_at: job.started_at.clone(),
    finished_at: job.finished_at.clone(),
  }
}

fn build_background_job_summary(
  job: &storage::DbDataApplyJobRecord,
  results: &[storage::DbDataApplyResultRecord],
) -> DbBackgroundJobSummary {
  let status_counts = serde_json::from_str::<DbDataDiffActionCounts>(&job.action_counts_json)
    .unwrap_or_else(|_| empty_counts());
  let blockers = serde_json::from_str::<Vec<DbDataSyncBlocker>>(&job.blockers_json)
    .unwrap_or_default();
  let sql_preview_lines = serde_json::from_str::<Vec<String>>(&job.sql_preview_json)
    .unwrap_or_default();
  let primary_table_name = results
    .iter()
    .find_map(|result| (!result.table_name.trim().is_empty()).then(|| result.table_name.clone()));
  let table_count = results
    .iter()
    .map(|result| result.table_name.trim())
    .filter(|table_name| !table_name.is_empty())
    .collect::<BTreeSet<_>>()
    .len() as u64;
  let failure_summary = results.iter().find_map(|result| {
    let failure = result.failure_json.as_ref()?.trim();
    if failure.is_empty() {
      return None;
    }
    Some(format!(
      "{} / {} / {}",
      result.table_name, result.action_type, failure
    ))
  });

  DbBackgroundJobSummary {
    job_id: job.job_id.clone(),
    job_kind: DbBackgroundJobKind::DataApply,
    title: "Data Sync Apply".to_string(),
    source_connection_id: Some(job.source_connection_id.clone()),
    target_connection_id: Some(job.target_connection_id.clone()),
    status: parse_job_status(&job.status),
    status_counts,
    blockers,
    table_count,
    primary_table_name,
    statement_count: job.statement_count.max(0) as u64,
    sql_preview_lines,
    preview_truncated: job.preview_truncated,
    failure_summary,
    created_at: job.created_at.clone(),
    started_at: job.started_at.clone(),
    finished_at: job.finished_at.clone(),
  }
}

fn quote_identifier(driver: &DbDriver, identifier: &str) -> String {
  match driver {
    DbDriver::Mysql => format!("`{}`", identifier.replace('`', "``")),
    DbDriver::Postgres => format!("\"{}\"", identifier.replace('"', "\"\"")),
  }
}

fn qualify_table_name(config: &DbConnectionConfig, table_name: &str) -> String {
  match config.driver {
    DbDriver::Mysql => format!(
      "{}.{}",
      quote_identifier(&config.driver, &config.database),
      quote_identifier(&config.driver, table_name),
    ),
    DbDriver::Postgres => {
      let schema_name = resolve_active_schema(config, None).unwrap_or_else(|| "public".to_string());
      format!(
        "{}.{}",
        quote_identifier(&config.driver, &schema_name),
        quote_identifier(&config.driver, table_name),
      )
    }
  }
}

fn render_sql_literal(value: &Value) -> String {
  match value {
    Value::Null => "NULL".to_string(),
    Value::Bool(flag) => {
      if *flag {
        "TRUE".to_string()
      } else {
        "FALSE".to_string()
      }
    }
    Value::Number(number) => number.to_string(),
    Value::String(text) => format!("'{}'", text.replace('\'', "''")),
    _ => format!(
      "'{}'",
      serde_json::to_string(value)
        .unwrap_or_else(|_| "\"\"".to_string())
        .replace('\'', "''"),
    ),
  }
}

fn build_where_clause(
  driver: &DbDriver,
  row_key: &HashMap<String, Value>,
) -> Result<String, String> {
  if row_key.is_empty() {
    return Err("row selection is missing stable key columns".to_string());
  }

  let mut clauses = row_key
    .iter()
    .map(|(column, value)| {
      let quoted = quote_identifier(driver, column);
      if value.is_null() {
        format!("{quoted} IS NULL")
      } else {
        format!("{quoted} = {}", render_sql_literal(value))
      }
    })
    .collect::<Vec<_>>();
  clauses.sort();
  Ok(clauses.join(" AND "))
}

fn build_insert_sql(
  config: &DbConnectionConfig,
  table_name: &str,
  source_row: &HashMap<String, Value>,
) -> Result<String, String> {
  if source_row.is_empty() {
    return Err(format!("source row payload is empty for insert on {table_name}"));
  }

  let mut columns = source_row.keys().cloned().collect::<Vec<_>>();
  columns.sort();
  let column_sql = columns
    .iter()
    .map(|column| quote_identifier(&config.driver, column))
    .collect::<Vec<_>>()
    .join(", ");
  let value_sql = columns
    .iter()
    .map(|column| render_sql_literal(source_row.get(column).unwrap_or(&Value::Null)))
    .collect::<Vec<_>>()
    .join(", ");

  Ok(format!(
    "INSERT INTO {} ({column_sql}) VALUES ({value_sql});",
    qualify_table_name(config, table_name),
  ))
}

fn build_update_sql(
  config: &DbConnectionConfig,
  selection: &DbDataApplySelection,
  source_row: &HashMap<String, Value>,
  field_diffs: &[DbDataDiffFieldDelta],
) -> Result<String, String> {
  if source_row.is_empty() {
    return Err(format!("source row payload is empty for update on {}", selection.table_name));
  }

  let mut update_columns = if let Some(compare_columns) = selection.compare_columns.as_ref() {
    compare_columns.clone()
  } else {
    field_diffs
      .iter()
      .filter(|field| field.changed)
      .map(|field| field.column_name.clone())
      .collect::<Vec<_>>()
  };

  if update_columns.is_empty() {
    update_columns = source_row
      .keys()
      .filter(|column| !selection.row_key.contains_key(*column))
      .cloned()
      .collect::<Vec<_>>();
  }

  update_columns.sort();
  update_columns.dedup();

  if update_columns.is_empty() {
    return Err(format!("no mutable columns resolved for update on {}", selection.table_name));
  }

  let set_sql = update_columns
    .iter()
    .map(|column| {
      format!(
        "{} = {}",
        quote_identifier(&config.driver, column),
        render_sql_literal(source_row.get(column).unwrap_or(&Value::Null)),
      )
    })
    .collect::<Vec<_>>()
    .join(", ");

  let where_sql = build_where_clause(&config.driver, &selection.row_key)?;
  Ok(format!(
    "UPDATE {} SET {set_sql} WHERE {where_sql};",
    qualify_table_name(config, &selection.table_name),
  ))
}

fn build_delete_sql(
  config: &DbConnectionConfig,
  selection: &DbDataApplySelection,
) -> Result<String, String> {
  let where_sql = build_where_clause(&config.driver, &selection.row_key)?;
  Ok(format!(
    "DELETE FROM {} WHERE {where_sql};",
    qualify_table_name(config, &selection.table_name),
  ))
}

fn build_blockers(
  compare: &storage::DbDataCompareRecord,
  target_connection_id: &str,
  current_target_snapshot_hash: &str,
  selections: &[DbDataApplySelection],
  connections: &[DbConnectionConfig],
  delete_warning_threshold: Option<u64>,
) -> Vec<DbDataSyncBlocker> {
  let mut blockers = Vec::new();

  if is_artifact_expired(&compare.expires_at) {
    blockers.push(DbDataSyncBlocker {
      code: DbDataSyncBlockerCode::ArtifactExpired,
      message: "Compare artifact expired. Re-run compare.".to_string(),
      table_name: None,
      level: Some("blocking".to_string()),
    });
  }

  if has_target_snapshot_changed(&compare.target_snapshot_hash, current_target_snapshot_hash) {
    blockers.push(DbDataSyncBlocker {
      code: DbDataSyncBlockerCode::TargetSnapshotChanged,
      message: "Target snapshot changed after compare.".to_string(),
      table_name: None,
      level: Some("blocking".to_string()),
    });
  }

  if detect_readonly_target(target_connection_id, connections) {
    blockers.push(DbDataSyncBlocker {
      code: DbDataSyncBlockerCode::ReadonlyTarget,
      message: "Target connection is readonly.".to_string(),
      table_name: None,
      level: Some("blocking".to_string()),
    });
  }

  let delete_count = selections
    .iter()
    .filter(|selection| selection.action == DbDataSyncAction::Delete)
    .count() as u64;
  if let Some(threshold) = delete_warning_threshold {
    if delete_count > threshold {
      blockers.push(DbDataSyncBlocker {
        code: DbDataSyncBlockerCode::UnsafeDeleteThreshold,
        message: format!("Delete count {delete_count} exceeds threshold {threshold}."),
        table_name: None,
        level: Some("warning".to_string()),
      });
    }
  }

  if selections.iter().any(|selection| selection.row_key.is_empty()) {
    blockers.push(DbDataSyncBlocker {
      code: DbDataSyncBlockerCode::MissingStableKey,
      message: "At least one selected row is missing stable key columns.".to_string(),
      table_name: None,
      level: Some("blocking".to_string()),
    });
  }

  blockers
}

fn apply_execute_confirmations(
  blockers: &mut Vec<DbDataSyncBlocker>,
  target_connection_id: &str,
  connections: &[DbConnectionConfig],
  confirm_unsafe_delete: bool,
  target_database_confirmation: Option<&str>,
) {
  if contains_blocker(blockers, DbDataSyncBlockerCode::UnsafeDeleteThreshold)
    && !confirm_unsafe_delete
  {
    blockers.push(DbDataSyncBlocker {
      code: DbDataSyncBlockerCode::UnsafeDeleteConfirmationRequired,
      message:
        "Delete volume crossed unsafe_delete_threshold. Explicit confirmation is required before execute."
          .to_string(),
      table_name: None,
      level: Some("blocking".to_string()),
    });
  }

  if let Some(target_connection) = target_connection(target_connection_id, connections) {
    if target_connection.environment == Some(crate::db_connector::DbEnvironment::Prod) {
      let matches_database = target_database_confirmation
        .map(|value| value.trim() == target_connection.database)
        .unwrap_or(false);
      if !matches_database {
        blockers.push(DbDataSyncBlocker {
          code: DbDataSyncBlockerCode::TargetDatabaseConfirmationRequired,
          message: format!(
            "Target connection is prod. Type the target database name ({}) to confirm execute.",
            target_connection.database,
          ),
          table_name: None,
          level: Some("blocking".to_string()),
        });
      }
    }
  }
}

fn load_compare_row_records(
  app: &AppHandle,
  compare_id: &str,
  selections: &[DbDataApplySelection],
) -> Result<HashMap<String, HashMap<String, storage::DbDataCompareRowRecord>>, String> {
  let mut rows_by_table = HashMap::<String, HashMap<String, storage::DbDataCompareRowRecord>>::new();
  let mut table_names = selections
    .iter()
    .map(|selection| selection.table_name.clone())
    .collect::<Vec<_>>();
  table_names.sort();
  table_names.dedup();

  for table_name in table_names {
    let rows = storage::list_db_data_compare_rows(
      app,
      compare_id,
      &table_name,
      MAX_COMPARE_ROWS_PER_TABLE,
      0,
      true,
    )?;
    let mut row_map = HashMap::new();
    for row in rows {
      row_map.insert(row.row_key_json.clone(), row);
    }
    rows_by_table.insert(table_name, row_map);
  }

  Ok(rows_by_table)
}

fn build_apply_statements(
  config: &DbConnectionConfig,
  selections: &[DbDataApplySelection],
  rows_by_table: &HashMap<String, HashMap<String, storage::DbDataCompareRowRecord>>,
) -> Result<Vec<PreparedApplyStatement>, String> {
  let mut statements = Vec::new();

  for selection in selections {
    if selection.action == DbDataSyncAction::Ignore {
      continue;
    }

    let row_key_json = canonical_row_key_json(&selection.row_key)?;
    let row_record = rows_by_table
      .get(&selection.table_name)
      .and_then(|rows| rows.get(&row_key_json))
      .ok_or_else(|| format!(
        "compare row not found for {} / {}",
        selection.table_name,
        row_key_json,
      ))?;

    let source_row = row_record
      .source_row_json
      .as_ref()
      .map(|raw| serde_json::from_str::<HashMap<String, Value>>(raw))
      .transpose()
      .map_err(|error| format!("parse source row for {} failed: {error}", selection.table_name))?;
    let field_diffs = serde_json::from_str::<Vec<DbDataDiffFieldDelta>>(&row_record.field_diffs_json)
      .map_err(|error| format!("parse field diffs for {} failed: {error}", selection.table_name))?;

    let sql = match selection.action {
      DbDataSyncAction::Insert => build_insert_sql(
        config,
        &selection.table_name,
        source_row
          .as_ref()
          .ok_or_else(|| format!("insert source row missing for {}", selection.table_name))?,
      )?,
      DbDataSyncAction::Update => build_update_sql(
        config,
        selection,
        source_row
          .as_ref()
          .ok_or_else(|| format!("update source row missing for {}", selection.table_name))?,
        &field_diffs,
      )?,
      DbDataSyncAction::Delete => build_delete_sql(config, selection)?,
      DbDataSyncAction::Ignore => continue,
    };

    statements.push(PreparedApplyStatement {
      table_name: selection.table_name.clone(),
      action: selection.action.clone(),
      sql,
    });
  }

  Ok(statements)
}

fn action_key(action: &DbDataSyncAction) -> &'static str {
  match action {
    DbDataSyncAction::Insert => "insert",
    DbDataSyncAction::Update => "update",
    DbDataSyncAction::Delete => "delete",
    DbDataSyncAction::Ignore => "ignore",
  }
}

fn initialize_table_results(statements: &[PreparedApplyStatement]) -> Vec<DbDataApplyTableResult> {
  let mut grouped = BTreeMap::<(String, String), DbDataApplyTableResult>::new();
  for statement in statements {
    let key = (statement.table_name.clone(), action_key(&statement.action).to_string());
    let entry = grouped.entry(key).or_insert_with(|| DbDataApplyTableResult {
      table_name: statement.table_name.clone(),
      action: statement.action.clone(),
      attempted_rows: 0,
      succeeded_rows: 0,
      failed_rows: 0,
      error: None,
    });
    entry.attempted_rows += 1;
  }
  grouped.into_values().collect()
}

fn mark_all_succeeded(results: &mut [DbDataApplyTableResult]) {
  for result in results {
    result.succeeded_rows = result.attempted_rows;
    result.failed_rows = 0;
    result.error = None;
  }
}

fn format_apply_failure_message(failure: &ApplyExecutionFailure) -> String {
  let mut parts = Vec::new();
  if let Some(statement_index) = failure.statement_index {
    parts.push(format!("statement #{}", statement_index + 1));
  }
  if let Some(table_name) = &failure.table_name {
    parts.push(format!("table {table_name}"));
  }
  if let Some(action) = &failure.action {
    parts.push(format!("action {}", action_key(action)));
  }

  let mut message = if parts.is_empty() {
    failure.message.clone()
  } else {
    format!("{}: {}", parts.join(" / "), failure.message)
  };

  if let Some(sql) = &failure.sql {
    message.push_str(" / sql: ");
    message.push_str(sql);
  }

  message
}

fn mark_failed_with_context(results: &mut [DbDataApplyTableResult], failure: &ApplyExecutionFailure) {
  let failure_message = format_apply_failure_message(failure);
  for result in &mut *results {
    result.succeeded_rows = 0;
    result.failed_rows = result.attempted_rows;
    result.error = None;
  }

  let target_index = failure.table_name.as_ref().and_then(|table_name| {
    results.iter().position(|result| {
      result.table_name == *table_name
        && failure
          .action
          .as_ref()
          .map(|action| result.action == *action)
          .unwrap_or(true)
    })
  });

  if let Some(index) = target_index {
    if let Some(result) = results.get_mut(index) {
      result.error = Some(failure_message);
      return;
    }
  }

  if let Some(first) = results.first_mut() {
    first.error = Some(failure_message);
  }
}

fn persist_apply_job(
  app: &AppHandle,
  context: &ApplyJobPersistenceContext,
  status: &DbDataApplyJobStatus,
  table_results: &[DbDataApplyTableResult],
  finished_at: Option<String>,
) -> Result<(), String> {
  let job = storage::DbDataApplyJobRecord {
    job_id: context.job_id.clone(),
    compare_id: context.compare_id.clone(),
    source_connection_id: context.source_connection_id.clone(),
    target_connection_id: context.target_connection_id.clone(),
    status: apply_job_status_key(status).to_string(),
    action_counts_json: serde_json::to_string(&context.status_counts)
      .map_err(|error| format!("serialize apply action counts failed: {error}"))?,
    target_snapshot_hash: context.target_snapshot_hash.clone(),
    current_target_snapshot_hash: Some(context.current_target_snapshot_hash.clone()),
    blockers_json: serde_json::to_string(&context.blockers)
      .map_err(|error| format!("serialize apply blockers failed: {error}"))?,
    sql_preview_json: serde_json::to_string(&context.sql_preview_lines)
      .map_err(|error| format!("serialize apply sql preview failed: {error}"))?,
    preview_truncated: context.preview_truncated,
    statement_count: context.statement_count as i64,
    created_at: context.created_at.clone(),
    started_at: context.started_at.clone(),
    finished_at,
  };

  let result_records = table_results
    .iter()
    .map(|result| storage::DbDataApplyResultRecord {
      job_id: context.job_id.clone(),
      table_name: result.table_name.clone(),
      action_type: action_key(&result.action).to_string(),
      attempted_rows: result.attempted_rows as i64,
      succeeded_rows: result.succeeded_rows as i64,
      failed_rows: result.failed_rows as i64,
      failure_json: result.error.clone(),
    })
    .collect::<Vec<_>>();

  storage::save_db_data_apply_job(app, &job, &result_records)?;
  Ok(())
}

fn build_apply_plan(
  app: &AppHandle,
  request_compare_id: &str,
  request_source_connection_id: &str,
  request_target_connection_id: &str,
  request_current_target_snapshot_hash: Option<&String>,
  selections: &[DbDataApplySelection],
  delete_warning_threshold: Option<u64>,
  execute_confirmations: Option<(bool, Option<&str>)>,
) -> Result<PreparedApplyPlan, String> {
  validate_distinct_connection_pair(
    request_source_connection_id,
    request_target_connection_id,
  )?;
  let compare = storage::get_db_data_compare(app, request_compare_id)?
    .ok_or_else(|| format!("compare artifact not found: {request_compare_id}"))?;

  if compare.source_connection_id != request_source_connection_id {
    return Err("source connection does not match compare artifact".to_string());
  }
  if compare.target_connection_id != request_target_connection_id {
    return Err("target connection does not match compare artifact".to_string());
  }

  let current_target_snapshot_hash = request_current_target_snapshot_hash
    .cloned()
    .unwrap_or_else(|| compare.target_snapshot_hash.clone());
  let connections = storage::list_db_connections(app)?;
  let mut blockers = build_blockers(
    &compare,
    request_target_connection_id,
    &current_target_snapshot_hash,
    selections,
    &connections,
    delete_warning_threshold,
  );
  if let Some((confirm_unsafe_delete, target_database_confirmation)) = execute_confirmations {
    apply_execute_confirmations(
      &mut blockers,
      request_target_connection_id,
      &connections,
      confirm_unsafe_delete,
      target_database_confirmation,
    );
  }

  let target_config = load_connection_config(app, request_target_connection_id)?;
  let row_records = load_compare_row_records(app, &compare.compare_id, selections)?;
  let statements = build_apply_statements(&target_config, selections, &row_records)?;

  Ok(PreparedApplyPlan {
    statements,
    current_target_snapshot_hash,
    blockers,
  })
}

async fn execute_apply_transaction(
  pool: &Arc<AnyPool>,
  statements: &[PreparedApplyStatement],
) -> Result<(), ApplyExecutionFailure> {
  match pool.as_ref() {
    AnyPool::Mysql(mysql_pool) => {
      let mut tx = mysql_pool
        .begin()
        .await
        .map_err(|error| ApplyExecutionFailure {
          table_name: None,
          action: None,
          statement_index: None,
          sql: None,
          message: format!("start MySQL apply transaction failed: {error}"),
        })?;
      for (statement_index, statement) in statements.iter().enumerate() {
        sqlx::query(&statement.sql)
          .execute(&mut *tx)
          .await
          .map_err(|error| ApplyExecutionFailure {
            table_name: Some(statement.table_name.clone()),
            action: Some(statement.action.clone()),
            statement_index: Some(statement_index),
            sql: Some(statement.sql.clone()),
            message: format!("apply statement failed: {error}"),
          })?;
      }
      tx
        .commit()
        .await
        .map_err(|error| ApplyExecutionFailure {
          table_name: None,
          action: None,
          statement_index: None,
          sql: None,
          message: format!("commit MySQL apply transaction failed: {error}"),
        })?;
    }
    AnyPool::Postgres(pg_pool) => {
      let mut tx = pg_pool
        .begin()
        .await
        .map_err(|error| ApplyExecutionFailure {
          table_name: None,
          action: None,
          statement_index: None,
          sql: None,
          message: format!("start PostgreSQL apply transaction failed: {error}"),
        })?;
      for (statement_index, statement) in statements.iter().enumerate() {
        sqlx::query(&statement.sql)
          .execute(&mut *tx)
          .await
          .map_err(|error| ApplyExecutionFailure {
            table_name: Some(statement.table_name.clone()),
            action: Some(statement.action.clone()),
            statement_index: Some(statement_index),
            sql: Some(statement.sql.clone()),
            message: format!("apply statement failed: {error}"),
          })?;
      }
      tx
        .commit()
        .await
        .map_err(|error| ApplyExecutionFailure {
          table_name: None,
          action: None,
          statement_index: None,
          sql: None,
          message: format!("commit PostgreSQL apply transaction failed: {error}"),
        })?;
    }
  }
  Ok(())
}

async fn run_apply_job(
  app: AppHandle,
  pool_registry: Arc<DbPoolRegistry>,
  target_config: DbConnectionConfig,
  plan: PreparedApplyPlan,
  context: ApplyJobPersistenceContext,
) -> Result<(), String> {
  let mut table_results = initialize_table_results(&plan.statements);

  let status = match get_or_create_pool(&pool_registry, &target_config).await {
    Ok(pool) => match execute_apply_transaction(&pool, &plan.statements).await {
      Ok(()) => {
        mark_all_succeeded(&mut table_results);
        DbDataApplyJobStatus::Completed
      }
      Err(failure) => {
        mark_failed_with_context(&mut table_results, &failure);
        DbDataApplyJobStatus::Failed
      }
    },
    Err(error) => {
      mark_failed_with_context(
        &mut table_results,
        &ApplyExecutionFailure {
          table_name: None,
          action: None,
          statement_index: None,
          sql: None,
          message: format!("resolve target pool failed: {error}"),
        },
      );
      DbDataApplyJobStatus::Failed
    }
  };

  let finished_at = Some(Utc::now().to_rfc3339());
  persist_apply_job(&app, &context, &status, &table_results, finished_at)?;
  Ok(())
}

pub async fn db_data_apply_preview(
  app: &AppHandle,
  request: DbDataApplyPreviewRequest,
) -> Result<DbDataApplyPreviewResponse, String> {
  let plan = build_apply_plan(
    app,
    &request.compare_id,
    &request.source_connection_id,
    &request.target_connection_id,
    request.current_target_snapshot_hash.as_ref(),
    &request.selections,
    request.delete_warning_threshold,
    None,
  )?;
  let (sql_preview_lines, preview_truncated) = build_sql_preview_audit(&plan.statements);

  Ok(DbDataApplyPreviewResponse {
    compare_id: request.compare_id,
    target_snapshot_hash: request.target_snapshot_hash,
    current_target_snapshot_hash: plan.current_target_snapshot_hash,
    status_counts: build_action_counts(&request.selections),
    sql_preview_lines,
    preview_truncated,
    blockers: plan.blockers.clone(),
    executable: !plan.statements.is_empty() && !has_blocking_blockers(&plan.blockers),
  })
}

pub async fn db_data_apply_execute(
  app: AppHandle,
  pool_registry: Arc<DbPoolRegistry>,
  request: DbDataApplyExecuteRequest,
) -> Result<DbDataApplyExecuteResponse, String> {
  let plan = build_apply_plan(
    &app,
    &request.compare_id,
    &request.source_connection_id,
    &request.target_connection_id,
    request.current_target_snapshot_hash.as_ref(),
    &request.selections,
    request.delete_warning_threshold,
    Some((
      request.confirm_unsafe_delete,
      request.target_database_confirmation.as_deref(),
    )),
  )?;

  if plan.statements.is_empty() {
    return Err("no executable apply statements were resolved".to_string());
  }
  if has_blocking_blockers(&plan.blockers) {
    let blocking_messages = plan
      .blockers
      .iter()
      .filter(|blocker| is_blocking_blocker_code(&blocker.code))
      .map(|blocker| blocker.message.clone())
      .collect::<Vec<_>>();
    return Err(if blocking_messages.is_empty() {
      "apply execution is blocked by current safety guards".to_string()
    } else {
      blocking_messages.join(" | ")
    });
  }

  let target_config = load_connection_config(&app, &request.target_connection_id)?;
  let table_results = initialize_table_results(&plan.statements);
  let action_counts = build_action_counts(&request.selections);
  let (sql_preview_lines, preview_truncated) = build_sql_preview_audit(&plan.statements);
  let context = ApplyJobPersistenceContext {
    job_id: format!("apply-{}", Utc::now().timestamp_millis()),
    created_at: Utc::now().to_rfc3339(),
    compare_id: request.compare_id.clone(),
    source_connection_id: request.source_connection_id.clone(),
    target_connection_id: request.target_connection_id.clone(),
    target_snapshot_hash: request.target_snapshot_hash.clone(),
    current_target_snapshot_hash: plan.current_target_snapshot_hash.clone(),
    status_counts: action_counts.clone(),
    blockers: plan.blockers.clone(),
    sql_preview_lines,
    preview_truncated,
    statement_count: plan.statements.len(),
    started_at: Some(Utc::now().to_rfc3339()),
  };

  persist_apply_job(&app, &context, &DbDataApplyJobStatus::Running, &table_results, None)?;

  let worker_app = app.clone();
  let worker_pool_registry = Arc::clone(&pool_registry);
  let worker_plan = plan.clone();
  let worker_target_config = target_config.clone();
  let worker_context = context.clone();
  tauri::async_runtime::spawn(async move {
    if let Err(error) = run_apply_job(
      worker_app.clone(),
      worker_pool_registry,
      worker_target_config,
      worker_plan.clone(),
      worker_context.clone(),
    )
    .await
    {
      let mut failed_results = initialize_table_results(&worker_plan.statements);
      mark_failed_with_context(
        &mut failed_results,
        &ApplyExecutionFailure {
          table_name: None,
          action: None,
          statement_index: None,
          sql: None,
          message: error.clone(),
        },
      );
      if let Err(persist_error) = persist_apply_job(
        &worker_app,
        &worker_context,
        &DbDataApplyJobStatus::Failed,
        &failed_results,
        Some(Utc::now().to_rfc3339()),
      ) {
        eprintln!("persist background apply failure failed: {persist_error}");
      }
    }
  });

  Ok(DbDataApplyExecuteResponse {
    job_id: context.job_id,
    compare_id: request.compare_id,
    target_snapshot_hash: request.target_snapshot_hash,
    current_target_snapshot_hash: plan.current_target_snapshot_hash,
    status: DbDataApplyJobStatus::Running,
    status_counts: action_counts,
    table_results,
    blockers: plan.blockers,
  })
}

pub async fn db_data_apply_job_detail(
  app: &AppHandle,
  request: DbDataApplyJobDetailRequest,
) -> Result<DbDataApplyJobDetailResponse, String> {
  let (job, results) = storage::get_db_data_apply_job(app, &request.job_id)?
    .ok_or_else(|| format!("apply job not found: {}", request.job_id))?;
  Ok(build_job_detail_response(&job, &results))
}

pub async fn db_background_job_list(
  app: &AppHandle,
  request: DbBackgroundJobListRequest,
) -> Result<DbBackgroundJobListResponse, String> {
  let limit = request.limit.unwrap_or(25).clamp(1, 100) as usize;
  let jobs = storage::list_db_data_apply_jobs(app, limit)?
    .into_iter()
    .map(|(job, results)| build_background_job_summary(&job, &results))
    .collect();
  Ok(DbBackgroundJobListResponse { jobs })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn blocker(code: DbDataSyncBlockerCode) -> DbDataSyncBlocker {
    DbDataSyncBlocker {
      code,
      message: String::new(),
      table_name: None,
      level: None,
    }
  }

  #[test]
  fn target_snapshot_changed_blocks_execute_path() {
    assert!(has_target_snapshot_changed("hash-a", "hash-b"));
    assert!(!has_target_snapshot_changed("hash-a", "hash-a"));
  }

  #[test]
  fn readonly_target_blocks_preview_execute() {
    let blockers = vec![blocker(DbDataSyncBlockerCode::ReadonlyTarget)];
    assert!(contains_blocker(&blockers, DbDataSyncBlockerCode::ReadonlyTarget));
    assert!(has_blocking_blockers(&blockers));
  }

  #[test]
  fn unsafe_delete_confirmation_required_is_blocking() {
    let blockers = vec![blocker(DbDataSyncBlockerCode::UnsafeDeleteConfirmationRequired)];
    assert!(has_blocking_blockers(&blockers));
    assert!(is_blocking_blocker_code(&DbDataSyncBlockerCode::UnsafeDeleteConfirmationRequired));
  }

  #[test]
  fn target_database_confirmation_required_is_blocking() {
    let blockers = vec![blocker(DbDataSyncBlockerCode::TargetDatabaseConfirmationRequired)];
    assert!(has_blocking_blockers(&blockers));
    assert!(is_blocking_blocker_code(&DbDataSyncBlockerCode::TargetDatabaseConfirmationRequired));
  }

  #[test]
  fn sql_literals_escape_quotes() {
    assert_eq!(render_sql_literal(&Value::String("O'Reilly".to_string())), "'O''Reilly'");
  }

  #[test]
  fn delete_sql_uses_stable_key_where_clause() {
    let config = DbConnectionConfig {
      id: "target".to_string(),
      name: "Target".to_string(),
      driver: DbDriver::Postgres,
      host: "localhost".to_string(),
      port: 5432,
      database: "postgres".to_string(),
      username: "postgres".to_string(),
      password: String::new(),
      has_stored_password: false,
      clear_stored_password: false,
      environment: None,
      readonly: false,
      favorite: false,
      group_name: None,
      color_tag: None,
      default_schema: Some("public".to_string()),
      notes: None,
    };

    let selection = DbDataApplySelection {
      table_name: "orders".to_string(),
      row_key: HashMap::from([("id".to_string(), Value::from(9))]),
      action: DbDataSyncAction::Delete,
      compare_columns: None,
    };

    let sql = build_delete_sql(&config, &selection).expect("build delete sql");
    assert!(sql.contains("DELETE FROM \"public\".\"orders\""));
    assert!(sql.contains("\"id\" = 9"));
  }

  #[test]
  fn apply_plan_rejects_same_connection_pair() {
    let error = validate_distinct_connection_pair("same", "same")
      .expect_err("same connection pair should be rejected");
    assert!(error.contains("must be different"));
  }

  #[test]
  fn failure_context_targets_matching_table_result() {
    let mut results = vec![
      DbDataApplyTableResult {
        table_name: "customers".to_string(),
        action: DbDataSyncAction::Insert,
        attempted_rows: 2,
        succeeded_rows: 0,
        failed_rows: 0,
        error: None,
      },
      DbDataApplyTableResult {
        table_name: "orders".to_string(),
        action: DbDataSyncAction::Update,
        attempted_rows: 3,
        succeeded_rows: 0,
        failed_rows: 0,
        error: None,
      },
    ];

    mark_failed_with_context(
      &mut results,
      &ApplyExecutionFailure {
        table_name: Some("orders".to_string()),
        action: Some(DbDataSyncAction::Update),
        statement_index: Some(4),
        sql: Some("UPDATE orders SET status = 'done' WHERE id = 9;".to_string()),
        message: "apply statement failed: duplicate key".to_string(),
      },
    );

    assert!(results[0].error.is_none());
    assert!(results[1]
      .error
      .as_deref()
      .unwrap_or_default()
      .contains("statement #5 / table orders / action update"));
  }

  #[test]
  fn job_detail_returns_persisted_failure_rows() {
    let job = storage::DbDataApplyJobRecord {
      job_id: "job-1".to_string(),
      compare_id: "cmp-1".to_string(),
      source_connection_id: "src".to_string(),
      target_connection_id: "tgt".to_string(),
      status: "partial".to_string(),
      action_counts_json: serde_json::to_string(&DbDataDiffActionCounts {
        insert: 1,
        update: 1,
        delete: 0,
        unchanged: 0,
      })
      .expect("serialize counts"),
      target_snapshot_hash: "hash".to_string(),
      current_target_snapshot_hash: Some("hash".to_string()),
      blockers_json: "[]".to_string(),
      sql_preview_json: serde_json::to_string(&vec![
        "UPDATE orders SET status = 'done' WHERE id = 9;".to_string(),
      ])
      .expect("serialize sql preview"),
      preview_truncated: true,
      statement_count: 248,
      created_at: "2026-04-08T00:00:00Z".to_string(),
      started_at: Some("2026-04-08T00:00:01Z".to_string()),
      finished_at: Some("2026-04-08T00:00:02Z".to_string()),
    };

    let results = vec![storage::DbDataApplyResultRecord {
      job_id: "job-1".to_string(),
      table_name: "orders".to_string(),
      action_type: "update".to_string(),
      attempted_rows: 3,
      succeeded_rows: 2,
      failed_rows: 1,
      failure_json: Some("{\"row\":\"id=9\"}".to_string()),
    }];

    let detail = build_job_detail_response(&job, &results);
    assert_eq!(detail.status, DbDataApplyJobStatus::Partial);
    assert_eq!(detail.table_results.len(), 1);
    assert_eq!(detail.table_results[0].failed_rows, 1);
    assert_eq!(detail.table_results[0].error.as_deref(), Some("{\"row\":\"id=9\"}"));
    assert_eq!(detail.sql_preview_lines.len(), 1);
    assert_eq!(detail.sql_preview_lines[0], "UPDATE orders SET status = 'done' WHERE id = 9;");
    assert!(detail.preview_truncated);
    assert_eq!(detail.statement_count, 248);
  }

  #[test]
  fn background_job_summary_preserves_failure_context() {
    let job = storage::DbDataApplyJobRecord {
      job_id: "job-2".to_string(),
      compare_id: "cmp-2".to_string(),
      source_connection_id: "src".to_string(),
      target_connection_id: "tgt".to_string(),
      status: "failed".to_string(),
      action_counts_json: serde_json::to_string(&DbDataDiffActionCounts {
        insert: 1,
        update: 0,
        delete: 0,
        unchanged: 0,
      })
      .expect("serialize counts"),
      target_snapshot_hash: "hash-2".to_string(),
      current_target_snapshot_hash: None,
      blockers_json: serde_json::to_string(&vec![blocker(
        DbDataSyncBlockerCode::UnsafeDeleteConfirmationRequired,
      )])
      .expect("serialize blockers"),
      sql_preview_json: serde_json::to_string(&vec!["DELETE FROM users WHERE id = 1;".to_string()])
        .expect("serialize sql preview"),
      preview_truncated: false,
      statement_count: 1,
      created_at: "2026-04-08T00:00:00Z".to_string(),
      started_at: Some("2026-04-08T00:00:01Z".to_string()),
      finished_at: Some("2026-04-08T00:00:02Z".to_string()),
    };

    let results = vec![storage::DbDataApplyResultRecord {
      job_id: "job-2".to_string(),
      table_name: "users".to_string(),
      action_type: "delete".to_string(),
      attempted_rows: 1,
      succeeded_rows: 0,
      failed_rows: 1,
      failure_json: Some("{\"row\":\"id=1\"}".to_string()),
    }];

    let summary = build_background_job_summary(&job, &results);

    assert_eq!(summary.job_kind, DbBackgroundJobKind::DataApply);
    assert_eq!(summary.title, "Data Sync Apply");
    assert_eq!(summary.table_count, 1);
    assert_eq!(summary.primary_table_name.as_deref(), Some("users"));
    assert_eq!(summary.failure_summary.as_deref(), Some("users / delete / {\"row\":\"id=1\"}"));
    assert_eq!(summary.sql_preview_lines.len(), 1);
  }
}
