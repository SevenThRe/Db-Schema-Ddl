import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain, app } from 'electron';

/**
 * 自動更新の初期化
 * GitHub Releases をベースにした自動更新機能を設定
 */
export function initAutoUpdater(mainWindow: BrowserWindow) {
  // 自動ダウンロードを有効化
  autoUpdater.autoDownload = true;

  // アプリケーション終了時に自動インストール
  autoUpdater.autoInstallOnAppQuit = true;

  // ログ出力
  autoUpdater.logger = {
    info: (msg) => console.log('[AutoUpdater]', msg),
    warn: (msg) => console.warn('[AutoUpdater]', msg),
    error: (msg) => console.error('[AutoUpdater]', msg),
    debug: (msg) => console.debug('[AutoUpdater]', msg),
  };

  /**
   * 新しいバージョンが利用可能になった際のハンドラー
   */
  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  /**
   * 最新バージョンである場合のハンドラー
   */
  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available. Current version:', info.version);
  });

  /**
   * ダウンロード進捗状況のハンドラー
   */
  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('download-progress', {
      percent: Math.round(progressObj.percent),
    });
  });

  /**
   * ダウンロード完了時のハンドラー
   */
  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    mainWindow.webContents.send('update-downloaded', {
      version: info.version,
    });
  });

  /**
   * エラーハンドラー
   */
  autoUpdater.on('error', (err) => {
    console.error('AutoUpdater error:', err);
  });

  /**
   * レンダラープロセスからのインストール要求ハンドラー
   */
  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  /**
   * 起動時に更新をチェック
   */
  setTimeout(() => {
    checkForUpdates();
  }, 3000);

  /**
   * 30分ごとに更新をチェック
   */
  setInterval(() => {
    checkForUpdates();
  }, 30 * 60 * 1000);
}

/**
 * 更新チェックを実行
 */
async function checkForUpdates() {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('Failed to check for updates:', err);
  }
}
