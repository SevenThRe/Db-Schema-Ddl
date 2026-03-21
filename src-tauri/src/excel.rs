use std::{
  collections::{HashMap, HashSet},
  fmt::Display,
  path::Path,
};

use calamine::{open_workbook_auto, Data, Range, Reader};
use serde_json::{Number, Value};

use crate::constants::DEFAULT_PK_MARKER;
use crate::models::{
  CellSourceRef, ColumnInfo, SearchIndexItem, SheetSummary, TableColumnRange, TableInfo, TableRowRange,
  TableSourceRef,
};

const TABLE_MARKER: &str = "論理テーブル名";
const PHYSICAL_TABLE_MARKER: &str = "物理テーブル名";
const LOGICAL_NAME_HEADER: &str = "論理名";
const PHYSICAL_NAME_HEADER: &str = "物理名";
const DATA_TYPE_HEADER: &str = "データ型";
const SIZE_HEADER: &str = "Size";
const SIZE_ALT_HEADER: &str = "サイズ";
const NOT_NULL_HEADER: &str = "Not Null";
const PK_HEADER: &str = "PK";
const REMARKS_HEADER: &str = "備考";
const REMARKS_ALT_HEADER: &str = "列とコードの説明 / 備考";
const NO_HEADER: &str = "No";
const NO_DOT_HEADER: &str = "No.";

const DEFAULT_MAX_CONSECUTIVE_EMPTY_ROWS: usize = 10;
const TABLE_META_SCAN_ROWS: usize = 15;
const FORMAT_A_HEADER_SCAN_ROWS: usize = 30;
const FORMAT_B_HEADER_SCAN_ROWS: usize = 30;
const FORMAT_B_COLUMN_SCAN_LIMIT: usize = 15;
const FORMAT_MARKER_SCAN_ROWS: usize = 25;
const FORMAT_MARKER_SCAN_COLS: usize = 20;
const HORIZONTAL_BLOCK_MIN_COLUMN: usize = 10;
const ADJACENT_TABLE_NAME_SEARCH_ROWS: usize = 30;
const SIDE_BY_SIDE_LOGICAL_NAME_NEIGHBOR_ROWS: usize = 5;
const TABLE_NAME_SEARCH_COL_LEFT_PADDING: usize = 2;
const TABLE_NAME_SEARCH_COL_RIGHT_PADDING: usize = 4;
const PK_MARKER_VARIANTS: [&str; 3] = [DEFAULT_PK_MARKER, "○", "◯"];
const INVALID_WORKBOOK_MESSAGE: &str = "Uploaded file is not a valid Excel workbook";

#[derive(Debug, Clone)]
pub struct ParseOptions {
  pub max_consecutive_empty_rows: usize,
  pub pk_markers: Vec<String>,
}

impl Default for ParseOptions {
  fn default() -> Self {
    Self {
      max_consecutive_empty_rows: DEFAULT_MAX_CONSECUTIVE_EMPTY_ROWS,
      pk_markers: vec![DEFAULT_PK_MARKER.into()],
    }
  }
}

type SheetMatrix = Vec<Vec<String>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExcelFormat {
  A,
  B,
  Unknown,
}

#[derive(Debug, Clone)]
struct FormatDetectionResult {
  format: ExcelFormat,
}

fn excel_error(action: impl Display, error: impl Display) -> String {
  format!("Failed to {action}: {error}")
}

fn cell_to_text(cell: &Data) -> String {
  match cell {
    Data::Empty => String::new(),
    Data::String(value) => value.trim().to_string(),
    Data::Float(value) => value.to_string(),
    Data::Int(value) => value.to_string(),
    Data::Bool(value) => value.to_string(),
    Data::Error(value) => format!("{value:?}"),
    Data::DateTime(value) => value.to_string(),
    Data::DateTimeIso(value) => value.trim().to_string(),
    Data::DurationIso(value) => value.trim().to_string(),
  }
}

fn cell_to_json(cell: &Data) -> Value {
  match cell {
    Data::Empty => Value::Null,
    Data::String(value) => Value::String(value.clone()),
    Data::Float(value) => Number::from_f64(*value).map(Value::Number).unwrap_or(Value::Null),
    Data::Int(value) => Value::Number(Number::from(*value)),
    Data::Bool(value) => Value::Bool(*value),
    Data::Error(value) => Value::String(format!("{value:?}")),
    Data::DateTime(value) => Value::String(value.to_string()),
    Data::DateTimeIso(value) => Value::String(value.clone()),
    Data::DurationIso(value) => Value::String(value.clone()),
  }
}

fn range_to_string_matrix(range: &Range<Data>) -> SheetMatrix {
  range
    .rows()
    .map(|row| row.iter().map(cell_to_text).collect::<Vec<_>>())
    .collect::<Vec<_>>()
}

fn row_cell(row: &[String], col: usize) -> &str {
  row.get(col).map(|value| value.trim()).unwrap_or_default()
}

fn sheet_cell(data: &[Vec<String>], row: usize, col: usize) -> &str {
  data.get(row).map(|row_data| row_cell(row_data, col)).unwrap_or_default()
}

fn normalize_token(value: &str) -> String {
  value
    .replace('\u{3000}', " ")
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
    .trim()
    .to_lowercase()
}

fn is_empty(value: &str) -> bool {
  value.trim().is_empty() || value.trim() == "　"
}

fn column_label(col: usize) -> String {
  let mut label = String::new();
  let mut number = col as i64;
  while number >= 0 {
    let ch = (b'A' + (number % 26) as u8) as char;
    label.insert(0, ch);
    number = (number / 26) - 1;
  }
  label
}

fn cell_address(row: usize, col: usize) -> String {
  format!("{}{}", column_label(col), row + 1)
}

fn build_cell_source_ref(sheet_name: &str, row: usize, col: usize) -> CellSourceRef {
  CellSourceRef {
    sheet_name: sheet_name.into(),
    row: row as i64,
    col: col as i64,
    address: Some(cell_address(row, col)),
  }
}

fn format_excel_range(start_row: usize, end_row: usize, start_col: usize, end_col: usize) -> String {
  format!(
    "{}{}:{}{}",
    column_label(start_col),
    start_row + 1,
    column_label(end_col),
    end_row + 1
  )
}

fn normalize_identifier_segment(value: &str) -> String {
  let mut normalized = String::new();
  let mut previous_was_separator = false;

  for ch in value.trim().chars() {
    let mapped = if ch.is_ascii_alphanumeric() {
      ch.to_ascii_lowercase()
    } else if ch == '_' {
      '_'
    } else {
      previous_was_separator = true;
      continue;
    };

    if previous_was_separator && !normalized.is_empty() && !normalized.ends_with('_') {
      normalized.push('_');
    }
    previous_was_separator = false;
    normalized.push(mapped);
  }

  let normalized = normalized.trim_matches('_').to_string();
  let normalized = if normalized.is_empty() {
    "sheet".to_string()
  } else {
    normalized
  };

  if normalized.chars().next().map(|ch| ch.is_ascii_digit()).unwrap_or(false) {
    format!("s_{normalized}")
  } else {
    normalized
  }
}

fn build_region_physical_table_name(sheet_name: &str, start_row: usize, start_col: usize) -> String {
  format!(
    "region_{}_r{}_c{}",
    normalize_identifier_segment(sheet_name),
    start_row + 1,
    start_col + 1
  )
}

fn row_token_set(row: &[String]) -> HashSet<String> {
  row
    .iter()
    .map(|cell| normalize_token(cell))
    .filter(|token| !token.is_empty())
    .collect::<HashSet<_>>()
}

