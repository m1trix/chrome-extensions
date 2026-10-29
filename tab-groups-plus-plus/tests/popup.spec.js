import { test, expect } from '@playwright/test';
import { browserState, groupCard, openPopup } from './popup.js';

const tab = (name, props = {}) => ({ url: `https://example.com/${name}`, title: name, ...props });

test('shows the groups in tab-strip order, then the ungrouped tabs', async ({ page }) => {
  await openPopup(page, {
    groups: [{ id: 1, title: 'Work', color: 'blue' }, { id: 2, title: 'Reading', color: 'green' }],
    tabs: [tab('news'), tab('article', { groupId: 2 }), tab('mail', { groupId: 1 }), tab('docs', { groupId: 1 })],
  });

  const cards = page.locator('#groups .card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator('input.title')).toHaveValue('Reading');
  await expect(cards.nth(1).locator('input.title')).toHaveValue('Work');
  await expect(cards.nth(1).locator('.collapse-toggle')).toHaveText('2 tabs ▾');
  await expect(cards.nth(1).locator('.tab-title')).toHaveText(['mail', 'docs']);
  await expect(page.locator('#ungrouped .tab-title')).toHaveText(['news']);
});

test('shows pinned tabs in a card of their own, first', async ({ page }) => {
  await openPopup(page, {
    groups: [{ id: 1, title: 'Work' }],
    tabs: [tab('calendar', { pinned: true }), tab('mail', { groupId: 1 })],
  });

  const cards = page.locator('#groups .card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveClass(/pinned/);
  await expect(cards.first().locator('h3')).toHaveText('Pinned tabs');
  await expect(cards.first().locator('.tab-title')).toHaveText(['calendar']);
});

test('renaming a group renames it in the browser', async ({ page }) => {
  await openPopup(page, { groups: [{ id: 1, title: 'Work' }], tabs: [tab('mail', { groupId: 1 })] });

  const title = groupCard(page, 1).locator('input.title');
  await title.fill('Office');
  await title.press('Enter');

  await expect.poll(async () => (await browserState(page)).groups[0].title).toBe('Office');
});

test('collapsing a group hides its tabs', async ({ page }) => {
  await openPopup(page, { groups: [{ id: 1, title: 'Work' }], tabs: [tab('mail', { groupId: 1 })] });
  const card = groupCard(page, 1);

  await card.getByRole('button', { name: '1 tab ▾' }).click();
  await expect(card.locator('.tab-list')).toBeHidden();
  await expect(card.locator('.collapse-toggle')).toHaveAttribute('aria-expanded', 'false');

  await card.getByRole('button', { name: '1 tab ▸' }).click();
  await expect(card.locator('.tab-list')).toBeVisible();
});

test('Save & close closes the group and lists it under Saved', async ({ page }) => {
  await openPopup(page, {
    groups: [{ id: 1, title: 'Work', color: 'blue' }],
    tabs: [tab('news'), tab('mail', { groupId: 1 }), tab('docs', { groupId: 1 })],
  });

  await groupCard(page, 1).getByRole('button', { name: 'Save & close' }).click();

  await expect(page.locator('#status')).toHaveText('Saved and closed “Work”');
  await expect(page.locator('#groups .card')).toHaveCount(0);
  expect((await browserState(page)).tabs.map((t) => t.title)).toEqual(['news']);

  await page.getByRole('tab', { name: /Saved/ }).click();
  await expect(page.locator('#saved-count')).toHaveText('1');
  await expect(page.locator('#saved .card h3')).toHaveText('Work');
  await expect(page.locator('#saved .card .tab-title')).toHaveText(['mail', 'docs']);
});

test('restoring a saved group reopens its tabs as a group', async ({ page }) => {
  const entry = {
    id: 'uuid-1',
    title: 'Work',
    color: '#1a73e8',
    savedAt: Date.now(),
    tabs: [{ url: 'https://example.com/mail', title: 'mail' }, { url: 'https://example.com/docs', title: 'docs' }],
  };
  await openPopup(page, { tabs: [tab('news')], local: { savedGroups: [entry] } });

  await page.getByRole('tab', { name: /Saved/ }).click();
  await page.locator('#saved .card').getByRole('button', { name: 'Restore' }).click();

  await expect(page.locator('#status')).toHaveText('Restored “Work”');
  await expect(page.locator('#saved .card')).toHaveCount(0);
  const { tabs, groups } = await browserState(page);
  expect(groups).toMatchObject([{ title: 'Work', color: 'blue' }]);
  expect(tabs.filter((t) => t.groupId === groups[0].id).map((t) => t.url)).toEqual(entry.tabs.map((t) => t.url));
});

test('Deduplicate merges same-named groups and closes duplicate tabs', async ({ page }) => {
  await openPopup(page, {
    groups: [{ id: 1, title: 'Work' }, { id: 2, title: 'work ' }],
    tabs: [tab('mail', { groupId: 1 }), tab('docs', { groupId: 2 }), tab('mail', { groupId: 2 }), tab('news')],
  });

  await page.getByRole('button', { name: 'Deduplicate' }).first().click();

  await expect(page.locator('#status')).toHaveText('Merged 1 group, closed 1 duplicate tab');
  await expect(page.locator('#groups .card')).toHaveCount(1);
  await expect(groupCard(page, 1).locator('.tab-title')).toHaveText(['mail', 'docs']);
});
