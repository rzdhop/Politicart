import { expect, test, type Page } from '@playwright/test';

/**
 * R-23 -- the 3D select stage (PLAN stage 7): the hemicycle, the podium, the
 * candidate's kart with their pilot seated, on the select screen.
 *
 * Driven through the DOM and the keyboard like every spec, and read through
 * one read-only hook, `window.__kr.stage()` (engine/preview.js stageInfo):
 * what the last stage frame drew (the candidate, the podium's yaw, its draw
 * calls, triangles and programs, the model's box on screen), because
 * nothing in the DOM shows a WebGL frame. Software WebGL is slow here (a
 * stage frame takes about a second at 1440x900 and the shaders compile for
 * many more), so these specs wait on the hook's `ready`, never on a delay.
 */

interface StageInfo {
  charId: string | null;
  yaw: number;
  ready: boolean;
  tier: 'high' | 'phone' | 'low' | null;
  info: { calls: number; triangles: number; programs: number; geometries: number; textures: number };
  bbox: { x: number; y: number; w: number; h: number } | null;
  frame: { x: number; y: number; w: number; h: number } | null;
  portraits: { ready: number; total: number };
  /** The Garage's part programs still to compile ahead (engine/preview.js planParts). */
  parts: number;
  /** Whether the stage stands still (the frame governor), and its measured frame cost in ms. */
  still: boolean;
  frameMs: number | null;
  /** The "go" launch (engine/preview.js launch): playing, how far, how many played. */
  launch: { on: boolean; t: number | null; count: number };
}

const stage = (page: Page) => page.evaluate(() => (window as unknown as { __kr: { stage: () => StageInfo } }).__kr.stage());

/** Wait until the stage has drawn its candidate, settled (no swap running), and return what it drew. */
async function settled(page: Page, timeout = 90_000): Promise<StageInfo> {
  await page.waitForFunction(() => (window as unknown as { __kr: { stage: () => StageInfo } }).__kr.stage().ready, null, { timeout });
  return stage(page);
}

/** Every portrait final: each tile says so. */
async function portraitsReady(page: Page, timeout = 60_000) {
  await expect(page.locator('#roster .tile[data-portrait="ready"]')).toHaveCount(16, { timeout });
}

/** Every portrait final and every Garage part compiled ahead: the stage's background work done. */
async function backgroundDone(page: Page, timeout = 90_000) {
  await portraitsReady(page, timeout);
  await page.waitForFunction(() => (window as unknown as { __kr: { stage: () => StageInfo } }).__kr.stage().parts === 0, null, { timeout });
}