fn has_token_within_range(data: &[Vec<String>], target: &str, max_rows: usize, max_cols: usize) -> bool {
  let target = normalize_token(target);
  data
    .iter()
    .take(max_rows)
    .any(|row| row.iter().take(max_cols).any(|cell| normalize_token(cell) == target))
}

fn has_column_header_signature(data: &[Vec<String>], max_rows: usize) -> bool {
  data.iter().take(max_rows).any(|row| {
    let tokens = row_token_set(row);
    tokens.contains(&normalize_token(LOGICAL_NAME_HEADER))
      && tokens.contains(&normalize_token(PHYSICAL_NAME_HEADER))
      && tokens.contains(&normalize_token(DATA_TYPE_HEADER))
  })
}

fn has_format_b_vertical_header_signature(data: &[Vec<String>], max_rows: usize) -> bool {
  let no_tokens = [normalize_token(NO_HEADER), normalize_token(NO_DOT_HEADER), normalize_token("No,")]
    .into_iter()
    .collect::<HashSet<_>>();
  data.iter().take(max_rows).any(|row| {
    let tokens = row_token_set(row);
    let has_no = tokens.iter().any(|token| no_tokens.contains(token));
    has_no
      && tokens.contains(&normalize_token(TABLE_MARKER))
      && tokens.contains(&normalize_token(PHYSICAL_TABLE_MARKER))
  })
}

fn detect_excel_format(data: &[Vec<String>]) -> FormatDetectionResult {
  if data.is_empty() {
    return FormatDetectionResult {
      format: ExcelFormat::Unknown,
    };
  }

  let mut score_a = 0usize;
  let mut score_b = 0usize;
  let top_left = data
    .first()
    .and_then(|row| row.first())
    .map(|value| normalize_token(value))
    .unwrap_or_default();

  if top_left == normalize_token("テーブル情報") {
    score_a += 5;
  }
  if top_left == normalize_token("データベース定義書") {
    score_b += 6;
  }
  if has_token_within_range(data, "テーブル情報", 3, 3) {
    score_a += 2;
  }
  if has_token_within_range(data, "データベース定義書", 3, 3) {
    score_b += 2;
  }

  let has_table_name_labels = has_token_within_range(
    data,
    TABLE_MARKER,
    FORMAT_MARKER_SCAN_ROWS,
    FORMAT_MARKER_SCAN_COLS,
  ) && has_token_within_range(
    data,
    PHYSICAL_TABLE_MARKER,
    FORMAT_MARKER_SCAN_ROWS,
    FORMAT_MARKER_SCAN_COLS,
  );
  if has_table_name_labels {
    score_a += 1;
    score_b += 1;
  }
  if has_column_header_signature(data, 40) {
    score_a += 2;
  }
  if has_format_b_vertical_header_signature(data, 80) {
    score_b += 3;
  }

  let format = if score_a == 0 && score_b == 0 {
    ExcelFormat::Unknown
  } else if score_a == score_b {
    ExcelFormat::Unknown
  } else if score_a > score_b {
    ExcelFormat::A
  } else {
    ExcelFormat::B
  };

  FormatDetectionResult { format }
}

fn row_has_header_signature(row: &[String]) -> bool {
  let tokens = row.iter().map(|value| value.trim()).collect::<HashSet<_>>();
  tokens.contains(LOGICAL_NAME_HEADER) && tokens.contains(PHYSICAL_NAME_HEADER) && tokens.contains(DATA_TYPE_HEADER)
}

fn table_meta_labels() -> HashSet<&'static str> {
  HashSet::from([
    TABLE_MARKER,
    PHYSICAL_TABLE_MARKER,
    "説明",
    "RDBMS",
    "ENGINE",
    "CHARSET",
  ])
}

fn resolve_label_value(data: &[Vec<String>], row_index: usize, label_col: usize) -> Option<(String, usize, usize)> {
  let blocked = table_meta_labels();
  let row = data.get(row_index)?;

  for col in (label_col + 1)..row.len() {
    let candidate = row[col].trim();
    if !candidate.is_empty() && !blocked.contains(candidate) {
      return Some((candidate.to_string(), row_index, col));
    }
  }

  let next_row = data.get(row_index + 1)?;
  for col in [label_col, label_col + 1] {
    if let Some(candidate) = next_row.get(col).map(|value| value.trim()) {
      if !candidate.is_empty() && !blocked.contains(candidate) {
        return Some((candidate.to_string(), row_index + 1, col));
      }
    }
  }

  for (col, value) in next_row.iter().enumerate() {
    let candidate = value.trim();
    if !candidate.is_empty() && !blocked.contains(candidate) {
      return Some((candidate.to_string(), row_index + 1, col));
    }
  }

  None
}

fn build_header_map(row: &[String]) -> HashMap<String, usize> {
  let mut col_map = HashMap::new();
  for (index, value) in row.iter().enumerate() {
    let trimmed = value.trim();
    if trimmed.is_empty() {
      continue;
    }
    col_map.insert(trimmed.to_string(), index);
    let normalized = normalize_token(trimmed);
    if !normalized.is_empty() {
      col_map.entry(normalized).or_insert(index);
    }
  }
  col_map
}

fn build_header_map_for_range(row: &[String], start_col: usize, max_col_exclusive: usize) -> HashMap<String, usize> {
  let mut col_map = HashMap::new();
  for col_index in start_col..max_col_exclusive.min(row.len()) {
    let trimmed = row_cell(row, col_index);
    if trimmed.is_empty() {
      continue;
    }
    col_map.insert(trimmed.to_string(), col_index);
    let normalized = normalize_token(trimmed);
    if !normalized.is_empty() {
      col_map.entry(normalized).or_insert(col_index);
    }
  }
  col_map
}

fn header_aliases(field: &str) -> &'static [&'static str] {
  match field {
    "no" => &[NO_HEADER, NO_DOT_HEADER, "No,", "NO", "Ｎｏ", "番号"],
    "logicalName" => &[LOGICAL_NAME_HEADER],
    "physicalName" => &[PHYSICAL_NAME_HEADER],
    "dataType" => &[DATA_TYPE_HEADER, "データタイプ"],
    "size" => &[SIZE_HEADER, SIZE_ALT_HEADER],
    "notNull" => &[NOT_NULL_HEADER, "NOT NULL", "NotNull", "NOTNULL", "not null", "必須"],
    "pk" => &[PK_HEADER, "主キー"],
    "comment" => &[REMARKS_HEADER, REMARKS_ALT_HEADER, "コメント"],
    _ => &[],
  }
}

fn resolve_column(col_map: &HashMap<String, usize>, field: &str) -> Option<usize> {
  for alias in header_aliases(field) {
    if let Some(index) = col_map.get(*alias) {
      return Some(*index);
    }
    let normalized = normalize_token(alias);
    if let Some(index) = col_map.get(&normalized) {
      return Some(*index);
    }
  }
  None
}

fn parse_optional_row_number(value: Option<&String>) -> Option<i64> {
  let raw = value?.trim();
  if raw.is_empty() {
    return None;
  }
  raw.replace(',', "").parse::<i64>().ok()
}

fn parse_not_null_flag(value: Option<&String>) -> bool {
  let normalized = normalize_token(value.map(|value| value.as_str()).unwrap_or_default());
  if normalized.is_empty() {
    return false;
  }

  let truthy = HashSet::from([
    "1",
    "true",
    "yes",
    "y",
    "on",
    "required",
    PK_MARKER_VARIANTS[0],
    PK_MARKER_VARIANTS[1],
    PK_MARKER_VARIANTS[2],
    "必須",
  ]);
  let falsy = HashSet::from(["0", "false", "no", "n", "off", "-", "任意"]);

  if falsy.contains(normalized.as_str()) {
    return false;
  }
  if truthy.contains(normalized.as_str()) {
    return true;
  }
  normalized.contains("not null")
}

