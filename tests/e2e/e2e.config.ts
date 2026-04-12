import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: '../../screenshots/e2e/results',
  fullyParallel: false,
  retries: 0,
  timeout: 180000,
  use: {
    baseURL: 'http://localhost:8080',
    screenshot: 'off',
    actionTimeout: 10000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
