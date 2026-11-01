import { defineConfig, devices } from '@playwright/test';

/** Browser tests against the built packages. Run `npm run build:packages` first. */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
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
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // Linux headless Firefox has no GL display; CI supplies Xvfb and Mesa.
        headless: !(process.env.CI && process.platform === 'linux'),
        launchOptions: {
          firefoxUserPrefs: {
            'webgl.force-enabled': true,
            'webgl.forbid-software': false,
          },
        },
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
