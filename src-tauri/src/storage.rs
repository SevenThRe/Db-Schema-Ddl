use std::{
  env,
  fmt::Display,
  fs,
  path::{Path, PathBuf},
  time::{SystemTime, UNIX_EPOCH},
};

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::models::{DdlSettings, RuntimeDiagnostics, UploadedFileRecord};

const APP_DB_FILE_NAME: &str = "db-schema-ddl.sqlite3";
const UPLOADS_DIR_NAME: &str = "uploads";
const DEFAULT_WORKBOOK_FILE_NAME: &str = "workbook.xlsx";
const DEFAULT_WORKBOOK_STEM: &str = "workbook";
const DEFAULT_WORKBOOK_EXTENSION: &str = "xlsx";
const DEFAULT_LEGACY_UPLOAD_NAME: &str = "legacy-upload.xlsx";
const UPLOADED_FILE_TOO_LARGE_MESSAGE: &str = "Uploaded file is too large";
const LEGACY_UPLOAD_TOO_LARGE_MESSAGE: &str = "Legacy upload file is too large";
const RELOAD_UPLOADED_FILE_MESSAGE: &str = "Uploaded file was saved but could not be reloaded";
const APP_DATA_DIR_DERIVE_MESSAGE: &str = "Failed to derive app data directory";
const SELECT_UPLOADED_FILE_BY_ID_SQL: &str = "
  SELECT id, file_path, original_name, original_modified_at, file_hash, file_size, uploaded_at
  FROM uploaded_files
  WHERE id = ?1
";
const SELECT_UPLOADED_FILE_BY_HASH_SQL: &str = "
  SELECT id, file_path, original_name, original_modified_at, file_hash, file_size, uploaded_at
  FROM uploaded_files
  WHERE file_hash = ?1
";
const LIST_UPLOADED_FILES_SQL: &str = "
  SELECT id, file_path, original_name, original_modified_at, file_hash, file_size, uploaded_at
  FROM uploaded_files
  ORDER BY id DESC
";

pub struct ImportExcelInput {
  pub file_name: String,
  pub last_modified: Option<String>,
  pub bytes: Vec<u8>,
}

struct AppPaths {
  uploads_dir: PathBuf,
  db_path: PathBuf,
}

struct LegacyUploadedFileRecord {
  file_path: String,
  original_name: String,
  original_modified_at: Option<String>,
  file_hash: String,
  file_size: i64,
  uploaded_at: Option<String>,
}

fn storage_error(action: &str, error: impl Display) -> String {
  format!("Failed to {action}: {error}")
}

fn decode_row<T>(row: rusqlite::Result<T>, action: &str) -> Result<T, String> {
  row.map_err(|error| storage_error(action, error))
}

fn now_iso_string() -> String {
  Utc::now().to_rfc3339()
}

fn sanitize_file_name(file_name: &str) -> String {
  let trimmed = file_name.trim();
  let base = if trimmed.is_empty() { DEFAULT_WORKBOOK_FILE_NAME } else { trimmed };
  let sanitized = base
    .chars()
    .map(|char| match char {
      '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
      control if control.is_control() => '_',
      other => other,
    })
    .collect::<String>()
    .trim()
    .to_string();

  if sanitized.is_empty() {
    DEFAULT_WORKBOOK_FILE_NAME.into()
  } else {
    sanitized
  }
}

fn normalize_temp_upload_name(file_name: &str) -> Option<String> {
  let trimmed = file_name.trim();
  let mut parts = trimmed.splitn(3, '_');
  let hash_prefix = parts.next()?;
  let timestamp = parts.next()?;
  let original_name = parts.next()?.trim();

  let is_hash_prefix = hash_prefix.len() == 8 && hash_prefix.chars().all(|char| char.is_ascii_hexdigit());
  let is_timestamp = (10..=17).contains(&timestamp.len()) && timestamp.chars().all(|char| char.is_ascii_digit());

  if !is_hash_prefix || !is_timestamp || original_name.is_empty() {
    return None;
  }

  Some(original_name.to_string())
}

fn resolve_app_paths(app: &AppHandle) -> Result<AppPaths, String> {
  let app_data_dir = app
    .path()
    .app_data_dir()
    .map_err(|error| storage_error("resolve app data directory", error))?;
  let uploads_dir = app_data_dir.join(UPLOADS_DIR_NAME);
  let db_path = app_data_dir.join(APP_DB_FILE_NAME);

  fs::create_dir_all(&uploads_dir)
    .map_err(|error| storage_error("create uploads directory", error))?;

  Ok(AppPaths { uploads_dir, db_path })
}

