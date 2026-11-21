import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const here = import.meta.dirname;

export default defineConfig({
  build: {
    // The app's supported browser and WebView floor (web/vite.config.ts).
    target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'],
    manifest: true,
    rolldownOptions: {
      input: {
        index: resolve(here, 'index.html'),
        baseline: resolve(here, 'baseline.html'),
        current: resolve(here, 'current.html'),
        waapi: resolve(here, 'waapi.html'),
        motion: resolve(here, 'motion.html'),
      },
    },
  },
});
