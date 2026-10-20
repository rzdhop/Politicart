import { expect, test, type Page } from '@playwright/test';

/**
 * The regression contract, as executable specs.
 *
 * Each `test.describe` block names the contract item from
 * `.claude/CHECKPOINT.md` that it covers. Written against the game BEFORE the
 * React port, so a failure during the port means the port broke something.
 *
 * Everything here drives the game the way a player does -- ids, text and key
 * presses -- with one marked exception for the results screen, which is
 * genuinely unreachable otherwise (see R-01b).
 */

/** Start a race and wait for the countdown to hand over to live racing. */
async function startRace(page: Page) {
  await page.locator('#b-play').click();
  await expect(page.locator('#s-select')).toBeVisible();
  await page.locator('#b-next1').click();
  await expect(page.locator('#s-tracks')).toBeVisible();
  await page.locator('#b-start').click();
  await expect(page.locator('#hud')).toBeVisible();
  // Wait for the countdown to appear and then clear. Waiting only for "empty"
  // would pass instantly, since the element starts empty and the race would
  // not be live yet.
  await expect(page.locator('#h-center')).not.toBeEmpty();
  await expect(page.locator('#h-center')).toHaveText('', { timeout: 20_000 });
}

/** The race clock, in seconds. */
async function clock(page: Page): Promise<number> {
  const text = (await page.locator('#h-time').textContent()) ?? '';
  const match = /(\d+):(\d+\.\d+)/.exec(text);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  // Three.js comes from a CDN and the renderer is built at script load, so a
  // page error here means nothing else in the spec is meaningful.
  expect(errors, `page errors on load: ${errors.join('; ')}`).toEqual([]);
});

