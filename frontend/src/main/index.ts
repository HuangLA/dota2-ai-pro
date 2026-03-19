import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { ChildProcess, spawn } from 'child_process';
import http from 'http';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const BACKEND_PORT = 8000;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

// ─── Resource paths ───────────────────────────────────────────────
function getResourcePath(...segments: string[]): string {
  if (isDev) {
    // Development: paths relative to project root
    return path.join(__dirname, '..', '..', '..', ...segments);
  }
  // Production: resources are in the app's resource directory
  return path.join(process.resourcesPath, ...segments);
}

// ─── Backend lifecycle ────────────────────────────────────────────
function getBackendExePath(): string {
  if (isDev) {
    return path.join(__dirname, '..', '..', '..', 'backend', 'dist', 'truesight-backend', 'truesight-backend.exe');
  }
  return path.join(process.resourcesPath, 'backend', 'truesight-backend.exe');
}

function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const exePath = getBackendExePath();
    const backendDataDir = path.join(app.getPath('userData'), 'backend-data');

    console.log(`Starting backend: ${exePath}`);
    console.log(`Backend data dir: ${backendDataDir}`);

    // Set environment variables for the backend
    const env = {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(BACKEND_PORT),
      DEBUG: 'false',
      // Override data paths to use app's user data directory
      DATABASE_PATH: path.join(backendDataDir, 'truesight.db'),
      MATCHES_DIR: path.join(backendDataDir, 'matches'),
      REPLAYS_DIR: path.join(backendDataDir, 'replays'),
      LOGS_DIR: path.join(backendDataDir, 'logs'),
      // Java/Parser paths for the bundled JDK
      JAVA_HOME: getResourcePath('jdk'),
      PARSER_JAR_PATH: getResourcePath('parser', 'clarity-parser-1.0.0-uber.jar'),
    };

    backendProcess = spawn(exePath, [], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    backendProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`[backend] ${data.toString().trim()}`);
    });

    backendProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[backend:err] ${data.toString().trim()}`);
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend:', err);
      reject(err);
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`Backend exited: code=${code}, signal=${signal}`);
      backendProcess = null;
    });

    // Poll the health endpoint until the backend is ready
    const startTime = Date.now();
    const timeout = 30000; // 30s max wait
    const pollInterval = 500;

    const poll = () => {
      if (Date.now() - startTime > timeout) {
        reject(new Error('Backend failed to start within 30 seconds'));
        return;
      }

      const req = http.get(`${BACKEND_URL}/health`, (res) => {
        if (res.statusCode === 200) {
          console.log('Backend is ready!');
          resolve();
        } else {
          setTimeout(poll, pollInterval);
        }
      });
      req.on('error', () => {
        setTimeout(poll, pollInterval);
      });
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(poll, pollInterval);
      });
    };

    // Give the backend a moment to start before first poll
    setTimeout(poll, 1000);
  });
}

function stopBackend(): void {
  if (backendProcess && !backendProcess.killed) {
    console.log('Stopping backend...');
    // On Windows, we need to kill the process tree
    if (process.platform === 'win32' && backendProcess.pid) {
      spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'], {
        windowsHide: true,
      });
    } else {
      backendProcess.kill('SIGTERM');
    }
    backendProcess = null;
  }
}

// ─── Window creation ──────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#1a1a2e',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    icon: isDev
      ? path.join(__dirname, '../../src/assets/icon.ico')
      : path.join(process.resourcesPath, 'icon.ico'),
    show: false,
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Show window when ready (with fallback timeout)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Fallback: show window after 5s even if ready-to-show hasn't fired
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 5000);

  // Log renderer errors for debugging
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`Failed to load: ${errorCode} - ${errorDescription}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App lifecycle ────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Start backend first (unless in dev mode where it's started separately)
  if (!isDev) {
    try {
      await startBackend();
    } catch (err) {
      console.error('Failed to start backend:', err);
      // Still create the window - the user can see error messages in the UI
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('will-quit', () => {
  stopBackend();
});

// ─── IPC handlers ─────────────────────────────────────────────────
ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-backend-url', () => {
  return BACKEND_URL;
});
