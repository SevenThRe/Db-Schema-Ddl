import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import net from 'net';
import { initAutoUpdater } from './updater';

let mainWindow: BrowserWindow | null = null;
let serverPort: number;

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
  if (isDev) {
    process.env.UPLOADS_DIR = path.join(app.getAppPath(), 'uploads');
    process.env.RESOURCES_PATH = path.join(app.getAppPath(), 'attached_assets');
  } else {
    // パッケージ化された環境では userData ディレクトリを使用
    process.env.UPLOADS_DIR = path.join(app.getPath('userData'), 'uploads');
    process.env.RESOURCES_PATH = path.join(process.resourcesPath, 'attached_assets');
  }

  // Express サーバーをロード
  const serverPath = path.join(app.getAppPath(), 'dist', 'index.cjs');
  require(serverPath);

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
  });

  // Express サーバーにアクセス
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  // 開発環境では DevTools を開く
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

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
    console.error('Failed to initialize application:', err);
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
 * IPC ハンドラーの登録
 */
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
