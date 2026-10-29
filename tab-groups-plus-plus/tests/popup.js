import { fileURLToPath } from 'node:url';
import { installFakeChrome } from './fake-chrome.js';

// The popup is served from this made-up origin (HTTPS, so crypto.randomUUID is
// available); requests to it are answered from the extension's folder.
const ORIGIN = 'https://tab-groups.test';
const ROOT = fileURLToPath(new URL('../', import.meta.url));

// Opens the popup on a window with the given tabs and groups (see
// tests/fake-chrome.js for their shape).
export async function openPopup(page, seed = {}) {
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({ path: ROOT + new URL(route.request().url()).pathname.slice(1) }),
  );
  await page.addInitScript(installFakeChrome, seed);
  await page.goto(`${ORIGIN}/popup/popup.html`);
  // Both views have rendered (each always has at least an "empty" message).
  await page.locator('#ungrouped > *, #saved > *').nth(1).waitFor({ state: 'attached' });
}

// The window's tabs and groups, as the fake browser has them now.
export function browserState(page) {
  return page.evaluate(() => window.fakeBrowser.snapshot());
}

// The card of the open group with this id.
export function groupCard(page, groupId) {
  return page.locator(`#groups .card[data-group-id="${groupId}"]`);
}