fn open_connection(app: &AppHandle) -> Result<(Connection, AppPaths), String> {
  let paths = resolve_app_paths(app)?;
  let connection = Connection::open(&paths.db_path)
    .map_err(|error| storage_error("open app database", error))?;
  initialize_schema(&connection)?;
  sync_legacy_upload_metadata(&connection)?;
  maybe_backfill_legacy_uploads(&connection)?;
  normalize_uploaded_file_display_names(&connection)?;
  Ok((connection, paths))
}

fn initialize_schema(connection: &Connection) -> Result<(), String> {
  connection
    .execute_batch(
      "
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        original_name TEXT NOT NULL,
        original_modified_at TEXT,
        file_hash TEXT NOT NULL UNIQUE,
        file_size INTEGER NOT NULL,
        uploaded_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schema_diffs (
        id TEXT PRIMARY KEY,
        new_file_id INTEGER NOT NULL,
        old_file_id INTEGER NOT NULL,
        scope TEXT NOT NULL,
        sheet_name TEXT,
        diff_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS diff_rename_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        diff_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        decision TEXT NOT NULL DEFAULT 'pending',
        confidence REAL NOT NULL DEFAULT 0.0,
        UNIQUE(diff_id, entity_key)
      );

      CREATE TABLE IF NOT EXISTS name_fix_plans (
        id TEXT PRIMARY KEY,
        file_id INTEGER NOT NULL,
        sheet_name TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS db_connections (
        id TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      ",
    )
    .map_err(|error| storage_error("initialize app database schema", error))?;

  Ok(())
}

fn row_to_uploaded_file(row: &rusqlite::Row<'_>) -> rusqlite::Result<UploadedFileRecord> {
  Ok(UploadedFileRecord {
    id: row.get("id")?,
    file_path: row.get("file_path")?,
    original_name: row.get("original_name")?,
    original_modified_at: row.get("original_modified_at")?,
    file_hash: row.get("file_hash")?,
    file_size: row.get("file_size")?,
    uploaded_at: row.get("uploaded_at")?,
  })
}

pub fn compute_sha256_hex(bytes: &[u8]) -> String {
  let mut hasher = Sha256::new();
  hasher.update(bytes);
  format!("{:x}", hasher.finalize())
}

pub fn compute_sha256_with_salt(bytes: &[u8], salt: &str) -> String {
  let mut hasher = Sha256::new();
  hasher.update(bytes);
  hasher.update(salt.as_bytes());
  format!("{:x}", hasher.finalize())
}

fn count_uploaded_files(connection: &Connection) -> Result<i64, String> {
  count_rows(connection, "uploaded_files", "count uploaded files")
}

fn count_rows(connection: &Connection, table_name: &str, action: &str) -> Result<i64, String> {
  connection
    .query_row(&format!("SELECT COUNT(*) FROM {table_name}"), [], |row| row.get::<_, i64>(0))
    .map_err(|error| storage_error(action, error))
}

fn file_size_to_i64(file_size: usize, message: &str) -> Result<i64, String> {
  i64::try_from(file_size).map_err(|_| message.to_string())
}

fn legacy_upload_directories() -> Vec<PathBuf> {
  let mut candidates = Vec::new();
  if let Ok(current_dir) = env::current_dir() {
    candidates.push(current_dir.join(UPLOADS_DIR_NAME));
    candidates.push(current_dir.join(format!("../{UPLOADS_DIR_NAME}")));
  }
  candidates
}

fn legacy_database_paths() -> Vec<PathBuf> {
  let mut candidates = Vec::new();
  if let Ok(current_dir) = env::current_dir() {
    candidates.push(current_dir.join("data/database.sqlite"));
    candidates.push(current_dir.join("../data/database.sqlite"));
  }
  candidates
}

fn resolve_legacy_file_path(legacy_db_path: &Path, stored_file_path: &str) -> PathBuf {
  let candidate_path = PathBuf::from(stored_file_path);
  if candidate_path.is_absolute() {
    return candidate_path;
  }

  let base_dir = legacy_db_path
    .parent()
    .and_then(|parent| parent.parent())
    .map(PathBuf::from)
    .unwrap_or_else(|| PathBuf::from("."));

  base_dir.join(candidate_path)
}

fn load_legacy_uploaded_files(legacy_db_path: &Path) -> Result<Vec<LegacyUploadedFileRecord>, String> {
  let legacy_connection = Connection::open(legacy_db_path)
    .map_err(|error| storage_error("open legacy database", error))?;
  let mut statement = legacy_connection
    .prepare(
      "
      SELECT file_path, original_name, original_modified_at, file_hash, file_size, uploaded_at
      FROM uploaded_files
      ORDER BY id DESC
      ",
    )
    .map_err(|error| storage_error("prepare legacy uploaded file query", error))?;

  let rows = statement
    .query_map([], |row| {
      Ok(LegacyUploadedFileRecord {
        file_path: row.get("file_path")?,
        original_name: row.get("original_name")?,
        original_modified_at: row.get("original_modified_at")?,
        file_hash: row.get("file_hash")?,
        file_size: row.get("file_size")?,
        uploaded_at: row.get("uploaded_at")?,
      })
    })
    .map_err(|error| storage_error("read legacy uploaded files", error))?;

  let mut files = Vec::new();
  for row in rows {
    files.push(decode_row(row, "decode legacy uploaded file row")?);
  }
  Ok(files)
}

fn sync_legacy_upload_metadata(connection: &Connection) -> Result<(), String> {
  for legacy_db_path in legacy_database_paths() {
    if !legacy_db_path.exists() || !legacy_db_path.is_file() {
      continue;
    }

    let legacy_files = load_legacy_uploaded_files(&legacy_db_path)?;
    for legacy_file in legacy_files {
      let resolved_file_path = resolve_legacy_file_path(&legacy_db_path, &legacy_file.file_path);
      if !resolved_file_path.exists() {
        continue;
      }

      let normalized_original_name = normalize_temp_upload_name(&legacy_file.original_name)
        .unwrap_or_else(|| legacy_file.original_name.clone());
      let existing = find_uploaded_file_by_hash(connection, &legacy_file.file_hash)?;
      if let Some(existing) = existing {
        connection.execute(
          "
          UPDATE uploaded_files
          SET file_path = ?1,
              original_name = ?2,
              original_modified_at = ?3,
              file_size = ?4,
              uploaded_at = COALESCE(?5, uploaded_at)
          WHERE id = ?6
          ",
          params![
            resolved_file_path.to_string_lossy().to_string(),
            normalized_original_name,
            legacy_file.original_modified_at,
            legacy_file.file_size,
            legacy_file.uploaded_at,
            existing.id,
          ],
        ).map_err(|error| storage_error("sync legacy uploaded file metadata", error))?;
      } else {
        connection.execute(
          "
          INSERT INTO uploaded_files (
            file_path,
            original_name,
            original_modified_at,
            file_hash,
            file_size,
            uploaded_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
          ",
          params![
            resolved_file_path.to_string_lossy().to_string(),
            normalized_original_name,
            legacy_file.original_modified_at,
            legacy_file.file_hash,
            legacy_file.file_size,
            legacy_file.uploaded_at.unwrap_or_else(now_iso_string),
          ],
        ).map_err(|error| storage_error("import legacy uploaded file metadata", error))?;
      }
    }

    break;
  }

  Ok(())
}

fn is_excel_path(path: &Path) -> bool {
  matches!(
    path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase()),
    Some(ref ext) if ext == "xlsx" || ext == "xls"
  )
}

fn maybe_backfill_legacy_uploads(connection: &Connection) -> Result<(), String> {
  if count_uploaded_files(connection)? > 0 {
    return Ok(());
  }

  let mut imported_any = false;
  for directory in legacy_upload_directories() {
    if !directory.exists() || !directory.is_dir() {
      continue;
    }

    let entries = fs::read_dir(&directory)
      .map_err(|error| storage_error("scan legacy uploads directory", error))?;
    for entry in entries {
      let entry = entry.map_err(|error| storage_error("read legacy upload entry", error))?;
      let path = entry.path();
      if !path.is_file() || !is_excel_path(&path) {
        continue;
      }

      let bytes = fs::read(&path)
        .map_err(|error| storage_error("read legacy upload file", error))?;
      let file_hash = compute_sha256_hex(&bytes);
      if find_uploaded_file_by_hash(connection, &file_hash)?.is_some() {
        continue;
      }

      let metadata = entry
        .metadata()
        .map_err(|error| storage_error("read legacy upload metadata", error))?;
      let uploaded_at = metadata
        .modified()
        .ok()
        .and_then(|time| chrono::DateTime::<Utc>::from_timestamp(
          time.duration_since(UNIX_EPOCH).ok()?.as_secs() as i64,
          0,
        ))
        .map(|value| value.to_rfc3339())
        .unwrap_or_else(now_iso_string);

      connection.execute(
        "
        INSERT INTO uploaded_files (
          file_path,
          original_name,
          original_modified_at,
          file_hash,
          file_size,
          uploaded_at
        ) VALUES (?1, ?2, NULL, ?3, ?4, ?5)
        ",
        params![
          path.to_string_lossy().to_string(),
          path
            .file_name()
            .and_then(|value| value.to_str())
            .and_then(normalize_temp_upload_name)
                .unwrap_or_else(|| {
                  path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or(DEFAULT_LEGACY_UPLOAD_NAME)
                    .to_string()
                }),
          file_hash,
          i64::try_from(metadata.len()).map_err(|_| LEGACY_UPLOAD_TOO_LARGE_MESSAGE.to_string())?,
          uploaded_at,
        ],
      ).map_err(|error| storage_error("import legacy upload metadata", error))?;
      imported_any = true;
    }

    if imported_any {
      break;
    }
  }

  Ok(())
}

fn normalize_uploaded_file_display_names(connection: &Connection) -> Result<(), String> {
  let mut statement = connection
    .prepare("SELECT id, original_name FROM uploaded_files")
    .map_err(|error| storage_error("prepare uploaded file normalization query", error))?;
  let rows = statement
    .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
    .map_err(|error| storage_error("query uploaded file display names", error))?;

  for row in rows {
    let (id, original_name) = decode_row(row, "decode uploaded file display name row")?;
    let Some(normalized_name) = normalize_temp_upload_name(&original_name) else {
      continue;
    };

    connection
      .execute(
        "UPDATE uploaded_files SET original_name = ?1 WHERE id = ?2",
        params![normalized_name, id],
      )
      .map_err(|error| storage_error("normalize uploaded file display name", error))?;
  }

  Ok(())
}

fn unique_upload_path(uploads_dir: &Path, original_name: &str, file_hash: &str) -> PathBuf {
  let sanitized_name = sanitize_file_name(original_name);
  let source_path = Path::new(&sanitized_name);
  let stem = source_path
    .file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or(DEFAULT_WORKBOOK_STEM);
  let ext = source_path
    .extension()
    .and_then(|value| value.to_str())
    .filter(|value| !value.is_empty())
    .unwrap_or(DEFAULT_WORKBOOK_EXTENSION);
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis())
    .unwrap_or(0);
  let hash_prefix = &file_hash[..8.min(file_hash.len())];

  uploads_dir.join(format!("{stem}_{timestamp}_{hash_prefix}.{ext}"))
}

fn persist_uploaded_file_record(
  connection: &Connection,
  paths: &AppPaths,
  file_name: String,
  last_modified: Option<String>,
  bytes: Vec<u8>,
  file_hash: String,
) -> Result<UploadedFileRecord, String> {
  let original_name = sanitize_file_name(&file_name);
  let file_path = unique_upload_path(&paths.uploads_dir, &original_name, &file_hash);
  fs::write(&file_path, &bytes)
    .map_err(|error| storage_error("persist uploaded file", error))?;

  let uploaded_at = now_iso_string();
  let insert_result = connection.execute(
    "
    INSERT INTO uploaded_files (
      file_path,
      original_name,
      original_modified_at,
      file_hash,
      file_size,
      uploaded_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ",
    params![
      file_path.to_string_lossy().to_string(),
      original_name,
      last_modified,
      file_hash,
      file_size_to_i64(bytes.len(), UPLOADED_FILE_TOO_LARGE_MESSAGE)?,
      uploaded_at,
    ],
  );

  if let Err(error) = insert_result {
    let _ = fs::remove_file(&file_path);
    return Err(storage_error("save uploaded file metadata", error));
  }

  let inserted_id = connection.last_insert_rowid();
  connection
    .query_row(SELECT_UPLOADED_FILE_BY_ID_SQL, [inserted_id], row_to_uploaded_file)
    .optional()
    .map_err(|error| storage_error("reload uploaded file after save", error))?
    .ok_or_else(|| RELOAD_UPLOADED_FILE_MESSAGE.to_string())
}

pub fn list_uploaded_files(app: &AppHandle) -> Result<Vec<UploadedFileRecord>, String> {
  let (connection, _) = open_connection(app)?;
  let mut statement = connection
    .prepare(LIST_UPLOADED_FILES_SQL)
    .map_err(|error| storage_error("prepare uploaded file query", error))?;

  let rows = statement
    .query_map([], row_to_uploaded_file)
    .map_err(|error| storage_error("list uploaded files", error))?;

  let mut files = Vec::new();
  for row in rows {
    files.push(decode_row(row, "read uploaded file row")?);
  }

  Ok(files)
}

fn load_uploaded_file_by_id(
  connection: &Connection,
  file_id: i64,
  action: &str,
) -> Result<Option<UploadedFileRecord>, String> {
  connection
    .query_row(SELECT_UPLOADED_FILE_BY_ID_SQL, [file_id], row_to_uploaded_file)
    .optional()
    .map_err(|error| storage_error(action, error))
}

pub fn find_uploaded_file(app: &AppHandle, file_id: i64) -> Result<Option<UploadedFileRecord>, String> {
  let (connection, _) = open_connection(app)?;
  load_uploaded_file_by_id(&connection, file_id, "load uploaded file")
}

fn find_uploaded_file_by_hash(connection: &Connection, file_hash: &str) -> Result<Option<UploadedFileRecord>, String> {
  connection
    .query_row(SELECT_UPLOADED_FILE_BY_HASH_SQL, [file_hash], row_to_uploaded_file)
    .optional()
    .map_err(|error| storage_error("query duplicate uploaded file", error))
}

pub fn import_excel_file(app: &AppHandle, input: ImportExcelInput) -> Result<UploadedFileRecord, String> {
  let (connection, paths) = open_connection(app)?;
  let file_hash = compute_sha256_hex(&input.bytes);

  if let Some(existing) = find_uploaded_file_by_hash(&connection, &file_hash)? {
    return Ok(existing);
  }

  persist_uploaded_file_record(
    &connection,
    &paths,
    input.file_name,
    input.last_modified,
    input.bytes,
    file_hash,
  )
}

pub fn import_generated_workbook(
  app: &AppHandle,
  file_name: String,
  bytes: Vec<u8>,
  file_hash: String,
) -> Result<UploadedFileRecord, String> {
  let (connection, paths) = open_connection(app)?;
  persist_uploaded_file_record(&connection, &paths, file_name, None, bytes, file_hash)
}

pub fn remove_uploaded_file(
  app: &AppHandle,
  file_id: i64,
) -> Result<(Option<UploadedFileRecord>, Option<String>), String> {
  let (connection, paths) = open_connection(app)?;
  let file = load_uploaded_file_by_id(&connection, file_id, "load uploaded file")?;

  let Some(file) = file else {
    return Ok((None, None));
  };

  let mut cleanup_warning = None;
  let file_path = PathBuf::from(&file.file_path);
  if file_path.starts_with(&paths.uploads_dir) && file_path.exists() {
    if let Err(error) = fs::remove_file(&file_path) {
      cleanup_warning = Some(error.to_string());
    }
  }

  connection
    .execute("DELETE FROM uploaded_files WHERE id = ?1", [file_id])
    .map_err(|error| storage_error("delete uploaded file metadata", error))?;

  Ok((Some(file), cleanup_warning))
}

pub fn get_settings(app: &AppHandle) -> Result<DdlSettings, String> {
  let (connection, _) = open_connection(app)?;
  let raw = connection
    .query_row("SELECT settings_json FROM app_settings WHERE id = 1", [], |row| row.get::<_, String>(0))
    .optional()
    .map_err(|error| storage_error("read settings", error))?;

  match raw {
    Some(json) => serde_json::from_str::<DdlSettings>(&json).map_err(|error| storage_error("decode stored settings", error)),
    None => Ok(DdlSettings::default()),
  }
}

pub fn update_settings(app: &AppHandle, settings: &DdlSettings) -> Result<DdlSettings, String> {
  let (connection, _) = open_connection(app)?;
  let payload = serde_json::to_string(settings)
    .map_err(|error| storage_error("encode settings", error))?;
  let updated_at = now_iso_string();

  connection
    .execute(
      "
      INSERT INTO app_settings (id, settings_json, updated_at)
      VALUES (1, ?1, ?2)
      ON CONFLICT(id) DO UPDATE SET
        settings_json = excluded.settings_json,
        updated_at = excluded.updated_at
      ",
      params![payload, updated_at],
    )
    .map_err(|error| storage_error("persist settings", error))?;

  Ok(settings.clone())
}

pub fn get_runtime_diagnostics(app: &AppHandle) -> Result<RuntimeDiagnostics, String> {
  let (connection, paths) = open_connection(app)?;
  let app_data_dir = paths
    .db_path
    .parent()
    .map(PathBuf::from)
    .ok_or_else(|| APP_DATA_DIR_DERIVE_MESSAGE.to_string())?;

  let uploaded_file_count = count_uploaded_files(&connection)?;
  let settings_row_count = count_rows(&connection, "app_settings", "count settings rows")?;

  Ok(RuntimeDiagnostics {
    runtime: "tauri".into(),
    app_data_dir: app_data_dir.to_string_lossy().to_string(),
    uploads_dir: paths.uploads_dir.to_string_lossy().to_string(),
    db_path: paths.db_path.to_string_lossy().to_string(),
    db_exists: paths.db_path.exists(),
    uploaded_file_count,
    settings_row_count,
  })
}

// ──────────────────────────────────────────────
// スキーマ差分関連のストレージ操作
// ──────────────────────────────────────────────

/// 差分結果を保存する
pub fn save_diff(
  app: &AppHandle,
  diff_id: &str,
  new_file_id: i64,
  old_file_id: i64,
  scope: &str,
  sheet_name: Option<&str>,
  diff_json: &str,
) -> Result<(), String> {
  let (connection, _) = open_connection(app)?;
  connection
    .execute(
      "INSERT OR REPLACE INTO schema_diffs (id, new_file_id, old_file_id, scope, sheet_name, diff_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      params![diff_id, new_file_id, old_file_id, scope, sheet_name, diff_json, now_iso_string()],
    )
    .map_err(|error| storage_error("save schema diff", error))?;
  Ok(())
}

/// 差分IDで差分JSONを取得する
pub fn get_diff_by_id(app: &AppHandle, diff_id: &str) -> Result<Option<String>, String> {
  let (connection, _) = open_connection(app)?;
  connection
    .query_row(
      "SELECT diff_json FROM schema_diffs WHERE id = ?1",
      [diff_id],
      |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|error| storage_error("load schema diff by id", error))
}

/// リネーム判定を一括置換する
/// decisions: Vec<(entity_type, entity_key, decision, confidence)>
pub fn replace_rename_decisions(
  app: &AppHandle,
  diff_id: &str,
  decisions: &[(String, String, String, f64)],
) -> Result<(), String> {
  let (connection, _) = open_connection(app)?;
  connection
    .execute(
      "DELETE FROM diff_rename_decisions WHERE diff_id = ?1",
      [diff_id],
    )
    .map_err(|error| storage_error("clear rename decisions", error))?;

  let mut stmt = connection
    .prepare(
      "INSERT OR REPLACE INTO diff_rename_decisions (diff_id, entity_type, entity_key, decision, confidence)
       VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .map_err(|error| storage_error("prepare rename decision insert", error))?;

  for (entity_type, entity_key, decision, confidence) in decisions {
    stmt
      .execute(params![diff_id, entity_type, entity_key, decision, confidence])
      .map_err(|error| storage_error("insert rename decision", error))?;
  }
  Ok(())
}

/// リネーム判定を取得する
/// 戻り値: Vec<(entity_type, entity_key, decision)>
pub fn get_rename_decisions(
  app: &AppHandle,
  diff_id: &str,
) -> Result<Vec<(String, String, String)>, String> {
  let (connection, _) = open_connection(app)?;
  let mut stmt = connection
    .prepare(
      "SELECT entity_type, entity_key, decision FROM diff_rename_decisions WHERE diff_id = ?1",
    )
    .map_err(|error| storage_error("prepare rename decision query", error))?;

  let rows = stmt
    .query_map([diff_id], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
      ))
    })
    .map_err(|error| storage_error("query rename decisions", error))?;

  let mut results = Vec::new();
  for row in rows {
    results.push(decode_row(row, "decode rename decision row")?);
  }
  Ok(results)
}

