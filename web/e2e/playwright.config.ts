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
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm --prefix .. run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    // Native-container journeys require an explicit API origin, as shipped APKs do.
    env: { VITE_EIMIR_API_BASE_URL: baseURL },
    reuseExistingServer: !process.env.CI && !process.env.EIMIR_E2E_PORT,
    timeout: 120_000,
  },
});
