// 物理名修正適用モジュール: プランに従って xlsx のセルを上書きする
// Python 非依存の Tauri ネイティブ実装 (書式は失われるが内容は保持される)

use std::{collections::HashMap, path::Path};

use calamine::{open_workbook_auto, Data, Reader};
use rust_xlsxwriter::Workbook;
use serde::Serialize;
use tauri::AppHandle;

use crate::{commands::resolve_parse_options_pub, excel, name_fix::NameFixTableMapping, storage};

// ──────────────────────────────────────────────
// レスポンス型 (shared/schema.ts の nameFixApplyResponseSchema に対応)
// ──────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NameFixApplyFileResult {
  pub file_id: i64,
  pub source_path: String,
  pub output_path: Option<String>,
  pub backup_path: Option<String>,
  pub report_json_path: Option<String>,
  pub report_text_path: Option<String>,
  pub download_token: Option<String>,
  pub download_filename: Option<String>,
  pub success: bool,
  pub changed_table_count: usize,
  pub changed_column_count: usize,
  pub skipped_changes: usize,
  pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NameFixApplySummary {
  pub file_count: usize,
  pub success_count: usize,
  pub failed_count: usize,
  pub changed_table_count: usize,
  pub changed_column_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NameFixApplyResponse {
  pub job_id: String,
  pub plan_id: String,
  pub plan_hash: String,
  pub status: String,
  pub download_bundle_token: Option<String>,
  pub download_bundle_filename: Option<String>,
  pub summary: NameFixApplySummary,
  pub files: Vec<NameFixApplyFileResult>,
}

// ──────────────────────────────────────────────
// 内部型
// ──────────────────────────────────────────────

/// (row, col) → 新しいセル値のパッチマップ
type PatchMap = HashMap<(usize, usize), String>;

/// シートデータ: start_row / start_col (絶対位置) + セル文字列行列
struct SheetSnapshot {
  start_row: usize,
  start_col: usize,
  rows: Vec<Vec<String>>,
}

// ──────────────────────────────────────────────
// calamine ユーティリティ
// ──────────────────────────────────────────────

fn data_to_string(cell: &Data) -> String {
  match cell {
    Data::Empty => String::new(),
    Data::String(s) => s.clone(),
    Data::Float(f) => {
      // 整数と見なせる場合は小数点なしで出力
      if f.fract() == 0.0 && f.abs() < 1e15 {
        format!("{}", *f as i64)
      } else {
        f.to_string()
      }
    }
    Data::Int(i) => i.to_string(),
    Data::Bool(b) => b.to_string(),
    Data::DateTime(d) => d.to_string(),
    Data::DateTimeIso(s) => s.clone(),
    Data::DurationIso(s) => s.clone(),
    Data::Error(e) => format!("{e:?}"),
  }
}

// ──────────────────────────────────────────────
// コア実装
// ──────────────────────────────────────────────

/// パッチセットを構築する
/// 戻り値: (changed_table_count, changed_column_count, skipped_changes, PatchMap)
fn build_patch_map(
  mappings: &[NameFixTableMapping],
  tables: &[crate::models::TableInfo],
) -> (usize, usize, usize, PatchMap) {
  let mut patches: PatchMap = HashMap::new();
  let mut changed_table_count = 0usize;
  let mut changed_column_count = 0usize;
  let mut skipped_changes = 0usize;

  for mapping in mappings {
    // テーブル物理名セルにパッチを適用
    if mapping.table_changed {
      if let Some(table) = tables.get(mapping.table_index) {
        if let Some(src) = &table.source_ref {
          if let Some(phys) = &src.physical_name {
            patches.insert((phys.row as usize, phys.col as usize), mapping.table_after.clone());
            changed_table_count += 1;
          } else {
            skipped_changes += 1;
          }
        } else {
          skipped_changes += 1;
        }
      }
    }

    // 各カラム物理名セルにパッチを適用
    for col_mapping in &mapping.columns {
      if col_mapping.changed {
        if let Some(table) = tables.get(mapping.table_index) {
          if let Some(col_info) = table.columns.get(col_mapping.column_index) {
            if let Some(src) = &col_info.source_ref {
              patches.insert((src.row as usize, src.col as usize), col_mapping.after.clone());
              changed_column_count += 1;
            } else {
              skipped_changes += 1;
            }
          }
        }
      }
    }
  }

  (changed_table_count, changed_column_count, skipped_changes, patches)
}

/// xlsx ファイルを全シート読み込んで SheetSnapshot の HashMap を返す
fn read_all_sheets(file_path: &str) -> Result<(Vec<String>, HashMap<String, SheetSnapshot>), String> {
  let mut workbook =
    open_workbook_auto(file_path).map_err(|e| format!("Failed to open xlsx: {e}"))?;

  let sheet_names: Vec<String> = workbook.sheet_names().to_vec();
  let mut snapshots: HashMap<String, SheetSnapshot> = HashMap::new();

  for name in &sheet_names {
    if let Ok(range) = workbook.worksheet_range(name) {
      let (start_row, start_col) = range.start().map(|(r, c)| (r as usize, c as usize)).unwrap_or((0, 0));

      let rows: Vec<Vec<String>> = range
        .rows()
        .map(|row| row.iter().map(data_to_string).collect())
        .collect();

      snapshots.insert(name.clone(), SheetSnapshot { start_row, start_col, rows });
    }
  }

  Ok((sheet_names, snapshots))
}

/// パッチをシートスナップショットに適用する
/// patches のキーは excel.rs で設定した "行列インデックス" (0ベース, range 相対)
fn apply_patches_to_snapshot(snapshot: &mut SheetSnapshot, patches: &PatchMap) {
  for ((patch_row, patch_col), new_value) in patches {
    if let Some(row_data) = snapshot.rows.get_mut(*patch_row) {
      if let Some(cell) = row_data.get_mut(*patch_col) {
        *cell = new_value.clone();
      }
    }
  }
}

/// rust_xlsxwriter で新しい xlsx バイト列を生成する
/// 書式・スタイルは保持されないが、セル値と配置は保持される
fn build_modified_workbook(
  sheet_names: &[String],
  snapshots: &HashMap<String, SheetSnapshot>,
) -> Result<Vec<u8>, String> {
  let mut workbook = Workbook::new();

  for name in sheet_names {
    let worksheet = workbook.add_worksheet();
    worksheet
      .set_name(name)
      .map_err(|e| format!("Failed to set sheet name '{name}': {e}"))?;

    if let Some(snapshot) = snapshots.get(name) {
      for (row_idx, row) in snapshot.rows.iter().enumerate() {
        // 絶対シート行 = range 開始行 + 行インデックス
        let abs_row = (snapshot.start_row + row_idx) as u32;
        for (col_idx, cell) in row.iter().enumerate() {
          if cell.is_empty() {
            continue;
          }
          let abs_col = (snapshot.start_col + col_idx) as u16;
          worksheet
            .write_string(abs_row, abs_col, cell)
            .map_err(|e| format!("Failed to write cell ({abs_row},{abs_col}): {e}"))?;
        }
      }
    }
  }

  workbook.save_to_buffer().map_err(|e| format!("Failed to serialize xlsx: {e}"))
}

/// 出力ファイル名を生成する: "{stem}_fixed.xlsx"
fn output_file_name(source_path: &str) -> String {
  let stem = Path::new(source_path)
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("workbook");
  format!("{stem}_fixed.xlsx")
}

// ──────────────────────────────────────────────
// 公開エントリーポイント
// ──────────────────────────────────────────────

/// 名前修正プランを適用し、修正済み xlsx を DB に保存して結果を返す
///
/// Tauri 環境では mode に関わらず "copy" として動作する (新規 DB エントリとして保存)。
/// "replace_download" モードはフロントエンドから Blob URL でダウンロード可能にするため
/// `download_token` に生成ファイルの DB ID を文字列で返す。
pub fn apply_name_fix(
  app: &AppHandle,
  plan_id: &str,
  _mode: &str,
  _include_report: bool,
) -> Result<NameFixApplyResponse, String> {
  // 1. DB からプランを取得
  let (file_id, sheet_name, plan_json) =
    storage::get_name_fix_plan(app, plan_id)?.ok_or_else(|| format!("Plan not found: {plan_id}"))?;

  let mappings: Vec<NameFixTableMapping> =
    serde_json::from_str(&plan_json).map_err(|e| format!("Failed to decode plan JSON: {e}"))?;

  // 2. ファイルパスを取得
  let file_record =
    storage::find_uploaded_file(app, file_id)?.ok_or_else(|| "Source file not found".to_string())?;
  let file_path = &file_record.file_path;

  // 3. xlsx を再パースしてソースリファレンスを取得
  let parse_options = resolve_parse_options_pub(app);
  let tables = excel::list_table_info(Path::new(file_path), &sheet_name, &parse_options)?;

  // 4. セルパッチを構築
  let (changed_table_count, changed_column_count, skipped_changes, patches) =
    build_patch_map(&mappings, &tables);

  // 5. 全シートを読み込む
  let (sheet_names, mut snapshots) = read_all_sheets(file_path)?;

  // 6. 対象シートにパッチを適用
  if let Some(snapshot) = snapshots.get_mut(&sheet_name) {
    apply_patches_to_snapshot(snapshot, &patches);
  }

  // 7. 修正済み xlsx バイト列を生成
  let modified_bytes = build_modified_workbook(&sheet_names, &snapshots)?;

  // 8. 新規 DB エントリとして保存
  let out_name = output_file_name(file_path);
  let file_hash = storage::compute_sha256_hex(&modified_bytes);
  let saved = storage::import_generated_workbook(app, out_name.clone(), modified_bytes, file_hash)?;

  let job_id = format!("job-{}-{}", plan_id, chrono::Utc::now().timestamp_millis());
  let plan_hash = storage::compute_sha256_hex(plan_json.as_bytes());

  let file_result = NameFixApplyFileResult {
    file_id: saved.id,
    source_path: file_path.clone(),
    output_path: Some(saved.file_path.clone()),
    backup_path: None,
    report_json_path: None,
    report_text_path: None,
    download_token: None,
    download_filename: Some(out_name),
    success: true,
    changed_table_count,
    changed_column_count,
    skipped_changes,
    error: None,
  };

  Ok(NameFixApplyResponse {
    job_id,
    plan_id: plan_id.to_string(),
    plan_hash,
    status: "completed".into(),
    download_bundle_token: None,
    download_bundle_filename: None,
    summary: NameFixApplySummary {
      file_count: 1,
      success_count: 1,
      failed_count: 0,
      changed_table_count,
      changed_column_count,
    },
    files: vec![file_result],
  })
}

// ──────────────────────────────────────────────
// ユニットテスト
// ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
  use super::*;
  use crate::name_fix::NameFixColumnMapping;

  fn make_column_mapping(column_index: usize, before: &str, after: &str, changed: bool) -> NameFixColumnMapping {
    NameFixColumnMapping { column_index, before: before.into(), after: after.into(), changed }
  }

  fn make_table_mapping(
    table_index: usize,
    table_before: &str,
    table_after: &str,
    table_changed: bool,
    columns: Vec<NameFixColumnMapping>,
  ) -> NameFixTableMapping {
    NameFixTableMapping {
      table_index,
      table_before: table_before.into(),
      table_after: table_after.into(),
      table_changed,
      columns,
    }
  }

  // パッチマップ構築テスト: ソースリファレンスなしのテーブルはスキップされる
  #[test]
  fn build_patch_map_skips_missing_source_ref() {
    use crate::models::TableInfo;
    let table = TableInfo {
      logical_table_name: "テスト".into(),
      physical_table_name: "test".into(),
      columns: vec![],
      column_range: None,
      row_range: None,
      excel_range: None,
      source_ref: None, // ソースリファレンスなし
    };
    let mapping = make_table_mapping(0, "test", "test_new", true, vec![]);
    let (ct, cc, skipped, patches) = build_patch_map(&[mapping], &[table]);
    assert_eq!(ct, 0);
    assert_eq!(cc, 0);
    assert_eq!(skipped, 1);
    assert!(patches.is_empty());
  }

  // パッチ適用テスト: 指定セルが上書きされる
  #[test]
  fn apply_patches_to_snapshot_overwrites_cell() {
    let mut snapshot = SheetSnapshot {
      start_row: 0,
      start_col: 0,
      rows: vec![
        vec!["old_table".into(), "col_a".into()],
        vec!["row2_a".into(), "row2_b".into()],
      ],
    };
    let mut patches = PatchMap::new();
    patches.insert((0, 0), "new_table".into());
    patches.insert((1, 1), "new_b".into());

    apply_patches_to_snapshot(&mut snapshot, &patches);

    assert_eq!(snapshot.rows[0][0], "new_table");
    assert_eq!(snapshot.rows[0][1], "col_a");
    assert_eq!(snapshot.rows[1][1], "new_b");
  }

  // xlsx 生成テスト: build_modified_workbook が非空バイトを返す
  #[test]
  fn build_modified_workbook_returns_non_empty_bytes() {
    let sheet_names = vec!["Sheet1".to_string()];
    let mut snapshots = HashMap::new();
    snapshots.insert(
      "Sheet1".to_string(),
      SheetSnapshot {
        start_row: 0,
        start_col: 0,
        rows: vec![vec!["header1".into(), "header2".into()], vec!["val1".into(), "val2".into()]],
      },
    );

    let bytes = build_modified_workbook(&sheet_names, &snapshots).unwrap();
    assert!(!bytes.is_empty(), "xlsx bytes must not be empty");
    // xlsx は PK ヘッダ (50 4B) で始まる
    assert_eq!(&bytes[..2], b"PK");
  }

  // カラムマッピングなし・変更なしの場合はパッチが空
  #[test]
  fn build_patch_map_no_changes_yields_empty_patches() {
    let mapping = make_table_mapping(
      0,
      "users",
      "users",
      false,
      vec![make_column_mapping(0, "id", "id", false)],
    );
    let (ct, cc, skipped, patches) = build_patch_map(&[mapping], &[]);
    assert_eq!(ct, 0);
    assert_eq!(cc, 0);
    assert_eq!(skipped, 0);
    assert!(patches.is_empty());
  }
}