/// アップロード済みファイルのサマリ一覧を取得する
/// 戻り値: Vec<(id, original_name, uploaded_at)>
pub fn list_uploaded_file_summaries(
  app: &AppHandle,
) -> Result<Vec<(i64, String, Option<String>)>, String> {
  let (connection, _) = open_connection(app)?;
  let mut stmt = connection
    .prepare("SELECT id, original_name, uploaded_at FROM uploaded_files ORDER BY id DESC")
    .map_err(|error| storage_error("prepare uploaded file summary query", error))?;

  let rows = stmt
    .query_map([], |row| {
      Ok((
        row.get::<_, i64>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, Option<String>>(2)?,
      ))
    })
    .map_err(|error| storage_error("query uploaded file summaries", error))?;

  let mut results = Vec::new();
  for row in rows {
    results.push(decode_row(row, "decode uploaded file summary row")?);
  }
  Ok(results)
}

// ──────────────────────────────────────────────
// 物理名修正プランのストレージ操作
// ──────────────────────────────────────────────

/// 名前修正プランをDBに保存する
pub fn save_name_fix_plan(
  app: &AppHandle,
  plan_id: &str,
  file_id: i64,
  sheet_name: &str,
  plan_json: &str,
) -> Result<(), String> {
  let (connection, _) = open_connection(app)?;
  connection
    .execute(
      "INSERT OR REPLACE INTO name_fix_plans (id, file_id, sheet_name, plan_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)",
      params![plan_id, file_id, sheet_name, plan_json, now_iso_string()],
    )
    .map_err(|error| storage_error("save name fix plan", error))?;
  Ok(())
}

