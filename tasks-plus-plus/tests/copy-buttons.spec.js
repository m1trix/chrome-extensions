import { test, expect } from '@playwright/test';
import { openSidePanel, readClipboard } from './side-panel.js';

const TASK = {
  id: 'task-1',
  title: 'Fix login redirect',
  pr: '#12',
  prUrl: 'https://github.com/acme/web/pull/12',
  branch: 'fix/login-redirect',
  base: 'main',
};

const cell = (panel, column) => {
  const index = { pr: 2, branch: 3, base: 4 }[column];
  return panel.locator(`tbody tr:first-child td:nth-child(${index})`);
};

test.describe('in an editable tab (In Progress)', () => {
  test('branch and base each have a copy button after their value', async ({ page }) => {
    const panel = await openSidePanel(page, { tasks: { 'in-progress': [TASK] } });

    for (const [column, value] of [['branch', 'fix/login-redirect'], ['base', 'main']]) {
      const text = cell(panel, column).locator('.editable-value');
      const button = cell(panel, column).getByRole('button', { name: `Copy ${column} for Fix login redirect` });
      await expect(text).toHaveText(value);
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('title', `Copy ${column}`);

      // After the value, and not overlapping it.
      const [valueBox, buttonBox] = [await text.boundingBox(), await button.boundingBox()];
      expect(buttonBox.x).toBeGreaterThanOrEqual(valueBox.x + valueBox.width);
    }
  });

  test('copies the branch and base as plain text', async ({ page }) => {
    const panel = await openSidePanel(page, { tasks: { 'in-progress': [TASK] } });

    await cell(panel, 'branch').getByRole('button', { name: /^Copy branch/ }).click();
    expect(await readClipboard(page)).toEqual({ 'text/plain': 'fix/login-redirect' });

    await cell(panel, 'base').getByRole('button', { name: /^Copy base/ }).click();
    expect(await readClipboard(page)).toEqual({ 'text/plain': 'main' });
  });

  test('copies the PR as a link, with the full URL as plain text', async ({ page }) => {
    const panel = await openSidePanel(page, { tasks: { 'in-progress': [TASK] } });

    await cell(panel, 'pr').getByRole('button', { name: 'Copy PR link for Fix login redirect' }).click();
    const clipboard = await readClipboard(page);
    expect(clipboard['text/plain']).toBe('https://github.com/acme/web/pull/12');
    expect(clipboard['text/html']).toContain('<a href="https://github.com/acme/web/pull/12">#12</a>');
  });

  test('escapes the PR link in the copied HTML', async ({ page }) => {
    const task = { ...TASK, pr: '#12 <b>', prUrl: 'https://github.com/acme/web/pull/12?a=1&b="2"' };
    const panel = await openSidePanel(page, { tasks: { 'in-progress': [task] } });

    await cell(panel, 'pr').getByRole('button', { name: /^Copy PR link/ }).click();
    const clipboard = await readClipboard(page);
    expect(clipboard['text/plain']).toBe(task.prUrl);
    expect(clipboard['text/html']).toContain(
      '<a href="https://github.com/acme/web/pull/12?a=1&amp;b=&quot;2&quot;">#12 &lt;b&gt;</a>',
    );
  });

  test('shows a check mark after copying, then the copy icon again', async ({ page }) => {
    const panel = await openSidePanel(page, { tasks: { 'in-progress': [TASK] } });
    const button = cell(panel, 'branch').getByRole('button', { name: /^Copy branch/ });

    await button.click();
    await expect(button).toHaveClass(/\bcopied\b/);
    await expect(button).toHaveAttribute('title', 'Copied!');

    await expect(button).not.toHaveClass(/\bcopied\b/, { timeout: 3000 });
    await expect(button).toHaveAttribute('title', 'Copy branch');
  });

  test('copies the new value after the branch is edited', async ({ page }) => {
    const panel = await openSidePanel(page, { tasks: { 'in-progress': [TASK] } });

    await cell(panel, 'branch').locator('.editable-value').click();
    await page.keyboard.type('feature/new-name');
    await page.keyboard.press('Enter');
    await expect(cell(panel, 'branch').locator('.editable-value')).toHaveText('feature/new-name');

    await cell(panel, 'branch').getByRole('button', { name: /^Copy branch/ }).click();
    expect(await readClipboard(page)).toEqual({ 'text/plain': 'feature/new-name' });
  });

  test('has no copy buttons for empty values or a PR without a link', async ({ page }) => {
    const task = { id: 'task-2', title: 'Write docs', pr: '#7', branch: '', base: '' };
    const panel = await openSidePanel(page, { tasks: { 'in-progress': [task] } });

    await expect(panel.locator('tbody tr').first()).toBeVisible();
    for (const column of ['pr', 'branch', 'base']) {
      await expect(cell(panel, column).locator('.copy-value')).toHaveCount(0);
    }
    await expect(cell(panel, 'pr')).toHaveText('#7');
  });

  test('the new-task row has no copy buttons', async ({ page }) => {
    const panel = await openSidePanel(page, { tasks: { 'in-progress': [TASK] } });
    await expect(panel.locator('.input-row .copy-value')).toHaveCount(0);
  });
});

