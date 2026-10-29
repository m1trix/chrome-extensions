import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { installFakeChrome } from './fake-chrome.js';

const ORIGIN = 'https://tasks.test';
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

async function openOptions(page, sync) {
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({ path: SRC + new URL(route.request().url()).pathname.slice(1) }),
  );
  await page.addInitScript(installFakeChrome, { sync });
  await page.goto(`${ORIGIN}/options/options.html`);
}

const readSync = (page) => page.evaluate(() => chrome.storage.sync.get(null));

test('has no Save button', async ({ page }) => {
  await openOptions(page, {});
  await expect(page.getByRole('button')).toHaveCount(0);
});

test('saves each switch as soon as it changes', async ({ page }) => {
  await openOptions(page, { enabled: true, density: 'cozy' });

  await page.getByRole('switch', { name: 'Compact tables' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');
  expect(await readSync(page)).toEqual({ enabled: true, density: 'compact' });

  await page.getByRole('switch', { name: 'Enable Tasks++' }).click();
  expect(await readSync(page)).toEqual({ enabled: false, density: 'compact' });
});

test('saves only the changed setting', async ({ page }) => {
  await openOptions(page, { enabled: true, density: 'cozy' });
  // Turned off elsewhere (e.g. in the side panel) while this page is open.
  await page.evaluate(() => chrome.storage.sync.set({ enabled: false }));

  await page.getByRole('switch', { name: 'Compact tables' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');
  expect(await readSync(page)).toEqual({ enabled: false, density: 'compact' });
});
