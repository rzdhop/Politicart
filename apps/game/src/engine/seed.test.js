// The race seed and its streams (DEC-049): the same seed gives the same
// draws on every side, sub-streams never move each other, and a seed travels
// through JSON and structuredClone.
import { describe, expect, it } from 'vitest';

import { SALT_CYCLISTS, SALT_FEATURES, SALT_LAYOUT, derive, makeRng, mulberry32, newSeed } from './seed.js';

describe('the seeded stream', () => {
  it('repeats itself for the same seed and differs for another', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const xs = Array.from({ length: 20 }, () => a()), ys = Array.from({ length: 20 }, () => b()), zs = Array.from({ length: 20 }, () => c());
    expect(xs).toEqual(ys);
    expect(xs).not.toEqual(zs);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });

  it('gives the helpers util.js gives Math.random, within their ranges', () => {
    const r = makeRng(7);
    expect(r.seed).toBe(7);
    for (let i = 0; i < 200; i++) {
      const v = r.rand(-3, 5); expect(v).toBeGreaterThanOrEqual(-3); expect(v).toBeLessThan(5);
      const n = r.int(4); expect([0, 1, 2, 3]).toContain(n);
      expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    }
    const s = r.shuffle([1, 2, 3, 4, 5, 6]);
    expect([...s].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.shuffle([])).toEqual([]);
  });

  it('spreads its draws: a thousand picks from four options use each of them', () => {
    const r = makeRng(99); const seen = new Set();
    for (let i = 0; i < 1000; i++) seen.add(r.int(4));
    expect(seen.size).toBe(4);
  });

  it('derives one sub-stream per salt, so adding a draw to one builder never moves another', () => {
    const seed = 123456;
    const salts = [SALT_LAYOUT, SALT_FEATURES, SALT_CYCLISTS];
    const derived = salts.map(s => derive(seed, s));
    expect(new Set(derived).size).toBe(3);
    for (const d of derived) { expect(Number.isInteger(d)).toBe(true); expect(d).toBeGreaterThanOrEqual(0); expect(d).toBeLessThan(2 ** 32); }
    expect(derive(seed, SALT_LAYOUT)).toBe(derived[0]);
    expect(derive(seed + 1, SALT_LAYOUT)).not.toBe(derived[0]);
    const cyclists = makeRng(derive(seed, SALT_CYCLISTS)); const first = cyclists.next();
    makeRng(derive(seed, SALT_FEATURES)).next();                 // a draw elsewhere
    expect(makeRng(derive(seed, SALT_CYCLISTS)).next()).toBe(first);
  });

  it('draws a fresh seed as an unsigned 32-bit integer that survives JSON and structuredClone', () => {
    for (let i = 0; i < 50; i++) {
      const s = newSeed();
      expect(Number.isInteger(s)).toBe(true); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThan(2 ** 32);
      expect(JSON.parse(JSON.stringify({ s })).s).toBe(s);
      expect(structuredClone(s)).toBe(s);
    }
    expect(new Set(Array.from({ length: 20 }, newSeed)).size).toBeGreaterThan(1);
  });
});
