/**
 * Electron API の型定義
 * preload.ts で contextBridge 経由で公開される API の型
 */

export interface ElectronAPI {
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => void;
  onDownloadProgress: (callback: (progress: { percent: number }) => void) => void;
  installUpdate: () => void;
  startDownload: () => void;
  getAppVersion: () => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  selectExcelFile: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}