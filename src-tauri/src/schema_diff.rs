use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::commands::resolve_parse_options_pub;
use crate::excel;
use crate::models::{ColumnInfo, TableInfo};
use crate::storage;

// ──────────────────────────────────────────────
// 定数
// ──────────────────────────────────────────────

const SCHEMA_DIFF_ALGORITHM_VERSION: &str = "schema-diff-v2";
const MAX_BASELINE_CANDIDATES: usize = 24;

// ──────────────────────────────────────────────
// 閾値設定
// ──────────────────────────────────────────────

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DiffThresholds {
    pub baseline_auto_select_min: f64,
    pub table_match_strong: f64,
    pub table_rename_candidate: f64,
    pub column_match_strong: f64,
    pub column_rename_candidate: f64,
    pub ambiguity_gap: f64,
}

impl Default for DiffThresholds {
    fn default() -> Self {
        Self {
            baseline_auto_select_min: 0.65,
            table_match_strong: 0.80,
            table_rename_candidate: 0.65,
            column_match_strong: 0.80,
            column_rename_candidate: 0.65,
            ambiguity_gap: 0.08,
        }
    }
}

// ──────────────────────────────────────────────
// パブリックな Serde 型（Tauri レスポンス用）
// ──────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffVersionLink {
    pub new_file_id: i64,
    pub old_file_id: i64,
    pub mode: String,
    pub confidence: f64,
    pub low_confidence: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiffSummary {
    pub added_tables: usize,
    pub removed_tables: usize,
    pub changed_tables: usize,
    pub rename_suggestions: usize,
    pub pending_confirmations: usize,
    pub added_columns: usize,
    pub removed_columns: usize,
    pub changed_columns: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffColumnChange {
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    #[serde(default)]
    pub requires_confirmation: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_column: Option<ColumnInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_column: Option<ColumnInfo>,
    #[serde(default)]
    pub changed_fields: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffTableChange {
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    #[serde(default)]
    pub requires_confirmation: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_table: Option<TableInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_table: Option<TableInfo>,
    #[serde(default)]
    pub changed_fields: Vec<String>,
    #[serde(default)]
    pub column_changes: Vec<DiffColumnChange>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffSheet {
    pub sheet_name: String,
    pub table_changes: Vec<DiffTableChange>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffRenameSuggestion {
    pub entity_type: String,
    pub entity_key: String,
    pub confidence: f64,
    pub sheet_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_name_before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_name_after: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column_name_before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column_name_after: Option<String>,
    pub decision: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpChangedTable {
    pub sheet_name: String,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    pub requires_confirmation: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpChangedColumn {
    pub sheet_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_name: Option<String>,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    pub requires_confirmation: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiffMcpHints {
    pub changed_tables: Vec<McpChangedTable>,
    pub changed_columns: Vec<McpChangedColumn>,
    pub impact_keywords: Vec<String>,
    pub next_actions: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffPreviewResponse {
    pub diff_id: String,
    pub cache_hit: bool,
    pub algorithm_version: String,
    pub scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sheet_name: Option<String>,
    pub link: DiffVersionLink,
    pub summary: DiffSummary,
    pub sheets: Vec<DiffSheet>,
    pub rename_suggestions: Vec<DiffRenameSuggestion>,
    pub mcp_hints: DiffMcpHints,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffConfirmResponse {
    pub diff_id: String,
    pub summary: DiffSummary,
    pub sheets: Vec<DiffSheet>,
    pub rename_suggestions: Vec<DiffRenameSuggestion>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffAlterArtifact {
    pub artifact_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sheet_name: Option<String>,
    pub sql: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffAlterPreviewResponse {
    pub diff_id: String,
    pub dialect: String,
    pub split_by_sheet: bool,
    pub output_mode: String,
    pub artifacts: Vec<DiffAlterArtifact>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffRenameDecisionItem {
    pub entity_type: String,
    pub entity_key: String,
    pub decision: String,
}

// ──────────────────────────────────────────────
// 内部スナップショット型（DBにJSON保存される）
// ──────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotSheet {
    sheet_name: String,
    tables: Vec<TableInfo>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotPayload {
    file_id: i64,
    sheets: Vec<SnapshotSheet>,
}

// ──────────────────────────────────────────────
// 保存済み差分ペイロード
// ──────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredDiff {
    algorithm_version: String,
    scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sheet_name: Option<String>,
    link: DiffVersionLink,
    summary: DiffSummary,
    sheets: Vec<DiffSheet>,
    rename_suggestions: Vec<DiffRenameSuggestion>,
}

// ──────────────────────────────────────────────
// ユーティリティ関数
// ──────────────────────────────────────────────

/// 名前を正規化する（トリム、小文字化、連続空白をアンダースコアに変換）
fn normalize_name(input: &str) -> String {
    let trimmed = input.trim().to_lowercase();
    let mut result = String::with_capacity(trimmed.len());
    let mut prev_was_space = false;
    for ch in trimmed.chars() {
        if ch.is_whitespace() {
            if !prev_was_space {
                result.push('_');
            }
            prev_was_space = true;
        } else {
            result.push(ch);
            prev_was_space = false;
        }
    }
    result
}

/// バイグラム類似度を計算する
fn bigram_similarity(a: Option<&str>, b: Option<&str>) -> f64 {
    let na = normalize_name(a.unwrap_or(""));
    let nb = normalize_name(b.unwrap_or(""));

    if na.is_empty() && nb.is_empty() {
        return 1.0;
    }
    if na.is_empty() || nb.is_empty() {
        return 0.0;
    }
    if na == nb {
        return 1.0;
    }

    let to_bigrams = |s: &str| -> Vec<String> {
        let chars: Vec<char> = s.chars().collect();
        if chars.len() < 2 {
            return vec![s.to_string()];
        }
        (0..chars.len() - 1)
            .map(|i| format!("{}{}", chars[i], chars[i + 1]))
            .collect()
    };

    let grams_a = to_bigrams(&na);
    let grams_b = to_bigrams(&nb);

    let mut counts: HashMap<String, i32> = HashMap::new();
    for gram in &grams_a {
        *counts.entry(gram.clone()).or_insert(0) += 1;
    }

    let mut overlap = 0;
    for gram in &grams_b {
        if let Some(count) = counts.get_mut(gram) {
            if *count > 0 {
                overlap += 1;
                *count -= 1;
            }
        }
    }

    (2.0 * overlap as f64) / (grams_a.len() + grams_b.len()) as f64
}

/// Jaccard 類似度を計算する
fn jaccard_similarity(a: &HashSet<String>, b: &HashSet<String>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    let intersection = a.iter().filter(|v| b.contains(*v)).count();
    let union: HashSet<&String> = a.iter().chain(b.iter()).collect();
    if union.is_empty() {
        return 0.0;
    }
    intersection as f64 / union.len() as f64
}

/// テーブルのカラム名セットを構築する
fn build_table_column_name_set(table: &TableInfo) -> HashSet<String> {
    let mut set = HashSet::new();
    for col in &table.columns {
        let name = normalize_name(
            col.physical_name
                .as_deref()
                .filter(|s| !s.is_empty())
                .or(col.logical_name.as_deref())
                .unwrap_or(""),
        );
        if !name.is_empty() {
            set.insert(name);
        }
    }
    set
}

/// テーブル類似度スコアを計算する
fn score_table_similarity(old: &TableInfo, new: &TableInfo) -> f64 {
    let physical_score = bigram_similarity(
        Some(&old.physical_table_name),
        Some(&new.physical_table_name),
    );
    let logical_score = bigram_similarity(
        Some(&old.logical_table_name),
        Some(&new.logical_table_name),
    );
    let column_score = jaccard_similarity(
        &build_table_column_name_set(old),
        &build_table_column_name_set(new),
    );
    let old_comments: String = old
        .columns
        .iter()
        .map(|c| c.comment.as_deref().unwrap_or(""))
        .collect::<Vec<_>>()
        .join("|");
    let new_comments: String = new
        .columns
        .iter()
        .map(|c| c.comment.as_deref().unwrap_or(""))
        .collect::<Vec<_>>()
        .join("|");
    let comment_score = bigram_similarity(Some(&old_comments), Some(&new_comments));

    0.35 * physical_score + 0.25 * logical_score + 0.3 * column_score + 0.1 * comment_score
}

/// カラム類似度スコアを計算する
fn score_column_similarity(old: &ColumnInfo, new: &ColumnInfo) -> f64 {
    let physical_score = bigram_similarity(
        old.physical_name.as_deref(),
        new.physical_name.as_deref(),
    );
    let logical_score = bigram_similarity(
        old.logical_name.as_deref(),
        new.logical_name.as_deref(),
    );
    let type_score = if old.data_type == new.data_type && old.size == new.size {
        1.0
    } else {
        0.0
    };
    let constraints_score =
        if old.not_null.unwrap_or(false) == new.not_null.unwrap_or(false)
            && old.is_pk.unwrap_or(false) == new.is_pk.unwrap_or(false)
        {
            1.0
        } else {
            0.0
        };
    let comment_score = bigram_similarity(
        old.comment.as_deref(),
        new.comment.as_deref(),
    );

    0.45 * physical_score
        + 0.2 * logical_score
        + 0.2 * type_score
        + 0.1 * constraints_score
        + 0.05 * comment_score
}

/// カラム変更フィールドを収集する
fn collect_column_changed_fields(old: &ColumnInfo, new: &ColumnInfo) -> Vec<String> {
    let mut fields = Vec::new();
    if old.logical_name != new.logical_name {
        fields.push("logicalName".into());
    }
    if old.physical_name != new.physical_name {
        fields.push("physicalName".into());
    }
    if old.data_type != new.data_type {
        fields.push("dataType".into());
    }
    if old.size != new.size {
        fields.push("size".into());
    }
    if old.not_null.unwrap_or(false) != new.not_null.unwrap_or(false) {
        fields.push("notNull".into());
    }
    if old.is_pk.unwrap_or(false) != new.is_pk.unwrap_or(false) {
        fields.push("isPk".into());
    }
    if old.auto_increment.unwrap_or(false) != new.auto_increment.unwrap_or(false) {
        fields.push("autoIncrement".into());
    }
    if old.comment.as_deref().unwrap_or("") != new.comment.as_deref().unwrap_or("") {
        fields.push("comment".into());
    }
    fields
}

/// テーブル変更フィールドを収集する
fn collect_table_changed_fields(old: &TableInfo, new: &TableInfo) -> Vec<String> {
    let mut fields = Vec::new();
    if old.logical_table_name != new.logical_table_name {
        fields.push("logicalTableName".into());
    }
    if old.physical_table_name != new.physical_table_name {
        fields.push("physicalTableName".into());
    }
    fields
}

/// 貪欲法によるペアマッチング
fn match_pairs(
    old_len: usize,
    new_len: usize,
    get_score: impl Fn(usize, usize) -> f64,
    min_score: f64,
) -> Vec<(usize, usize, f64)> {
    let mut candidates = Vec::new();
    for oi in 0..old_len {
        for ni in 0..new_len {
            let score = get_score(oi, ni);
            if score >= min_score {
                candidates.push((oi, ni, score));
            }
        }
    }
    // スコア降順でソート
    candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    let mut used_old = HashSet::new();
    let mut used_new = HashSet::new();
    let mut matched = Vec::new();
    for (oi, ni, score) in candidates {
        if used_old.contains(&oi) || used_new.contains(&ni) {
            continue;
        }
        used_old.insert(oi);
        used_new.insert(ni);
        matched.push((oi, ni, score));
    }
    matched
}

/// キー完全一致によるマッチング
fn match_exact_by_key(
    old_indices: &[usize],
    new_indices: &[usize],
    get_old_key: impl Fn(usize) -> String,
    get_new_key: impl Fn(usize) -> String,
    get_score: impl Fn(usize, usize) -> f64,
) -> Vec<(usize, usize, f64)> {
    let mut new_index_map: HashMap<String, Vec<usize>> = HashMap::new();
    for &ni in new_indices {
        let key = get_new_key(ni);
        if !key.is_empty() {
            new_index_map.entry(key).or_default().push(ni);
        }
    }

    let mut matched = Vec::new();
    for &oi in old_indices {
        let key = get_old_key(oi);
        if key.is_empty() {
            continue;
        }
        if let Some(list) = new_index_map.get_mut(&key) {
            if let Some(ni) = list.first().copied() {
                list.remove(0);
                matched.push((oi, ni, get_score(oi, ni)));
            }
        }
    }
    matched
}

// ──────────────────────────────────────────────
// エンティティキー構築
// ──────────────────────────────────────────────

fn build_table_rename_entity_key(sheet_name: &str, old_name: &str, new_name: &str) -> String {
    format!(
        "table:{}:{}->{}",
        normalize_name(sheet_name),
        normalize_name(old_name),
        normalize_name(new_name)
    )
}

fn build_column_rename_entity_key(
    sheet_name: &str,
    table_name: &str,
    old_col: &str,
    new_col: &str,
) -> String {
    format!(
        "column:{}:{}:{}->{}",
        normalize_name(sheet_name),
        normalize_name(table_name),
        normalize_name(old_col),
        normalize_name(new_col)
    )
}

// ──────────────────────────────────────────────
// カラム差分
// ──────────────────────────────────────────────

fn diff_columns(
    sheet_name: &str,
    old_table: &TableInfo,
    new_table: &TableInfo,
    thresholds: &DiffThresholds,
) -> (Vec<DiffColumnChange>, Vec<DiffRenameSuggestion>) {
    let old_columns = &old_table.columns;
    let new_columns = &new_table.columns;
    let initial_old: Vec<usize> = (0..old_columns.len()).collect();
    let initial_new: Vec<usize> = (0..new_columns.len()).collect();
    let mut matched: Vec<(usize, usize, f64)> = Vec::new();

    // フェーズ1: 物理名完全一致
    let exact_physical = match_exact_by_key(
        &initial_old,
        &initial_new,
        |oi| normalize_name(old_columns[oi].physical_name.as_deref().unwrap_or("")),
        |ni| normalize_name(new_columns[ni].physical_name.as_deref().unwrap_or("")),
        |oi, ni| score_column_similarity(&old_columns[oi], &new_columns[ni]),
    );
    matched.extend(&exact_physical);

    let matched_old_phys: HashSet<usize> = matched.iter().map(|m| m.0).collect();
    let matched_new_phys: HashSet<usize> = matched.iter().map(|m| m.1).collect();
    let old_after_phys: Vec<usize> = initial_old
        .iter()
        .filter(|i| !matched_old_phys.contains(i))
        .copied()
        .collect();
    let new_after_phys: Vec<usize> = initial_new
        .iter()
        .filter(|i| !matched_new_phys.contains(i))
        .copied()
        .collect();

    // フェーズ2: 論理名一致（物理名が空の場合のみ）
    let exact_logical = match_exact_by_key(
        &old_after_phys,
        &new_after_phys,
        |oi| {
            if normalize_name(old_columns[oi].physical_name.as_deref().unwrap_or("")).is_empty() {
                normalize_name(old_columns[oi].logical_name.as_deref().unwrap_or(""))
            } else {
                String::new()
            }
        },
        |ni| {
            if normalize_name(new_columns[ni].physical_name.as_deref().unwrap_or("")).is_empty() {
                normalize_name(new_columns[ni].logical_name.as_deref().unwrap_or(""))
            } else {
                String::new()
            }
        },
        |oi, ni| score_column_similarity(&old_columns[oi], &new_columns[ni]),
    );
    matched.extend(&exact_logical);

    let matched_old_exact: HashSet<usize> = matched.iter().map(|m| m.0).collect();
    let matched_new_exact: HashSet<usize> = matched.iter().map(|m| m.1).collect();
    let old_for_fuzzy: Vec<usize> = initial_old
        .iter()
        .filter(|i| !matched_old_exact.contains(i))
        .copied()
        .collect();
    let new_for_fuzzy: Vec<usize> = initial_new
        .iter()
        .filter(|i| !matched_new_exact.contains(i))
        .copied()
        .collect();

    // フェーズ3: ファジーマッチング
    let fuzzy = match_pairs(
        old_for_fuzzy.len(),
        new_for_fuzzy.len(),
        |oi, ni| {
            score_column_similarity(
                &old_columns[old_for_fuzzy[oi]],
                &new_columns[new_for_fuzzy[ni]],
            )
        },
        thresholds.column_rename_candidate,
    );
    for (oi, ni, score) in fuzzy {
        matched.push((old_for_fuzzy[oi], new_for_fuzzy[ni], score));
    }

    let matched_old: HashSet<usize> = matched.iter().map(|m| m.0).collect();
    let matched_new: HashSet<usize> = matched.iter().map(|m| m.1).collect();
    let mut changes = Vec::new();
    let mut suggestions = Vec::new();

    // マッチしたペアの変更を検出
    for &(oi, ni, score) in &matched {
        let old_col = &old_columns[oi];
        let new_col = &new_columns[ni];
        let changed_fields = collect_column_changed_fields(old_col, new_col);
        let old_name = normalize_name(old_col.physical_name.as_deref().unwrap_or(""));
        let new_name = normalize_name(new_col.physical_name.as_deref().unwrap_or(""));
        let is_rename = !old_name.is_empty() && !new_name.is_empty() && old_name != new_name;

        if is_rename && score >= thresholds.column_rename_candidate {
            let entity_key = build_column_rename_entity_key(
                sheet_name,
                if old_table.physical_table_name.is_empty() {
                    &new_table.physical_table_name
                } else {
                    &old_table.physical_table_name
                },
                old_col
                    .physical_name
                    .as_deref()
                    .or(old_col.logical_name.as_deref())
                    .unwrap_or("column"),
                new_col
                    .physical_name
                    .as_deref()
                    .or(new_col.logical_name.as_deref())
                    .unwrap_or("column"),
            );
            changes.push(DiffColumnChange {
                action: "rename_suggest".into(),
                confidence: Some(score),
                requires_confirmation: true,
                entity_key: Some(entity_key.clone()),
                old_column: Some(old_col.clone()),
                new_column: Some(new_col.clone()),
                changed_fields,
            });
            suggestions.push(DiffRenameSuggestion {
                entity_type: "column".into(),
                entity_key,
                confidence: score,
                sheet_name: sheet_name.into(),
                table_name_before: Some(old_table.physical_table_name.clone()),
                table_name_after: Some(new_table.physical_table_name.clone()),
                column_name_before: old_col
                    .physical_name
                    .clone()
                    .or_else(|| old_col.logical_name.clone()),
                column_name_after: new_col
                    .physical_name
                    .clone()
                    .or_else(|| new_col.logical_name.clone()),
                decision: "pending".into(),
            });
        } else if !changed_fields.is_empty() {
            changes.push(DiffColumnChange {
                action: "modified".into(),
                confidence: Some(score),
                requires_confirmation: false,
                entity_key: None,
                old_column: Some(old_col.clone()),
                new_column: Some(new_col.clone()),
                changed_fields,
            });
        }
    }

    // 削除されたカラム
    for (oi, old_col) in old_columns.iter().enumerate() {
        if !matched_old.contains(&oi) {
            changes.push(DiffColumnChange {
                action: "removed".into(),
                confidence: None,
                requires_confirmation: false,
                entity_key: None,
                old_column: Some(old_col.clone()),
                new_column: None,
                changed_fields: vec![],
            });
        }
    }

    // 追加されたカラム
    for (ni, new_col) in new_columns.iter().enumerate() {
        if !matched_new.contains(&ni) {
            changes.push(DiffColumnChange {
                action: "added".into(),
                confidence: None,
                requires_confirmation: false,
                entity_key: None,
                old_column: None,
                new_column: Some(new_col.clone()),
                changed_fields: vec![],
            });
        }
    }

    (changes, suggestions)
}

// ──────────────────────────────────────────────
// テーブル差分
// ──────────────────────────────────────────────

fn diff_sheet_tables(
    sheet_name: &str,
    old_tables: &[TableInfo],
    new_tables: &[TableInfo],
    thresholds: &DiffThresholds,
) -> (Vec<DiffTableChange>, Vec<DiffRenameSuggestion>) {
    let initial_old: Vec<usize> = (0..old_tables.len()).collect();
    let initial_new: Vec<usize> = (0..new_tables.len()).collect();
    let mut matched: Vec<(usize, usize, f64)> = Vec::new();

    // フェーズ1: 物理名完全一致
    let exact_physical = match_exact_by_key(
        &initial_old,
        &initial_new,
        |oi| normalize_name(&old_tables[oi].physical_table_name),
        |ni| normalize_name(&new_tables[ni].physical_table_name),
        |oi, ni| score_table_similarity(&old_tables[oi], &new_tables[ni]),
    );
    matched.extend(&exact_physical);

    let matched_old_phys: HashSet<usize> = matched.iter().map(|m| m.0).collect();
    let matched_new_phys: HashSet<usize> = matched.iter().map(|m| m.1).collect();
    let old_after_phys: Vec<usize> = initial_old
        .iter()
        .filter(|i| !matched_old_phys.contains(i))
        .copied()
        .collect();
    let new_after_phys: Vec<usize> = initial_new
        .iter()
        .filter(|i| !matched_new_phys.contains(i))
        .copied()
        .collect();

    // フェーズ2: 論理名一致（物理名が空の場合のみ）
    let exact_logical = match_exact_by_key(
        &old_after_phys,
        &new_after_phys,
        |oi| {
            if normalize_name(&old_tables[oi].physical_table_name).is_empty() {
                normalize_name(&old_tables[oi].logical_table_name)
            } else {
                String::new()
            }
        },
        |ni| {
            if normalize_name(&new_tables[ni].physical_table_name).is_empty() {
                normalize_name(&new_tables[ni].logical_table_name)
            } else {
                String::new()
            }
        },
        |oi, ni| score_table_similarity(&old_tables[oi], &new_tables[ni]),
    );
    matched.extend(&exact_logical);

    let matched_old_exact: HashSet<usize> = matched.iter().map(|m| m.0).collect();
    let matched_new_exact: HashSet<usize> = matched.iter().map(|m| m.1).collect();
    let old_for_fuzzy: Vec<usize> = initial_old
        .iter()
        .filter(|i| !matched_old_exact.contains(i))
        .copied()
        .collect();
    let new_for_fuzzy: Vec<usize> = initial_new
        .iter()
        .filter(|i| !matched_new_exact.contains(i))
        .copied()
        .collect();

    // フェーズ3: ファジーマッチング
    let fuzzy = match_pairs(
        old_for_fuzzy.len(),
        new_for_fuzzy.len(),
        |oi, ni| {
            score_table_similarity(&old_tables[old_for_fuzzy[oi]], &new_tables[new_for_fuzzy[ni]])
        },
        thresholds.table_rename_candidate,
    );
    for (oi, ni, score) in fuzzy {
        matched.push((old_for_fuzzy[oi], new_for_fuzzy[ni], score));
    }

    let matched_old: HashSet<usize> = matched.iter().map(|m| m.0).collect();
    let matched_new: HashSet<usize> = matched.iter().map(|m| m.1).collect();
    let mut table_changes = Vec::new();
    let mut rename_suggestions = Vec::new();

    // マッチしたペアの変更を検出
    for &(oi, ni, score) in &matched {
        let old_table = &old_tables[oi];
        let new_table = &new_tables[ni];
        let changed_fields = collect_table_changed_fields(old_table, new_table);
        let (column_changes, col_rename_suggestions) =
            diff_columns(sheet_name, old_table, new_table, thresholds);
        rename_suggestions.extend(col_rename_suggestions);

        let old_name = normalize_name(&old_table.physical_table_name);
        let new_name = normalize_name(&new_table.physical_table_name);
        let is_rename = !old_name.is_empty() && !new_name.is_empty() && old_name != new_name;
        let table_has_changes = !changed_fields.is_empty() || !column_changes.is_empty();

        if !table_has_changes {
            continue;
        }

        if is_rename && score >= thresholds.table_rename_candidate {
            let entity_key = build_table_rename_entity_key(
                sheet_name,
                if old_table.physical_table_name.is_empty() {
                    &old_table.logical_table_name
                } else {
                    &old_table.physical_table_name
                },
                if new_table.physical_table_name.is_empty() {
                    &new_table.logical_table_name
                } else {
                    &new_table.physical_table_name
                },
            );
            table_changes.push(DiffTableChange {
                action: "rename_suggest".into(),
                confidence: Some(score),
                requires_confirmation: true,
                entity_key: Some(entity_key.clone()),
                old_table: Some(old_table.clone()),
                new_table: Some(new_table.clone()),
                changed_fields,
                column_changes,
            });
            rename_suggestions.push(DiffRenameSuggestion {
                entity_type: "table".into(),
                entity_key,
                confidence: score,
                sheet_name: sheet_name.into(),
                table_name_before: Some(
                    if old_table.physical_table_name.is_empty() {
                        old_table.logical_table_name.clone()
                    } else {
                        old_table.physical_table_name.clone()
                    },
                ),
                table_name_after: Some(
                    if new_table.physical_table_name.is_empty() {
                        new_table.logical_table_name.clone()
                    } else {
                        new_table.physical_table_name.clone()
                    },
                ),
                column_name_before: None,
                column_name_after: None,
                decision: "pending".into(),
            });
        } else {
            table_changes.push(DiffTableChange {
                action: "changed".into(),
                confidence: Some(score),
                requires_confirmation: false,
                entity_key: None,
                old_table: Some(old_table.clone()),
                new_table: Some(new_table.clone()),
                changed_fields,
                column_changes,
            });
        }
    }

    // 削除されたテーブル
    for (oi, table) in old_tables.iter().enumerate() {
        if !matched_old.contains(&oi) {
            table_changes.push(DiffTableChange {
                action: "removed".into(),
                confidence: None,
                requires_confirmation: false,
                entity_key: None,
                old_table: Some(table.clone()),
                new_table: None,
                changed_fields: vec![],
                column_changes: vec![],
            });
        }
    }

    // 追加されたテーブル
    for (ni, table) in new_tables.iter().enumerate() {
        if !matched_new.contains(&ni) {
            table_changes.push(DiffTableChange {
                action: "added".into(),
                confidence: None,
                requires_confirmation: false,
                entity_key: None,
                old_table: None,
                new_table: Some(table.clone()),
                changed_fields: vec![],
                column_changes: vec![],
            });
        }
    }

    (table_changes, rename_suggestions)
}

// ──────────────────────────────────────────────
// サマリ計算
// ──────────────────────────────────────────────

fn calculate_summary(sheets: &[DiffSheet], suggestions: &[DiffRenameSuggestion]) -> DiffSummary {
    let mut summary = DiffSummary {
        rename_suggestions: suggestions.len(),
        pending_confirmations: suggestions
            .iter()
            .filter(|s| s.decision == "pending")
            .count(),
        ..Default::default()
    };

    for sheet in sheets {
        for tc in &sheet.table_changes {
            match tc.action.as_str() {
                "added" => summary.added_tables += 1,
                "removed" => summary.removed_tables += 1,
                "changed" | "renamed" => summary.changed_tables += 1,
                _ => {}
            }
            for cc in &tc.column_changes {
                match cc.action.as_str() {
                    "added" => summary.added_columns += 1,
                    "removed" => summary.removed_columns += 1,
                    "modified" | "rename_suggest" | "renamed" => summary.changed_columns += 1,
                    _ => {}
                }
            }
        }
    }

    summary
}

// ──────────────────────────────────────────────
// MCP ヒント構築
// ──────────────────────────────────────────────

fn build_mcp_hints(sheets: &[DiffSheet], suggestions: &[DiffRenameSuggestion]) -> DiffMcpHints {
    let mut changed_tables = Vec::new();
    let mut changed_columns = Vec::new();
    let mut impact_keywords: HashSet<String> = HashSet::new();

    for sheet in sheets {
        for tc in &sheet.table_changes {
            let table_name = tc
                .new_table
                .as_ref()
                .map(|t| t.physical_table_name.as_str())
                .filter(|s| !s.is_empty())
                .or_else(|| {
                    tc.old_table
                        .as_ref()
                        .map(|t| t.physical_table_name.as_str())
                        .filter(|s| !s.is_empty())
                })
                .or_else(|| {
                    tc.new_table
                        .as_ref()
                        .map(|t| t.logical_table_name.as_str())
                        .filter(|s| !s.is_empty())
                })
                .or_else(|| {
                    tc.old_table
                        .as_ref()
                        .map(|t| t.logical_table_name.as_str())
                        .filter(|s| !s.is_empty())
                })
                .map(String::from);

            changed_tables.push(McpChangedTable {
                sheet_name: sheet.sheet_name.clone(),
                action: tc.action.clone(),
                table_name: table_name.clone(),
                confidence: tc.confidence,
                requires_confirmation: tc.requires_confirmation,
            });

            if let Some(ref tn) = table_name {
                impact_keywords.insert(format!("table:{}", tn));
            }

            for cc in &tc.column_changes {
                let column_name = cc
                    .new_column
                    .as_ref()
                    .and_then(|c| c.physical_name.as_deref())
                    .filter(|s| !s.is_empty())
                    .or_else(|| {
                        cc.old_column
                            .as_ref()
                            .and_then(|c| c.physical_name.as_deref())
                            .filter(|s| !s.is_empty())
                    })
                    .or_else(|| {
                        cc.new_column
                            .as_ref()
                            .and_then(|c| c.logical_name.as_deref())
                            .filter(|s| !s.is_empty())
                    })
                    .or_else(|| {
                        cc.old_column
                            .as_ref()
                            .and_then(|c| c.logical_name.as_deref())
                            .filter(|s| !s.is_empty())
                    })
                    .map(String::from);

                changed_columns.push(McpChangedColumn {
                    sheet_name: sheet.sheet_name.clone(),
                    table_name: table_name.clone(),
                    action: cc.action.clone(),
                    column_name: column_name.clone(),
                    confidence: cc.confidence,
                    requires_confirmation: cc.requires_confirmation,
                });

                if let Some(ref cn) = column_name {
                    impact_keywords.insert(format!("column:{}", cn));
                }
            }
        }
    }

    let has_pending = suggestions.iter().any(|s| s.decision == "pending");
    if has_pending {
        impact_keywords.insert("rename:pending_confirmation".into());
    }

    let mut keywords: Vec<String> = impact_keywords.into_iter().collect();
    keywords.sort();

    let next_actions = if has_pending {
        vec![
            "Review rename suggestions and confirm accept/reject.".into(),
            "Re-run ALTER preview after confirmations.".into(),
        ]
    } else {
        vec![
            "No rename confirmations pending.".into(),
            "Proceed to ALTER preview/export.".into(),
        ]
    };

    DiffMcpHints {
        changed_tables,
        changed_columns,
        impact_keywords: keywords,
        next_actions,
    }
}

// ──────────────────────────────────────────────
// スナップショット構築
// ──────────────────────────────────────────────

/// カラムの Option<String> フィールドをトリムして正規化する
fn normalize_column(col: &ColumnInfo) -> ColumnInfo {
    ColumnInfo {
        no: col.no,
        logical_name: col.logical_name.as_ref().map(|s| s.trim().to_string()),
        physical_name: col.physical_name.as_ref().map(|s| s.trim().to_string()),
        data_type: col.data_type.as_ref().map(|s| s.trim().to_string()),
        size: col.size.as_ref().map(|s| s.trim().to_string()),
        not_null: Some(col.not_null.unwrap_or(false)),
        is_pk: Some(col.is_pk.unwrap_or(false)),
        auto_increment: Some(col.auto_increment.unwrap_or(false)),
        comment: col.comment.as_ref().map(|s| s.trim().to_string()),
        comment_raw: col.comment_raw.clone(),
        source_ref: None,
    }
}

/// テーブルを正規化する（トリム、カラムソート）
fn normalize_table(table: &TableInfo) -> TableInfo {
    let mut columns: Vec<ColumnInfo> = table.columns.iter().map(normalize_column).collect();
    columns.sort_by(|a, b| {
        let ka = normalize_name(
            a.physical_name
                .as_deref()
                .filter(|s| !s.is_empty())
                .or(a.logical_name.as_deref())
                .unwrap_or(""),
        );
        let kb = normalize_name(
            b.physical_name
                .as_deref()
                .filter(|s| !s.is_empty())
                .or(b.logical_name.as_deref())
                .unwrap_or(""),
        );
        ka.cmp(&kb)
    });
    TableInfo {
        logical_table_name: table.logical_table_name.trim().to_string(),
        physical_table_name: table.physical_table_name.trim().to_string(),
        columns,
        column_range: None,
        row_range: None,
        excel_range: None,
        source_ref: None,
    }
}

/// ファイルの全シートをパースしてスナップショットを構築する
fn build_snapshot(app: &tauri::AppHandle, file_id: i64) -> Result<SnapshotPayload, String> {
    let file = storage::find_uploaded_file(app, file_id)?
        .ok_or_else(|| format!("File with id {} not found", file_id))?;
    let file_path = Path::new(&file.file_path);
    let parse_options = resolve_parse_options_pub(app);

    let sheet_summaries = excel::list_sheet_summaries(file_path)?;
    let mut sheets = Vec::new();

    for summary in &sheet_summaries {
        if !summary.has_table_definitions {
            continue;
        }
        let tables = excel::list_table_info(file_path, &summary.name, &parse_options)?;
        if tables.is_empty() {
            continue;
        }
        let mut normalized: Vec<TableInfo> = tables.iter().map(normalize_table).collect();
        normalized.sort_by(|a, b| {
            let ka = normalize_name(if a.physical_table_name.is_empty() {
                &a.logical_table_name
            } else {
                &a.physical_table_name
            });
            let kb = normalize_name(if b.physical_table_name.is_empty() {
                &b.logical_table_name
            } else {
                &b.physical_table_name
            });
            ka.cmp(&kb)
        });
        sheets.push(SnapshotSheet {
            sheet_name: summary.name.clone(),
            tables: normalized,
        });
    }

    sheets.sort_by(|a, b| a.sheet_name.cmp(&b.sheet_name));

    Ok(SnapshotPayload { file_id, sheets })
}

// ──────────────────────────────────────────────
// テーブル署名セット（ベースライン選択用）
// ──────────────────────────────────────────────

fn build_snapshot_table_signatures(snap: &SnapshotPayload) -> HashSet<String> {
    let mut values = HashSet::new();
    for sheet in &snap.sheets {
        for table in &sheet.tables {
            let mut col_names: Vec<String> = table
                .columns
                .iter()
                .map(|c| {
                    normalize_name(
                        c.physical_name
                            .as_deref()
                            .filter(|s| !s.is_empty())
                            .or(c.logical_name.as_deref())
                            .unwrap_or(""),
                    )
                })
                .filter(|s| !s.is_empty())
                .collect();
            col_names.sort();
            let sig = format!(
                "{}|{}|{}",
                normalize_name(&sheet.sheet_name),
                normalize_name(&table.physical_table_name),
                col_names.join(",")
            );
            values.insert(sig);
        }
    }
    values
}

/// ベースライン候補をスコアリングする
fn score_candidate(
    new_snap: &SnapshotPayload,
    old_snap: &SnapshotPayload,
    new_file_name: &str,
    old_file_name: &str,
    time_distance_ratio: f64,
) -> f64 {
    let file_name_score = bigram_similarity(Some(new_file_name), Some(old_file_name));
    let uploaded_at_score = (1.0 - time_distance_ratio).max(0.0);
    let content_score = jaccard_similarity(
        &build_snapshot_table_signatures(new_snap),
        &build_snapshot_table_signatures(old_snap),
    );
    0.35 * file_name_score + 0.25 * uploaded_at_score + 0.4 * content_score
}

/// タイムスタンプ文字列をミリ秒に変換する
fn parse_uploaded_at_ms(uploaded_at: Option<&str>) -> i64 {
    let Some(s) = uploaded_at else {
        return 0;
    };
    // SQLite UTC形式を処理
    let normalized = if regex::Regex::new(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")
        .ok()
        .map(|re| re.is_match(s))
        .unwrap_or(false)
    {
        format!("{}T{}Z", &s[..10], &s[11..])
    } else {
        s.to_string()
    };
    chrono::DateTime::parse_from_rfc3339(&normalized)
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

/// 自動ベースライン選択
fn select_baseline_auto(
    app: &tauri::AppHandle,
    new_file_id: i64,
    new_snap: &SnapshotPayload,
    new_file_name: &str,
    new_uploaded_at_ms: i64,
) -> Result<i64, String> {
    let files = storage::list_uploaded_file_summaries(app)?;
    let candidates: Vec<(i64, String, Option<String>)> = files
        .into_iter()
        .filter(|(id, _, _)| *id != new_file_id)
        .collect();

    if candidates.is_empty() {
        return Err("No historical file found for automatic baseline matching".into());
    }

    // 候補をMAX_BASELINE_CANDIDATES以下に絞り込む
    let shortlisted: Vec<(i64, String, Option<String>)> =
        if candidates.len() <= MAX_BASELINE_CANDIDATES {
            candidates
        } else {
            let max_time_dist = candidates
                .iter()
                .map(|(_, _, ua)| {
                    (new_uploaded_at_ms - parse_uploaded_at_ms(ua.as_deref())).unsigned_abs()
                })
                .max()
                .unwrap_or(1)
                .max(1);

            let mut quick_scores: Vec<(usize, f64)> = candidates
                .iter()
                .enumerate()
                .map(|(idx, c)| {
                    let file_name_score = bigram_similarity(Some(new_file_name), Some(&c.1));
                    let time_dist =
                        (new_uploaded_at_ms - parse_uploaded_at_ms(c.2.as_deref())).unsigned_abs();
                    let uploaded_at_score =
                        (1.0 - time_dist as f64 / max_time_dist as f64).max(0.0);
                    (idx, 0.7 * file_name_score + 0.3 * uploaded_at_score)
                })
                .collect();
            quick_scores
                .sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

            let selected_indices: Vec<usize> = quick_scores
                .into_iter()
                .take(MAX_BASELINE_CANDIDATES)
                .map(|(idx, _)| idx)
                .collect();

            selected_indices
                .into_iter()
                .map(|idx| candidates[idx].clone())
                .collect()
        };

    // 各候補のスナップショットを構築してスコアリング
    let max_time_dist = shortlisted
        .iter()
        .map(|(_, _, ua)| {
            (new_uploaded_at_ms - parse_uploaded_at_ms(ua.as_deref())).unsigned_abs()
        })
        .max()
        .unwrap_or(1)
        .max(1);

    let mut best_id = shortlisted[0].0;
    let mut best_score = -1.0_f64;

    for (id, name, uploaded_at) in &shortlisted {
        let old_snap = match build_snapshot(app, *id) {
            Ok(snap) => snap,
            Err(_) => continue,
        };
        let time_dist =
            (new_uploaded_at_ms - parse_uploaded_at_ms(uploaded_at.as_deref())).unsigned_abs();
        let time_ratio = time_dist as f64 / max_time_dist as f64;
        let score = score_candidate(new_snap, &old_snap, new_file_name, name, time_ratio);
        if score > best_score {
            best_score = score;
            best_id = *id;
        }
    }

    Ok(best_id)
}

// ──────────────────────────────────────────────
// シート名マッピング（current_sheet スコープ用）
// ──────────────────────────────────────────────

fn get_sheet_tables<'a>(snapshot: &'a SnapshotPayload, sheet_name: &str) -> &'a [TableInfo] {
    snapshot
        .sheets
        .iter()
        .find(|s| s.sheet_name == sheet_name)
        .map(|s| s.tables.as_slice())
        .unwrap_or(&[])
}

fn build_table_identity_set(tables: &[TableInfo]) -> HashSet<String> {
    let mut set = HashSet::new();
    for table in tables {
        let name = normalize_name(if table.physical_table_name.is_empty() {
            &table.logical_table_name
        } else {
            &table.physical_table_name
        });
        if !name.is_empty() {
            set.insert(name);
        }
    }
    set
}

fn resolve_current_sheet_baseline_name(
    requested: &str,
    new_snap: &SnapshotPayload,
    old_snap: &SnapshotPayload,
) -> String {
    let exact_exists = old_snap.sheets.iter().any(|s| s.sheet_name == requested);
    if exact_exists {
        return requested.to_string();
    }

    let new_tables = get_sheet_tables(new_snap, requested);
    if new_tables.is_empty() {
        return requested.to_string();
    }

    let new_table_set = build_table_identity_set(new_tables);
    let mut best_name = requested.to_string();
    let mut best_score = 0.0_f64;

    for sheet in &old_snap.sheets {
        let old_table_set = build_table_identity_set(&sheet.tables);
        let table_overlap = jaccard_similarity(&new_table_set, &old_table_set);
        let sheet_name_score = bigram_similarity(Some(requested), Some(&sheet.sheet_name));
        let total = 0.75 * table_overlap + 0.25 * sheet_name_score;
        if total > best_score {
            best_score = total;
            best_name = sheet.sheet_name.clone();
        }
    }

    if best_score >= 0.2 {
        best_name
    } else {
        requested.to_string()
    }
}

// ──────────────────────────────────────────────
// リネーム判定の適用
// ──────────────────────────────────────────────

fn apply_rename_decisions(stored: &StoredDiff, decisions: &HashMap<String, String>) -> StoredDiff {
    let mut cloned = stored.clone();

    // リネーム提案の判定を更新
    for suggestion in &mut cloned.rename_suggestions {
        if let Some(decision) = decisions.get(&suggestion.entity_key) {
            suggestion.decision = decision.clone();
        }
    }

    // テーブル/カラム変更のアクションを判定に基づいて更新
    for sheet in &mut cloned.sheets {
        for tc in &mut sheet.table_changes {
            if tc.action == "rename_suggest" {
                if let Some(ref ek) = tc.entity_key {
                    if let Some(decision) = decisions.get(ek) {
                        if decision == "accept" {
                            tc.action = "renamed".into();
                            tc.requires_confirmation = false;
                        } else if decision == "reject" {
                            tc.requires_confirmation = false;
                        }
                    }
                }
            }
            for cc in &mut tc.column_changes {
                if cc.action == "rename_suggest" {
                    if let Some(ref ek) = cc.entity_key {
                        if let Some(decision) = decisions.get(ek) {
                            if decision == "accept" {
                                cc.action = "renamed".into();
                                cc.requires_confirmation = false;
                            } else if decision == "reject" {
                                cc.requires_confirmation = false;
                            }
                        }
                    }
                }
            }
        }
    }

    cloned.summary = calculate_summary(&cloned.sheets, &cloned.rename_suggestions);
    cloned
}

// ──────────────────────────────────────────────
// ALTER SQL 生成
// ──────────────────────────────────────────────

fn resolve_column_type(col: &ColumnInfo, dialect: &str) -> String {
    let data_type = col
        .data_type
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let size = col.size.as_deref().unwrap_or("").trim().to_string();

    if dialect == "mysql" {
        if data_type.is_empty() {
            return "varchar(255)".into();
        }
        if data_type == "varchar" || data_type == "char" {
            let sz = if size.is_empty() { "255" } else { &size };
            return format!("{}({})", data_type, sz);
        }
        if data_type == "int" || data_type == "integer" {
            return if size.is_empty() {
                "int".into()
            } else {
                format!("int({})", size)
            };
        }
        if data_type == "bigint" || data_type == "tinyint" || data_type == "smallint" {
            return if size.is_empty() {
                data_type.clone()
            } else {
                format!("{}({})", data_type, size)
            };
        }
        if data_type == "decimal" || data_type == "numeric" {
            let sz = if size.is_empty() { "10,2" } else { &size };
            return format!("decimal({})", sz);
        }
        if data_type == "datetime" || data_type == "timestamp" {
            return if size.is_empty() {
                data_type.clone()
            } else {
                format!("{}({})", data_type, size)
            };
        }
        return if size.is_empty() {
            data_type
        } else {
            format!("{}({})", data_type, size)
        };
    }

    // Oracle
    if data_type.is_empty() {
        return "VARCHAR2(255)".into();
    }
    if data_type == "varchar" {
        let sz = if size.is_empty() { "255" } else { &size };
        return format!("VARCHAR2({})", sz);
    }
    if data_type == "char" {
        let sz = if size.is_empty() { "1" } else { &size };
        return format!("CHAR({})", sz);
    }
    if data_type == "int"
        || data_type == "integer"
        || data_type == "bigint"
        || data_type == "smallint"
        || data_type == "tinyint"
    {
        return if size.is_empty() {
            "NUMBER".into()
        } else {
            format!("NUMBER({})", size)
        };
    }
    if data_type == "decimal" || data_type == "numeric" {
        let sz = if size.is_empty() { "10,2" } else { &size };
        return format!("NUMBER({})", sz);
    }
    if data_type == "datetime" {
        return "TIMESTAMP".into();
    }
    if data_type == "text" || data_type == "longtext" || data_type == "mediumtext" {
        return "CLOB".into();
    }
    if size.is_empty() {
        data_type.to_uppercase()
    } else {
        format!("{}({})", data_type.to_uppercase(), size)
    }
}

fn resolve_column_definition(col: &ColumnInfo, dialect: &str) -> String {
    let col_name = col
        .physical_name
        .as_deref()
        .filter(|s| !s.is_empty())
        .or(col.logical_name.as_deref())
        .unwrap_or("unknown_column");
    let col_type = resolve_column_type(col, dialect);
    let not_null = if col.not_null.unwrap_or(false) {
        " NOT NULL"
    } else {
        ""
    };
    let normalized_type = col
        .data_type
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let can_auto_increment = dialect == "mysql"
        && col.auto_increment.unwrap_or(false)
        && col.is_pk.unwrap_or(false)
        && matches!(
            normalized_type.as_str(),
            "int" | "integer" | "bigint" | "tinyint" | "smallint" | "mediumint"
        );
    let auto_increment = if can_auto_increment {
        " AUTO_INCREMENT"
    } else {
        ""
    };

    if dialect == "mysql" {
        format!("`{}` {}{}{}", col_name, col_type, not_null, auto_increment)
    } else {
        format!("{} {}{}", col_name, col_type, not_null)
    }
}

fn quote_table_name(name: &str, dialect: &str) -> String {
    if dialect == "mysql" {
        format!("`{}`", name)
    } else {
        name.to_string()
    }
}

fn quote_column_name(name: &str, dialect: &str) -> String {
    if dialect == "mysql" {
        format!("`{}`", name)
    } else {
        name.to_string()
    }
}

fn has_definition_level_column_changes(changed_fields: &[String]) -> bool {
    changed_fields
        .iter()
        .any(|f| f == "dataType" || f == "size" || f == "notNull" || f == "autoIncrement")
}

fn build_create_table_statement(table: &TableInfo, dialect: &str) -> String {
    let table_name = if table.physical_table_name.is_empty() {
        if table.logical_table_name.is_empty() {
            "unknown_table"
        } else {
            &table.logical_table_name
        }
    } else {
        &table.physical_table_name
    };
    let col_defs: Vec<String> = table
        .columns
        .iter()
        .map(|c| resolve_column_definition(c, dialect))
        .filter(|d| !d.trim().is_empty())
        .collect();

    if col_defs.is_empty() {
        return format!("-- Skip CREATE TABLE {}: no columns detected", table_name);
    }

    let mut lines = col_defs;

    let pk_columns: Vec<String> = table
        .columns
        .iter()
        .filter(|c| c.is_pk.unwrap_or(false))
        .map(|c| {
            c.physical_name
                .as_deref()
                .filter(|s| !s.is_empty())
                .or(c.logical_name.as_deref())
                .unwrap_or("unknown_pk")
                .to_string()
        })
        .collect();

    if !pk_columns.is_empty() {
        let pk_sql = pk_columns
            .iter()
            .map(|c| quote_column_name(c, dialect))
            .collect::<Vec<_>>()
            .join(", ");
        lines.push(format!("PRIMARY KEY ({})", pk_sql));
    }

    let body = lines
        .iter()
        .map(|l| format!("  {}", l))
        .collect::<Vec<_>>()
        .join(",\n");

    format!(
        "CREATE TABLE {} (\n{}\n);",
        quote_table_name(table_name, dialect),
        body
    )
}

fn build_alter_statements(
    table_change: &DiffTableChange,
    dialect: &str,
    decision_map: &HashMap<String, String>,
    include_unconfirmed: bool,
) -> Vec<String> {
    let mut statements = Vec::new();
    let table_before = table_change
        .old_table
        .as_ref()
        .map(|t| {
            if t.physical_table_name.is_empty() {
                t.logical_table_name.as_str()
            } else {
                t.physical_table_name.as_str()
            }
        })
        .unwrap_or("");
    let table_after = table_change
        .new_table
        .as_ref()
        .map(|t| {
            if t.physical_table_name.is_empty() {
                t.logical_table_name.as_str()
            } else {
                t.physical_table_name.as_str()
            }
        })
        .unwrap_or("");

    // テーブル追加
    if table_change.action == "added" {
        if let Some(ref new_table) = table_change.new_table {
            statements.push(build_create_table_statement(new_table, dialect));
        }
        return statements;
    }

    // テーブル削除
    if table_change.action == "removed" && !table_before.is_empty() {
        statements.push(format!(
            "DROP TABLE {};",
            quote_table_name(table_before, dialect)
        ));
        return statements;
    }

    // テーブルリネーム提案
    if table_change.action == "rename_suggest" {
        let decision = table_change
            .entity_key
            .as_ref()
            .and_then(|ek| decision_map.get(ek))
            .map(|s| s.as_str())
            .unwrap_or("pending");

        if decision == "accept" && !table_before.is_empty() && !table_after.is_empty() {
            if dialect == "mysql" {
                statements.push(format!(
                    "RENAME TABLE {} TO {};",
                    quote_table_name(table_before, dialect),
                    quote_table_name(table_after, dialect)
                ));
            } else {
                statements.push(format!(
                    "ALTER TABLE {} RENAME TO {};",
                    quote_table_name(table_before, dialect),
                    quote_table_name(table_after, dialect)
                ));
            }
        } else if decision == "reject" && !table_before.is_empty() && !table_after.is_empty() {
            statements.push(format!(
                "DROP TABLE {};",
                quote_table_name(table_before, dialect)
            ));
            if let Some(ref new_table) = table_change.new_table {
                statements.push(build_create_table_statement(new_table, dialect));
            }
            return statements;
        } else if include_unconfirmed && !table_before.is_empty() && !table_after.is_empty() {
            statements.push(format!(
                "-- TODO(confirm rename): {} -> {}",
                table_before, table_after
            ));
        }
    }

    let target_table_name = if !table_after.is_empty() {
        table_after
    } else {
        table_before
    };
    if target_table_name.is_empty() {
        return statements;
    }

    // リネーム提案時の解決済みテーブル名
    let resolved_table_name = if table_change.action == "rename_suggest" {
        if let Some(ref ek) = table_change.entity_key {
            if decision_map.get(ek).map(|s| s.as_str()) == Some("accept") {
                table_after
            } else {
                table_before
            }
        } else {
            target_table_name
        }
    } else {
        target_table_name
    };

    let effective_name = if resolved_table_name.is_empty() {
        target_table_name
    } else {
        resolved_table_name
    };

    // カラム変更
    for cc in &table_change.column_changes {
        let old_col_name = cc
            .old_column
            .as_ref()
            .and_then(|c| c.physical_name.as_deref().filter(|s| !s.is_empty()))
            .or_else(|| {
                cc.old_column
                    .as_ref()
                    .and_then(|c| c.logical_name.as_deref())
            })
            .unwrap_or("old_column");
        let new_col_name = cc
            .new_column
            .as_ref()
            .and_then(|c| c.physical_name.as_deref().filter(|s| !s.is_empty()))
            .or_else(|| {
                cc.new_column
                    .as_ref()
                    .and_then(|c| c.logical_name.as_deref())
            })
            .unwrap_or("new_column");

        match cc.action.as_str() {
            "added" => {
                if let Some(ref new_col) = cc.new_column {
                    let def = resolve_column_definition(new_col, dialect);
                    statements.push(format!(
                        "ALTER TABLE {} ADD {};",
                        quote_table_name(effective_name, dialect),
                        def
                    ));
                }
            }
            "removed" => {
                statements.push(format!(
                    "ALTER TABLE {} DROP COLUMN {};",
                    quote_table_name(effective_name, dialect),
                    quote_column_name(old_col_name, dialect)
                ));
            }
            "modified" => {
                if let Some(ref new_col) = cc.new_column {
                    let def = resolve_column_definition(new_col, dialect);
                    if dialect == "mysql" {
                        statements.push(format!(
                            "ALTER TABLE {} MODIFY COLUMN {};",
                            quote_table_name(effective_name, dialect),
                            def
                        ));
                    } else {
                        statements.push(format!(
                            "ALTER TABLE {} MODIFY ({});",
                            quote_table_name(effective_name, dialect),
                            def
                        ));
                    }
                }
            }
            "rename_suggest" | "renamed" => {
                let decision = if cc.action == "renamed" {
                    "accept"
                } else {
                    cc.entity_key
                        .as_ref()
                        .and_then(|ek| decision_map.get(ek))
                        .map(|s| s.as_str())
                        .unwrap_or("pending")
                };

                if decision == "accept" {
                    statements.push(format!(
                        "ALTER TABLE {} RENAME COLUMN {} TO {};",
                        quote_table_name(effective_name, dialect),
                        quote_column_name(old_col_name, dialect),
                        quote_column_name(new_col_name, dialect)
                    ));
                    if let Some(ref new_col) = cc.new_column {
                        if has_definition_level_column_changes(&cc.changed_fields) {
                            let def = resolve_column_definition(new_col, dialect);
                            if dialect == "mysql" {
                                statements.push(format!(
                                    "ALTER TABLE {} MODIFY COLUMN {};",
                                    quote_table_name(effective_name, dialect),
                                    def
                                ));
                            } else {
                                statements.push(format!(
                                    "ALTER TABLE {} MODIFY ({});",
                                    quote_table_name(effective_name, dialect),
                                    def
                                ));
                            }
                        }
                    }
                } else if decision == "reject" {
                    if cc.old_column.is_some() && cc.new_column.is_some() {
                        statements.push(format!(
                            "ALTER TABLE {} DROP COLUMN {};",
                            quote_table_name(effective_name, dialect),
                            quote_column_name(old_col_name, dialect)
                        ));
                        if let Some(ref new_col) = cc.new_column {
                            let def = resolve_column_definition(new_col, dialect);
                            statements.push(format!(
                                "ALTER TABLE {} ADD {};",
                                quote_table_name(effective_name, dialect),
                                def
                            ));
                        }
                    }
                } else if include_unconfirmed {
                    statements.push(format!(
                        "-- TODO(confirm rename): {} -> {}",
                        old_col_name, new_col_name
                    ));
                }
            }
            _ => {}
        }
    }

    statements
}

fn build_alter_artifacts(
    stored: &StoredDiff,
    dialect: &str,
    split_by_sheet: bool,
    output_mode: &str,
    include_unconfirmed: bool,
    decision_map: &HashMap<String, String>,
) -> Vec<DiffAlterArtifact> {
    let mut per_sheet_sql: Vec<(String, Vec<String>)> = Vec::new();

    for sheet in &stored.sheets {
        let mut lines = Vec::new();
        for tc in &sheet.table_changes {
            if output_mode == "single_table" && tc.action == "added" {
                continue;
            }
            let stmts = build_alter_statements(tc, dialect, decision_map, include_unconfirmed);
            lines.extend(stmts.into_iter().filter(|s| !s.is_empty()));
        }
        per_sheet_sql.push((sheet.sheet_name.clone(), lines));
    }

    let mut artifacts = Vec::new();

    if split_by_sheet {
        for (sheet_name, lines) in &per_sheet_sql {
            if lines.is_empty() {
                continue;
            }
            artifacts.push(DiffAlterArtifact {
                artifact_name: format!("{}_alter.sql", sheet_name),
                sheet_name: Some(sheet_name.clone()),
                sql: lines.join("\n"),
            });
        }
    } else {
        let mut all_lines = Vec::new();
        for (sheet_name, lines) in &per_sheet_sql {
            if !lines.is_empty() {
                all_lines.push(format!("-- Sheet: {}", sheet_name));
                all_lines.extend(lines.clone());
            }
        }

        if !all_lines.is_empty() {
            artifacts.push(DiffAlterArtifact {
                artifact_name: "alter_preview.sql".into(),
                sheet_name: None,
                sql: all_lines.join("\n"),
            });
        }
    }

    artifacts
}

// ──────────────────────────────────────────────
// パブリック API
// ──────────────────────────────────────────────

/// スキーマ差分を計算する
pub fn compute_diff(
    app: &tauri::AppHandle,
    new_file_id: i64,
    old_file_id: Option<i64>,
    mode: &str,
    scope: &str,
    sheet_name: Option<&str>,
    thresholds: Option<DiffThresholds>,
) -> Result<DiffPreviewResponse, String> {
    let thresholds = thresholds.unwrap_or_default();

    // 1. 新ファイルのスナップショットを構築
    let new_snap = build_snapshot(app, new_file_id)?;

    // 2. ベースラインファイルを決定
    let (resolved_old_file_id, link) = if mode == "manual" {
        let oid = old_file_id
            .ok_or_else(|| "Manual mode requires old_file_id".to_string())?;
        // 指定ファイルの存在確認
        storage::find_uploaded_file(app, oid)?
            .ok_or_else(|| "Selected baseline file does not exist".to_string())?;
        let link = DiffVersionLink {
            new_file_id,
            old_file_id: oid,
            mode: "manual".into(),
            confidence: 1.0,
            low_confidence: false,
        };
        (oid, link)
    } else {
        // 自動選択
        let new_file = storage::find_uploaded_file(app, new_file_id)?
            .ok_or_else(|| "Target file not found".to_string())?;
        let new_uploaded_at_ms = parse_uploaded_at_ms(new_file.uploaded_at.as_deref());
        let oid = select_baseline_auto(
            app,
            new_file_id,
            &new_snap,
            &new_file.original_name,
            new_uploaded_at_ms,
        )?;

        // 自動選択のスコアを再計算して信頼度を求める
        let old_snap = build_snapshot(app, oid)?;
        let old_file = storage::find_uploaded_file(app, oid)?
            .ok_or_else(|| "Baseline file not found".to_string())?;
        let old_uploaded_at_ms = parse_uploaded_at_ms(old_file.uploaded_at.as_deref());
        let max_dist = (new_uploaded_at_ms - old_uploaded_at_ms).unsigned_abs().max(1);
        let time_ratio =
            (new_uploaded_at_ms - old_uploaded_at_ms).unsigned_abs() as f64 / max_dist as f64;
        let confidence = score_candidate(
            &new_snap,
            &old_snap,
            &new_file.original_name,
            &old_file.original_name,
            time_ratio,
        );
        let low_confidence = confidence < thresholds.baseline_auto_select_min;

        let link = DiffVersionLink {
            new_file_id,
            old_file_id: oid,
            mode: "auto".into(),
            confidence,
            low_confidence,
        };
        (oid, link)
    };

    // 3. 旧ファイルのスナップショットを構築
    let old_snap = build_snapshot(app, resolved_old_file_id)?;

    // 4. 差分を計算
    let sheet_names: Vec<String> = if scope == "current_sheet" {
        vec![sheet_name
            .ok_or_else(|| "current_sheet scope requires sheet_name".to_string())?
            .to_string()]
    } else {
        let mut names: HashSet<String> = HashSet::new();
        for s in &new_snap.sheets {
            names.insert(s.sheet_name.clone());
        }
        for s in &old_snap.sheets {
            names.insert(s.sheet_name.clone());
        }
        let mut sorted: Vec<String> = names.into_iter().collect();
        sorted.sort();
        sorted
    };

    let mut baseline_sheet_name_for_current = None;
    if scope == "current_sheet" {
        if let Some(sn) = sheet_name {
            baseline_sheet_name_for_current =
                Some(resolve_current_sheet_baseline_name(sn, &new_snap, &old_snap));
        }
    }

    let mut sheets = Vec::new();
    let mut rename_suggestions = Vec::new();

    for sn in &sheet_names {
        let old_sheet_name = if scope == "current_sheet" {
            baseline_sheet_name_for_current
                .as_deref()
                .unwrap_or(sn.as_str())
        } else {
            sn.as_str()
        };
        let old_tables = get_sheet_tables(&old_snap, old_sheet_name);
        let new_tables = get_sheet_tables(&new_snap, sn);
        let (table_changes, sheet_rename_suggestions) =
            diff_sheet_tables(sn, old_tables, new_tables, &thresholds);
        if table_changes.is_empty() {
            continue;
        }
        sheets.push(DiffSheet {
            sheet_name: sn.clone(),
            table_changes,
        });
        rename_suggestions.extend(sheet_rename_suggestions);
    }

    let summary = calculate_summary(&sheets, &rename_suggestions);
    let mut mcp_hints = build_mcp_hints(&sheets, &rename_suggestions);

    // current_sheet でベースラインシート名が異なる場合のヒント追加
    if scope == "current_sheet" {
        if let (Some(sn), Some(ref baseline_sn)) = (sheet_name, &baseline_sheet_name_for_current) {
            if sn != baseline_sn.as_str() {
                mcp_hints.next_actions.insert(
                    0,
                    format!(
                        "Current sheet baseline mapped to old sheet \"{}\" for better diff alignment.",
                        baseline_sn
                    ),
                );
                let kw = format!("baseline_sheet:{}", baseline_sn);
                if !mcp_hints.impact_keywords.contains(&kw) {
                    mcp_hints.impact_keywords.push(kw);
                    mcp_hints.impact_keywords.sort();
                }
            }
        }
    }

    // 5. diff_id を生成
    let timestamp_ms = chrono::Utc::now().timestamp_millis();
    let diff_id = format!("diff-{}-{}-{}", new_file_id, resolved_old_file_id, timestamp_ms);

    // 6. StoredDiff を保存
    let stored = StoredDiff {
        algorithm_version: SCHEMA_DIFF_ALGORITHM_VERSION.into(),
        scope: scope.into(),
        sheet_name: sheet_name.map(String::from),
        link: link.clone(),
        summary: summary.clone(),
        sheets: sheets.clone(),
        rename_suggestions: rename_suggestions.clone(),
    };
    let diff_json =
        serde_json::to_string(&stored).map_err(|e| format!("Failed to serialize diff: {}", e))?;
    storage::save_diff(
        app,
        &diff_id,
        new_file_id,
        resolved_old_file_id,
        scope,
        sheet_name,
        &diff_json,
    )?;

    // 7. リネーム判定を保存
    let decision_entries: Vec<(String, String, String, f64)> = rename_suggestions
        .iter()
        .map(|s| {
            (
                s.entity_type.clone(),
                s.entity_key.clone(),
                "pending".into(),
                s.confidence,
            )
        })
        .collect();
    storage::replace_rename_decisions(app, &diff_id, &decision_entries)?;

    Ok(DiffPreviewResponse {
        diff_id,
        cache_hit: false,
        algorithm_version: SCHEMA_DIFF_ALGORITHM_VERSION.into(),
        scope: scope.into(),
        sheet_name: sheet_name.map(String::from),
        link,
        summary,
        sheets,
        rename_suggestions,
        mcp_hints,
    })
}

/// リネーム提案の確認を適用する
pub fn confirm_renames(
    app: &tauri::AppHandle,
    diff_id: &str,
    decisions: &[DiffRenameDecisionItem],
) -> Result<DiffConfirmResponse, String> {
    let diff_json = storage::get_diff_by_id(app, diff_id)?
        .ok_or_else(|| "Diff result not found".to_string())?;
    let stored: StoredDiff = serde_json::from_str(&diff_json)
        .map_err(|e| format!("Failed to deserialize stored diff: {}", e))?;

    // 既存の判定を取得
    let existing = storage::get_rename_decisions(app, diff_id)?;
    let mut decision_map: HashMap<String, (String, String, String, f64)> = HashMap::new();
    for (entity_type, entity_key, decision) in &existing {
        decision_map.insert(
            entity_key.clone(),
            (entity_type.clone(), entity_key.clone(), decision.clone(), 0.0),
        );
    }

    // 新しい判定を適用
    for item in decisions {
        let entry = decision_map
            .entry(item.entity_key.clone())
            .or_insert_with(|| {
                (
                    item.entity_type.clone(),
                    item.entity_key.clone(),
                    "pending".into(),
                    0.0,
                )
            });
        entry.2 = item.decision.clone();
    }

    // 保存
    let entries: Vec<(String, String, String, f64)> =
        decision_map.values().cloned().collect();
    storage::replace_rename_decisions(app, diff_id, &entries)?;

    // 判定を適用して返す
    let resolved_map: HashMap<String, String> = decision_map
        .iter()
        .map(|(k, v)| (k.clone(), v.2.clone()))
        .collect();
    let resolved = apply_rename_decisions(&stored, &resolved_map);

    Ok(DiffConfirmResponse {
        diff_id: diff_id.into(),
        summary: resolved.summary,
        sheets: resolved.sheets,
        rename_suggestions: resolved.rename_suggestions,
    })
}

/// ALTER SQL プレビューを生成する
pub fn compute_alter_preview(
    app: &tauri::AppHandle,
    diff_id: &str,
    dialect: &str,
    split_by_sheet: bool,
    output_mode: &str,
    include_unconfirmed: bool,
) -> Result<DiffAlterPreviewResponse, String> {
    let diff_json = storage::get_diff_by_id(app, diff_id)?
        .ok_or_else(|| "Diff result not found".to_string())?;
    let stored: StoredDiff = serde_json::from_str(&diff_json)
        .map_err(|e| format!("Failed to deserialize stored diff: {}", e))?;

    let existing = storage::get_rename_decisions(app, diff_id)?;
    let decision_map: HashMap<String, String> = existing
        .into_iter()
        .map(|(_, entity_key, decision)| (entity_key, decision))
        .collect();

    let artifacts = build_alter_artifacts(
        &stored,
        dialect,
        split_by_sheet,
        output_mode,
        include_unconfirmed,
        &decision_map,
    );

    Ok(DiffAlterPreviewResponse {
        diff_id: diff_id.into(),
        dialect: dialect.into(),
        split_by_sheet,
        output_mode: output_mode.into(),
        artifacts,
    })
}

// ──────────────────────────────────────────────
// ユニットテスト
// ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ColumnInfo, TableInfo};

    /// テスト用のカラムを作成するヘルパー
    fn make_column(physical: &str, logical: &str, data_type: &str) -> ColumnInfo {
        ColumnInfo {
            no: None,
            logical_name: Some(logical.into()),
            physical_name: Some(physical.into()),
            data_type: Some(data_type.into()),
            size: None,
            not_null: Some(false),
            is_pk: Some(false),
            auto_increment: Some(false),
            comment: None,
            comment_raw: None,
            source_ref: None,
        }
    }

    /// テスト用のテーブルを作成するヘルパー
    fn make_table(physical: &str, logical: &str, columns: Vec<ColumnInfo>) -> TableInfo {
        TableInfo {
            logical_table_name: logical.into(),
            physical_table_name: physical.into(),
            columns,
            column_range: None,
            row_range: None,
            excel_range: None,
            source_ref: None,
        }
    }

    #[test]
    fn test_normalize_name() {
        assert_eq!(normalize_name("  Hello World  "), "hello_world");
        assert_eq!(normalize_name("ABC"), "abc");
        assert_eq!(normalize_name("  multiple   spaces  "), "multiple_spaces");
        assert_eq!(normalize_name(""), "");
    }

    #[test]
    fn test_bigram_similarity_identical() {
        let score = bigram_similarity(Some("hello"), Some("hello"));
        assert!((score - 1.0).abs() < f64::EPSILON, "同一文字列のスコアは1.0");
    }

    #[test]
    fn test_bigram_similarity_similar() {
        let score = bigram_similarity(Some("hello"), Some("helo"));
        assert!(score > 0.5, "類似文字列のスコアは0.5以上: {}", score);
        assert!(score < 1.0, "異なる文字列のスコアは1.0未満: {}", score);
    }

    #[test]
    fn test_jaccard_similarity() {
        let a: HashSet<String> = vec!["x".into(), "y".into(), "z".into()].into_iter().collect();
        let b: HashSet<String> = vec!["x".into(), "y".into(), "z".into()].into_iter().collect();
        let score = jaccard_similarity(&a, &b);
        assert!((score - 1.0).abs() < f64::EPSILON, "同一集合は1.0");

        let c: HashSet<String> = vec!["a".into(), "b".into()].into_iter().collect();
        let score2 = jaccard_similarity(&a, &c);
        assert!((score2 - 0.0).abs() < f64::EPSILON, "素集合は0.0");

        let empty_a: HashSet<String> = HashSet::new();
        let empty_b: HashSet<String> = HashSet::new();
        let score3 = jaccard_similarity(&empty_a, &empty_b);
        assert!((score3 - 1.0).abs() < f64::EPSILON, "空集合同士は1.0");
    }

    #[test]
    fn test_match_pairs() {
        // 3x3 行列で対角線が最高スコア
        let result = match_pairs(3, 3, |oi, ni| if oi == ni { 1.0 } else { 0.3 }, 0.2);
        assert_eq!(result.len(), 3, "3ペアがマッチする");
        for (oi, ni, _) in &result {
            assert_eq!(oi, ni, "対角線ペアがマッチする");
        }
    }

    #[test]
    fn test_diff_sheet_tables_added_table() {
        let old_tables: Vec<TableInfo> = vec![];
        let new_tables = vec![make_table(
            "users",
            "ユーザー",
            vec![make_column("id", "ID", "int")],
        )];

        let (changes, suggestions) =
            diff_sheet_tables("Sheet1", &old_tables, &new_tables, &DiffThresholds::default());

        assert_eq!(changes.len(), 1, "1件の変更が検出される");
        assert_eq!(changes[0].action, "added", "追加アクション");
        assert!(suggestions.is_empty(), "リネーム提案なし");
    }

    #[test]
    fn test_diff_sheet_tables_removed_column() {
        let old_tables = vec![make_table(
            "users",
            "ユーザー",
            vec![
                make_column("id", "ID", "int"),
                make_column("name", "名前", "varchar"),
                make_column("email", "メール", "varchar"),
            ],
        )];
        let new_tables = vec![make_table(
            "users",
            "ユーザー",
            vec![
                make_column("id", "ID", "int"),
                make_column("name", "名前", "varchar"),
            ],
        )];

        let (changes, _) =
            diff_sheet_tables("Sheet1", &old_tables, &new_tables, &DiffThresholds::default());

        assert_eq!(changes.len(), 1, "1件のテーブル変更が検出される");
        assert_eq!(changes[0].action, "changed", "変更アクション");
        let col_changes = &changes[0].column_changes;
        let removed = col_changes.iter().filter(|c| c.action == "removed").count();
        assert_eq!(removed, 1, "1件のカラム削除が検出される");
    }
}