test.describe('R-01 title -> select -> tracks -> race', () => {
  test('opens on the title screen with the game ready', async ({ page }) => {
    await expect(page.locator('#s-title')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('KART RÉPUBLIQUE');
    await expect(page.locator('#c')).toBeVisible();
    // Every other screen starts hidden.
    for (const id of ['#s-select', '#s-tracks', '#s-pause', '#s-results', '#s-admin']) {
      await expect(page.locator(id)).toBeHidden();
    }
    await expect(page.locator('#hud')).toBeHidden();
  });

  test('shows the full cast on the select screen', async ({ page }) => {
    await page.locator('#b-play').click();
    await expect(page.locator('#s-select')).toBeVisible();
    await expect(page.locator('#s-title')).toBeHidden();
    // Eleven candidates, each a focusable tile with a portrait.
    await expect(page.locator('#roster .tile')).toHaveCount(16);
    await expect(page.locator('#roster .tile img')).toHaveCount(16);
    // The first is selected, and the showcase describes them.
    await expect(page.locator('#roster .tile').first()).toHaveClass(/sel/);
    await expect(page.locator('#showcase .big')).not.toBeEmpty();
    await expect(page.locator('#showcase .stat')).toHaveCount(3);
    await expect(page.locator('#showcase .powerbox')).toBeVisible();
  });

  test('changes the showcase when another candidate is picked', async ({ page }) => {
    await page.locator('#b-play').click();
    const first = await page.locator('#showcase .big').textContent();
    await page.locator('#roster .tile').nth(3).click();
    await expect(page.locator('#roster .tile').nth(3)).toHaveClass(/sel/);
    await expect(page.locator('#showcase .big')).not.toHaveText(first ?? '');
  });

  test('offers the three circuits', async ({ page }) => {
    await page.locator('#b-play').click();
    await page.locator('#b-next1').click();
    await expect(page.locator('#s-tracks')).toBeVisible();
    await expect(page.locator('#trackcards .card')).toHaveCount(3);
    // Each card names its circuit, previews it and describes it.
    await expect(page.locator('#trackcards .card .name').first()).not.toBeEmpty();
    await expect(page.locator('#trackcards .card canvas')).toHaveCount(3);
    await expect(page.locator('#trackcards .card .desc')).toHaveCount(3);

    await page.locator('#trackcards .card').nth(2).click();
    await expect(page.locator('#trackcards .card').nth(2)).toHaveClass(/sel/);
  });

  test('goes back without losing the way forward', async ({ page }) => {
    await page.locator('#b-play').click();
    await page.locator('#b-next1').click();
    await page.locator('#b-back2').click();
    await expect(page.locator('#s-select')).toBeVisible();
    await page.locator('#b-back1').click();
    await expect(page.locator('#s-title')).toBeVisible();
    // And forward again, to prove nothing was torn down.
    await page.locator('#b-play').click();
    await expect(page.locator('#roster .tile')).toHaveCount(16);
  });

  test('starts a race, counting down first', async ({ page }) => {
    await page.locator('#b-play').click();
    await page.locator('#b-next1').click();
    await page.locator('#b-start').click();

    // The HUD replaces the menus, and the keyboard note goes away.
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#s-tracks')).toBeHidden();
    await expect(page.locator('#note')).toBeHidden();

    // The countdown announces itself before the race is live.
    await expect(page.locator('#h-center')).not.toBeEmpty();
    await expect(page.locator('#h-center')).toHaveText('', { timeout: 20_000 });
  });
});

test.describe('R-01b results screen', () => {
  /**
   * The only white-box spec in this suite, and deliberately so.
   *
   * There is no race time cap: `G.resultsAt` starts at Infinity and the race
   * ends only when the player completes three laps. Reaching the results
   * screen by driving would mean several minutes of competent automated
   * steering per run, which is neither fast enough to run after every stage
   * nor reliable. So this ends the race through the engine's own seam,
   * `endRace()`, with the real kart state a real race produced, and checks
   * that the results screen follows from the state machine.
   *
   * Before stage 11 this called a `showResults()` global that the single-file
   * game happened to expose; the port replaced it with `window.__kr.endRace`,
   * a hook the game installs for exactly this purpose. Everything the results
   * table itself does is covered by unit tests and stories in packages/ui.
   */
  test('renders the finishing order, with the player highlighted', async ({ page }) => {
    await startRace(page);
    await page.evaluate(() => {
      (window as unknown as { __kr: { endRace: () => void } }).__kr.endRace();
    });

    await expect(page.locator('#s-results')).toBeVisible();
    await expect(page.locator('#hud')).toBeHidden();
    await expect(page.locator('#r-sub')).not.toBeEmpty();
    // Six racers: the player plus five opponents.
    await expect(page.locator('#r-body tr')).toHaveCount(6);
    await expect(page.locator('#r-body tr.you')).toHaveCount(1);
    await expect(page.locator('#r-body tr').first().locator('td.r')).not.toBeEmpty();

    // And back to the menu from there.
    await page.locator('#b-menu').click();
    await expect(page.locator('#s-title')).toBeVisible();
  });
});

test.describe('R-02 live HUD', () => {
  test('shows every readout once the race is live', async ({ page }) => {
    await startRace(page);
    await expect(page.locator('#h-pos')).not.toBeEmpty();
    await expect(page.locator('#h-lap')).toContainText('TOUR');
    await expect(page.locator('#h-time')).not.toBeEmpty();
    await expect(page.locator('#h-speed')).not.toBeEmpty();
    await expect(page.locator('#minimap')).toBeVisible();
    // The item slot starts empty and the power gauge names the character's power.
    await expect(page.locator('#h-item .nm')).not.toBeEmpty();
    await expect(page.locator('#h-pname')).not.toBeEmpty();
    await expect(page.locator('#h-pkey')).not.toBeEmpty();
    await expect(page.locator('#h-wrong')).toBeHidden();
  });

  test('advances the race clock', async ({ page }) => {
    await startRace(page);
    const before = await clock(page);
    await page.waitForTimeout(1200);
    const after = await clock(page);
    expect(after, `clock did not advance: ${before} -> ${after}`).toBeGreaterThan(before);
  });

  test('reports speed that responds to the throttle', async ({ page }) => {
    await startRace(page);
    // Stationary at the line.
    expect(Number(await page.locator('#h-speed').textContent())).toBe(0);

    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1500);
    const moving = Number(await page.locator('#h-speed').textContent());
    await page.keyboard.up('ArrowUp');
    expect(moving, 'accelerating did not raise the speed readout').toBeGreaterThan(0);
  });

  test('fills the drift gauge while drifting', async ({ page }) => {
    await startRace(page);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1200);
    // Drift needs a turn held with the drift key.
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('Space');
    // Watched throughout the drift rather than read once at its end. The
    // player starts in the left lane of a straight, and a held drift swings
    // the kart into the left wall about 0.5 s of game time in; a steep enough
    // hit cancels the drift and empties the gauge, as it should. A single
    // read after 1.2 s therefore sampled whatever was left after that hit,
    // and passed or failed on the impact angle. Game time never runs ahead of
    // the wall clock (each frame's step is capped at 50 ms), so polling every
    // 50 ms cannot step over a drift that lasts half a second.
    // #h-drift is the fill element itself, not a wrapper.
    await expect
      .poll(() => page.locator('#h-drift').evaluate((el) => el.style.width), {
        message: 'drift gauge stayed empty while drifting',
        intervals: [50],
        timeout: 1200,
      })
      .not.toBe('0%');
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowUp');
  });
});

