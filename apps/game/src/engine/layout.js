// A race's layout: the circuit's fixed skeleton plus the variant the seed
// picks (DEC-049), and the elevation profile sampled along the lap (DEC-050).
//
// Pure: plain data in, plain data out, no Three.js, no G. track.js calls
// chooseLayout at the top of buildTrack and keeps the result as G.layout;
// buildFeatures reads layout.features instead of track.features.
//
// The data model (data.js): a track carries
//   features:  the invariant skeleton (big ramps and their pits, the crossing)
//   variants:  [{ name, features }], three named sets of extra features; one
//              is drawn per race and appended after the skeleton, in its own
//              order, so build order -- and the ids the obstacles get -- never
//              depends on the draw
//   cyclists:  { min, max }, the riders' count range
//   climates:  the climate ids this circuit allows (a later stage applies them)
//   profile:   [[f, y], ...] elevation control points, f in [0, 1) ascending
//              with f = 0 first; the lap closes on the first point at f = 1
import { SALT_LAYOUT, derive, makeRng } from './seed.js';

/**
 * The layout of a race on `track` from its `seed`:
 * `{ seed, name, variant, features, climate, cyclists }`. The same seed gives
 * the same layout on every side; a track without variants gives its skeleton.
 */
export function chooseLayout(track, seed = 0) {
  const rng = makeRng(derive(seed, SALT_LAYOUT));
  const variants = track.variants || [];
  const variant = variants.length ? rng.int(variants.length) : -1;
  const v = variants[variant];
  const cy = track.cyclists || { min: 12, max: 12 };
  const cyclists = cy.min + rng.int(Math.max(0, cy.max - cy.min) + 1);
  const climate = track.climates?.length ? rng.pick(track.climates) : null;
  return { seed: seed >>> 0, name: v?.name ?? '', variant, features: [...(track.features || []), ...(v?.features || [])], climate, cyclists };
}

/** The variants' names, in the track's order (the circuits screen lists them). */
export const layoutNames = track => (track.variants || []).map(v => v.name);

/** A seed that makes chooseLayout pick variant `i` of `track` (the first in 0..4095 that does; tests and the admin). */
export function seedForVariant(track, i) {
  for (let s = 0; s < 4096; s++) if (chooseLayout(track, s).variant === i) return s;
  return 0;
}

/**
 * The elevation along the lap: `N` heights from `profile`'s control points,
 * closed (the point at f = 0 is also the point at f = 1) and smoothed by a
 * monotone cubic (Steffen's tangents on the non-uniform knots), so a climb
 * eases in and out instead of kinking at each point and the road never
 * overshoots its control points: a flat stretch between two humps stays
 * flat. A flat or missing profile gives zeros.
 */
export function profileHeights(profile, N) {
  const out = new Float64Array(N);
  const pts = (profile || []).filter(p => Array.isArray(p) && p.length === 2).map(([f, y]) => [f, y]).sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) { if (pts.length === 1) out.fill(pts[0][1]); return out; }
  const n = pts.length;
  // the knots, wrapped: f(k - 1) sits one lap before and f(n) one lap after
  const F = k => pts[((k % n) + n) % n][0] + Math.floor(k / n);
  const Y = k => pts[((k % n) + n) % n][1];
  const secant = k => (Y(k + 1) - Y(k)) / (F(k + 1) - F(k));
  const tangent = k => {
    const d0 = secant(k - 1), d1 = secant(k), h0 = F(k) - F(k - 1), h1 = F(k + 1) - F(k);
    if (d0 * d1 <= 0) return 0;
    const p = (d0 * h1 + d1 * h0) / (h0 + h1);
    return (Math.sign(d0) + Math.sign(d1)) * Math.min(Math.abs(d0), Math.abs(d1), Math.abs(p) / 2);
  };
  for (let i = 0; i < N; i++) {
    const u = i / N;
    let k = -1; for (let j = 0; j < n; j++) if (pts[j][0] <= u) k = j;   // the segment [k, k + 1] holding u (u before the first point: the closing segment of the previous lap)
    const f0 = F(k), f1 = F(k + 1), h = f1 - f0, t = h > 0 ? (u - f0) / h : 0;
    const y0 = Y(k), y1 = Y(k + 1), m0 = tangent(k) * h, m1 = tangent(k + 1) * h;
    const t2 = t * t, t3 = t2 * t;
    out[i] = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
  }
  return out;
}
