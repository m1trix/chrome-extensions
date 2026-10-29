import { fileURLToPath } from 'node:url';
import { installFakeChrome } from './fake-chrome.js';

// The side panel is served from this made-up origin (HTTPS, so the clipboard
// API is available); requests to it are answered from the src/ folder.
// The clipboard itself is faked (see installFakeClipboard), as the real one is
// shared by all tests running at once, and with the rest of the computer.
const ORIGIN = 'https://tasks.test';
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

export const TOPIC = { id: 'topic-1', name: 'Work' };

// Opens the side panel with the given tasks for TOPIC, keyed by status
// ('pending', 'in-progress', 'complete', 'abandoned'), on the given tab.
export async function openSidePanel(page, { tasks = {}, tab = 'in-progress' } = {}) {
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({ path: SRC + new URL(route.request().url()).pathname.slice(1) }),
  );
  await page.addInitScript(installFakeClipboard);
  await page.addInitScript(installFakeChrome, {
    local: {
      topics: [TOPIC],
      activeTopic: TOPIC.id,
      activeTab: `tab-${tab}`,
      ...Object.fromEntries(Object.entries(tasks).map(([status, list]) => [`tasks:${TOPIC.id}:${status}`, list])),
    },
  });
  await page.goto(`${ORIGIN}/sidepanel/sidepanel.html`);
  await page.getByText('Background connected.').waitFor(); // the script has run to the end
  return page.locator(`#panel-${tab}`);
}

// What is on the clipboard, as { 'text/plain': …, 'text/html': … }.
export function readClipboard(page) {
  return page.evaluate(() => window.fakeClipboard);
}

// Runs in the page: replaces the clipboard writes with ones that keep what was
// copied. `window.fakeClipboard` waits for the last write to finish, as a copy
// button's click handler is still writing when the click returns.
function installFakeClipboard() {
  let contents = Promise.resolve({});
  Object.defineProperty(window, 'fakeClipboard', { get: () => contents });
  navigator.clipboard.writeText = (text) => {
    contents = Promise.resolve({ 'text/plain': String(text) });
    return contents.then(() => {});
  };
  navigator.clipboard.write = (items) => {
    contents = (async () => {
      const result = {};
      for (const item of items) {
        for (const type of item.types) result[type] = await (await item.getType(type)).text();
      }
      return result;
    })();
    return contents.then(() => {});
  };
}
