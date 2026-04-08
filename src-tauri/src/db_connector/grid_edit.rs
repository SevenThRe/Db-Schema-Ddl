use tauri::AppHandle;

use super::{
  DbGridCommitRequest, DbGridCommitResponse, DbGridPrepareCommitRequest,
  DbGridPrepareCommitResponse,
};

const PLACEHOLDER_ERROR: &str = "Grid editing is wired but backend mutation logic is not implemented yet.";

#[tauri::command]
pub async fn db_grid_prepare_commit(
  _app: AppHandle,
  _request: DbGridPrepareCommitRequest,
) -> Result<DbGridPrepareCommitResponse, String> {
  Err(PLACEHOLDER_ERROR.to_string())
}

#[tauri::command]
pub async fn db_grid_commit(
  _app: AppHandle,
  _request: DbGridCommitRequest,
) -> Result<DbGridCommitResponse, String> {
  Err(PLACEHOLDER_ERROR.to_string())
}