test.describe('in a summary tab (Complete)', () => {
  const LONG = { ...TASK, branch: 'feature/a-really-long-branch-name-that-gets-truncated' };

  test('copies branch, base and PR link', async ({ page }) => {
    const panel = await openSidePanel(page, { tasks: { complete: [LONG] }, tab: 'complete' });

    await cell(panel, 'branch').getByRole('button', { name: /^Copy branch/ }).click();
    expect(await readClipboard(page)).toEqual({ 'text/plain': LONG.branch });

    await cell(panel, 'base').getByRole('button', { name: /^Copy base/ }).click();
    expect(await readClipboard(page)).toEqual({ 'text/plain': 'main' });

    await cell(panel, 'pr').getByRole('button', { name: /^Copy PR link/ }).click();
    expect((await readClipboard(page))['text/plain']).toBe(LONG.prUrl);
  });

  test('truncates a long branch name but keeps its copy button visible', async ({ page }) => {
    const panel = await openSidePanel(page, { tasks: { complete: [LONG] }, tab: 'complete' });
    const branchCell = cell(panel, 'branch');
    const text = branchCell.locator('.value');
    const button = branchCell.getByRole('button', { name: /^Copy branch/ });

    await expect(text).toHaveAttribute('title', LONG.branch); // full name on hover
    expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

    await expect(button).toBeVisible();
    const [cellBox, buttonBox] = [await branchCell.boundingBox(), await button.boundingBox()];
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width);
  });
});

test.describe('visual', () => {
  const TASKS = [
    TASK,
    { id: 'task-2', title: 'Write docs', pr: '#7', branch: '', base: '' },
    {
      id: 'task-3',
      title: 'Upgrade dependencies',
      pr: '#31',
      prUrl: 'https://github.com/acme/web/pull/31',
      branch: 'chore/a-really-long-branch-name',
      base: 'release/2026.10',
    },
  ];

  test('In Progress table', async ({ page }) => {
    const panel = await openSidePanel(page, { tasks: { 'in-progress': TASKS } });
    await expect(panel.locator('table')).toHaveScreenshot('in-progress.png');
  });

  test('Complete table', async ({ page }) => {
    const panel = await openSidePanel(page, { tasks: { complete: TASKS }, tab: 'complete' });
    await expect(panel.locator('table')).toHaveScreenshot('complete.png');
  });

  test('copy button after copying', async ({ page }) => {
    const panel = await openSidePanel(page, { tasks: { 'in-progress': [TASK] } });
    await cell(panel, 'branch').getByRole('button', { name: /^Copy branch/ }).click();
    await page.mouse.move(0, 0); // drop the hover state
    await expect(cell(panel, 'branch')).toHaveScreenshot('branch-copied.png');
  });
});
