import { contextBridge, ipcRenderer } from 'electron';

export interface ToolchainMap {
  python: string | null;
  javascript: string | null;
  typescript: string | null;
  cpp: string | null;
  csharp: string | null;
  rust: string | null;
  go: string | null;
}

export interface NativeRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  engine: 'native';
  toolchain: string;
  timedOut: boolean;
  truncated: boolean;
}

const api = {
  profile: {
    load: (): Promise<unknown> => ipcRenderer.invoke('profile:load'),
    save: (data: unknown): Promise<boolean> => ipcRenderer.invoke('profile:save', data),
    reveal: (): Promise<void> => ipcRenderer.invoke('profile:reveal'),
    path: (): Promise<string> => ipcRenderer.invoke('profile:path'),
    onReplaced: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data);
      ipcRenderer.on('profile:replaced', handler);
      return (): void => {
        ipcRenderer.off('profile:replaced', handler);
      };
    },
  },
  runner: {
    detect: (): Promise<ToolchainMap> => ipcRenderer.invoke('runner:detect'),
    run: (req: {
      language: string;
      source: string;
      stdin?: string;
      timeoutMs?: number;
    }): Promise<NativeRunResult | { ok: false; unavailable: true }> => ipcRenderer.invoke('runner:run', req),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (cb: (maximized: boolean) => void) => {
      const handler = (_e: unknown, value: boolean) => cb(value);
      ipcRenderer.on('window:maximized', handler);
      return (): void => {
        ipcRenderer.off('window:maximized', handler);
      };
    },
    onFocusChange: (cb: (focused: boolean) => void) => {
      const handler = (_e: unknown, value: boolean) => cb(value);
      ipcRenderer.on('window:focus', handler);
      return (): void => {
        ipcRenderer.off('window:focus', handler);
      };
    },
  },
  app: {
    info: (): Promise<{ version: string; platform: string; electron: string; node: string }> =>
      ipcRenderer.invoke('app:info'),
    openExternal: (url: string) => ipcRenderer.send('shell:open-external', url),
    onMenu: (cb: (action: string) => void) => {
      const channels = [
        'menu:continue',
        'menu:review',
        'menu:settings',
        'menu:home',
        'menu:stats',
        'menu:library',
        'menu:shortcuts',
      ];
      const handlers = channels.map((channel) => {
        const handler = () => cb(channel.replace('menu:', ''));
        ipcRenderer.on(channel, handler);
        return (): void => {
          ipcRenderer.off(channel, handler);
        };
      });
      return (): void => handlers.forEach((off) => off());
    },
  },
};

contextBridge.exposeInMainWorld('codeling', api);

export type CodelingApi = typeof api;
