// The politicoins economy (economy.js) on a real server with a memory store:
// the guards of every route, the shop, the Plitibox with an injected roll,
// the per-account rate limit, friends' stats and the admin's coin grant; then
// settleRace, ownedOf and normaliseStats on their own.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { BOX_PRICE, DAILY_COINS, EVERYTHING, RACE_COINS, REFUND, levelUpCoins } from '../../game/src/engine/catalog.js';
import { STARTERS } from '../../game/src/engine/progress.js';
import { hashPassword } from './accounts.js';
import { ensureAdmin } from './admin.js';
import { levelUpBonus, normaliseStats, ownedOf, settleRace, utcDay } from './economy.js';
import { startServer } from './server.js';
import { openFileStore } from './store.js';

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const seen = []; const waiters = [];
  ws.on('message', raw => {
    const m = JSON.parse(String(raw)); seen.push(m);
    for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.ok(m); }
  });
  const open = new Promise(ok => ws.once('open', ok));
  return {
    seen, open,
    send: m => ws.send(JSON.stringify(m)),
    next: (test, ms = 2000) => new Promise((ok, ko) => {
      const hit = seen.find(test); if (hit) { seen.splice(seen.indexOf(hit), 1); return ok(hit); }
      const w = { test, ok: m => { clearTimeout(timer); seen.splice(seen.indexOf(m), 1); ok(m); } };
      const timer = setTimeout(() => ko(new Error('timed out waiting for a message')), ms);
      waiters.push(w);
    }),
    close: () => ws.close(),
  };
}

// The Plitibox draws from this queue, then 0.5 (a 10-coin drop) once it is empty.
const rolls = [];
const rng = () => (rolls.length ? rolls.shift() : 0.5);

let srv, store, adminPw;
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kr-eco-')); writeFileSync(join(dir, 'index.html'), '<!doctype html>');
  adminPw = randomBytes(12).toString('hex');
  const admin = { user: 'rida', hash: await hashPassword(adminPw) };
  store = openFileStore(null);
  await ensureAdmin(store, admin, () => {});
  srv = await startServer({ port: 0, host: '127.0.0.1', staticDir: dir, runRace: () => ({ input() {}, leave() {}, stop() {} }), store, loginTries: 1000, admin, rng });
});
afterAll(() => srv.close());

