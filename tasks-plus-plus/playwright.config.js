import { defineConfig, devices } from '@playwright/test';

// The side panel runs as a normal page with a fake `chrome` API (see
// tests/side-panel.js). Screenshots are per platform, as fonts differ.
export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 480, height: 640 }, // about a side panel's size
  },
});
