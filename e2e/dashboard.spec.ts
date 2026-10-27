import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { ADMIN_PASSWORD, ADMIN_USER } from './fixtures/admin';

/**
 * R-19 -- the admin's dashboard and the god seat (DEC-030), on the game
 * server (port 4180, see playwright.config.ts): the figures, the accounts
 * with a ban, the rooms, and the admin entering a player's room as a god who
 * then races in it. R-20 -- the admin's absolute power (DEC-031): entering a
 * race already running, and ending it from the god console. Driven through
 * the DOM like every other spec.
 */
const SERVER = 'http://127.0.0.1:4180/';

// Account names are unique per server; a suffix keeps reruns against a reused server apart.
const RUN = Date.now().toString(36).slice(-5);

const errors: string[] = [];
// Every context a spec opens is closed after it: a page left racing keeps rendering
// in the background and starves the specs that follow (software WebGL).
const contexts: BrowserContext[] = [];

/** A fresh browser on the game server, once it has found the server. */
async function visitor(browser: Browser): Promise<Page> {
  const context = await browser.newContext(); contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(SERVER);
  await expect(page.locator('#b-account')).toBeVisible();
  return page;
}

/** From the title, log in (or sign up) through Compte and come back to the title. */
async function signIn(page: Page, name: string, password: string, { register = false } = {}) {
  await page.locator('#b-account').click();
  await page.locator('#acc-name').fill(name);
  await page.locator('#acc-pass').fill(password);
  await page.locator(register ? '#b-acc-register' : '#b-acc-login').click();
  await expect(page.locator('#acc-level')).toContainText(name + ' · niveau');
  await page.locator('#b-acc-back').click();
  await expect(page.locator('#s-title')).toBeVisible();
}

/** A player with an account, in the lobby, hosting a fresh room. Returns the page and the room code. */
async function host(browser: Browser, name: string): Promise<{ page: Page; code: string }> {
  const page = await visitor(browser);
  await signIn(page, name, 'république', { register: true });
  await page.locator('#b-multi').click();
  await expect(page.locator('#lobby-status')).toHaveText('Connecté au serveur');
  await page.locator('#b-mp-create').click();
  const code = ((await page.locator('#lobby-room').textContent()) ?? '').match(/Salle ([A-Z]{4})/)?.[1];
  expect(code).toBeTruthy();
  return { page, code: code! };
}

test.beforeEach(() => { errors.length = 0; });
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map(c => c.close()));
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test.describe('R-19 dashboard', () => {
  test('is offered to the admin only, shows the figures and the open room, and bans an account', async ({ browser }) => {
    const alice = 'Alice' + RUN;
    const { page: player, code } = await host(browser, alice);

    const admin = await visitor(browser);
    await expect(admin.locator('#b-dashboard')).toHaveCount(0);        // nobody sees it logged out
    await signIn(admin, ADMIN_USER, ADMIN_PASSWORD);
    await admin.locator('#b-dashboard').click();
    await expect(admin.locator('#s-dashboard')).toBeVisible();

    // The figures come from the server: at least the two accounts of this spec, one room open.
    await expect(admin.locator('#dash-fig-accounts')).toContainText('comptes');
    await expect.poll(async () => Number(((await admin.locator('#dash-fig-accounts').textContent()) ?? '').match(/^\d+/)?.[0] ?? '0')).toBeGreaterThanOrEqual(2);
    await expect(admin.locator('#dash-fig-rooms')).toContainText('salles ouvertes');
    await expect(admin.locator('#dash-rooms')).toContainText(code);
    await expect(admin.locator('#dash-rooms')).toContainText(alice);
    await expect(admin.locator('#dash-conns')).toContainText(alice);

    // Search the player, ban them with a reason: their socket closes, their login is refused.
    await admin.locator('#dash-user-q').fill(alice.toLowerCase());
    await admin.locator('#b-dash-search').click();
    await expect(admin.locator('#dash-users tr')).toHaveCount(1);
    await expect(admin.locator('#dash-users')).toContainText(alice);
    await admin.locator('#dash-ban-reason').fill('spam');
    await admin.locator('#dash-users tr').first().locator('button', { hasText: 'Bannir' }).click();
    await expect(admin.locator('#dash-status')).toContainText('Compte banni');
    await expect(admin.locator('#dash-users')).toContainText('banni·e : spam');
    await expect(player.locator('#lobby-error')).toContainText('banni');

    const again = await visitor(browser);
    await again.locator('#b-account').click();
    await again.locator('#acc-name').fill(alice);
    await again.locator('#acc-pass').fill('république');
    await again.locator('#b-acc-login').click();
    await expect(again.locator('#acc-error')).toContainText('banni');

    // Lift the ban: the login works again.
    await admin.locator('#dash-users tr').first().locator('button', { hasText: 'Débannir' }).click();
    await expect(admin.locator('#dash-status')).toContainText('levé');
    await again.locator('#b-acc-login').click();
    await expect(again.locator('#acc-level')).toContainText(alice);

    await admin.locator('#b-dash-back').click();
    await expect(admin.locator('#s-title')).toBeVisible();
  });

  test('the admin enters a room as a god, races in it with no team, and the mortals score', async ({ browser }) => {
    test.setTimeout(150_000);
    const bob = 'Bob' + RUN;
    const { page: player, code } = await host(browser, bob);

    const admin = await visitor(browser);
    await signIn(admin, ADMIN_USER, ADMIN_PASSWORD);
    await admin.locator('#b-dashboard').click();
    await expect(admin.locator('#dash-rooms')).toContainText(code);
    await admin.locator('#b-dash-god-' + code).click();

    // In the lobby as a god: no team buttons, flagged in the list on both screens.
    await expect(admin.locator('#s-lobby')).toBeVisible();
    await expect(admin.locator('#lobby-room')).toContainText(code);
    await expect(admin.locator('#lobby-god')).toBeVisible();
    await expect(admin.locator('#b-mp-team-bleu')).toHaveCount(0);
    for (const p of [player, admin]) {
      await expect(p.locator('#lobby-players tr')).toHaveCount(2);
      await expect(p.locator('#lobby-players tr').nth(1)).toContainText('(dieu)');
    }
    await expect(player.locator('#lobby-error')).toContainText('dieu');

    // The god readies up like anyone, the host starts, both race; the god's HUD says so.
    // The race clock (from the server's snapshots) is what says the race is on: a slow
    // machine can draw too few frames to catch the green light itself.
    await admin.locator('#b-mp-ready').click();
    await expect(player.locator('#b-mp-start')).toBeEnabled();
    await player.locator('#b-mp-start').click();
    for (const p of [player, admin]) {
      await expect(p.locator('#hud')).toBeVisible({ timeout: 30_000 });
      await expect(p.locator('#h-time')).not.toHaveText(/^0:00\.00/, { timeout: 30_000 });
    }
    await expect(admin.locator('#h-pkey')).toHaveText('F · MODE DIEU');
    await expect(player.locator('#h-pkey')).not.toHaveText('F · MODE DIEU');

    // The race is capped at 15 s on this server: the results list seven karts, the god among them, outside the teams.
    await expect(player.locator('#s-results')).toBeVisible({ timeout: 45_000 });
    await expect(admin.locator('#s-results')).toBeVisible({ timeout: 45_000 });
    await expect(player.locator('#r-body tr')).toHaveCount(7);
    await expect(player.locator('#r-body')).toContainText('(dieu)');
    await expect(player.locator('#r-body')).toContainText('hors classement');
    await expect(player.locator('#r-teams tr')).toHaveCount(1);
  });
});

