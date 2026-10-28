import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { ADMIN_PASSWORD, ADMIN_USER } from './fixtures/admin';

/**
 * Team races, end to end: two real browsers against the real game server
 * (port 4180, see playwright.config.ts), driven through the DOM and the
 * keyboard only, like game.spec.ts. Races are capped at 15 s on this server,
 * which is how the results screen is reached without three real laps.
 */
const SERVER = 'http://127.0.0.1:4180/';

// Account names are unique per server; a suffix keeps reruns against a reused server apart.
const RUN = Date.now().toString(36).slice(-5);

/** A browser on the game server, signed up as `name` (an account) or not (a guest). */
// Every context a spec opens is closed after it: a page left racing keeps rendering and slows the specs that follow.
const contexts: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contexts.splice(0).map(c => c.close())); });

async function open(browser: Browser, name: string, { account = false } = {}): Promise<Page> {
  const context = await browser.newContext(); contexts.push(context);
  const page = await context.newPage();
  await page.goto(SERVER);
  await expect(page.locator('#b-multi')).toBeVisible();
  if (account) {
    await page.locator('#b-account').click();
    await page.locator('#acc-name').fill(name);
    await page.locator('#acc-pass').fill('république');
    await page.locator('#b-acc-register').click();
    await expect(page.locator('#acc-level')).toHaveText(name + ' · niveau 1');
    await page.locator('#b-acc-back').click();
  }
  return page;
}

/** Into the lobby, connected; a guest types their pseudo. */
async function player(browser: Browser, name: string, opts: { account?: boolean } = {}): Promise<Page> {
  const page = await open(browser, name, opts);
  await page.locator('#b-multi').click();
  await expect(page.locator('#lobby-status')).toHaveText('Connecté au serveur');
  if (!opts.account) await page.locator('#lobby-name').fill(name);
  return page;
}

