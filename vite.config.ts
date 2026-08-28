import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  server: { port: 5273, strictPort: true },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: { outDir: 'dist-electron', rollupOptions: { external: ['electron'] } },
        },
      },
      preload: {
        input: resolve(__dirname, 'electron/preload.ts'),
        vite: {
          build: { outDir: 'dist-electron', rollupOptions: { external: ['electron'] } },
        },
      },
    }),
  ],
});
