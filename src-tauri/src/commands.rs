use std::{fmt::Display, path::Path};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::Manager;

use crate::{
  constants::{DEFAULT_PK_MARKER, FILE_DELETED_MESSAGE, FILE_NOT_FOUND_MESSAGE},
  ddl,
  ddl_import,
  ddl_import_export,
  excel,
  models::{
    workbook_template_variants, BinaryCommandResult, CreateWorkbookFromTemplateRequest,
    CreateWorkbookFromTemplateResponse, DdlGenerationResponse, DdlSettings, DeleteFileResponse,
    ExportZipByReferenceRequest, ExportZipRequest, GenerateDdlByReferenceRequest, GenerateDdlRequest,
    RuntimeDiagnostics, SearchIndexItem, SheetSummary, TableInfo, UploadedFileRecord,
    WorkbookTemplateVariant,
  },
  name_fix,
  name_fix_apply,
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
  let parse_options = resolve_parse_options_pub(app);
  let source_tables = excel::list_table_info(Path::new(&file_path), sheet_name, &parse_options)?;

  ddl::select_tables_by_reference(&source_tables, selected_table_indexes, table_overrides)
}

pub fn resolve_parse_options_pub(app: &tauri::AppHandle) -> excel::ParseOptions {
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
  let parse_options = resolve_parse_options_pub(&app);
  excel::list_search_index(Path::new(&file_path), &parse_options)
}

#[tauri::command]
pub fn files_get_table_info(
  app: tauri::AppHandle,
  file_id: i64,
  sheet_name: String,
) -> Result<Vec<TableInfo>, String> {
  let file_path = load_uploaded_file_path(&app, file_id)?;
  let parse_options = resolve_parse_options_pub(&app);
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
  let parse_options = resolve_parse_options_pub(&app);
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

// ──────────────────────────────────────────────
// Phase-2: DDL インポート
// ──────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportPreviewCommandRequest {
  pub source_mode: String,
  pub sql_text: String,
  pub file_name: Option<String>,
}

/// SQL DDL テキストを解析してプレビューレスポンスを返す
#[tauri::command]
pub fn ddl_import_preview(
  request: DdlImportPreviewCommandRequest,
) -> Result<ddl_import::DdlImportPreviewResponse, String> {
  ddl_import::preview_ddl_import(&request.source_mode, &request.sql_text, request.file_name)
}

/// DDL カタログから Excel ワークブックを生成して DB に保存する
#[tauri::command]
pub fn ddl_import_export_workbook(
  app: tauri::AppHandle,
  request: ddl_import_export::DdlImportExportRequest,
) -> Result<ddl_import_export::DdlImportExportResponse, String> {
  // SQL を再パースしてカタログを取得
  let preview = ddl_import::preview_ddl_import(
    &request.source_mode,
    &request.sql_text,
    request.file_name.clone(),
  )?;

  // ブロッキングイシューがある場合は allow_lossy_export フラグを確認
  if preview.issue_summary.blocking_count > 0 && !request.allow_lossy_export {
    return Err(format!(
      "DDL has {} blocking issue(s). Set allowLossyExport=true to proceed.",
      preview.issue_summary.blocking_count,
    ));
  }

  ddl_import_export::export_workbook_from_ddl(&app, &request, &preview.catalog, preview.issue_summary)
}

// ──────────────────────────────────────────────
// Phase-2: 物理名修正プレビュー
// ──────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NameFixPreviewCommandRequest {
  pub file_id: i64,
  pub sheet_name: String,
  pub options: name_fix::NameFixPlanOptions,
}