test.describe('Multijoueur', () => {
  test('is not offered by the static build that GitHub Pages serves', async ({ page }) => {
    await page.goto('http://127.0.0.1:4173/');
    await expect(page.locator('#b-play')).toBeVisible();
    await expect(page.locator('#b-multi')).toHaveCount(0);
  });

  test('an account hosts, a guest joins, they race on opposite teams and see the team score', async ({ browser }) => {
    test.setTimeout(90_000);
    const alice = 'Alice' + RUN;
    const host = await player(browser, alice, { account: true });
    const guest = await player(browser, 'Bob');
    await expect(guest.locator('#b-mp-create')).toBeDisabled();      // guests join, they do not host

    await host.locator('#b-mp-create').click();
    const code = ((await host.locator('#lobby-room').textContent()) ?? '').match(/Salle ([A-Z]{4})/)?.[1];
    expect(code).toBeTruthy();
    await guest.locator('#lobby-code').fill(code!);
    await guest.locator('#b-mp-join').click();

    for (const p of [host, guest]) await expect(p.locator('#lobby-players tr')).toHaveCount(2);
    await expect(host.locator('#lobby-players tr').nth(0)).toContainText(alice);
    await expect(host.locator('#lobby-players tr').nth(1)).toContainText('(invité·e)');
    await expect(host.locator('#lobby-players tr').nth(0)).toContainText('Bleu');
    await expect(host.locator('#lobby-players tr').nth(1)).toContainText('Rouge');
    // Each row names the candidate's grade and the player's trail (DEC-036, A-032): nobody here owns one, so a dash on both screens.
    for (const p of [host, guest]) {
      await expect(p.locator('#lobby-players .grade[data-grade="common"]')).toHaveCount(2);     // two starters, both common
      await expect(p.locator('[id^="lobby-trail-"]')).toHaveCount(2);
      await expect(p.locator('[id^="lobby-trail-"]')).toHaveText(['—', '—']);
    }

    await expect(host.locator('#b-mp-start')).toBeDisabled();
    await guest.locator('#b-mp-ready').click();
    await expect(host.locator('#b-mp-start')).toBeEnabled();
    await host.locator('#b-mp-track-1').click();
    await host.locator('#b-mp-start').click();

    // Both screens go to the same race: the HUD, then the green light. The
    // light shows for 0.9 s of race time only, so both screens are watched at
    // once and every 50 ms: checked one after the other, with the default
    // polling that backs off to a second, it slipped between two looks.
    await Promise.all(
      [host, guest].map(async (p) => {
        await expect(p.locator('#hud')).toBeVisible();
        await expect
          .poll(() => p.locator('#h-center').textContent(), { intervals: [50], timeout: 10_000 })
          .toBe('PARTEZ !');
      }),
    );

    // The host accelerates; the guest's controls stay idle. Speeds come from the server.
    await host.keyboard.down('ArrowUp');
    await host.waitForTimeout(2500);
    const hostSpeed = Number(await host.locator('#h-speed').textContent());
    const guestSpeed = Number(await guest.locator('#h-speed').textContent());
    await host.keyboard.up('ArrowUp');
    expect(hostSpeed).toBeGreaterThan(30);
    expect(guestSpeed).toBeLessThan(5);

    // The capped race ends on its own: results with both teams, then back to the room.
    for (const p of [host, guest]) {
      await expect(p.locator('#s-results')).toBeVisible({ timeout: 30_000 });
      await expect(p.locator('#r-teams tr')).toHaveCount(2);
      await expect(p.locator('#r-body tr')).toHaveCount(6);
    }
    await expect(host.locator('#r-body tr.you')).toContainText(alice);
    await expect(host.locator('#r-xp')).toContainText('XP');          // the account earned experience
    await guest.locator('#b-again').click();
    await expect(guest.locator('#s-lobby')).toBeVisible();
    await expect(guest.locator('#lobby-players tr')).toHaveCount(2);
  });

  test('two accounts become friends, and one invites the other into a room', async ({ browser }) => {
    test.setTimeout(60_000);
    const [an, cn] = ['Anne' + RUN, 'Carl' + RUN];
    const a = await open(browser, an, { account: true });
    const c = await open(browser, cn, { account: true });

    await a.locator('#b-account').click();
    await a.locator('#acc-friend').fill(cn);
    await a.locator('#b-friend-add').click();
    await expect(a.locator('#acc-notice')).toContainText('Demande envoyée');
    await expect(c.locator('#b-account')).toContainText('✉ 1');           // the request shows on the title
    await c.locator('#b-account').click();
    await c.locator('#acc-friends button', { hasText: 'Accepter' }).click();
    await expect(a.locator('#acc-friends')).toContainText('en ligne');
    await c.locator('#b-acc-back').click();

    await a.locator('#b-acc-back').click();
    await a.locator('#b-multi').click();
    await a.locator('#b-mp-create').click();
    const code = ((await a.locator('#lobby-room').textContent()) ?? '').match(/Salle ([A-Z]{4})/)?.[1];
    await a.locator('#lobby-invite button', { hasText: cn }).click();
    await expect(a.locator('#lobby-error')).toContainText('Invitation envoyée');

    await expect(c.locator('#invite-text')).toHaveText(an + ' vous invite dans sa salle ' + code);
    await c.locator('#b-invite-join').click();
    await expect(c.locator('#s-lobby')).toBeVisible();
    await expect(c.locator('#lobby-players tr')).toHaveCount(2);
    await expect(a.locator('#lobby-players tr').nth(1)).toContainText(cn);
  });

  test("each player's Garage edits reach the other player's screen", async ({ browser }) => {
    test.setTimeout(90_000);
    // Gina (an account, so she may host) styled her kart in the Garage, kept in her browser; Bob, a guest, did not.
    // Account names are unique per server, and another spec here already signs up Alice + RUN.
    const host = await open(browser, 'Gina' + RUN, { account: true });
    // Gold wheels are a mythic part: the server only shows what a player owns (DEC-035), so the
    // admin grants Gina the politicoins and she buys them through the shop API before racing.
    const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
    const token = await host.evaluate(() => (JSON.parse(localStorage.getItem('politikart-account') ?? '{}') as { token: string }).token);
    const me = await (await host.request.get(SERVER + 'api/me', { headers: bearer(token) })).json() as { profile: { id: string } };
    const admin = await (await host.request.post(SERVER + 'api/login', { data: { name: ADMIN_USER, password: ADMIN_PASSWORD } })).json() as { token: string };
    expect((await host.request.post(SERVER + 'api/admin/coins', { headers: bearer(admin.token), data: { id: me.profile.id, amount: 500 } })).status()).toBe(200);
    expect((await host.request.post(SERVER + 'api/shop/part', { headers: bearer(token), data: { category: 'wheels', value: 'gold' } })).status()).toBe(200);
    await host.evaluate(() => localStorage.setItem('politikart-kart', JSON.stringify({ wheels: 'gold', number: 7, body: '#00ff00' })));
    await host.reload();
    await expect(host.locator('#b-multi')).toBeVisible();
    await host.locator('#b-multi').click();
    await expect(host.locator('#lobby-status')).toHaveText('Connecté au serveur');
    const guest = await player(browser, 'Bob');

    await host.locator('#b-mp-create').click();
    const code = ((await host.locator('#lobby-room').textContent()) ?? '').match(/Salle ([A-Z]{4})/)?.[1];
    expect(code).toBeTruthy();
    await guest.locator('#lobby-code').fill(code!);
    await guest.locator('#b-mp-join').click();
    for (const p of [host, guest]) await expect(p.locator('#lobby-players tr')).toHaveCount(2);
    await guest.locator('#b-mp-ready').click();
    await host.locator('#b-mp-start').click();
    for (const p of [host, guest]) await expect(p.locator('#hud')).toBeVisible();

    // Humans take the last two slots, in join order: Gina 4, Bob 5.
    type Slot = { charId: string; style: Record<string, unknown> };
    const karts = (p: typeof host) => p.evaluate(() => (window as unknown as { __kr: { karts(): unknown } }).__kr.karts()) as Promise<Slot[]>;
    const onGuest = await karts(guest), onHost = await karts(host);
    expect(onGuest).toHaveLength(6);
    expect(onGuest[4]!.style).toMatchObject({ wheels: 'gold', number: 7, body: '#00ff00' });
    expect(onHost[4]!.style).toEqual(onGuest[4]!.style);
    // Bob made no edits: his kart is his candidate's default, the same on both screens.
    expect(onGuest[5]!.style).toMatchObject({ wheels: 'classic', number: null });
    expect(onHost[5]!.style).toEqual(onGuest[5]!.style);
    await host.evaluate(() => localStorage.removeItem('politikart-kart'));
  });
});
