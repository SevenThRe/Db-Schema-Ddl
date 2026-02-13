import { contextBridge, ipcRenderer } from 'electron';

/**
 * レンダラープロセスに公開する Electron API
 * セキュリティのため contextBridge を使用して限定的な API のみ公開
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 新しいバージョンが利用可能になった際のコールバック登録
   */
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },

  /**
   * アップデートのダウンロードが完了した際のコールバック登録
   */
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },

  /**
   * ダウンロード進捗状況のコールバック登録
   */
  onDownloadProgress: (callback: (progress: { percent: number }) => void) => {
    ipcRenderer.on('download-progress', (_event, progress) => callback(progress));
  },

  /**
   * アップデートのインストールとアプリケーションの再起動
   */
  installUpdate: () => {
    ipcRenderer.send('install-update');
  },

  /**
   * 現在のアプリケーションバージョンを取得
   */
  getAppVersion: async (): Promise<string> => {
    return await ipcRenderer.invoke('get-app-version');
  },
});
