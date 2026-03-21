use rust_xlsxwriter::{Workbook, XlsxError};

use crate::{
  ddl_import::{DdlImportCatalog, DdlImportIssueSummary, DdlImportTable},
  excel,
  models::{workbook_template_variants, UploadedFileRecord, WorkbookTemplateValidation, WorkbookTemplateVariant},
  storage,
};

// ──────────────────────────────────────────────
// 定数
// ──────────────────────────────────────────────

const FORMAT_A_HEADERS: &[&str] = &["No", "論理名", "物理名", "データ型", "Size", "Not Null", "PK", "備考"];
const FORMAT_B_TABLE_HEADERS: &[&str] = &["No.", "論理テーブル名", "物理テーブル名", "説明"];
const MARKER_TRUE: &str = "〇";
const AUTO_INCREMENT_NOTE: &str = "AUTO_INCREMENT";

// ──────────────────────────────────────────────
// 公開リクエスト/レスポンス型
// ──────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportExportRequest {
  pub source_mode: String,
  pub sql_text: String,
  pub file_name: Option<String>,
  pub template_id: String,
  pub selected_table_names: Vec<String>,
  pub allow_lossy_export: bool,
  pub original_name: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportExportResponse {
  pub file: UploadedFileRecord,
  pub template: WorkbookTemplateVariant,
  pub validation: WorkbookTemplateValidation,
  pub source_mode: String,
  pub dialect: String,
  pub selected_table_names: Vec<String>,
  pub issue_summary: DdlImportIssueSummary,
}

// ──────────────────────────────────────────────
// ファイル名ユーティリティ
// ──────────────────────────────────────────────

fn ensure_xlsx_extension(name: &str) -> String {
  let trimmed = name.trim();
  if trimmed.to_ascii_lowercase().ends_with(".xlsx") {
    trimmed.to_string()
  } else {
    format!("{trimmed}.xlsx")
  }
}

fn sanitize_original_name(name: &str) -> String {
  let with_ext = ensure_xlsx_extension(name);
  let cleaned: String = with_ext
    .chars()
    .map(|c| match c {
      '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
      ctrl if ctrl.is_control() => '_',
      other => other,
    })
    .collect();
  let trimmed = cleaned.trim().to_string();
  if trimmed.is_empty() {
    "ddl-import.xlsx".to_string()
  } else {
    trimmed
  }
}

/// シート名を 31 文字以内に収め、重複しないように連番サフィックスを付与する
fn to_sheet_name(table_name: &str, used: &mut Vec<String>) -> String {
  let base: String = table_name
    .trim()
    .chars()
    .map(|c| match c {
      ':' | '\\' | '/' | '?' | '*' | '[' | ']' => '_',
      other => other,
    })
    .collect();
  let base = if base.is_empty() { "table".to_string() } else { base };
  let base = if base.chars().count() > 31 {
    base.chars().take(31).collect()
  } else {
    base
  };

  let mut candidate = base.clone();
  let mut index = 2_u32;
  while used.contains(&candidate) {
    let suffix = format!("_{index}");
    let max_base_len = 31_usize.saturating_sub(suffix.chars().count());
    let trimmed_base: String = base.chars().take(max_base_len.max(1)).collect();
    candidate = format!("{trimmed_base}{suffix}");
    index += 1;
  }
  used.push(candidate.clone());
  candidate
}

// ──────────────────────────────────────────────
// 備考セル構築
// ──────────────────────────────────────────────

fn build_comment_cell(table: &DdlImportTable, column: &crate::ddl_import::DdlImportColumn) -> String {
  let mut segments: Vec<String> = Vec::new();
  if let Some(comment) = &column.comment {
    segments.push(comment.clone());
  }
  if column.auto_increment {
    segments.push(AUTO_INCREMENT_NOTE.to_string());
  }
  // FK 参照メモ
  for fk in &table.foreign_keys {
    if fk.columns.iter().any(|c| c.column_name == column.name) {
      segments.push(format!("FK {}: {} -> {}", fk.name, column.name, fk.referenced_table_name));
    }
  }
  segments.join("\n")
}

// ──────────────────────────────────────────────
// Format-A ワークシート（1テーブル = 1シート）
// ──────────────────────────────────────────────

