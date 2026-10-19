import { expect, request, test, type Browser, type Page } from '@playwright/test';

import { ADMIN_PASSWORD, ADMIN_USER } from './fixtures/admin';

/**
 * R-06 -- the workshop, now the admin's, on the game server.
 *
 * The cast lives on the game server (port 4180, see playwright.config.ts),
 * which runs with a test-only admin account and an empty data dir. Only that
 * account can open the workshop; what it saves, every player gets. The static
 * build (4173, the GitHub Pages stand-in) plays the default cast and offers
 * neither the login nor the workshop.
 *
 * Every spec leaves the server's roster at the default cast -- through the
 * workshop itself, and again in afterEach through the API, should a spec fail
 * halfway -- so e2e/multiplayer.spec.ts and the next spec start clean.
 */
const SERVER = 'http://127.0.0.1:4180/';
const STATIC = 'http://127.0.0.1:4173/';

const errors: string[] = [];

/** A fresh browser (its own cookies and storage) on the game server: a different player. */
async function visitor(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(SERVER);
  // The login button appears once the roster and the session have been read.
  await expect(page.locator('#b-login')).toBeVisible();
  return page;
}

/** From the title, log in as the test admin: the workshop opens on success. */
async function logIn(page: Page) {
  await page.locator('#b-login').click();
  await expect(page.locator('#s-login')).toBeVisible();
  await page.locator('#adm-user').fill(ADMIN_USER);
  await page.locator('#adm-pass').fill(ADMIN_PASSWORD);
  await page.locator('#b-login-go').click();
  await expect(page.locator('#s-admin')).toBeVisible();
}

/** Reset the workshop to the default cast and save it. Ends on the title. */
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
  const api = await request.newContext({ baseURL: SERVER, extraHTTPHeaders: { origin: SERVER.slice(0, -1) } });
  expect((await api.post('api/admin/login', { data: { user: ADMIN_USER, password: ADMIN_PASSWORD } })).status()).toBe(204);
  expect((await api.put('api/admin/roster', { data: { chars: {}, ads: [] } })).status()).toBe(200);
  await api.dispose();
});

test.describe('R-06 workshop', () => {
  test('renames a candidate, which survives a reload and reaches another player, then resets', async ({ page, browser }) => {
    await page.goto(SERVER);
    await logIn(page);
    // One card per candidate.
    await expect(page.locator('#admin-chars .card')).toHaveCount(11);

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
    expect(await served(page)).toEqual({ chars: {}, ads: [] });
    await other.reload();
    await expect(other.locator('#b-login')).toBeVisible();
    await other.locator('#b-play').click();
    await expect(other.locator('#roster')).toContainText(original);
    await expect(other.locator('#roster')).not.toContainText('Jean-Michel Test');
  });

  test('changes a colour without losing the rest of the form', async ({ page }) => {
    await page.goto(SERVER);
    await logIn(page);
    await page.locator('#adm-kart-victor').fill('#ff0000');
    await page.locator('#adm-title-victor').fill('Le testeur');
    await page.locator('#b-admin-save').click();
    await page.locator('#b-admin').click();
    await expect(page.locator('#adm-kart-victor')).toHaveValue('#ff0000');
    await expect(page.locator('#adm-title-victor')).toHaveValue('Le testeur');
    // Leave no state behind for the next spec.
    await page.locator('#b-admin-reset').click();
    await page.locator('#b-admin-save').click();
    await expect(page.locator('#s-title')).toBeVisible();
    expect(await served(page)).toEqual({ chars: {}, ads: [] });
  });

  test('shows the campaign-poster control with its empty state', async ({ page }) => {
    await page.goto(SERVER);
    await logIn(page);
    await expect(page.locator('#ad-files')).toBeVisible();
    await expect(page.locator('#ad-preview')).toContainText('Aucune affiche');
  });
});

test.describe('R-06 admin access', () => {
  test('the static build offers neither the login nor the workshop', async ({ page }) => {
    await page.goto(STATIC);
    await expect(page.locator('#b-play')).toBeVisible();
    await expect(page.locator('#b-login')).toHaveCount(0);
    await expect(page.locator('#b-admin')).toHaveCount(0);
    await expect(page.locator('#s-admin')).toHaveCount(0);
  });

  test('a visitor on the game server is offered the login, never the workshop', async ({ page }) => {
    await page.goto(SERVER);
    await expect(page.locator('#b-login')).toBeVisible();
    await expect(page.locator('#b-admin')).toHaveCount(0);
    await expect(page.locator('#s-admin')).toHaveCount(0);
  });

  test('a wrong password shows the error and opens no workshop', async ({ page }) => {
    await page.goto(SERVER);
    await page.locator('#b-login').click();
    await page.locator('#adm-user').fill(ADMIN_USER);
    await page.locator('#adm-pass').fill('wrong-password');
    await page.locator('#adm-pass').press('Enter');
    await expect(page.locator('#login-error')).toContainText('incorrect');
    await expect(page.locator('#adm-pass')).toHaveValue('');
    await expect(page.locator('#s-login')).toBeVisible();
    await expect(page.locator('#s-admin')).toHaveCount(0);
    await page.locator('#b-login-back').click();
    await expect(page.locator('#s-title')).toBeVisible();
    await expect(page.locator('#b-admin')).toHaveCount(0);
  });

  test('logging out hides the workshop, for good', async ({ page }) => {
    await page.goto(SERVER);
    await logIn(page);
    await page.locator('#b-admin-save').click();
    await expect(page.locator('#s-title')).toBeVisible();
    await expect(page.locator('#b-admin')).toBeVisible();
    await page.locator('#b-logout').click();
    await expect(page.locator('#b-admin')).toHaveCount(0);
    await expect(page.locator('#b-logout')).toHaveCount(0);
    await expect(page.locator('#b-login')).toBeVisible();
    // The session is gone on the server too, not just hidden.
    await page.reload();
    await expect(page.locator('#b-login')).toBeVisible();
    await expect(page.locator('#b-admin')).toHaveCount(0);
  });

  test('a kart default the admin sets is the default in every player’s Garage', async ({ page, browser }) => {
    await page.goto(SERVER);
    await logIn(page);
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
    await player.reload();
    await expect(player.locator('#b-login')).toBeVisible();
    await player.locator('#b-play').click();
    await player.locator('#roster .tile').first().click();
    await player.locator('#b-garage').click();
    await expect(player.locator('#g-wheels-classic')).toHaveAttribute('aria-pressed', 'true');
  });
});
