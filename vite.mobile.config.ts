import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * The phone build: the same app, without Electron.
 *
 * `base: './'` matters more than it looks. The build is served from a project
 * page (…github.io/codingcourse/), so every asset reference — including the
 * font URLs inside the stylesheet — has to be relative or the whole thing
 * 404s one directory up.
 */
export default defineConfig({
  root: resolve(__dirname, 'mobile'),
  base: './',
  publicDir: resolve(__dirname, 'public'),
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: resolve(__dirname, 'dist-mobile'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    target: 'es2020',
  },
  server: { port: 5274, strictPort: true, host: true },
  plugins: [react()],
});
