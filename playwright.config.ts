import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './screenshots/results',
  snapshotDir: './screenshots/baseline',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    screenshot: 'off',
  },
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: true,
    timeout: 10000,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'android-portrait',
      use: {
        ...devices['Pixel 7'],
        // Pixel 7: 412x915 CSS viewport
      },
    },
    {
      name: 'android-small',
      use: {
        ...devices['Pixel 5'],
        // Pixel 5: 393x851 CSS viewport
      },
    },
    // iPhone SE removed: requires WebKit browser install
    // {
    //   name: 'iphone-se',
    //   use: { ...devices['iPhone SE'] },
    // },
  ],
});
