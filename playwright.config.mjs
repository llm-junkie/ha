import { defineConfig } from '@playwright/test';

const ci = !!process.env.CI;

export default defineConfig({
  testDir: './scripts',
  testMatch: '*.browser.spec.mjs',
  // Software rendering on hosted runners also affects each of the six model switches.
  timeout: ci ? 600_000 : 120_000,
  expect: { timeout: 30_000 },
  reporter: 'list',
  workers: 1, // Each viewer owns a large model and WebGL context.
  forbidOnly: ci,
  use: {
    actionTimeout: ci ? 60_000 : 15_000,
    baseURL: 'http://127.0.0.1:4317/ha/',
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    // Keep CI focused on lifecycle assertions without rendering incidental transitions.
    contextOptions: { reducedMotion: ci ? 'reduce' : 'no-preference' },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
        // Hosted Linux runners have no hardware GPU. Use the same renderer consistently.
        ...(ci ? { launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } : {}),
      },
    },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4317 --strictPort --base=/ha/',
    url: 'http://127.0.0.1:4317/ha/',
    reuseExistingServer: !ci,
  },
});
