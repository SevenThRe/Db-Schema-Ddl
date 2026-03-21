// 拡張ライフサイクル — インストール・アンインストール・解凍
//
// 状態遷移: not_installed → downloading → verifying → installed
// インストール先: {app_data}/extensions/{id}/
// ZIP 解凍後に manifest.json を検証してから registry に登録する。

use std::path::{Path, PathBuf};

use super::{ExtResult, ExtensionError};
use super::github;
use super::manifest::ExtensionManifest;
use super::registry::{ExtensionRegistry, InstalledExtension};

// ──────────────────────────────────────────────
// インストール
// ──────────────────────────────────────────────

/// 拡張機能を GitHub Release からインストールする
///
/// progress_tx: ダウンロード進捗 0-100 を送るチャンネル（省略可）
pub async fn install(
    extension_id: &str,
    app_data_dir: &Path,
    progress_tx: Option<tokio::sync::mpsc::Sender<u8>>,
) -> ExtResult<InstalledExtension> {
    let registry = ExtensionRegistry::new(app_data_dir);

    if registry.is_installed(extension_id) {
        return Err(ExtensionError::AlreadyInstalled(extension_id.to_string()));
    }

    // カタログ取得
    let catalog = github::fetch_catalog(extension_id, None).await?;

    // ZIP を一時ファイルにダウンロード + SHA256 検証
    let tmp_path = app_data_dir.join(format!("_tmp_{}.zip", extension_id));
    github::download_and_verify(
        &catalog.download_url,
        &catalog.sha256_url,
        &tmp_path,
        progress_tx,
    )
    .await?;

    // ZIP を拡張ディレクトリに展開
    let ext_dir = registry.extension_dir(extension_id);
    std::fs::create_dir_all(&ext_dir).map_err(ExtensionError::Io)?;

    let unzip_result = unzip_to(&tmp_path, &ext_dir);
    // 一時ファイルはエラーでも必ず削除
    let _ = std::fs::remove_file(&tmp_path);
    unzip_result?;

    // マニフェスト検証
    let manifest = ExtensionManifest::load_from_dir(&ext_dir)?;

    // エントリーポイントの実在確認
    let entry_file = manifest.entry_for_current_platform()?;
    let entry_path = ext_dir.join(entry_file);
    if !entry_path.exists() {
        return Err(ExtensionError::InvalidManifest(format!(
            "エントリーポイントが存在しません: {}",
            entry_path.display()
        )));
    }

    // レジストリ登録
    let installed = registry.register(manifest, entry_path)?;
    Ok(installed)
}

// ──────────────────────────────────────────────
// アンインストール
// ──────────────────────────────────────────────

/// 拡張機能をレジストリ・ファイルごと削除する
/// プロセスの停止は呼び出し元（commands.rs）で行う。
pub fn uninstall(extension_id: &str, app_data_dir: &Path) -> ExtResult<()> {
    let registry = ExtensionRegistry::new(app_data_dir);
    registry.unregister(extension_id)
}

// ──────────────────────────────────────────────
// ZIP 展開
// ──────────────────────────────────────────────

/// ZIP ファイルを dest_dir に展開する
///
/// セキュリティ: entry.enclosed_name() を使い、パストラバーサルを防止する。
fn unzip_to(zip_path: &Path, dest_dir: &Path) -> ExtResult<()> {
    let file = std::fs::File::open(zip_path).map_err(ExtensionError::Io)?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| ExtensionError::Internal(e.to_string()))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| ExtensionError::Internal(e.to_string()))?;

        // パストラバーサル防止: enclosed_name() は "../" を含むパスを None にする
        let entry_dest: PathBuf = match entry.enclosed_name() {
            Some(p) => dest_dir.join(p),
            None => continue,
        };

        if entry.is_dir() {
            std::fs::create_dir_all(&entry_dest).map_err(ExtensionError::Io)?;
        } else {
            if let Some(parent) = entry_dest.parent() {
                std::fs::create_dir_all(parent).map_err(ExtensionError::Io)?;
            }
            let mut out = std::fs::File::create(&entry_dest).map_err(ExtensionError::Io)?;
            std::io::copy(&mut entry, &mut out).map_err(ExtensionError::Io)?;
        }

        // Unix のみ: マニフェスト記載の実行権限をファイルに反映する
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = entry.unix_mode() {
                std::fs::set_permissions(
                    &entry_dest,
                    std::fs::Permissions::from_mode(mode),
                )
                .map_err(ExtensionError::Io)?;
            }
        }
    }

    Ok(())
}
