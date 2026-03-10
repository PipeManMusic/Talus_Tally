import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/*.spec.ts'],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    },
    {
      command: 'if [ -x .venv/bin/python ]; then .venv/bin/python -m backend.app; else python3 -m backend.app; fi',
      cwd: '..',
      url: 'http://localhost:5000/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
