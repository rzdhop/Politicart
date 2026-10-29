// Procedural surfaces for the circuits: asphalt, cobbles, gravel, lawns,
// water, facades, roofs, awnings, metal and hedges, each a colour map with a
// normal map (and a roughness map where it pays), baked from a height field
// of periodic noise (fabric.js's) rather than shipped as images, which is
// why the game needs no texture assets at all.
//
// Rules this module keeps (fabric.js's, for the race):
//
// - Everything is drawn through primitives.canvasTexture, so on the game
//   server and in Node tests (no document) each texture is a blank Texture
//   and no pixel is ever computed. The pixels come from the pure
//   texturePixels(), which tests call directly.
// - Deterministic: hashed noise from a per-kind seed, never Math.random.
// - Sized by texture tier (fabric.js textureTier): 512 px on 'high', 256 on
//   'phone' and 'low'; 'low' also drops the normal maps of the ground and
//   facade families, which cover most of a phone's pixels.
// - Built lazily, once per tier: textures() installs a getter per kind on
//   TEX, the first read bakes the kind and caches it, and the cache is kept
//   across races (a bake is a GPU upload). A change of tier frees the old
//   bakes. **Load order matters: textures() must run before any builder
//   reads TEX.*,** which buildTrack relies on. surface(kind) gives the full
//   set { map, normalMap, roughnessMap } for a material; TEX.<kind> is its
//   map, as the builders have always read it.
// - In r128 every map of a material shares the colour map's offset and
//   repeat (one uvTransform), so a builder that needs its own repeat clones
//   the map alone and keeps the shared normal map.
import * as THREE from 'three';

import { cellBump, fbm, hash2, smooth, textureTier } from './fabric.js';
import { canvasTexture } from './primitives.js';
import { getPoly } from './state.js';

const TAU = Math.PI * 2;
const frac = x => x - Math.floor(x);
/** '#rrggbb' or 0xrrggbb to [r, g, b] in 0..1. */
const rgb = c => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const set = (o, c, k = 1) => { o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; };
/** A dark line of width w (in x units) centred on each integer of x, 1 on the line, 0 off it. */
const line = (x, w) => { const f = frac(x); return 1 - smooth(w * 0.5, w, Math.min(f, 1 - f)); };

// A cell id for the pebble, leaf and stone helpers: set by the last call,
// read by the caller for a per-cell colour (cheaper than returning a pair).
let CELL = 0;
/** Round pebbles on a jittered, staggered grid: the highest bump of the nine cells around the pixel, CELL its id. */
function pebbles(u, v, cu, cv, r, s, keep) {
  const y = v * cv, row = Math.floor(y); let best = 0, id = 0;
  for (let rj = row - 1; rj <= row + 1; rj++) {
    const x = u * cu + (((rj % 2) + 2) % 2 ? 0.5 : 0), col = Math.floor(x), my = ((rj % cv) + cv) % cv;
    for (let ci = col - 1; ci <= col + 1; ci++) {
      const mx = ((ci % cu) + cu) % cu;
      if (hash2(mx, my, s) > keep) continue;
      const fx = x - ci - 0.5 - (hash2(mx, my, s + 1) * 0.4 - 0.2), fy = y - rj - 0.5 - (hash2(mx, my, s + 2) * 0.4 - 0.2);
      const d = Math.hypot(fx, fy) / r; if (d >= 1) continue;
      const b = 1 - d * d * (3 - 2 * d); if (b > best) { best = b; id = mx * 131 + my; }
    }
  }
  CELL = id; return best;
}

// ---------- The kinds ----------
//
// Each kind: `family` ('road' | 'ground' | 'water' | 'facade' | 'roof' |
// 'misc'; 'ground' and 'facade' lose their normal map on 'low'), `strength`
// the normal-map slope at 512 px, `rough` whether a roughness map is baked,
// `repeat` the map's default repeat, and px(u, v, N, o), which writes the
// height o.h in [0, 1], the colour o.r/o.g/o.b in 0..1 and, for a rough
// kind, o.rough in 0..1. N.s(n) is the noise seed n offset by the bake's
// seed; N.x/N.y the pixel, for per-pixel grain that tiles by construction.
//
// Where a tile lands: the road tiles 30 m across (u) by its period along
// (v: 20 m asphalt, 8 m cobbles, 10 m gravel); the ground 11.4 m; a facade
// 8 m by 9 m (three floors), the palace 10 m by 10 m (two floors). v runs
// down the canvas, so on a wall v = 0 is the top of the tile.

