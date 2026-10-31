import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  optimizeDeps: { include: ['leaflet'] },
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    globals: true,
  },
});
