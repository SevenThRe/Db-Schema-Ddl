// EXPLAIN プラン正規化モジュール
// MySQL EXPLAIN FORMAT=JSON と PostgreSQL EXPLAIN FORMAT JSON を PlanNode ツリーに統一する

use std::sync::Arc;

use tauri::{AppHandle, State};

use super::{AnyPool, DbDriver, DbExplainPlan, DbPoolRegistry, ExplainRequest, PlanNode};

// ──────────────────────────────────────────────
// MySQL EXPLAIN 正規化
// ──────────────────────────────────────────────

/// MySQL EXPLAIN FORMAT=JSON の JSON を PlanNode ツリーに変換する
/// - access_type == "ALL" → FULL_TABLE_SCAN 警告
/// - rows > 10_000 → LARGE_ROWS_ESTIMATE 警告
pub fn normalize_mysql_explain(json: &serde_json::Value) -> PlanNode {
  // MySQL EXPLAIN FORMAT=JSON のルートは { "query_block": { ... } }
  let query_block = json.get("query_block").unwrap_or(json);
  normalize_mysql_node(query_block, "root", 0)
}

fn normalize_mysql_node(
  node: &serde_json::Value,
  label_hint: &str,
  depth: usize,
) -> PlanNode {
  let mut warnings = Vec::new();
  let id = format!("mysql-{depth}-{label_hint}");

  // テーブルノード
  if let Some(table) = node.get("table") {
    let table_name = table
      .get("table_name")
      .and_then(|v| v.as_str())
      .unwrap_or("");
    let access_type = table
      .get("access_type")
      .and_then(|v| v.as_str())
      .unwrap_or("");

    // フルテーブルスキャン検出
    if access_type.eq_ignore_ascii_case("ALL") {
      warnings.push("FULL_TABLE_SCAN".to_string());
    }

    // 大量行見積もり検出
    let rows = table
      .get("rows_examined_per_scan")
      .or_else(|| table.get("rows_produced_per_join"))
      .and_then(|v| v.as_u64())
      .unwrap_or(0);

    if rows > 10_000 {
      warnings.push("LARGE_ROWS_ESTIMATE".to_string());
    }

    return PlanNode {
      id,
      label: format!("{} ({})", table_name, access_type),
      node_type: "table_scan".to_string(),
      relation_name: Some(table_name.to_string()),
      cost: table
        .get("cost_info")
        .and_then(|c| c.get("read_cost"))
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok()),
      rows: if rows > 0 { Some(rows) } else { None },
      children: vec![],
      warnings,
    };
  }

  // ネストループノード
  if let Some(nested_loop) = node.get("nested_loop") {
    if let Some(arr) = nested_loop.as_array() {
      let children: Vec<PlanNode> = arr
        .iter()
        .enumerate()
        .map(|(i, child)| normalize_mysql_node(child, &format!("nested-{i}"), depth + 1))
        .collect();
      return PlanNode {
        id,
        label: "Nested Loop".to_string(),
        node_type: "nested_loop".to_string(),
        relation_name: None,
        cost: None,
        rows: None,
        children,
        warnings,
      };
    }
  }

  // ソート / グループ化ノード
  if let Some(ordering) = node.get("ordering_operation") {
    let child = normalize_mysql_node(ordering, "ordering-inner", depth + 1);
    let using_filesort = node
      .get("using_filesort")
      .and_then(|v| v.as_bool())
      .unwrap_or(false);
    return PlanNode {
      id,
      label: if using_filesort {
        "Sort (filesort)".to_string()
      } else {
        "Sort".to_string()
      },
      node_type: "sort".to_string(),
      relation_name: None,
      cost: None,
      rows: None,
      children: vec![child],
      warnings,
    };
  }

  // query_block を再帰
  if let Some(inner) = node.get("query_block") {
    return normalize_mysql_node(inner, "query_block", depth + 1);
  }

  // フォールバック — 構造不明ノード
  PlanNode {
    id,
    label: label_hint.to_string(),
    node_type: "unknown".to_string(),
    relation_name: None,
    cost: None,
    rows: None,
    children: vec![],
    warnings,
  }
}

// ──────────────────────────────────────────────
// PostgreSQL EXPLAIN 正規化
// ──────────────────────────────────────────────