const KINDS = {
  // Worn asphalt: aggregate grain, wear mottle, a few darker repair patches,
  // cracks, the painted edge lines and centre dash the road always had, and
  // one manhole cover per tile.
  asphalt: { family: 'road', strength: 4, rough: true,
    px(u, v, N, o) {
      const grain = hash2(N.x, N.y, N.s(1)), mottle = fbm(u, v, 6, 6, 3, N.s(2));
      const patch = fbm(u, v, 3, 3, 2, N.s(3)), onPatch = smooth(0.6, 0.65, patch);
      const crack = (1 - smooth(0.003, 0.009, Math.abs(fbm(u, v, 14, 14, 3, N.s(4)) - 0.5))) * smooth(0.52, 0.6, fbm(u, v, 2, 2, 2, N.s(57)));
      let h = 0.55 + (grain - 0.5) * 0.25 + (mottle - 0.5) * 0.1 + onPatch * 0.06 - crack * 0.35;
      const c = 0.225 + (grain - 0.5) * 0.07 + (mottle - 0.5) * 0.06 - onPatch * 0.045 - crack * 0.12;
      o.r = c * 0.97; o.g = c; o.b = c * 1.08; o.rough = 0.95 - onPatch * 0.1;
      const edge = (u > 0.024 && u < 0.043) || (u > 0.957 && u < 0.976), dash = Math.abs(u - 0.5) < 0.016 && v < 0.45;
      if (edge || dash) { const wear = 0.72 + 0.28 * smooth(0.3, 0.7, mottle) - crack * 0.3; o.r = 0.91 * wear; o.g = 0.89 * wear; o.b = 0.84 * wear; h += 0.03; o.rough = 0.6; }
      const d = Math.hypot(u - 0.72, (v - 0.3) * 0.667);
      if (d < 0.03) { const rim = 1 - smooth(0.024, 0.03, d), ring = Math.sin(d * 700) * 0.5 + 0.5; const g = 0.19 + ring * 0.07 * rim; o.r = g; o.g = g; o.b = g * 1.05; h = 0.5 + ring * 0.05 * rim - 0.12 * (1 - rim); o.rough = 0.5; }
      o.h = h;
    } },
  // Parisian fan cobbles (pavés en éventail): staggered fans of arcs, each
  // stone a rounded dome with its own grey, dark mortar between.
  cobble: { family: 'road', strength: 5, rough: true, repeat: [3, 1],
    px(u, v, N, o) {
      const nx = 4, sx = 1 / nx, sy = sx / 2, R = sx * 0.78;
      let best = 2, cx = 0, cy = 0, id = 0;
      const j0 = Math.floor(v / sy);
      for (let j = j0 - 1; j <= j0 + 2; j++) for (let i = -1; i <= nx; i++) {
        const x = (i + (j % 2 ? 0.5 : 0)) * sx, y = j * sy; if (y < v - 1e-9) continue;   // the fan opens downwards: its centre sits below
        const d = Math.hypot(u - x, v - y); if (d < best) { best = d; cx = x; cy = y; id = ((i + nx) % nx) * 97 + ((j % (2 * nx)) + 2 * nx) % (2 * nx); }
      }
      const d = Math.min(best / R, 0.999), ang = Math.atan2(v - cy, u - cx) / Math.PI + 1;   // 0..2 across the half fan above the centre
      const ring = Math.floor(d * 4), rf = frac(d * 4), n = 3 + ring * 4, af = frac(ang * n * 0.5);
      const jd = Math.min(Math.min(rf, 1 - rf) * (R / 4), Math.min(af, 1 - af) * (Math.PI * d * R / n));
      const stone = hash2(id, ring * 31 + Math.floor(ang * n * 0.5), N.s(5)), top = smooth(0, 0.009, jd);
      const grain = hash2(N.x, N.y, N.s(6));
      o.h = 0.3 + top * (0.55 + (stone - 0.5) * 0.12) + (grain - 0.5) * 0.06;
      set(o, mix(rgb(0x5a5750), mix(rgb(0x7d7b74), rgb(0xa3a19a), stone), top), 0.94 + grain * 0.12);
      o.rough = 0.95 - top * 0.25;
    } },
  // Cobbles in a running-bond grid, for squares and courtyards.
  cobbleGrid: { family: 'road', strength: 5, rough: true,
    px(u, v, N, o) {
      const cu = 16, cv = 20; let x = u * cu; const y = v * cv, row = Math.floor(y); if (row % 2) x += 0.5;
      const ix = Math.floor(x), fx = x - ix, fy = y - row, jd = Math.min(fx, 1 - fx, (fy) * cu / cv, (1 - fy) * cu / cv) / cu;
      const stone = hash2(((ix % cu) + cu) % cu, ((row % cv) + cv) % cv, N.s(7)), top = smooth(0.002, 0.012, jd), grain = hash2(N.x, N.y, N.s(8));
      o.h = 0.3 + top * (0.55 + (stone - 0.5) * 0.15) + (grain - 0.5) * 0.06;
      set(o, mix(rgb(0x5a5750), mix(rgb(0x85837c), rgb(0x9b9992), stone), top), 0.94 + grain * 0.12);
      o.rough = 0.95 - top * 0.25;
    } },
  // Raked gravel: sand with pebbles of two sizes.
  gravel: { family: 'ground', strength: 3, rough: false, repeat: [3, 1],
    px(u, v, N, o) {
      const sand = fbm(u, v, 24, 24, 3, N.s(9)), grain = hash2(N.x, N.y, N.s(10));
      let b = pebbles(u, v, 40, 40, 0.42, N.s(11), 0.7), id = CELL;
      const b2 = pebbles(u, v + 0.37 / 70, 70, 70, 0.4, N.s(12), 0.6); if (b2 > b) { b = b2; id = CELL + 7; }   // offset so the two grids' rows never line up
      const tone = hash2(id, 3, N.s(13));
      o.h = 0.35 + sand * 0.25 + b * 0.4 + (grain - 0.5) * 0.05;
      set(o, mix(mix(rgb(0xbfae80), rgb(0xd9c99c), sand), mix(rgb(0xb3a376), rgb(0xe2d3a8), tone), smooth(0, 0.3, b)), 0.95 + grain * 0.1);
    } },
  // A lawn: fine blades, patches that lean yellow.
  grass: { family: 'ground', strength: 2.5, rough: false,
    px(u, v, N, o) {
      const blade = fbm(u, v, 128, 32, 2, N.s(14)), patch = fbm(u, v, 5, 5, 3, N.s(15)), grain = hash2(N.x, N.y, N.s(16));
      o.h = 0.35 + blade * 0.55 + (grain - 0.5) * 0.1;
      set(o, mix(mix(rgb(0x5d8746), rgb(0x82ad66), blade), rgb(0x8fa55a), smooth(0.55, 0.8, patch) * 0.6), 0.95 + grain * 0.1);
    } },
  // A meadow: coarser grass with scattered flowers.
  meadow: { family: 'ground', strength: 2.5, rough: false,
    px(u, v, N, o) {
      const blade = fbm(u, v, 64, 20, 2, N.s(17)), patch = fbm(u, v, 4, 4, 3, N.s(18)), grain = hash2(N.x, N.y, N.s(19));
      const flower = cellBump(u, v, 36, 36, 0.16, true, N.s(20), 0.16);
      o.h = 0.35 + blade * 0.5 + flower * 0.2 + (grain - 0.5) * 0.1;
      set(o, mix(mix(rgb(0x4f7a3c), rgb(0x7fa85a), blade), rgb(0x9aa860), smooth(0.5, 0.8, patch) * 0.5), 0.95 + grain * 0.1);
      if (flower > 0.3) set(o, hash2(Math.floor(u * 36), Math.floor(v * 36), N.s(21)) < 0.5 ? rgb(0xf6f1e4) : rgb(0xf2c14e));
    } },
  // A mown lawn: alternate stripes of the roller's pass over fine grass.
  lawn: { family: 'ground', strength: 2, rough: false,
    px(u, v, N, o) {
      const blade = fbm(u, v, 128, 48, 2, N.s(22)), grain = hash2(N.x, N.y, N.s(23)), band = Math.floor(u * 6) % 2 ? 1.08 : 0.92;
      o.h = 0.4 + blade * 0.5 + (grain - 0.5) * 0.08;
      set(o, mix(rgb(0x4f8f3f), rgb(0x7fb55c), blade), band * (0.95 + grain * 0.1));
    } },
  // Water: crossing swells with a ripple, white where a crest breaks. Its
  // normal map is what moves (the builders scroll the map's offset).
  water: { family: 'water', strength: 7, rough: false,
    px(u, v, N, o) {
      const rip = fbm(u, v, 12, 12, 3, N.s(24));
      const h = 0.5 + 0.18 * Math.sin((u * 3 + v * 1.3) * TAU + rip * 2) + 0.12 * Math.sin((v * 2.6 - u * 1.7) * TAU + rip) + 0.2 * (rip - 0.5);
      o.h = h; set(o, mix(rgb(0x3a6f98), rgb(0x6fa3c8), smooth(0.3, 0.8, h)));
      const cap = smooth(0.8, 0.9, h); o.r += cap * 0.3; o.g += cap * 0.3; o.b += cap * 0.25;
    } },
  // Haussmann: cream stone in courses, three floors of tall windows with
  // iron balconies under a cornice.
  facade: { family: 'facade', strength: 4, rough: false,
    px(u, v, N, o) {
      const t = frac(v * 3), floor = Math.floor(v * 3), cu = frac(u * 5), bay = Math.floor(u * 5);
      const block = hash2(Math.floor(u * 7 + (Math.floor(v * 15) % 2) * 0.5), Math.floor(v * 15), N.s(25)), joint = Math.max(line(v * 15, 0.04), line(u * 7 + (Math.floor(v * 15) % 2) * 0.5, 0.03));
      const stain = fbm(u, v, 4, 4, 3, N.s(26)), grain = hash2(N.x, N.y, N.s(27));
      o.h = 0.6 - joint * 0.15 + (block - 0.5) * 0.04 + (grain - 0.5) * 0.04;
      set(o, mix(rgb(0xd8c9ab), rgb(0xece0c8), block * 0.6 + grain * 0.4), 1 - stain * 0.08 - joint * 0.1);
      if (t < 0.04) { o.h = 0.9; set(o, rgb(0x6a5a4a), 1.1); return; }                                   // the cornice
      if (Math.abs(cu - 0.5) < 0.21 && t > 0.12 && t < 0.72) {                                            // a window
        const wx = (cu - 0.29) / 0.42, wy = (t - 0.12) / 0.6, edge = Math.min(wx, 1 - wx) < 0.07 || Math.min(wy, 1 - wy) < 0.04;
        const bar = Math.abs(wx - 0.5) < 0.04 || Math.abs(wy - 0.45) < 0.025, lit = hash2(bay, floor, N.s(28));
        o.h = 0.4; if (edge || bar) { o.h = 0.55; set(o, rgb(0xe9e0cc)); } else { set(o, mix(rgb(0x2d3b55), rgb(0x9fb4cf), (1 - wy) * 0.35 + lit * 0.15)); }
      }
      if (Math.abs(cu - 0.5) < 0.27 && t > 0.5 && t < 0.72) {                                             // the balcony's railing
        const rail = line(cu * 14, 0.1) > 0.5 || t < 0.515 || t > 0.705;
        if (rail) { o.h = 0.85; set(o, rgb(0x2e2e2e)); }
      }
    } },
  // Brick: running bond with light mortar, four bays of white-framed windows.
  brick: { family: 'facade', strength: 4, rough: false,
    px(u, v, N, o) {
      const rows = 48, cols = 24; const y = v * rows, row = Math.floor(y); let x = u * cols; if (row % 2) x += 0.5;
      const col = Math.floor(x), fx = x - col, fy = y - row, mortar = fx < 0.08 || fy < 0.14;
      const b = hash2(((col % cols) + cols) % cols, row % rows, N.s(29)), grain = hash2(N.x, N.y, N.s(30));
      const tone = [rgb(0x9a4a3a), rgb(0xb0604a), rgb(0x8a4232), rgb(0x7d3d33)][Math.floor(b * 4)];
      o.h = mortar ? 0.35 : 0.65 + (b - 0.5) * 0.08 + (grain - 0.5) * 0.06;
      set(o, mortar ? rgb(0xbfb5a8) : tone, 0.92 + grain * 0.16);
      const t = frac(v * 3), floor = Math.floor(v * 3), cu = frac(u * 4), bay = Math.floor(u * 4);
      if (Math.abs(cu - 0.5) < 0.2 && t > 0.15 && t < 0.7) {
        const wx = (cu - 0.3) / 0.4, wy = (t - 0.15) / 0.55, edge = Math.min(wx, 1 - wx) < 0.08 || Math.min(wy, 1 - wy) < 0.05, bar = Math.abs(wx - 0.5) < 0.04 || Math.abs(wy - 0.5) < 0.03;
        if (edge || bar) { o.h = 0.75; set(o, rgb(0xf0ece2)); } else { o.h = 0.45; set(o, mix(rgb(0x202c3a), rgb(0x8fa6c0), (1 - wy) * 0.4 + hash2(bay, floor, N.s(31)) * 0.1)); }
      }
      if (Math.abs(cu - 0.5) < 0.24 && t > 0.7 && t < 0.73) { o.h = 0.8; set(o, rgb(0xd9d2c4)); }       // the sill
    } },
  // Marseille: pale warm plaster (the builder tints it ochre or pink), four
  // bays of windows between louvred shutters, a small iron balcony.
  marseille: { family: 'facade', strength: 3.5, rough: false,
    px(u, v, N, o) {
      const mottle = fbm(u, v, 5, 5, 3, N.s(32)), grain = hash2(N.x, N.y, N.s(33)), t = frac(v * 3), floor = Math.floor(v * 3), cu = frac(u * 4), bay = Math.floor(u * 4);
      o.h = 0.6 + (mottle - 0.5) * 0.12 + (grain - 0.5) * 0.06;
      set(o, mix(rgb(0xe9d4b8), rgb(0xf6e6cf), mottle), (0.96 + grain * 0.08) * (1 - smooth(0.85, 1, t) * 0.12));
      if (t < 0.03) { o.h = 0.8; set(o, rgb(0xc9b394)); return; }                                        // a string course
      const sh = hash2(bay, floor, N.s(34)), shutter = [rgb(0x3f6b4a), rgb(0x3a6f98), rgb(0xd9d9d0), rgb(0x8a5a3a)][Math.floor(sh * 4)];
      const dx = Math.abs(cu - 0.5);
      if (dx > 0.17 && dx < 0.29 && t > 0.14 && t < 0.7) { const louvre = 1 - line(t * 40, 0.3) * 0.18; o.h = 0.7; set(o, shutter, louvre); return; }
      if (dx < 0.17 && t > 0.14 && t < 0.7) {
        const wx = (cu - 0.33) / 0.34, wy = (t - 0.14) / 0.56, edge = Math.min(wx, 1 - wx) < 0.09 || Math.min(wy, 1 - wy) < 0.05;
        if (edge || Math.abs(wy - 0.5) < 0.03) { o.h = 0.62; set(o, rgb(0xf2ebdc)); } else { o.h = 0.42; set(o, mix(rgb(0x24303f), rgb(0x8ea6bd), (1 - wy) * 0.35)); }
      }
      if (dx < 0.24 && t > 0.52 && t < 0.7 && (line(cu * 12, 0.1) > 0.5 || t < 0.535)) { o.h = 0.85; set(o, rgb(0x2a2a2a)); }
    } },
  // Montmartre: off-white plaster with cracks and grime, a stone ground
  // floor, three narrow bays with grey shutters, some closed.
  plaster: { family: 'facade', strength: 3.5, rough: false,
    px(u, v, N, o) {
      const grime = fbm(u, v, 4, 4, 3, N.s(35)), grain = hash2(N.x, N.y, N.s(36)), t = frac(v * 3), floor = Math.floor(v * 3), cu = frac(u * 3), bay = Math.floor(u * 3);
      const crack = (1 - smooth(0.002, 0.007, Math.abs(fbm(u, v, 9, 9, 3, N.s(37)) - 0.5))) * smooth(0.58, 0.66, grime);
      o.h = 0.6 + (grain - 0.5) * 0.08 - crack * 0.3;
      set(o, mix(rgb(0xece4d4), rgb(0xd9cfbd), grime * 0.5), (0.96 + grain * 0.08) * (1 - crack * 0.3));
      if (floor === 2) {                                                                                 // the stone ground floor
        const joint = Math.max(line(t * 6, 0.06), line(u * 6 + (Math.floor(t * 6) % 2) * 0.5, 0.04));
        o.h = 0.62 - joint * 0.2 + (grain - 0.5) * 0.06; set(o, mix(rgb(0xc9c0b0), rgb(0xd8d0c0), hash2(Math.floor(u * 6), Math.floor(t * 6), N.s(38))), 1 - joint * 0.15);
      }
      if (t < 0.03) { o.h = 0.75; set(o, rgb(0xb8ad98)); return; }
      const closed = hash2(bay, floor, N.s(39)) < 0.35, dx = Math.abs(cu - 0.5);
      if (dx < 0.15 && t > 0.16 && t < 0.68) {
        if (closed) { o.h = 0.68; set(o, rgb(0x8a8f8a), 1 - line(t * 36, 0.3) * 0.2); return; }
        const wx = (cu - 0.35) / 0.3, wy = (t - 0.16) / 0.52, edge = Math.min(wx, 1 - wx) < 0.1 || Math.min(wy, 1 - wy) < 0.06;
        if (edge || Math.abs(wy - 0.5) < 0.04) { o.h = 0.62; set(o, rgb(0xf0ebe0)); } else { o.h = 0.42; set(o, mix(rgb(0x2a3340), rgb(0x8ea0b5), (1 - wy) * 0.35)); }
      } else if (dx >= 0.15 && dx < 0.24 && t > 0.16 && t < 0.68 && !closed) { o.h = 0.68; set(o, rgb(0x8a8f8a), 1 - line(t * 36, 0.3) * 0.2); }
    } },
  // Versailles: pale rusticated stone, pilasters between arched windows, two floors.
  palace: { family: 'facade', strength: 4, rough: false,
    px(u, v, N, o) {
      const t = frac(v * 2), cu = frac(u * 4), bay = Math.floor(u * 4), floor = Math.floor(v * 2), grain = hash2(N.x, N.y, N.s(40));
      const course = line(t * 10, 0.05), block = hash2(Math.floor(u * 8 + (Math.floor(t * 10) % 2) * 0.5), Math.floor(v * 20), N.s(41));
      o.h = 0.6 - course * 0.15 + (block - 0.5) * 0.03 + (grain - 0.5) * 0.04;
      set(o, mix(rgb(0xe6dcc4), rgb(0xf3ecdc), block), (0.97 + grain * 0.06) * (1 - course * 0.1));
      const pil = Math.min(cu, 1 - cu) < 0.06;
      if (pil) { o.h = 0.78 + (grain - 0.5) * 0.02; set(o, rgb(0xd9cfb8), 1 + (0.06 - Math.min(cu, 1 - cu)) * 2); }
      if (t < 0.035) { o.h = 0.9; set(o, rgb(0xcdbf9e)); return; }                                       // the string course
      const wx = (cu - 0.3) / 0.4, wy = (t - 0.2) / 0.6;
      if (wx > 0 && wx < 1 && wy > 0 && wy < 1) {
        const arch = wy < 0.25 ? Math.hypot((wx - 0.5) * 2, (0.25 - wy) * 4) <= 1 : true;             // a round head: 0.5 m of a 2.5 m bay, 1.25 of a 5 m floor
        if (arch) {
          const edge = wy < 0.25 ? Math.hypot((wx - 0.5) * 2, (0.25 - wy) * 4) > 0.82 : Math.min(wx, 1 - wx) < 0.09 || wy > 0.94, bar = Math.abs(wx - 0.5) < 0.04 || Math.abs(wy - 0.55) < 0.025;
          if (edge) { o.h = 0.7; set(o, rgb(0xd9cfb8)); } else if (bar) { o.h = 0.55; set(o, rgb(0xe3dccb)); } else { o.h = 0.4; set(o, mix(rgb(0x334a66), rgb(0xb9c9dd), (1 - wy) * 0.35 + hash2(bay, floor, N.s(42)) * 0.1)); }
        }
      }
      if (wx > -0.1 && wx < 1.1 && t > 0.8 && t < 0.84) { o.h = 0.8; set(o, rgb(0xc9bc9c)); }           // the sill
    } },
  // A zinc roof: panels between standing seams, each its own grey.
  zinc: { family: 'roof', strength: 5, rough: true,
    px(u, v, N, o) {
      const panel = Math.floor(u * 8), seam = line(u * 8, 0.05), tone = hash2(panel, Math.floor(v * 2), N.s(43)), grain = hash2(N.x, N.y, N.s(44)), streak = fbm(u, v, 16, 3, 2, N.s(45));
      o.h = 0.5 + seam * 0.4 + (grain - 0.5) * 0.04 + (streak - 0.5) * 0.06;
      set(o, mix(rgb(0x4f5661), rgb(0x6a717c), tone * 0.6 + streak * 0.4), 1 + seam * 0.12 + (grain - 0.5) * 0.06);
      o.rough = 0.45 + streak * 0.25;
    } },
  // Terracotta canal tiles: rounded columns in overlapping rows, lichen on a few.
  tiles: { family: 'roof', strength: 6, rough: false,
    px(u, v, N, o) {
      const cols = 12, rows = 8, x = u * cols, y = v * rows, col = Math.floor(x), row = Math.floor(y), fx = x - col, fy = y - row;
      const lap = 1 - smooth(0, 0.14, fy), dome = Math.cos((fx - 0.5) * Math.PI) * 0.5 + 0.5, id = hash2(((col + (row % 2)) % cols), row % rows, N.s(46)), grain = hash2(N.x, N.y, N.s(47));
      o.h = 0.3 + dome * 0.5 * (1 - lap * 0.6) + (grain - 0.5) * 0.05;
      const tone = mix(rgb(0xa0523d), [rgb(0xa0523d), rgb(0xb0623f), rgb(0x8f4a36), rgb(0xc07a55)][Math.floor(id * 4)], 0.5);
      set(o, id > 0.95 ? mix(tone, rgb(0x8a8f6a), 0.5) : tone, (0.75 + dome * 0.3) * (1 - lap * 0.35) * (0.95 + grain * 0.1));
    } },
  // A shop awning: eight stripes down the drop, white and a grey the
  // material's colour tints, over a cloth weave.
  awning: { family: 'misc', strength: 2, rough: false,
    px(u, v, N, o) {
      const band = Math.floor(u * 8) % 2, seam = line(u * 8, 0.03), weave = (Math.sin(u * TAU * 96) * Math.sin(v * TAU * 96)) * 0.5 + 0.5, grain = hash2(N.x, N.y, N.s(48));
      o.h = 0.5 + weave * 0.08 + seam * 0.2 + (grain - 0.5) * 0.03;
      const k = band ? 1 : 0.42; o.r = k * (0.97 + weave * 0.03); o.g = k * (0.96 + weave * 0.03); o.b = k * (0.93 + weave * 0.03);
    } },
  // Painted steel going to rust: brushed grey, orange-brown patches that pit it.
  rust: { family: 'misc', strength: 3.5, rough: true,
    px(u, v, N, o) {
      const brush = fbm(u, v, 96, 6, 2, N.s(49)), spread = fbm(u, v, 5, 5, 4, N.s(50)), rust = smooth(0.52, 0.68, spread), grain = hash2(N.x, N.y, N.s(51));
      o.h = 0.6 + (brush - 0.5) * 0.06 - rust * (0.1 + grain * 0.12);
      set(o, mix(mix(rgb(0x7d838b), rgb(0x9aa0a8), brush), mix(rgb(0x7a3e22), rgb(0xb0602e), grain * 0.5 + spread * 0.5), rust));
      o.rough = 0.4 + rust * 0.55;
    } },
  // A clipped hedge: three layers of leaves, lighter where they catch the top.
  hedge: { family: 'misc', strength: 5, rough: false,
    px(u, v, N, o) {
      let b = pebbles(u, v, 28, 28, 0.65, N.s(52), 0.85), id = CELL;                                           // the layers' rows are offset so no row of gaps lines up
      const b2 = pebbles(u + 0.29 / 36, v + 0.37 / 36, 36, 36, 0.6, N.s(53), 0.8); if (b2 > b) { b = b2; id = CELL + 11; }
      const b3 = pebbles(u + 0.17 / 48, v + 0.61 / 48, 48, 48, 0.55, N.s(54), 0.75); if (b3 > b) { b = b3; id = CELL + 29; }
      const leaf = hash2(id, 5, N.s(55)), grain = hash2(N.x, N.y, N.s(56));
      o.h = 0.2 + b * 0.75 + (grain - 0.5) * 0.04;
      set(o, mix(rgb(0x1f4a28), [rgb(0x2f6b3a), rgb(0x3a7f45), rgb(0x4fa044), rgb(0x3f8a3a)][Math.floor(leaf * 4)], smooth(0, 0.5, b)), 0.95 + grain * 0.1);
    } },
};

