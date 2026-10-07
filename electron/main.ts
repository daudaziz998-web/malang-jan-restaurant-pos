import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { autoUpdater } from 'electron-updater';
import { startServer } from '../server.ts';
import { resolveDataDir, getDatabasePath } from '../server/db.ts';
import { spawn } from 'child_process';
import {
  checkGitHubReleases,
  downloadFileWithProgress,
  getPackageVersion,
  getPackageRepoInfo,
  compareSemver,
} from '../server/updater.ts';

// Configure Persistent Data Directory before anything else
process.env.IS_ELECTRON = 'true';
const userDataPath = app.getPath('userData');
process.env.APP_DATA_DIR = userDataPath;

const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
let downloadedPortablePath: string | null = null;
let downloadedSetupPath: string | null = null;

let mainWindow: BrowserWindow | null = null;
let serverInstance: any = null;
let serverPort = 3000;

// Single Instance Lock
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

async function getAvailablePort(preferredPort = 3000): Promise<number> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => {
        const randomTester = net
          .createServer()
          .once('listening', () => {
            const address = randomTester.address();
            const freePort = typeof address === 'object' && address ? address.port : 3001;
            randomTester.close(() => resolve(freePort));
          })
          .listen(0, '127.0.0.1');
      })
      .once('listening', () => {
        tester.close(() => resolve(preferredPort));
      })
      .listen(preferredPort, '127.0.0.1');
  });
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template: any[] = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Print Receipt (Ctrl+P)',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('trigger-print');
              mainWindow.webContents.print({ silent: false, printBackground: true });
            }
          },
        },
        {
          label: 'Open Database Folder',
          click: () => {
            const dbDir = resolveDataDir();
            shell.openPath(dbDir);
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('trigger-check-updates');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Contact Developer (daudaziz998@gmail.com)',
          click: () => {
            shell.openExternal('mailto:daudaziz998@gmail.com?subject=MALANG%20JAN%20RESTURANT%20POS%20Inquiry');
          },
        },
        {
          label: 'About MALANG JAN RESTURANT POS',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About MALANG JAN RESTURANT POS',
              message: 'MALANG JAN RESTURANT Management & POS',
              detail: `Version: ${app.getVersion()}\nSQLite Database: ${getDatabasePath()}\nData Directory: ${resolveDataDir()}\n\nContact: daudaziz998@gmail.com`,
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function startAppServer(preferredPort = 3000): Promise<{ server: any; port: number }> {
  let targetPort = await getAvailablePort(preferredPort);
  process.env.PORT = String(targetPort);

  if (app.isPackaged) {
    process.env.ELECTRON_PROD = 'true';
    process.env.DIST_PATH = path.join(__dirname);
  }

  try {
    const { server, port } = await startServer(targetPort);
    return { server, port };
  } catch (err: any) {
    console.warn(`Could not bind to port ${targetPort} (${err?.message}). Attempting next available port...`);
    targetPort = await getAvailablePort(targetPort + 1);
    process.env.PORT = String(targetPort);
    const { server, port } = await startServer(targetPort);
    return { server, port };
  }
}

async function createWindow() {
  createApplicationMenu();
  const { server, port } = await startAppServer(3000);
  serverPort = port;
  serverInstance = server;

  const candidateIconPaths = [
    path.join(__dirname, 'icon.ico'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(process.resourcesPath || '', 'build/icon.ico'),
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../public/logo.png'),
  ];

  let appIconPath: string | undefined = undefined;
  for (const p of candidateIconPaths) {
    if (fs.existsSync(p)) {
      appIconPath = p;
      break;
    }
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'MALANG JAN RESTURANT',
    backgroundColor: '#0f172a',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
  });

  if (appIconPath && process.platform === 'win32') {
    try {
      mainWindow.setIcon(appIconPath);
    } catch (_) {}
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  let isWindowShown = false;
  const revealWindow = () => {
    if (mainWindow && !isWindowShown) {
      isWindowShown = true;
      mainWindow.show();
      mainWindow.focus();
    }
  };

  mainWindow.once('ready-to-show', revealWindow);
  mainWindow.webContents.on('did-finish-load', () => {
    revealWindow();
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Page load failed (${errorCode}): ${errorDescription} at ${validatedURL}`);
    revealWindow();
  });

  setTimeout(revealWindow, 2500);

  const appUrl = `http://127.0.0.1:${serverPort}`;
  mainWindow.loadURL(appUrl).catch((err) => {
    console.error('Failed to load application URL in Electron:', err);
    revealWindow();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url);
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-db-location', () => {
  return {
    databasePath: getDatabasePath(),
    dataDir: resolveDataDir(),
  };
});

// Update System State & IPC
interface DesktopUpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  availableVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  setupDownloadUrl?: string;
  portableDownloadUrl?: string;
  isPortable?: boolean;
  isDevMode?: boolean;
  distributionType?: 'setup' | 'portable' | 'web';
  progress?: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  };
  errorMessage?: string;
  errorType?: string;
}

let isCheckingUpdates = false;
let isDownloadingUpdate = false;
let isDirectDownloadFallback = false;

let currentUpdateState: DesktopUpdateState = {
  status: 'idle',
  currentVersion: (app ? app.getVersion() : '') || getPackageVersion(),
  isPortable,
  distributionType: isPortable ? 'portable' : (app.isPackaged ? 'setup' : 'web'),
};

function broadcastUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status-changed', currentUpdateState);
  }
}

function setupAutoUpdater() {
  currentUpdateState.currentVersion = app.getVersion();
  currentUpdateState.isPortable = isPortable;
  currentUpdateState.distributionType = isPortable ? 'portable' : (app.isPackaged ? 'setup' : 'web');

  const repoInfo = getPackageRepoInfo();

  if (app.isPackaged && !isPortable && repoInfo.owner && repoInfo.repo) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    autoUpdater.logger = {
      info: (msg: any) => console.log('[AutoUpdater:Info]', msg),
      warn: (msg: any) => console.warn('[AutoUpdater:Warn]', msg),
      error: (msg: any) => console.error('[AutoUpdater:Error]', msg),
    };

    autoUpdater.setFeedURL({
      provider: 'github',
      owner: repoInfo.owner,
      repo: repoInfo.repo,
    });

    autoUpdater.on('checking-for-update', () => {
      currentUpdateState = {
        ...currentUpdateState,
        status: 'checking',
        errorMessage: undefined,
        errorType: undefined,
      };
      broadcastUpdateState();
    });

    autoUpdater.on('update-available', (info) => {
      isCheckingUpdates = false;
      const repoInfo = getPackageRepoInfo();
      currentUpdateState = {
        ...currentUpdateState,
        status: 'available',
        availableVersion: info.version,
        releaseName: info.releaseName || `Release v${info.version}`,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
        publishedAt: (info as any).releaseDate || undefined,
        setupDownloadUrl: repoInfo.owner && repoInfo.repo ? `https://github.com/${repoInfo.owner}/${repoInfo.repo}/releases/download/v${info.version}/Malang.Jan.Restaurant-Setup-${info.version}.exe` : undefined,
        portableDownloadUrl: repoInfo.owner && repoInfo.repo ? `https://github.com/${repoInfo.owner}/${repoInfo.repo}/releases/download/v${info.version}/Malang.Jan.Restaurant-${info.version}.exe` : undefined,
        downloadUrl: repoInfo.owner && repoInfo.repo ? `https://github.com/${repoInfo.owner}/${repoInfo.repo}/releases/download/v${info.version}/Malang.Jan.Restaurant-Setup-${info.version}.exe` : undefined,
        errorMessage: undefined,
        errorType: undefined,
      };
      broadcastUpdateState();
    });

    autoUpdater.on('update-not-available', (info) => {
      isCheckingUpdates = false;
      currentUpdateState = {
        ...currentUpdateState,
        status: 'not-available',
        availableVersion: undefined,
        errorMessage: undefined,
        errorType: undefined,
      };
      broadcastUpdateState();
    });

    autoUpdater.on('download-progress', (progressObj) => {
      currentUpdateState = {
        ...currentUpdateState,
        status: 'downloading',
        progress: {
          percent: Math.round(progressObj.percent * 10) / 10,
          bytesPerSecond: progressObj.bytesPerSecond,
          transferred: progressObj.transferred,
          total: progressObj.total,
        },
      };
      broadcastUpdateState();
    });

    autoUpdater.on('update-downloaded', (info) => {
      isDownloadingUpdate = false;
      currentUpdateState = {
        ...currentUpdateState,
        status: 'downloaded',
        availableVersion: info.version,
        progress: { percent: 100, bytesPerSecond: 0, transferred: 1, total: 1 },
      };
      broadcastUpdateState();
    });

    autoUpdater.on('error', (err) => {
      console.error('[AutoUpdater] autoUpdater error event:', err?.message || err);
      isCheckingUpdates = false;
      isDownloadingUpdate = false;
    });
  }
}