test.describe('R-03 pause, resume and quit', () => {
  test('freezes the race and comes back to it', async ({ page }) => {
    await startRace(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#s-pause')).toBeVisible();

    // Paused means paused: the clock must not move.
    const held = await clock(page);
    await page.waitForTimeout(1000);
    expect(await clock(page)).toBe(held);

    await page.locator('#b-resume').click();
    await expect(page.locator('#s-pause')).toBeHidden();
    await page.waitForTimeout(1000);
    expect(await clock(page)).toBeGreaterThan(held);
  });

  test('resumes on Escape as well as the button', async ({ page }) => {
    await startRace(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#s-pause')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#s-pause')).toBeHidden();
  });

  test('quits to the menu and hides the HUD', async ({ page }) => {
    await startRace(page);
    await page.keyboard.press('Escape');
    await page.locator('#b-quit').click();
    await expect(page.locator('#s-title')).toBeVisible();
    await expect(page.locator('#hud')).toBeHidden();
  });
});

test.describe('R-04 sound toggle', () => {
  test('toggles from the title screen button', async ({ page }) => {
    const button = page.locator('#b-mute');
    await expect(button).toContainText('activé');
    await button.click();
    await expect(button).toContainText('coupé');
    await button.click();
    await expect(button).toContainText('activé');
  });

  test('toggles with the M key', async ({ page }) => {
    const button = page.locator('#b-mute');
    await page.keyboard.press('m');
    await expect(button).toContainText('coupé');
    await page.keyboard.press('m');
    await expect(button).toContainText('activé');
  });
});

test.describe('R-05 graphics toggle', () => {
  test('switches between detailed and light', async ({ page }) => {
    const button = page.locator('#b-poly');
    await expect(button).toContainText('détaillés');
    await button.click();
    await expect(button).not.toContainText('détaillés');
    await button.click();
    await expect(button).toContainText('détaillés');
  });

  test('still races after switching to light graphics', async ({ page }) => {
    await page.locator('#b-poly').click();
    await startRace(page);
    await expect(page.locator('#h-speed')).not.toBeEmpty();
  });
});

// R-06 (the Workshop) moved to e2e/admin.spec.ts: it is the admin's now, on
// the game server, and this file runs on the static build.

test.describe('R-07 keyboard controls', () => {
  test.beforeEach(async ({ page }) => {
    await startRace(page);
  });

  /**
   * The title screen's legend reads "↑ / Z accélérer", but the game reads
   * `e.code`, and the physical key printed Z on an AZERTY keyboard emits
   * `KeyW`. So the codes to exercise are ArrowUp and KeyW -- which is the game
   * being correct, not inconsistent: reading codes rather than characters is
   * what makes the same physical keys work on both layouts.
   */
  test('accepts the documented accelerate keys', async ({ page }) => {
    for (const key of ['ArrowUp', 'w']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(900);
      const speed = Number(await page.locator('#h-speed').textContent());
      await page.keyboard.up(key);
      expect(speed, `${key} did not accelerate`).toBeGreaterThan(0);
      // Coast back to a stop before trying the next key.
      await page.waitForTimeout(1200);
    }
  });

  test('steers, which changes the kart heading on the minimap', async ({ page }) => {
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(800);
    const before = await page.locator('#minimap').screenshot();
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(1200);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowUp');
    const after = await page.locator('#minimap').screenshot();
    expect(Buffer.compare(before, after), 'steering changed nothing on the minimap').not.toBe(0);
  });

  test('releases cleanly when the window loses focus', async ({ page }) => {
    // The game clears its key state on blur so a held throttle cannot stick.
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1500);
    const held = Number(await page.locator('#h-speed').textContent());
    expect(held, 'the kart never got moving').toBeGreaterThan(0);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(2500);
    const coasting = Number(await page.locator('#h-speed').textContent());
    await page.keyboard.up('ArrowUp');
    // Compared against the speed it reached rather than an absolute figure:
    // what matters is that it stopped being driven, not how fast it coasts.
    expect(coasting, 'the kart kept accelerating after blur').toBeLessThan(held);
  });
});

test.describe('R-08 minimap', () => {
  test('draws something, rather than staying blank', async ({ page }) => {
    await startRace(page);
    const drawn = await page.locator('#minimap').evaluate((canvas) => {
      const context = (canvas as HTMLCanvasElement).getContext('2d');
      if (!context) return false;
      const { data } = context.getImageData(
        0,
        0,
        (canvas as HTMLCanvasElement).width,
        (canvas as HTMLCanvasElement).height,
      );
      // Any non-transparent pixel means the track and dots were painted.
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
      return false;
    });
    expect(drawn, 'the minimap canvas is empty').toBe(true);
  });
});

test.describe('R-09 resize', () => {
  test('keeps the canvas filling the viewport', async ({ page }) => {
    await startRace(page);
    await page.setViewportSize({ width: 900, height: 600 });
    await page.waitForTimeout(500);
    let box = await page.locator('#c').boundingBox();
    expect(box?.width).toBeCloseTo(900, 0);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);
    box = await page.locator('#c').boundingBox();
    expect(box?.width).toBeCloseTo(1280, 0);
    // And the HUD is still there afterwards.
    await expect(page.locator('#h-speed')).toBeVisible();
  });

  test('shrinks the HUD at phone width', async ({ page }) => {
    await startRace(page);
    const cssWidth = () =>
      page.locator('#minimap').evaluate((el) => getComputedStyle(el).width);

    // Measured as computed CSS width rather than a bounding box: the minimap
    // carries a 1px border, so its box is 2px wider than the width the
    // stylesheet sets, and asserting on the box would be asserting on the
    // border.
    expect(await cssWidth()).toBe('150px');

    await page.setViewportSize({ width: 420, height: 740 });
    await page.waitForTimeout(400);
    // Below 600px the stylesheet shrinks the minimap and hides the hint.
    expect(await cssWidth()).toBe('100px');
    await expect(page.locator('#h-hint')).toBeHidden();
  });
});
