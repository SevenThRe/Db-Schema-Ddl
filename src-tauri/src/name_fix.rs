// 物理名修正モジュール: shared/physical-name.ts アルゴリズムの Rust 移植
// 論理名 → 物理名 (snake_case) の変換・重複解決・予約語チェックを担う

use std::collections::HashSet;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::models::TableInfo;

// ──────────────────────────────────────────────
// 定数
// ──────────────────────────────────────────────

const DEFAULT_TABLE_FALLBACK: &str = "unnamed_table";
const DEFAULT_COLUMN_FALLBACK_PREFIX: &str = "column_";
const DEFAULT_RESERVED_PREFIX: &str = "n_";
const MAX_IDENTIFIER_LENGTH_DEFAULT: usize = 64;
const MAX_IDENTIFIER_LENGTH_MIN: usize = 8;
const MAX_IDENTIFIER_LENGTH_MAX: usize = 255;

/// SQL 予約語セット (MySQL + ANSI 共通)
fn reserved_words() -> HashSet<&'static str> {
  [
    "add", "all", "alter", "and", "as", "asc", "between", "by", "case", "check", "column",
    "constraint", "create", "database", "default", "delete", "desc", "distinct", "drop", "else",
    "exists", "foreign", "from", "group", "having", "in", "index", "insert", "into", "is",
    "join", "key", "like", "limit", "not", "null", "on", "or", "order", "primary", "references",
    "select", "set", "table", "then", "to", "union", "unique", "update", "user", "using",
    "values", "view", "when", "where",
  ]
  .into_iter()
  .collect()
}

// ──────────────────────────────────────────────
// 入力オプション型
// ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NameFixPlanOptions {
  pub conflict_strategy: Option<String>,     // "suffix_increment" | "hash_suffix" | "abort"
  pub reserved_word_strategy: Option<String>, // "prefix" | "abort"
  pub length_overflow_strategy: Option<String>, // "truncate_hash" | "abort"
  pub max_identifier_length: Option<usize>,
  pub reserved_prefix: Option<String>,
}

