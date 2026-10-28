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

test.describe('R-10c the select stage under a finger', () => {
  /** Drag one finger from (x, y) by (dx, dy) in small steps, the way a thumb swipes. */
  async function swipe(page: Page, x: number, y: number, dx: number, dy: number) {
    let cdp = sessions.get(page);
    if (!cdp) { cdp = await page.context().newCDPSession(page); sessions.set(page, cdp); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 12, y: y + dy * i / 12 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const yaw = (page: Page) => page.evaluate(() => (window as unknown as { __kr: { stage: () => { yaw: number } } }).__kr.stage().yaw);

  test('turns the podium under a sideways swipe and scrolls the screen under an upright one', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/');
    await page.locator('#b-play').tap();
    await page.waitForFunction(() => (window as unknown as { __kr: { stage: () => { ready: boolean } } }).__kr.stage().ready, null, { timeout: 120_000 });
    const band = page.locator('#showcase-stage');
    expect(await band.evaluate((el) => getComputedStyle(el).touchAction)).toBe('pan-y');
    const box = (await band.boundingBox())!, cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    // sideways: the podium turns with the thumb
    const before = await yaw(page);
    await swipe(page, cx - 100, cy, 200, 0);
    await expect.poll(async () => Math.abs((await yaw(page)) - before), { timeout: 30_000 }).toBeGreaterThan(1);
    // upright: the page scrolls on to the roster, the band does not hold it
    const screen = page.locator('#s-select');
    const top = await screen.evaluate((el) => el.scrollTop);
    await swipe(page, cx, cy + 40, 0, -220);
    await expect.poll(() => screen.evaluate((el) => el.scrollTop), { timeout: 30_000 }).toBeGreaterThan(top + 40);
  });
});

test.describe('R-10d the note banner on a phone', () => {
  type Rect = { top: number; bottom: number; left: number; right: number };
  /** The note, the roster screen and what a finger would touch under the note. */
  const look = (page: Page) => page.evaluate(() => {
    const note = document.getElementById('note')!, screen = document.getElementById('s-select')!, close = document.getElementById('note-close')!;
    const box = (el: Element) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
    const n = box(note), c = box(close), s = box(screen);
    // a grid of points over the note, its × left out: none may land on the screen (a tile, a button, anything under the note)
    const under: string[] = [];
    for (let x = n.left + 2; x < n.right - 1; x += 12) for (let y = n.top + 2; y < n.bottom - 1; y += 6) {
      if (x >= c.left && x <= c.right && y >= c.top && y <= c.bottom) continue;
      const el = document.elementFromPoint(x, y);
      if (el && el.closest('.screen')) under.push(`${el.tagName}.${el.className} at ${Math.round(x)},${Math.round(y)}`);
    }
    const tiles = [...document.querySelectorAll('#roster .tile')].map(box);
    return { note: n, screen: s, bg: getComputedStyle(note).backgroundColor, under, tiles, next: box(document.getElementById('b-next1')!),
      scrolls: screen.scrollHeight > screen.clientHeight };
  });
  /** Whether the part of tile `t` the screen shows (its scrollport `clip` cuts it) meets the note `n`. */
  const meets = (t: Rect, clip: Rect, n: Rect) => {
    const top = Math.max(t.top, clip.top), bottom = Math.min(t.bottom, clip.bottom);
    return bottom > top && t.left < n.right && t.right > n.left && top < n.bottom && bottom > n.top;
  };

  for (const [w, h] of [[390, 844], [844, 390]] as const) {
    test(`sits on night glass at ${w}x${h} with nothing tappable under it, at rest and at the scroll end`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await page.locator('#b-play').tap();
      await expect(page.locator('#s-select')).toBeVisible();
      await expect(page.locator('#note')).toBeVisible();
      let r = await look(page);
      // a backing, not bare text over the tiles
      const alpha = Number(/rgba?\(([^)]+)\)/.exec(r.bg)![1]!.split(',')[3] ?? 1);
      expect(alpha, `the note's background is ${r.bg}`).toBeGreaterThan(0.5);
      // the screen ends above the note, by the room it reserves (DEC-042): the note's measured height, 8px under it and a 6px gap
      expect(r.screen.bottom).toBeLessThanOrEqual(r.note.top);
      expect(Math.abs(r.note.top - 6 - r.screen.bottom), 'the reserve matches the note').toBeLessThanOrEqual(1);
      expect(r.scrolls, 'the roster scrolls').toBe(true);
      // at rest: no tile shows under the note, and nothing on the screen catches a finger there
      expect(r.tiles.filter(t => meets(t, r.screen, r.note)), 'tiles under the note at rest').toEqual([]);
      expect(r.under, 'what a finger on the note would touch').toEqual([]);
      // at the scroll's end the last tile and the button row clear the note
      await page.locator('#s-select').evaluate((el) => el.scrollTo(0, el.scrollHeight));
      r = await look(page);
      expect(r.tiles.at(-1)!.bottom, 'the last tile, clear of the note').toBeLessThanOrEqual(r.note.top);
      expect(r.next.bottom, '"Choisir le circuit", clear of the note').toBeLessThanOrEqual(r.note.top);
      expect(r.under).toEqual([]);
    });
  }

  test('closes from its × button, by touch or keyboard, and gives the screen its room back', async ({ page }) => {
    await page.goto('/');
    const close = page.locator('#note-close');
    await expect(close).toHaveAttribute('aria-label', 'Masquer la note');
    await expect(close).toHaveJSProperty('tagName', 'BUTTON');
    // the keyboard: Enter closes the note, and does not also play (game.js reads Enter on the title as "Jouer")
    await close.focus();
    await expect(close).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#note')).toBeHidden();
    await expect(page.locator('#s-title')).toBeVisible();
    // by touch, after a reload: the roster's screen then reaches the bottom of the window
    await page.reload();
    await page.locator('#b-play').tap();
    await expect(page.locator('#s-select')).toBeVisible();
    const box = (await close.boundingBox())!;
    expect(Math.min(box.width, box.height), 'the × is at least 24px').toBeGreaterThanOrEqual(24);
    await close.tap();
    await expect(page.locator('#note')).toBeHidden();
    await expect(page.locator('#s-select')).toBeVisible();
    const bottom = await page.locator('#s-select').evaluate((el) => el.getBoundingClientRect().bottom);
    expect(bottom).toBe(await page.evaluate(() => innerHeight));
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
