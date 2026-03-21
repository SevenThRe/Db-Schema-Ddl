// Sidecar プロセス管理
//
// 起動プロトコル:
//   1. entry_path を子プロセスとして spawn
//   2. stdout から "READY port=<N>" を読み取るまで待機（タイムアウト 15 秒）
//   3. RunningProcess { pid, port } を返す
//
// 停止: SIGKILL / TerminateProcess で強制終了

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use super::{ExtResult, ExtensionError};
use super::registry::ExtensionRegistry;

// ──────────────────────────────────────────────
// 定数
// ──────────────────────────────────────────────

/// サイドカー起動タイムアウト（秒）
const STARTUP_TIMEOUT_SECS: u64 = 15;
/// ヘルスチェック HTTP タイムアウト（ミリ秒）
const HEALTH_TIMEOUT_MS: u64 = 3_000;

// ──────────────────────────────────────────────
// 公開型
// ──────────────────────────────────────────────

/// 実行中プロセスの識別情報（フロントエンドへ返す）
#[derive(Debug, Clone, serde::Serialize)]
pub struct RunningProcess {
    pub pid: u32,
    pub port: u16,
}

// ──────────────────────────────────────────────
// 内部型
// ──────────────────────────────────────────────

struct ProcessEntry {
    info: RunningProcess,
    child: Child,
}

// ──────────────────────────────────────────────
// ProcessManager
// ──────────────────────────────────────────────

/// Tauri managed state として登録されるプロセス管理器
/// Arc<ProcessManager> で shared、内部は Mutex で保護する。
pub struct ProcessManager {
    app_data_dir: std::path::PathBuf,
    processes: Arc<Mutex<HashMap<String, ProcessEntry>>>,
}

// ProcessManager は Arc に包まれ Tauri の managed state になるため
// Send + Sync が必要。Child は Send だが !Sync なので Arc<Mutex<...>> で保護する。
unsafe impl Send for ProcessManager {}
unsafe impl Sync for ProcessManager {}

impl ProcessManager {
    pub fn new(app_data_dir: &Path) -> Self {
        Self {
            app_data_dir: app_data_dir.to_path_buf(),
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    // ── 起動 ──────────────────────────────────

    /// 拡張機能のサイドカーを起動し、READY を受信するまで待機する
    pub async fn start(&self, extension_id: &str) -> ExtResult<RunningProcess> {
        let mut procs = self.processes.lock().await;

        // 既に起動済みの場合はそのまま返す
        if let Some(entry) = procs.get(extension_id) {
            return Ok(entry.info.clone());
        }

        // レジストリからエントリーポイントを取得
        let registry = ExtensionRegistry::new(&self.app_data_dir);
        let installed = registry.get(extension_id)?;

        // サイドカーを spawn
        let mut child = Command::new(&installed.entry_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(false) // ManualDrop で管理
            .spawn()
            .map_err(ExtensionError::Io)?;

        let pid = child.id().unwrap_or(0);
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| ExtensionError::Internal("stdout を取得できませんでした".into()))?;

        // "READY port=<N>" を STARTUP_TIMEOUT_SECS 秒以内に受信
        let port = tokio::time::timeout(
            std::time::Duration::from_secs(STARTUP_TIMEOUT_SECS),
            read_ready_port(stdout),
        )
        .await
        .map_err(|_| ExtensionError::StartupTimeout)??;

        let info = RunningProcess { pid, port };
        procs.insert(extension_id.to_string(), ProcessEntry { info: info.clone(), child });

        Ok(info)
    }

    // ── 停止 ──────────────────────────────────

    /// サイドカーを強制終了してエントリを削除する
    pub async fn stop(&self, extension_id: &str) -> ExtResult<()> {
        let mut procs = self.processes.lock().await;
        match procs.remove(extension_id) {
            Some(mut entry) => {
                // プロセスを強制終了（エラーは無視: 既に終了している場合がある）
                let _ = entry.child.kill().await;
                Ok(())
            }
            None => Err(ExtensionError::NotRunning(extension_id.to_string())),
        }
    }

    // ── 照会 ──────────────────────────────────

    /// 指定拡張が実行中であれば RunningProcess を返す
    pub async fn get_running(&self, extension_id: &str) -> Option<RunningProcess> {
        let procs = self.processes.lock().await;
        procs.get(extension_id).map(|e| e.info.clone())
    }

    /// 実行中拡張の一覧を返す
    pub async fn list_running(&self) -> HashMap<String, RunningProcess> {
        let procs = self.processes.lock().await;
        procs.iter().map(|(k, v)| (k.clone(), v.info.clone())).collect()
    }

    // ── ヘルスチェック ──────────────────────────

    /// GET /health が 2xx を返せば true
    pub async fn health_check(&self, extension_id: &str) -> bool {
        let Some(proc) = self.get_running(extension_id).await else {
            return false;
        };
        let client = reqwest::Client::new();
        client
            .get(format!("http://127.0.0.1:{}/health", proc.port))
            .timeout(std::time::Duration::from_millis(HEALTH_TIMEOUT_MS))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}

// ──────────────────────────────────────────────
// 内部ユーティリティ
// ──────────────────────────────────────────────

/// stdout を行単位で読み "READY port=<N>" を探してポート番号を返す
async fn read_ready_port(stdout: tokio::process::ChildStdout) -> ExtResult<u16> {
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    while let Some(line) = lines.next_line().await.map_err(ExtensionError::Io)? {
        // プロトコル仕様: "READY port=<port>" （先頭・末尾の空白は無視）
        if let Some(rest) = line.trim().strip_prefix("READY port=") {
            if let Ok(port) = rest.trim().parse::<u16>() {
                return Ok(port);
            }
        }
    }

    Err(ExtensionError::Internal(
        "サイドカーが READY を送信せずに stdout を閉じました".into(),
    ))
}
