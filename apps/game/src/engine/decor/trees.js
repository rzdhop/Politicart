// Trees (stage 7): twelve kinds, built by growTree() for both the plain
// scene builder (street.js tree(), one group per tree as before) and the
// instanced trees of treeAt(): one batch per kind and build
// (decor/instanced.js), each copy a little turned, scaled and tinted, and
// swaying in the wind -- a slow tilt about its foot, through batch.move(), a
// third of the trees each frame so a big park stays cheap. The wind blows
// harder under an overcast sky (the mistral, the gusts before the rain).
// Headless the trees stand still (life.js moving()).
import * as THREE from 'three';

import { box, cone, cyl, sph } from '../primitives.js';
import { G, getPoly } from '../state.js';
import { pick, rand } from '../util.js';
import { batch, moving, perBuild, place } from './life.js';

/** The tree kinds: the six of before (`round` is also the fallback) and six more. */
export const TREE_KINDS = Object.freeze(['round', 'plane', 'cypress', 'topiary', 'orange', 'palm', 'pine', 'olive', 'chestnut', 'lime', 'oleander', 'poplar']);

/** Build a tree of `kind` into group g at its origin, its round parts with `S` segments. */
export function growTree(g, kind, S) {
  if (kind === 'plane') { g.add(cyl(0.4, 0.55, 7, 0x9a9282, 0, 3.5, 0, 8)); g.add(sph(3.2, 0x5d9a4a, 0, 8.5, 0, S)); g.add(sph(2.2, 0x6fab55, 1.8, 9.5, 0.8, S)); g.add(sph(2.0, 0x4f8a40, -1.6, 9.2, -0.9, S)); g.add(sph(1.8, 0x6fab55, 0.3, 11, 0, S)); }
  else if (kind === 'cypress') { g.add(cyl(0.2, 0.3, 1.5, 0x6b4a2b, 0, 0.75, 0, 6)); const c = cone(1.1, 7, 0x2f5f32, 0, 4.5, 0, S); g.add(c); }
  else if (kind === 'topiary') { g.add(cyl(0.18, 0.22, 1.2, 0x6b4a2b, 0, 0.6, 0, 6)); g.add(cone(1.0, 2.6, 0x2f6b3a, 0, 2.5, 0, S)); }
  else if (kind === 'orange') { g.add(box(1.6, 1.4, 1.6, 0x2f6b3a, 0, 0.7, 0)); g.add(box(1.7, 0.15, 1.7, 0xf6f1e4, 0, 1.4, 0)); g.add(cyl(0.12, 0.14, 1.2, 0x6b4a2b, 0, 2.0, 0, 6)); g.add(sph(1.1, 0x3f8a3a, 0, 3.2, 0, S)); for (let i = 0; i < 6; i++) g.add(sph(0.12, 0xff8c1a, rand(-0.8, 0.8), 3.2 + rand(-0.6, 0.6), rand(-0.8, 0.8), 6)); }
  else if (kind === 'palm') { const t = cyl(0.22, 0.34, 9, 0x8a6a42, 0, 4.5, 0, Math.min(7, S)); t.rotation.z = rand(-0.08, 0.08); g.add(t); const fr = S < 6 ? 5 : 7; for (let i = 0; i < fr; i++) { const a = i / fr * Math.PI * 2; const f = box(0.5, 0.12, 4.2, i % 2 ? 0x3f8a3a : 0x4fa044, 0, 0, 0); f.position.set(Math.sin(a) * 1.6, 8.6, Math.cos(a) * 1.6); f.rotation.order = 'YXZ'; f.rotation.y = a; f.rotation.x = 0.55; g.add(f); } g.add(sph(0.5, 0x6b4a2b, 0, 8.8, 0, Math.min(6, S))); }
  else if (kind === 'pine') {
    // the umbrella pine of the Mediterranean coast: a leaning bare trunk, a wide flat crown
    const t = cyl(0.25, 0.4, 9, 0x7a5a3a, 0.6, 4.4, 0, 7); t.rotation.z = -0.14; g.add(t); const br = cyl(0.12, 0.18, 3.2, 0x7a5a3a, 1.7, 8.2, 0.4, 5); br.rotation.z = -0.9; g.add(br);
    const c1 = sph(3.6, 0x3d6b34, 1.2, 9.6, 0, S); c1.scale.y = 0.38; g.add(c1); const c2 = sph(2.4, 0x4a7a3a, 2.9, 9.9, 0.9, S); c2.scale.y = 0.42; g.add(c2); const c3 = sph(2.2, 0x35602e, -0.6, 9.3, -0.8, S); c3.scale.y = 0.4; g.add(c3);
  } else if (kind === 'olive') {
    // a gnarled trunk in two, a low silvery crown
    const a = cyl(0.18, 0.3, 2.2, 0x6b5a45, -0.2, 1.1, 0, 6); a.rotation.z = 0.25; g.add(a); const b = cyl(0.15, 0.25, 2.0, 0x6b5a45, 0.3, 1.0, 0.1, 6); b.rotation.z = -0.3; g.add(b);
    g.add(sph(1.7, 0x8a9a6a, 0, 3.0, 0, S)); g.add(sph(1.2, 0x9aaa7a, 1.1, 3.3, 0.5, S)); g.add(sph(1.1, 0x7a8a5a, -1.0, 2.9, -0.4, S));
  } else if (kind === 'chestnut') {
    // the marronnier of the boulevards: a tall dome, white candles of flowers
    g.add(cyl(0.38, 0.52, 4, 0x5a4632, 0, 2, 0, 8)); const d = sph(3.6, 0x3f7a35, 0, 7.4, 0, S); d.scale.y = 1.2; g.add(d); g.add(sph(2.2, 0x4a8a3e, 1.9, 6.4, 1.2, S));
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.add(cone(0.22, 0.6, 0xf6f1e4, Math.cos(a) * 2.9, 7.6 + (i % 2) * 1.2, Math.sin(a) * 2.9, 5)); }
  } else if (kind === 'lime') {
    // a tilleul clipped into a box, as the squares have them
    g.add(cyl(0.3, 0.4, 3.4, 0x6b5a45, 0, 1.7, 0, 7)); g.add(box(3.6, 3.4, 3.6, 0x4f8a40, 0, 5.0, 0)); g.add(box(3.0, 0.6, 3.0, 0x5d9a4a, 0, 7.0, 0));
  } else if (kind === 'oleander') {
    // a laurier-rose bush in flower
    g.add(sph(1.3, 0x3f7a3a, 0, 1.1, 0, S)); g.add(sph(1.0, 0x4a8a44, 0.8, 1.4, 0.4, S));
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.add(box(0.3, 0.3, 0.3, i % 3 ? 0xe36f8a : 0xf6f1e4, Math.cos(a) * 1.1, 1.5 + (i % 2) * 0.5, Math.sin(a) * 1.1)); }
  } else if (kind === 'poplar') {
    // a tall, narrow Lombardy poplar
    g.add(cyl(0.2, 0.3, 2, 0x8a7a62, 0, 1, 0, 6)); const c = sph(1.5, 0x5d8a3a, 0, 7.5, 0, S); c.scale.y = 4.0; g.add(c);
  } else { g.add(cyl(0.35, 0.5, 3, 0x6b4a2b, 0, 1.5, 0, 8)); g.add(sph(2.4, 0x3f8a3a, 0, 4.6, 0, S)); g.add(sph(1.6, 0x4fa044, 1.2, 5.6, 0.6, S)); g.add(sph(1.5, 0x3a7f35, -1.1, 5.4, -0.5, S)); }
  return g;
}