/// PostgreSQL EXPLAIN FORMAT JSON の JSON（配列）を PlanNode ツリーに変換する
/// - Node Type == "Seq Scan" → FULL_TABLE_SCAN 警告
/// - Plan Rows > 10_000 → LARGE_ROWS_ESTIMATE 警告
pub fn normalize_pg_explain(json: &serde_json::Value) -> PlanNode {
  // PG EXPLAIN FORMAT JSON は [ { "Plan": { ... } } ] という形式
  let plan = if let Some(arr) = json.as_array() {
    arr.first()
      .and_then(|item| item.get("Plan"))
      .unwrap_or(json)
  } else {
    json.get("Plan").unwrap_or(json)
  };

  normalize_pg_node(plan, 0)
}

fn normalize_pg_node(node: &serde_json::Value, depth: usize) -> PlanNode {
  let mut warnings = Vec::new();
  let id = format!("pg-{depth}");

  let node_type = node
    .get("Node Type")
    .and_then(|v| v.as_str())
    .unwrap_or("Unknown");
  let relation_name = node
    .get("Relation Name")
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());
  let plan_rows = node
    .get("Plan Rows")
    .and_then(|v| v.as_u64())
    .unwrap_or(0);
  let total_cost = node
    .get("Total Cost")
    .and_then(|v| v.as_f64());

  // Seq Scan = フルテーブルスキャン
  if node_type.eq_ignore_ascii_case("Seq Scan") {
    warnings.push("FULL_TABLE_SCAN".to_string());
  }

  // 大量行見積もり
  if plan_rows > 10_000 {
    warnings.push("LARGE_ROWS_ESTIMATE".to_string());
  }

  // 子ノードを再帰
  let children: Vec<PlanNode> = node
    .get("Plans")
    .and_then(|v| v.as_array())
    .map(|plans| {
      plans
        .iter()
        .enumerate()
        .map(|(i, child)| normalize_pg_node(child, depth * 10 + i + 1))
        .collect()
    })
    .unwrap_or_default();

  let label = if let Some(rel) = &relation_name {
    format!("{} on {}", node_type, rel)
  } else {
    node_type.to_string()
  };

  PlanNode {
    id,
    label,
    node_type: node_type.to_lowercase().replace(' ', "_"),
    relation_name,
    cost: total_cost,
    rows: if plan_rows > 0 { Some(plan_rows) } else { None },
    children,
    warnings,
  }
}

// ──────────────────────────────────────────────
// Tauri コマンド
// ──────────────────────────────────────────────

/// 指定 SQL の EXPLAIN プランを取得して正規化済み PlanNode ツリーを返す
#[tauri::command]
pub async fn db_query_explain(
  app: AppHandle,
  pool_registry: State<'_, Arc<DbPoolRegistry>>,
  request: ExplainRequest,
) -> Result<DbExplainPlan, String> {
  use super::query::get_or_create_pool;
  use crate::storage;

  let configs = storage::list_db_connections(&app)?;
  let config = configs
    .into_iter()
    .find(|c| c.id == request.connection_id)
    .ok_or_else(|| format!("接続設定が見つかりません: {}", request.connection_id))?;

  let pool = get_or_create_pool(&pool_registry, &config).await?;

  // ダイアレクトに応じた EXPLAIN SQL を構築
  let explain_sql = match config.driver {
    DbDriver::Mysql => format!("EXPLAIN FORMAT=JSON {}", request.sql),
    DbDriver::Postgres => format!("EXPLAIN (FORMAT JSON) {}", request.sql),
  };

  // EXPLAIN を実行して JSON 文字列を取得
  let raw_json = execute_explain(&pool, &explain_sql, &config.driver).await?;

  let json_value: serde_json::Value = serde_json::from_str(&raw_json)
    .map_err(|e| format!("EXPLAIN JSON のパースに失敗: {e}"))?;

  // ダイアレクトに応じた正規化
  let root = match config.driver {
    DbDriver::Mysql => normalize_mysql_explain(&json_value),
    DbDriver::Postgres => normalize_pg_explain(&json_value),
  };

  Ok(DbExplainPlan {
    dialect: config.driver,
    root,
    raw_json,
  })
}