fn parse_auto_increment_data_type(value: Option<&String>) -> (Option<String>, bool) {
  let raw = value.map(|value| value.trim()).unwrap_or_default();
  if raw.is_empty() {
    return (None, false);
  }

  let lower = raw.to_lowercase();
  for marker in ["(ai)", "(auto_increment)", "(auto increment)", "(identity)"] {
    if lower.ends_with(marker) {
      let base = raw[..raw.len() - marker.len()].trim().to_string();
      if !base.is_empty() {
        return (Some(base), true);
      }
    }
  }

  (Some(raw.to_string()), false)
}

fn detect_auto_increment_from_comment(value: Option<&String>) -> bool {
  let comment = value
    .map(|value| value.replace('\u{3000}', " ").to_lowercase())
    .unwrap_or_default();
  if comment.is_empty() {
    return false;
  }
  if comment.contains("not auto increment")
    || comment.contains("no auto increment")
    || comment.contains("非自增")
    || comment.contains("自動採番なし")
  {
    return false;
  }

  comment.contains("auto increment")
    || comment.contains("identity")
    || comment.contains("自動採番")
    || comment.contains("自動連番")
    || comment.contains("自增")
}

fn is_vertical_table_header_row(row: &[String]) -> bool {
  matches!(row_cell(row, 0), NO_DOT_HEADER | NO_HEADER)
    && row_cell(row, 1) == TABLE_MARKER
    && row_cell(row, 2) == PHYSICAL_TABLE_MARKER
}

fn read_vertical_table_names(data: &[Vec<String>], table_header_index: usize) -> (String, String) {
  let logical_table_name = sheet_cell(data, table_header_index + 1, 1).to_string();
  let physical_table_name = sheet_cell(data, table_header_index + 1, 2).to_string();
  (logical_table_name, physical_table_name)
}

fn row_metadata_logical_names() -> HashSet<String> {
  HashSet::from([
    normalize_token("RDBMS"),
    normalize_token("ENGINE"),
    normalize_token("CHARSET"),
    normalize_token("作成日 / 作成者"),
    normalize_token("更新日 / 更新者"),
  ])
}

fn row_metadata_physical_names() -> HashSet<String> {
  HashSet::from([
    normalize_token("MySQL"),
    normalize_token("InnoDB"),
    normalize_token("utf8mb4"),
  ])
}

fn header_alias_tokens() -> HashSet<String> {
  [
    "no",
    "logicalName",
    "physicalName",
    "dataType",
    "size",
    "notNull",
    "pk",
    "comment",
  ]
  .iter()
  .flat_map(|field| header_aliases(field).iter().map(|value| normalize_token(value)))
  .filter(|value| !value.is_empty())
  .collect::<HashSet<_>>()
}

fn is_likely_repeated_header_row(
  no_value: Option<&String>,
  logical_value: &str,
  physical_value: &str,
  data_type_value: Option<&String>,
) -> bool {
  let alias_tokens = header_alias_tokens();
  let no_token = normalize_token(no_value.map(|value| value.as_str()).unwrap_or_default());
  if !no_token.is_empty() && alias_tokens.contains(&no_token) {
    return true;
  }

  normalize_token(logical_value) == normalize_token(LOGICAL_NAME_HEADER)
    && normalize_token(physical_value) == normalize_token(PHYSICAL_NAME_HEADER)
    && normalize_token(data_type_value.map(|value| value.as_str()).unwrap_or_default())
      == normalize_token(DATA_TYPE_HEADER)
}

fn standard_headers() -> HashSet<&'static str> {
  HashSet::from([
    NO_HEADER,
    NO_DOT_HEADER,
    LOGICAL_NAME_HEADER,
    PHYSICAL_NAME_HEADER,
    DATA_TYPE_HEADER,
    SIZE_HEADER,
    SIZE_ALT_HEADER,
    NOT_NULL_HEADER,
    PK_HEADER,
    REMARKS_HEADER,
    REMARKS_ALT_HEADER,
  ])
}

fn parse_columns_generic(
  sheet_name: &str,
  data: &[Vec<String>],
  start_row: usize,
  end_row: usize,
  col_map: &HashMap<String, usize>,
  options: &ParseOptions,
) -> Vec<ColumnInfo> {
  let idx_no = resolve_column(col_map, "no");
  let idx_logical = resolve_column(col_map, "logicalName");
  let idx_physical = resolve_column(col_map, "physicalName");
  let idx_type = resolve_column(col_map, "dataType");
  let idx_size = resolve_column(col_map, "size");
  let idx_not_null = resolve_column(col_map, "notNull");
  let idx_pk = resolve_column(col_map, "pk");
  let idx_comment = resolve_column(col_map, "comment");

  let Some(idx_physical) = idx_physical else {
    return Vec::new();
  };

  let pk_markers = options
    .pk_markers
    .iter()
    .map(|value| normalize_token(value))
    .collect::<HashSet<_>>();
  let logical_meta = row_metadata_logical_names();
  let physical_meta = row_metadata_physical_names();

  let mut columns = Vec::new();
  let mut consecutive_empty = 0usize;
  for row_index in start_row..end_row.min(data.len()) {
    let Some(row) = data.get(row_index) else {
      consecutive_empty += 1;
      if consecutive_empty >= options.max_consecutive_empty_rows && !columns.is_empty() {
        break;
      }
      continue;
    };

    let logical_name = idx_logical.and_then(|index| row.get(index)).map(|value| value.trim().to_string()).unwrap_or_default();
    let physical_name = row.get(idx_physical).map(|value| value.trim().to_string()).unwrap_or_default();
    let data_type_value = idx_type.and_then(|index| row.get(index));

    let row_has_useful_cell = !is_empty(&logical_name)
      || !is_empty(&physical_name)
      || data_type_value.map(|value| !is_empty(value)).unwrap_or(false);
    if !row_has_useful_cell {
      consecutive_empty += 1;
      if consecutive_empty >= options.max_consecutive_empty_rows && !columns.is_empty() {
        break;
      }
      continue;
    }

    if is_empty(&physical_name) {
      consecutive_empty += 1;
      if consecutive_empty >= options.max_consecutive_empty_rows && !columns.is_empty() {
        break;
      }
      continue;
    }
    consecutive_empty = 0;

    if logical_meta.contains(&normalize_token(&logical_name)) {
      continue;
    }
    if physical_meta.contains(&normalize_token(&physical_name)) {
      continue;
    }

    if is_likely_repeated_header_row(
      idx_no.and_then(|index| row.get(index)),
      &logical_name,
      &physical_name,
      data_type_value,
    ) {
      continue;
    }

    let no_value = idx_no.and_then(|index| row.get(index));
    let no = parse_optional_row_number(no_value);
    let comment_raw = idx_comment.and_then(|index| row.get(index)).cloned();
    let comment = comment_raw.as_ref().map(|value| value.trim().to_string()).filter(|value| !value.is_empty());
    let (data_type, data_type_auto_increment) = parse_auto_increment_data_type(data_type_value);
    let auto_increment = data_type_auto_increment || detect_auto_increment_from_comment(comment_raw.as_ref());
    let source_ref = Some(build_cell_source_ref(sheet_name, row_index, idx_physical));

    columns.push(ColumnInfo {
      no,
      logical_name: if logical_name.is_empty() { None } else { Some(logical_name) },
      physical_name: Some(physical_name),
      data_type,
      size: idx_size
        .and_then(|index| row.get(index))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty()),
      not_null: Some(parse_not_null_flag(idx_not_null.and_then(|index| row.get(index)))),
      is_pk: Some(
        idx_pk
          .and_then(|index| row.get(index))
          .map(|value| pk_markers.contains(&normalize_token(value)))
          .unwrap_or(false),
      ),
      auto_increment: Some(auto_increment),
      comment: comment.clone(),
      comment_raw,
      source_ref,
    });
  }

  columns
}

