import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { initAutoUpdater } from './updater';
import type { Server } from 'http';

let mainWindow: BrowserWindow | null = null;
let serverPort: number;
let httpServer: Server | null = null;
let isShuttingDown = false;
let activeSockets = new Set<any>();

const bootstrapLogPath = path.join(os.tmpdir(), 'dbschemaexcel2ddl-bootstrap.log');

function writeBootstrapLog(message: string) {
  try {
    fs.appendFileSync(
      bootstrapLogPath,
      `[${new Date().toISOString()}] ${message}\n`,
      'utf8',
    );
  } catch {
    // Ignore logging errors to avoid blocking startup
  }
}

function stringifyError(err: unknown) {
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  return String(err);
}

if (!app || typeof app.whenReady !== 'function') {
  const runAsNodeFlag = process.env.ELECTRON_RUN_AS_NODE ?? '(unset)';
  writeBootstrapLog(
    `Electron API unavailable. ELECTRON_RUN_AS_NODE=${runAsNodeFlag}, execPath=${process.execPath}`,
  );

  if (process.env.ELECTRON_RUN_AS_NODE === '1') {
    try {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(process.execPath, [], {
        detached: true,
        stdio: 'ignore',
        env,
      });
      child.unref();
      writeBootstrapLog('Relaunch requested after removing ELECTRON_RUN_AS_NODE.');
    } catch (err) {
      const message = err instanceof Error ? err.stack ?? err.message : String(err);
      writeBootstrapLog(`Relaunch failed: ${message}`);
    }
  }

  process.exit(0);
}

/**
 * 空きポートを検索
 * Electronアプリケーションで使用する空きポートを動的に検索する
 */
async function findAvailablePort(startPort: number = 5000): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      // ポートが使用中の場合、次のポートを試行
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

/**
 * サーバーの起動待機
 * Express サーバーが起動するまでポーリングで待機
 */
async function waitForServer(port: number, maxRetries: number = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/files/list`);
      if (response.ok || response.status === 401) {
        return true;
      }
    } catch (err) {
      // サーバーが起動していない場合、500ms待機して再試行
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return false;
}

/**
 * Express サーバーの起動
 * dist/index.cjs をロードして Express サーバーを内部起動
 */
async function startExpressServer() {
  // 空きポートを検索
  serverPort = await findAvailablePort(5000);

  // 環境変数を設定
  process.env.PORT = serverPort.toString();
  process.env.NODE_ENV = 'production';
  process.env.ELECTRON_MODE = 'true';

  // Electronアプリケーションのリソースディレクトリを設定
  const isDev = !app.isPackaged;
  const serverDistDir = path.join(app.getAppPath(), 'dist');
  const unpackedWorkerPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'dist',
    'excel-worker.cjs',
  );
  const packagedWorkerPath = path.join(serverDistDir, 'excel-worker.cjs');

  process.env.SERVER_DIST_DIR = serverDistDir;
  process.env.EXCEL_WORKER_PATH = fs.existsSync(unpackedWorkerPath)
    ? unpackedWorkerPath
    : packagedWorkerPath;

  if (isDev) {
    process.env.UPLOADS_DIR = path.join(app.getAppPath(), 'uploads');
    process.env.RESOURCES_PATH = path.join(app.getAppPath(), 'attached_assets');
    process.env.DB_PATH = path.join(app.getAppPath(), 'data');
  } else {
    // パッケージ化された環境では userData ディレクトリを使用
    process.env.UPLOADS_DIR = path.join(app.getPath('userData'), 'uploads');
    process.env.RESOURCES_PATH = path.join(process.resourcesPath, 'attached_assets');
    process.env.DB_PATH = path.join(app.getPath('userData'), 'data');
  }

  console.log('Electron environment:');
  console.log('  UPLOADS_DIR:', process.env.UPLOADS_DIR);
  console.log('  DB_PATH:', process.env.DB_PATH);

  // Express サーバーをロード
  const serverPath = path.join(serverDistDir, 'index.cjs');
  const serverModule = require(serverPath);

  // httpServer インスタンスを保存（クリーンアップ用）
  httpServer = serverModule.httpServer;

  if (!httpServer) {
    throw new Error('httpServer instance not found in server module');
  }

  // すべてのソケット接続を追跡して強制終了できるようにする
  httpServer.on('connection', (socket) => {
    activeSockets.add(socket);
    socket.on('close', () => {
      activeSockets.delete(socket);
    });
  });

  // サーバーが起動するまで待機
  const serverReady = await waitForServer(serverPort);
  if (!serverReady) {
    throw new Error('Failed to start Express server');
  }

  console.log(`Express server started on port ${serverPort}`);
}

/**
 * BrowserWindow の作成
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(app.getAppPath(), 'dist', 'public', 'favicon.ico'),
    autoHideMenuBar: true, // 隐藏菜单栏
  });

  // 完全移除菜单栏
  mainWindow.setMenuBarVisibility(false);

  // Express サーバーにアクセス
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  // 開発環境では DevTools を開く
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // F12 キーで DevTools を開く（プロダクション環境でもデバッグ可能）
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * アプリケーションの初期化
 */
app.whenReady().then(async () => {
  try {
    // Express サーバーを起動
    await startExpressServer();

    // BrowserWindow を作成
    createWindow();

    // 自動更新の初期化
    if (app.isPackaged) {
      initAutoUpdater(mainWindow!);
    }
  } catch (err) {
    const errorText = stringifyError(err);
    console.error('Failed to initialize application:', err);
    writeBootstrapLog(`Initialization failed: ${errorText}`);
    try {
      dialog.showErrorBox('Startup failed', errorText);
    } catch {
      // ignore dialog failure
    }
    app.quit();
  }

  app.on('activate', () => {
    // macOS でドックアイコンがクリックされた場合、ウィンドウを再作成
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * 全ウィンドウが閉じられた際の処理
 */
app.on('window-all-closed', () => {
  // macOS 以外ではアプリケーションを終了
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * アプリケーション終了前のクリーンアップ
 * Express サーバーを適切にシャットダウン
 */
app.on('before-quit', async (event) => {
  if (httpServer && !isShuttingDown) {
    event.preventDefault(); // 終了を一時停止
    isShuttingDown = true;

    console.log('Shutting down Express server...');

    // データベース接続をクローズ
    try {
      const serverPath = path.join(app.getAppPath(), 'dist', 'index.cjs');
      const serverModule = require(serverPath);
      if (serverModule.cleanup) {
        await serverModule.cleanup();
      }
    } catch (err) {
      console.error('Error closing database:', err);
    }

    // すべてのアクティブなソケット接続を強制終了
    console.log(`Closing ${activeSockets.size} active connections...`);
    activeSockets.forEach(socket => {
      socket.destroy();
    });
    activeSockets.clear();

    // サーバーを閉じる
    httpServer.close(() => {
      console.log('Express server stopped');
      httpServer = null;
      app.quit(); // サーバー停止後にアプリを終了
    });

    // タイムアウト設定（3秒以内にサーバーが停止しない場合は強制終了）
    setTimeout(() => {
      if (httpServer) {
        console.warn('Server shutdown timeout, forcing quit');
        httpServer = null;
        app.quit();
      }
    }, 3000);
  }
});

/**
 * IPC ハンドラーの登録
 */
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ディレクトリ選択ダイアログ
ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'フォルダを選択',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// ファイル選択ダイアログ（Excel ファイル）
ipcMain.handle('select-excel-file', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Excel ファイルを選択',
    filters: [
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
      { name: 'All Files', extensions: ['*'] }
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});