ipcMain.handle('check-for-updates', async () => {
  if (isCheckingUpdates) {
    return { success: false, error: 'Update check already in progress' };
  }
  if (isDownloadingUpdate) {
    return { success: false, error: 'Download currently in progress' };
  }

  isCheckingUpdates = true;
  isDirectDownloadFallback = false;
  currentUpdateState = {
    ...currentUpdateState,
    status: 'checking',
    errorMessage: undefined,
    errorType: undefined,
  };
  broadcastUpdateState();

  if (!app.isPackaged) {
    isCheckingUpdates = false;
    currentUpdateState = {
      ...currentUpdateState,
      status: 'idle',
      currentVersion: app.getVersion(),
      isDevMode: true,
      errorMessage: undefined,
    };
    broadcastUpdateState();
    return {
      success: true,
      isUpdateAvailable: false,
      isDevMode: true,
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      message: 'Running in development mode.',
    };
  }

  const repoInfo = getPackageRepoInfo();
  if (!repoInfo.owner || !repoInfo.repo) {
    isCheckingUpdates = false;
    currentUpdateState = {
      ...currentUpdateState,
      status: 'error',
      errorMessage: 'Update repository is not configured.',
    };
    broadcastUpdateState();
    return { success: false, error: 'Update repository is not configured.' };
  }

  if (isPortable) {
    try {
      const releaseInfo = await checkGitHubReleases(app.getVersion());
      isCheckingUpdates = false;
      if (releaseInfo.success && releaseInfo.isUpdateAvailable) {
        currentUpdateState = {
          status: 'available',
          currentVersion: app.getVersion(),
          availableVersion: releaseInfo.latestVersion,
          releaseName: releaseInfo.releaseName,
          releaseNotes: releaseInfo.releaseNotes,
          publishedAt: releaseInfo.publishedAt,
          downloadUrl: releaseInfo.portableDownloadUrl || releaseInfo.downloadUrl,
          setupDownloadUrl: releaseInfo.setupDownloadUrl,
          portableDownloadUrl: releaseInfo.portableDownloadUrl,
          isPortable: true,
          distributionType: 'portable',
        };
        broadcastUpdateState();
        return releaseInfo;
      } else if (releaseInfo.success && !releaseInfo.isUpdateAvailable) {
        currentUpdateState = {
          status: 'not-available',
          currentVersion: app.getVersion(),
          availableVersion: undefined,
          isPortable: true,
          distributionType: 'portable',
        };
        broadcastUpdateState();
        return releaseInfo;
      } else {
        currentUpdateState = {
          status: 'error',
          currentVersion: app.getVersion(),
          errorMessage: releaseInfo.error || 'Update failed. Please check your internet connection and try again.',
          errorType: releaseInfo.errorType,
          isPortable: true,
          distributionType: 'portable',
        };
        broadcastUpdateState();
        return { success: false, error: currentUpdateState.errorMessage };
      }
    } catch (err: any) {
      isCheckingUpdates = false;
      currentUpdateState = {
        status: 'error',
        currentVersion: app.getVersion(),
        errorMessage: 'Update failed. Please check your internet connection and try again.',
        errorType: 'offline',
        isPortable: true,
        distributionType: 'portable',
      };
      broadcastUpdateState();
      return { success: false, error: currentUpdateState.errorMessage };
    }
  }

  try {
    const updateCheckResult = await autoUpdater.checkForUpdates();
    isCheckingUpdates = false;
    if (updateCheckResult && updateCheckResult.updateInfo) {
      const info = updateCheckResult.updateInfo;
      const isAvailable = compareSemver(info.version, app.getVersion()) > 0;
      return {
        success: true,
        isUpdateAvailable: isAvailable,
        currentVersion: app.getVersion(),
        latestVersion: info.version,
      };
    }
    return {
      success: true,
      isUpdateAvailable: false,
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
    };
  } catch (err: any) {
    try {
      const fallback = await checkGitHubReleases(app.getVersion());
      if (fallback.success && fallback.isUpdateAvailable) {
        isCheckingUpdates = false;
        isDirectDownloadFallback = true;
        currentUpdateState = {
          status: 'available',
          currentVersion: app.getVersion(),
          availableVersion: fallback.latestVersion,
          releaseName: fallback.releaseName,
          releaseNotes: fallback.releaseNotes,
          publishedAt: fallback.publishedAt,
          downloadUrl: fallback.setupDownloadUrl || fallback.downloadUrl,
          setupDownloadUrl: fallback.setupDownloadUrl,
          portableDownloadUrl: fallback.portableDownloadUrl,
          isPortable: false,
          distributionType: 'setup',
        };
        broadcastUpdateState();
        return fallback;
      } else if (fallback.success && !fallback.isUpdateAvailable) {
        isCheckingUpdates = false;
        currentUpdateState = {
          status: 'not-available',
          currentVersion: app.getVersion(),
          availableVersion: undefined,
          isPortable: false,
          distributionType: 'setup',
        };
        broadcastUpdateState();
        return fallback;
      } else {
        isCheckingUpdates = false;
        let displayError = fallback.error || 'Update failed. Please check your internet connection and try again.';
        currentUpdateState = {
          status: 'error',
          currentVersion: app.getVersion(),
          errorMessage: displayError,
          errorType: fallback.errorType || 'unknown',
          isPortable: false,
          distributionType: 'setup',
        };
        broadcastUpdateState();
        return { success: false, error: displayError, errorType: fallback.errorType };
      }
    } catch (fallbackErr: any) {
      isCheckingUpdates = false;
      currentUpdateState = {
        status: 'error',
        currentVersion: app.getVersion(),
        errorMessage: 'Update failed. Please check your internet connection and try again.',
        errorType: 'offline',
        isPortable: false,
        distributionType: 'setup',
      };
      broadcastUpdateState();
      return { success: false, error: currentUpdateState.errorMessage };
    }
  }
});

