import { expect, request, test, type Browser, type Page } from '@playwright/test';

import { ADMIN_PASSWORD, ADMIN_USER } from './fixtures/admin';

/**
 * R-06 -- the Workshop, now the admin's, on the game server.
 *
 * The cast lives on the game server (port 4180, see playwright.config.ts),
 * which runs with a test-only admin account and its data in memory. The admin
 * logs in through the ordinary Compte screen; only an account the server flags
 * as admin is offered the Workshop, and what it saves every player gets. The
 * static build (4173, the GitHub Pages stand-in) plays the default cast and
 * offers no Workshop.
 *
 * Every spec leaves the server's roster at the default cast -- through the
 * Workshop itself where that is the point, and again in afterEach through the
 * API, should a spec fail halfway -- so the next spec and
 * e2e/multiplayer.spec.ts start clean.
 */
const SERVER = 'http://127.0.0.1:4180/';
const STATIC = 'http://127.0.0.1:4173/';
const DEFAULT_CAST = { chars: {}, ads: [] };

// Account names are unique per server; a suffix keeps reruns against a reused server apart.
const RUN = Date.now().toString(36).slice(-5);

const errors: string[] = [];

/** A page on the game server, once it has found the server (the Compte button shows). */
async function open(page: Page): Promise<Page> {
  await page.goto(SERVER);
  await expect(page.locator('#b-account')).toBeVisible();
  return page;
}

/** A fresh browser (its own storage) on the game server: a different player, logged in nowhere. */
async function visitor(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return open(page);
}

/** From the title, log in through Compte and come back to the title. */
async function logIn(page: Page, name = ADMIN_USER, password = ADMIN_PASSWORD) {
  await page.locator('#b-account').click();
  await page.locator('#acc-name').fill(name);
  await page.locator('#acc-pass').fill(password);
  await page.locator('#b-acc-login').click();
  await expect(page.locator('#acc-level')).toContainText(name + ' · niveau');
  await page.locator('#b-acc-back').click();
  await expect(page.locator('#s-title')).toBeVisible();
}

/** Log in as the test admin and open the Workshop. */
async function openWorkshop(page: Page) {
  await logIn(page);
  await page.locator('#b-admin').click();
  await expect(page.locator('#s-admin')).toBeVisible();
}

/** Reset the Workshop to the default cast and save it. Ends on the title. */
async function resetAndSave(page: Page) {
  await page.locator('#b-admin').click();
  await page.locator('#b-admin-reset').click();
  await page.locator('#b-admin-save').click();
  await expect(page.locator('#s-title')).toBeVisible();
}

/** What the server would hand a new player right now. */
async function served(page: Page) {
  return (await page.request.get(SERVER + 'api/roster')).json();
}

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(async () => {
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
  // Safety net: the default cast on the server, whatever the spec did.
  const api = await request.newContext({ baseURL: SERVER });
  const login = await api.post('api/login', { data: { name: ADMIN_USER, password: ADMIN_PASSWORD } });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  const put = await api.put('api/admin/roster', { data: DEFAULT_CAST, headers: { authorization: 'Bearer ' + token } });
  expect(put.status()).toBe(200);
  await api.dispose();
});

test.describe('R-06 workshop', () => {
  test('renames a candidate, which reaches the server, survives a reload and reaches another player, then resets', async ({ page, browser }) => {
    await open(page);
    await openWorkshop(page);
    // One card per candidate.
    await expect(page.locator('#admin-chars .card')).toHaveCount(16);

    const field = page.locator('#adm-name-victor');
    const original = await field.inputValue();
    expect(original).not.toBe('');

    await field.fill('Jean-Michel Test');
    await page.locator('#b-admin-save').click();

    // Saving returns to the title screen and confirms on the button.
    await expect(page.locator('#s-title')).toBeVisible();
    await expect(page.locator('#b-admin')).toContainText('enregistré');

    // It reached the server...
    expect((await served(page)).chars.victor.name).toBe('Jean-Michel Test');

    // ...survives a reload, the session with it...
    await page.reload();
    await expect(page.locator('#b-admin')).toBeVisible();
    await page.locator('#b-play').click();
    await expect(page.locator('#roster')).toContainText('Jean-Michel Test');

    // ...and another player, who never logged in, plays it too.
    const other = await visitor(browser);
    await other.locator('#b-play').click();
    await expect(other.locator('#roster')).toContainText('Jean-Michel Test');

    // Reset puts the original cast back in the form, and saving it puts it back for everyone.
    await page.locator('#b-back1').click();
    await page.locator('#b-admin').click();
    await page.locator('#b-admin-reset').click();
    await expect(page.locator('#adm-name-victor')).toHaveValue(original);
    await page.locator('#b-admin-save').click();
    await expect(page.locator('#s-title')).toBeVisible();
    expect(await served(page)).toEqual(DEFAULT_CAST);
    await other.reload();
    await expect(other.locator('#b-account')).toBeVisible();
    await other.locator('#b-play').click();
    await expect(other.locator('#roster')).toContainText(original);
    await expect(other.locator('#roster')).not.toContainText('Jean-Michel Test');
  });

  test('changes a colour without losing the rest of the form', async ({ page }) => {
    await open(page);
    await openWorkshop(page);
    await page.locator('#adm-kart-victor').fill('#ff0000');
    await page.locator('#adm-title-victor').fill('Le testeur');
    await page.locator('#b-admin-save').click();
    await expect(page.locator('#s-title')).toBeVisible();
    await page.locator('#b-admin').click();
    await expect(page.locator('#adm-kart-victor')).toHaveValue('#ff0000');
    await expect(page.locator('#adm-title-victor')).toHaveValue('Le testeur');
    // Leave no state behind for the next spec.
    await page.locator('#b-admin-reset').click();
    await page.locator('#b-admin-save').click();
    await expect(page.locator('#s-title')).toBeVisible();
    expect(await served(page)).toEqual(DEFAULT_CAST);
  });

  test('shows the campaign-poster control with its empty state', async ({ page }) => {
    await open(page);
    await openWorkshop(page);
    await expect(page.locator('#ad-files')).toBeVisible();
    await expect(page.locator('#ad-preview')).toContainText('Aucune affiche');
  });
});

