// 拡張レジストリ — インストール済み拡張の永続管理
//
// {app_data}/extensions/{id}/ 以下を読み書きする。
// DB は使わず JSON ファイルで管理（拡張自体が SQLite を持つ場合があるため分離）。

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::{ExtResult, ExtensionError};
use super::manifest::ExtensionManifest;

// ──────────────────────────────────────────────
// インストール済み拡張のメタデータ
// ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledExtension {
    pub manifest: ExtensionManifest,
    /// インストール日時 (ISO 8601)
    pub installed_at: String,
    /// エントリーポイントの絶対パス
    pub entry_path: PathBuf,
}

// ──────────────────────────────────────────────
// レジストリ
// ──────────────────────────────────────────────

pub struct ExtensionRegistry {
    /// {app_data}/extensions/
    base_dir: PathBuf,
}

impl ExtensionRegistry {
    pub fn new(app_data_dir: &Path) -> Self {
        Self {
            base_dir: app_data_dir.join("extensions"),
        }
    }

    /// 拡張のインストールディレクトリを返す
    pub fn extension_dir(&self, id: &str) -> PathBuf {
        self.base_dir.join(id)
    }

    /// インストール済み拡張を全件返す
    pub fn list(&self) -> ExtResult<Vec<InstalledExtension>> {
        if !self.base_dir.exists() {
            return Ok(vec![]);
        }

        let mut results = vec![];
        for entry in std::fs::read_dir(&self.base_dir).map_err(ExtensionError::Io)? {
            let entry = entry.map_err(ExtensionError::Io)?;
            if entry.file_type().map_err(ExtensionError::Io)?.is_dir() {
                if let Ok(ext) = self.load_one(&entry.path()) {
                    results.push(ext);
                }
            }
        }
        Ok(results)
    }

    /// 特定の拡張を読み込む
    pub fn get(&self, id: &str) -> ExtResult<InstalledExtension> {
        let dir = self.extension_dir(id);
        if !dir.exists() {
            return Err(ExtensionError::NotFound(id.to_string()));
        }
        self.load_one(&dir)
    }

    /// 拡張がインストール済みか確認
    pub fn is_installed(&self, id: &str) -> bool {
        self.extension_dir(id).exists()
    }

    /// 拡張をレジストリに登録（インストール後に呼ぶ）
    pub fn register(&self, manifest: ExtensionManifest, entry_path: PathBuf) -> ExtResult<InstalledExtension> {
        let now = chrono::Utc::now().to_rfc3339();
        let ext = InstalledExtension {
            manifest,
            installed_at: now,
            entry_path,
        };

        let dir = self.extension_dir(&ext.manifest.id);
        std::fs::create_dir_all(&dir).map_err(ExtensionError::Io)?;

        let meta_path = dir.join("installed.json");
        let json = serde_json::to_string_pretty(&ext)
            .map_err(|e| ExtensionError::Internal(e.to_string()))?;
        std::fs::write(&meta_path, json).map_err(ExtensionError::Io)?;

        Ok(ext)
    }

    /// 拡張をレジストリから削除（ファイルごと削除）
    pub fn unregister(&self, id: &str) -> ExtResult<()> {
        let dir = self.extension_dir(id);
        if !dir.exists() {
            return Err(ExtensionError::NotFound(id.to_string()));
        }
        std::fs::remove_dir_all(&dir).map_err(ExtensionError::Io)?;
        Ok(())
    }

    // ── プライベート ──

    fn load_one(&self, dir: &Path) -> ExtResult<InstalledExtension> {
        let meta_path = dir.join("installed.json");
        let content = std::fs::read_to_string(&meta_path)
            .map_err(|_| ExtensionError::Internal(format!("installed.json が読めません: {:?}", dir)))?;
        serde_json::from_str(&content)
            .map_err(|e| ExtensionError::Internal(e.to_string()))
    }
}