// ──────────────────────────────────────────────
// 出力型 (shared/schema.ts の型に対応)
// ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NameFixConflict {
  #[serde(rename = "type")]
  pub conflict_type: String, // "table_duplicate" | "column_duplicate" | "reserved_word" | "length_overflow" | "invalid_name"
  pub blocking: bool,
  pub table_index: usize,
  pub column_index: Option<usize>,
  pub target: String, // "table" | "column"
  pub current_name: String,
  pub attempted_name: String,
  pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NameFixDecisionTrace {
  pub target: String,
  pub table_index: usize,
  pub column_index: Option<usize>,
  pub before: String,
  pub normalized: String,
  pub after: String,
  pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NameFixColumnMapping {
  pub column_index: usize,
  pub before: String,
  pub after: String,
  pub changed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NameFixTableMapping {
  pub table_index: usize,
  pub table_before: String,
  pub table_after: String,
  pub table_changed: bool,
  pub columns: Vec<NameFixColumnMapping>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NameFixPreviewResponse {
  pub file_id: i64,
  pub sheet_name: String,
  pub plan_id: String,
  pub changed_table_count: usize,
  pub changed_column_count: usize,
  pub unresolved_source_ref_count: usize,
  pub conflicts: Vec<NameFixConflict>,
  pub blocking_conflicts: Vec<NameFixConflict>,
  pub decision_trace: Vec<NameFixDecisionTrace>,
  pub mappings: Vec<NameFixTableMapping>,
}

// ──────────────────────────────────────────────
// コアアルゴリズム (physical-name.ts の移植)
// ──────────────────────────────────────────────

/// 識別子の最大長を正規化する (8..=255 の範囲にクランプ)
fn normalize_identifier_length(value: Option<usize>) -> usize {
  let v = value.unwrap_or(MAX_IDENTIFIER_LENGTH_DEFAULT);
  v.clamp(MAX_IDENTIFIER_LENGTH_MIN, MAX_IDENTIFIER_LENGTH_MAX)
}

/// FNV-1a ハッシュで 6 桁の 16 進文字列を返す (JS 版 shortHash の移植)
fn short_hash(input: &str) -> String {
  let mut hash: u32 = 2_166_136_261;
  for byte in input.bytes() {
    hash ^= byte as u32;
    hash = hash.wrapping_mul(16_777_619);
  }
  format!("{:08x}", hash)[..6].to_string()
}

/// suffix を末尾に付けて max_length に収まるよう base を切り詰める
fn clamp_with_suffix(base: &str, suffix: &str, max_length: usize) -> String {
  if base.len() + suffix.len() <= max_length {
    return format!("{base}{suffix}");
  }
  let trimmed_len = (max_length as isize - suffix.len() as isize).max(1) as usize;
  format!("{}{}", &base[..trimmed_len.min(base.len())], suffix)
}

/// 識別子が物理名パターン `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$` に適合するか検証する
pub fn is_valid_physical_name(name: &str) -> bool {
  if name.is_empty() {
    return false;
  }
  let re = Regex::new(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$").unwrap();
  re.is_match(name.trim())
}

/// 任意の文字列を物理名 (snake_case) に正規化する
pub fn normalize_physical_name(name: &str, fallback: &str) -> String {
  let raw = name.trim();
  if raw.is_empty() {
    return fallback.to_string();
  }

  // camelCase 境界に _ を挿入
  let camel_re = Regex::new(r"([a-z0-9])([A-Z])").unwrap();
  let step1 = camel_re.replace_all(raw, "${1}_${2}");

  // 英数字 + _ 以外を _ に置換
  let non_alnum_re = Regex::new(r"[^A-Za-z0-9_]+").unwrap();
  let step2 = non_alnum_re.replace_all(&step1, "_");

  // 小文字化
  let step3 = step2.to_lowercase();

  // 連続アンダースコアを単一に
  let multi_re = Regex::new(r"_+").unwrap();
  let step4 = multi_re.replace_all(&step3, "_");

  // 先頭・末尾のアンダースコアを除去
  let edge_re = Regex::new(r"^_+|_+$").unwrap();
  let mut normalized = edge_re.replace_all(&step4, "").to_string();

  if normalized.is_empty() {
    normalized = fallback.to_string();
  }

  // 数字で始まる場合はプレフィックスを付与
  if normalized.starts_with(|c: char| c.is_ascii_digit()) {
    normalized = format!("t_{normalized}");
  }

  normalized
}

struct ResolveResult {
  value: String,
  changed: bool,
  blocking: bool,
}

fn resolve_length_overflow(
  value: &str,
  max_length: usize,
  strategy: &str,
) -> ResolveResult {
  if value.len() <= max_length {
    return ResolveResult { value: value.to_string(), changed: false, blocking: false };
  }

  if strategy == "abort" {
    return ResolveResult { value: value.to_string(), changed: false, blocking: true };
  }

  // truncate_hash: 末尾にハッシュを付けて切り詰める
  let suffix = format!("_{}", short_hash(value));
  let trimmed = clamp_with_suffix(value, &suffix, max_length);
  ResolveResult { value: trimmed, changed: true, blocking: false }
}

fn resolve_reserved_word(
  value: &str,
  strategy: &str,
  reserved_prefix: &str,
) -> ResolveResult {
  if !reserved_words().contains(value.to_lowercase().as_str()) {
    return ResolveResult { value: value.to_string(), changed: false, blocking: false };
  }

  if strategy == "abort" {
    return ResolveResult { value: value.to_string(), changed: false, blocking: true };
  }

  let prefix = if reserved_prefix.trim().is_empty() {
    DEFAULT_RESERVED_PREFIX
  } else {
    reserved_prefix.trim()
  };
  ResolveResult {
    value: format!("{prefix}{value}"),
    changed: true,
    blocking: false,
  }
}

fn resolve_duplicate(
  value: &str,
  key_prefix: &str,
  used_names: &HashSet<String>,
  max_length: usize,
  strategy: &str,
) -> ResolveResult {
  let lower_value = value.to_lowercase();
  if !used_names.contains(&lower_value) {
    return ResolveResult { value: value.to_string(), changed: false, blocking: false };
  }

  if strategy == "abort" {
    return ResolveResult { value: value.to_string(), changed: false, blocking: true };
  }

  if strategy == "hash_suffix" {
    let hash = short_hash(&format!("{key_prefix}:{value}"));
    let candidate = clamp_with_suffix(value, &format!("_{hash}"), max_length);
    if !used_names.contains(&candidate.to_lowercase()) {
      return ResolveResult { value: candidate, changed: true, blocking: false };
    }
  }

  // suffix_increment: _2, _3, ...
  for i in 2..10_000usize {
    let suffix = format!("_{i}");
    let candidate = clamp_with_suffix(value, &suffix, max_length);
    if !used_names.contains(&candidate.to_lowercase()) {
      return ResolveResult { value: candidate, changed: true, blocking: false };
    }
  }

  ResolveResult { value: value.to_string(), changed: false, blocking: true }
}

struct CandidateResolution {
  resolved: String,
  conflicts: Vec<(String, bool, String)>, // (type, blocking, reason)
  reasons: Vec<String>,
  normalized: String,
}

fn resolve_candidate(
  original_value: &str,
  fallback_name: &str,
  key_prefix: &str,
  used_names: &HashSet<String>,
  conflict_strategy: &str,
  reserved_word_strategy: &str,
  length_overflow_strategy: &str,
  max_identifier_length: usize,
  reserved_prefix: &str,
) -> CandidateResolution {
  let mut conflicts: Vec<(String, bool, String)> = Vec::new();
  let mut reasons: Vec<String> = Vec::new();
  let normalized = normalize_physical_name(
    if original_value.is_empty() { fallback_name } else { original_value },
    fallback_name,
  );
  let mut candidate = normalized.clone();

  if !is_valid_physical_name(&candidate) {
    conflicts.push((
      "invalid_name".to_string(),
      true,
      "Normalized name still violates identifier pattern.".to_string(),
    ));
  }

  let reserved_result = resolve_reserved_word(&candidate, reserved_word_strategy, reserved_prefix);
  if reserved_result.changed {
    reasons.push("reserved_word_prefixed".to_string());
    candidate = reserved_result.value;
  }
  if reserved_result.blocking {
    conflicts.push((
      "reserved_word".to_string(),
      true,
      "Identifier is a reserved word and strategy is abort.".to_string(),
    ));
  }

  let overflow_result = resolve_length_overflow(&candidate, max_identifier_length, length_overflow_strategy);
  if overflow_result.changed {
    reasons.push("length_overflow_truncated".to_string());
    candidate = overflow_result.value;
  }
  if overflow_result.blocking {
    conflicts.push((
      "length_overflow".to_string(),
      true,
      format!("Identifier length exceeds max {max_identifier_length}."),
    ));
  }

  let dup_result = resolve_duplicate(&candidate, key_prefix, used_names, max_identifier_length, conflict_strategy);
  if dup_result.changed {
    reasons.push("duplicate_resolved".to_string());
    candidate = dup_result.value;
  }
  if dup_result.blocking {
    let conflict_type = if key_prefix.starts_with("table:") {
      "table_duplicate"
    } else {
      "column_duplicate"
    };
    conflicts.push((
      conflict_type.to_string(),
      true,
      "Identifier duplicate cannot be resolved with current conflict strategy.".to_string(),
    ));
  }

  CandidateResolution { resolved: candidate, conflicts, reasons, normalized }
}

// ──────────────────────────────────────────────
// パブリック API
// ──────────────────────────────────────────────

/// TableInfo[] に対してプレビュー用の名前修正プランを計算する
pub fn compute_name_fix_plan(
  tables: &[TableInfo],
  options: &NameFixPlanOptions,
) -> (Vec<NameFixTableMapping>, Vec<NameFixConflict>, Vec<NameFixDecisionTrace>, usize, usize) {
  let conflict_strategy = options.conflict_strategy.as_deref().unwrap_or("suffix_increment");
  let reserved_word_strategy = options.reserved_word_strategy.as_deref().unwrap_or("prefix");
  let length_overflow_strategy = options.length_overflow_strategy.as_deref().unwrap_or("truncate_hash");
  let max_identifier_length = normalize_identifier_length(options.max_identifier_length);
  let reserved_prefix = options.reserved_prefix.as_deref().unwrap_or(DEFAULT_RESERVED_PREFIX);

  let mut global_table_names: HashSet<String> = HashSet::new();
  let mut all_conflicts: Vec<NameFixConflict> = Vec::new();
  let mut all_traces: Vec<NameFixDecisionTrace> = Vec::new();
  let mut changed_table_count = 0usize;
  let mut changed_column_count = 0usize;

  let mut mappings: Vec<NameFixTableMapping> = Vec::new();

  for (table_index, table) in tables.iter().enumerate() {
    let table_input = {
      let physical = table.physical_table_name.trim().to_string();
      let logical = table.logical_table_name.trim().to_string();
      if !physical.is_empty() { physical } else if !logical.is_empty() { logical } else { DEFAULT_TABLE_FALLBACK.to_string() }
    };

    let table_result = resolve_candidate(
      &table_input,
      DEFAULT_TABLE_FALLBACK,
      &format!("table:{table_index}"),
      &global_table_names,
      conflict_strategy,
      reserved_word_strategy,
      length_overflow_strategy,
      max_identifier_length,
      reserved_prefix,
    );

    let resolved_table_name = table_result.resolved.clone();
    let table_before = table.physical_table_name.clone();
    let table_changed = resolved_table_name != table_before;
    if table_changed {
      changed_table_count += 1;
    }
    global_table_names.insert(resolved_table_name.to_lowercase());

    for (conflict_type, blocking, reason) in &table_result.conflicts {
      all_conflicts.push(NameFixConflict {
        conflict_type: conflict_type.clone(),
        blocking: *blocking,
        table_index,
        column_index: None,
        target: "table".to_string(),
        current_name: table_input.clone(),
        attempted_name: resolved_table_name.clone(),
        reason: reason.clone(),
      });
    }
    all_traces.push(NameFixDecisionTrace {
      target: "table".to_string(),
      table_index,
      column_index: None,
      before: table_before.clone(),
      normalized: table_result.normalized.clone(),
      after: resolved_table_name.clone(),
      reasons: table_result.reasons.clone(),
    });

    // 列ごとの名前解決
    let mut per_table_col_names: HashSet<String> = HashSet::new();
    let mut col_mappings: Vec<NameFixColumnMapping> = Vec::new();

    for (col_index, col) in table.columns.iter().enumerate() {
      let col_input = {
        let physical = col.physical_name.as_deref().unwrap_or("").trim().to_string();
        let logical = col.logical_name.as_deref().unwrap_or("").trim().to_string();
        let comment = col.comment.as_deref().unwrap_or("").trim().to_string();
        if !physical.is_empty() {
          physical
        } else if !logical.is_empty() {
          logical
        } else if !comment.is_empty() {
          comment
        } else {
          format!("{DEFAULT_COLUMN_FALLBACK_PREFIX}{}", col_index + 1)
        }
      };

      let col_fallback = format!("{DEFAULT_COLUMN_FALLBACK_PREFIX}{}", col_index + 1);
      let col_result = resolve_candidate(
        &col_input,
        &col_fallback,
        &format!("col:{table_index}:{col_index}"),
        &per_table_col_names,
        conflict_strategy,
        reserved_word_strategy,
        length_overflow_strategy,
        max_identifier_length,
        reserved_prefix,
      );

      let resolved_col_name = col_result.resolved.clone();
      let col_before = col.physical_name.clone().unwrap_or_default();
      let col_changed = resolved_col_name != col_before;
      if col_changed {
        changed_column_count += 1;
      }
      per_table_col_names.insert(resolved_col_name.to_lowercase());

      for (conflict_type, blocking, reason) in &col_result.conflicts {
        all_conflicts.push(NameFixConflict {
          conflict_type: conflict_type.clone(),
          blocking: *blocking,
          table_index,
          column_index: Some(col_index),
          target: "column".to_string(),
          current_name: col_input.clone(),
          attempted_name: resolved_col_name.clone(),
          reason: reason.clone(),
        });
      }
      all_traces.push(NameFixDecisionTrace {
        target: "column".to_string(),
        table_index,
        column_index: Some(col_index),
        before: col_before,
        normalized: col_result.normalized.clone(),
        after: resolved_col_name.clone(),
        reasons: col_result.reasons.clone(),
      });

      col_mappings.push(NameFixColumnMapping {
        column_index: col_index,
        before: col_input,
        after: resolved_col_name,
        changed: col_changed,
      });
    }

    mappings.push(NameFixTableMapping {
      table_index,
      table_before,
      table_after: resolved_table_name,
      table_changed,
      columns: col_mappings,
    });
  }

  (mappings, all_conflicts, all_traces, changed_table_count, changed_column_count)
}

// ──────────────────────────────────────────────
// テスト
// ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
  use super::*;

  fn make_options() -> NameFixPlanOptions {
    NameFixPlanOptions {
      conflict_strategy: None,
      reserved_word_strategy: None,
      length_overflow_strategy: None,
      max_identifier_length: None,
      reserved_prefix: None,
    }
  }

  #[test]
  fn normalizes_camel_case_to_snake_case() {
    assert_eq!(normalize_physical_name("employeeName", "fallback"), "employee_name");
    assert_eq!(normalize_physical_name("MyTableName", "fallback"), "my_table_name");
  }

  #[test]
  fn normalizes_japanese_and_special_chars() {
    // 日本語は非英数字として _ に置換される
    let result = normalize_physical_name("社員ID", "fallback");
    assert!(!result.is_empty(), "should not be empty");
    assert!(result.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'));
  }

  #[test]
  fn prefixes_digit_start_names() {
    let result = normalize_physical_name("123abc", "fallback");
    assert!(result.starts_with("t_"), "digit-start name should get t_ prefix");
  }

  #[test]
  fn is_valid_physical_name_accepts_snake_case() {
    assert!(is_valid_physical_name("employee_name"));
    assert!(is_valid_physical_name("t_123abc"));
    assert!(!is_valid_physical_name("EmployeeName"));
    assert!(!is_valid_physical_name(""));
    assert!(!is_valid_physical_name("123abc"));
  }

  #[test]
  fn reserved_word_gets_prefixed_by_default() {
    let result = resolve_reserved_word("select", "prefix", DEFAULT_RESERVED_PREFIX);
    assert_eq!(result.value, "n_select");
    assert!(result.changed);
    assert!(!result.blocking);
  }

  #[test]
  fn reserved_word_abort_strategy_is_blocking() {
    let result = resolve_reserved_word("select", "abort", DEFAULT_RESERVED_PREFIX);
    assert!(result.blocking);
    assert!(!result.changed);
  }

  #[test]
  fn length_overflow_truncates_with_hash() {
    let long_name = "a".repeat(70);
    let result = resolve_length_overflow(&long_name, 64, "truncate_hash");
    assert!(result.changed);
    assert!(result.value.len() <= 64, "result should be within max length");
    assert!(!result.blocking);
  }

  #[test]
  fn duplicate_gets_suffix_increment() {
    let mut used: HashSet<String> = HashSet::new();
    used.insert("employee".to_string());
    let result = resolve_duplicate("employee", "table:0", &used, 64, "suffix_increment");
    assert!(result.changed);
    assert_eq!(result.value, "employee_2");
  }

  #[test]
  fn compute_plan_counts_changed_tables() {
    use crate::models::TableInfo;
    let tables = vec![
      TableInfo {
        physical_table_name: "EmployeeTable".to_string(), // 変換が必要
        logical_table_name: "社員テーブル".to_string(),
        columns: vec![],
        column_range: None,
        row_range: None,
        excel_range: None,
        source_ref: None,
      },
    ];

    let opts = make_options();
    let (mappings, conflicts, _traces, changed_tables, _changed_cols) =
      compute_name_fix_plan(&tables, &opts);

    assert_eq!(mappings.len(), 1);
    assert_eq!(mappings[0].table_after, "employee_table");
    assert!(mappings[0].table_changed);
    assert_eq!(changed_tables, 1);
    assert!(conflicts.is_empty(), "no conflicts expected for simple name");
  }

  #[test]
  fn compute_plan_resolves_duplicate_table_names() {
    use crate::models::TableInfo;
    let tables = vec![
      TableInfo {
        physical_table_name: "employee".to_string(),
        logical_table_name: "".to_string(),
        columns: vec![],
        column_range: None,
        row_range: None,
        excel_range: None,
        source_ref: None,
      },
      TableInfo {
        physical_table_name: "employee".to_string(), // 重複
        logical_table_name: "".to_string(),
        columns: vec![],
        column_range: None,
        row_range: None,
        excel_range: None,
        source_ref: None,
      },
    ];

    let opts = make_options();
    let (mappings, _conflicts, _traces, _ct, _cc) = compute_name_fix_plan(&tables, &opts);

    assert_ne!(
      mappings[0].table_after, mappings[1].table_after,
      "duplicate table names should be resolved to unique names"
    );
  }
}
