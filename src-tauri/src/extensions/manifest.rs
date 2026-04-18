// 拡張マニフェスト解析・検証
//
// manifest.json はインストール ZIP のルートに必須。
// 読み込み後に Capability・プラットフォーム・バージョンの整合性を検証する。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

use super::{ExtResult, ExtensionError};
use crate::builtin_extensions::{ExtensionContributes, UiBundle};

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
    #[serde(default)]
    pub entry: Option<HashMap<String, String>>,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub ui_bundle: Option<UiBundle>,
    /// V2/V3: 拡張が宣言する Contribution（activityBar / sidebarViews / workbenchViews と legacy navigation / workspacePanels）
    #[serde(default)]
    pub contributes: Option<ExtensionContributes>,
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

        let platform = current_platform();
        let has_ui_bundle = self.ui_bundle.is_some();
        let has_current_platform_entry = self
            .entry
            .as_ref()
            .and_then(|entry| entry.get(platform))
            .is_some();
        if !has_current_platform_entry && !has_ui_bundle {
            return Err(ExtensionError::UnsupportedPlatform(platform.to_string()));
        }

        if self.entry.as_ref().map(|entry| entry.is_empty()).unwrap_or(true) && !has_ui_bundle {
            return Err(ExtensionError::InvalidManifest(
                "拡張は entry または uiBundle の少なくとも一方を宣言する必要があります".into(),
            ));
        }

        // API バージョンのサポート確認
        const SUPPORTED_API_VERSION: u32 = 1;
        if self.api_version != SUPPORTED_API_VERSION {
            return Err(ExtensionError::InvalidManifest(
                format!("非サポート api_version: {} (サポート: {})", self.api_version, SUPPORTED_API_VERSION),
            ));
        }

        if let Some(bundle) = &self.ui_bundle {
            if bundle.mode != "iframe" {
                return Err(ExtensionError::InvalidManifest(
                    format!("非サポート uiBundle.mode: {}", bundle.mode),
                ));
            }
        }

        Ok(())
    }

    /// 現在プラットフォームのエントリーポイントファイル名を取得
    pub fn entry_for_current_platform(&self) -> ExtResult<Option<&str>> {
        Ok(self
            .entry
            .as_ref()
            .and_then(|entry| entry.get(current_platform()))
            .map(|s| s.as_str()))
    }
}
