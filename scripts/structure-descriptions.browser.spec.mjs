import { test, expect } from '@playwright/test';

async function ready(page) {
  await expect(page.getByRole('button', { name: 'Share current view', exact: true })).toBeEnabled({ timeout: 120_000 });
  await expect(page.locator('.loading')).toHaveCount(0);
}

async function select(page, name) {
  await page.getByRole('button', { name: 'Search anatomy', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search named anatomical structures' }).fill(name);
  await page.getByRole('option').filter({ has: page.locator('.search-result-name', { hasText: new RegExp(`^${name}$`, 'i') }) }).first().click();
  await expect(page.locator('.structure-title')).toHaveText(new RegExp(`^${name}$`, 'i'));
}

for (const model of ['male', 'female']) {
  test(`${model}: descriptions change between structures and member pieces, with clickable sources`, async ({ page }) => {
    await page.goto(`./?model=${model}`);
    await ready(page);
    await select(page, 'left tibialis anterior');
    await expect(page.locator('.description-kind')).toHaveText('Structure description');
    await expect(page.locator('.structure-description')).toContainText('Space of anterior compartment of left leg');
    await expect(page.getByRole('region', { name: 'Description sources' }).locator('a').first()).toHaveAttribute('href', /fma22545/);
    const first = await page.locator('.structure-description').textContent();
    await select(page, 'left rectus femoris');
    await expect(page.locator('.structure-description')).not.toHaveText(first);
    await select(page, 'heart');
    await expect(page.locator('.structure-description')).toContainText('pumps blood');
    const member = page.locator('.member-list button').first();
    const name = (await member.textContent()).trim();
    await member.click();
    await expect(page.locator('.structure-title')).toHaveText(name);
    await expect(page.locator('.description-kind')).toHaveText('Structure description');
    await expect(page.locator('.structure-description')).not.toContainText('pumps blood');
    await expect(page.getByRole('region', { name: 'Description sources' }).locator('a').first()).toHaveAttribute('href', /^https:\/\//);
  });
}

test('a future unknown concept displays an explicit system fallback', async ({ page }) => {
  await page.route('**/models/atlas.json', async route => {
    const response = await route.fetch();
    const atlas = await response.json();
    const concept = atlas.concepts.find(concept => concept.name.toLowerCase() === 'left tibialis anterior');
    concept.id = 'TEST:unrecognized-structure';
    await route.fulfill({ response, json: atlas });
  });
  await page.goto('./?model=male');
  await ready(page);
  await select(page, 'left tibialis anterior');
  await expect(page.locator('.description-kind')).toHaveText('System overview (fallback)');
  await expect(page.locator('.context-note')).toContainText('No sourced description is available');
  await expect(page.getByRole('region', { name: 'Description sources' })).toHaveCount(0);
});

test('female model source links and inspection controls remain accessible on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?model=female');
  await ready(page);
  await select(page, 'Interlobar adipose tissue of left mammary gland');
  await expect(page.locator('.description-kind')).toHaveText('Structure description');
  const source = page.getByRole('region', { name: 'Description sources' }).locator('a').first();
  await source.scrollIntoViewIfNeeded();
  await expect(source).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Locate structure', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Isolate structure', exact: true })).toBeInViewport();
});
