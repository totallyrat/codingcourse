import type { CodelingApi } from '../../electron/preload';

declare global {
  interface Window {
    codeling?: CodelingApi;
  }
}

export const isElectron = typeof window !== 'undefined' && !!window.codeling;

/**
 * The app is developed in a plain browser tab as often as in Electron, so every
 * bridge call has a browser fallback. In the browser the profile lives in
 * localStorage and native execution is simply unavailable — which the runtime
 * layer already treats as "fall back to the in-app interpreter".
 */
const LOCAL_KEY = 'codeling.profile.v1';

const browserFallback: CodelingApi = {
  profile: {
    load: async () => {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save: async (data) => {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
      } catch {
        /* private mode / quota */
      }
      return true;
    },
    reveal: async () => {},
    path: async () => 'localStorage',
    onReplaced: () => () => {},
  },
  runner: {
    detect: async () => ({
      python: null,
      javascript: null,
      typescript: null,
      cpp: null,
      csharp: null,
      rust: null,
      go: null,
    }),
    run: async () => ({ ok: false as const, unavailable: true as const }),
  },
  window: {
    minimize: () => {},
    toggleMaximize: () => {},
    close: () => {},
    isMaximized: async () => false,
    onMaximizedChange: () => () => {},
    onFocusChange: () => () => {},
  },
  app: {
    info: async () => ({ version: 'dev', platform: 'web', electron: '-', node: '-' }),
    openExternal: (url: string): void => {
      window.open(url, '_blank', 'noopener');
    },
    onMenu: () => () => {},
  },
};

export const bridge: CodelingApi = (typeof window !== 'undefined' && window.codeling) || browserFallback;
