// 拡張マニフェスト解析・検証
//
// manifest.json はインストール ZIP のルートに必須。
// 読み込み後に Capability・プラットフォーム・バージョンの整合性を検証する。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

use super::{ExtResult, ExtensionError};

// ──────────────────────────────────────────────
// Manifest データ構造
// ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub api_version: u32,
    pub publisher: String,
    pub description: String,
    #[serde(default)]
    pub release_notes: Option<String>,
    #[serde(default)]
    pub min_host_version: Option<String>,
    /// プラットフォーム → エントリーポイントファイル名
    pub entry: HashMap<String, String>,
    #[serde(default)]
    pub capabilities: Vec<String>,
}

// ──────────────────────────────────────────────
// サポートプラットフォーム検出
// ──────────────────────────────────────────────

pub fn current_platform() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    return "win32-x64";
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return "darwin-x64";
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return "darwin-arm64";
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return "linux-x64";
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "linux", target_arch = "x86_64"),
    )))]
    return "unknown";
}

// ──────────────────────────────────────────────
// Manifest 読み込み・検証
// ──────────────────────────────────────────────

impl ExtensionManifest {
    /// ZIP 展開後のディレクトリから manifest.json を読み込む
    pub fn load_from_dir(dir: &Path) -> ExtResult<Self> {
        let path = dir.join("manifest.json");
        let content = std::fs::read_to_string(&path)
            .map_err(|_| ExtensionError::InvalidManifest("manifest.json が見つかりません".into()))?;

        let manifest: ExtensionManifest = serde_json::from_str(&content)
            .map_err(|e| ExtensionError::InvalidManifest(e.to_string()))?;

        manifest.validate()?;
        Ok(manifest)
    }

    /// バリデーション（ID フォーマット・プラットフォーム・api_version）
    pub fn validate(&self) -> ExtResult<()> {
        // ID は英小文字・数字・ハイフンのみ
        if !self.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
            return Err(ExtensionError::InvalidManifest(
                format!("不正な拡張 ID: {}", self.id),
            ));
        }

        // 現在のプラットフォームのエントリーポイントが存在するか
        let platform = current_platform();
        if !self.entry.contains_key(platform) {
            return Err(ExtensionError::UnsupportedPlatform(platform.to_string()));
        }

        // API バージョンのサポート確認
        const SUPPORTED_API_VERSION: u32 = 1;
        if self.api_version != SUPPORTED_API_VERSION {
            return Err(ExtensionError::InvalidManifest(
                format!("非サポート api_version: {} (サポート: {})", self.api_version, SUPPORTED_API_VERSION),
            ));
        }

        Ok(())
    }

    /// 現在プラットフォームのエントリーポイントファイル名を取得
    pub fn entry_for_current_platform(&self) -> ExtResult<&str> {
        self.entry
            .get(current_platform())
            .map(|s| s.as_str())
            .ok_or_else(|| ExtensionError::UnsupportedPlatform(current_platform().to_string()))
    }
}