fn write_format_a_worksheet(
  workbook: &mut Workbook,
  table: &DdlImportTable,
  sheet_name: &str,
) -> Result<(), XlsxError> {
  let ws = workbook.add_worksheet();
  ws.set_name(sheet_name)?;

  // テーブルヘッダーブロック
  ws.write_string(0, 0, "テーブル情報")?;
  ws.write_string(2, 0, "論理テーブル名")?;
  ws.write_string(2, 1, &table.name)?;
  ws.write_string(3, 0, "物理テーブル名")?;
  ws.write_string(3, 1, &table.name)?;
  ws.write_string(5, 0, "カラム情報")?;

  // カラムヘッダー行
  let header_row = 6_u32;
  for (col_idx, header) in FORMAT_A_HEADERS.iter().enumerate() {
    ws.write_string(header_row, col_idx as u16, *header)?;
  }

  // カラム行
  for (i, column) in table.columns.iter().enumerate() {
    let row = header_row + 1 + i as u32;
    ws.write_number(row, 0, (i + 1) as f64)?;
    ws.write_string(row, 1, &column.name)?;
    ws.write_string(row, 2, &column.name)?;
    ws.write_string(row, 3, &column.data_type)?;
    ws.write_string(
      row, 4,
      column.data_type_args.as_deref().unwrap_or(""),
    )?;
    ws.write_string(row, 5, if column.nullable { "" } else { MARKER_TRUE })?;
    ws.write_string(row, 6, if column.primary_key { MARKER_TRUE } else { "" })?;
    ws.write_string(row, 7, &build_comment_cell(table, column))?;
  }

  Ok(())
}

// ──────────────────────────────────────────────
// Format-B ワークシート（全テーブル = 1シート）
// ──────────────────────────────────────────────

fn write_format_b_worksheet(
  workbook: &mut Workbook,
  tables: &[&DdlImportTable],
  sheet_name: &str,
) -> Result<(), XlsxError> {
  let ws = workbook.add_worksheet();
  ws.set_name(sheet_name)?;

  ws.write_string(0, 0, "データベース定義書")?;
  let mut current_row = 2_u32;

  for (table_idx, table) in tables.iter().enumerate() {
    if table_idx > 0 {
      current_row += 1; // テーブル間の空行
    }

    // テーブルサマリーヘッダー
    for (col_idx, header) in FORMAT_B_TABLE_HEADERS.iter().enumerate() {
      ws.write_string(current_row, col_idx as u16, *header)?;
    }
    current_row += 1;

    // テーブルサマリー行
    ws.write_number(current_row, 0, (table_idx + 1) as f64)?;
    ws.write_string(current_row, 1, &table.name)?;
    ws.write_string(current_row, 2, &table.name)?;
    ws.write_string(
      current_row, 3,
      table.comment.as_deref().unwrap_or(""),
    )?;
    current_row += 1;

    current_row += 1; // 空行

    // カラムヘッダー行
    for (col_idx, header) in FORMAT_A_HEADERS.iter().enumerate() {
      ws.write_string(current_row, col_idx as u16, *header)?;
    }
    current_row += 1;

    // カラム行
    for (i, column) in table.columns.iter().enumerate() {
      ws.write_number(current_row, 0, (i + 1) as f64)?;
      ws.write_string(current_row, 1, &column.name)?;
      ws.write_string(current_row, 2, &column.name)?;
      ws.write_string(current_row, 3, &column.data_type)?;
      ws.write_string(
        current_row, 4,
        column.data_type_args.as_deref().unwrap_or(""),
      )?;
      ws.write_string(current_row, 5, if column.nullable { "" } else { MARKER_TRUE })?;
      ws.write_string(current_row, 6, if column.primary_key { MARKER_TRUE } else { "" })?;
      ws.write_string(current_row, 7, &build_comment_cell(table, column))?;
      current_row += 1;
    }
  }

  Ok(())
}

// ──────────────────────────────────────────────
// ワークブックバイト列構築
// ──────────────────────────────────────────────

