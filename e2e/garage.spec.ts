import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * R-17 -- the Garage: the player styles their own kart.
 *
 * Runs on the static build (the GitHub Pages stand-in), where the Garage must
 * work with no server. Choices apply at once, survive a reload, follow the
 * player into a race, and "Par défaut" puts the candidate's own kart back.
 * Without an economy every option, trails included, is open (DEC-035).
 *
 * R-22 -- ownership in the Garage, on the game server (port 4180): what a
 * fresh account does not own is greyed behind its grade, a tap on the chip
 * changes nothing, and a tap on the badge opens the Boutique on the parts.
 */

const errors: string[] = [];

test.afterEach(() => {
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test.describe('R-17 garage', () => {
  test.beforeEach(async ({ page }) => {
    errors.length = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('politikart-kart'));
    await page.reload();
    await page.locator('#b-play').click();
    await expect(page.locator('#s-select')).toBeVisible();
  });

  test('opens from the roster with the candidate default selected, and comes back', async ({ page }) => {
    await page.locator('#b-garage').click();
    await expect(page.locator('#s-garage')).toBeVisible();
    await expect(page.locator('#s-select')).toBeHidden();
    await expect(page.locator('#g-wheels-classic')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#g-spoiler-standard')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#g-pods-on')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#g-sticker-none')).toHaveAttribute('aria-pressed', 'true');
    for (const id of ['#g-exhaust-stock', '#g-underglow-none', '#g-mast-none', '#g-nose-stock', '#g-skin-flat', '#g-trail-none']) await expect(page.locator(id)).toHaveAttribute('aria-pressed', 'true');
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

    const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('politikart-kart'))) ?? '{}');
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
    expect(await page.evaluate(() => localStorage.getItem('politikart-kart'))).toBeNull();
  });

  test('offers every new part and trail without a server, and keeps a trail and a skin across a reload', async ({ page }) => {
    await page.locator('#b-garage').click();
    for (const id of ['#g-exhaust-turbine', '#g-underglow-rainbow', '#g-mast-pirate', '#g-nose-ram', '#g-skin-flames', '#g-trail-laser']) await expect(page.locator(id)).toBeVisible();
    await expect(page.locator('#s-garage .chip[aria-disabled]')).toHaveCount(0);
    await expect(page.locator('#s-garage .chip-badge')).toHaveCount(0);
    await expect(page.locator('#g-trail-note')).toHaveText('Les traînées se gagnent dans la Politibox.');

    await page.locator('#g-trail-laser').click();
    await page.locator('#g-skin-flames').click();
    await expect(page.locator('#g-trail-laser')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#g-trail-none')).toHaveAttribute('aria-pressed', 'false');
    const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('politikart-kart'))) ?? '{}');
    expect(stored).toEqual({ trail: 'laser', skin: 'flames' });

    await page.reload();
    await page.locator('#b-play').click();
    await page.locator('#b-garage').click();
    await expect(page.locator('#g-trail-laser')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#g-skin-flames')).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('politikart-kart'))) ?? '{}')).toEqual({ trail: 'laser', skin: 'flames' });
  });

  test('ignores a race number that is not 0-99', async ({ page }) => {
    await page.locator('#b-garage').click();
    await page.locator('#g-number').fill('7');
    await page.locator('#g-number').fill('7a');
    const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('politikart-kart'))) ?? '{}');
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

const SERVER = 'http://127.0.0.1:4180/';
// Account names are unique per server; a suffix keeps reruns against a reused server apart.
const RUN = Date.now().toString(36).slice(-5);
const contexts: BrowserContext[] = [];

/** A fresh browser on the game server, signed up as a new account, back on the title. */
async function freshAccount(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext(); contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(SERVER);
  await expect(page.locator('#b-account')).toBeVisible();
  await page.locator('#b-account').click();
  await page.locator('#acc-name').fill(name);
  await page.locator('#acc-pass').fill('république');
  await page.locator('#b-acc-register').click();
  await expect(page.locator('#acc-level')).toContainText(name + ' · niveau');
  await page.locator('#b-acc-back').click();
  await expect(page.locator('#s-title')).toBeVisible();
  return page;
}

test.describe('R-22 garage ownership', () => {
  test.beforeEach(() => { errors.length = 0; });
  test.afterEach(async () => { await Promise.all(contexts.splice(0).map(c => c.close())); });

  test('a fresh account sees the parts it does not own greyed behind their grade, and the badge opens the Boutique', async ({ browser }) => {
    const page = await freshAccount(browser, 'Garage' + RUN);
    await page.locator('#b-play').click();
    await page.locator('#b-garage').click();
    await expect(page.locator('#s-garage')).toBeVisible();

    // The commons are open; a mythic part is locked, its badge naming the grade; a trail is locked too.
    await expect(page.locator('#g-wheels-classic')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#g-wheels-gold')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#g-buy-wheels-gold [data-grade]')).toHaveAttribute('data-grade', 'mythic');
    await expect(page.locator('#g-buy-wheels-gold')).toHaveText('Mythique');
    await expect(page.locator('#g-trail-laser')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#g-buy-trail-laser [data-grade]')).toHaveAttribute('data-grade', 'incredible');
    await expect(page.locator('#g-trail-none')).toHaveAttribute('aria-pressed', 'true');

    // A tap on the locked chip itself keeps the default and stores nothing. (`force`: Playwright
    // refuses to click inside an aria-disabled element on its own; a finger does not.)
    await page.locator('#g-wheels-gold').click({ position: { x: 8, y: 8 }, force: true });
    await expect(page.locator('#g-wheels-classic')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#g-wheels-gold')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => localStorage.getItem('politikart-kart'))).toBeNull();

    // The badge opens the Boutique on the parts; "Retour" lands on the roster, from which the Garage reopens.
    await page.locator('#g-buy-wheels-gold').click({ force: true });
    await expect(page.locator('#s-shop')).toBeVisible();
    await expect(page.locator('#shop-panel-parts')).toBeVisible();
    await expect(page.locator('#b-buy-part-wheels-gold')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('politikart-kart'))).toBeNull();
    await page.locator('#b-shop-back').click();
    await expect(page.locator('#s-select')).toBeVisible();
    await page.locator('#b-garage').click();
    await expect(page.locator('#s-garage')).toBeVisible();
    // A trail's badge leads to the Politibox, its only source.
    await page.locator('#g-buy-trail-laser').click({ force: true });
    await expect(page.locator('#s-shop')).toBeVisible();
    await expect(page.locator('#shop-panel-box')).toBeVisible();
  });
});
