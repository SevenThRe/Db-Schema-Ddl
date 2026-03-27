use std::{
  fmt::Display,
  io::{Cursor, Write},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::constants::ZIP_MIME_TYPE;
use crate::models::{
  BinaryCommandResult, DdlGenerationResponse, DdlGenerationWarning, DdlSettings, GenerateDdlRequest,
  TableInfo,
};

const MYSQL_AUTO_INCREMENT_CODE: &str = "AUTO_INCREMENT_IGNORED";
const ORACLE_AUTO_INCREMENT_CODE: &str = "AUTO_INCREMENT_DIALECT_UNSUPPORTED";
const FALLBACK_AUTHOR: &str = "ISI";
const FALLBACK_UNKNOWN_TABLE: &str = "(unknown_table)";
const FALLBACK_UNKNOWN_COLUMN: &str = "(unknown_column)";
const ZIP_FILENAME_PREFIX: &str = "ddl";
const ZIP_FILENAME_SEPARATOR: &str = "_";
const ZIP_FILENAME_EXTENSION: &str = ".zip";
const ZIP_ERROR_REPORT_FILENAME: &str = "__export_errors.txt";
const ZIP_ERROR_REPORT_TITLE: &str = "DDL export completed with tolerated errors.";
const DEFAULT_EXPORT_FILENAME_PREFIX: &str = "Crt_";
const UNSUPPORTED_DIALECT_MESSAGE: &str = "Unsupported dialect";
const TABLE_INDEX_OUT_OF_RANGE_MESSAGE: &str = "Table index out of range";
const NO_TABLES_SELECTED_MESSAGE: &str = "No tables selected for DDL generation";
const ZIP_GENERATION_FAILED_MESSAGE: &str = "Failed to generate ZIP";
const ZIP_ALL_TABLES_FAILED_MESSAGE: &str =
  "No DDL files could be generated. All selected tables failed validation.";
const ZIP_EXPORT_COUNT_OVERFLOW_MESSAGE: &str = "ZIP export count overflowed";
const ZIP_SKIPPED_COUNT_OVERFLOW_MESSAGE: &str = "ZIP skipped count overflowed";

fn ddl_error(action: &str, error: impl Display) -> String {
  format!("Failed to {action}: {error}")
}

fn count_to_i64(count: usize, message: &str) -> Result<i64, String> {
  i64::try_from(count).map_err(|_| message.to_string())
}

fn effective_author_name(settings: &DdlSettings) -> &str {
  if settings.author_name.trim().is_empty() {
    FALLBACK_AUTHOR
  } else {
    settings.author_name.trim()
  }
}

fn render_table_for_dialect(table: &TableInfo, dialect: &str, settings: &DdlSettings) -> Result<String, String> {
  match dialect {
    "mysql" => Ok(render_mysql_table(table, settings)),
    "oracle" => Ok(render_oracle_table(table, settings)),
    other => Err(format!("{UNSUPPORTED_DIALECT_MESSAGE}: {other}")),
  }
}

fn normalize_data_type_and_size(data_type: Option<&str>, size: Option<&str>) -> (Option<String>, Option<String>) {
  let raw_type = data_type.unwrap_or_default().trim().replace('（', "(").replace('）', ")").replace('，', ",");
  let raw_size = size.unwrap_or_default().trim().to_string();
  if raw_type.is_empty() {
    return (None, if raw_size.is_empty() { None } else { Some(raw_size) });
  }

  if let Some((base, inline_size)) = raw_type.split_once('(') {
    let inline_size = inline_size.trim_end_matches(')').trim();
    return (
      Some(base.trim().to_lowercase()),
      if raw_size.is_empty() {
        if inline_size.is_empty() {
          None
        } else {
          Some(inline_size.to_string())
        }
      } else {
        Some(raw_size)
      },
    );
  }

  (
    Some(raw_type.to_lowercase()),
    if raw_size.is_empty() { None } else { Some(raw_size) },
  )
}

fn escape_sql(value: &str) -> String {
  value.replace('\'', "''")
}

fn format_ddl_date() -> String {
  chrono::Local::now().format("%Y/%m/%d").to_string()
}

fn format_zip_timestamp() -> String {
  chrono::Local::now().format("%Y%m%d_%H%M%S").to_string()
}

fn substitute_template_variables(template: &str, table: &TableInfo, author_name: &str) -> String {
  template
    .replace("${logical_name}", &table.logical_table_name)
    .replace("${physical_name}", &table.physical_table_name)
    .replace("${author}", author_name)
    .replace("${date}", &format_ddl_date())
}

fn substitute_filename_suffix(suffix: &str, table: &TableInfo, author_name: &str) -> String {
  if suffix.trim().is_empty() {
    String::new()
  } else {
    substitute_template_variables(suffix, table, author_name)
  }
}

fn sanitize_sheet_name_for_filename(sheet_name: &str) -> String {
  sheet_name
    .trim()
    .chars()
    .map(|char| match char {
      '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
      other => other,
    })
    .collect::<String>()
    .split_whitespace()
    .collect::<Vec<_>>()
    .join("_")
    .trim_matches(['_', '-', '.'])
    .chars()
    .take(64)
    .collect::<String>()
}

fn derive_sheet_name_hint(tables: &[TableInfo]) -> Option<String> {
  let mut unique_sheet_names = tables
    .iter()
    .filter_map(|table| {
      let source_ref = table.source_ref.as_ref()?;
      let sheet_name = source_ref.sheet_name.trim();
      if sheet_name.is_empty() {
        None
      } else {
        Some(sheet_name.to_string())
      }
    })
    .collect::<Vec<_>>();
  unique_sheet_names.sort();
  unique_sheet_names.dedup();
  (unique_sheet_names.len() == 1).then(|| unique_sheet_names[0].clone())
}

fn build_zip_download_filename(dialect: &str, sheet_name_hint: Option<&str>) -> String {
  let timestamp = format_zip_timestamp();
  let safe_sheet_name = sheet_name_hint.map(sanitize_sheet_name_for_filename).filter(|value| !value.is_empty());

  match safe_sheet_name {
    Some(sheet_name) => format!(
      "{ZIP_FILENAME_PREFIX}{ZIP_FILENAME_SEPARATOR}{dialect}{ZIP_FILENAME_SEPARATOR}{sheet_name}{ZIP_FILENAME_SEPARATOR}{timestamp}{ZIP_FILENAME_EXTENSION}"
    ),
    None => format!(
      "{ZIP_FILENAME_PREFIX}{ZIP_FILENAME_SEPARATOR}{dialect}{ZIP_FILENAME_SEPARATOR}{timestamp}{ZIP_FILENAME_EXTENSION}"
    ),
  }
}

fn collect_zip_entry_name(table: &TableInfo, settings: &DdlSettings) -> String {
  let author_name = effective_author_name(settings);
  let prefix = if settings.export_filename_prefix.trim().is_empty() {
    DEFAULT_EXPORT_FILENAME_PREFIX
  } else {
    settings.export_filename_prefix.trim()
  };
  let suffix = substitute_filename_suffix(&settings.export_filename_suffix, table, author_name);
  format!("{prefix}{}{suffix}.sql", table.physical_table_name)
}

fn add_tolerant_error_report(
  zip_entries: &mut Vec<(String, String)>,
  tables: &[TableInfo],
  successful_count: usize,
  tolerant_errors: &[(String, String)],
) {
  if tolerant_errors.is_empty() {
    return;
  }

  let mut report_lines = vec![
    ZIP_ERROR_REPORT_TITLE.to_string(),
    format!("generatedAt: {}", chrono::Utc::now().to_rfc3339()),
    format!("selectedTableCount: {}", tables.len()),
    format!("successCount: {successful_count}"),
    format!("skippedCount: {}", tolerant_errors.len()),
    String::new(),
  ];

  for (index, (table_name, message)) in tolerant_errors.iter().enumerate() {
    report_lines.push(format!("## {}. {}", index + 1, table_name));
    report_lines.push(message.clone());
    report_lines.push(String::new());
  }

  zip_entries.push((ZIP_ERROR_REPORT_FILENAME.into(), report_lines.join("\n")));
}

fn build_comment_header_lines(table: &TableInfo, settings: &DdlSettings) -> Vec<String> {
  if !settings.include_comment_header {
    return Vec::new();
  }

  let author = effective_author_name(settings);
  let body = if settings.use_custom_header {
    settings
      .custom_header_template
      .as_deref()
      .map(|template| substitute_template_variables(template, table, author))
      .unwrap_or_default()
  } else {
    format!(
      "TableName: {}\nAuthor: {}\nDate: {}",
      table.logical_table_name,
      author,
      format_ddl_date()
    )
  };

  let mut lines = vec!["/*".to_string()];
  lines.extend(body.split('\n').map(|line| if line.is_empty() { String::new() } else { format!(" {line}") }));
  lines.push("*/".to_string());
  lines.push(String::new());
  lines
}

fn resolve_mysql_auto_increment_plan(table: &TableInfo) -> (Vec<usize>, Vec<(usize, String)>) {
  let integer_types = ["tinyint", "smallint", "int", "integer", "bigint"];
  let mut enabled = Vec::new();
  let mut ignored = Vec::new();

  for (index, column) in table.columns.iter().enumerate() {
    if !column.auto_increment.unwrap_or(false) {
      continue;
    }
    if !column.is_pk.unwrap_or(false) {
      ignored.push((index, "not_primary_key".into()));
      continue;
    }

    let (normalized_type, _) =
      normalize_data_type_and_size(column.data_type.as_deref(), column.size.as_deref());
    let Some(normalized_type) = normalized_type else {
      ignored.push((index, "non_numeric_type".into()));
      continue;
    };
    if !integer_types.contains(&normalized_type.as_str()) {
      ignored.push((index, "non_numeric_type".into()));
      continue;
    }
    enabled.push(index);
  }

  if enabled.len() > 1 {
    let retained = enabled[0];
    for index in enabled.iter().skip(1) {
      ignored.push((*index, "multiple_auto_increment".into()));
    }
    enabled.retain(|index| *index == retained);
  }

  (enabled, ignored)
}

fn map_data_type_mysql(data_type: Option<&str>, size: Option<&str>, settings: &DdlSettings) -> String {
  let (normalized_type, normalized_size) = normalize_data_type_and_size(data_type, size);
  let charset = if settings.varchar_charset.trim().is_empty() {
    "utf8mb4"
  } else {
    settings.varchar_charset.trim()
  };
  let collate = if settings.varchar_collate.trim().is_empty() {
    "utf8mb4_bin"
  } else {
    settings.varchar_collate.trim()
  };
  let uppercase = settings.mysql_data_type_case == "upper";
  let bool_as_boolean = settings.mysql_boolean_mode == "boolean";
  let fmt_token = |value: &str| {
    if uppercase {
      value.to_uppercase()
    } else {
      value.to_lowercase()
    }
  };

  let t = normalized_type.unwrap_or_else(|| "varchar".into());
  let size_value = normalized_size.clone().unwrap_or_else(|| "255".into());
  match t.as_str() {
    "varchar" | "char" => format!("{}({}) CHARACTER SET {charset} COLLATE {collate}", fmt_token(&t), size_value),
    "tinyint" | "smallint" | "int" | "integer" | "bigint" => {
      if normalized_size.is_some() {
        format!("{}({})", fmt_token(if t == "integer" { "int" } else { &t }), size_value)
      } else {
        fmt_token(if t == "integer" { "int" } else { &t })
      }
    }
    "date" => fmt_token("date"),
    "datetime" | "timestamp" | "text" | "float" | "double" => {
      if normalized_size.is_some() {
        format!("{}({})", fmt_token(&t), size_value)
      } else {
        fmt_token(&t)
      }
    }
    "longtext" | "mediumtext" | "blob" | "json" => fmt_token(&t),
    "decimal" | "numeric" => format!(
      "{}({})",
      fmt_token("decimal"),
      normalized_size.unwrap_or_else(|| "10,2".into())
    ),
    "boolean" | "bool" => {
      if bool_as_boolean {
        fmt_token("boolean")
      } else {
        format!("{}(1)", fmt_token("tinyint"))
      }
    }
    _ => {
      if normalized_size.is_some() {
        format!("{}({})", fmt_token(&t), size_value)
      } else {
        fmt_token(&t)
      }
    }
  }
}

fn map_data_type_oracle(data_type: Option<&str>, size: Option<&str>) -> String {
  let (normalized_type, normalized_size) = normalize_data_type_and_size(data_type, size);
  let t = normalized_type.unwrap_or_else(|| "varchar".into());
  match t.as_str() {
    "varchar" => format!("VARCHAR2({})", normalized_size.unwrap_or_else(|| "255".into())),
    "char" => format!("CHAR({})", normalized_size.unwrap_or_else(|| "1".into())),
    "tinyint" | "smallint" | "int" | "integer" | "bigint" => {
      normalized_size.map(|size| format!("NUMBER({size})")).unwrap_or_else(|| "NUMBER".into())
    }
    "date" => "DATE".into(),
    "datetime" | "timestamp" => normalized_size
      .map(|size| format!("TIMESTAMP({size})"))
      .unwrap_or_else(|| "TIMESTAMP".into()),
    "text" | "mediumtext" | "longtext" | "json" => "CLOB".into(),
    "decimal" | "numeric" => format!("NUMBER({})", normalized_size.unwrap_or_else(|| "10,2".into())),
    "float" => normalized_size
      .map(|size| format!("FLOAT({size})"))
      .unwrap_or_else(|| "FLOAT".into()),
    "double" => "BINARY_DOUBLE".into(),
    "boolean" | "bool" => "NUMBER(1)".into(),
    "blob" => "BLOB".into(),
    _ => normalized_size
      .map(|size| format!("{}({size})", t.to_uppercase()))
      .unwrap_or_else(|| t.to_uppercase()),
  }
}

fn render_mysql_table(table: &TableInfo, settings: &DdlSettings) -> String {
  let mut lines = build_comment_header_lines(table, settings);
  let (enabled_auto_increment, _) = resolve_mysql_auto_increment_plan(table);

  if settings.include_set_names {
    lines.push(format!("SET NAMES {};", settings.mysql_charset));
    lines.push(String::new());
  }
  if settings.include_drop_table {
    lines.push(format!("DROP TABLE IF EXISTS `{}`;", table.physical_table_name));
  }
  lines.push(format!("CREATE TABLE `{}`  (", table.physical_table_name));

  let has_pk = table.columns.iter().any(|column| column.is_pk.unwrap_or(false));
  let mut pk_columns = Vec::new();
  for (index, column) in table.columns.iter().enumerate() {
    let column_name = column.physical_name.as_deref().unwrap_or(FALLBACK_UNKNOWN_COLUMN);
    let mut line = format!(
      "  `{}` {}",
      column_name,
      map_data_type_mysql(column.data_type.as_deref(), column.size.as_deref(), settings)
    );
    if column.not_null.unwrap_or(false) {
      line.push_str(" NOT NULL");
    }
    if enabled_auto_increment.contains(&index) {
      line.push_str(" AUTO_INCREMENT");
    }
    if let Some(logical_name) = column.logical_name.as_deref().filter(|value| !value.trim().is_empty()) {
      line.push_str(&format!(" COMMENT '{}'", escape_sql(logical_name)));
    }
    if index != table.columns.len().saturating_sub(1) || has_pk {
      line.push(',');
    }
    lines.push(line);

    if column.is_pk.unwrap_or(false) {
      pk_columns.push((index, column_name.to_string()));
    }
  }

  if !pk_columns.is_empty() {
    pk_columns.sort_by_key(|(index, _)| {
      if enabled_auto_increment.contains(index) {
        0usize
      } else {
        1usize
      }
    });
    lines.push(format!(
      "  PRIMARY KEY ({}) USING BTREE",
      pk_columns
        .iter()
        .map(|(_, column)| format!("`{column}`"))
        .collect::<Vec<_>>()
        .join(", ")
    ));
  }

  lines.push(format!(
    ") ENGINE = {} CHARACTER SET = {} COLLATE = {} COMMENT = '{}';",
    settings.mysql_engine,
    settings.mysql_charset,
    settings.mysql_collate,
    escape_sql(&table.logical_table_name)
  ));

  lines.join("\n")
}

fn render_oracle_table(table: &TableInfo, settings: &DdlSettings) -> String {
  let mut lines = build_comment_header_lines(table, settings);
  lines.push(format!("CREATE TABLE {} (", table.physical_table_name));

  let has_pk = table.columns.iter().any(|column| column.is_pk.unwrap_or(false));
  let mut pk_columns = Vec::new();
  for (index, column) in table.columns.iter().enumerate() {
    let column_name = column.physical_name.as_deref().unwrap_or(FALLBACK_UNKNOWN_COLUMN);
    let mut line = format!(
      "  {} {}",
      column_name,
      map_data_type_oracle(column.data_type.as_deref(), column.size.as_deref())
    );
    if column.not_null.unwrap_or(false) {
      line.push_str(" NOT NULL");
    }
    if index != table.columns.len().saturating_sub(1) || has_pk {
      line.push(',');
    }
    lines.push(line);
    if column.is_pk.unwrap_or(false) {
      pk_columns.push(column_name.to_string());
    }
  }

  if !pk_columns.is_empty() {
    lines.push(format!(
      "  CONSTRAINT pk_{} PRIMARY KEY ({})",
      table.physical_table_name,
      pk_columns.join(", ")
    ));
  }

  lines.push(");".into());
  lines.push(String::new());
  lines.push(format!(
    "COMMENT ON TABLE {} IS '{}';",
    table.physical_table_name,
    escape_sql(&table.logical_table_name)
  ));
  for column in &table.columns {
    if let Some(logical_name) = column.logical_name.as_deref().filter(|value| !value.trim().is_empty()) {
      lines.push(format!(
        "COMMENT ON COLUMN {}.{} IS '{}';",
        table.physical_table_name,
        column.physical_name.as_deref().unwrap_or(FALLBACK_UNKNOWN_COLUMN),
        escape_sql(logical_name)
      ));
    }
  }

  lines.join("\n")
}

fn collect_warnings(request: &GenerateDdlRequest) -> Vec<DdlGenerationWarning> {
  let mut warnings = Vec::new();

  for table in &request.tables {
    let (enabled_auto_increment, ignored_auto_increment) = if request.dialect == "mysql" {
      resolve_mysql_auto_increment_plan(table)
    } else {
      (Vec::new(), Vec::new())
    };

    for (index, column) in table.columns.iter().enumerate() {
      if !column.auto_increment.unwrap_or(false) {
        continue;
      }

      let table_name = if table.physical_table_name.trim().is_empty() {
        FALLBACK_UNKNOWN_TABLE.into()
      } else {
        table.physical_table_name.clone()
      };
      let column_name = column
        .physical_name
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| FALLBACK_UNKNOWN_COLUMN.into());

      if request.dialect != "mysql" {
        warnings.push(DdlGenerationWarning {
          code: ORACLE_AUTO_INCREMENT_CODE.into(),
          table_name: table_name.clone(),
          column_name: column_name.clone(),
          message: format!(
            "AUTO_INCREMENT on {}.{} is ignored for {} dialect.",
            table_name,
            column_name,
            request.dialect.to_uppercase()
          ),
          reason: Some("dialect_unsupported".into()),
        });
        continue;
      }

      if enabled_auto_increment.contains(&index) {
        continue;
      }
      if let Some((_, reason)) = ignored_auto_increment.iter().find(|(ignored_index, _)| *ignored_index == index) {
        warnings.push(DdlGenerationWarning {
          code: MYSQL_AUTO_INCREMENT_CODE.into(),
          table_name,
          column_name,
          message: match reason.as_str() {
            "not_primary_key" => {
              format!("AUTO_INCREMENT is ignored because the column is not marked as PK.")
            }
            "non_numeric_type" => {
              format!("AUTO_INCREMENT is ignored because data type is not integer-based.")
            }
            _ => {
              format!("AUTO_INCREMENT is ignored because MySQL allows only one AUTO_INCREMENT column per table.")
            }
          },
          reason: Some(reason.clone()),
        });
      }
    }
  }

  warnings
}