fn build_workbook_bytes(
  template: &WorkbookTemplateVariant,
  tables: &[&DdlImportTable],
) -> Result<Vec<u8>, String> {
  let mut workbook = Workbook::new();

  if template.id == "format-a-table-sheet" {
    let mut used_names: Vec<String> = Vec::new();
    for table in tables {
      let sheet_name = to_sheet_name(&table.name, &mut used_names);
      write_format_a_worksheet(&mut workbook, table, &sheet_name)
        .map_err(|e| format!("Failed to write format-a worksheet: {e}"))?;
    }
  } else {
    write_format_b_worksheet(&mut workbook, tables, &template.starter_sheet_name)
      .map_err(|e| format!("Failed to write format-b worksheet: {e}"))?;
  }

  workbook
    .save_to_buffer()
    .map_err(|e| format!("Failed to serialize workbook: {e}"))
}

// ──────────────────────────────────────────────
// ラウンドトリップバリデーション
// ──────────────────────────────────────────────

fn validate_round_trip(
  bytes: &[u8],
  template: &WorkbookTemplateVariant,
  selected_tables: &[&DdlImportTable],
  parse_options: &excel::ParseOptions,
) -> WorkbookTemplateValidation {
  // 一時ファイルに書き出してパーサーで再解析
  let temp_path = std::env::temp_dir().join(format!(
    "ddl-import-roundtrip-{}.xlsx",
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_nanos())
      .unwrap_or(0)
  ));

  let base_validation = WorkbookTemplateValidation {
    parser_format: template.parser_format.clone(),
    expected_parser_format: template.parser_format.clone(),
    recognized: false,
    workbook_sheet_count: 0,
    checked_sheet_name: template.starter_sheet_name.clone(),
    reasons: vec!["round_trip_not_run".to_string()],
  };

  if std::fs::write(&temp_path, bytes).is_err() {
    return base_validation;
  }

  let sheet_summaries = match excel::list_sheet_summaries(&temp_path) {
    Ok(s) => s,
    Err(_) => {
      let _ = std::fs::remove_file(&temp_path);
      return base_validation;
    }
  };

  // 解析してテーブル名を収集
  let first_table_sheet = sheet_summaries
    .iter()
    .find(|s| s.has_table_definitions)
    .map(|s| s.name.clone());

  let sheet_to_check = first_table_sheet
    .as_deref()
    .unwrap_or(&template.starter_sheet_name);

  let parsed_names: std::collections::HashSet<String> = match excel::list_table_info(
    &temp_path,
    sheet_to_check,
    parse_options,
  ) {
    Ok(tables) => tables
      .into_iter()
      .map(|t| t.physical_table_name)
      .filter(|n| !n.trim().is_empty())
      .collect(),
    Err(_) => {
      let _ = std::fs::remove_file(&temp_path);
      return base_validation;
    }
  };

  let _ = std::fs::remove_file(&temp_path);

  // 選択テーブルが全て解析できたか確認
  let missing: Vec<String> = selected_tables
    .iter()
    .filter(|t| !parsed_names.contains(&t.name))
    .map(|t| t.name.clone())
    .collect();

  let recognized = missing.is_empty();
  let mut reasons = Vec::new();
  if !missing.is_empty() {
    reasons.push(format!("round_trip_missing_tables:{}", missing.join(",")));
  }

  WorkbookTemplateValidation {
    parser_format: template.parser_format.clone(),
    expected_parser_format: template.parser_format.clone(),
    recognized,
    workbook_sheet_count: sheet_summaries.len() as i64,
    checked_sheet_name: sheet_to_check.to_string(),
    reasons,
  }
}

// ──────────────────────────────────────────────
// 公開エントリーポイント
// ──────────────────────────────────────────────

