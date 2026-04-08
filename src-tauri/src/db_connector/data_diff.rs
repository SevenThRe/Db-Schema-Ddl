use std::collections::{BTreeMap, HashMap};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{DateTime, Duration, Utc};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::AppHandle;

use super::{
  DbDataDiffActionCounts, DbDataDiffDetailRequest, DbDataDiffDetailResponse,
  DbDataDiffFieldDelta, DbDataDiffPreviewRequest, DbDataDiffPreviewResponse, DbDataDiffRowDelta,
  DbDataDiffTableSummary, DbDataRowStatus, DbDataSyncAction, DbDataSyncBlocker,
  DbDataSyncBlockerCode,
};
use crate::storage;

fn epoch_millis() -> i64 {
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

    let row_key = key_columns
      .iter()
      .map(|column_name| {
        let source_value = source_row
          .and_then(|row| row.get(column_name))
          .cloned()
          .unwrap_or(Value::Null);
        (column_name.clone(), source_value)
      })
      .collect::<HashMap<_, _>>();

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
        let (field_diffs, changed_any) = compute_field_diffs(compare_columns, Some(source), Some(target));
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

pub async fn db_data_diff_preview(
  app: &AppHandle,
  request: DbDataDiffPreviewRequest,
) -> Result<DbDataDiffPreviewResponse, String> {
  let created_at = Utc::now();
  let expires_at = created_at + Duration::minutes(15);
  let compare_id = format!("cmp-{}", epoch_millis());

  let mut status_counts = empty_counts();
  let mut blockers = Vec::new();
  let mut table_summaries = Vec::new();
  let mut snapshot_seed = Vec::new();
  let mut table_records = Vec::new();

  for table in &request.tables {
    let fallback_business_keys = request
      .business_key_columns
      .as_ref()
      .and_then(|mapping| mapping.get(&table.table_name));

    let key_columns = resolve_stable_keys(
      &table.key_columns.clone().unwrap_or_default(),
      &[],
      fallback_business_keys,
    );

    let blocked = key_columns.is_empty();
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
    }

    let summary = DbDataDiffTableSummary {
      table_name: table.table_name.clone(),
      key_columns: key_columns.clone(),
      compare_columns: table.compare_columns.clone().unwrap_or_default(),
      status_counts: empty_counts(),
      blocked,
      blocker_codes: blocker_codes.clone(),
      sample_rows: vec![],
    };

    add_counts(&mut status_counts, &summary.status_counts);
    table_summaries.push(summary.clone());

    table_records.push(storage::DbDataCompareTableRecord {
      compare_id: compare_id.clone(),
      table_name: table.table_name.clone(),
      key_columns_json: serde_json::to_string(&summary.key_columns)
        .map_err(|error| format!("serialize key columns failed: {error}"))?,
      status_counts_json: serde_json::to_string(&summary.status_counts)
        .map_err(|error| format!("serialize status counts failed: {error}"))?,
      blocked,
      blocker_code: blocker_codes.first().map(|code| match code {
        DbDataSyncBlockerCode::MissingStableKey => "missing_stable_key".to_string(),
        DbDataSyncBlockerCode::TargetSnapshotChanged => "target_snapshot_changed".to_string(),
        DbDataSyncBlockerCode::UnsafeDeleteThreshold => "unsafe_delete_threshold".to_string(),
        DbDataSyncBlockerCode::ReadonlyTarget => "readonly_target".to_string(),
        DbDataSyncBlockerCode::ArtifactExpired => "artifact_expired".to_string(),
      }),
    });

    let mut row = HashMap::new();
    row.insert("table".to_string(), Value::String(table.table_name.clone()));
    row.insert(
      "keys".to_string(),
      Value::String(
        key_columns
          .iter()
          .map(String::as_str)
          .collect::<Vec<_>>()
          .join(","),
      ),
    );
    row.insert(
      "compareColumns".to_string(),
      Value::String(
        table
          .compare_columns
          .clone()
          .unwrap_or_default()
          .join(","),
      ),
    );
    snapshot_seed.push((table.table_name.clone(), vec![row]));
  }

  let target_snapshot_hash = compute_target_snapshot_hash(&snapshot_seed)?;

  storage::save_db_data_compare(
    app,
    &storage::DbDataCompareRecord {
      compare_id: compare_id.clone(),
      source_connection_id: request.source_connection_id.clone(),
      target_connection_id: request.target_connection_id.clone(),
      target_snapshot_hash: target_snapshot_hash.clone(),
      compare_scope_json: serde_json::to_string(&request.tables)
        .map_err(|error| format!("serialize compare scope failed: {error}"))?,
      created_at: created_at.to_rfc3339(),
      expires_at: expires_at.to_rfc3339(),
    },
    &table_records,
  )?;

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

  let mut blockers = Vec::new();
  if table_blocker_code.as_deref() == Some("missing_stable_key") {
    blockers.push(DbDataSyncBlocker {
      code: DbDataSyncBlockerCode::MissingStableKey,
      message: "Table has no stable key for deterministic matching.".to_string(),
      table_name: Some(request.table_name.clone()),
      level: Some("blocking".to_string()),
    });
  }

  let target_snapshot_hash = compare.target_snapshot_hash.clone();
  Ok(DbDataDiffDetailResponse {
    compare_id: request.compare_id,
    table_name: request.table_name,
    target_snapshot_hash,
    current_target_snapshot_hash: Some(compare.target_snapshot_hash),
    key_columns,
    compare_columns: vec![],
    rows: vec![],
    has_more: false,
    next_offset: None,
    blockers,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn row(values: &[(&str, Value)]) -> HashMap<String, Value> {
    let mut out = HashMap::new();
    for (key, value) in values {
      out.insert((*key).to_string(), value.clone());
    }
    out
  }

  #[test]
  fn key_precedence_prefers_primary_then_unique_then_business() {
    let primary = vec!["id".to_string()];
    let unique = vec!["code".to_string()];
    let business = vec!["biz_id".to_string()];
    assert_eq!(
      resolve_stable_keys(&primary, &unique, Some(&business)),
      vec!["id".to_string()]
    );

    let empty = Vec::<String>::new();
    assert_eq!(
      resolve_stable_keys(&empty, &unique, Some(&business)),
      vec!["code".to_string()]
    );

    assert_eq!(
      resolve_stable_keys(&empty, &empty, Some(&business)),
      vec!["biz_id".to_string()]
    );
  }

  #[test]
  fn status_count_classifies_insert_update_delete_and_unchanged() {
    let key_columns = vec!["id".to_string()];
    let compare_columns = vec!["name".to_string()];

    let source_rows = vec![
      row(&[("id", Value::from(1)), ("name", Value::from("new"))]),
      row(&[("id", Value::from(2)), ("name", Value::from("same"))]),
      row(&[("id", Value::from(4)), ("name", Value::from("only-source"))]),
    ];
    let target_rows = vec![
      row(&[("id", Value::from(1)), ("name", Value::from("old"))]),
      row(&[("id", Value::from(2)), ("name", Value::from("same"))]),
      row(&[("id", Value::from(3)), ("name", Value::from("only-target"))]),
    ];

    let (counts, deltas) = classify_table_rows(
      "users",
      &key_columns,
      &compare_columns,
      &source_rows,
      &target_rows,
    );

    assert_eq!(counts.insert, 1);
    assert_eq!(counts.update, 1);
    assert_eq!(counts.delete, 1);
    assert_eq!(counts.unchanged, 1);
    assert_eq!(deltas.len(), 4);
  }

  #[test]
  fn artifact_expired_detection_rejects_past_deadline() {
    let past = (Utc::now() - Duration::minutes(1)).to_rfc3339();
    let future = (Utc::now() + Duration::minutes(1)).to_rfc3339();

    assert!(is_artifact_expired(&past, Utc::now()));
    assert!(!is_artifact_expired(&future, Utc::now()));
    assert!(is_artifact_expired("not-an-iso-date", Utc::now()));
  }

  #[test]
  fn target_snapshot_hash_is_deterministic_for_equivalent_rows() {
    let payload_a = vec![(
      "users".to_string(),
      vec![
        row(&[("id", Value::from(2)), ("name", Value::from("b"))]),
        row(&[("id", Value::from(1)), ("name", Value::from("a"))]),
      ],
    )];
    let payload_b = vec![(
      "users".to_string(),
      vec![
        row(&[("name", Value::from("a")), ("id", Value::from(1))]),
        row(&[("name", Value::from("b")), ("id", Value::from(2))]),
      ],
    )];

    let hash_a = compute_target_snapshot_hash(&payload_a).expect("hash");
    let hash_b = compute_target_snapshot_hash(&payload_b).expect("hash");
    assert_eq!(hash_a, hash_b);
  }
}
