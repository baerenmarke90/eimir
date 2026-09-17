import { configDefaults, defineConfig } from 'vitest/config';

// Temporary #993 Web-only G2 scope probe; this branch/PR must not be merged.
export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    globals: true,
  },
});