/** "Jouer", then the stage settled. */
async function play(page: Page) {
  await page.locator('#b-play').click();
  await expect(page.locator('#s-select')).toBeVisible();
  return settled(page);
}

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
});
test.afterEach(() => {
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

/** The rectangles of the showcase's text on the visible screen. */
async function textRects(page: Page) {
  return page.evaluate(() => {
    const sc = document.querySelector('section.screen:not([hidden]) .showcase')!;
    return ['.big', '.title', '.quote', '.stats', '.powerbox'].map((s) => {
      const el = sc.querySelector(s); if (!el) return null;
      const r = el.getBoundingClientRect();
      return { what: s, x: r.left, y: r.top, w: r.width, h: r.height };
    }).filter((r): r is { what: string; x: number; y: number; w: number; h: number } => !!r && r.w > 0 && r.h > 0);
  });
}
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

test.describe('R-23 the select stage', () => {
  test('hands every tile a placeholder at once, then every portrait within a minute', async ({ page }) => {
    test.setTimeout(150_000);
    await page.locator('#b-play').click();
    // at once: sixteen images, each already showing something (the kart's colour and the initials)
    await expect(page.locator('#roster .tile img')).toHaveCount(16, { timeout: 2_000 });
    const srcs = await page.locator('#roster .tile img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src));
    for (const s of srcs) expect(s.startsWith('data:image/')).toBe(true);
    expect(await page.locator('#roster .tile.pending').count()).toBeGreaterThan(0);
    // then each one final, a frame at a time
    const t0 = Date.now();
    await portraitsReady(page, 60_000);
    expect(Date.now() - t0).toBeLessThan(60_000);
    await expect(page.locator('#roster .tile.pending')).toHaveCount(0);
    await expect(page.locator('#roster .tile[aria-busy]')).toHaveCount(0);
  });

  for (const [w, h, mobile] of [[1440, 900, false], [924, 540, false], [390, 844, true], [844, 390, true]] as const) {
    test.describe(`at ${w}x${h}`, () => {
      // the framing is what is checked here, not the swap: with reduced motion the swap cuts, so the stage settles at once
      test.use({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, reducedMotion: 'reduce' });

      test('draws the podium and the pilot inside the band, clear of the showcase text', async ({ page }) => {
        test.setTimeout(150_000);
        await page.goto('/');
        for (const tile of [0, 3]) {                 // the standard kart, then the cargo bike
          if (tile) { await page.locator('#roster .tile').nth(tile).click(); await page.waitForFunction((i) => (window as unknown as { __kr: { stage: () => StageInfo } }).__kr.stage().charId !== 'victor' || i === 0, tile); }
          const s = tile ? await settled(page) : await play(page);
          expect(s.bbox, 'the stage reports where it drew').not.toBeNull();
          const band = await page.locator('#showcase-stage').boundingBox();
          const b = s.bbox!;
          // and it stays large: it fills the band's width or its visible height, whichever binds
          expect(Math.max(b.w / band!.width, b.h / Math.min(band!.height, h))).toBeGreaterThan(0.75);
          expect(b.x).toBeGreaterThanOrEqual(band!.x - 1); expect(b.x + b.w).toBeLessThanOrEqual(band!.x + band!.width + 1);
          expect(b.y).toBeGreaterThanOrEqual(band!.y - 1); expect(b.y + b.h).toBeLessThanOrEqual(band!.y + band!.height + 1);
          for (const r of await textRects(page)) expect(overlaps(b, r), `the stage covers ${r.what}`).toBe(false);
        }
      });
    });
  }

  test('stays within its budget on "détaillés" and on "légers", and never compiles a program on a swap', async ({ page }) => {
    test.setTimeout(240_000);
    let s = await play(page);
    expect(s.tier).toBe('high');
    // PLAN 4.2, a full stage frame, shadow pass included
    expect(s.info.calls).toBeLessThanOrEqual(160);
    expect(s.info.triangles).toBeLessThanOrEqual(130_000);
    // and the background work done: every portrait, and the Garage's every part compiled ahead, within the same budget
    await backgroundDone(page);
    s = await stage(page);
    expect(s.info.programs).toBeLessThanOrEqual(40);
    // every candidate has been drawn once (their portrait): a swap now reuses the programs
    const programs = s.info.programs;
    for (const tile of [1, 2, 3, 0]) {
      await page.locator('#roster .tile').nth(tile).click();
      s = await settled(page);
    }
    expect(s.info.programs).toBe(programs);

    // "légers": rebuilt on the low tier
    await page.locator('#b-back1').click();
    await page.locator('#b-poly').click();
    s = await play(page);
    expect(s.tier).toBe('low');
    expect(s.info.calls).toBeLessThanOrEqual(80);
    expect(s.info.triangles).toBeLessThanOrEqual(30_000);
    await portraitsReady(page, 90_000);
    s = await stage(page);
    expect(s.info.calls).toBeLessThanOrEqual(80);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });

    test('starts on "légers", and on "détaillés" keeps to the phone caps', async ({ page }) => {
      test.setTimeout(180_000);
      await page.goto('/');
      await expect(page.locator('#b-poly')).not.toContainText('détaillés');       // a coarse pointer starts light
      await page.locator('#b-poly').tap();
      await expect(page.locator('#b-poly')).toContainText('détaillés');
      await page.locator('#b-play').tap();
      const s = await settled(page);
      expect(s.tier).toBe('phone');
      expect(s.info.calls).toBeLessThanOrEqual(130);
      expect(s.info.triangles).toBeLessThanOrEqual(80_000);
    });
  });

  test('rebuilds the stage cleanly when the graphics setting changes: nothing leaks', async ({ page }) => {
    test.setTimeout(360_000);
    // each count is taken once the tier's background work is done (portraits, part programs), so two counts
    // compare the same state: what a cycle leaves behind, not how far the portraits had got
    const settle = async () => { await play(page); await backgroundDone(page); return stage(page); };
    const cycle = async () => {
      await page.locator('#b-back1').click();
      await page.locator('#b-poly').click();
      await settle();
      await page.locator('#b-back1').click();
      await page.locator('#b-poly').click();
      return settle();
    };
    await settle();
    const once = await cycle(), twice = await cycle();
    expect(twice.tier).toBe('high');
    expect(twice.info.geometries).toBeLessThanOrEqual(once.info.geometries);
    expect(twice.info.textures).toBeLessThanOrEqual(once.info.textures);
  });

  test('turns the podium when the band is dragged, either way', async ({ page }) => {
    test.setTimeout(180_000);
    await play(page);
    const band = (await page.locator('#showcase-stage').boundingBox())!;
    const drag = async (dx: number) => {
      const y = band.y + band.height / 2, x = band.x + band.width / 2 - dx / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y, { steps: 8 });
      await page.mouse.up();
    };
    const before = (await stage(page)).yaw;
    await drag(300);
    await expect.poll(async () => (await stage(page)).yaw - before, { timeout: 40_000 }).toBeGreaterThan(2);
    const mid = (await stage(page)).yaw;
    await drag(-300);
    await expect.poll(async () => (await stage(page)).yaw - mid, { timeout: 40_000 }).toBeLessThan(-2);
    // the band is the drag target, not the text: the showcase itself stays click-through
    expect(await page.locator('#showcase').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    expect(await page.locator('#showcase-stage').evaluate((el) => getComputedStyle(el).touchAction)).toBe('pan-y');
  });

  test.describe('the launch to the circuits (Q3)', () => {
    /**
     * From the click's own event to the first frame that shows #s-tracks,
     * measured in the page: the screen changes at once whether or not the
     * kart's launch plays behind it (DEC-037: never wait on an animation).
     */
    const clickToTracks = (page: Page) => page.evaluate(() => new Promise<number>((done) => {
      const button = document.querySelector('#b-next1') as HTMLElement, tracks = document.querySelector('#s-tracks') as HTMLElement;
      button.addEventListener('click', () => {
        const t0 = performance.now();
        const seen = () => { if (!tracks.hidden && tracks.getBoundingClientRect().height > 0) done(performance.now() - t0); else requestAnimationFrame(seen); };
        requestAnimationFrame(seen);
      }, { once: true, capture: true });
      button.click();
    }));

    test('opens the circuit screen within 100 ms of "Choisir le circuit →", and back on the roster the kart is on its podium', async ({ page }) => {
      test.setTimeout(150_000);
      await play(page);
      expect(await clickToTracks(page)).toBeLessThanOrEqual(100);
      await expect(page.locator('#s-tracks')).toBeVisible();
      // whether it played or not (a still stage plays none), the launch is over within 1.5 s
      await expect.poll(async () => (await stage(page)).launch.on, { timeout: 5_000 }).toBe(false);
      await page.locator('#b-back2').click();
      await expect(page.locator('#s-select')).toBeVisible();
      const back = await settled(page);
      const band = (await page.locator('#showcase-stage').boundingBox())!;
      expect(back.bbox).not.toBeNull();
      expect(back.bbox!.y).toBeGreaterThanOrEqual(band.y - 1);
      expect(back.bbox!.y + back.bbox!.h).toBeLessThanOrEqual(band.y + band.height + 1);
    });

    test.describe('under prefers-reduced-motion', () => {
      test.use({ reducedMotion: 'reduce' });

      test('plays no launch: the circuits open at once on the plain background', async ({ page }) => {
        test.setTimeout(150_000);
        await play(page);
        expect(await clickToTracks(page)).toBeLessThanOrEqual(100);
        const info = await stage(page);
        expect(info.launch.on).toBe(false);
        expect(info.launch.count).toBe(0);
      });
    });
  });

  test.describe('from the keyboard', () => {
    test.use({ reducedMotion: 'reduce' });   // the swaps cut, so the stage shows each candidate at once

    test('changes the candidate with the arrow keys and goes on with Enter', async ({ page }) => {
      test.setTimeout(120_000);
      await play(page);
      const sel = () => page.locator('#roster .tile.sel');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#roster .tile').nth(1)).toHaveClass(/sel/);
      await expect.poll(async () => (await stage(page)).charId, { timeout: 30_000 }).toBe('gege');
      // a guest drives the first row only: left twice wraps round to its end, a row down finds nothing and stays
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('#roster .tile').nth(3)).toHaveClass(/sel/);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowUp');
      await expect(page.locator('#roster .tile').nth(3)).toHaveClass(/sel/);
      await expect(sel()).toHaveCount(1);
      await expect.poll(async () => (await stage(page)).charId, { timeout: 30_000 }).toBe('capucine');
      await page.keyboard.press('Enter');
      await expect(page.locator('#s-tracks')).toBeVisible();
    });
  });
});
