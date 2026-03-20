use std::{fmt::Display, path::Path};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::Manager;

use crate::{
  constants::{DEFAULT_PK_MARKER, FILE_DELETED_MESSAGE, FILE_NOT_FOUND_MESSAGE},
  ddl,
  excel,
  models::{
    workbook_template_variants, BinaryCommandResult, CreateWorkbookFromTemplateRequest,
    CreateWorkbookFromTemplateResponse, DdlGenerationResponse, DdlSettings, DeleteFileResponse,
    ExportZipByReferenceRequest, ExportZipRequest, GenerateDdlByReferenceRequest, GenerateDdlRequest,
    RuntimeDiagnostics, SearchIndexItem, SheetSummary, TableInfo, UploadedFileRecord,
    WorkbookTemplateVariant,
  },
  storage::{self, ImportExcelInput},
  workbook_templates,
};

const DEFAULT_MAX_CONSECUTIVE_EMPTY_ROWS: usize = 10;
const TEMP_UPLOAD_VALIDATION_FILE_NAME: &str = "tauri-upload-validation.xlsx";

fn command_error(action: &str, error: impl Display) -> String {
  format!("Failed to {action}: {error}")
}

fn require_uploaded_file(app: &tauri::AppHandle, file_id: i64) -> Result<UploadedFileRecord, String> {
  storage::find_uploaded_file(app, file_id)?
    .ok_or_else(|| FILE_NOT_FOUND_MESSAGE.to_string())
}

fn load_uploaded_file_path(app: &tauri::AppHandle, file_id: i64) -> Result<String, String> {
  Ok(require_uploaded_file(app, file_id)?.file_path)
}

fn validate_uploaded_excel(app: &tauri::AppHandle, bytes: &[u8]) -> Result<(), String> {
  let temp_dir = app
    .path()
    .app_cache_dir()
    .map_err(|error| command_error("resolve cache directory", error))?;
  std::fs::create_dir_all(&temp_dir)
    .map_err(|error| command_error("create cache directory", error))?;
  let temp_file = temp_dir.join(TEMP_UPLOAD_VALIDATION_FILE_NAME);
  std::fs::write(&temp_file, bytes)
    .map_err(|error| command_error("stage uploaded file for validation", error))?;

  let validation_result = excel::validate_excel_file(&temp_file);
  let _ = std::fs::remove_file(&temp_file);
  validation_result
}

fn resolve_tables_by_reference(
  app: &tauri::AppHandle,
  file_id: i64,
  sheet_name: &str,
  selected_table_indexes: &[usize],
  table_overrides: &[(usize, TableInfo)],
) -> Result<Vec<TableInfo>, String> {
  let file_path = load_uploaded_file_path(app, file_id)?;
  let parse_options = resolve_parse_options(app);
  let source_tables = excel::list_table_info(Path::new(&file_path), sheet_name, &parse_options)?;

  ddl::select_tables_by_reference(&source_tables, selected_table_indexes, table_overrides)
}

fn resolve_parse_options(app: &tauri::AppHandle) -> excel::ParseOptions {
  let settings = storage::get_settings(app).unwrap_or_default();
  excel::ParseOptions {
    max_consecutive_empty_rows: usize::try_from(settings.max_consecutive_empty_rows)
      .ok()
      .filter(|value| *value > 0)
      .unwrap_or(DEFAULT_MAX_CONSECUTIVE_EMPTY_ROWS),
    pk_markers: if settings.pk_markers.is_empty() {
      vec![DEFAULT_PK_MARKER.into()]
    } else {
      settings.pk_markers
    },
  }
}

#[tauri::command]
pub fn core_get_app_version(app: tauri::AppHandle) -> String {
  app.package_info().version.to_string()
}

#[tauri::command]
pub fn core_get_runtime_diagnostics(app: tauri::AppHandle) -> Result<RuntimeDiagnostics, String> {
  storage::get_runtime_diagnostics(&app)
}

#[tauri::command]
pub fn files_list(app: tauri::AppHandle) -> Result<Vec<UploadedFileRecord>, String> {
  storage::list_uploaded_files(&app)
}

#[tauri::command]
pub fn files_list_templates() -> Vec<WorkbookTemplateVariant> {
  workbook_template_variants()
}

#[tauri::command]
pub fn files_create_from_template(
  app: tauri::AppHandle,
  request: CreateWorkbookFromTemplateRequest,
) -> Result<CreateWorkbookFromTemplateResponse, String> {
  workbook_templates::create_workbook_from_template(&app, request)
}

#[tauri::command]
pub fn files_import_excel(
  app: tauri::AppHandle,
  file_name: String,
  last_modified: Option<String>,
  bytes_base64: String,
) -> Result<UploadedFileRecord, String> {
  let bytes = STANDARD
    .decode(bytes_base64.as_bytes())
    .map_err(|error| command_error("decode uploaded file", error))?;

  validate_uploaded_excel(&app, &bytes)?;

  storage::import_excel_file(
    &app,
    ImportExcelInput {
      file_name,
      last_modified,
      bytes,
    },
  )
}

