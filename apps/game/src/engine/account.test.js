import { describe, expect, it } from 'vitest';

import { fetchRoster, login, me, register, reportRace, saveRoster } from './account.js';
import { drivableIds, levelFromXp, profileOf, STARTERS, UNLOCKS, unlockedIds, unlockLevel, xpForRace, xpToNext } from './progress.js';
import { CHARACTERS } from './data.js';

describe('progression', () => {
  it('covers every candidate exactly once: four starters, then one per level', () => {
    expect([...STARTERS, ...UNLOCKS].sort()).toEqual(CHARACTERS.map(c => c.id).sort());
    expect(unlockedIds(0)).toEqual([...STARTERS]);
    expect(unlockedIds(1)).toEqual([...STARTERS]);
    expect(unlockedIds(2)).toHaveLength(5);
    expect(unlockedIds(13)).toHaveLength(16);
    expect(unlockLevel('victor')).toBe(1);
    expect(unlockLevel(UNLOCKS[0])).toBe(2);
    expect(unlockLevel('nobody')).toBe(Infinity);
  });

  it('turns experience into levels, each a little dearer than the last', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xpInto: 0, xpNext: 120 });
    expect(levelFromXp(119).level).toBe(1);
    expect(levelFromXp(120)).toEqual({ level: 2, xpInto: 0, xpNext: 160 });
    expect(xpToNext(3)).toBeGreaterThan(xpToNext(2));
  });

  it('pays a race by finishing place, and a team win on top', () => {
    expect(xpForRace({ rank: 0, field: 6 })).toBe(70);
    expect(xpForRace({ rank: 5, field: 6 })).toBe(20);
    expect(xpForRace({ rank: 0, field: 6, finished: false })).toBe(10);
    expect(xpForRace({ rank: 1, field: 6, teamWon: true })).toBe(60 + 20);
  });

  it('drives the starters plus the owned candidates, whatever the level (DEC-034)', () => {
    expect(drivableIds(13, null)).toEqual([...STARTERS]);
    expect(drivableIds(13, undefined)).toEqual([...STARTERS]);
    expect(drivableIds(1, { chars: [] })).toEqual([...STARTERS]);
    expect(drivableIds(1, { chars: ['thierry', 'victor', 'thierry', 'nobody', 7] })).toEqual([...STARTERS, 'thierry']);
    expect(drivableIds(1, { chars: 'thierry' })).toEqual([...STARTERS]);
    expect(drivableIds(1, 'junk')).toEqual([...STARTERS]);
  });
});

describe('profileOf', () => {
  const user = { id: 'u1', name: 'Alice', xp: 130, hash: 'secret', created: 1 };

  it('shows the level, what it makes reachable, and the starters as drivable when nothing is owned', () => {
    expect(profileOf(user)).toEqual({
      id: 'u1', name: 'Alice', xp: 130, level: 2, xpInto: 10, xpNext: 160,
      reachable: [...STARTERS, 'lucie'], unlocked: [...STARTERS], coins: 0, owned: { chars: [], parts: [], trails: [] }, stats: {},
    });
    expect(profileOf({ id: 'u0', name: 'Zero', xp: 0 }).unlocked).toEqual([...STARTERS]);
    expect(profileOf(user)).not.toHaveProperty('hash');
    expect(profileOf(user)).not.toHaveProperty('admin');
  });

  it('drives what is owned, below its level or not, and shows the purse, inventory and stats', () => {
    const owned = { chars: ['thierry'], parts: ['wheels:gold'], trails: ['laser'] };
    const p = profileOf({ ...user, coins: 42.9, stats: { races: 3 } }, { owned });
    expect(p.unlocked).toEqual([...STARTERS, 'thierry']);
    expect(p.reachable).toEqual([...STARTERS, 'lucie']);
    expect(p.coins).toBe(42);
    expect(p.owned).toBe(owned);
    expect(p.stats).toEqual({ races: 3 });
  });

  it('never shows a negative or non-numeric purse, nor stats that are not an object', () => {
    expect(profileOf({ ...user, coins: -5 }).coins).toBe(0);
    expect(profileOf({ ...user, coins: 'lots' }).coins).toBe(0);
    expect(profileOf({ ...user, stats: 'none' }).stats).toEqual({});
    expect(profileOf({ ...user, stats: null }).stats).toEqual({});
  });

  it('marks the administrator and no one else', () => {
    expect(profileOf(user, { admin: true })).toMatchObject({ admin: true });
    expect(profileOf(user, { admin: 'yes' })).not.toHaveProperty('admin');
    expect(profileOf(user, { admin: false, owned: null })).not.toHaveProperty('admin');
  });
});