const url = p => `http://127.0.0.1:${srv.port}${p}`;
const headers = token => ({ 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) });
const post = (p, body, token) => fetch(url(p), { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
const get = (p, token) => fetch(url(p), { headers: headers(token) });
let seq = 0;
/** A fresh account: name, token, id, and optionally coins and experience granted straight in the store. */
async function account({ coins = 0, xp = 0, prefix = 'Eco' } = {}) {
  const name = prefix + (++seq);
  const j = await (await post('/api/register', { name, password: 'secret1' })).json();
  if (coins) await store.addCoins(j.profile.id, coins);
  if (xp) await store.addXp(j.profile.id, xp);
  return { name, token: j.token, id: j.profile.id };
}
const adminToken = async () => (await (await post('/api/login', { name: 'rida', password: adminPw })).json()).token;

describe('every economy route', () => {
  it('answers 401 without a session, on every route', async () => {
    for (const [method, path] of [['POST', '/api/shop/char'], ['POST', '/api/shop/part'], ['POST', '/api/box/open'], ['GET', '/api/stats/friends']]) {
      for (const token of [undefined, 'forged']) {
        const r = await fetch(url(path), { method, headers: headers(token), body: method === 'POST' ? '{}' : undefined });
        expect(r.status, method + ' ' + path).toBe(401);
        expect((await r.json()).error).toBe('Session expirée.');
      }
    }
  });

  it('refuses a body that is not JSON, too large, or unreadable', async () => {
    const u = await account();
    const r415 = await fetch(url('/api/shop/char'), { method: 'POST', headers: { authorization: 'Bearer ' + u.token, 'content-type': 'text/plain' }, body: '{"id":"lucie"}' });
    expect(r415.status).toBe(415);
    expect((await post('/api/shop/char', { id: 'lucie', pad: 'x'.repeat(1100) }, u.token)).status).toBe(413);
    const bad = await fetch(url('/api/box/open'), { method: 'POST', headers: headers(u.token), body: '{not json' });
    expect(bad.status).toBe(400);
    expect((await post('/api/box/open', [1, 2], u.token)).status).toBe(400);
    expect((await fetch(url('/api/shop/char'), { method: 'OPTIONS' })).status).toBe(204);      // the preflight of another origin
  });

  it('caps shop and box calls at 30 a minute per account, not per server', async () => {
    const u = await account(), other = await account();
    for (let i = 0; i < 30; i++) expect((await post('/api/box/open', {}, u.token)).status).toBe(402);
    const r = await post('/api/shop/char', { id: 'lucie' }, u.token);
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe('Doucement sur la caisse.');
    expect((await post('/api/box/open', {}, other.token)).status).toBe(402);
    expect((await get('/api/stats/friends', u.token)).status).toBe(200);                 // reading is not shopping
  });
});

describe('the shop', () => {
  it('sells a candidate at its price once its level is reached, once', async () => {
    const u = await account({ coins: 299 });
    const low = await post('/api/shop/char', { id: 'lucie' }, u.token);
    expect(low.status).toBe(403);
    expect((await low.json()).error).toBe('Niveau 2 requis.');
    await store.addXp(u.id, 120);                                                        // level 2
    const poor = await post('/api/shop/char', { id: 'lucie' }, u.token);
    expect(poor.status).toBe(402);
    expect((await poor.json()).error).toBe('Pas assez de politicoins.');
    await store.addCoins(u.id, 1);
    const ok = await post('/api/shop/char', { id: 'lucie' }, u.token);
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j.bought).toEqual({ kind: 'char', id: 'lucie', price: 300 });
    expect(j.profile.coins).toBe(0);
    expect(j.profile.owned.chars).toEqual(['lucie']);
    expect(j.profile.unlocked).toEqual([...STARTERS, 'lucie']);
    expect(j.profile.stats).toMatchObject({ coinsSpent: 300 });
    await store.addCoins(u.id, 300);
    const again = await post('/api/shop/char', { id: 'lucie' }, u.token);
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe('Déjà à vous.');
    expect((await store.user(u.id)).coins).toBe(300);
  });

  it('refuses an unknown candidate and a starter', async () => {
    const u = await account({ coins: 10_000, xp: 5000 });
    for (const id of ['nobody', '__proto__', 7, null]) {
      const r = await post('/api/shop/char', { id }, u.token);
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe('Candidat inconnu.');
    }
    expect((await post('/api/shop/char', { id: 'victor' }, u.token)).status).toBe(409);
  });

  it('charges once when two purchases of the same candidate race each other', async () => {
    const u = await account({ coins: 600, xp: 120 });
    const statuses = (await Promise.all([post('/api/shop/char', { id: 'lucie' }, u.token), post('/api/shop/char', { id: 'lucie' }, u.token)])).map(r => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect((await store.user(u.id)).coins).toBe(300);
  });

  it('sells a part option, never a common one nor a trail', async () => {
    const u = await account({ coins: 200 });
    const common = await post('/api/shop/part', { category: 'wheels', value: 'classic' }, u.token);
    expect(common.status).toBe(400);
    expect((await common.json()).error).toBe('Cette option est gratuite.');
    const trail = await post('/api/shop/part', { category: 'trail', value: 'laser' }, u.token);
    expect(trail.status).toBe(400);
    expect((await trail.json()).error).toBe('Les traînées ne s’achètent pas.');
    for (const body of [{ category: 'wheels', value: 'square' }, { category: 'roof', value: 'gold' }, { category: 'wheels' }, { category: ['wheels'], value: 'gold' }]) {
      const r = await post('/api/shop/part', body, u.token);
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe('Option inconnue.');
    }
    expect((await post('/api/shop/part', { category: 'wheels', value: 'gold' }, u.token)).status).toBe(402);   // mythic: 400
    const ok = await post('/api/shop/part', { category: 'wheels', value: 'chrome' }, u.token);                 // rare: 150
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j.bought).toEqual({ kind: 'part', key: 'wheels:chrome', price: 150 });
    expect(j.profile).toMatchObject({ coins: 50, owned: { parts: ['wheels:chrome'] } });
    await store.addCoins(u.id, 150);
    expect((await post('/api/shop/part', { category: 'wheels', value: 'chrome' }, u.token)).status).toBe(409);
  });

  it('lets a player in a lobby drive a candidate the moment it is bought', async () => {
    const u = await account({ coins: 300, xp: 120 });
    const c = client(srv.port); await c.open;
    c.send({ t: 'hello', token: u.token }); await c.next(m => m.t === 'welcome');
    c.send({ t: 'create' }); await c.next(m => m.t === 'room' && m.room.players.length === 1);
    c.send({ t: 'set', charId: 'lucie' });
    expect((await c.next(m => m.t === 'error')).msg).toMatch(/débloqué/);                  // level 2 reached, not bought yet
    expect((await post('/api/shop/char', { id: 'lucie' }, u.token)).status).toBe(200);
    await c.next(m => m.t === 'profile');
    c.send({ t: 'set', charId: 'lucie' });
    await c.next(m => m.t === 'room' && m.room.players[0].charId === 'lucie');
    c.close();
  });

  it('gives the admin nothing to buy: it owns everything', async () => {
    const token = await adminToken();
    expect((await post('/api/shop/char', { id: 'thierry' }, token)).status).toBe(409);
    expect((await post('/api/shop/part', { category: 'skin', value: 'flames' }, token)).status).toBe(409);
  });
});

describe('the Plitibox', () => {
  it('needs its price', async () => {
    const u = await account({ coins: BOX_PRICE - 1 });
    const r = await post('/api/box/open', {}, u.token);
    expect(r.status).toBe(402);
    expect((await store.user(u.id)).coins).toBe(BOX_PRICE - 1);
  });

  it('grants a candidate, a part or a trail, and refunds a duplicate by grade', async () => {
    const u = await account({ coins: 4 * BOX_PRICE });
    rolls.push(0.01, 0);                                     // a candidate, the first of the pool: lucie (common), below its level
    let j = await (await post('/api/box/open', {}, u.token)).json();
    expect(j.drop).toEqual({ kind: 'char', id: 'lucie', grade: 'common', duplicate: false, refund: 0 });
    expect(j.profile.owned.chars).toEqual(['lucie']);
    expect(j.profile.unlocked).toContain('lucie');
    expect(j.profile.coins).toBe(3 * BOX_PRICE);

    rolls.push(0.01, 0);                                     // lucie again: refunded
    j = await (await post('/api/box/open', {}, u.token)).json();
    expect(j.drop).toMatchObject({ kind: 'char', id: 'lucie', duplicate: true, refund: REFUND.common });
    expect(j.profile.coins).toBe(2 * BOX_PRICE + REFUND.common);

    rolls.push(0.03, 0);                                     // a part, the first of the pool: wheels:chrome (rare)
    j = await (await post('/api/box/open', {}, u.token)).json();
    expect(j.drop).toEqual({ kind: 'part', id: 'wheels:chrome', grade: 'rare', duplicate: false, refund: 0 });
    expect(j.profile.owned.parts).toEqual(['wheels:chrome']);

    rolls.push(0.05, 0.99999);                               // the last of that pool: the laser trail (incredible)
    j = await (await post('/api/box/open', {}, u.token)).json();
    expect(j.drop).toEqual({ kind: 'trail', id: 'laser', grade: 'incredible', duplicate: false, refund: 0 });
    expect(j.profile.owned.trails).toEqual(['laser']);
    expect(j.profile.coins).toBe(REFUND.common);
    expect(j.profile.stats).toMatchObject({ boxes: 4, drops: { char: 2, part: 1, trail: 1, coins: 0 }, coinsSpent: 4 * BOX_PRICE, coinsEarned: REFUND.common });
  });

  it('pays every coin tier', async () => {
    const tiers = [[0.1, 5], [0.55, 10], [0.86, 50], [0.96, 100], [0.99, 500]];
    const u = await account({ coins: tiers.length * BOX_PRICE });
    let earned = 0, opened = 0;
    for (const [u2, amount] of tiers) {
      rolls.push(0.5, u2);
      const j = await (await post('/api/box/open', {}, u.token)).json();
      expect(j.drop).toEqual({ kind: 'coins', amount });
      earned += amount; opened++;
      expect(j.profile.coins).toBe((tiers.length - opened) * BOX_PRICE + earned);
    }
    expect((await store.user(u.id)).stats).toMatchObject({ boxes: 5, drops: { coins: 5 }, coinsEarned: earned, coinsSpent: 5 * BOX_PRICE });
  });

  it('tells the account’s sockets the new balance and inventory', async () => {
    const u = await account({ coins: BOX_PRICE });
    const c = client(srv.port); await c.open;
    c.send({ t: 'hello', token: u.token }); await c.next(m => m.t === 'welcome');
    rolls.push(0.01, 0.99999);                               // thierry, the last candidate of the pool
    expect((await post('/api/box/open', {}, u.token)).status).toBe(200);
    const p = await c.next(m => m.t === 'profile');
    expect(p).toMatchObject({ gained: 0, coins: 0, profile: { coins: 0, owned: { chars: ['thierry'] } } });
    expect(p.profile.unlocked).toContain('thierry');
    c.close();
  });
});

describe('friends’ stats', () => {
  it('lists accepted friends only, with level, stats and collection, never coins', async () => {
    const a = await account(), b = await account({ coins: 999, xp: 120 }), c = await account(), d = await account();
    await store.requestFriend(a.id, b.id); await store.acceptFriend(b.id, a.id);
    await store.requestFriend(a.id, c.id);                   // pending, asked by a
    await store.requestFriend(d.id, a.id);                   // pending, asked of a
    await store.grant(b.id, { kind: 'trails', item: 'laser' });
    await store.setStats(b.id, { races: 4, wins: 'junk' });
    const r = await get('/api/stats/friends', a.token);
    expect(r.status).toBe(200);
    const { friends } = await r.json();
    expect(friends).toHaveLength(1);
    expect(friends[0]).toMatchObject({ id: b.id, name: b.name, level: 2, stats: { races: 4, wins: 0 }, collection: { have: 1 } });
    expect(Object.keys(friends[0]).sort()).toEqual(['collection', 'id', 'level', 'name', 'stats']);
    expect((await (await get('/api/stats/friends', c.token)).json()).friends).toEqual([]);
  });
});

describe('the admin’s coin grant', () => {
  it('is the admin’s only', async () => {
    const u = await account();
    for (const token of [undefined, u.token]) expect((await post('/api/admin/coins', { id: u.id, amount: 10 }, token)).status).toBe(401);
    expect((await store.user(u.id)).coins).toBe(0);
  });

  it('takes a whole number from 0 to 100 000, for an account that exists', async () => {
    const token = await adminToken(); const u = await account();
    for (const amount of [100_001, -1, 'x', 1.5, null, '10']) expect((await post('/api/admin/coins', { id: u.id, amount }, token)).status, String(amount)).toBe(400);
    expect((await post('/api/admin/coins', { amount: 5 }, token)).status).toBe(400);
    expect((await post('/api/admin/coins', { id: 'nobody', amount: 5 }, token)).status).toBe(404);
    expect((await post('/api/admin/coins', { id: u.id, amount: 0 }, token)).status).toBe(200);
  });

  it('credits the account and shows the balance on its socket at once', async () => {
    const token = await adminToken(); const u = await account();
    const c = client(srv.port); await c.open;
    c.send({ t: 'hello', token: u.token }); await c.next(m => m.t === 'welcome');
    const r = await post('/api/admin/coins', { id: u.id, amount: 1000 }, token);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ user: { id: u.id, name: u.name, coins: 1000 } });
    expect((await c.next(m => m.t === 'profile')).profile.coins).toBe(1000);
    const listed = (await (await get('/api/admin/users?q=' + u.name.toLowerCase(), token)).json()).users[0];
    expect(listed.coins).toBe(1000);
    c.close();
  });
});