pub fn export_workbook_from_ddl(
  app: &tauri::AppHandle,
  request: &DdlImportExportRequest,
  catalog: &DdlImportCatalog,
  issue_summary: DdlImportIssueSummary,
) -> Result<DdlImportExportResponse, String> {
  // テンプレート解決
  let template = workbook_template_variants()
    .into_iter()
    .find(|t| t.id == request.template_id)
    .ok_or_else(|| format!("Unknown template: {}", request.template_id))?;

  // 選択テーブルのフィルタリング
  let selected_tables: Vec<&DdlImportTable> = request
    .selected_table_names
    .iter()
    .filter_map(|name| catalog.tables.iter().find(|t| &t.name == name))
    .collect();

  if selected_tables.is_empty() {
    return Err("Select at least one parsed table to export.".to_string());
  }
  if selected_tables.len() != request.selected_table_names.len() {
    let missing: Vec<&str> = request
      .selected_table_names
      .iter()
      .filter(|name| !selected_tables.iter().any(|t| &t.name == *name))
      .map(|s| s.as_str())
      .collect();
    return Err(format!(
      "Some selected tables are not available in the parsed catalog: {}",
      missing.join(", ")
    ));
  }

  // ワークブックバイト列生成
  let bytes = build_workbook_bytes(&template, &selected_tables)?;

  // ラウンドトリップバリデーション
  let parse_options = crate::commands::resolve_parse_options_pub(app);
  let validation = validate_round_trip(&bytes, &template, &selected_tables, &parse_options);

  if !validation.recognized && !request.allow_lossy_export {
    return Err(format!(
      "Round-trip validation failed for {}: {}",
      template.id,
      validation.reasons.join(", ")
    ));
  }

  // ファイル名解決
  let original_name = sanitize_original_name(
    request
      .original_name
      .as_deref()
      .filter(|s| !s.trim().is_empty())
      .unwrap_or(&template.suggested_file_name),
  );

  // SHA-256 ハッシュ算出（生成済みバイト列を使用）
  let file_hash = storage::compute_sha256_hex(&bytes);

  // DB 保存（重複ハッシュチェックは import_generated_workbook 内で実施）
  let file = storage::import_generated_workbook(app, original_name.clone(), bytes, file_hash)?;

  Ok(DdlImportExportResponse {
    file,
    template,
    validation,
    source_mode: catalog.source_mode.clone(),
    dialect: catalog.dialect.clone(),
    selected_table_names: selected_tables.iter().map(|t| t.name.clone()).collect(),
    issue_summary,
  })
}

// ──────────────────────────────────────────────
// テスト
// ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
  use super::*;
  use crate::ddl_import::{DdlImportColumn, DdlImportTable};

  fn make_table(name: &str, cols: &[(&str, &str, bool, bool)]) -> DdlImportTable {
    DdlImportTable {
      entity_key: name.to_string(),
      name: name.to_string(),
      comment: None,
      engine: None,
      columns: cols
        .iter()
        .map(|(col_name, data_type, nullable, pk)| DdlImportColumn {
          entity_key: col_name.to_string(),
          name: col_name.to_string(),
          data_type: data_type.to_string(),
          data_type_args: None,
          column_type: data_type.to_string(),
          nullable: *nullable,
          default_value: None,
          auto_increment: false,
          primary_key: *pk,
          unique: false,
          comment: None,
        })
        .collect(),
      indexes: vec![],
      foreign_keys: vec![],
    }
  }

  #[test]
  fn format_a_workbook_bytes_are_non_empty() {
    let table = make_table("users", &[("id", "int", false, true), ("name", "varchar", true, false)]);
    let templates = workbook_template_variants();
    let template = templates.iter().find(|t| t.id == "format-a-table-sheet").unwrap();
    let bytes = build_workbook_bytes(template, &[&table]).unwrap();
    assert!(!bytes.is_empty());
    // XLSX マジックバイト
    assert_eq!(&bytes[0..4], b"PK\x03\x04");
  }

  #[test]
  fn format_b_workbook_bytes_are_non_empty() {
    let t1 = make_table("orders", &[("order_id", "int", false, true)]);
    let t2 = make_table("items", &[("item_id", "int", false, true), ("price", "decimal", false, false)]);
    let templates = workbook_template_variants();
    let template = templates.iter().find(|t| t.id == "format-b-multi-table-sheet").unwrap();
    let bytes = build_workbook_bytes(template, &[&t1, &t2]).unwrap();
    assert!(!bytes.is_empty());
    assert_eq!(&bytes[0..4], b"PK\x03\x04");
  }

  #[test]
  fn sheet_name_truncates_to_31_chars() {
    let long = "a".repeat(40);
    let mut used = Vec::new();
    let result = to_sheet_name(&long, &mut used);
    assert!(result.chars().count() <= 31);
  }

  #[test]
  fn sheet_name_deduplicates_with_suffix() {
    let mut used = Vec::new();
    let first = to_sheet_name("users", &mut used);
    let second = to_sheet_name("users", &mut used);
    assert_ne!(first, second);
    assert_eq!(second, "users_2");
  }
}
