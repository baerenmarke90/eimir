import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  optimizeDeps: { include: ['maplibre-gl'] },
  build: {
    rolldownOptions: {
      output: {
        // MapLibre ships its worker as `.mjs`. Serve it as `.js` so every
        // static host sends a JavaScript MIME type for the module worker.
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith('.mjs'))
            ? 'assets/[name]-[hash].js'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    globals: true,
    setupFiles: ['./src/testLocaleSetup.ts'],
  },
});
