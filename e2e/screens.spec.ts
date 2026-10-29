import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Stage 8's screens on the design system, driven through the DOM and the
 * keyboard like every spec.
 *
 * R-32: the circuit cards and the lobby keep the ids the suite drives
 * (DEC-009), on their new components (TrackCard + TrackMeta, PlayerCard,
 * TeamPicker, ChoiceGroup, RoomCode).
 * R-28: the layout the seed drew is named at the countdown (#hud-layout) and
 * in the pause. Nothing in the DOM steers a solo race's seed (the pre-build
 * draws it), so the spec checks that the name is one of the chosen circuit's
 * three layouts, as its card lists them, rather than that two seeds differ.
 */
const SERVER = 'http://127.0.0.1:4180/';
const RUN = Date.now().toString(36).slice(-5);
const CIRCUITS = ['elysee', 'bourbon', 'versailles', 'montmartre', 'marseille'];

const contexts: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contexts.splice(0).map(c => c.close())); });

/** A browser on the game server, signed up as `name`, in the lobby. */
async function host(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext(); contexts.push(context);
  const page = await context.newPage();
  await page.goto(SERVER);
  await page.locator('#b-account').click();
  await page.locator('#acc-name').fill(name);
  await page.locator('#acc-pass').fill('république');
  await page.locator('#b-acc-register').click();
  await expect(page.locator('#acc-level')).toHaveText(name + ' · niveau 1');
  await page.locator('#b-acc-back').click();
  await page.locator('#b-multi').click();
  await expect(page.locator('#lobby-status')).toHaveText('Connecté au serveur');
  return page;
}

test.describe('R-32 circuit cards and lobby keep their ids', () => {
  test('every circuit card carries its id, its preview canvas, its figures and its three layouts, and its thumbnail settles', async ({ page }) => {
    await page.goto('/');
    await page.locator('#b-play').click();
    await page.locator('#b-next1').click();
    await expect(page.locator('#s-tracks')).toBeVisible();
    await expect(page.locator('#trackcards .card')).toHaveCount(5);
    for (const id of CIRCUITS) {
      const card = page.locator('#track-card-' + id);
      await expect(card).toBeVisible();
      await expect(card.locator('.name')).not.toBeEmpty();
      await expect(card.locator('.desc')).not.toBeEmpty();
      await expect(card.locator('.track-thumb canvas')).toHaveCount(1);
      await expect(card.locator('.track-chip .tc-label')).toHaveText(['Longueur', 'Dénivelé', 'Largeur', 'Tours']);
      await expect(card.locator('.tl-name')).toHaveCount(3);
      await expect(card.locator('.track-climate')).toHaveCount(3);
    }
    // the rendered thumbnails (or, on a GPU the stage's governor stood still, the outlines for good) replace every pending frame
    await expect(page.locator('#trackcards .track-thumb[data-thumb="pending"]')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('#trackcards .track-thumb[data-thumb="ready"], #trackcards .track-thumb[data-thumb="static"]')).toHaveCount(5);
    // picking still works the way it did, and the start button is where it was
    await page.locator('#track-card-montmartre').click();
    await expect(page.locator('#track-card-montmartre')).toHaveClass(/sel/);
    await expect(page.locator('#trackcards .card.sel')).toHaveCount(1);
    await expect(page.locator('#b-start')).toBeVisible();
    await expect(page.locator('#b-back2')).toBeVisible();
  });

  test('the lobby renders the players as cards and keeps every id it had', async ({ browser }) => {
    const name = 'Rida' + RUN;
    const page = await host(browser, name);
    for (const id of ['#lobby-name', '#lobby-code', '#b-mp-create', '#b-mp-join', '#b-mp-back']) await expect(page.locator(id)).toBeVisible();
    await page.locator('#b-mp-create').click();
    await expect(page.locator('#lobby-room')).toContainText(/Salle [A-Z]{4}/);
    await expect(page.locator('#b-mp-copy')).toBeVisible();
    await expect(page.locator('#lobby-players .player-card')).toHaveCount(1);
    await expect(page.locator('#lobby-players .player-card').first()).toContainText(name);
    await expect(page.locator('#lobby-players .player-card').first()).toContainText('(hôte)');
    await expect(page.locator('#lobby-players .player-card.you')).toHaveCount(1);
    await expect(page.locator('[id^="lobby-trail-"]')).toHaveText(['—']);
    // the team: a ChoiceGroup whose chips keep the buttons' ids
    await expect(page.locator('#lobby-team')).toHaveAttribute('role', 'group');
    await expect(page.locator('#b-mp-team-bleu[aria-pressed="true"], #b-mp-team-rouge[aria-pressed="true"]')).toHaveCount(1);
    await page.locator('#b-mp-team-rouge').click();
    await expect(page.locator('#b-mp-team-rouge')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#lobby-players .player-card').first()).toContainText('Rouge');
    // the candidate's arrows, as before
    for (const id of ['#b-mp-char-prev', '#lobby-char', '#b-mp-char-next']) await expect(page.locator(id)).toBeVisible();
    // the circuit: one chip per circuit, the room's pressed, its layouts listed under it
    for (let i = 0; i < 5; i++) await expect(page.locator('#b-mp-track-' + i)).toBeVisible();
    await page.locator('#b-mp-track-2').click();
    await expect(page.locator('#b-mp-track-2')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#lobby-track [aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('#lobby-track-meta .tl-name')).toHaveCount(3);
    for (const id of ['#b-mp-start', '#b-mp-leave', '#lobby-invite']) await expect(page.locator(id)).toBeVisible();
    await page.locator('#b-mp-leave').click();
    await expect(page.locator('#b-mp-create')).toBeVisible();
  });
});

test.describe('R-28 the layout is named at the countdown and in the pause', () => {
  test('#hud-layout names one of the chosen circuit’s layouts under the countdown, hides at the green light, and the pause names it again', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await page.locator('#b-play').click();
    await page.locator('#b-next1').click();
    await expect(page.locator('#s-tracks')).toBeVisible();
    const layouts = (await page.locator('#trackcards .card.sel .tl-name').allTextContents()).map(s => s.trim());
    expect(layouts).toHaveLength(3);
    await page.locator('#b-start').click();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#h-center')).not.toBeEmpty();
    // at the countdown: shown, named, and on every screen size (no media query hides it)
    await expect(page.locator('#hud-layout')).toBeVisible();
    const name = ((await page.locator('#hud-layout .lr-name').textContent()) ?? '').trim();
    expect(name).not.toBe('');
    expect(layouts).toContain(name);
    // the green light takes it away
    await expect(page.locator('#h-center')).toHaveText('', { timeout: 20_000 });
    await expect(page.locator('#hud-layout')).toBeHidden();
    // the pause names it twice: the HUD's readout and the pause panel
    await page.keyboard.press('Escape');
    await expect(page.locator('#s-pause')).toBeVisible();
    await expect(page.locator('#pause-layout')).toContainText(name);
    await expect(page.locator('#hud-layout')).toBeVisible();
    await expect(page.locator('#pause-net')).toBeHidden();      // solo play: no connection to show
    await page.locator('#b-resume').click();
    await expect(page.locator('#hud-layout')).toBeHidden();
    await expect(page.locator('#h-net')).toBeHidden();
  });
});
