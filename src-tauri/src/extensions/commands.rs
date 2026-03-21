// 拡張機能 Tauri コマンド群
//
// フロントエンドから `invoke("ext_*")` で呼び出されるエントリーポイント。
// ProcessManager は Tauri managed state として lib.rs で登録される。
//
// 登録コマンド一覧:
//   ext_list           — インストール済み拡張の一覧
//   ext_get            — 指定拡張の詳細
//   ext_fetch_catalog  — GitHub Release から最新バージョン情報を取得
//   ext_install        — GitHub Release からインストール
//   ext_uninstall      — アンインストール（実行中なら先に停止）
//   ext_start          — サイドカー起動
//   ext_stop           — サイドカー停止
//   ext_health         — サイドカーのヘルスチェック
//   ext_call           — サイドカーへの RPC 呼び出し

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Manager, State};

use super::{ExtensionError, ExtResult};
use super::github::{self, ExtensionCatalog};
use super::lifecycle;
use super::process::{ProcessManager, RunningProcess};
use super::proxy;
use super::registry::{ExtensionRegistry, InstalledExtension};

// ──────────────────────────────────────────────
// Managed State 型エイリアス
// ──────────────────────────────────────────────

/// lib.rs で `app.manage(Arc::new(ProcessManager::new(&dir)))` する型
pub type ExtManagerState = Arc<ProcessManager>;

// ──────────────────────────────────────────────
// 補助関数
// ──────────────────────────────────────────────

fn app_data_dir(app: &AppHandle) -> ExtResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|e| ExtensionError::Internal(e.to_string()))
}

// ──────────────────────────────────────────────
// コマンド
// ──────────────────────────────────────────────

/// インストール済み拡張の一覧を返す
#[tauri::command]
pub async fn ext_list(app: AppHandle) -> Result<Vec<InstalledExtension>, ExtensionError> {
    let dir = app_data_dir(&app)?;
    ExtensionRegistry::new(&dir).list()
}

/// 指定した拡張の詳細を返す
#[tauri::command]
pub async fn ext_get(app: AppHandle, id: String) -> Result<InstalledExtension, ExtensionError> {
    let dir = app_data_dir(&app)?;
    ExtensionRegistry::new(&dir).get(&id)
}

/// GitHub Release から最新カタログ情報（バージョン・ダウンロード URL など）を取得する
#[tauri::command]
pub async fn ext_fetch_catalog(
    id: String,
    installed_version: Option<String>,
) -> Result<ExtensionCatalog, ExtensionError> {
    github::fetch_catalog(&id, installed_version.as_deref()).await
}

/// 拡張機能を GitHub Release からダウンロードしてインストールする
/// progress はフロントエンドへの Tauri イベントで通知する（TODO: Phase 3）
#[tauri::command]
pub async fn ext_install(
    app: AppHandle,
    id: String,
) -> Result<InstalledExtension, ExtensionError> {
    let dir = app_data_dir(&app)?;
    lifecycle::install(&id, &dir, None).await
}

/// 拡張機能をアンインストールする（実行中の場合は先に停止する）
#[tauri::command]
pub async fn ext_uninstall(
    app: AppHandle,
    id: String,
    manager: State<'_, ExtManagerState>,
) -> Result<(), ExtensionError> {
    // 実行中プロセスがあれば先に停止
    if manager.get_running(&id).await.is_some() {
        manager.stop(&id).await?;
    }
    let dir = app_data_dir(&app)?;
    lifecycle::uninstall(&id, &dir)
}

/// サイドカーを起動する。既に起動済みであれば現在の RunningProcess を返す
#[tauri::command]
pub async fn ext_start(
    id: String,
    manager: State<'_, ExtManagerState>,
) -> Result<RunningProcess, ExtensionError> {
    manager.start(&id).await
}

/// サイドカーを停止（強制終了）する
#[tauri::command]
pub async fn ext_stop(
    id: String,
    manager: State<'_, ExtManagerState>,
) -> Result<(), ExtensionError> {
    manager.stop(&id).await
}

/// サイドカーの /health エンドポイントを叩いて生死確認する
#[tauri::command]
pub async fn ext_health(
    id: String,
    manager: State<'_, ExtManagerState>,
) -> Result<bool, ExtensionError> {
    Ok(manager.health_check(&id).await)
}

/// サイドカーへ RPC 呼び出しを転送し、結果を JSON で返す
#[tauri::command]
pub async fn ext_call(
    id: String,
    method: String,
    params: serde_json::Value,
    manager: State<'_, ExtManagerState>,
) -> Result<serde_json::Value, ExtensionError> {
    proxy::ext_call(&manager, &id, &method, params).await
}