describe('settleRace', () => {
  const DAY = Date.UTC(2026, 9, 27, 12);
  /** A fresh account in its own store, its daily bonus already paid on DAY unless `daily`. */
  async function fresh({ daily = false, xp = 0 } = {}) {
    const s = openFileStore(null);
    let u = await s.createUser({ name: 'R' + (++seq), hash: 'x' });
    if (xp) u = await s.addXp(u.id, xp);
    if (!daily) u = await s.setStats(u.id, { lastDaily: utcDay(DAY) });
    return { s, u };
  }

  it('pays politicoins by place, a DNF and a team win', async () => {
    for (let rank = 0; rank < 8; rank++) {
      const { s, u } = await fresh();
      const { after, gain } = await settleRace(s, u, { rank, field: 8, finished: true }, { now: DAY });
      expect(gain.coins, 'rank ' + rank).toBe(RACE_COINS[Math.min(rank, RACE_COINS.length - 1)]);
      expect(after.coins).toBe(gain.coins);
      expect(gain).toMatchObject({ daily: false, levelUp: false, levelUpCoins: 0 });
    }
    let { s, u } = await fresh();
    expect((await settleRace(s, u, { rank: 0, field: 6, finished: false }, { now: DAY })).gain).toMatchObject({ xp: 10, coins: 5 });
    ({ s, u } = await fresh());
    expect((await settleRace(s, u, { rank: 1, field: 6, finished: true, teamWon: true }, { now: DAY })).gain).toMatchObject({ xp: 80, coins: 45 + 20 });
  });

  it('pays the level-up bonus for every level reached', async () => {
    const { s, u } = await fresh({ xp: 100 });
    const { after, gain } = await settleRace(s, u, { rank: 0, field: 6, finished: true }, { now: DAY });
    expect(gain).toMatchObject({ xp: 70, levelUp: true, levelUpCoins: levelUpCoins(2), coins: 60 + 200 });
    expect(after.xp).toBe(170);
    expect(levelUpBonus(1, 4)).toBe(200 + 300 + 400);
    expect(levelUpBonus(3, 3)).toBe(0);
    // a stale record of the account does not pay a level twice: the level before is read from the stored total
    const again = await settleRace(s, u, { rank: 5, field: 6, finished: true }, { now: DAY });
    expect(again.gain).toMatchObject({ levelUp: false, levelUpCoins: 0 });
  });

  it('pays the daily bonus on the first race of each UTC day only', async () => {
    const { s, u } = await fresh({ daily: true });
    const late = Date.UTC(2026, 9, 27, 23, 0), later = Date.UTC(2026, 9, 27, 23, 59), next = Date.UTC(2026, 9, 28, 0, 1);
    const first = await settleRace(s, u, { rank: 5, field: 6, finished: true }, { now: late });
    expect(first.gain).toMatchObject({ daily: true, coins: 12 + DAILY_COINS });
    expect((await settleRace(s, u, { rank: 5, field: 6, finished: true }, { now: later })).gain).toMatchObject({ daily: false, coins: 12 });
    const third = await settleRace(s, u, { rank: 5, field: 6, finished: true }, { now: next });
    expect(third.gain).toMatchObject({ daily: true, coins: 12 + DAILY_COINS });
    expect(third.after.stats).toMatchObject({ lastDaily: '2026-10-28', lastRaceAt: next });
  });

  it('keeps the best lap and race time per circuit, and counts everything', async () => {
    const { s, u } = await fresh();
    const race = o => settleRace(s, u, { field: 6, finished: true, trackId: 'elysee', charId: 'victor', solo: true, ...o }, { now: DAY });
    await race({ rank: 0, bestLap: 42.5, time: 140 });
    await race({ rank: 2, bestLap: 40, time: 150 });
    await race({ rank: 4, bestLap: 50, time: 120, solo: false, teamWon: true });
    await race({ rank: 1, bestLap: 3, time: 4000 });                                         // out of range: ignored
    await race({ rank: 0, bestLap: 39, time: 100, finished: false, charId: 'nobody' });       // DNF: no race time, no win
    const { after } = await race({ rank: 3, bestLap: 30, trackId: 'nowhere' });               // unknown circuit: no time kept
    expect(after.stats).toEqual({
      races: 6, wins: 1, podiums: 3, finished: 5, dnf: 1, solo: 5, team: 1, teamWins: 1, boxes: 0,
      coinsEarned: 60 + (35 + levelUpCoins(2)) + (18 + 20) + 45 + 5 + (25 + levelUpCoins(3)), coinsSpent: 0,   // 120 xp at the second race, 280 at the last
      drops: { char: 0, part: 0, trail: 0, coins: 0 },
      bestLap: { elysee: 39 }, bestTime: { elysee: 120 }, byChar: { victor: 5 },
      lastDaily: utcDay(DAY), lastRaceAt: DAY,
    });
    expect(normaliseStats(after.stats)).toEqual(after.stats);
  });

  it('answers null for an account that is gone', async () => {
    const s = openFileStore(null);
    expect(await settleRace(s, { id: 'gone', xp: 0 }, { rank: 0, field: 6, finished: true })).toBeNull();
  });
});

