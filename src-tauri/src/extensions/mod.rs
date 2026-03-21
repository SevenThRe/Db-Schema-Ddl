// 拡張機能システム — Tauri Sidecar 方式
//
// アーキテクチャ:
//   manifest  → 拡張マニフェスト解析・検証
//   registry  → インストール済み拡張の永続管理
//   github    → GitHub Release からカタログ取得・ダウンロード
//   lifecycle → インストール/アンインストール/更新のステートマシン
//   process   → Sidecar 子プロセス起動・停止・ヘルスチェック
//   proxy     → ext_call を HTTP に変換して Sidecar に転送
//   commands  → Tauri invoke エントリーポイント

pub mod commands;
pub mod github;
pub mod lifecycle;
pub mod manifest;
pub mod process;
pub mod proxy;
pub mod registry;

pub use commands::ExtManagerState;

// ──────────────────────────────────────────────
// 共通エラー型
// ──────────────────────────────────────────────

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ExtensionError {
    #[error("拡張機能が見つかりません: {0}")]
    NotFound(String),

    #[error("拡張機能はすでにインストール済みです: {0}")]
    AlreadyInstalled(String),

    #[error("拡張機能が実行中ではありません: {0}")]
    NotRunning(String),

    #[error("マニフェスト解析エラー: {0}")]
    InvalidManifest(String),

    #[error("SHA256 検証失敗 — ファイルが破損している可能性があります")]
    ChecksumMismatch,

    #[error("プラットフォーム非対応: {0}")]
    UnsupportedPlatform(String),

    #[error("Sidecar 起動タイムアウト")]
    StartupTimeout,

    #[error("ネットワークエラー: {0}")]
    Network(String),

    #[error("IO エラー: {0}")]
    Io(#[from] std::io::Error),

    #[error("内部エラー: {0}")]
    Internal(String),
}

// Tauri コマンドから返せるよう Serialize を実装
impl serde::Serialize for ExtensionError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type ExtResult<T> = Result<T, ExtensionError>;