fn build_table_info(
  sheet_name: &str,
  logical_table_name: String,
  physical_table_name: String,
  columns: Vec<ColumnInfo>,
  start_row: usize,
  end_row: usize,
  start_col: usize,
  end_col: usize,
  logical_name_ref: Option<CellSourceRef>,
  physical_name_ref: Option<CellSourceRef>,
) -> TableInfo {
  TableInfo {
    logical_table_name,
    physical_table_name,
    columns,
    column_range: Some(TableColumnRange {
      start_col: start_col as i64,
      end_col: end_col as i64,
      start_col_label: Some(column_label(start_col)),
      end_col_label: Some(column_label(end_col)),
    }),
    row_range: Some(TableRowRange {
      start_row: start_row as i64,
      end_row: end_row as i64,
    }),
    excel_range: Some(format_excel_range(start_row, end_row, start_col, end_col)),
    source_ref: Some(TableSourceRef {
      sheet_name: sheet_name.into(),
      logical_name: logical_name_ref,
      physical_name: physical_name_ref,
    }),
  }
}

fn detect_table_column_bounds(header_row: &[String], start_col: usize, max_col_exclusive: usize) -> (usize, usize) {
  let standard_header_set = standard_headers();
  let header_end = max_col_exclusive.min(header_row.len());
  let mut table_start_col = start_col;
  let mut table_end_col = start_col;

  for col_index in start_col..header_end {
    if standard_header_set.contains(header_row[col_index].trim()) {
      table_start_col = col_index;
      break;
    }
  }
  for col_index in table_start_col..header_end {
    let value = header_row[col_index].trim();
    if standard_header_set.contains(value) {
      table_end_col = col_index;
    } else if !value.is_empty() {
      break;
    }
  }

  (table_start_col, table_end_col)
}

fn add_unique_table(seen: &mut HashSet<String>, sink: &mut Vec<TableInfo>, table: TableInfo) {
  if table.columns.is_empty() {
    return;
  }
  if seen.insert(table.physical_table_name.clone()) {
    sink.push(table);
  }
}

fn collect_unique_tables(
  seen: &mut HashSet<String>,
  sink: &mut Vec<TableInfo>,
  items: impl IntoIterator<Item = TableInfo>,
) {
  for item in items {
    add_unique_table(seen, sink, item);
  }
}

fn parse_format_a_block(
  sheet_name: &str,
  data: &[Vec<String>],
  col_offset: usize,
  start_row: usize,
  end_row: Option<usize>,
  options: &ParseOptions,
) -> Option<TableInfo> {
  let max_row = end_row.unwrap_or(data.len()).min(data.len());
  let mut logical_table_name = String::new();
  let mut physical_table_name = String::new();
  let mut logical_name_ref = None;
  let mut physical_name_ref = None;

  for row_index in start_row..(start_row + TABLE_META_SCAN_ROWS).min(max_row) {
    let row = data.get(row_index)?;
    for col_index in col_offset..=(col_offset + 1).min(row.len().saturating_sub(1)) {
      let label = row_cell(row, col_index);
      if label == TABLE_MARKER {
        if let Some((value, resolved_row, resolved_col)) = resolve_label_value(data, row_index, col_index) {
          logical_table_name = value;
          logical_name_ref = Some(build_cell_source_ref(sheet_name, resolved_row, resolved_col));
        }
      } else if label == PHYSICAL_TABLE_MARKER {
        if let Some((value, resolved_row, resolved_col)) = resolve_label_value(data, row_index, col_index) {
          physical_table_name = value;
          physical_name_ref = Some(build_cell_source_ref(sheet_name, resolved_row, resolved_col));
        }
      }
    }
  }

  if logical_table_name.is_empty() && physical_table_name.is_empty() {
    return None;
  }

  let mut header_row_index = None;
  for row_index in start_row..(start_row + FORMAT_A_HEADER_SCAN_ROWS).min(max_row) {
    let row = data.get(row_index).cloned().unwrap_or_default();
    let values = (col_offset..(col_offset + FORMAT_B_COLUMN_SCAN_LIMIT).min(row.len()))
      .filter_map(|col_index| row.get(col_index).cloned())
      .collect::<Vec<_>>();
    if row_has_header_signature(&values) {
      header_row_index = Some(row_index);
      break;
    }
  }
  let header_row_index = header_row_index?;
  let header_row = data.get(header_row_index).cloned().unwrap_or_default();
  let col_map = build_header_map(&header_row);
  let (table_start_col, table_end_col) =
    detect_table_column_bounds(&header_row, col_offset, header_row.len());
  let columns = parse_columns_generic(sheet_name, data, header_row_index + 1, max_row, &col_map, options);
  let data_end_row = if columns.is_empty() {
    header_row_index + 1
  } else {
    header_row_index + columns.len()
  };
  let resolved_logical_table_name = if logical_table_name.is_empty() {
    physical_table_name.clone()
  } else {
    logical_table_name.clone()
  };
  let resolved_physical_table_name = if physical_table_name.is_empty() {
    resolved_logical_table_name.clone()
  } else {
    physical_table_name
  };

  Some(build_table_info(
    sheet_name,
    resolved_logical_table_name,
    resolved_physical_table_name,
    columns,
    start_row,
    data_end_row,
    table_start_col,
    table_end_col,
    logical_name_ref,
    physical_name_ref,
  ))
}

fn find_format_b_vertical_tables(
  sheet_name: &str,
  data: &[Vec<String>],
  options: &ParseOptions,
) -> Vec<TableInfo> {
  let total_rows = data.len();
  let mut cursor = 0usize;
  let mut tables = Vec::new();

  while cursor < total_rows {
    let mut table_header_index = None;
    for row_index in cursor..total_rows {
      if is_vertical_table_header_row(data.get(row_index).map(|row| row.as_slice()).unwrap_or_default()) {
        table_header_index = Some(row_index);
        break;
      }
    }
    let Some(table_header_index) = table_header_index else {
      break;
    };

    let (logical_table_name, physical_table_name) = read_vertical_table_names(data, table_header_index);
    if logical_table_name.is_empty() && physical_table_name.is_empty() {
      cursor = table_header_index + 1;
      continue;
    }

    let mut header_row_index = None;
    for row_index in (table_header_index + 2)..(table_header_index + FORMAT_B_HEADER_SCAN_ROWS).min(total_rows) {
      let row = data.get(row_index).cloned().unwrap_or_default();
      let values = row.iter().take(FORMAT_B_COLUMN_SCAN_LIMIT).cloned().collect::<Vec<_>>();
      if row_has_header_signature(&values) {
        header_row_index = Some(row_index);
        break;
      }
    }
    let Some(header_row_index) = header_row_index else {
      cursor = table_header_index + 1;
      continue;
    };

    let mut next_table_header = total_rows;
    for row_index in (header_row_index + 1)..total_rows {
      let row = data.get(row_index).map(|row| row.as_slice()).unwrap_or_default();
      if matches!(row_cell(row, 0), NO_DOT_HEADER | NO_HEADER) && row_cell(row, 1) == TABLE_MARKER {
        next_table_header = row_index;
        break;
      }
    }

    let header_row = data.get(header_row_index).cloned().unwrap_or_default();
    let col_map = build_header_map(&header_row.iter().take(FORMAT_B_COLUMN_SCAN_LIMIT).cloned().collect::<Vec<_>>());
    let (table_start_col, table_end_col) =
      detect_table_column_bounds(&header_row, 0, FORMAT_B_COLUMN_SCAN_LIMIT);
    let columns = parse_columns_generic(
      sheet_name,
      data,
      header_row_index + 1,
      next_table_header,
      &col_map,
      options,
    );

    if !columns.is_empty() {
      let parsed_end_row = header_row_index + columns.len();
      tables.push(build_table_info(
        sheet_name,
        logical_table_name,
        physical_table_name,
        columns,
        table_header_index,
        parsed_end_row,
        table_start_col,
        table_end_col,
        Some(build_cell_source_ref(sheet_name, table_header_index + 1, 1)),
        Some(build_cell_source_ref(sheet_name, table_header_index + 1, 2)),
      ));
    }

    cursor = next_table_header;
  }

  tables
}

