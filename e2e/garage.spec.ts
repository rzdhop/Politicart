import { expect, test } from '@playwright/test';

/**
 * R-17 -- the Garage: the player styles their own kart.
 *
 * Runs on the static build (the GitHub Pages stand-in), where the Garage must
 * work with no server. Choices apply at once, survive a reload, follow the
 * player into a race, and "Par défaut" puts the candidate's own kart back.
 */

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('kr-kart'));
  await page.reload();
  await page.locator('#b-play').click();
  await expect(page.locator('#s-select')).toBeVisible();
});

test.afterEach(() => {
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test.describe('R-17 garage', () => {
  test('opens from the roster with the candidate default selected, and comes back', async ({ page }) => {
    await page.locator('#b-garage').click();
    await expect(page.locator('#s-garage')).toBeVisible();
    await expect(page.locator('#s-select')).toBeHidden();
    await expect(page.locator('#g-wheels-classic')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#g-spoiler-standard')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#g-pods-on')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#g-sticker-none')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#g-number')).toHaveValue('');
    await page.locator('#b-garage-back').click();
    await expect(page.locator('#s-select')).toBeVisible();
  });

  test('keeps the choices across a reload and resets them', async ({ page }) => {
    await page.locator('#b-garage').click();
    await page.locator('#g-wheels-gold').click();
    await page.locator('#g-spoiler-wing').click();
    await page.locator('#g-pods-off').click();
    await page.locator('#g-sticker-rosette').click();
    await page.locator('#g-number').fill('42');
    await page.locator('#g-body').fill('#ff0000');
    await expect(page.locator('#g-wheels-gold')).toHaveAttribute('aria-pressed', 'true');

    const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('kr-kart'))) ?? '{}');
    expect(stored).toEqual({ wheels: 'gold', spoiler: 'wing', pods: false, sticker: 'rosette', number: 42, body: '#ff0000' });

    await page.reload();
    await page.locator('#b-play').click();
    await page.locator('#b-garage').click();
    await expect(page.locator('#g-wheels-gold')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#g-number')).toHaveValue('42');
    await expect(page.locator('#g-body')).toHaveValue('#ff0000');

    await page.locator('#b-garage-reset').click();
    await expect(page.locator('#g-wheels-classic')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#g-number')).toHaveValue('');
    expect(await page.evaluate(() => localStorage.getItem('kr-kart'))).toBeNull();
  });

  test('ignores a race number that is not 0-99', async ({ page }) => {
    await page.locator('#b-garage').click();
    await page.locator('#g-number').fill('7');
    await page.locator('#g-number').fill('7a');
    const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('kr-kart'))) ?? '{}');
    expect(stored).toEqual({ number: 7 });
  });

  test('races with a fully styled kart', async ({ page }) => {
    await page.locator('#b-garage').click();
    for (const id of ['#g-wheels-offroad', '#g-spoiler-wing', '#g-sticker-marianne']) await page.locator(id).click();
    await page.locator('#g-number').fill('9');
    await page.locator('#b-garage-back').click();
    await page.locator('#b-next1').click();
    await page.locator('#b-start').click();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#h-center')).not.toBeEmpty();
    await expect(page.locator('#h-center')).toHaveText('', { timeout: 20_000 });
  });
});
