import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  optimizeDeps: { include: ['maplibre-gl/dist/maplibre-gl-csp.js'] },
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    globals: true,
    setupFiles: ['./src/testLocaleSetup.ts'],
  },
});
