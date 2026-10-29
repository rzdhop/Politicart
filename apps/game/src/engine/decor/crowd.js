// The instanced crowd (stage 7, DEC-056): twelve kinds of figure drawn as
// InstancedMesh batches, so a stand of two hundred spectators costs a few
// draws per 200 m cell instead of three to seven meshes each.
//
// A figure is three copies at the same spot, in three kinds of batch: the
// torso and arms (white, tinted per copy with the jacket's colour), the head
// and hands (white, tinted with the skin's), and its kind's own parts --
// legs, hats, signs, flags, cameras, bags, scarves -- in their own colours.
// The torso and head batches are shared by every kind, so a cell full of
// spectators draws 2 + (kinds present) parts.
//
// Bobbing: a figure given an `amp` jumps like the legacy crowd (race.js
// animateCrowd: |sin(5 t + phase)| * amp), by writing the height straight
// into its copies' instance matrices -- only the translation's y moves, so
// no matrix is recomposed. The figure's three copies are found by their
// world spot (life.js spotKey), and move together. Headless the crowd stands
// still (life.js moving()).
import * as THREE from 'three';

import { box, cyl, mat, sph, tag } from '../primitives.js';
import { G, getPoly } from '../state.js';
import { pick, rand } from '../util.js';
import { batch, moving, peekBuild, perBuild, place, spotKey } from './life.js';

/** The figure kinds, in batch order. */
export const CROWD_KINDS = Object.freeze(['plain', 'jeans', 'coat', 'child', 'elder', 'beret', 'cap', 'sign', 'flag', 'camera', 'bag', 'scarf']);
/** How often each kind turns up when a caller names none (the street's mix: mostly plain clothes). */
const MIX = [['plain', 5], ['jeans', 5], ['coat', 2], ['child', 2], ['elder', 1.5], ['beret', 1], ['cap', 2], ['sign', 1], ['flag', 1], ['camera', 1], ['bag', 2], ['scarf', 1]];
const MIX_TOTAL = MIX.reduce((t, [, w]) => t + w, 0);
/** A kind drawn from the street's mix (cosmetic: Math.random). */
export function crowdKind() { let r = Math.random() * MIX_TOTAL; for (const [k, w] of MIX) { r -= w; if (r <= 0) return k; } return 'plain'; }

/** Jacket and skin colours the copies are tinted with when the caller names none. */
export const CROWD_JACKETS = [0x3b4a6b, 0x8a2b2b, 0x2e7d5b, 0xe0b040, 0x5a5a5a, 0xd96c3a, 0x4b3f8a, 0xf0f0f0, 0x222222, 0x9ad04f, 0x2a7fd4, 0xe36f8a, 0xf2c14e, 0x6b4a2b];
export const CROWD_SKINS = [0xf1c27d, 0xe8b48a, 0xc68642, 0x8d5524, 0xf5d6c6, 0xd9a577];

const DARK = 0x2b2b35, DENIM = 0x3a5488;
/** Legs of one colour: two on "détaillés", one block on "légers". */
function legs(g, color, hi) { if (hi) { g.add(box(0.2, 0.55, 0.24, color, -0.12, 0.275, 0)); g.add(box(0.2, 0.55, 0.24, color, 0.12, 0.275, 0)); } else g.add(box(0.46, 0.55, 0.26, color, 0, 0.275, 0)); }
/** Each kind's own parts, facing +z, standing on y = 0. */
const KIND_PARTS = {
  plain: (g, hi) => legs(g, DARK, hi),
  jeans: (g, hi) => legs(g, DENIM, hi),
  coat: (g, hi, S) => { legs(g, DARK, hi); g.add(cyl(0.38, 0.46, 0.8, 0xb59a6a, 0, 0.85, 0, S)); },
  child: (g, hi, S) => { legs(g, 0x4b6fb5, hi); g.add(cyl(0.27, 0.27, 0.14, 0xc8102e, 0, 2.02, 0, S)); g.add(box(0.3, 0.04, 0.24, 0xc8102e, 0, 1.97, 0.28)); },
  elder: (g, hi, S) => { legs(g, 0x6a6a6a, hi); g.add(cyl(0.28, 0.3, 0.12, 0x5a5a5a, 0, 2.0, 0.03, S)); g.add(cyl(0.03, 0.03, 1.0, 0x6b4a2b, 0.46, 0.5, 0.2, 5)); },
  beret: (g, hi, S) => { legs(g, DARK, hi); const b = sph(0.28, 0x151515, 0, 1.99, 0, S); b.scale.y = 0.35; g.add(b); const bg = cyl(0.06, 0.06, 0.9, 0xd9a55a, -0.46, 1.1, 0.12, 6); bg.rotation.z = 0.35; g.add(bg); },
  cap: (g, hi, S) => { legs(g, DENIM, hi); g.add(cyl(0.27, 0.27, 0.14, 0x2a9fd6, 0, 2.0, 0, S)); g.add(box(0.3, 0.04, 0.26, 0x2a9fd6, 0, 1.95, 0.3)); },
  sign: (g, hi) => { legs(g, DARK, hi); g.add(cyl(0.03, 0.03, 1.4, 0x8b5a2b, 0.5, 1.6, 0, 5)); g.add(box(0.9, 0.55, 0.04, 0xf6f1e4, 0.5, 2.45, 0)); g.add(box(0.8, 0.12, 0.05, 0xc8102e, 0.5, 2.45, 0.01)); },
  flag: (g, hi) => { legs(g, DENIM, hi); g.add(cyl(0.03, 0.03, 2.2, 0xdddddd, 0.5, 1.9, 0, 5)); [0x2f55c7, 0xffffff, 0xe63946].forEach((c, i) => g.add(box(0.3, 0.5, 0.03, c, 0.65 + i * 0.3, 2.65, 0))); },
  camera: (g, hi, S) => { legs(g, DARK, hi); g.add(box(0.34, 0.24, 0.26, 0x111111, 0, 1.74, 0.38)); const l = cyl(0.08, 0.1, 0.24, 0x222222, 0, 1.74, 0.62, Math.min(S, 8)); l.rotation.x = Math.PI / 2; g.add(l); },
  bag: (g, hi) => { legs(g, DENIM, hi); g.add(box(0.34, 0.4, 0.16, 0xe0a030, 0.5, 0.56, 0)); g.add(box(0.46, 0.5, 0.22, 0x2e7d5b, 0, 1.15, -0.32)); },
  scarf: (g, hi) => { legs(g, DARK, hi); g.add(box(0.64, 0.13, 0.52, 0x2a9fd6, 0, 1.52, 0)); g.add(box(0.13, 0.42, 0.05, 0xffffff, 0.14, 1.26, 0.27)); },
};