fn find_format_b_horizontal_tables(
  sheet_name: &str,
  data: &[Vec<String>],
  options: &ParseOptions,
) -> Vec<TableInfo> {
  let mut tables = Vec::new();
  let mut found_blocks = HashSet::new();

  for (row_index, row) in data.iter().enumerate() {
    for col_index in HORIZONTAL_BLOCK_MIN_COLUMN..row.len() {
      if row[col_index].trim() != "テーブル情報" {
        continue;
      }
      let key = format!("{row_index},{col_index}");
      if !found_blocks.insert(key) {
        continue;
      }

      let mut end_row = data.len();
      for next_row in (row_index + 1)..data.len() {
        if data
          .get(next_row)
          .and_then(|candidate| candidate.get(col_index))
          .map(|value| value.trim() == "テーブル情報")
          .unwrap_or(false)
        {
          end_row = next_row;
          break;
        }
      }

      if let Some(table) = parse_format_a_block(sheet_name, data, col_index, row_index, Some(end_row), options) {
        if !table.columns.is_empty() {
          tables.push(table);
        }
      }
    }
  }

  tables
}

fn find_side_by_side_tables(sheet_name: &str, data: &[Vec<String>], options: &ParseOptions) -> Vec<TableInfo> {
  let total_rows = data.len();
  let mut processed_ranges = HashSet::new();
  let mut tables = Vec::new();

  for row_index in 0..total_rows {
    let row = data.get(row_index).cloned().unwrap_or_default();
    let table_name_positions = row
      .iter()
      .enumerate()
      .filter_map(|(col_index, cell)| (cell.trim() == PHYSICAL_TABLE_MARKER).then_some(col_index))
      .collect::<Vec<_>>();
    if table_name_positions.len() <= 1 {
      continue;
    }

    for (position_index, col_pos) in table_name_positions.iter().enumerate() {
      let key = format!("{row_index},{col_pos}");
      if !processed_ranges.insert(key) {
        continue;
      }
      let next_table_col = table_name_positions
        .get(position_index + 1)
        .copied()
        .unwrap_or(row.len());
      let search_start_col = col_pos.saturating_sub(2);

      let mut header_row_index = None;
      for candidate_row in row_index..(row_index + ADJACENT_TABLE_NAME_SEARCH_ROWS).min(total_rows) {
        let search_row = data.get(candidate_row).cloned().unwrap_or_default();
        let values = (search_start_col..next_table_col.min(search_row.len()))
          .filter_map(|col_index| search_row.get(col_index).cloned())
          .collect::<Vec<_>>();
        if row_has_header_signature(&values) {
          header_row_index = Some(candidate_row);
          break;
        }
      }
      let Some(header_row_index) = header_row_index else {
        continue;
      };

      let header_row = data.get(header_row_index).cloned().unwrap_or_default();
      let col_map = build_header_map_for_range(&header_row, search_start_col, next_table_col);

      let (table_start_col, table_end_col) =
        detect_table_column_bounds(&header_row, search_start_col, next_table_col);
      let physical_table_name = row
        .get(col_pos + 1)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| data.get(row_index + 1).and_then(|next_row| next_row.get(*col_pos)).map(|value| value.trim().to_string()))
        .unwrap_or_default();
      let physical_name_ref = row
        .get(col_pos + 1)
        .filter(|value| !value.trim().is_empty())
        .map(|_| build_cell_source_ref(sheet_name, row_index, col_pos + 1))
        .or_else(|| {
          data
            .get(row_index + 1)
            .and_then(|next_row| next_row.get(*col_pos))
            .filter(|value| !value.trim().is_empty())
            .map(|_| build_cell_source_ref(sheet_name, row_index + 1, *col_pos))
        });

      let mut logical_table_name = String::new();
      let mut logical_name_ref = None;
      for candidate_row in row_index.saturating_sub(SIDE_BY_SIDE_LOGICAL_NAME_NEIGHBOR_ROWS)
        ..=(row_index + SIDE_BY_SIDE_LOGICAL_NAME_NEIGHBOR_ROWS).min(total_rows.saturating_sub(1))
      {
        let search_row = data.get(candidate_row).cloned().unwrap_or_default();
        for candidate_col in search_start_col..next_table_col.min(search_row.len()) {
          if search_row.get(candidate_col).map(|value| value.trim()) == Some(TABLE_MARKER)
            && candidate_col + 1 < search_row.len()
          {
            logical_table_name = search_row[candidate_col + 1].trim().to_string();
            logical_name_ref = Some(build_cell_source_ref(sheet_name, candidate_row, candidate_col + 1));
            break;
          }
        }
        if !logical_table_name.is_empty() {
          break;
        }
      }

      let mut end_row = total_rows;
      for candidate_row in (header_row_index + 1)..total_rows {
        let search_row = data.get(candidate_row).cloned().unwrap_or_default();
        for candidate_col in search_start_col..next_table_col.min(search_row.len()) {
          let cell = search_row[candidate_col].trim();
          if cell == PHYSICAL_TABLE_MARKER || cell == "テーブル情報" {
            end_row = candidate_row;
            break;
          }
        }
        if end_row != total_rows {
          break;
        }
      }

      let columns = parse_columns_generic(
        sheet_name,
        data,
        header_row_index + 1,
        end_row.min(total_rows),
        &col_map,
        options,
      );
      if columns.is_empty() {
        continue;
      }

      let parsed_end_row = header_row_index + columns.len();
      tables.push(build_table_info(
        sheet_name,
        if logical_table_name.is_empty() {
          physical_table_name.clone()
        } else {
          logical_table_name
        },
        if physical_table_name.is_empty() {
          "unknown".into()
        } else {
          physical_table_name
        },
        columns,
        row_index,
        parsed_end_row,
        table_start_col,
        table_end_col,
        logical_name_ref,
        physical_name_ref,
      ));
    }
  }

  tables
}

fn find_cell_row(data: &[Vec<String>], start_row: usize, label: &str) -> Option<usize> {
  for row_index in start_row..data.len() {
    let row = data.get(row_index).cloned().unwrap_or_default();
    if row.iter().any(|cell| cell.trim() == label) {
      return Some(row_index);
    }
  }
  None
}

fn get_cell_value(data: &[Vec<String>], row_index: usize, label: &str) -> String {
  let row = data.get(row_index).map(|row| row.as_slice()).unwrap_or_default();
  for (col_index, cell) in row.iter().enumerate() {
    if cell.trim() == label {
      if let Some((value, _, _)) = resolve_label_value(data, row_index, col_index) {
        return value;
      }
    }
  }
  String::new()
}