/** Every surface kind textures() bakes. */
export const SURFACES = Object.freeze(Object.keys(KINDS));
/** The bake size per texture tier (fabric.js textureTier). */
export const TEX_SIZES = Object.freeze({ high: 512, phone: 256, low: 256 });
/** The families whose normal maps the low tier drops. */
const DROP_ON_LOW = new Set(['ground', 'facade']);
const REF = 512;

/** The texture tier the race bakes on: the detail level, 'phone' on a coarse pointer kept at "détaillés". */
export function raceTextureTier() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  return textureTier(getPoly(), coarse);
}

/**
 * The pixels of one surface, pure: { albedo, normal, rough } RGBA bytes
 * (size x size, row-major, top row first), normal null with `normals:
 * false`, rough null for a kind without a roughness map. Same kind, size
 * and seed, same bytes. The normal map is the height field's
 * central-difference gradient, wrapped at the edges so it tiles, its slope
 * scaled to 512 px so the relief reads the same at every tier.
 */
export function texturePixels(kind, size, opts = {}) {
  const steps = texturePixelSteps(kind, size, opts);
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}

/** texturePixels as a generator: the same bytes, with a yield every `rows` rows of each pass, so a bake can be spread over frames. */
export function* texturePixelSteps(kind, size, { seed = 0, normals = true, rows = 32 } = {}) {
  const k = KINDS[kind];
  if (!k) throw new Error('textures: unknown kind "' + kind + '"');
  const shift = (seed | 0) * 1013, N = { s: n => n + shift, x: 0, y: 0 }, o = { h: 0, r: 0, g: 0, b: 0, rough: 1 };
  const H = new Float32Array(size * size), albedo = new Uint8ClampedArray(size * size * 4), rough = k.rough ? new Uint8ClampedArray(size * size * 4) : null;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x; N.x = x; N.y = y;
      k.px(x / size, y / size, N, o);
      H[i] = o.h < 0 ? 0 : o.h > 1 ? 1 : o.h;
      albedo[i * 4] = o.r * 255; albedo[i * 4 + 1] = o.g * 255; albedo[i * 4 + 2] = o.b * 255; albedo[i * 4 + 3] = 255;
      if (rough) { const r = o.rough * 255; rough[i * 4] = r; rough[i * 4 + 1] = r; rough[i * 4 + 2] = r; rough[i * 4 + 3] = 255; }
    }
    if (y % rows === rows - 1) yield;
  }
  if (!normals) return { albedo, normal: null, rough };
  const normal = new Uint8ClampedArray(size * size * 4), st = k.strength * (size / REF);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = H[y * size + (x + 1) % size] - H[y * size + (x - 1 + size) % size];
      const dy = H[((y - 1 + size) % size) * size + x] - H[((y + 1) % size) * size + x];
      let nx = -dx * st, ny = -dy * st, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      normal[i * 4] = (nx * 0.5 + 0.5) * 255; normal[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; normal[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; normal[i * 4 + 3] = 255;
    }
    if (y % (rows * 2) === rows * 2 - 1) yield;   // the normal pass is about half the cost of the colour pass
  }
  return { albedo, normal, rough };
}

