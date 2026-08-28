import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Deliberately separate from vite.config.ts: the Electron plugin would try to
// spawn a browser window during a test run.
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