ipcMain.handle('start-update-download', async (_event, targetAsset?: 'setup' | 'portable') => {
  if (isDownloadingUpdate) {
    return { success: false, error: 'Update download already in progress' };
  }

  const isPortableTarget = isPortable || targetAsset === 'portable';

  if (app.isPackaged && !isPortableTarget && !isDirectDownloadFallback) {
    try {
      isDownloadingUpdate = true;
      currentUpdateState = {
        ...currentUpdateState,
        status: 'downloading',
        progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 },
      };
      broadcastUpdateState();
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err: any) {
      isDownloadingUpdate = false;
      currentUpdateState = {
        ...currentUpdateState,
        status: 'error',
        errorMessage: 'Update failed. Please check your internet connection and try again.',
        errorType: 'download_failed',
      };
      broadcastUpdateState();
      return { success: false, error: err.message };
    }
  }

  const targetUrl = isPortableTarget
    ? (currentUpdateState.portableDownloadUrl || currentUpdateState.downloadUrl)
    : (currentUpdateState.setupDownloadUrl || currentUpdateState.downloadUrl);

  if (!targetUrl) {
    currentUpdateState = {
      ...currentUpdateState,
      status: 'error',
      errorMessage: 'Download URL for the new version is not available.',
    };
    broadcastUpdateState();
    return { success: false, error: 'Download URL not available' };
  }

  if (app.isPackaged || process.env.IS_ELECTRON) {
    try {
      isDownloadingUpdate = true;
      currentUpdateState = {
        ...currentUpdateState,
        status: 'downloading',
        progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 },
      };
      broadcastUpdateState();

      const newVersion = currentUpdateState.availableVersion || 'latest';
      let targetPath: string;

      if (isPortableTarget) {
        const execDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.env.PORTABLE_EXECUTABLE_FILE || process.cwd());
        targetPath = path.join(execDir, `Malang.Jan.Restaurant-${newVersion}.exe`);
        downloadedPortablePath = targetPath;
      } else {
        const tempDir = path.join(app.getPath('temp'), 'malang-jan-updater');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        targetPath = path.join(tempDir, `Malang.Jan.Restaurant-Setup-${newVersion}.exe`);
        downloadedSetupPath = targetPath;
      }

      await downloadFileWithProgress(targetUrl, targetPath, (progress) => {
        currentUpdateState = {
          ...currentUpdateState,
          status: 'downloading',
          progress,
        };
        broadcastUpdateState();
      });

      isDownloadingUpdate = false;
      currentUpdateState = {
        ...currentUpdateState,
        status: 'downloaded',
        progress: { percent: 100, bytesPerSecond: 0, transferred: 1, total: 1 },
      };
      broadcastUpdateState();
      return { success: true, path: targetPath };
    } catch (err: any) {
      isDownloadingUpdate = false;
      currentUpdateState = {
        ...currentUpdateState,
        status: 'error',
        errorMessage: 'Update failed. Please check your internet connection and try again.',
        errorType: 'download_failed',
      };
      broadcastUpdateState();
      return { success: false, error: err.message };
    }
  }

  isDownloadingUpdate = false;
  return { success: true, message: 'Preview mode completed' };
});

