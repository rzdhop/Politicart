import { expect, request, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { ADMIN_PASSWORD, ADMIN_USER } from './fixtures/admin';

/**
 * R-21 -- the Boutique and the Politibox (DEC-032..037), on the game server
 * (port 4180, see playwright.config.ts), driven through the DOM like every
 * other spec.
 *
 * Coins come from the admin's grant (POST /api/admin/coins with the request
 * fixture), not from a race: a desktop race is too slow under this
 * container's software WebGL. Experience comes from the solo-race report a
 * finished race sends (POST /api/progress), which the server pays at most
 * once a minute per account: a candidate needs level 2 before it can be
 * bought (DEC-034), so the first report is sent by the first test and the
 * candidate is bought by the last, once a second report is accepted.
 *
 * The tests share one account and run in order.
 */
const SERVER = 'http://127.0.0.1:4180/';

// Account names are unique per server; a suffix keeps reruns against a reused server apart.
const RUN = Date.now().toString(36).slice(-5);
const NAME = 'Boutique' + RUN;
const PASSWORD = 'république';

const errors: string[] = [];
const contexts: BrowserContext[] = [];
let api: APIRequestContext;

/** A fresh browser on `url`, its errors collected. */
async function visit(browser: Browser, url = SERVER): Promise<Page> {
  const context = await browser.newContext(); contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  return page;
}

/** From the title, log in (or sign up) through Compte and come back to the title. */
async function signIn(page: Page, { register = false } = {}) {
  await expect(page.locator('#b-account')).toBeVisible();
  await page.locator('#b-account').click();
  await page.locator('#acc-name').fill(NAME);
  await page.locator('#acc-pass').fill(PASSWORD);
  await page.locator(register ? '#b-acc-register' : '#b-acc-login').click();
  await expect(page.locator('#acc-level')).toContainText(NAME + ' · niveau');
  await page.locator('#b-acc-back').click();
  await expect(page.locator('#s-title')).toBeVisible();
}

/** A token for `name` from the API (a session of its own). */
async function tokenOf(name: string, password: string): Promise<string> {
  const r = await api.post('api/login', { data: { name, password } });
  expect(r.status()).toBe(200);
  return (await r.json()).token;
}

/** What the server says about the account right now. */
async function profile(): Promise<{ id: string; coins: number; level: number }> {
  const r = await api.get('api/me', { headers: { authorization: 'Bearer ' + await tokenOf(NAME, PASSWORD) } });
  return (await r.json()).profile;
}

/** Report a won solo race for the account, as the game does when one ends: what it paid. */
async function reportWin(): Promise<{ gained: number; coins: number }> {
  const r = await api.post('api/progress', {
    data: { rank: 0, field: 6, finished: true, trackId: 'elysee', charId: 'victor', time: 190.5, bestLap: 61.2 },
    headers: { authorization: 'Bearer ' + await tokenOf(NAME, PASSWORD) },
  });
  expect(r.status()).toBe(200);
  return r.json();
}

/** The balance the shop shows. */
async function coins(page: Page): Promise<number> {
  return Number(((await page.locator('#coins').textContent()) ?? '').replace(/\D/g, ''));
}

/** Open the Boutique from the title. */
async function openShop(page: Page) {
  await page.locator('#b-shop').click();
  await expect(page.locator('#s-shop')).toBeVisible();
}

test.beforeAll(async () => { api = await request.newContext({ baseURL: SERVER }); });
test.afterAll(async () => { await api.dispose(); });
test.beforeEach(() => { errors.length = 0; });
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map(c => c.close()));
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test.describe.serial('R-21 shop', () => {
  test('a new account sees the Boutique at 0 politicoins, nothing affordable, and the candidates behind their level', async ({ browser }) => {
    const page = await visit(browser);
    await signIn(page, { register: true });
    await expect(page.locator('#b-shop')).toBeVisible();
    await openShop(page);
    await expect(page.locator('#shop-guest')).toHaveCount(0);
    await expect(page.locator('#coins')).toHaveText('0');
    await expect(page.locator('#b-open-box')).toBeDisabled();

    await page.locator('#shop-tab-chars').click();
    await expect(page.locator('#shop-char-lucie')).toBeVisible();
    await expect(page.locator('#b-buy-char-lucie')).toHaveText('Niveau 2 requis');
    await expect(page.locator('#b-buy-char-lucie')).toBeDisabled();
    await expect(page.locator('#b-buy-char-patrick')).toHaveText('Niveau 3 requis');
    await expect(page.locator('#b-buy-char-victor')).toHaveText('Acquis');

    // A won race pays 60 politicoins and the first race of the day 50 more; the open shop hears it on the socket.
    const paid = await reportWin();
    expect(paid.gained).toBeGreaterThan(0);
    expect(paid.coins).toBeGreaterThanOrEqual(60);
    await expect(page.locator('#coins')).toHaveText(String(paid.coins));
  });

  test('the admin grants 1000 politicoins; a part is bought, then a Politibox opened and skipped through', async ({ browser }) => {
    const page = await visit(browser);
    await signIn(page);
    await openShop(page);
    const before = await coins(page);
    expect(before).toBeGreaterThan(0);

    const admin = await tokenOf(ADMIN_USER, ADMIN_PASSWORD);
    const me = await profile();
    const grant = await api.post('api/admin/coins', { data: { id: me.id, amount: 1000 }, headers: { authorization: 'Bearer ' + admin } });
    expect(grant.status()).toBe(200);
    // The open shop hears the new balance on the socket; reopened, it reads the same.
    await expect.poll(() => coins(page)).toBe(before + 1000);
    await page.locator('#b-shop-back').click();
    await openShop(page);
    expect(await coins(page)).toBe(before + 1000);

    // A mythic part: 400.
    await page.locator('#shop-tab-parts').click();
    await expect(page.locator('#b-buy-part-wheels-gold')).toHaveText('Acheter');
    await page.locator('#b-buy-part-wheels-gold').click();
    await expect(page.locator('#b-buy-part-wheels-gold')).toHaveText('Acquis');
    await expect(page.locator('#b-buy-part-wheels-gold')).toBeDisabled();
    await expect(page.locator('#shop-notice')).toHaveText('Acquis !');
    await expect.poll(() => coins(page)).toBe(before + 1000 - 400);
    const afterPart = before + 600;

    // A Politibox: 120, then whatever it holds. Two taps on the stage skip to the prize.
    await page.locator('#shop-tab-box').click();
    await expect(page.locator('#b-open-box')).toBeEnabled();
    await page.locator('#b-open-box').click();
    await expect(page.locator('#s-lootbox')).toBeVisible();
    await expect(page.locator('#s-shop')).toBeHidden();
    // Tap in a corner: the result card, once out, sits in the middle.
    await page.locator('#lb-stage').click({ position: { x: 12, y: 12 } });
    await page.locator('#lb-stage').click({ position: { x: 12, y: 12 } });
    await expect(page.locator('#box-result')).not.toBeEmpty({ timeout: 20_000 });
    await expect(page.locator('#box-grade')).toBeVisible();
    const result = (await page.locator('#box-result').textContent()) ?? '';
    expect(result).toMatch(/^(Candidat : |Pièce : |Traînée : |\d+ politicoins)/);
    await page.locator('#b-box-back').click();
    await expect(page.locator('#s-shop')).toBeVisible();
    const afterBox = await coins(page);
    expect(afterBox).toBeGreaterThanOrEqual(afterPart - 120);
    expect(afterBox).toBeLessThanOrEqual(afterPart - 120 + 1000);
    expect(afterBox).toBe((await profile()).coins);
  });

  test('a guest on the server sees the Boutique with every button disabled', async ({ browser }) => {
    const page = await visit(browser);
    await openShop(page);
    await expect(page.locator('#shop-guest')).toHaveText('Créez un compte pour gagner des politicoins.');
    await expect(page.locator('#coins')).toHaveText('0');
    await expect(page.locator('#b-open-box')).toBeDisabled();
    await page.locator('#shop-tab-parts').click();
    await expect(page.locator('#b-buy-part-wheels-gold')).toBeDisabled();
    await page.locator('#b-shop-back').click();
    await expect(page.locator('#s-title')).toBeVisible();
  });

  test('the static build (no server, no economy) has no Boutique', async ({ browser }) => {
    const page = await visit(browser, '/');
    await expect(page.locator('#b-play')).toBeVisible();
    await expect(page.locator('#b-shop')).toHaveCount(0);
    await expect(page.locator('#s-shop')).toHaveCount(0);
  });

  test('at level 2 a candidate is bought, and drives on the roster at once', async ({ browser }) => {
    test.setTimeout(150_000);
    // The second won race reaches level 2, as soon as the server pays one again (once a minute).
    await expect.poll(async () => (await reportWin()).gained, { timeout: 90_000, intervals: [5_000] }).toBeGreaterThan(0);
    expect((await profile()).level).toBeGreaterThanOrEqual(2);

    const page = await visit(browser);
    await signIn(page);
    // From the roster: a locked tile opens the Boutique on the candidates.
    await page.locator('#b-play').click();
    await expect(page.locator('#s-select')).toBeVisible();
    // At level 2 the one candidate on sale is the first of the unlock order, lucie; her tile says so.
    const tiles = page.locator('#roster .tile');
    const index = await tiles.evaluateAll((els) => els.findIndex(e => e.classList.contains('locked') && /Boutique/.test(e.getAttribute('data-lock') ?? '')));
    expect(index).toBeGreaterThanOrEqual(0);
    const name = (await tiles.nth(index).locator('.tname').textContent()) ?? '';
    await tiles.nth(index).click();
    await expect(page.locator('#s-shop')).toBeVisible();
    await expect(page.locator('#shop-panel-chars')).toBeVisible();

    const before = await coins(page);
    await expect(page.locator('#b-buy-char-lucie')).toHaveText('Acheter');
    await page.locator('#b-buy-char-lucie').click();
    await expect(page.locator('#b-buy-char-lucie')).toHaveText('Acquis');
    await expect(page.locator('#b-buy-char-lucie')).toBeDisabled();
    await expect.poll(() => coins(page)).toBe(before - 300);
    await expect(page.locator('#b-buy-char-patrick')).toHaveText('Niveau 3 requis');
    await expect(page.locator('#b-buy-char-patrick')).toBeDisabled();

    // Back on the roster, the candidate is unlocked and can be chosen.
    await page.locator('#b-shop-back').click();
    await expect(page.locator('#s-select')).toBeVisible();
    expect(await page.locator('#shop-char-lucie .shop-title').textContent()).toBe(name);
    await expect(tiles.nth(index)).not.toHaveClass(/locked/);
    await tiles.nth(index).click();
    await expect(page.locator('#showcase .big')).toHaveText(name);
  });
});
