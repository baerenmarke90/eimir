import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  optimizeDeps: { include: ['maplibre-gl'] },
  build: {
    // The supported browser and WebView floor (#1613). It equals Vite 8's
    // `baseline-widely-available` default, pinned so that a toolchain upgrade
    // cannot move it silently. Keep it in step with `android.minWebViewVersion`
    // in capacitor.config.ts and docs/CAPACITOR-ANDROID-FOUNDATION.md.
    target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'],
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
