import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scripts',
  testMatch: '*.browser.spec.mjs',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1, // Each viewer owns a large model and WebGL context.
  forbidOnly: !!process.env.CI,
  use: {
    actionTimeout: 15_000,
    baseURL: 'http://127.0.0.1:4317/ha/',
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4317 --strictPort --base=/ha/',
    url: 'http://127.0.0.1:4317/ha/',
    reuseExistingServer: !process.env.CI,
  },
});
