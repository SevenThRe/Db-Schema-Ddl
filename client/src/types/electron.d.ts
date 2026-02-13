/**
 * Electron API の型定義
 * window.electronAPI の TypeScript 型サポート
 */
export interface ElectronAPI {
  /**
   * 新しいバージョンが利用可能になった際のコールバック登録
   */
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => void;

  /**
   * アップデートのダウンロードが完了した際のコールバック登録
   */
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => void;

  /**
   * ダウンロード進捗状況のコールバック登録
   */
  onDownloadProgress: (callback: (progress: { percent: number }) => void) => void;

  /**
   * アップデートのインストールとアプリケーションの再起動
   */
  installUpdate: () => void;

  /**
   * 現在のアプリケーションバージョンを取得
   */
  getAppVersion: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