ipcMain.handle('quit-and-install', () => {
  if (isPortable && downloadedPortablePath && fs.existsSync(downloadedPortablePath)) {
    try {
      const child = spawn(downloadedPortablePath, [], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      app.quit();
      return;
    } catch (err: any) {
      dialog.showErrorBox('Failed to launch new version', `Could not launch ${downloadedPortablePath}: ${err.message}`);
      return;
    }
  }

  if (app.isPackaged && !isDirectDownloadFallback) {
    try {
      autoUpdater.quitAndInstall(false, true);
      return;
    } catch (err: any) {
      console.warn('[AutoUpdater] autoUpdater.quitAndInstall threw:', err?.message || err);
    }
  }

  if (downloadedSetupPath && fs.existsSync(downloadedSetupPath)) {
    try {
      const child = spawn(downloadedSetupPath, ['/S'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      app.quit();
      return;
    } catch (err: any) {
      dialog.showErrorBox('Failed to run update installer', `Could not run ${downloadedSetupPath}: ${err.message}`);
      return;
    }
  }

  dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: 'Update Ready (Preview Mode)',
    message: 'In packaged production build, this will seamlessly quit the app, apply the update, and relaunch.',
    detail: `Your database at:\n${getDatabasePath()}\nwill remain 100% preserved.`,
    buttons: ['OK'],
  });
});

ipcMain.handle('get-update-status', () => {
  return currentUpdateState;
});

app.whenReady().then(async () => {
  setupAutoUpdater();
  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (serverInstance) {
      serverInstance.close();
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (serverInstance) {
    try {
      serverInstance.close();
    } catch {}
  }
});