test.describe('R-20 absolute power', () => {
  test('the admin enters a race already running, from the dashboard, and ends it from the god console', async ({ browser }) => {
    test.setTimeout(150_000);
    // Races are capped at 15 s on this server (for three laps): the admin waits on the dashboard before the race starts.
    const carol = 'Carol' + RUN;
    const { page: player, code } = await host(browser, carol);
    const admin = await visitor(browser);
    await signIn(admin, ADMIN_USER, ADMIN_PASSWORD);
    await admin.locator('#b-dashboard').click();
    await expect(admin.locator('#b-dash-god-' + code)).toHaveText('Entrer en dieu');

    // Alone in the room, the host starts at once: the race is running before the admin enters it.
    await player.locator('#b-mp-start').click();
    await expect(player.locator('#hud')).toBeVisible({ timeout: 30_000 });
    await expect(player.locator('#b-god-console')).toHaveCount(0);           // no console for a player
    await admin.locator('#b-dash-refresh').click();
    await expect(admin.locator('#b-dash-god-' + code)).toHaveText('Entrer dans la course');
    // From afar first: the race is set to nine laps, which also lengthens the server's cap three times.
    await admin.locator('#b-dash-manage-' + code).click();
    await expect(admin.locator('#dash-god-' + code + '-targets button')).toHaveCount(7);   // "Tous" and six karts
    await admin.locator('#dash-god-' + code + '-laps-9').click();
    await expect(admin.locator('#dash-status')).toContainText('9 tours');
    await expect(player.locator('#h-lap')).toContainText('/9');
    await admin.locator('#b-dash-god-' + code).click();

    // Straight into the race, as a god.
    await expect(admin.locator('#hud')).toBeVisible({ timeout: 45_000 });
    await expect(admin.locator('#h-pkey')).toHaveText('F · MODE DIEU', { timeout: 30_000 });

    // The god console: the G key opens it, it lists the seven karts, it strikes them, and the race ends at a click.
    await admin.keyboard.press('KeyG');
    await expect(admin.locator('#god-panel')).toBeVisible();
    await expect(admin.locator('#god-targets button')).toHaveCount(8);       // "Tous" and seven karts
    await admin.locator('#god-stun').click();
    await expect(admin.locator('#god-reply')).toContainText('foudroy');
    await admin.locator('#god-finish').click();
    for (const p of [player, admin]) {
      await expect(p.locator('#s-results')).toBeVisible({ timeout: 20_000 });
      await expect(p.locator('#r-body tr')).toHaveCount(7);
    }
    await expect(player.locator('#r-body')).toContainText('(dieu)');
  });
});
