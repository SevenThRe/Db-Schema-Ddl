/**
 * Electron API の型定義
 * preload.ts で contextBridge 経由で公開される API の型
 */
import type { ExtensionCatalogRelease, ExtensionLifecycleState } from "@shared/schema";

export interface ElectronAPI {
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
  onDownloadProgress: (callback: (progress: { percent: number }) => void) => () => void;
  onUpdateError: (callback: (error: { message: string }) => void) => () => void;
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => () => void;
  installUpdate: () => void;
  startDownload: () => void;
  checkForUpdates: () => Promise<{
    ok: boolean;
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseUrl: string;
    message?: string;
  }>;
  getAppVersion: () => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  selectExcelFile: () => Promise<string | null>;
  openExternal: (url: string) => Promise<boolean>;
  extensions: {
    getInstallContext: (extensionId: string) => Promise<{
      extensionId: string;
      extensionsRoot: string;
      installRoot: string;
      releasesUrl: string;
    }>;
    openInstallFlow: (extensionId: string) => Promise<{
      extensionId: string;
      extensionsRoot: string;
      installRoot: string;
      releasesUrl: string;
    }>;
    getCatalog: (extensionId: string, force?: boolean) => Promise<ExtensionCatalogRelease | null>;
    startInstall: (extensionId: string) => Promise<ExtensionLifecycleState | null>;
    getLifecycleState: (extensionId: string) => Promise<ExtensionLifecycleState | null>;
    uninstall: (extensionId: string) => Promise<ExtensionLifecycleState | null>;
    activate: (extensionId: string) => Promise<{
      accepted: boolean;
      restartRequired: boolean;
    }>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
