import { expect, test, type CDPSession, type Page } from '@playwright/test';

/**
 * Phones: the same game, held in the hand. A phone-sized, touch-enabled page
 * (portrait, then landscape), driven with real touches through the Chrome
 * DevTools Protocol -- the way a thumb drives it -- rather than keys.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

// One DevTools session per page: a touch must start and end on the same one.
const sessions = new WeakMap<Page, CDPSession>();

/** Put a finger down on the left part of `selector`, or lift every finger. */
async function finger(page: Page, selector: string | null) {
  let cdp = sessions.get(page);
  if (!cdp) { cdp = await page.context().newCDPSession(page); sessions.set(page, cdp); }
  if (!selector) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); return; }
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(selector + ' has no box');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 4, y: box.y + box.height / 2 }] });
}

/** Start a race by tapping through the menus, and wait for the countdown to clear. */
async function startRace(page: Page) {
  await page.goto('/');
  await page.locator('#b-play').tap();
  await expect(page.locator('#s-select')).toBeVisible();
  await page.locator('#b-next1').scrollIntoViewIfNeeded();
  await page.locator('#b-next1').tap();
  await page.locator('#b-start').scrollIntoViewIfNeeded();
  await page.locator('#b-start').tap();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#h-center')).not.toBeEmpty();
  await expect(page.locator('#h-center')).toHaveText('', { timeout: 40_000 });
}

test.describe('R-10 phones', () => {
  test('lays the page out at the phone’s width and shows the touch legend', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(390);
    await expect(page.locator('#touch-legend')).toBeVisible();
    await expect(page.locator('#touch')).toBeHidden();       // no race yet
  });

  test('shows the touch controls in a race and accelerates by itself', async ({ page }) => {
    await startRace(page);
    await expect(page.locator('#touch')).toBeVisible();
    await expect(page.locator('#t-steer')).toBeVisible();
    await expect(page.locator('#t-drift')).toBeVisible();
    await page.waitForTimeout(1500);
    expect(Number(await page.locator('#h-speed').textContent()), 'the kart did not drive off on its own').toBeGreaterThan(0);
  });

  test('steers from the left half of the pad', async ({ page }) => {
    await startRace(page);
    await page.waitForTimeout(800);
    const before = await page.locator('#minimap').screenshot();
    await finger(page, '#t-steer');
    await expect(page.locator('#t-steer')).toHaveAttribute('data-dir', 'left');
    await page.waitForTimeout(1200);
    await finger(page, null);
    await expect(page.locator('#t-steer')).toHaveAttribute('data-dir', '');
    const after = await page.locator('#minimap').screenshot();
    expect(Buffer.compare(before, after), 'steering changed nothing on the minimap').not.toBe(0);
  });

  test('brakes while the brake is held', async ({ page }) => {
    await startRace(page);
    await page.waitForTimeout(2000);
    const driving = Number(await page.locator('#h-speed').textContent());
    await finger(page, '#t-brake');
    await page.waitForTimeout(1200);
    const braking = Number(await page.locator('#h-speed').textContent());
    await finger(page, null);
    expect(braking).toBeLessThan(driving);
  });

  test('pauses from the on-screen button and resumes', async ({ page }) => {
    await startRace(page);
    await page.locator('#t-pause').tap();
    await expect(page.locator('#s-pause')).toBeVisible();
    await expect(page.locator('#pause-kart')).toBeVisible();      // the kart card, on a phone too
    await expect(page.locator('#touch')).toBeHidden();
    await page.locator('#b-resume').tap();
    await expect(page.locator('#touch')).toBeVisible();
  });

  test('plays in landscape too', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await startRace(page);
    await expect(page.locator('#t-steer')).toBeVisible();
    await expect(page.locator('#t-item')).toBeVisible();
    // the buttons sit inside the screen, clear of each other
    const steer = await page.locator('#t-steer').boundingBox(), drift = await page.locator('#t-drift').boundingBox();
    expect(steer!.x + steer!.width).toBeLessThan(drift!.x);
    expect(drift!.x + drift!.width).toBeLessThanOrEqual(844);
  });

  test('a long press selects nothing and opens no menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#b-play')).toBeVisible();
    // Record whether a context menu was asked for and whether the game refused it.
    await page.evaluate(() => {
      const w = window as unknown as { __ctx: boolean | null };
      w.__ctx = null;
      document.addEventListener('contextmenu', e => { w.__ctx = e.defaultPrevented; });
    });
    /** What a long press left behind: the selected text and the context menu's fate. */
    const aftermath = () => page.evaluate(() => ({
      selection: window.getSelection()?.toString() ?? '',
      ctx: (window as unknown as { __ctx: boolean | null }).__ctx,
    }));
    /** Hold a thumb on `selector` for longer than any long-press delay, then lift it. */
    const longPress = async (selector: string) => {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await finger(page, selector);
      await page.waitForTimeout(900);
      await finger(page, null);
    };

    await longPress('#b-play');
    let left = await aftermath();
    expect(left.selection, 'the long press selected the button’s label').toBe('');
    if (left.ctx !== null) expect(left.ctx, 'a context menu opened on the button').toBe(true);
    // A long press may still count as the tap it started as; either screen is fine, as long as nothing was selected.
    await page.waitForTimeout(500);
    const title = await page.locator('#s-title').isVisible(), select = await page.locator('#s-select').isVisible();
    expect(title || select, 'neither the title nor the roster is on screen').toBe(true);

    // The roster: a tile is an image with a name, the two things a long press likes to grab.
    if (!select) await page.locator('#b-play').tap();
    await expect(page.locator('#s-select')).toBeVisible();
    await longPress('#roster .tile >> nth=3');
    left = await aftermath();
    expect(left.selection, 'the long press selected the tile’s name').toBe('');
    if (left.ctx !== null) expect(left.ctx, 'a context menu opened on the tile').toBe(true);
    await expect(page.locator('#s-select')).toBeVisible();
  });
});

test.describe('R-10b computers', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test('show no touch controls and keep the keyboard legend', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#touch-legend')).toHaveCount(0);
    await page.locator('#b-play').click();
    await page.locator('#b-next1').click();
    await page.locator('#b-start').click();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#touch')).toBeHidden();
  });
});