/// EXPLAIN クエリを実行して JSON 文字列を返す
async fn execute_explain(
  pool: &AnyPool,
  explain_sql: &str,
  driver: &DbDriver,
) -> Result<String, String> {
  match (pool, driver) {
    (AnyPool::Mysql(p), DbDriver::Mysql) => {
      let row: (String,) = sqlx::query_as(explain_sql)
        .fetch_one(p)
        .await
        .map_err(|e| format!("MySQL EXPLAIN エラー: {e}"))?;
      Ok(row.0)
    }
    (AnyPool::Postgres(p), DbDriver::Postgres) => {
      // PostgreSQL の EXPLAIN FORMAT JSON は TEXT[] として返ってくる場合がある
      use sqlx::Row;
      let rows = sqlx::query(explain_sql)
        .fetch_all(p)
        .await
        .map_err(|e| format!("PostgreSQL EXPLAIN エラー: {e}"))?;

      if let Some(row) = rows.first() {
        // 最初のカラムを文字列として取得
        let text: String = row.try_get(0).map_err(|e| e.to_string())?;
        Ok(text)
      } else {
        Err("EXPLAIN が空の結果を返しました".to_string())
      }
    }
    _ => Err("プールとドライバーの不一致".to_string()),
  }
}

// ──────────────────────────────────────────────
// ユニットテスト
// ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
  use super::*;

  fn mysql_explain_json_full_scan(table: &str, rows: u64) -> serde_json::Value {
    serde_json::json!({
      "query_block": {
        "table": {
          "table_name": table,
          "access_type": "ALL",
          "rows_examined_per_scan": rows,
          "cost_info": {
            "read_cost": "10.50"
          }
        }
      }
    })
  }

  fn mysql_explain_json_index_scan(table: &str) -> serde_json::Value {
    serde_json::json!({
      "query_block": {
        "table": {
          "table_name": table,
          "access_type": "ref",
          "rows_examined_per_scan": 5,
          "cost_info": {
            "read_cost": "1.00"
          }
        }
      }
    })
  }

  fn pg_explain_json_seq_scan(table: &str, rows: u64) -> serde_json::Value {
    serde_json::json!([{
      "Plan": {
        "Node Type": "Seq Scan",
        "Relation Name": table,
        "Plan Rows": rows,
        "Total Cost": 100.0
      }
    }])
  }

  fn pg_explain_json_index_scan(table: &str) -> serde_json::Value {
    serde_json::json!([{
      "Plan": {
        "Node Type": "Index Scan",
        "Relation Name": table,
        "Plan Rows": 5,
        "Total Cost": 5.0,
        "Index Name": "users_pkey"
      }
    }])
  }

  #[test]
  fn test_normalize_mysql_full_scan() {
    let json = mysql_explain_json_full_scan("users", 500);
    let plan = normalize_mysql_explain(&json);
    assert!(
      plan.warnings.contains(&"FULL_TABLE_SCAN".to_string()),
      "access_type=ALL のとき FULL_TABLE_SCAN 警告が付くべき"
    );
  }

  #[test]
  fn test_normalize_pg_seq_scan() {
    let json = pg_explain_json_seq_scan("orders", 1000);
    let plan = normalize_pg_explain(&json);
    assert!(
      plan.warnings.contains(&"FULL_TABLE_SCAN".to_string()),
      "Seq Scan のとき FULL_TABLE_SCAN 警告が付くべき"
    );
  }

  #[test]
  fn test_large_rows_warning() {
    // MySQL: rows > 10_000 のとき LARGE_ROWS_ESTIMATE
    let json = mysql_explain_json_full_scan("big_table", 50_000);
    let plan = normalize_mysql_explain(&json);
    assert!(
      plan.warnings.contains(&"LARGE_ROWS_ESTIMATE".to_string()),
      "rows > 10_000 のとき LARGE_ROWS_ESTIMATE 警告が付くべき"
    );

    // PostgreSQL: Plan Rows > 10_000 のとき LARGE_ROWS_ESTIMATE
    let json_pg = pg_explain_json_seq_scan("big_table", 20_000);
    let plan_pg = normalize_pg_explain(&json_pg);
    assert!(
      plan_pg.warnings.contains(&"LARGE_ROWS_ESTIMATE".to_string()),
      "PG rows > 10_000 のとき LARGE_ROWS_ESTIMATE 警告が付くべき"
    );
  }

  #[test]
  fn test_safe_index_scan() {
    // MySQL: access_type=ref → 警告なし
    let json = mysql_explain_json_index_scan("users");
    let plan = normalize_mysql_explain(&json);
    assert!(
      !plan.warnings.contains(&"FULL_TABLE_SCAN".to_string()),
      "インデックス使用時は FULL_TABLE_SCAN 警告なし"
    );

    // PostgreSQL: Index Scan → 警告なし
    let json_pg = pg_explain_json_index_scan("users");
    let plan_pg = normalize_pg_explain(&json_pg);
    assert!(
      !plan_pg.warnings.contains(&"FULL_TABLE_SCAN".to_string()),
      "Index Scan のとき FULL_TABLE_SCAN 警告なし"
    );
  }
}