/// 指定ファイル・シートの TableInfo に対して名前修正プランをプレビューする
#[tauri::command]
pub fn name_fix_preview(
  app: tauri::AppHandle,
  request: NameFixPreviewCommandRequest,
) -> Result<name_fix::NameFixPreviewResponse, String> {
  let file_path = load_uploaded_file_path(&app, request.file_id)?;
  let parse_options = resolve_parse_options_pub(&app);
  let tables = excel::list_table_info(Path::new(&file_path), &request.sheet_name, &parse_options)?;

  let (mappings, conflicts, decision_trace, changed_table_count, changed_column_count) =
    name_fix::compute_name_fix_plan(&tables, &request.options);

  let blocking_conflicts: Vec<name_fix::NameFixConflict> =
    conflicts.iter().filter(|c| c.blocking).cloned().collect();

  // プランID: ファイルID + シート名 + タイムスタンプで簡易的に生成
  let plan_id = format!(
    "plan-{}-{}-{}",
    request.file_id,
    request.sheet_name.len(),
    chrono::Utc::now().timestamp_millis()
  );

  // プランを DB に保存して apply コマンドから参照できるようにする
  let plan_json = serde_json::to_string(&mappings)
    .map_err(|e| format!("Failed to serialize plan: {e}"))?;
  storage::save_name_fix_plan(&app, &plan_id, request.file_id, &request.sheet_name, &plan_json)?;

  Ok(name_fix::NameFixPreviewResponse {
    file_id: request.file_id,
    sheet_name: request.sheet_name,
    plan_id,
    changed_table_count,
    changed_column_count,
    unresolved_source_ref_count: 0,
    blocking_conflicts,
    conflicts,
    decision_trace,
    mappings,
  })
}

// ──────────────────────────────────────────────
// Phase-2: スキーマ差分
// ──────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffPreviewCommandRequest {
  pub new_file_id: i64,
  pub old_file_id: Option<i64>,
  #[serde(default = "default_mode")]
  pub mode: String,
  #[serde(default = "default_scope")]
  pub scope: String,
  pub sheet_name: Option<String>,
  pub thresholds: Option<crate::schema_diff::DiffThresholds>,
}

fn default_mode() -> String { "auto".to_string() }
fn default_scope() -> String { "all_sheets".to_string() }

/// 2つの Excel ファイル間のスキーマ差分をプレビューする
#[tauri::command]
pub fn diff_preview(
  app: tauri::AppHandle,
  request: DiffPreviewCommandRequest,
) -> Result<crate::schema_diff::DiffPreviewResponse, String> {
  crate::schema_diff::compute_diff(
    &app,
    request.new_file_id,
    request.old_file_id,
    &request.mode,
    &request.scope,
    request.sheet_name.as_deref(),
    request.thresholds,
  )
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffConfirmCommandRequest {
  pub diff_id: String,
  pub decisions: Vec<crate::schema_diff::DiffRenameDecisionItem>,
}

/// リネーム候補の accept/reject 判定を確定する
#[tauri::command]
pub fn diff_confirm(
  app: tauri::AppHandle,
  request: DiffConfirmCommandRequest,
) -> Result<crate::schema_diff::DiffConfirmResponse, String> {
  crate::schema_diff::confirm_renames(&app, &request.diff_id, &request.decisions)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffAlterPreviewCommandRequest {
  pub diff_id: String,
  #[serde(default = "default_dialect")]
  pub dialect: String,
  #[serde(default)]
  pub split_by_sheet: bool,
  #[serde(default = "default_output_mode")]
  pub output_mode: String,
  #[serde(default)]
  pub include_unconfirmed: bool,
}

fn default_dialect() -> String { "mysql".to_string() }
fn default_output_mode() -> String { "alter_only".to_string() }

/// 差分結果から ALTER SQL をプレビューする
#[tauri::command]
pub fn diff_alter_preview(
  app: tauri::AppHandle,
  request: DiffAlterPreviewCommandRequest,
) -> Result<crate::schema_diff::DiffAlterPreviewResponse, String> {
  crate::schema_diff::compute_alter_preview(
    &app,
    &request.diff_id,
    &request.dialect,
    request.split_by_sheet,
    &request.output_mode,
    request.include_unconfirmed,
  )
}

// ──────────────────────────────────────────────
// Phase-2: 物理名修正 適用
// ──────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NameFixApplyCommandRequest {
  pub plan_id: String,
  #[serde(default = "default_name_fix_mode")]
  pub mode: String,
  #[serde(default = "default_include_report")]
  pub include_report: bool,
}

fn default_name_fix_mode() -> String { "copy".to_string() }
fn default_include_report() -> bool { true }

/// 名前修正プランを適用して修正済み xlsx を DB に保存する
#[tauri::command]
pub fn name_fix_apply(
  app: tauri::AppHandle,
  request: NameFixApplyCommandRequest,
) -> Result<name_fix_apply::NameFixApplyResponse, String> {
  name_fix_apply::apply_name_fix(&app, &request.plan_id, &request.mode, request.include_report)
}

// ──────────────────────────────────────────────────────────────────────────────
// 組み込み拡張コマンド
// ──────────────────────────────────────────────────────────────────────────────

use crate::builtin_extensions;
use crate::builtin_extensions::enum_gen::{EnumGenPreviewResponse, EnumGenRequest};

/// 組み込み拡張機能のマニフェスト一覧を返す
#[tauri::command]
pub async fn ext_list_builtin(
) -> Result<Vec<builtin_extensions::BuiltinExtensionManifest>, String> {
  Ok(builtin_extensions::get_builtin_extensions())
}

/// 指定シートから列挙定義を解析してプレビューデータを返す
#[tauri::command]
pub async fn enum_gen_preview(
  app: tauri::AppHandle,
  request: EnumGenRequest,
) -> Result<EnumGenPreviewResponse, String> {
  let file_record = crate::storage::find_uploaded_file(&app, request.file_id)
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("ファイルが見つかりません: id={}", request.file_id))?;
  let path = std::path::Path::new(&file_record.file_path);
  builtin_extensions::enum_gen::parse_enum_sheet(path, &request.sheet_name)
}