pub fn generate_ddl_response(request: &GenerateDdlRequest) -> Result<DdlGenerationResponse, String> {
  let settings = request.settings.clone().unwrap_or_default();
  let mut chunks = Vec::new();

  for table in &request.tables {
    chunks.push(render_table_for_dialect(table, &request.dialect, &settings)?);
  }

  Ok(DdlGenerationResponse {
    ddl: chunks.join("\n\n"),
    warnings: collect_warnings(request),
  })
}

pub fn select_tables_by_reference(
  source_tables: &[TableInfo],
  selected_table_indexes: &[usize],
  overrides: &[(usize, TableInfo)],
) -> Result<Vec<TableInfo>, String> {
  let override_map = overrides.iter().cloned().collect::<std::collections::HashMap<_, _>>();
  let mut selected_tables = Vec::new();

  for index in selected_table_indexes {
    let Some(source_table) = source_tables.get(*index) else {
      return Err(format!("{TABLE_INDEX_OUT_OF_RANGE_MESSAGE}: {index}"));
    };
    selected_tables.push(
      override_map
        .get(index)
        .cloned()
        .unwrap_or_else(|| source_table.clone()),
    );
  }

  if selected_tables.is_empty() {
    return Err(NO_TABLES_SELECTED_MESSAGE.into());
  }

  Ok(selected_tables)
}

