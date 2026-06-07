import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: 'npm run dev',
          cwd: '../backend',
          port: 3000,
          reuseExistingServer: !process.env.CI,
          env: { ...process.env },
        },
        {
          command: 'npm run dev',
          cwd: '../frontend',
          port: 5173,
          reuseExistingServer: !process.env.CI,
        },
      ],
});