/// 列挙定義を解析してコードファイルをエクスポートする（Base64 ZIP または .ts）
#[tauri::command]
pub async fn enum_gen_export(
  app: tauri::AppHandle,
  request: EnumGenRequest,
) -> Result<crate::models::BinaryCommandResult, String> {
  let file_record = crate::storage::find_uploaded_file(&app, request.file_id)
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("ファイルが見つかりません: id={}", request.file_id))?;
  let path = std::path::Path::new(&file_record.file_path);
  let preview = builtin_extensions::enum_gen::parse_enum_sheet(path, &request.sheet_name)?;

  match request.target_lang {
    builtin_extensions::enum_gen::TargetLang::Java => {
      // Java: 各クラスを個別ファイルとして ZIP にまとめる
      let package = request.package_name.as_deref().unwrap_or("com.example");
      let zip_bytes =
        builtin_extensions::enum_gen::generate_java_zip(&preview.enums, package)?;
      let base64 = STANDARD.encode(&zip_bytes);
      Ok(crate::models::BinaryCommandResult {
        base64,
        file_name: "enums-java.zip".to_string(),
        mime_type: "application/zip".to_string(),
        success_count: preview.enums.len() as i64,
        skipped_count: 0,
        skipped_tables: vec![],
      })
    }
    builtin_extensions::enum_gen::TargetLang::TypeScript => {
      // TypeScript: 全クラスを1ファイルにまとめる
      let content =
        builtin_extensions::enum_gen::generate_typescript_content(&preview.enums);
      let base64 = STANDARD.encode(content.as_bytes());
      Ok(crate::models::BinaryCommandResult {
        base64,
        file_name: "enums.ts".to_string(),
        mime_type: "text/plain".to_string(),
        success_count: preview.enums.len() as i64,
        skipped_count: 0,
        skipped_tables: vec![],
      })
    }
  }
}

// ─── 自動更新コマンド ─────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct UpdateCheckResult {
  pub available: bool,
  pub version: Option<String>,
  pub body: Option<String>,
}

/// 更新の有無を確認する
#[tauri::command]
pub async fn update_check(app: tauri::AppHandle) -> Result<UpdateCheckResult, String> {
  use tauri_plugin_updater::UpdaterExt;
  match app.updater().map_err(|e| e.to_string())?.check().await {
    Ok(Some(update)) => Ok(UpdateCheckResult {
      available: true,
      version: Some(update.version.clone()),
      body: update.body.clone(),
    }),
    Ok(None) => Ok(UpdateCheckResult {
      available: false,
      version: None,
      body: None,
    }),
    Err(e) => Err(e.to_string()),
  }
}

/// 更新をダウンロードしてインストールする
#[tauri::command]
pub async fn update_download_and_install(app: tauri::AppHandle) -> Result<(), String> {
  use tauri_plugin_updater::UpdaterExt;
  let update = app
    .updater()
    .map_err(|e| e.to_string())?
    .check()
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "最新バージョンです".to_string())?;
  update
    .download_and_install(|_, _| {}, || {})
    .await
    .map_err(|e| e.to_string())
}