describe('account API client', () => {
  const fake = (status, body) => { const calls = []; const f = async (url, init) => { calls.push([url, init]); return { ok: status < 400, status, json: async () => body }; }; f.calls = calls; return f; };

  it('posts credentials as JSON and returns the token and profile', async () => {
    const f = fake(200, { token: 't', profile: { name: 'A' } });
    const r = await register('A', 'secret1', { fetchImpl: f, base: 'https://kr.example/' });
    expect(r).toMatchObject({ ok: true, token: 't', profile: { name: 'A' } });
    const [url, init] = f.calls[0];
    expect(url).toBe('https://kr.example/api/register');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'A', password: 'secret1' });
  });

  it('carries the session in the Authorization header', async () => {
    const f = fake(200, { profile: {}, gained: 70 });
    await reportRace('tok', { rank: 0, field: 6, finished: true }, { fetchImpl: f });
    await me('tok', { fetchImpl: f });
    expect(f.calls.map(c => c[1].headers.authorization)).toEqual(['Bearer tok', 'Bearer tok']);
    expect(f.calls[0][0]).toBe('./api/progress');
  });

  it('turns failures into a sentence instead of throwing', async () => {
    expect(await login('A', 'x', { fetchImpl: fake(401, { error: 'Pseudo ou mot de passe incorrect.' }) })).toMatchObject({ ok: false, status: 401, error: 'Pseudo ou mot de passe incorrect.' });
    expect(await login('A', 'x', { fetchImpl: async () => { throw new Error('offline'); } })).toMatchObject({ ok: false, error: 'Serveur injoignable.' });
  });
});

describe('roster API client', () => {
  const fake = (status, body) => { const calls = []; const f = async (url, init) => { calls.push([url, init]); return { ok: status < 400, status, json: async () => { if (body === undefined) throw new Error('no body'); return body; } }; }; f.calls = calls; return f; };
  const roster = { chars: { victor: { name: 'Jean Test' } }, ads: [] };

  it('reads the public roster from the page origin or the remote server, with no token', async () => {
    const f = fake(200, roster);
    expect(await fetchRoster({ fetchImpl: f })).toEqual({ ok: true, status: 200, roster });
    await fetchRoster({ fetchImpl: f, base: 'https://kr.example/' });
    expect(f.calls.map(c => c[0])).toEqual(['./api/roster', 'https://kr.example/api/roster']);
    expect(f.calls[0][1].method).toBe('GET');
    expect(f.calls[0][1].headers.authorization).toBeUndefined();
  });

  it('saves with a PUT of JSON under the Bearer token and returns the roster the server stored', async () => {
    const f = fake(200, roster);
    expect(await saveRoster(roster, 'tok', { fetchImpl: f, base: 'https://kr.example' })).toEqual({ ok: true, status: 200, roster });
    const [url, init] = f.calls[0];
    expect(url).toBe('https://kr.example/api/admin/roster');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer tok' });
    expect(JSON.parse(init.body)).toEqual(roster);
  });

  it('carries the field a refused roster names, and never throws', async () => {
    const error = 'chars.victor.name : 28 caractères au plus.';
    expect(await saveRoster(roster, 't', { fetchImpl: fake(400, { error, field: 'chars.victor.name' }) })).toEqual({ ok: false, status: 400, error, field: 'chars.victor.name' });
    expect(await saveRoster(roster, 't', { fetchImpl: fake(401, { error: 'Réservé à l’administrateur.' }) })).toEqual({ ok: false, status: 401, error: 'Réservé à l’administrateur.' });
    expect(await saveRoster(roster, 't', { fetchImpl: fake(413) })).toMatchObject({ ok: false, status: 413, error: expect.stringContaining('trop lourde') });
    expect(await saveRoster(roster, 't', { fetchImpl: async () => { throw new TypeError('offline'); } })).toEqual({ ok: false, status: 0, error: 'Serveur injoignable.' });
    expect(await fetchRoster({ fetchImpl: fake(500) })).toMatchObject({ ok: false, status: 500 });
    expect(await fetchRoster({ fetchImpl: null })).toMatchObject({ ok: false, error: 'Serveur injoignable.' });
  });
});
