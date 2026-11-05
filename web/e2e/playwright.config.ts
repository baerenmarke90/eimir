import { defineConfig, devices } from '@playwright/test';

const port = process.env.EIMIR_E2E_PORT ?? '4173';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // CI parallelism comes from isolated runners; each owns one browser worker.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'list',
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // API-mocked journeys must reach their route handlers, including on reload.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Routing disables the HTTP cache. Bundle once instead of reloading the
    // development module graph for every document navigation in every test.
    command: `npm --prefix .. run e2e:serve -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    // Native-container journeys require an explicit API origin, as shipped APKs do.
    env: { VITE_EIMIR_API_BASE_URL: baseURL },
    // Never accidentally validate a stale build or an unbundled dev server.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
