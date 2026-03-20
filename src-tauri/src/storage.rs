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

fn compute_sha256_hex(bytes: &[u8]) -> String {
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
