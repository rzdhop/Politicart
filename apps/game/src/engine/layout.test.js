// A race's layout from its seed (DEC-049), and the elevation profile
// sampled along the lap (DEC-050), as pure data: every circuit, two hundred
// seeds.
import { describe, expect, it } from 'vitest';

import { TRACKS } from './data.js';
import { chooseLayout, layoutNames, profileHeights, seedForVariant } from './layout.js';

const SEEDS = Array.from({ length: 200 }, (_, i) => i);

describe('chooseLayout', () => {
  it.each(TRACKS.map(t => [t.id, t]))('on %s gives, for every seed, the skeleton then one named variant, the cyclists in range and one crossing', (_id, t) => {
    const seen = new Set();
    for (const seed of SEEDS) {
      const l = chooseLayout(t, seed);
      expect(l.seed).toBe(seed);
      expect(l.variant).toBeGreaterThanOrEqual(0); expect(l.variant).toBeLessThan(t.variants.length);
      expect(l.name).toBe(t.variants[l.variant].name);
      expect(l.features.slice(0, t.features.length)).toEqual(t.features);                        // the skeleton first, in order
      expect(l.features.slice(t.features.length)).toEqual(t.variants[l.variant].features);       // then the variant's, in its order
      expect(l.cyclists).toBeGreaterThanOrEqual(t.cyclists.min); expect(l.cyclists).toBeLessThanOrEqual(t.cyclists.max);
      expect(t.climates).toContain(l.climate);
      expect(l.features.filter(f => f.t === 'crossing')).toHaveLength(1);                         // crossings are snapshot by index
      seen.add(l.variant);
    }
    expect(seen.size).toBe(t.variants.length);                                                   // two hundred seeds reach every variant
  });

  it('is deterministic, and two seeds can differ', () => {
    const t = TRACKS[0];
    expect(chooseLayout(t, 17)).toEqual(chooseLayout(t, 17));
    const names = new Set(SEEDS.map(s => chooseLayout(t, s).name));
    expect(names.size).toBeGreaterThan(1);
  });

  it('gives a track without variants its skeleton, and defaults for the rest', () => {
    const bare = { features: [{ t: 'pad', f: 0.1 }] };
    expect(chooseLayout(bare, 5)).toEqual({ seed: 5, name: '', variant: -1, features: bare.features, climate: null, cyclists: 12 });
  });

  it('names the variants and finds a seed for each', () => {
    for (const t of TRACKS) {
      expect(layoutNames(t)).toHaveLength(3);
      for (let v = 0; v < 3; v++) expect(chooseLayout(t, seedForVariant(t, v)).variant).toBe(v);
    }
  });
});

describe('profileHeights', () => {
  it('gives zeros for a flat, empty or missing profile', () => {
    expect([...profileHeights([[0, 0]], 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...profileHeights([], 4)]).toEqual([0, 0, 0, 0]);
    expect([...profileHeights(undefined, 3)]).toEqual([0, 0, 0]);
  });

  it('passes through the control points, closes on the first, and never overshoots them', () => {
    const profile = [[0, 0], [0.25, 10], [0.5, 10], [0.75, 2]];
    const N = 400, h = profileHeights(profile, N);
    for (const [f, y] of profile) expect(h[Math.round(f * N)]).toBeCloseTo(y, 9);
    expect(h[0]).toBe(0);
    expect(h[N - 1]).toBeCloseTo(0, 1);                                   // the lap closes on the first point
    for (const y of h) { expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(10 + 1e-9); }
    for (let i = Math.round(0.25 * N); i <= Math.round(0.5 * N); i++) expect(h[i]).toBeCloseTo(10, 9);   // a flat stretch stays flat
    for (let i = 1; i < Math.round(0.25 * N); i++) expect(h[i]).toBeGreaterThanOrEqual(h[i - 1] - 1e-9);   // a climb climbs
  });

  it('is smooth: no step between neighbouring samples larger than the steepest control segment allows', () => {
    for (const t of TRACKS) {
      const N = 1800, h = profileHeights(t.profile, N);
      let maxStep = 0; for (let i = 0; i < N; i++) maxStep = Math.max(maxStep, Math.abs(h[(i + 1) % N] - h[i]));
      expect(maxStep).toBeLessThan(0.1);                                  // under 10 cm per sample (about 1.7 m of road): a 6 % grade at most
    }
  });
});
