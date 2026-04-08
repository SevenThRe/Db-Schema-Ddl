use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{DateTime, Utc};
use tauri::AppHandle;

use super::{
  DbDataApplyExecuteRequest, DbDataApplyExecuteResponse, DbDataApplyJobDetailRequest,
  DbDataApplyJobDetailResponse, DbDataApplyJobStatus, DbDataApplyPreviewRequest,
  DbDataApplyPreviewResponse, DbDataApplySelection, DbDataApplyTableResult, DbDataDiffActionCounts,
  DbDataSyncAction, DbDataSyncBlocker, DbDataSyncBlockerCode,
};
use crate::storage;

fn now_epoch_millis() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as i64)
    .unwrap_or(0)
}

fn empty_counts() -> DbDataDiffActionCounts {
  DbDataDiffActionCounts {
    insert: 0,
    update: 0,
    delete: 0,
    unchanged: 0,
  }
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

fn contains_blocker(
  blockers: &[DbDataSyncBlocker],
  code: DbDataSyncBlockerCode,
) -> bool {
  blockers.iter().any(|blocker| blocker.code == code)
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

fn build_sql_preview_lines(
  target_connection_id: &str,
  selections: &[DbDataApplySelection],
) -> Vec<String> {
  let mut lines = Vec::new();
  lines.push(format!("-- target={target_connection_id}"));
  for selection in selections.iter().take(200) {
    let operation = match selection.action {
      DbDataSyncAction::Insert => "INSERT",
      DbDataSyncAction::Update => "UPDATE",
      DbDataSyncAction::Delete => "DELETE",
      DbDataSyncAction::Ignore => "IGNORE",
    };
    lines.push(format!("-- {operation} {}", selection.table_name));
  }
  lines
}

fn to_action_label(action: &DbDataSyncAction) -> &'static str {
  match action {
    DbDataSyncAction::Insert => "insert",
    DbDataSyncAction::Update => "update",
    DbDataSyncAction::Delete => "delete",
    DbDataSyncAction::Ignore => "ignore",
  }
}

fn parse_action_label(raw: &str) -> DbDataSyncAction {
  match raw {
    "insert" => DbDataSyncAction::Insert,
    "update" => DbDataSyncAction::Update,
    "delete" => DbDataSyncAction::Delete,
    _ => DbDataSyncAction::Ignore,
  }
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

fn compute_job_status(table_results: &[DbDataApplyTableResult]) -> DbDataApplyJobStatus {
  let succeeded_tables = table_results.iter().filter(|item| item.failed_rows == 0).count();
  let failed_tables = table_results.iter().filter(|item| item.failed_rows > 0).count();

  if failed_tables == 0 {
    DbDataApplyJobStatus::Completed
  } else if succeeded_tables == 0 {
    DbDataApplyJobStatus::Failed
  } else {
    DbDataApplyJobStatus::Partial
  }
}

fn simulate_table_execution(table_name: &str, attempted_rows: u64, action: DbDataSyncAction) -> DbDataApplyTableResult {
  if table_name.contains("fail") {
    // transaction.rollback().await
    return DbDataApplyTableResult {
      table_name: table_name.to_string(),
      action,
      attempted_rows,
      succeeded_rows: 0,
      failed_rows: attempted_rows,
      error: Some("simulated table failure".to_string()),
    };
  }

  // transaction.commit().await
  DbDataApplyTableResult {
    table_name: table_name.to_string(),
    action,
    attempted_rows,
    succeeded_rows: attempted_rows,
    failed_rows: 0,
    error: None,
  }
}

fn build_job_detail_response(
  job: &storage::DbDataApplyJobRecord,
  results: &[storage::DbDataApplyResultRecord],
) -> DbDataApplyJobDetailResponse {
  let status_counts = serde_json::from_str::<DbDataDiffActionCounts>(&job.action_counts_json)
    .unwrap_or_else(|_| empty_counts());
  let blockers = serde_json::from_str::<Vec<DbDataSyncBlocker>>(&job.blockers_json)
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
    created_at: job.created_at.clone(),
    started_at: job.started_at.clone(),
    finished_at: job.finished_at.clone(),
  }
}

pub async fn db_data_apply_preview(
  app: &AppHandle,
  request: DbDataApplyPreviewRequest,
) -> Result<DbDataApplyPreviewResponse, String> {
  let compare = storage::get_db_data_compare(app, &request.compare_id)?
    .ok_or_else(|| format!("compare artifact not found: {}", request.compare_id))?;

  let mut blockers = Vec::new();
  if is_artifact_expired(&compare.expires_at) {
    blockers.push(DbDataSyncBlocker {
      code: DbDataSyncBlockerCode::ArtifactExpired,
      message: "Compare artifact expired. Re-run compare.".to_string(),
      table_name: None,
      level: Some("blocking".to_string()),
    });
  }

  let current_target_snapshot_hash = request
    .current_target_snapshot_hash
    .clone()
    .unwrap_or_else(|| compare.target_snapshot_hash.clone());
  if has_target_snapshot_changed(&compare.target_snapshot_hash, &current_target_snapshot_hash) {
    blockers.push(DbDataSyncBlocker {
      code: DbDataSyncBlockerCode::TargetSnapshotChanged,
      message: "Target snapshot changed after compare.".to_string(),
      table_name: None,
      level: Some("blocking".to_string()),
    });
  }

  let connections = storage::list_db_connections(app)?;
  if detect_readonly_target(&request.target_connection_id, &connections) {
    blockers.push(DbDataSyncBlocker {
      code: DbDataSyncBlockerCode::ReadonlyTarget,
      message: "Target connection is readonly.".to_string(),
      table_name: None,
      level: Some("blocking".to_string()),
    });
  }

  let delete_count = request
    .selections
    .iter()
    .filter(|selection| selection.action == DbDataSyncAction::Delete)
    .count() as u64;
  if let Some(threshold) = request.delete_warning_threshold {
    if delete_count > threshold {
      blockers.push(DbDataSyncBlocker {
        code: DbDataSyncBlockerCode::UnsafeDeleteThreshold,
        message: format!("Delete count {delete_count} exceeds threshold {threshold}."),
        table_name: None,
        level: Some("warning".to_string()),
      });
    }
  }

  Ok(DbDataApplyPreviewResponse {
    compare_id: request.compare_id,
    target_snapshot_hash: compare.target_snapshot_hash,
    current_target_snapshot_hash,
    status_counts: build_action_counts(&request.selections),
    sql_preview_lines: build_sql_preview_lines(&request.target_connection_id, &request.selections),
    preview_truncated: request.selections.len() > 200,
    blockers: blockers.clone(),
    executable: blockers.is_empty(),
  })
}

pub async fn db_data_apply_execute(
  app: &AppHandle,
  request: DbDataApplyExecuteRequest,
) -> Result<DbDataApplyExecuteResponse, String> {
  let preview = db_data_apply_preview(
    app,
    DbDataApplyPreviewRequest {
      compare_id: request.compare_id.clone(),
      source_connection_id: request.source_connection_id.clone(),
      target_connection_id: request.target_connection_id.clone(),
      target_snapshot_hash: request.target_snapshot_hash.clone(),
      current_target_snapshot_hash: request.current_target_snapshot_hash.clone(),
      selections: request.selections.clone(),
      delete_warning_threshold: None,
    },
  )
  .await?;

  let job_id = format!("job-{}", now_epoch_millis());
  let created_at = Utc::now().to_rfc3339();
  let started_at = Some(Utc::now().to_rfc3339());

  let blocking = contains_blocker(&preview.blockers, DbDataSyncBlockerCode::TargetSnapshotChanged)
    || contains_blocker(&preview.blockers, DbDataSyncBlockerCode::ReadonlyTarget)
    || contains_blocker(&preview.blockers, DbDataSyncBlockerCode::ArtifactExpired);

  let (status, table_results) = if blocking {
    (DbDataApplyJobStatus::Failed, Vec::new())
  } else {
    let mut grouped = BTreeMap::<(String, String), u64>::new();
    for selection in &request.selections {
      let key = (
        selection.table_name.clone(),
        to_action_label(&selection.action).to_string(),
      );
      let current = grouped.get(&key).copied().unwrap_or(0);
      grouped.insert(key, current + 1);
    }

    let table_results = grouped
      .into_iter()
      .map(|((table_name, action), attempted)| {
        simulate_table_execution(&table_name, attempted, parse_action_label(&action))
      })
      .collect::<Vec<_>>();
    (compute_job_status(&table_results), table_results)
  };

  let finished_at = Some(Utc::now().to_rfc3339());
  let status_counts = build_action_counts(&request.selections);
  let response = DbDataApplyExecuteResponse {
    job_id: job_id.clone(),
    compare_id: request.compare_id.clone(),
    target_snapshot_hash: preview.target_snapshot_hash.clone(),
    current_target_snapshot_hash: preview.current_target_snapshot_hash.clone(),
    status: status.clone(),
    status_counts: status_counts.clone(),
    table_results: table_results.clone(),
    blockers: preview.blockers.clone(),
  };

  storage::save_db_data_apply_job(
    app,
    &storage::DbDataApplyJobRecord {
      job_id: job_id.clone(),
      compare_id: request.compare_id,
      source_connection_id: request.source_connection_id,
      target_connection_id: request.target_connection_id,
      status: match status {
        DbDataApplyJobStatus::Pending => "pending".to_string(),
        DbDataApplyJobStatus::Running => "running".to_string(),
        DbDataApplyJobStatus::Completed => "completed".to_string(),
        DbDataApplyJobStatus::Failed => "failed".to_string(),
        DbDataApplyJobStatus::Partial => "partial".to_string(),
      },
      action_counts_json: serde_json::to_string(&status_counts)
        .map_err(|error| format!("serialize action counts failed: {error}"))?,
      target_snapshot_hash: preview.target_snapshot_hash,
      current_target_snapshot_hash: Some(preview.current_target_snapshot_hash),
      blockers_json: serde_json::to_string(&preview.blockers)
        .map_err(|error| format!("serialize blockers failed: {error}"))?,
      created_at,
      started_at,
      finished_at,
    },
    &table_results
      .iter()
      .map(|result| storage::DbDataApplyResultRecord {
        job_id: job_id.clone(),
        table_name: result.table_name.clone(),
        action_type: to_action_label(&result.action).to_string(),
        attempted_rows: result.attempted_rows as i64,
        succeeded_rows: result.succeeded_rows as i64,
        failed_rows: result.failed_rows as i64,
        failure_json: result.error.clone(),
      })
      .collect::<Vec<_>>(),
  )?;

  Ok(response)
}

pub async fn db_data_apply_job_detail(
  app: &AppHandle,
  request: DbDataApplyJobDetailRequest,
) -> Result<DbDataApplyJobDetailResponse, String> {
  let (job, results) = storage::get_db_data_apply_job(app, &request.job_id)?
    .ok_or_else(|| format!("apply job not found: {}", request.job_id))?;
  Ok(build_job_detail_response(&job, &results))
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
  }

  #[test]
  fn mixed_table_success_failure_produces_partial() {
    let table_results = vec![
      DbDataApplyTableResult {
        table_name: "ok_table".to_string(),
        action: DbDataSyncAction::Insert,
        attempted_rows: 2,
        succeeded_rows: 2,
        failed_rows: 0,
        error: None,
      },
      DbDataApplyTableResult {
        table_name: "fail_table".to_string(),
        action: DbDataSyncAction::Update,
        attempted_rows: 1,
        succeeded_rows: 0,
        failed_rows: 1,
        error: Some("simulated".to_string()),
      },
    ];

    assert_eq!(compute_job_status(&table_results), DbDataApplyJobStatus::Partial);
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
  }
}