// ---------- Textures ----------

/** The maps of each kind by kind, for the current tier. */
const cache = new Map();
/** The kinds asked of surface() since the last takeSurfaceRequests(): what a build used, for the test that its pre-bake list is complete. */
const requested = new Set();
const HEADLESS = typeof document === 'undefined';

/** Paint RGBA bytes into a canvas texture (blank headless: the bytes are never computed there). */
function pixelTexture(size, bytes) {
  return canvasTexture(size, size, c => { const img = c.createImageData(size, size); img.data.set(bytes()); c.putImageData(img, 0, 0); });
}
function dress(t, name, repeat) {
  t.name = name; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

/** The maps TEX holds and the builders read, by kind: a mutable record so a tier change can replace them. */
export const TEX = {};

/**
 * A surface's textures on the current tier: { map, normalMap, roughnessMap }
 * (null where the tier or the kind has none). Baked on the first call and
 * cached for the tier; the maps are shared, so a builder that needs its own
 * repeat clones the map alone (the normal map follows the map's transform).
 * `baked` is the kind's pixels when bakeSurface computed them ahead.
 */
export function surface(kind, baked = null) {
  if (!TEX.ready) textures();
  const k = KINDS[kind];
  if (!k) throw new Error('textures: unknown kind "' + kind + '"');
  requested.add(kind);
  let e = cache.get(kind);
  if (!e) {
    const { size, normals } = bakeSize(k);
    let px = baked;
    const pixels = () => px || (px = texturePixels(kind, size, { normals }));
    e = { map: dress(pixelTexture(size, () => pixels().albedo), 'tex:' + kind, k.repeat), normalMap: null, roughnessMap: null };
    if (normals) e.normalMap = dress(pixelTexture(size, () => pixels().normal), 'tex:' + kind + ':normal', null);
    if (k.rough) e.roughnessMap = dress(pixelTexture(size, () => pixels().rough), 'tex:' + kind + ':rough', null);
    cache.set(kind, e);
  }
  return e;
}

/** The bake size and whether the kind keeps its normal map, on the current tier. */
function bakeSize(k) {
  const tier = TEX.tier;
  return { size: TEX_SIZES[tier] || TEX_SIZES.high, normals: !(tier === 'low' && DROP_ON_LOW.has(k.family)) };
}

/**
 * Bake surface `kind` ahead, a few rows of pixels per step (a generator), so
 * the builder that asks for it finds it cached instead of baking 512 px of
 * noise in one go (the pre-build's slices, DEC-055). Nothing to do when it is
 * cached already; headless, where textures are stubs, nothing is computed.
 */
export function* bakeSurface(kind) {
  if (!TEX.ready) textures();
  if (cache.has(kind)) return;
  const k = KINDS[kind];
  if (!k) throw new Error('textures: unknown kind "' + kind + '"');
  if (HEADLESS) { surface(kind); return; }
  const tier = TEX.tier, { size, normals } = bakeSize(k);
  const px = yield* texturePixelSteps(kind, size, { normals });
  if (TEX.tier !== tier || cache.has(kind)) return;   // the tier changed, or a builder baked it meanwhile: these bytes are stale or spare
  surface(kind, px);
  yield;
}

/** The surface kinds asked for since the last call, and forget them. */
export function takeSurfaceRequests() {
  const out = [...requested]; requested.clear();
  return out;
}

/**
 * Make TEX ready for the current texture tier: a getter per kind that bakes
 * on first read. Idempotent on the same tier; a change of tier (the detail
 * toggle) frees the old tier's bakes, and the next race bakes the new ones.
 */
export function textures() {
  const tier = raceTextureTier();
  if (TEX.ready && TEX.tier === tier) return;
  for (const e of cache.values()) for (const t of [e.map, e.normalMap, e.roughnessMap]) if (t) t.dispose();
  cache.clear();
  TEX.tier = tier;
  for (const kind of SURFACES) Object.defineProperty(TEX, kind, { configurable: true, enumerable: true, get: () => surface(kind).map });
  TEX.ready = true;
}

/** The surfaces baked so far on this tier: kinds, and the maps they hold (for tests and the memory budget). */
export function bakedSurfaces() {
  const out = {};
  for (const [kind, e] of cache) out[kind] = { map: e.map, normalMap: e.normalMap, roughnessMap: e.roughnessMap };
  return out;
}
