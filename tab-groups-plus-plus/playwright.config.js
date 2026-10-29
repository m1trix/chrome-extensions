import { defineConfig, devices } from '@playwright/test';

// The popup runs as a normal page with a fake `chrome` API (see tests/popup.js).
export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 480, height: 640 }, // about a popup's size
  },
});