fn get_cell_value_source_ref(
  data: &[Vec<String>],
  row_index: usize,
  label: &str,
  sheet_name: &str,
) -> Option<CellSourceRef> {
  let row = data.get(row_index).map(|row| row.as_slice()).unwrap_or_default();
  for (col_index, cell) in row.iter().enumerate() {
    if cell.trim() == label {
      if let Some((_, resolved_row, resolved_col)) = resolve_label_value(data, row_index, col_index) {
        return Some(build_cell_source_ref(sheet_name, resolved_row, resolved_col));
      }
    }
  }
  None
}

fn find_header_row_legacy(data: &[Vec<String>], start_row: usize) -> Option<usize> {
  for row_index in start_row..(start_row + FORMAT_A_HEADER_SCAN_ROWS).min(data.len()) {
    let row = data.get(row_index).cloned().unwrap_or_default();
    if row_token_set(&row).contains(&normalize_token(LOGICAL_NAME_HEADER))
      && row_token_set(&row).contains(&normalize_token(PHYSICAL_NAME_HEADER))
      && row_token_set(&row).contains(&normalize_token(DATA_TYPE_HEADER))
    {
      return Some(row_index);
    }
  }
  None
}

fn find_tables_in_sheet(sheet_name: &str, data: &[Vec<String>], options: &ParseOptions) -> Vec<TableInfo> {
  let total_rows = data.len();
  let mut cursor = 0usize;
  let mut tables = Vec::new();

  while cursor < total_rows {
    let Some(table_start_index) = find_cell_row(data, cursor, TABLE_MARKER) else {
      break;
    };
    let logical_table_name = get_cell_value(data, table_start_index, TABLE_MARKER);
    let logical_name_ref = get_cell_value_source_ref(data, table_start_index, TABLE_MARKER, sheet_name);
    let physical_table_name_row = find_cell_row(data, table_start_index, PHYSICAL_TABLE_MARKER);
    let physical_table_name = physical_table_name_row
      .map(|row_index| get_cell_value(data, row_index, PHYSICAL_TABLE_MARKER))
      .unwrap_or_else(|| logical_table_name.clone());
    let physical_name_ref = physical_table_name_row
      .and_then(|row_index| get_cell_value_source_ref(data, row_index, PHYSICAL_TABLE_MARKER, sheet_name))
      .or_else(|| logical_name_ref.clone());
    let Some(header_row_index) = find_header_row_legacy(data, table_start_index + 1) else {
      cursor = table_start_index + 1;
      continue;
    };

    let header_row = data.get(header_row_index).cloned().unwrap_or_default();
    let col_map = build_header_map(&header_row);
    let (table_start_col, table_end_col) =
      detect_table_column_bounds(&header_row, 0, header_row.len());
    let next_table_start = find_cell_row(data, header_row_index + 1, TABLE_MARKER).unwrap_or(total_rows);
    let columns = parse_columns_generic(
      sheet_name,
      data,
      header_row_index + 1,
      next_table_start,
      &col_map,
      options,
    );
    let parsed_end_row = header_row_index + columns.len();
    tables.push(build_table_info(
      sheet_name,
      logical_table_name,
      physical_table_name,
      columns,
      table_start_index,
      parsed_end_row,
      table_start_col,
      table_end_col,
      logical_name_ref,
      physical_name_ref,
    ));
    cursor = next_table_start;
  }

  tables
}

fn parse_tables_from_sheet(sheet_name: &str, data: &[Vec<String>], options: &ParseOptions) -> Vec<TableInfo> {
  let detected_format = detect_excel_format(data);
  let mut tables = Vec::new();
  let mut seen = HashSet::new();

  match detected_format.format {
    ExcelFormat::A => {
      if let Some(table) = parse_format_a_block(sheet_name, data, 0, 0, None, options) {
        add_unique_table(&mut seen, &mut tables, table);
      }
      if tables.is_empty() {
        collect_unique_tables(&mut seen, &mut tables, find_format_b_vertical_tables(sheet_name, data, options));
        collect_unique_tables(
          &mut seen,
          &mut tables,
          find_format_b_horizontal_tables(sheet_name, data, options),
        );
        collect_unique_tables(&mut seen, &mut tables, find_side_by_side_tables(sheet_name, data, options));
        collect_unique_tables(&mut seen, &mut tables, find_tables_in_sheet(sheet_name, data, options));
      }
    }
    ExcelFormat::B => {
      collect_unique_tables(&mut seen, &mut tables, find_format_b_vertical_tables(sheet_name, data, options));
      collect_unique_tables(
        &mut seen,
        &mut tables,
        find_format_b_horizontal_tables(sheet_name, data, options),
      );
      collect_unique_tables(&mut seen, &mut tables, find_side_by_side_tables(sheet_name, data, options));
      if tables.is_empty() {
        if let Some(table) = parse_format_a_block(sheet_name, data, 0, 0, None, options) {
          add_unique_table(&mut seen, &mut tables, table);
        }
        collect_unique_tables(&mut seen, &mut tables, find_tables_in_sheet(sheet_name, data, options));
      }
    }
    ExcelFormat::Unknown => {
      collect_unique_tables(&mut seen, &mut tables, find_tables_in_sheet(sheet_name, data, options));
      collect_unique_tables(&mut seen, &mut tables, find_side_by_side_tables(sheet_name, data, options));
      if tables.is_empty() {
        if let Some(table) = parse_format_a_block(sheet_name, data, 0, 0, None, options) {
          add_unique_table(&mut seen, &mut tables, table);
        }
        collect_unique_tables(&mut seen, &mut tables, find_format_b_vertical_tables(sheet_name, data, options));
        collect_unique_tables(
          &mut seen,
          &mut tables,
          find_format_b_horizontal_tables(sheet_name, data, options),
        );
      }
    }
  }

  tables
}

fn open_excel_workbook(file_path: &Path) -> Result<calamine::Sheets<std::io::BufReader<std::fs::File>>, String> {
  open_workbook_auto(file_path)
    .map_err(|error| excel_error("read Excel file", error))
}

fn read_sheet_range(
  workbook: &mut calamine::Sheets<std::io::BufReader<std::fs::File>>,
  sheet_name: &str,
) -> Result<Range<Data>, String> {
  workbook
    .worksheet_range(sheet_name)
    .map_err(|error| excel_error(format!("read sheet {sheet_name}"), error))
}

pub fn validate_excel_file(file_path: &Path) -> Result<(), String> {
  open_workbook_auto(file_path)
    .map(|_| ())
    .map_err(|error| format!("{INVALID_WORKBOOK_MESSAGE}: {error}"))
}

pub fn list_sheet_summaries(file_path: &Path) -> Result<Vec<SheetSummary>, String> {
  let mut workbook = open_excel_workbook(file_path)?;
  let sheet_names = workbook.sheet_names().to_owned();
  let mut summaries = Vec::with_capacity(sheet_names.len());

  for sheet_name in sheet_names {
    let has_table_definitions = workbook
      .worksheet_range(&sheet_name)
      .map(|range| {
        range
          .rows()
          .any(|row| row.iter().any(|cell| cell_to_text(cell) == TABLE_MARKER))
      })
      .unwrap_or(false);

    summaries.push(SheetSummary {
      name: sheet_name,
      has_table_definitions,
    });
  }

  Ok(summaries)
}

