import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Team races, end to end: two real browsers against the real game server
 * (port 4180, see playwright.config.ts), driven through the DOM and the
 * keyboard only, like game.spec.ts. Races are capped at 15 s on this server,
 * which is how the results screen is reached without three real laps.
 */
const SERVER = 'http://127.0.0.1:4180/';

async function player(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(SERVER);
  await expect(page.locator('#b-multi')).toBeVisible();
  await page.locator('#b-multi').click();
  await expect(page.locator('#lobby-status')).toHaveText('Connecté au serveur');
  await page.locator('#lobby-name').fill(name);
  return page;
}

test.describe('Multijoueur', () => {
  test('is not offered by the static build that GitHub Pages serves', async ({ page }) => {
    await page.goto('http://127.0.0.1:4173/');
    await expect(page.locator('#b-play')).toBeVisible();
    await expect(page.locator('#b-multi')).toHaveCount(0);
  });

  test('two players join one room, race on opposite teams and see the team score', async ({ browser }) => {
    test.setTimeout(90_000);
    const host = await player(browser, 'Alice');
    const guest = await player(browser, 'Bob');

    await host.locator('#b-mp-create').click();
    const code = ((await host.locator('#lobby-room').textContent()) ?? '').match(/Salle ([A-Z]{4})/)?.[1];
    expect(code).toBeTruthy();
    await guest.locator('#lobby-code').fill(code!);
    await guest.locator('#b-mp-join').click();

    for (const p of [host, guest]) await expect(p.locator('#lobby-players tr')).toHaveCount(2);
    await expect(host.locator('#lobby-players tr').nth(0)).toContainText('Alice');
    await expect(host.locator('#lobby-players tr').nth(0)).toContainText('Bleu');
    await expect(host.locator('#lobby-players tr').nth(1)).toContainText('Rouge');

    await expect(host.locator('#b-mp-start')).toBeDisabled();
    await guest.locator('#b-mp-ready').click();
    await expect(host.locator('#b-mp-start')).toBeEnabled();
    await host.locator('#b-mp-track-1').click();
    await host.locator('#b-mp-start').click();

    // Both screens go to the same race: the HUD, then the green light.
    for (const p of [host, guest]) {
      await expect(p.locator('#hud')).toBeVisible();
      await expect(p.locator('#h-center')).toHaveText('PARTEZ !', { timeout: 10_000 });
    }

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
    await expect(host.locator('#r-body tr.you')).toContainText('Alice');
    await guest.locator('#b-again').click();
    await expect(guest.locator('#s-lobby')).toBeVisible();
    await expect(guest.locator('#lobby-players tr')).toHaveCount(2);
  });
});
