import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { openSidePanel, TOPIC } from './side-panel.js';

const TASK = { id: 'task-1', title: 'Fix login redirect', branch: 'fix/login-redirect', base: 'main' };

const exportFile = (state) => ({
  name: 'tasks-plus-plus-2026-10-29.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(state)),
});

test('the topic bar has Export and Import between New and Delete', async ({ page }) => {
  await openSidePanel(page);
  const labels = await page.locator('#topic-bar > button').evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label')),
  );
  expect(labels).toEqual(['Switch topic', 'New topic', 'Export', 'Import', 'Delete topic']);
});

test('Export downloads all stored state as JSON', async ({ page }) => {
  await openSidePanel(page, { tasks: { 'in-progress': [TASK] } });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByLabel('Export').click()]);

  expect(download.suggestedFilename()).toMatch(/^tasks-plus-plus-\d{4}-\d{2}-\d{2}\.json$/);
  const state = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(state.version).toBe('0.1.0');
  expect(state.local.topics).toEqual([TOPIC]);
  expect(state.local[`tasks:${TOPIC.id}:in-progress`]).toEqual([TASK]);
  await expect(page.locator('#status')).toHaveText('Exported.');
});

test('Import replaces all state after confirming, then shows it', async ({ page }) => {
  const panel = await openSidePanel(page, { tasks: { 'in-progress': [TASK] } });
  const imported = { id: 'topic-2', name: 'Home' };
  await page.locator('#import-file').setInputFiles(
    exportFile({
      sync: {},
      local: {
        topics: [imported],
        activeTopic: imported.id,
        activeTab: 'tab-in-progress',
        [`tasks:${imported.id}:in-progress`]: [{ id: 'task-2', title: 'Fix the fence' }],
      },
    }),
  );

  const dialog = page.locator('#import-dialog');
  await expect(dialog).toContainText('tasks-plus-plus-2026-10-29.json');
  await dialog.getByRole('button', { name: 'Replace' }).click();

  await expect(page.locator('#topic-name')).toHaveText('Home');
  await expect(panel).toContainText('Fix the fence');
  await expect(panel).not.toContainText(TASK.title);
});

test('Import changes nothing when cancelled', async ({ page }) => {
  const panel = await openSidePanel(page, { tasks: { 'in-progress': [TASK] } });
  await page.locator('#import-file').setInputFiles(exportFile({ sync: {}, local: { topics: [] } }));
  await page.locator('#import-dialog').getByRole('button', { name: 'Cancel' }).click();

  await expect(page.locator('#import-dialog')).not.toBeVisible();
  await expect(page.locator('#topic-name')).toHaveText(TOPIC.name);
  await expect(panel).toContainText(TASK.title);
});

test('Import rejects a file that is not a Tasks++ export', async ({ page }) => {
  await openSidePanel(page);
  await page.locator('#import-file').setInputFiles(exportFile({ hello: 'world' }));

  await expect(page.locator('#status')).toHaveText('Import failed: not a Tasks++ export.');
  await expect(page.locator('#import-dialog')).not.toBeVisible();
});