pub fn list_search_index(file_path: &Path, options: &ParseOptions) -> Result<Vec<SearchIndexItem>, String> {
  let mut workbook = open_excel_workbook(file_path)?;
  let mut search_index = Vec::new();

  for sheet_name in workbook.sheet_names().to_owned() {
    search_index.push(SearchIndexItem {
      item_type: "sheet".into(),
      sheet_name: sheet_name.clone(),
      display_name: sheet_name.clone(),
      physical_table_name: None,
      logical_table_name: None,
    });

    let Ok(range) = workbook.worksheet_range(&sheet_name) else {
      continue;
    };
    let tables = parse_tables_from_sheet(&sheet_name, &range_to_string_matrix(&range), options);
    for table in tables {
      search_index.push(SearchIndexItem {
        item_type: "table".into(),
        sheet_name: sheet_name.clone(),
        display_name: format!("{} ({})", table.physical_table_name, table.logical_table_name),
        physical_table_name: Some(table.physical_table_name),
        logical_table_name: Some(table.logical_table_name),
      });
    }
  }

  Ok(search_index)
}

pub fn list_table_info(file_path: &Path, sheet_name: &str, options: &ParseOptions) -> Result<Vec<TableInfo>, String> {
  let mut workbook = open_excel_workbook(file_path)?;
  let range = read_sheet_range(&mut workbook, sheet_name)?;
  Ok(parse_tables_from_sheet(sheet_name, &range_to_string_matrix(&range), options))
}

pub fn parse_sheet_region(
  file_path: &Path,
  sheet_name: &str,
  start_row: usize,
  end_row: usize,
  start_col: usize,
  end_col: usize,
  options: &ParseOptions,
) -> Result<Vec<TableInfo>, String> {
  let mut workbook = open_excel_workbook(file_path)?;
  let range = read_sheet_range(&mut workbook, sheet_name)?;
  let data = range_to_string_matrix(&range);

  let search_end_row = end_row.min(data.len().saturating_sub(1));
  let mut logical_table = None;
  let mut physical_table = None;

  for row_index in start_row..=search_end_row {
    let row = data.get(row_index).map(|row| row.as_slice()).unwrap_or_default();
    for col_index in start_col..=end_col.min(row.len().saturating_sub(1)) {
      let cell = row_cell(row, col_index);
      if cell == TABLE_MARKER {
        logical_table = resolve_label_value(&data, row_index, col_index);
      }
      if cell == PHYSICAL_TABLE_MARKER {
        physical_table = resolve_label_value(&data, row_index, col_index);
      }
    }
  }

  if logical_table.is_none() && physical_table.is_none() {
    let search_from_row = start_row.saturating_sub(ADJACENT_TABLE_NAME_SEARCH_ROWS);
    let col_search_min = start_col.saturating_sub(TABLE_NAME_SEARCH_COL_LEFT_PADDING);
    let col_search_max = end_col.saturating_add(TABLE_NAME_SEARCH_COL_RIGHT_PADDING);
    for row_index in (search_from_row..start_row).rev() {
      let row = data.get(row_index).map(|row| row.as_slice()).unwrap_or_default();
      for col_index in col_search_min..=col_search_max.min(row.len().saturating_sub(1)) {
        let cell = row_cell(row, col_index);
        if logical_table.is_none() && cell == TABLE_MARKER {
          logical_table = resolve_label_value(&data, row_index, col_index);
        }
        if physical_table.is_none() && cell == PHYSICAL_TABLE_MARKER {
          physical_table = resolve_label_value(&data, row_index, col_index);
        }
      }
      if logical_table.is_some() && physical_table.is_some() {
        break;
      }
    }
  }

  if logical_table.is_none() && physical_table.is_none() {
    let search_from_row = start_row.saturating_sub(ADJACENT_TABLE_NAME_SEARCH_ROWS);
    for row_index in (search_from_row..start_row).rev() {
      let row = data.get(row_index).map(|row| row.as_slice()).unwrap_or_default();
      if is_vertical_table_header_row(row) {
        let (logical_name, physical_name) = read_vertical_table_names(&data, row_index);
        if !logical_name.is_empty() {
          logical_table = Some((logical_name, row_index + 1, 1));
        }
        if !physical_name.is_empty() {
          physical_table = Some((physical_name, row_index + 1, 2));
        }
        break;
      }
    }
  }

  let mut header_row = None;
  for row_index in start_row..=search_end_row {
    let row = data.get(row_index).map(|row| row.as_slice()).unwrap_or_default();
    let selected = (start_col..=end_col.min(row.len().saturating_sub(1)))
      .filter_map(|col_index| row.get(col_index).cloned())
      .collect::<Vec<_>>();
    if row_has_header_signature(&selected) {
      header_row = Some(row_index);
      break;
    }
  }

  let Some(header_row) = header_row else {
    return Ok(Vec::new());
  };

  let header = data.get(header_row).cloned().unwrap_or_default();
  let col_map = build_header_map_for_range(&header, start_col, end_col.saturating_add(1));

  let columns = parse_columns_generic(sheet_name, &data, header_row + 1, end_row + 1, &col_map, options);
  if columns.is_empty() {
    return Ok(Vec::new());
  }

  let standard_header_set = standard_headers();
  let mut table_start_col = start_col;
  let mut table_end_col = start_col;
  for col_index in start_col..=end_col.min(header.len().saturating_sub(1)) {
    if standard_header_set.contains(header[col_index].trim()) {
      table_start_col = col_index;
      break;
    }
  }
  for col_index in table_start_col..=end_col.min(header.len().saturating_sub(1)) {
    let value = header[col_index].trim();
    if standard_header_set.contains(value) {
      table_end_col = col_index;
    } else if !value.is_empty() {
      break;
    }
  }

  let logical_table_name = logical_table
    .as_ref()
    .map(|(value, _, _)| value.clone())
    .or_else(|| physical_table.as_ref().map(|(value, _, _)| value.clone()))
    .unwrap_or_else(|| sheet_name.to_string());
  let physical_table_name = physical_table
    .as_ref()
    .map(|(value, _, _)| value.clone())
    .unwrap_or_else(|| build_region_physical_table_name(sheet_name, start_row, table_start_col));

  Ok(vec![TableInfo {
    logical_table_name,
    physical_table_name,
    columns: columns.clone(),
    column_range: Some(TableColumnRange {
      start_col: table_start_col as i64,
      end_col: table_end_col as i64,
      start_col_label: Some(column_label(table_start_col)),
      end_col_label: Some(column_label(table_end_col)),
    }),
    row_range: Some(TableRowRange {
      start_row: start_row as i64,
      end_row: (header_row + columns.len()) as i64,
    }),
    excel_range: Some(format_excel_range(
      start_row,
      header_row + columns.len(),
      table_start_col,
      table_end_col,
    )),
    source_ref: Some(TableSourceRef {
      sheet_name: sheet_name.into(),
      logical_name: logical_table
        .as_ref()
        .map(|(_, row, col)| build_cell_source_ref(sheet_name, *row, *col)),
      physical_name: physical_table
        .as_ref()
        .map(|(_, row, col)| build_cell_source_ref(sheet_name, *row, *col)),
    }),
  }])
}

pub fn read_sheet_data(file_path: &Path, sheet_name: &str) -> Result<Vec<Vec<Value>>, String> {
  let mut workbook = open_excel_workbook(file_path)?;
  let range = read_sheet_range(&mut workbook, sheet_name)?;

  Ok(
    range
      .rows()
      .map(|row| row.iter().map(cell_to_json).collect::<Vec<_>>())
      .collect::<Vec<_>>(),
  )
}

#[cfg(test)]
mod tests {
  use std::path::PathBuf;

  use super::{list_search_index, list_sheet_summaries, list_table_info, parse_sheet_region, read_sheet_data, validate_excel_file, ParseOptions};

  fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .parent()
      .expect("src-tauri has a parent directory")
      .to_path_buf()
  }

  fn fixture_path(relative: &str) -> PathBuf {
    repo_root().join(relative)
  }

  // Phase-1 検収テスト: Excelファイルバリデーション
  #[test]
  fn validates_real_excel_file_as_valid() {
    let file_path = fixture_path("uploads/0ce665cb_1772791159950_30.データベース定義書-給与_ISI_20260303.xlsx");
    validate_excel_file(&file_path).expect("valid xlsx should pass validation");
  }

  #[test]
  fn rejects_non_excel_bytes_as_invalid() {
    let tmp = std::env::temp_dir().join("test_invalid_excel.txt");
    std::fs::write(&tmp, b"not an excel file").expect("temp write should succeed");
    let result = validate_excel_file(&tmp);
    let _ = std::fs::remove_file(&tmp);
    assert!(result.is_err(), "garbage bytes should fail validation");
  }

  // Phase-1 検収テスト: シート一覧とテーブル定義フラグ
  #[test]
  fn lists_all_sheets_from_workbook() {
    let file_path = fixture_path("uploads/0ce665cb_1772791159950_30.データベース定義書-給与_ISI_20260303.xlsx");
    let summaries = list_sheet_summaries(&file_path).expect("sheet summaries should load");
    // 給与ワークブックは143シートを持つことが実績で確認済み
    assert!(summaries.len() > 10, "should return many sheets, got {}", summaries.len());
  }

  #[test]
  fn marks_table_definition_sheets_correctly() {
    let file_path = fixture_path("uploads/0ce665cb_1772791159950_30.データベース定義書-給与_ISI_20260303.xlsx");
    let summaries = list_sheet_summaries(&file_path).expect("sheet summaries should load");

    // テーブル定義を含むシートは has_table_definitions = true であること
    let definition_sheet = summaries
      .iter()
      .find(|sheet| sheet.name == "テーブル定義-会社")
      .expect("テーブル定義-会社 sheet must exist");
    assert!(definition_sheet.has_table_definitions, "テーブル定義-会社 should have table definitions");

    // テーブル定義を含まない非データシートは false であること
    let non_definition_sheet = summaries
      .iter()
      .find(|sheet| !sheet.has_table_definitions);
    assert!(non_definition_sheet.is_some(), "at least one sheet should lack table definitions");
  }

  // Phase-1 検収テスト: 検索インデックス構築
  #[test]
  fn builds_search_index_with_sheet_and_table_entries() {
    let file_path = fixture_path("uploads/0ce665cb_1772791159950_30.データベース定義書-給与_ISI_20260303.xlsx");
    let index = list_search_index(&file_path, &ParseOptions::default()).expect("search index should build");

    // インデックスは sheet エントリと table エントリの両方を含むこと
    let sheet_entries: Vec<_> = index.iter().filter(|item| item.item_type == "sheet").collect();
    let table_entries: Vec<_> = index.iter().filter(|item| item.item_type == "table").collect();

    assert!(!sheet_entries.is_empty(), "search index must contain sheet entries");
    assert!(!table_entries.is_empty(), "search index must contain table entries");

    // table エントリは physical_table_name と logical_table_name を持つこと
    let first_table = &table_entries[0];
    assert!(first_table.physical_table_name.is_some(), "table entry must have physical_table_name");
    assert!(first_table.logical_table_name.is_some(), "table entry must have logical_table_name");
  }

  // Phase-1 検収テスト: 生シートデータ読み取り
  #[test]
  fn reads_raw_sheet_data_as_2d_grid() {
    let file_path = fixture_path("uploads/0ce665cb_1772791159950_30.データベース定義書-給与_ISI_20260303.xlsx");
    let data = read_sheet_data(&file_path, "テーブル定義-会社").expect("sheet data should load");

    assert!(!data.is_empty(), "sheet data must not be empty");
    assert!(!data[0].is_empty(), "first row must have cells");
  }

  // Phase-1 検収テスト: 領域パース（スプレッドシートビューア用）
  #[test]
  fn parse_region_returns_tables_within_specified_bounds() {
    let file_path = fixture_path("uploads/0ce665cb_1772791159950_30.データベース定義書-給与_ISI_20260303.xlsx");
    // 広い範囲を指定して、通常のテーブルパースと同等の結果が得られることを確認
    let tables = parse_sheet_region(
      &file_path,
      "退職金支給 (2)",
      0,    // start_row
      200,  // end_row
      0,    // start_col
      30,   // end_col
      &ParseOptions::default(),
    )
    .expect("region parse should succeed");

    assert!(!tables.is_empty(), "region parse must find at least one table");
    // 領域パースで見つかるテーブルの物理名が空でないこと
    assert!(
      tables.iter().any(|table| !table.physical_table_name.is_empty()),
      "at least one table must have a physical name"
    );
  }

  #[test]
  fn parses_format_b_company_sheet_like_typescript() {
    let file_path = fixture_path("uploads/0ce665cb_1772791159950_30.データベース定義書-給与_ISI_20260303.xlsx");
    let tables =
      list_table_info(&file_path, "テーブル定義-会社", &ParseOptions::default()).expect("sheet should parse");

    assert_eq!(tables.len(), 40);
    assert_eq!(tables.first().map(|table| table.logical_table_name.as_str()), Some("給与会社"));
    assert_eq!(
      tables.first().map(|table| table.physical_table_name.as_str()),
      Some("kyuyo_kaisya")
    );
    assert_eq!(tables.first().map(|table| table.columns.len()), Some(22));
  }

  #[test]
  fn parses_single_table_sheet_like_typescript() {
    let file_path = fixture_path("uploads/0ce665cb_1772791159950_30.データベース定義書-給与_ISI_20260303.xlsx");
    let tables = list_table_info(&file_path, "退職金支給 (2)", &ParseOptions::default()).expect("sheet should parse");

    assert_eq!(tables.len(), 1);
    assert_eq!(tables[0].logical_table_name, "退職金支給");
    assert_eq!(tables[0].physical_table_name, "retirement_pay_payment");
    assert_eq!(tables[0].columns.len(), 27);
  }

  #[test]
  fn parses_employee_system_sheet_like_typescript() {
    let file_path =
      fixture_path("uploads/f2e476cc_1773626307330_10.データベース定義書-社員管理(Sociaポータル)_20260315.xlsx");
    let tables =
      list_table_info(&file_path, "テーブル定義-システム", &ParseOptions::default()).expect("sheet should parse");

    assert_eq!(tables.len(), 32);
    assert_eq!(tables.first().map(|table| table.logical_table_name.as_str()), Some("パラメータ"));
    assert_eq!(
      tables.first().map(|table| table.physical_table_name.as_str()),
      Some("parameters")
    );
    assert_eq!(tables.first().map(|table| table.columns.len()), Some(19));
  }

  #[test]
  fn parses_employee_common_master_sheet_like_typescript() {
    let file_path =
      fixture_path("uploads/f2e476cc_1773626307330_10.データベース定義書-社員管理(Sociaポータル)_20260315.xlsx");
    let tables =
      list_table_info(&file_path, "テーブル定義-共通マスタ", &ParseOptions::default()).expect("sheet should parse");

    assert_eq!(tables.len(), 10);
    assert_eq!(tables.first().map(|table| table.logical_table_name.as_str()), Some("祝日マスタ"));
    assert_eq!(tables.first().map(|table| table.physical_table_name.as_str()), Some("holidays"));
    assert_eq!(tables.first().map(|table| table.columns.len()), Some(13));
  }
}