/// プランIDで名前修正プランを取得する
/// 戻り値: Some((file_id, sheet_name, plan_json))
pub fn get_name_fix_plan(
  app: &AppHandle,
  plan_id: &str,
) -> Result<Option<(i64, String, String)>, String> {
  let (connection, _) = open_connection(app)?;
  connection
    .query_row(
      "SELECT file_id, sheet_name, plan_json FROM name_fix_plans WHERE id = ?1",
      [plan_id],
      |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
    )
    .optional()
    .map_err(|error| storage_error("load name fix plan by id", error))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::models::DdlSettings;

  // インメモリ SQLite 接続を作成し、スキーマを初期化するヘルパー
  fn in_memory_connection() -> Connection {
    let conn = Connection::open_in_memory().expect("in-memory connection should open");
    initialize_schema(&conn).expect("schema should initialize");
    conn
  }

  // Phase-1 検収テスト: ファイル名サニタイズ
  #[test]
  fn sanitize_file_name_preserves_normal_filename() {
    assert_eq!(sanitize_file_name("workbook.xlsx"), "workbook.xlsx");
    assert_eq!(sanitize_file_name("my-database-def.xlsx"), "my-database-def.xlsx");
  }

  #[test]
  fn sanitize_file_name_replaces_forbidden_chars() {
    let result = sanitize_file_name("file:with*forbidden?chars.xlsx");
    assert!(!result.contains(':'), "colon must be replaced");
    assert!(!result.contains('*'), "asterisk must be replaced");
    assert!(!result.contains('?'), "question mark must be replaced");
    assert!(result.ends_with(".xlsx"), "extension must be preserved");
  }

  #[test]
  fn sanitize_file_name_returns_default_for_blank_input() {
    assert_eq!(sanitize_file_name(""), DEFAULT_WORKBOOK_FILE_NAME);
    assert_eq!(sanitize_file_name("   "), DEFAULT_WORKBOOK_FILE_NAME);
  }

  // Phase-1 検収テスト: 一時アップロードファイル名の正規化
  #[test]
  fn normalize_temp_upload_name_extracts_original_name() {
    // 形式: <8桁16進>_<タイムスタンプ>_<元ファイル名>
    let result = normalize_temp_upload_name("abc12345_1773000000000_database-def.xlsx");
    assert_eq!(result, Some("database-def.xlsx".to_string()));
  }

  #[test]
  fn normalize_temp_upload_name_rejects_invalid_format() {
    assert_eq!(normalize_temp_upload_name("plain-filename.xlsx"), None);
    assert_eq!(normalize_temp_upload_name(""), None);
    // タイムスタンプが数字でない場合は無効
    assert_eq!(normalize_temp_upload_name("abc12345_not_a_timestamp_file.xlsx"), None);
  }

  // Phase-1 検収テスト: SHA-256 ハッシュ計算
  #[test]
  fn compute_sha256_hex_returns_64_char_string() {
    let hash = compute_sha256_hex(b"hello world");
    assert_eq!(hash.len(), 64, "SHA-256 hex string must be 64 characters");
    assert!(hash.chars().all(|c| c.is_ascii_hexdigit()), "hash must be hex");
  }

  #[test]
  fn compute_sha256_hex_is_deterministic() {
    let hash1 = compute_sha256_hex(b"test data");
    let hash2 = compute_sha256_hex(b"test data");
    assert_eq!(hash1, hash2, "same input must produce same hash");
  }

  #[test]
  fn compute_sha256_hex_differs_for_different_inputs() {
    let hash1 = compute_sha256_hex(b"data A");
    let hash2 = compute_sha256_hex(b"data B");
    assert_ne!(hash1, hash2, "different inputs must produce different hashes");
  }

  // Phase-1 検収テスト: DBスキーマ初期化
  #[test]
  fn schema_creates_uploaded_files_table() {
    let conn = in_memory_connection();
    let count: i64 = conn
      .query_row("SELECT COUNT(*) FROM uploaded_files", [], |row| row.get(0))
      .expect("uploaded_files table must exist after schema init");
    assert_eq!(count, 0, "table should start empty");
  }

  #[test]
  fn schema_creates_app_settings_table() {
    let conn = in_memory_connection();
    let count: i64 = conn
      .query_row("SELECT COUNT(*) FROM app_settings", [], |row| row.get(0))
      .expect("app_settings table must exist after schema init");
    assert_eq!(count, 0, "settings should start empty");
  }

  // Phase-1 検収テスト: 設定の読み書き（AppHandle なしでの SQL 直接テスト）
  #[test]
  fn settings_round_trip_via_sql() {
    let conn = in_memory_connection();
    // author_name は String 型（Option ではない）、dialect フィールドは存在しない
    let settings = DdlSettings {
      author_name: "テスト太郎".into(),
      mysql_engine: "InnoDB".into(),
      ..DdlSettings::default()
    };

    // 設定を INSERT する
    let payload = serde_json::to_string(&settings).expect("settings should serialize");
    conn
      .execute(
        "INSERT INTO app_settings (id, settings_json, updated_at) VALUES (1, ?1, '2026-01-01T00:00:00Z')",
        [&payload],
      )
      .expect("settings insert should succeed");

    // 設定を SELECT して復元する
    let raw: String = conn
      .query_row("SELECT settings_json FROM app_settings WHERE id = 1", [], |row| row.get(0))
      .expect("settings should be readable");
    let restored: DdlSettings =
      serde_json::from_str(&raw).expect("stored settings should deserialize");

    assert_eq!(restored.author_name, "テスト太郎");
    assert_eq!(restored.mysql_engine, "InnoDB");
  }

  #[test]
  fn settings_upsert_replaces_existing_value() {
    let conn = in_memory_connection();

    // 初回挿入（author_name = "初期ユーザー"）
    let first = DdlSettings {
      author_name: "初期ユーザー".into(),
      ..DdlSettings::default()
    };
    let first_json = serde_json::to_string(&first).expect("serialize");
    conn
      .execute(
        "INSERT INTO app_settings (id, settings_json, updated_at) VALUES (1, ?1, '2026-01-01T00:00:00Z')",
        [&first_json],
      )
      .expect("initial insert should succeed");

    // UPSERT で上書き（author_name = "更新ユーザー"）
    let second = DdlSettings {
      author_name: "更新ユーザー".into(),
      ..DdlSettings::default()
    };
    let second_json = serde_json::to_string(&second).expect("serialize");
    conn
      .execute(
        "INSERT INTO app_settings (id, settings_json, updated_at)
         VALUES (1, ?1, '2026-01-02T00:00:00Z')
         ON CONFLICT(id) DO UPDATE SET
           settings_json = excluded.settings_json,
           updated_at = excluded.updated_at",
        [&second_json],
      )
      .expect("upsert should succeed");

    let raw: String = conn
      .query_row("SELECT settings_json FROM app_settings WHERE id = 1", [], |row| row.get(0))
      .expect("settings should be readable after upsert");
    let restored: DdlSettings = serde_json::from_str(&raw).expect("deserialize");
    assert_eq!(restored.author_name, "更新ユーザー", "upsert should overwrite with new value");

    // レコードは 1 行だけであること（重複しないこと）
    let count: i64 = conn
      .query_row("SELECT COUNT(*) FROM app_settings", [], |row| row.get(0))
      .expect("count should succeed");
    assert_eq!(count, 1, "upsert must not create duplicate rows");
  }
}