pub fn export_zip_for_tables(
  tables: &[TableInfo],
  dialect: &str,
  settings: Option<DdlSettings>,
  tolerant_mode: bool,
  include_error_report: bool,
  sheet_name_hint: Option<&str>,
) -> Result<BinaryCommandResult, String> {
  let effective_settings = settings.unwrap_or_default();
  let mut zip_entries = Vec::new();
  let mut tolerant_errors = Vec::new();

  for table in tables {
    let ddl_result = generate_ddl_response(&GenerateDdlRequest {
      tables: vec![table.clone()],
      dialect: dialect.to_string(),
      settings: Some(effective_settings.clone()),
    });

    match ddl_result {
      Ok(response) => {
        zip_entries.push((collect_zip_entry_name(table, &effective_settings), response.ddl));
      }
      Err(error) => {
        if !tolerant_mode {
          return Err(error);
        }
        tolerant_errors.push((table.physical_table_name.clone(), error));
      }
    }
  }

  if zip_entries.is_empty() {
    return Err(if tolerant_mode {
      ZIP_ALL_TABLES_FAILED_MESSAGE.into()
    } else {
      ZIP_GENERATION_FAILED_MESSAGE.into()
    });
  }

  let successful_count = zip_entries.len();
  if include_error_report {
    add_tolerant_error_report(&mut zip_entries, tables, successful_count, &tolerant_errors);
  }

  let cursor = Cursor::new(Vec::<u8>::new());
  let mut zip_writer = ZipWriter::new(cursor);
  let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

  for (file_name, content) in &zip_entries {
    zip_writer
      .start_file(file_name, options)
      .map_err(|error| ddl_error("add ZIP entry", error))?;
    zip_writer
      .write_all(content.as_bytes())
      .map_err(|error| ddl_error("write ZIP entry", error))?;
  }

  let zip_bytes = zip_writer
    .finish()
    .map_err(|error| ddl_error("finalize ZIP export", error))?
    .into_inner();
  let inferred_sheet_name = sheet_name_hint
    .map(|value| value.to_string())
    .or_else(|| derive_sheet_name_hint(tables));
  let skipped_tables = tolerant_errors
    .iter()
    .map(|(table_name, _)| table_name.clone())
    .filter(|table_name| !table_name.trim().is_empty())
    .collect::<Vec<_>>();

  Ok(BinaryCommandResult {
    base64: STANDARD.encode(zip_bytes),
    file_name: build_zip_download_filename(dialect, inferred_sheet_name.as_deref()),
    mime_type: ZIP_MIME_TYPE.into(),
    success_count: count_to_i64(successful_count, ZIP_EXPORT_COUNT_OVERFLOW_MESSAGE)?,
    skipped_count: count_to_i64(tolerant_errors.len(), ZIP_SKIPPED_COUNT_OVERFLOW_MESSAGE)?,
    skipped_tables,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::models::ColumnInfo;

  fn sample_table() -> TableInfo {
    TableInfo {
      logical_table_name: "社員".into(),
      physical_table_name: "employee".into(),
      columns: vec![
        ColumnInfo {
          no: Some(1),
          logical_name: Some("ID".into()),
          physical_name: Some("id".into()),
          data_type: Some("int".into()),
          size: Some("11".into()),
          not_null: Some(true),
          is_pk: Some(true),
          auto_increment: Some(true),
          comment: None,
          comment_raw: None,
          source_ref: None,
        },
        ColumnInfo {
          no: Some(2),
          logical_name: Some("氏名".into()),
          physical_name: Some("name".into()),
          data_type: Some("varchar".into()),
          size: Some("255".into()),
          not_null: Some(false),
          is_pk: Some(false),
          auto_increment: Some(false),
          comment: None,
          comment_raw: None,
          source_ref: None,
        },
      ],
      column_range: None,
      row_range: None,
      excel_range: None,
      source_ref: None,
    }
  }

  #[test]
  fn generates_mysql_ddl_with_auto_increment() {
    let response = generate_ddl_response(&GenerateDdlRequest {
      tables: vec![sample_table()],
      dialect: "mysql".into(),
      settings: Some(DdlSettings::default()),
    })
    .expect("mysql ddl should generate");

    assert!(response.ddl.contains("CREATE TABLE `employee`"));
    assert!(response.ddl.contains("`id` int(11) NOT NULL AUTO_INCREMENT"));
    assert!(response.warnings.is_empty());
  }

  #[test]
  fn emits_oracle_warning_for_auto_increment() {
    let response = generate_ddl_response(&GenerateDdlRequest {
      tables: vec![sample_table()],
      dialect: "oracle".into(),
      settings: Some(DdlSettings::default()),
    })
    .expect("oracle ddl should generate");

    assert!(response.ddl.contains("CREATE TABLE employee"));
    assert_eq!(response.warnings.len(), 1);
    assert_eq!(response.warnings[0].code, ORACLE_AUTO_INCREMENT_CODE);
  }

  #[test]
  fn exports_zip_payload_for_mysql() {
    let result = export_zip_for_tables(
      &[sample_table()],
      "mysql",
      Some(DdlSettings::default()),
      true,
      true,
      Some("テーブル定義"),
    )
    .expect("zip export should succeed");

    assert_eq!(result.mime_type, ZIP_MIME_TYPE);
    assert!(result.file_name.ends_with(".zip"));
    assert_eq!(result.success_count, 1);
    assert_eq!(result.skipped_count, 0);
    assert!(!result.base64.is_empty());
  }

  // Phase-1 検収テスト: Oracle DDL 生成
  #[test]
  fn generates_oracle_ddl_with_named_pk_constraint() {
    let response = generate_ddl_response(&GenerateDdlRequest {
      tables: vec![sample_table()],
      dialect: "oracle".into(),
      settings: Some(DdlSettings::default()),
    })
    .expect("oracle ddl should generate");

    // Oracle は名前付き PK 制約を使うこと
    assert!(
      response.ddl.contains("CONSTRAINT pk_employee PRIMARY KEY"),
      "Oracle DDL must use named PK constraint, got:\n{}",
      response.ddl
    );
  }

  // Phase-1 検収テスト: データ型未指定時のフォールバック
  #[test]
  fn generates_mysql_ddl_with_varchar_fallback_for_missing_type() {
    let table = TableInfo {
      physical_table_name: "fallback_test".into(),
      logical_table_name: "フォールバックテスト".into(),
      columns: vec![ColumnInfo {
        no: Some(1),
        logical_name: Some("メモ".into()),
        physical_name: Some("memo".into()),
        data_type: None, // 未指定
        size: None,
        not_null: Some(false),
        is_pk: Some(false),
        auto_increment: Some(false),
        comment: None,
        comment_raw: None,
        source_ref: None,
      }],
      column_range: None,
      row_range: None,
      excel_range: None,
      source_ref: None,
    };

    let response = generate_ddl_response(&GenerateDdlRequest {
      tables: vec![table],
      dialect: "mysql".into(),
      settings: Some(DdlSettings::default()),
    })
    .expect("mysql ddl should generate with fallback type");

    // データ型未指定の列は varchar(255) にフォールバックすること（大小文字問わず）
    assert!(
      response.ddl.to_lowercase().contains("varchar(255)"),
      "missing data type should fall back to VARCHAR(255), got:\n{}",
      response.ddl
    );
  }

  // Phase-1 検収テスト: ZIP エクスポート (Oracle 方言)
  #[test]
  fn exports_zip_payload_for_oracle() {
    let result = export_zip_for_tables(
      &[sample_table()],
      "oracle",
      Some(DdlSettings::default()),
      false,
      false,
      Some("テーブル定義"),
    )
    .expect("oracle zip export should succeed");

    assert_eq!(result.mime_type, ZIP_MIME_TYPE);
    assert!(result.file_name.ends_with(".zip"));
    assert_eq!(result.success_count, 1);
    assert_eq!(result.skipped_count, 0);
    assert!(!result.base64.is_empty());
  }

  // Phase-1 検収テスト: 参照モードによるテーブル選択
  #[test]
  fn selects_tables_by_reference_index() {
    let tables = vec![sample_table(), {
      let mut t = sample_table();
      t.physical_table_name = "department".into();
      t.logical_table_name = "部署".into();
      t
    }];

    // インデックス [1] を選択 → department テーブルだけが返ること
    let selected =
      select_tables_by_reference(&tables, &[1], &[]).expect("reference selection should succeed");

    assert_eq!(selected.len(), 1);
    assert_eq!(selected[0].physical_table_name, "department");
  }

  #[test]
  fn select_by_reference_applies_override() {
    let tables = vec![sample_table()];
    let mut override_table = sample_table();
    override_table.physical_table_name = "employee_v2".into();

    // インデックス 0 に対してオーバーライドを適用
    let selected = select_tables_by_reference(&tables, &[0], &[(0, override_table)])
      .expect("reference selection with override should succeed");

    assert_eq!(selected.len(), 1);
    assert_eq!(selected[0].physical_table_name, "employee_v2");
  }

  #[test]
  fn select_by_reference_returns_error_for_empty_indexes() {
    let tables = vec![sample_table()];
    let result = select_tables_by_reference(&tables, &[], &[]);
    assert!(result.is_err(), "empty index list must return an error");
  }

  #[test]
  fn select_by_reference_returns_error_for_out_of_range_index() {
    let tables = vec![sample_table()];
    let result = select_tables_by_reference(&tables, &[99], &[]);
    assert!(result.is_err(), "out-of-range index must return an error");
  }
}