/** How far each kind leans in the wind (radians at full breeze): the tall and the light the most. */
const SWAY = { palm: 0.05, poplar: 0.035, cypress: 0.03, plane: 0.02, chestnut: 0.018, pine: 0.022, round: 0.025, olive: 0.02, oleander: 0.04, lime: 0.012, topiary: 0, orange: 0 };
/** The foliage's tints: a copy's colour multiplies the whole tree, so they stay near white. */
const TINTS = [0xffffff, 0xf2fff0, 0xe6f2dc, 0xfff8e8, 0xdcebd2, 0xf0f0e0];
/** The wind's strength by climate: a grey sky brings the gusts. */
const windOf = () => (G.climate?.id === 'overcast' ? 2.2 : G.climate?.id === 'night' ? 0.6 : 1);

const treeSet = () => perBuild('trees', () => {
  const S = getPoly() === 'high' ? 8 : 5, set = { batches: {}, swaying: [], count: 0 };   // low-poly crowns: a park of copies stays within the triangle budget
  set.batch = kind => set.batches[kind] || (set.batches[kind] = batch(() => growTree(new THREE.Group(), kind, S), { tint: true }));
  let clock = 0, turn = 0;
  G.animated.push(dt => {
    if (!moving() || !set.swaying.length) return;
    clock += dt; turn = (turn + 1) % 3;
    const w = windOf();
    for (let j = turn; j < set.swaying.length; j += 3) { const s = set.swaying[j], t = clock * s.f + s.ph; s.b.move(s.i, { tiltX: Math.sin(t) * s.amp * w, tiltZ: Math.cos(t * 0.73) * s.amp * 0.6 * w }); }
  });
  return set;
});

/**
 * An instanced tree of `kind` (TREE_KINDS) at (x, z): turned at random,
 * scaled 0.85..1.25 times `scale`, tinted a little, swaying unless `sway` is
 * false. Coordinates as life.js place(): scale-1 decor coordinates by
 * default, world units with an absolute `y` if `world`.
 */
export function treeAt(scene, x, z, kind, { y = 0, world = false, scale = 1, rotY, sway = true } = {}) {
  const set = treeSet(), k = TREE_KINDS.includes(kind) ? kind : 'round', b = set.batch(k), p = place(x, z, { y, world });
  const i = b.add(p.x, p.z, { y: p.y, rotY: rotY ?? rand(0, 6.28), scale: scale * rand(0.85, 1.25), color: pick(TINTS) });
  if (sway && SWAY[k]) set.swaying.push({ b, i, amp: SWAY[k] * rand(0.7, 1.3), f: rand(0.7, 1.3), ph: rand(0, 6.28) });
  set.count++;
  return i;
}
