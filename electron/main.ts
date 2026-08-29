import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { JsonStore } from './store';
import { detectToolchains, runCode, type RunRequest } from './runner';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = join(process.env.APP_ROOT, 'dist');
const PUBLIC_DIR = VITE_DEV_SERVER_URL ? join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

/**
 * The desktop window is a phone.
 *
 * There is one UI now, and it is the phone one: a single layout to design, one
 * set of gestures to keep working, and every screenshot the same shape. So the
 * window is sized and locked to a phone's proportions rather than being a wide
 * desktop frame with a column of phone in the middle of it.
 */
const PHONE_RATIO = 430 / 932;

/**
 * A window saved by an older build — back when this was a wide desktop layout —
 * would restore as a 1180x820 frame holding a phone. Anything that is not
 * roughly phone-shaped is thrown away rather than stretched.
 */
function phoneShaped(state: WindowState): WindowState {
  const ratio = state.width / Math.max(1, state.height);
  const sane = state.width <= 620 && Math.abs(ratio - PHONE_RATIO) < 0.12;
  return sane ? { ...state, maximized: false } : { ...DEFAULT_WINDOW, x: state.x, y: state.y };
}
const DEFAULT_WINDOW: WindowState = { width: 460, height: 940, maximized: false };

let win: BrowserWindow | null = null;
let windowStore: JsonStore<WindowState>;
let profileStore: JsonStore<{ data: unknown }>;

/** Windows shows one taskbar/notification identity per AppUserModelID. */
if (process.platform === 'win32') app.setAppUserModelId('app.codeling.desktop');

// One instance only — a second launch focuses the window that already exists,
// which is what every well-behaved Windows app does.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

function clampToScreen(state: WindowState): WindowState {
  // Guards against restoring onto a monitor that has since been unplugged.
  if (state.x === undefined || state.y === undefined) return state;
  const visible = screen.getAllDisplays().some((d) => {
    const b = d.workArea;
    return state.x! < b.x + b.width && state.x! + 200 > b.x && state.y! < b.y + b.height && state.y! + 100 > b.y;
  });
  return visible ? state : { ...state, x: undefined, y: undefined };
}

function createWindow(): void {
  const saved = phoneShaped(clampToScreen(windowStore.get()));

  win = new BrowserWindow({
    title: 'Codeling',
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 380,
    minHeight: 700,
    maxWidth: 620,
    show: false,
    backgroundColor: '#050506',
    // Frameless: the title bar is drawn by the app so the chrome is the same
    // black as everything else. The renderer draws Windows-metric caption
    // buttons (46x32 hit targets, #C42B1C close hover) and marks the bar as a
    // drag region, so it still behaves like a system title bar.
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 13 },
    icon: join(PUBLIC_DIR, 'icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  // Locked to the phone's aspect: dragging a corner resizes it, but it stays
  // the same shape. The title bar is outside the content area, so the ratio is
  // applied to the content and Electron adds the bar back on.
  win.setAspectRatio(PHONE_RATIO);
  win.setMaximizable(false);

  win.once('ready-to-show', () => {
    win?.show();
  });

  const persistBounds = () => {
    if (!win || win.isMinimized()) return;
    const maximized = win.isMaximized();
    const bounds = win.getNormalBounds();
    windowStore.set({ width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y, maximized });
  };
  win.on('resize', persistBounds);
  win.on('move', persistBounds);
  win.on('close', () => {
    persistBounds();
    windowStore.flush();
    profileStore.flush();
  });

  const emitMaximized = () => win?.webContents.send('window:maximized', win.isMaximized());
  win.on('maximize', emitMaximized);
  win.on('unmaximize', emitMaximized);
  win.on('focus', () => win?.webContents.send('window:focus', true));
  win.on('blur', () => win?.webContents.send('window:focus', false));

  // Links to the outside world open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(join(RENDERER_DIST, 'index.html'));
  }
}

function buildMenu(): void {
  const send = (channel: string, payload?: unknown) => () => win?.webContents.send(channel, payload);

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '&File',
      submenu: [
        { label: 'Continue Course', accelerator: 'CmdOrCtrl+Enter', click: send('menu:continue') },
        { label: 'Practice Weak Spots', accelerator: 'CmdOrCtrl+R', click: send('menu:review') },
        { type: 'separator' },
        { label: 'Export Progress…', click: () => void exportProfile() },
        { label: 'Import Progress…', click: () => void importProfile() },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: send('menu:settings') },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '&View',
      submenu: [
        { label: 'Home', accelerator: 'CmdOrCtrl+1', click: send('menu:home') },
        { label: 'Statistics', accelerator: 'CmdOrCtrl+2', click: send('menu:stats') },
        { label: 'Course Library', accelerator: 'CmdOrCtrl+3', click: send('menu:library') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'F1', click: send('menu:shortcuts') },
        {
          label: 'Where is my progress stored?',
          click: () => {
            void shell.showItemInFolder(profileStore.path);
          },
        },
        { type: 'separator' },
        {
          label: 'About Codeling',
          click: () => {
            void dialog.showMessageBox(win!, {
              type: 'info',
              title: 'About Codeling',
              message: `Codeling ${app.getVersion()}`,
              detail:
                'A coding trainer that builds your course with a deterministic scheduling algorithm — no AI service, no API key, no account. Everything runs on this machine.',
              buttons: ['Close'],
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function exportProfile(): Promise<void> {
  if (!win) return;
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export Codeling progress',
    defaultPath: `codeling-progress-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'Codeling progress', extensions: ['json'] }],
  });
  if (canceled || !filePath) return;
  writeFileSync(filePath, JSON.stringify(profileStore.get(), null, 2), 'utf8');
}

async function importProfile(): Promise<void> {
  if (!win) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import Codeling progress',
    properties: ['openFile'],
    filters: [{ name: 'Codeling progress', extensions: ['json'] }],
  });
  if (canceled || !filePaths[0]) return;
  try {
    const parsed = JSON.parse(readFileSync(filePaths[0], 'utf8'));
    profileStore.set(parsed);
    profileStore.flush();
    win.webContents.send('profile:replaced', parsed);
  } catch {
    void dialog.showMessageBox(win, {
      type: 'error',
      title: 'Import failed',
      message: "That file isn't a Codeling progress export.",
    });
  }
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  windowStore = new JsonStore<WindowState>('window-state.json', DEFAULT_WINDOW);
  profileStore = new JsonStore<{ data: unknown }>('profile.json', { data: null });

  ipcMain.handle('profile:load', () => profileStore.get().data);
  ipcMain.handle('profile:save', (_e, data: unknown) => {
    profileStore.set({ data });
    return true;
  });
  ipcMain.handle('profile:reveal', () => shell.showItemInFolder(profileStore.path));
  ipcMain.handle('profile:path', () => profileStore.path);

  ipcMain.handle('runner:detect', () => detectToolchains());
  ipcMain.handle('runner:run', (_e, req: RunRequest) => runCode(req));

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    node: process.versions.node,
  }));

  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:toggle-maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on('window:close', () => win?.close());
  ipcMain.handle('window:is-maximized', () => win?.isMaximized() ?? false);
  ipcMain.on('shell:open-external', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  windowStore?.flush();
  profileStore?.flush();
});