/** The kind whose parts each kind is drawn with on "légers". */
const LOW_KIND = { plain: 'plain', jeans: 'jeans', coat: 'plain', child: 'jeans', elder: 'plain', beret: 'plain', cap: 'jeans', sign: 'sign', flag: 'flag', camera: 'plain', bag: 'jeans', scarf: 'plain' };
/** The build's crowd batches and its bobbing animator, opened on the first figure. */
const crowdSet = () => perBuild('crowd', () => {
  const hi = getPoly() === 'high', S = hi ? 8 : 5;
  const body = batch(() => { const g = new THREE.Group(); g.add(cyl(0.3, 0.36, 1.0, 0xffffff, 0, 1.0, 0, S)); if (hi) { g.add(box(0.14, 0.75, 0.16, 0xffffff, -0.4, 1.05, 0)); g.add(box(0.14, 0.75, 0.16, 0xffffff, 0.4, 1.05, 0)); } return g; }, { tint: true });
  const head = batch(() => { const g = new THREE.Group(); const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, S, hi ? 6 : 4), mat(0xffffff)); h.position.y = 1.76; g.add(tag(h)); if (hi) { g.add(box(0.12, 0.14, 0.12, 0xffffff, -0.4, 0.6, 0)); g.add(box(0.12, 0.14, 0.12, 0xffffff, 0.4, 0.6, 0)); } return g; }, { tint: true });
  const rest = {};
  // on "légers" the kinds share four batches (their hats and bags are a few pixels on a phone): fewer draws per cell
  for (const k of CROWD_KINDS) { const own = hi ? k : LOW_KIND[k]; rest[k] = rest[own] || (rest[own] = batch(() => { const g = new THREE.Group(); KIND_PARTS[own](g, hi, S); return g; })); }
  const set = { body, head, rest, bob: new Map(), count: 0 };
  // the bobbing: found on the first frame after the flush, then only the translations' y are written
  let jumping = null;
  G.animated.push(() => {
    if (!moving() || !set.bob.size) return;
    if (!jumping) {
      jumping = [];
      for (const b of new Set([body, head, ...Object.values(rest)])) for (const mesh of b.meshes) {
        const a = mesh.instanceMatrix.array, list = [];
        for (let i = 0; i < mesh.count; i++) { const o = i * 16, e = set.bob.get(spotKey(a[o + 12], a[o + 14])); if (e) list.push(o + 13, a[o + 13], e[0], e[1]); }
        if (list.length) jumping.push([mesh, Float64Array.from(list)]);
      }
    }
    const ct = G.time * 5;
    for (const [mesh, l] of jumping) { const a = mesh.instanceMatrix.array; for (let j = 0; j < l.length; j += 4) a[l[j]] = l[j + 1] + Math.abs(Math.sin(ct + l[j + 2])) * l[j + 3]; mesh.instanceMatrix.needsUpdate = true; }
  });
  return set;
});

/**
 * One instanced crowd figure at (x, z), facing `rotY` (local +z; random if
 * omitted). Options: `kind` (CROWD_KINDS; drawn from the street's mix if
 * omitted), `jacket` and `skin` colours, `amp` (how high it jumps, metres;
 * 0 stands still; default 0.1), `scale` (a child is 0.65 of it on top),
 * `y`, `world` (as life.js place(): scale-1 decor coordinates by default).
 * Nothing is added to the scene now: the batches are flushed after the
 * decor (track.js). Returns the figure's world spot { x, y, z }.
 */
export function crowd(scene, x, z, { rotY, kind, jacket, skin, amp = 0.1, scale = 1, y = 0, world = false } = {}) {
  const set = crowdSet(), p = place(x, z, { y, world }), k = KIND_PARTS[kind] ? kind : crowdKind();
  const pose = { y: p.y, rotY: rotY ?? rand(0, 6.28), scale: scale * (k === 'child' ? rand(0.6, 0.7) : rand(0.93, 1.07)) };
  set.body.add(p.x, p.z, { ...pose, color: jacket ?? pick(CROWD_JACKETS) });
  set.head.add(p.x, p.z, { ...pose, color: skin ?? pick(CROWD_SKINS) });
  set.rest[k].add(p.x, p.z, pose);
  if (amp > 0) set.bob.set(spotKey(p.x, p.z), [rand(0, 6.28), amp]);
  set.count++;
  return p;
}

/** How many instanced figures the build being made holds (tests and budgets). */
export const crowdCount = () => peekBuild('crowd')?.count ?? 0;