test.describe('R-06 admin access', () => {
  test('the static build offers no Workshop', async ({ page }) => {
    await page.goto(STATIC);
    await expect(page.locator('#b-play')).toBeVisible();
    await expect(page.locator('#b-admin')).toHaveCount(0);
    await expect(page.locator('#s-admin')).toHaveCount(0);
  });

  test('a visitor on the game server is not offered the Workshop', async ({ page }) => {
    await open(page);
    await expect(page.locator('#b-admin')).toHaveCount(0);
    await expect(page.locator('#s-admin')).toHaveCount(0);
  });

  test('a normal account is not offered the Workshop', async ({ page }) => {
    await open(page);
    const name = 'Joueur' + RUN;
    await page.locator('#b-account').click();
    await page.locator('#acc-name').fill(name);
    await page.locator('#acc-pass').fill('république');
    await page.locator('#b-acc-register').click();
    await expect(page.locator('#acc-level')).toHaveText(name + ' · niveau 1');
    await page.locator('#b-acc-back').click();
    await expect(page.locator('#b-account')).toContainText(name);
    await expect(page.locator('#b-admin')).toHaveCount(0);
    await expect(page.locator('#s-admin')).toHaveCount(0);
  });

  test('the admin sees the Workshop, and logging out hides it for good', async ({ page }) => {
    await open(page);
    await logIn(page);
    await expect(page.locator('#b-admin')).toBeVisible();
    await page.locator('#b-account').click();
    await page.locator('#b-acc-logout').click();
    await page.locator('#b-acc-back').click();
    await expect(page.locator('#s-title')).toBeVisible();
    await expect(page.locator('#b-admin')).toHaveCount(0);
    await expect(page.locator('#s-admin')).toHaveCount(0);
    // The token is gone from this browser too, not just hidden.
    await page.reload();
    await expect(page.locator('#b-account')).toContainText('se connecter');
    await expect(page.locator('#b-admin')).toHaveCount(0);
  });

  test('a kart default the admin sets is the default in another player’s Garage', async ({ page, browser }) => {
    await open(page);
    await openWorkshop(page);
    await page.locator('#adm-wheels-victor-gold').click();
    await expect(page.locator('#adm-wheels-victor-gold')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#b-admin-save').click();
    await expect(page.locator('#s-title')).toBeVisible();
    expect((await served(page)).chars.victor.style).toEqual({ wheels: 'gold' });

    // A player with no Garage edits of their own gets the admin's wheels for Victor.
    const player = await visitor(browser);
    await player.locator('#b-play').click();
    await player.locator('#roster .tile').first().click();
    await player.locator('#b-garage').click();
    await expect(player.locator('#g-wheels-gold')).toHaveAttribute('aria-pressed', 'true');
    await expect(player.locator('#g-wheels-classic')).toHaveAttribute('aria-pressed', 'false');

    // Reset, and the player is back on the built-in wheels.
    await resetAndSave(page);
    expect(await served(page)).toEqual(DEFAULT_CAST);
    await player.reload();
    await expect(player.locator('#b-account')).toBeVisible();
    await player.locator('#b-play').click();
    await player.locator('#roster .tile').first().click();
    await player.locator('#b-garage').click();
    await expect(player.locator('#g-wheels-classic')).toHaveAttribute('aria-pressed', 'true');
  });
});
