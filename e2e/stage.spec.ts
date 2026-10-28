import { expect, test, type Page } from '@playwright/test';

/**
 * R-25 -- the 3D select stage (PLAN stage 7): the hemicycle, the podium, the
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
  /** How many portraits are final, of how many, and what rendering the last one cost (ms). */
  portraits: { ready: number; total: number; ms: number };
  /** The Garage's part programs still to compile ahead (engine/preview.js planParts). */
  parts: number;
  /** Whether the stage stands still (the frame governor), and its measured frame cost in ms. */
  still: boolean;
  frameMs: number | null;
  /** The "go" launch (engine/preview.js launch): playing, how far, how many played. */
  launch: { on: boolean; t: number | null; count: number };
}

/** What the portrait spec records in the page (performance.now() times). */
interface PortraitLog {
  /** The stage's first frame. */
  first: number | null;
  /** Each change of the count of tiles marked final. */
  patches: { at: number; ready: number }[];
  /** Each portrait the stage finished, as polled: the count, and the last one's render cost. */
  done: { at: number; ready: number; ms: number }[];
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

test.describe('R-25 the select stage', () => {
  // R-26 (CHECKPOINT's contract): the progressive portraits
  test('hands every tile a placeholder at once, then every portrait one after another, each at about its own render cost', async ({ page }) => {
    test.setTimeout(240_000);
    // Recorded in the page from before the click, so the CPU's load moves no bound: when the stage drew its
    // first frame (its warm-up, building and compiling a whole stage, is over), each patch of tiles going final
    // (a MutationObserver on the roster), and each portrait the stage finished with what rendering it cost
    // (stageInfo's portraits.ms, the stage's own measure, as slow as the machine is at that moment).
    await page.evaluate(() => {
      const w = window as unknown as { __kr: { stage: () => StageInfo }; __portraits: PortraitLog };
      const log: PortraitLog = { first: null, patches: [], done: [] };
      w.__portraits = log;
      let shown = 0, done = 0;
      new MutationObserver(() => {
        const n = document.querySelectorAll('#roster .tile[data-portrait="ready"]').length;
        if (n !== shown) { shown = n; log.patches.push({ at: performance.now(), ready: n }); }
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-portrait'] });
      const poll = setInterval(() => {
        const s = w.__kr.stage();
        if (log.first === null && s.info.calls > 0) log.first = performance.now();
        if (s.portraits.ready !== done) { done = s.portraits.ready; log.done.push({ at: performance.now(), ready: done, ms: s.portraits.ms }); }
        if (done >= s.portraits.total) clearInterval(poll);
      }, 100);
    });
    await page.locator('#b-play').click();
    // at once: sixteen images, each already showing something (the kart's colour and the initials)
    await expect(page.locator('#roster .tile img')).toHaveCount(16, { timeout: 2_000 });
    const srcs = await page.locator('#roster .tile img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src));
    for (const s of srcs) expect(s.startsWith('data:image/')).toBe(true);
    expect(await page.locator('#roster .tile.pending').count()).toBeGreaterThan(0);
    // then each one final. The wait is headroom only (all 16 take about 35 s from the click on this container
    // when idle, about 90 s at load 11); the bound is each portrait's cost, below, which the load does not move
    await portraitsReady(page, 200_000);
    await expect(page.locator('#roster .tile.pending')).toHaveCount(0);
    await expect(page.locator('#roster .tile[aria-busy]')).toHaveCount(0);
    const log = await page.evaluate(() => (window as unknown as { __portraits: PortraitLog }).__portraits);
    const last = log.patches[log.patches.length - 1]!;
    expect(log.first, 'the stage drew a frame').not.toBeNull();
    expect(last.ready).toBe(16);
    // progressively: the tiles go final in several patches as the portraits land, not all at once at the end (DEC-045)
    expect(log.patches.filter((p) => p.ready > 0).length, 'patches of final tiles').toBeGreaterThanOrEqual(3);
    // and each portrait costs about one render of it, everything between included (its rig built, its programs
    // compiled a frame's share at a time, the UI patched): from the stage's first frame to the last portrait,
    // under 2.5 times the median render cost per portrait. That holds however busy the CPU is (measured 1.4 to
    // 1.7 from idle to load 12): a wait between portraits (the quiet delay after each one: 2.7), a compile again
    // per portrait or the stage starving them breaks it. The median is not moved by the first renders, which pay for the target's pipelines.
    const costs = log.done.map((d) => d.ms).sort((a, b) => a - b);
    expect(costs.length, 'portraits seen landing').toBeGreaterThanOrEqual(8);
    const median = costs[costs.length >> 1]!, perPortrait = (last.at - log.first!) / 16;
    expect(perPortrait / median, `${Math.round(perPortrait)} ms a portrait, ${median} ms to render one`).toBeLessThan(2.5);
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

  for (const [w, h] of [[844, 390], [667, 375]] as const) {
    test.describe(`held sideways at ${w}x${h}`, () => {
      test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });

      test('keeps the showcase pinned and whole at every scroll position, on the roster and in the Garage', async ({ page }) => {
        test.setTimeout(150_000);
        await play(page);
        for (const [screen, showcase] of [['#s-select', '#showcase'], ['#s-garage', '#g-showcase']] as const) {
          if (screen === '#s-garage') { await page.locator('#b-garage').click(); await expect(page.locator('#s-garage')).toBeVisible(); }
          const seen: number[][] = [];
          for (const at of [0, 0.5, 1]) {
            const r = await page.evaluate(([s, c, f]) => {
              const el = document.querySelector(s as string) as HTMLElement;
              el.scrollTo(0, (el.scrollHeight - el.clientHeight) * (f as number));
              const b = document.querySelector(c as string)!.getBoundingClientRect(), note = document.getElementById('note')!;
              return { top: b.top, bottom: b.bottom, floor: note.hidden ? innerHeight : note.getBoundingClientRect().top, scrolls: el.scrollHeight > el.clientHeight };
            }, [screen, showcase, at]);
            expect(r.scrolls, `${screen} scrolls`).toBe(true);
            expect(r.top, `${screen} at ${at}: the showcase's top`).toBeGreaterThanOrEqual(0);
            expect(r.bottom, `${screen} at ${at}: the showcase's bottom, clear of the note`).toBeLessThanOrEqual(r.floor);
            seen.push([Math.round(r.top), Math.round(r.bottom)]);
          }
          expect(seen[1], `${screen}: pinned mid-scroll`).toEqual(seen[0]);
          expect(seen[2], `${screen}: pinned at the end`).toEqual(seen[0]);
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
