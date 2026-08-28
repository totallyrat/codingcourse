import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Build config for the standalone wizard page. Separate from vite.config.ts
 * because that one starts Electron, which this has nothing to do with.
 */
export default defineConfig({
  base: './',
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  plugins: [react()],
  build: {
    rollupOptions: { input: resolve(__dirname, 'wizard.html') },
    // One chunk each, so the inliner has exactly two files to fold in.
    cssCodeSplit: false,
    assetsInlineLimit: 1024 * 1024,
    modulePreload: { polyfill: false },
  },
});
