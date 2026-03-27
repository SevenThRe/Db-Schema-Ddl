use serde::{Deserialize, Serialize};

use crate::constants::DEFAULT_PK_MARKER;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedFileRecord {
  pub id: i64,
  pub file_path: String,
  pub original_name: String,
  pub original_modified_at: Option<String>,
  pub file_hash: String,
  pub file_size: i64,
  pub uploaded_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetSummary {
  pub name: String,
  pub has_table_definitions: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchIndexItem {
  #[serde(rename = "type")]
  pub item_type: String,
  pub sheet_name: String,
  pub display_name: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub physical_table_name: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub logical_table_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CellSourceRef {
  pub sheet_name: String,
  pub row: i64,
  pub col: i64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSourceRef {
  pub sheet_name: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub logical_name: Option<CellSourceRef>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub physical_name: Option<CellSourceRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub no: Option<i64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub logical_name: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub physical_name: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub data_type: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub size: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub not_null: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub is_pk: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub auto_increment: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub comment: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub comment_raw: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub source_ref: Option<CellSourceRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableColumnRange {
  pub start_col: i64,
  pub end_col: i64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub start_col_label: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub end_col_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableRowRange {
  pub start_row: i64,
  pub end_row: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
  pub logical_table_name: String,
  pub physical_table_name: String,
  pub columns: Vec<ColumnInfo>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub column_range: Option<TableColumnRange>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub row_range: Option<TableRowRange>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub excel_range: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub source_ref: Option<TableSourceRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateDdlRequest {
  pub tables: Vec<TableInfo>,
  pub dialect: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub settings: Option<DdlSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableReferenceOverride {
  pub table_index: usize,
  pub table: TableInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateDdlByReferenceRequest {
  pub file_id: i64,
  pub sheet_name: String,
  pub selected_table_indexes: Vec<usize>,
  #[serde(default)]
  pub table_overrides: Vec<TableReferenceOverride>,
  pub dialect: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub settings: Option<DdlSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlGenerationWarning {
  pub code: String,
  pub table_name: String,
  pub column_name: String,
  pub message: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlGenerationResponse {
  pub ddl: String,
  #[serde(skip_serializing_if = "Vec::is_empty", default)]
  pub warnings: Vec<DdlGenerationWarning>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookTemplateVariant {
  pub id: String,
  pub label: String,
  pub description: String,
  pub parser_format: String,
  pub layout: String,
  pub seed_asset_name: String,
  pub suggested_file_name: String,
  pub starter_sheet_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookTemplateValidation {
  pub parser_format: String,
  pub expected_parser_format: String,
  pub recognized: bool,
  pub workbook_sheet_count: i64,
  pub checked_sheet_name: String,
  #[serde(default)]
  pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkbookFromTemplateRequest {
  pub template_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub original_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkbookFromTemplateResponse {
  pub file: UploadedFileRecord,
  pub template: WorkbookTemplateVariant,
  pub validation: WorkbookTemplateValidation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DdlSettings {
  pub status_bar_items: Vec<String>,
  pub mysql_engine: String,
  pub mysql_charset: String,
  pub mysql_collate: String,
  pub varchar_charset: String,
  pub varchar_collate: String,
  pub export_filename_prefix: String,
  pub export_filename_suffix: String,
  pub include_comment_header: bool,
  pub author_name: String,
  pub include_set_names: bool,
  pub include_drop_table: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub download_path: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub excel_read_path: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub custom_header_template: Option<String>,
  pub use_custom_header: bool,
  pub hide_sheets_without_definitions: bool,
  pub mysql_data_type_case: String,
  pub mysql_boolean_mode: String,
  pub pk_markers: Vec<String>,
  pub max_consecutive_empty_rows: i64,
  pub upload_rate_limit_window_ms: i64,
  pub upload_rate_limit_max_requests: i64,
  pub parse_rate_limit_window_ms: i64,
  pub parse_rate_limit_max_requests: i64,
  pub global_protect_rate_limit_window_ms: i64,
  pub global_protect_rate_limit_max_requests: i64,
  pub global_protect_max_in_flight: i64,
  pub prewarm_enabled: bool,
  pub prewarm_max_concurrency: i64,
  pub prewarm_queue_max: i64,
  pub prewarm_max_file_mb: i64,
  pub task_manager_max_queue_length: i64,
  pub task_manager_stale_pending_ms: i64,
  pub name_fix_default_mode: String,
  pub name_fix_conflict_strategy: String,
  pub name_fix_reserved_word_strategy: String,
  pub name_fix_length_overflow_strategy: String,
  pub name_fix_max_identifier_length: i64,
  pub name_fix_backup_retention_days: i64,
  pub name_fix_max_batch_concurrency: i64,
  pub allow_overwrite_in_electron: bool,
  pub allow_external_path_write: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub ddl_import_template_preference: Option<String>,
}

impl Default for DdlSettings {
  fn default() -> Self {
    Self {
      status_bar_items: vec!["activity".into(), "memory".into()],
      mysql_engine: "InnoDB".into(),
      mysql_charset: "utf8mb4".into(),
      mysql_collate: "utf8mb4_bin".into(),
      varchar_charset: "utf8mb4".into(),
      varchar_collate: "utf8mb4_bin".into(),
      export_filename_prefix: "Crt_".into(),
      export_filename_suffix: String::new(),
      include_comment_header: true,
      author_name: "ISI".into(),
      include_set_names: true,
      include_drop_table: true,
      download_path: None,
      excel_read_path: None,
      custom_header_template: None,
      use_custom_header: false,
      hide_sheets_without_definitions: true,
      mysql_data_type_case: "lower".into(),
      mysql_boolean_mode: "tinyint(1)".into(),
      pk_markers: vec![DEFAULT_PK_MARKER.into()],
      max_consecutive_empty_rows: 10,
      upload_rate_limit_window_ms: 60_000,
      upload_rate_limit_max_requests: 20,
      parse_rate_limit_window_ms: 60_000,
      parse_rate_limit_max_requests: 40,
      global_protect_rate_limit_window_ms: 60_000,
      global_protect_rate_limit_max_requests: 240,
      global_protect_max_in_flight: 80,
      prewarm_enabled: true,
      prewarm_max_concurrency: 1,
      prewarm_queue_max: 12,
      prewarm_max_file_mb: 20,
      task_manager_max_queue_length: 200,
      task_manager_stale_pending_ms: 30 * 60 * 1000,
      name_fix_default_mode: "copy".into(),
      name_fix_conflict_strategy: "suffix_increment".into(),
      name_fix_reserved_word_strategy: "prefix".into(),
      name_fix_length_overflow_strategy: "truncate_hash".into(),
      name_fix_max_identifier_length: 64,
      name_fix_backup_retention_days: 30,
      name_fix_max_batch_concurrency: 4,
      allow_overwrite_in_electron: true,
      allow_external_path_write: false,
      ddl_import_template_preference: None,
    }
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFileResponse {
  pub message: String,
  pub file_cleanup_warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDiagnostics {
  pub runtime: String,
  pub app_data_dir: String,
  pub uploads_dir: String,
  pub db_path: String,
  pub db_exists: bool,
  pub uploaded_file_count: i64,
  pub settings_row_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMetrics {
  pub pid: u32,
  pub memory_bytes: u64,
  pub virtual_memory_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportZipRequest {
  pub tables: Vec<TableInfo>,
  pub dialect: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub settings: Option<DdlSettings>,
  #[serde(default = "default_true")]
  pub tolerant_mode: bool,
  #[serde(default = "default_true")]
  pub include_error_report: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportZipByReferenceRequest {
  pub file_id: i64,
  pub sheet_name: String,
  pub selected_table_indexes: Vec<usize>,
  #[serde(default)]
  pub table_overrides: Vec<TableReferenceOverride>,
  pub dialect: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub settings: Option<DdlSettings>,
  #[serde(default = "default_true")]
  pub tolerant_mode: bool,
  #[serde(default = "default_true")]
  pub include_error_report: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryCommandResult {
  pub base64: String,
  pub file_name: String,
  pub mime_type: String,
  pub success_count: i64,
  pub skipped_count: i64,
  #[serde(default)]
  pub skipped_tables: Vec<String>,
}

fn default_true() -> bool {
  true
}

pub fn workbook_template_variants() -> Vec<WorkbookTemplateVariant> {
  vec![
    WorkbookTemplateVariant {
      id: "format-a-table-sheet".into(),
      label: "单表 Sheet 模板".into(),
      description: "适合 1 张表对应 1 个 Sheet 的定义书结构，采用 Format A 标记布局。".into(),
      parser_format: "A".into(),
      layout: "table_per_sheet".into(),
      seed_asset_name: "workbook-template-format-a.xlsx".into(),
      suggested_file_name: "db-template-format-a.xlsx".into(),
      starter_sheet_name: "テーブル定義".into(),
    },
    WorkbookTemplateVariant {
      id: "format-b-multi-table-sheet".into(),
      label: "多表 Sheet 模板".into(),
      description: "适合同一 Sheet 内管理多张表的定义书结构，采用 Format B 标记布局。".into(),
      parser_format: "B".into(),
      layout: "multi_table_per_sheet".into(),
      seed_asset_name: "workbook-template-format-b.xlsx".into(),
      suggested_file_name: "db-template-format-b.xlsx".into(),
      starter_sheet_name: "データベース定義書".into(),
    },
  ]
}
