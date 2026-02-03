// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { spawn } = require('child_process');

/**
 * See https://playwright.dev/docs/test-configuration
 * for more information about Playwright test config.
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60 * 1000,
  expect: {
    timeout: 10000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'npm run dev',
      cwd: './frontend',
      port: 5173,
      timeout: 60 * 1000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'python backend/app.py',
      cwd: '.',
      port: 5000,
      timeout: 60 * 1000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
