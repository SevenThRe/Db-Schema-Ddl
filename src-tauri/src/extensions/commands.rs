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
//   ext_list_all       — builtin + external 統合拡張一覧（V2）
//   ext_set_enabled    — 拡張の有効/無効を永続化
//   ext_get_disabled   — 無効化された拡張 ID リストを返す

use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use super::{ExtensionError, ExtResult};
use super::github::{self, ExtensionCatalog};
use super::lifecycle;
use super::process::{ProcessManager, RunningProcess};
use super::proxy;
use super::registry::{ExtensionRegistry, InstalledExtension};
use crate::builtin_extensions::{self, ExtensionContributes};

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
// 拡張有効/無効状態の永続化ヘルパー
// ──────────────────────────────────────────────

/// {app_data_dir}/extensions_state.json の構造体
/// 無効リストのみ保持し、デフォルト（全有効）を暗黙に表現する
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ExtensionsState {
    #[serde(default)]
    disabled_extensions: Vec<String>,
}

/// extensions_state.json のパスを返す
fn extensions_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("extensions_state.json"))
}

/// extensions_state.json を読み込む。ファイルが存在しない場合はデフォルト値を返す
fn read_extensions_state(app: &AppHandle) -> Result<ExtensionsState, String> {
    let path = extensions_state_path(app)?;
    if !path.exists() {
        return Ok(ExtensionsState::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

/// ExtensionsState を extensions_state.json へ書き込む
fn write_extensions_state(app: &AppHandle, state: &ExtensionsState) -> Result<(), String> {
    let path = extensions_state_path(app)?;
    // 親ディレクトリが存在しない場合に備えて作成する
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
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

// ──────────────────────────────────────────────
// V2 統合拡張一覧
// ──────────────────────────────────────────────

/// フロントエンドへ返す統合マニフェスト（builtin/external 共通）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionManifestV2 {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub kind: String,
    pub category: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
    pub contributes: ExtensionContributes,
    #[serde(default)]
    pub input_formats: Vec<String>,
    #[serde(default)]
    pub output_formats: Vec<String>,
}

/// フロントエンドへ返す解決済み拡張状態
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedExtensionState {
    pub manifest: ExtensionManifestV2,
    pub enabled: bool,
    pub stage: Option<String>,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub error: Option<String>,
}

/// builtin + external を統合した拡張一覧を返す
#[tauri::command]
pub async fn ext_list_all(
    app: AppHandle,
    manager: State<'_, ExtManagerState>,
) -> Result<Vec<ResolvedExtensionState>, String> {
    // 永続化済みの無効リストを先に読み込む（ファイル不在時は空リスト）
    let ext_state = read_extensions_state(&app)?;
    let disabled_set: std::collections::HashSet<&str> =
        ext_state.disabled_extensions.iter().map(String::as_str).collect();

    let mut results: Vec<ResolvedExtensionState> = Vec::new();

    // 1. Builtin 拡張
    for b in builtin_extensions::get_builtin_extensions() {
        // 無効リストに含まれている場合は enabled=false にする
        let enabled = !disabled_set.contains(b.id.as_str());
        results.push(ResolvedExtensionState {
            manifest: ExtensionManifestV2 {
                id: b.id,
                name: b.name,
                version: b.version,
                description: b.description,
                kind: b.kind,
                category: serde_json::to_value(&b.category)
                    .ok()
                    .and_then(|v| v.as_str().map(String::from))
                    .unwrap_or_else(|| "Utility".to_string()),
                capabilities: b.capabilities,
                contributes: b.contributes,
                input_formats: b.input_formats,
                output_formats: b.output_formats,
            },
            enabled,
            stage: None,
            pid: None,
            port: None,
            error: None,
        });
    }

    // 2. External インストール済み拡張
    let dir = app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    if let Ok(installed_list) = ExtensionRegistry::new(&dir).list() {
        for ext in installed_list {
            let enabled = !disabled_set.contains(ext.manifest.id.as_str());
            let running = manager.get_running(&ext.manifest.id).await;
            results.push(ResolvedExtensionState {
                manifest: ExtensionManifestV2 {
                    id: ext.manifest.id.clone(),
                    name: ext.manifest.name,
                    version: ext.manifest.version,
                    description: ext.manifest.description,
                    kind: "external".to_string(),
                    category: "Utility".to_string(),
                    capabilities: ext.manifest.capabilities,
                    contributes: ext.manifest.contributes.unwrap_or_default(),
                    input_formats: vec![],
                    output_formats: vec![],
                },
                enabled,
                stage: if running.is_some() { Some("running".to_string()) } else { Some("installed".to_string()) },
                pid: running.as_ref().map(|r| r.pid),
                port: running.as_ref().map(|r| r.port),
                error: None,
            });
        }
    }

    Ok(results)
}

// ──────────────────────────────────────────────
// 拡張有効/無効切り替えコマンド
// ──────────────────────────────────────────────

/// 指定した拡張の有効/無効状態を永続化する
///
/// enabled=false → disabled_extensions リストへ追加
/// enabled=true  → disabled_extensions リストから除去
#[tauri::command]
pub async fn ext_set_enabled(app: AppHandle, id: String, enabled: bool) -> Result<(), String> {
    let mut state = read_extensions_state(&app)?;

    if enabled {
        // 有効化: 無効リストから除去する
        state.disabled_extensions.retain(|existing| existing != &id);
    } else {
        // 無効化: 重複追加を防ぎながら無効リストへ追加する
        if !state.disabled_extensions.contains(&id) {
            state.disabled_extensions.push(id);
        }
    }

    write_extensions_state(&app, &state)
}

/// 現在無効化されている拡張 ID のリストを返す
#[tauri::command]
pub async fn ext_get_disabled(app: AppHandle) -> Result<Vec<String>, String> {
    let state = read_extensions_state(&app)?;
    Ok(state.disabled_extensions)
}
