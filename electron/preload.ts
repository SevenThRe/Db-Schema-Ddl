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
    const listener = (_event: unknown, info: { version: string; releaseDate: string }) => {
      callback(info);
    };
    ipcRenderer.on('update-available', listener);
    return () => ipcRenderer.removeListener('update-available', listener);
  },

  /**
   * アップデートのダウンロードが完了した際のコールバック登録
   */
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const listener = (_event: unknown, info: { version: string }) => {
      callback(info);
    };
    ipcRenderer.on('update-downloaded', listener);
    return () => ipcRenderer.removeListener('update-downloaded', listener);
  },

  /**
   * ダウンロード進捗状況のコールバック登録
   */
  onDownloadProgress: (callback: (progress: { percent: number }) => void) => {
    const listener = (_event: unknown, progress: { percent: number }) => {
      callback(progress);
    };
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },

  /**
   * アップデート処理失敗時のコールバック登録
   */
  onUpdateError: (callback: (error: { message: string }) => void) => {
    const listener = (_event: unknown, error: { message: string }) => {
      callback(error);
    };
    ipcRenderer.on('update-error', listener);
    return () => ipcRenderer.removeListener('update-error', listener);
  },

  /**
   * 更新不要（最新）時のコールバック登録
   */
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => {
    const listener = (_event: unknown, info: { version: string }) => {
      callback(info);
    };
    ipcRenderer.on('update-not-available', listener);
    return () => ipcRenderer.removeListener('update-not-available', listener);
  },

  /**
   * アップデートのインストールとアプリケーションの再起動
   */
  installUpdate: () => {
    ipcRenderer.send('install-update');
  },

  /**
   * アップデートのダウンロードを開始
   */
  startDownload: () => {
    ipcRenderer.send('start-download');
  },

  /**
   * 手動で更新チェックを実行
   */
  checkForUpdates: async (): Promise<{
    ok: boolean;
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
    message?: string;
  }> => {
    return await ipcRenderer.invoke('check-for-updates');
  },

  /**
   * 現在のアプリケーションバージョンを取得
   */
  getAppVersion: async (): Promise<string> => {
    return await ipcRenderer.invoke('get-app-version');
  },

  /**
   * ディレクトリ選択ダイアログを開く
   */
  selectDirectory: async (): Promise<string | null> => {
    return await ipcRenderer.invoke('select-directory');
  },

  /**
   * Excel ファイル選択ダイアログを開く
   */
  selectExcelFile: async (): Promise<string | null> => {
    return await ipcRenderer.invoke('select-excel-file');
  },

  /**
   * 外部ドキュメントを既定ブラウザで開く
   */
  openExternal: async (url: string): Promise<boolean> => {
    return await ipcRenderer.invoke('open-external', url);
  },

  extensions: {
    getInstallContext: async (extensionId: string) => {
      return await ipcRenderer.invoke("extensions:get-install-context", extensionId);
    },
    openInstallFlow: async (extensionId: string) => {
      return await ipcRenderer.invoke("extensions:open-install-flow", extensionId);
    },
    getCatalog: async (extensionId: string, force?: boolean) => {
      return await ipcRenderer.invoke("extensions:get-catalog", extensionId, force);
    },
    startInstall: async (extensionId: string) => {
      return await ipcRenderer.invoke("extensions:start-install", extensionId);
    },
    getLifecycleState: async (extensionId: string) => {
      return await ipcRenderer.invoke("extensions:get-lifecycle-state", extensionId);
    },
    uninstall: async (extensionId: string) => {
      return await ipcRenderer.invoke("extensions:uninstall", extensionId);
    },
    activate: async (extensionId: string) => {
      return await ipcRenderer.invoke("extensions:activate", extensionId);
    },
  },
});
