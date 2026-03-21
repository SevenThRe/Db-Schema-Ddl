// GitHub Release からカタログ取得・ZIPダウンロード・SHA256 検証

use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::path::Path;

use super::{ExtResult, ExtensionError};
use super::manifest::current_platform;

const GITHUB_API_BASE: &str = "https://api.github.com";
/// 拡張機能のリリースリポジトリ
const EXTENSIONS_REPO: &str = "SevenThRe/Db-Schema-Ddl-Extensions";

// ──────────────────────────────────────────────
// GitHub API レスポンス
// ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    published_at: String,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

// ──────────────────────────────────────────────
// カタログ情報（フロントエンドへ返す）
// ──────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct ExtensionCatalog {
    pub latest_version: String,
    pub release_notes: String,
    pub download_url: String,
    pub sha256_url: String,
    pub size_bytes: u64,
    pub published_at: String,
    pub update_available: bool,
}

// ──────────────────────────────────────────────
// GitHub から最新カタログを取得
// ──────────────────────────────────────────────

pub async fn fetch_catalog(
    extension_id: &str,
    installed_version: Option<&str>,
) -> ExtResult<ExtensionCatalog> {
    let url = format!(
        "{}/repos/{}/releases/latest",
        GITHUB_API_BASE, EXTENSIONS_REPO
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "Db-Schema-DDL")
        .send()
        .await
        .map_err(|e| ExtensionError::Network(e.to_string()))?;

    if !response.status().is_success() {
        return Err(ExtensionError::Network(format!(
            "GitHub API エラー: HTTP {}",
            response.status()
        )));
    }

    let release: GithubRelease = response
        .json()
        .await
        .map_err(|e| ExtensionError::Network(e.to_string()))?;

    let platform = current_platform();
    // アセット名: {extension-id}-{version}-{platform}.zip
    let asset_name = format!("{}-{}-{}.zip", extension_id, &release.tag_name.trim_start_matches('v'), platform);
    let sha256_name = format!("{}.sha256", asset_name);

    let asset = release.assets.iter().find(|a| a.name == asset_name)
        .ok_or_else(|| ExtensionError::UnsupportedPlatform(platform.to_string()))?;

    let sha256_asset = release.assets.iter().find(|a| a.name == sha256_name);

    let update_available = installed_version
        .map(|v| v != release.tag_name.trim_start_matches('v'))
        .unwrap_or(true);

    Ok(ExtensionCatalog {
        latest_version: release.tag_name.trim_start_matches('v').to_string(),
        release_notes: release.body.unwrap_or_default(),
        download_url: asset.browser_download_url.clone(),
        sha256_url: sha256_asset.map(|a| a.browser_download_url.clone()).unwrap_or_default(),
        size_bytes: asset.size,
        published_at: release.published_at,
        update_available,
    })
}

// ──────────────────────────────────────────────
// ZIP ダウンロード + SHA256 検証
// ──────────────────────────────────────────────

/// ZIP をダウンロードして dest_path に保存、SHA256 を検証する
pub async fn download_and_verify(
    download_url: &str,
    sha256_url: &str,
    dest_path: &Path,
    progress_tx: Option<tokio::sync::mpsc::Sender<u8>>,
) -> ExtResult<()> {
    let client = reqwest::Client::new();

    // SHA256 ハッシュを取得（存在する場合）
    let expected_hash = if !sha256_url.is_empty() {
        let resp = client
            .get(sha256_url)
            .send()
            .await
            .map_err(|e| ExtensionError::Network(e.to_string()))?;
        Some(resp.text().await.map_err(|e| ExtensionError::Network(e.to_string()))?)
    } else {
        None
    };

    // ファイルをダウンロード
    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| ExtensionError::Network(e.to_string()))?;

    let total = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut hasher = Sha256::new();
    let mut buf = Vec::new();

    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| ExtensionError::Network(e.to_string()))?;
        hasher.update(&chunk);
        buf.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;

        // 進捗通知
        if let Some(tx) = &progress_tx {
            if total > 0 {
                let percent = (downloaded * 100 / total) as u8;
                let _ = tx.try_send(percent);
            }
        }
    }

    // SHA256 検証
    if let Some(expected) = expected_hash {
        let actual = format!("{:x}", hasher.finalize());
        let expected_clean = expected.split_whitespace().next().unwrap_or("").to_lowercase();
        if !expected_clean.is_empty() && actual != expected_clean {
            return Err(ExtensionError::ChecksumMismatch);
        }
    }

    std::fs::write(dest_path, &buf).map_err(ExtensionError::Io)?;
    Ok(())
}