describe('ownedOf', () => {
  it('seeds a pre-economy account once with what its level had unlocked', async () => {
    const s = openFileStore(null); const log = { info: vi.fn() };
    const created = await s.createUser({ name: 'Ancien', hash: 'x' });
    const u = await s.addXp(created.id, 120 + 160 + 200);                                       // level 4
    expect(u.owned).toBeNull();
    const setOwned = vi.spyOn(s, 'setOwned');
    expect(await ownedOf(s, u, { log })).toEqual({ chars: ['lucie', 'patrick', 'bernadette'], parts: [], trails: [] });
    expect(setOwned).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(await ownedOf(s, u, { log })).toEqual({ chars: ['lucie', 'patrick', 'bernadette'], parts: [], trails: [] });   // the same stale record
    expect(setOwned).toHaveBeenCalledTimes(1);
    expect((await s.user(u.id)).owned).toEqual({ chars: ['lucie', 'patrick', 'bernadette'], parts: [], trails: [] });
  });

  it('seeds a new account with nothing, quietly, and cleans a stored inventory', async () => {
    const s = openFileStore(null); const log = { info: vi.fn() };
    const u = await s.createUser({ name: 'Neuf', hash: 'x' });
    expect(await ownedOf(s, u, { log })).toEqual({ chars: [], parts: [], trails: [] });
    expect((await s.user(u.id)).owned).toEqual({ chars: [], parts: [], trails: [] });
    expect(log.info).not.toHaveBeenCalled();
    const junk = await s.setOwned(u.id, { chars: ['victor', 'thierry', 'nobody'], parts: ['wheels:classic', 'wheels:gold'], trails: ['none'] });
    expect(await ownedOf(s, junk, { log })).toEqual({ chars: ['thierry'], parts: ['wheels:gold'], trails: [] });
  });

  it('gives the admin the whole catalogue without storing it', async () => {
    const s = openFileStore(null);
    const u = await s.createUser({ name: 'Admin', hash: 'x' });
    const setOwned = vi.spyOn(s, 'setOwned');
    expect(await ownedOf(s, u, { admin: true })).toBe(EVERYTHING);
    expect(setOwned).not.toHaveBeenCalled();
  });
});

