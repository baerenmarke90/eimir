import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Let independent tests in slow files share the work within each CI shard.
  workers: process.env.CI ? 2 : undefined,
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
    command: 'npm --prefix .. run dev -- --host 127.0.0.1 --port 4173',
    url: baseURL,
    // Native-container journeys require an explicit API origin, as shipped APKs do.
    env: { VITE_EIMIR_API_BASE_URL: baseURL },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
