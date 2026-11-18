import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import application from './vite.config.ts';

// The product preview for the public eimir.de site: the real app on recorded,
// read-only demo data, built apart from the release bundle (see preview/).
export default mergeConfig(
  application,
  defineConfig({
    root: resolve(import.meta.dirname, 'preview'),
    base: '/preview/',
    publicDir: false,
    build: {
      outDir: resolve(import.meta.dirname, 'dist-preview'),
      emptyOutDir: true,
    },
  }),
);
