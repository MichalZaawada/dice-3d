import { defineConfig, devices } from '@playwright/test';

/** Browser tests against the built packages. Run `npm run build:packages` first. */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4317',
  },
  webServer: {
    command: 'npx vite --config vite.config.ts',
    url: 'http://127.0.0.1:4317/e2e/fixture/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
