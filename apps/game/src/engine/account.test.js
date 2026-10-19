import { describe, expect, it } from 'vitest';

import { login, me, register, reportRace } from './account.js';
import { levelFromXp, STARTERS, UNLOCKS, unlockedIds, unlockLevel, xpForRace, xpToNext } from './progress.js';
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
