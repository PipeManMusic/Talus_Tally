import { defineConfig } from '@playwright/test';

const e2eRuntimeTemplatesDir = 'frontend/tests/e2e/runtime-templates';
const e2eRuntimeUserDataDir = 'frontend/tests/e2e/runtime-user-data';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/*.spec.ts'],
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `rm -rf "${e2eRuntimeUserDataDir}" && mkdir -p "${e2eRuntimeUserDataDir}" "${e2eRuntimeTemplatesDir}" && export XDG_DATA_HOME="$PWD/${e2eRuntimeUserDataDir}" && export TALUS_BLUEPRINT_TEMPLATES_DIR="$PWD/${e2eRuntimeTemplatesDir}" && export TALUS_DAEMON=1 && if [ -x .venv/bin/python ]; then .venv/bin/python -m backend.app; else python3 -m backend.app; fi`,
      cwd: '..',
      url: 'http://localhost:5000/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
