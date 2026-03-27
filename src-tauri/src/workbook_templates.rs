use std::{
  fs,
  path::{Path, PathBuf},
  time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager};

use crate::{
  excel,
  models::{
    workbook_template_variants, CreateWorkbookFromTemplateRequest, CreateWorkbookFromTemplateResponse,
    WorkbookTemplateValidation, WorkbookTemplateVariant,
  },
  storage,
};

const TEMPLATE_ASSET_MISSING_MESSAGE: &str = "Template asset is missing";
const TEMPLATE_UNKNOWN_MESSAGE: &str = "Unknown template";
const TEMPLATE_VALIDATION_FAILED_MESSAGE: &str = "Template validation failed";

fn resolve_template_asset_path(app: &AppHandle, asset_name: &str) -> Result<PathBuf, String> {
  let mut candidates = Vec::new();

  if let Ok(resource_dir) = app.path().resource_dir() {
    candidates.push(resource_dir.join("attached_assets").join(asset_name));
    candidates.push(resource_dir.join(asset_name));
  }
  if let Ok(current_dir) = std::env::current_dir() {
    candidates.push(current_dir.join("attached_assets").join(asset_name));
    candidates.push(current_dir.join("../attached_assets").join(asset_name));
  }

  candidates
    .into_iter()
    .find(|path| path.exists() && path.is_file())
    .ok_or_else(|| format!("{TEMPLATE_ASSET_MISSING_MESSAGE}: {asset_name}"))
}

fn sanitize_template_file_name(file_name: &str, fallback: &str) -> String {
  let normalized = file_name.trim();
  let candidate = if normalized.is_empty() { fallback } else { normalized };
  let with_extension = if candidate.to_ascii_lowercase().ends_with(".xlsx") {
    candidate.to_string()
  } else {
    format!("{candidate}.xlsx")
  };

  let cleaned = with_extension
    .chars()
    .map(|char| match char {
      '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
      control if control.is_control() => '_',
      other => other,
    })
    .collect::<String>()
    .trim()
    .to_string();

  if cleaned.is_empty() {
    fallback.to_string()
  } else {
    cleaned
  }
}

fn build_template_hash_seed(template: &WorkbookTemplateVariant) -> String {
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_nanos())
    .unwrap_or(0);
  format!("template:{}:{timestamp}", template.id)
}

fn validate_template_buffer(
  app: &AppHandle,
  bytes: &[u8],
  template: &WorkbookTemplateVariant,
) -> Result<WorkbookTemplateValidation, String> {
  let cache_dir = app
    .path()
    .app_cache_dir()
    .map_err(|error| format!("Failed to resolve cache directory: {error}"))?;
  fs::create_dir_all(&cache_dir)
    .map_err(|error| format!("Failed to create cache directory: {error}"))?;

  let temp_path = cache_dir.join(format!("template-validation-{}.xlsx", template.id));
  fs::write(&temp_path, bytes)
    .map_err(|error| format!("Failed to stage template workbook: {error}"))?;

  let validation_result = validate_template_file(&temp_path, template);
  let _ = fs::remove_file(&temp_path);
  validation_result
}

fn validate_template_file(
  file_path: &Path,
  template: &WorkbookTemplateVariant,
) -> Result<WorkbookTemplateValidation, String> {
  excel::validate_excel_file(file_path)?;
  let sheet_summaries = excel::list_sheet_summaries(file_path, &excel::ParseOptions::default())?;
  let checked_sheet_name = sheet_summaries
    .first()
    .map(|sheet| sheet.name.clone())
    .unwrap_or_else(|| template.starter_sheet_name.clone());

  Ok(WorkbookTemplateValidation {
    parser_format: template.parser_format.clone(),
    expected_parser_format: template.parser_format.clone(),
    recognized: true,
    workbook_sheet_count: i64::try_from(sheet_summaries.len())
      .map_err(|_| "Workbook contains too many sheets".to_string())?,
    checked_sheet_name,
    reasons: Vec::new(),
  })
}

pub fn create_workbook_from_template(
  app: &AppHandle,
  request: CreateWorkbookFromTemplateRequest,
) -> Result<CreateWorkbookFromTemplateResponse, String> {
  let template = workbook_template_variants()
    .into_iter()
    .find(|candidate| candidate.id == request.template_id)
    .ok_or_else(|| format!("{TEMPLATE_UNKNOWN_MESSAGE}: {}", request.template_id))?;
  let asset_path = resolve_template_asset_path(app, &template.seed_asset_name)?;
  let bytes = fs::read(&asset_path)
    .map_err(|error| format!("Failed to read template asset: {error}"))?;
  let validation = validate_template_buffer(app, &bytes, &template)?;
  if !validation.recognized {
    return Err(format!("{TEMPLATE_VALIDATION_FAILED_MESSAGE} for {}", template.id));
  }

  let original_name = sanitize_template_file_name(
    request.original_name.as_deref().unwrap_or(&template.suggested_file_name),
    &template.suggested_file_name,
  );
  let file_hash = storage::compute_sha256_with_salt(&bytes, &build_template_hash_seed(&template));
  let file = storage::import_generated_workbook(app, original_name, bytes, file_hash)?;

  Ok(CreateWorkbookFromTemplateResponse {
    file,
    template,
    validation,
  })
}