// ──────────────────────────────────────────────
// DB 接続 CRUD
// ──────────────────────────────────────────────

pub fn list_db_connections(
  app: &AppHandle,
) -> Result<Vec<crate::db_connector::DbConnectionConfig>, String> {
  let (conn, _) = open_connection(app)?;
  let mut stmt = conn
    .prepare("SELECT config_json FROM db_connections ORDER BY created_at ASC")
    .map_err(|e| storage_error("prepare db_connections list", e))?;
  let rows = stmt
    .query_map([], |row| {
      let json: String = row.get(0)?;
      Ok(json)
    })
    .map_err(|e| storage_error("query db_connections", e))?;
  let mut result = Vec::new();
  for json_res in rows {
    let json = decode_row(json_res, "read db_connection row")?;
    let config: crate::db_connector::DbConnectionConfig =
      serde_json::from_str(&json).map_err(|e| storage_error("deserialize db_connection", e))?;
    result.push(config);
  }
  Ok(result)
}

pub fn save_db_connection(
  app: &AppHandle,
  mut config: crate::db_connector::DbConnectionConfig,
) -> Result<crate::db_connector::DbConnectionConfig, String> {
  let (conn, _) = open_connection(app)?;
  if config.id.trim().is_empty() {
    // 新規作成: UUID 相当のランダム ID を生成
    use sha2::Digest;
    let hash = sha2::Sha256::digest(format!("{}{}", config.name, now_iso_string()).as_bytes());
    config.id = format!("{:x}", hash)[..16].to_string();
  }
  let json =
    serde_json::to_string(&config).map_err(|e| storage_error("serialize db_connection", e))?;
  let now = now_iso_string();
  conn
    .execute(
      "INSERT INTO db_connections (id, config_json, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at",
      params![config.id, json, now],
    )
    .map_err(|e| storage_error("upsert db_connection", e))?;
  Ok(config)
}

pub fn delete_db_connection(app: &AppHandle, id: &str) -> Result<(), String> {
  let (conn, _) = open_connection(app)?;
  conn
    .execute("DELETE FROM db_connections WHERE id = ?1", params![id])
    .map_err(|e| storage_error("delete db_connection", e))?;
  Ok(())
}