#[tauri::command]
pub fn files_remove(app: tauri::AppHandle, file_id: i64) -> Result<DeleteFileResponse, String> {
  let (file, file_cleanup_warning) = storage::remove_uploaded_file(&app, file_id)?;
  if file.is_none() {
    return Err(FILE_NOT_FOUND_MESSAGE.into());
  }

  Ok(DeleteFileResponse {
    message: FILE_DELETED_MESSAGE.into(),
    file_cleanup_warning,
  })
}

#[tauri::command]
pub fn files_get_sheets(app: tauri::AppHandle, file_id: i64) -> Result<Vec<SheetSummary>, String> {
  let file_path = load_uploaded_file_path(&app, file_id)?;
  excel::list_sheet_summaries(Path::new(&file_path))
}

#[tauri::command]
pub fn files_get_search_index(
  app: tauri::AppHandle,
  file_id: i64,
) -> Result<Vec<SearchIndexItem>, String> {
  let file_path = load_uploaded_file_path(&app, file_id)?;
  let parse_options = resolve_parse_options(&app);
  excel::list_search_index(Path::new(&file_path), &parse_options)
}

#[tauri::command]
pub fn files_get_table_info(
  app: tauri::AppHandle,
  file_id: i64,
  sheet_name: String,
) -> Result<Vec<TableInfo>, String> {
  let file_path = load_uploaded_file_path(&app, file_id)?;
  let parse_options = resolve_parse_options(&app);
  excel::list_table_info(Path::new(&file_path), &sheet_name, &parse_options)
}

#[tauri::command]
pub fn files_get_sheet_data(
  app: tauri::AppHandle,
  file_id: i64,
  sheet_name: String,
) -> Result<Vec<Vec<serde_json::Value>>, String> {
  let file_path = load_uploaded_file_path(&app, file_id)?;
  excel::read_sheet_data(Path::new(&file_path), &sheet_name)
}

#[tauri::command]
pub fn files_parse_region(
  app: tauri::AppHandle,
  file_id: i64,
  sheet_name: String,
  start_row: usize,
  end_row: usize,
  start_col: usize,
  end_col: usize,
) -> Result<Vec<TableInfo>, String> {
  let file_path = load_uploaded_file_path(&app, file_id)?;
  let parse_options = resolve_parse_options(&app);
  excel::parse_sheet_region(
    Path::new(&file_path),
    &sheet_name,
    start_row,
    end_row,
    start_col,
    end_col,
    &parse_options,
  )
}

#[tauri::command]
pub fn ddl_generate(request: GenerateDdlRequest) -> Result<DdlGenerationResponse, String> {
  ddl::generate_ddl_response(&request)
}

#[tauri::command]
pub fn ddl_generate_by_reference(
  app: tauri::AppHandle,
  request: GenerateDdlByReferenceRequest,
) -> Result<DdlGenerationResponse, String> {
  let overrides = request
    .table_overrides
    .iter()
    .map(|item| (item.table_index, item.table.clone()))
    .collect::<Vec<_>>();
  let selected_tables = resolve_tables_by_reference(
    &app,
    request.file_id,
    &request.sheet_name,
    &request.selected_table_indexes,
    &overrides,
  )?;

  ddl::generate_ddl_response(&GenerateDdlRequest {
    tables: selected_tables,
    dialect: request.dialect,
    settings: request.settings,
  })
}

#[tauri::command]
pub fn ddl_export_zip(request: ExportZipRequest) -> Result<BinaryCommandResult, String> {
  ddl::export_zip_for_tables(
    &request.tables,
    &request.dialect,
    request.settings,
    request.tolerant_mode,
    request.include_error_report,
    None,
  )
}

#[tauri::command]
pub fn ddl_export_zip_by_reference(
  app: tauri::AppHandle,
  request: ExportZipByReferenceRequest,
) -> Result<BinaryCommandResult, String> {
  let overrides = request
    .table_overrides
    .iter()
    .map(|item| (item.table_index, item.table.clone()))
    .collect::<Vec<_>>();
  let selected_tables = resolve_tables_by_reference(
    &app,
    request.file_id,
    &request.sheet_name,
    &request.selected_table_indexes,
    &overrides,
  )?;

  ddl::export_zip_for_tables(
    &selected_tables,
    &request.dialect,
    request.settings,
    request.tolerant_mode,
    request.include_error_report,
    Some(&request.sheet_name),
  )
}

#[tauri::command]
pub fn settings_get(app: tauri::AppHandle) -> Result<DdlSettings, String> {
  storage::get_settings(&app)
}

#[tauri::command]
pub fn settings_update(app: tauri::AppHandle, settings: DdlSettings) -> Result<DdlSettings, String> {
  storage::update_settings(&app, &settings)
}