describe('normaliseStats', () => {
  it('repairs every field and drops what it does not know', () => {
    expect(normaliseStats(null)).toEqual({
      races: 0, wins: 0, podiums: 0, finished: 0, dnf: 0, solo: 0, team: 0, teamWins: 0, boxes: 0, coinsEarned: 0, coinsSpent: 0,
      drops: { char: 0, part: 0, trail: 0, coins: 0 }, bestLap: {}, bestTime: {}, byChar: {}, lastDaily: null, lastRaceAt: null,
    });
    const s = normaliseStats({
      races: 3, wins: -1, podiums: 1.5, dnf: '2', junk: 1,
      drops: { char: 2, part: -1, hat: 4 }, bestLap: { elysee: 41, bourbon: 2, nowhere: 30 }, bestTime: 'fast',
      byChar: JSON.parse('{"victor": 2, "nobody": 3, "gege": 0, "__proto__": {"x": 1}}'), lastDaily: 'yesterday', lastRaceAt: -4,
    });
    expect(s).toMatchObject({ races: 3, wins: 0, podiums: 0, dnf: 0, drops: { char: 2, part: 0, trail: 0, coins: 0 }, bestLap: { elysee: 41 }, bestTime: {}, byChar: { victor: 2 }, lastDaily: null, lastRaceAt: null });
    expect(s).not.toHaveProperty('junk');
    expect(normaliseStats([1, 2])).toEqual(normaliseStats({}));
  });
});
