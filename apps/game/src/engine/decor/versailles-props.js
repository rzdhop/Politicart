// Versailles' own props (stage 7): the pieces only the gardens have -- the
// parterres de broderie, the terraces' walls and balustrades, the hedge maze,
// the Latona and Apollo fountains, the Colonnade, the gondolas and the little
// tourist train -- and the trees, statues, vases and benches the builder
// instances (decor/instanced.js).
//
// A piece that never moves is merged once built (merged(): baked to the shared
// finishes, then merged by material), so it costs one draw per finish on both
// tiers instead of one per part; a piece that is repeated is a prop maker for
// instanced(). Round parts take fewer segments on "légers" (rs()).
import * as THREE from 'three';

import { bakeVertexColours, finishOf, mergeByMaterial } from '../geo.js';
import { box, cone, cyl, plane, sph, tag } from '../primitives.js';
import { G, disposable, getPoly } from '../state.js';
import { TEX, surface } from '../textures.js';
import { pick, rand } from '../util.js';
import { STILL, yAt } from './context.js';
import { JACKETS, SKINS, figure } from './street.js';

export const GOLD = 0xd4af37, MARBLE = 0xece6da, STONE = 0xd9cfb8, BOXWOOD = 0x2f6b3a, GRAVEL = 0xcbb98a, LAWN = 0x4f8f3f;
/** Round parts' segments: `hi` on "détaillés", `lo` on "légers". */
export const rs = (hi, lo) => (getPoly() === 'high' ? hi : lo);

/**
 * A piece `build(group)` makes that never moves inside itself, baked to the shared finishes and merged by material in
 * place: one draw per finish, on both tiers. The still() marks its builders left are taken back (it is merged
 * already); `keep` is what must stay its own object (mergeByMaterial's), such as jets that pulse.
 */
export function merged(build, keep = []) {
  const g = new THREE.Group(), marks = STILL.length;
  build(g); STILL.length = marks;
  return mergeGroup(g, keep);
}
/** merged() for a group built already (over several of the pre-build's slices): baked and merged in place. */
export function mergeGroup(g, keep = []) { bakeVertexColours(g, finishOf); return mergeByMaterial(g, keep); }

/**
 * Where a still piece w x d (world metres) centred on world (x, z) can stand: the lowest ground under its corners
 * and middle (it sinks into a slope rather than float over it), and how far those heights spread. The terrain
 * follows the road out to 150 m and falls to the plain beyond (context.js terrainY), so the middle of a loop can
 * be a bank; a flat piece looks for flat ground.
 */
export function footing(x, z, w, d) {
  const ys = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => yAt(x + a * w / 2, z + b * d / 2));
  return { y: Math.min(...ys), spread: Math.max(...ys) - Math.min(...ys) };
}

// ---------- Materials, one per race ----------
/** The basins' water (its map scrolls nowhere: still water). */
export const waterMat = () => disposable(new THREE.MeshStandardMaterial({ map: TEX.water, normalMap: surface('water').normalMap, roughness: 0.15, metalness: 0.3 }));
/** The fountains' jets: pale, see-through. */
export const jetMat = () => disposable(new THREE.MeshStandardMaterial({ color: 0xcfe8f8, transparent: true, opacity: 0.7, roughness: 0.1 }));
/** Clipped hedges (the hedge surface); hedgeBox tiles it by the metre. */
export const hedgeMat = () => disposable(new THREE.MeshStandardMaterial({ map: surface('hedge').map, normalMap: surface('hedge').normalMap, roughness: 0.95 }));

/** A flat disc of material `m`, radius r, at height y. */
export function disc(r, m, y, s) { const w = new THREE.Mesh(new THREE.CircleGeometry(r, s), m); w.rotation.x = -Math.PI / 2; w.position.y = y; w.receiveShadow = true; return w; }
/** A box of hedge whose texture repeats every `tile` metres on every face, so a long wall is not one stretched tile. */
export function hedgeBox(w, h, d, m, tile = 2.5) {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // px nx py ny pz nz: the face's u and v extents
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return tag(new THREE.Mesh(geo, m));
}
/** A thin jet of `len` metres from (r, y) at angle a round the origin, leaning `tilt` radians in towards the middle. */
function inward(m, len, r, a, y, tilt) {
  const j = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, len, 5), m), h = len / 2;
  j.rotation.order = 'YXZ'; j.rotation.set(tilt, Math.atan2(-Math.cos(a), -Math.sin(a)), 0);
  j.position.set(Math.cos(a) * (r - h * Math.sin(tilt)), y + h * Math.cos(tilt), Math.sin(a) * (r - h * Math.sin(tilt)));
  return j;
}
/** A wall of `len` metres whose middle is at (x, y, z), turned to run along yaw `rot` (local z). */
const along = (m, x, y, z, rot) => { m.position.set(x, y, z); m.rotation.y = rot; return m; };

// ---------- Instanced props (prop makers: build at the origin) ----------
/**
 * The gardens' trees, lighter than street.js's: clipped cones and balls (cones on "légers"), cypresses, orange trees
 * in their caisses, round crowns.
 */
export function gardenTree(kind) {
  const g = new THREE.Group(), hi = getPoly() === 'high';
  if (kind === 'cypress') { g.add(cyl(0.2, 0.3, 1.5, 0x6b4a2b, 0, 0.75, 0, 6)); g.add(cone(1.1, 7, 0x2f5f32, 0, 4.5, 0, rs(12, 6))); }
  else if (kind === 'cone' || (kind === 'ball' && !hi)) { g.add(cyl(0.18, 0.22, 1.2, 0x6b4a2b, 0, 0.6, 0, 6)); g.add(cone(1.0, 2.6, BOXWOOD, 0, 2.5, 0, rs(12, 6))); }
  else if (kind === 'ball') { g.add(cyl(0.16, 0.2, 1.0, 0x6b4a2b, 0, 0.5, 0, 6)); g.add(sph(0.9, BOXWOOD, 0, 1.6, 0, 9)); g.add(sph(0.55, 0x3a7f45, 0, 2.75, 0, 7)); }
  else if (kind === 'orange') {
    g.add(box(1.6, 1.3, 1.6, 0x2f5f3a, 0, 0.65, 0)); g.add(box(1.75, 0.15, 1.75, 0xf6f1e4, 0, 1.32, 0)); if (hi) [-1, 1].forEach(s => [-1, 1].forEach(t => g.add(sph(0.12, 0xf6f1e4, s * 0.8, 1.45, t * 0.8, 5))));
    g.add(cyl(0.12, 0.14, 1.2, 0x6b4a2b, 0, 2.0, 0, 6)); g.add(sph(1.1, 0x3f8a3a, 0, 3.2, 0, rs(10, 7)));
    for (let i = 0; i < rs(6, 2); i++) { const a = i * 2.4; g.add(sph(0.13, 0xff8c1a, Math.cos(a) * 0.9, 3.2 + Math.sin(i * 1.7) * 0.5, Math.sin(a) * 0.9, 5)); }
  }
  else { const S = rs(11, 5); g.add(cyl(0.35, 0.5, 3, 0x6b4a2b, 0, 1.5, 0, rs(7, 5))); g.add(sph(2.4, 0x3f8a3a, 0, 4.6, 0, S)); g.add(sph(1.6, 0x4fa044, 1.2, 5.6, 0.6, S)); g.add(sph(1.5, 0x3a7f35, -1.1, 5.4, -0.5, S)); }
  return g;
}
/** A marble statue on its pedestal, one arm raised (a figure of its own, lighter than the crowd's). */
export function statueProp() {
  const g = new THREE.Group(), S = rs(8, 5); g.add(box(1.6, 2.2, 1.6, 0xcfc6b5, 0, 1.1, 0)); g.add(box(1.9, 0.3, 1.9, STONE, 0, 2.35, 0));
  g.add(box(0.55, 0.6, 0.45, MARBLE, 0, 2.85, 0)); g.add(cyl(0.37, 0.42, 1.25, MARBLE, 0, 3.7, 0, S)); g.add(sph(0.32, MARBLE, 0, 4.6, 0, S));
  const arm = box(0.18, 0.9, 0.18, MARBLE, 0.42, 4.55, 0); arm.rotation.z = -0.6; g.add(arm);
  return g;
}
/** A Medici vase on a pedestal, flowering in `bloom`. */
export function vaseProp(bloom = 0xe36f8a) {
  const g = new THREE.Group(), S = rs(10, 6); g.add(box(1.0, 1.4, 1.0, STONE, 0, 0.7, 0));
  g.add(cyl(0.62, 0.24, 1.1, MARBLE, 0, 1.95, 0, S)); if (getPoly() === 'high') { g.add(cyl(0.68, 0.62, 0.12, MARBLE, 0, 2.56, 0, S)); g.add(sph(0.5, bloom, 0, 2.7, 0, 8)); } else g.add(cone(0.55, 0.7, bloom, 0, 2.75, 0, 5));
  return g;
}
/** A park bench, green slats on stone feet, facing local +z. */
export function benchProp() {
  const g = new THREE.Group(); [-0.8, 0.8].forEach(x => g.add(box(0.3, 0.45, 0.6, STONE, x, 0.22, 0)));
  g.add(box(2.2, 0.08, 0.6, 0x2f5f32, 0, 0.5, 0)); g.add(box(2.2, 0.45, 0.06, 0x2f5f32, 0, 0.82, -0.3));
  return g;
}
/** A gardener behind a wheelbarrow of clippings. */
export function gardenerProp() {
  const g = new THREE.Group(); const f = figure(0x3f6b3a, pick(SKINS), null); f.position.z = -1.2; g.add(f);
  g.add(box(0.9, 0.4, 1.1, 0x6a6f7a, 0, 0.55, 0)); g.add(box(0.8, 0.25, 0.9, 0x4fa044, 0, 0.8, 0)); const w = cyl(0.25, 0.25, 0.12, 0x222222, 0, 0.25, 0.7, 8); w.rotation.z = Math.PI / 2; g.add(w);
  [-0.35, 0.35].forEach(x => { const h = box(0.06, 0.06, 1.0, 0x6b4a2b, x, 0.7, -0.75); h.rotation.x = 0.25; g.add(h); });
  return g;
}
/** A palace guard at attention (the guard's skin is drawn once per prop). */
export function guardProp() { const g = new THREE.Group(); g.add(figure(0x1f2a5e, pick(SKINS), 'guard')); return g; }
/** A length `len` of terrace balustrade, along local z: plinth, balusters (a solid dado on "légers"), handrail. */
export function balustrade(len) {
  const g = new THREE.Group(); g.add(box(0.7, 0.3, len, STONE, 0, 0.15, 0)); g.add(box(0.62, 0.16, len, STONE, 0, 1.08, 0));
  if (getPoly() === 'high') for (let k = 0; k < 5; k++) g.add(cyl(0.11, 0.15, 0.7, MARBLE, 0, 0.65, -len / 2 + (k + 0.5) * len / 5, 6));
  else g.add(box(0.36, 0.7, len, MARBLE, 0, 0.65, 0));
  return g;
}
/** A stone pier topped with a gilded ball: the gates of the maze and the ends of the balustrades. */
export function gatePost() {
  const g = new THREE.Group(), S = rs(12, 6); g.add(box(1.3, 3.6, 1.3, STONE, 0, 1.8, 0)); g.add(box(1.6, 0.3, 1.6, MARBLE, 0, 3.75, 0));
  g.add(sph(0.55, GOLD, 0, 4.45, 0, S)); g.add(cone(0.16, 0.6, GOLD, 0, 5.2, 0, 5));
  return g;
}
/** A jet d'eau in its small round basin, beside the allées (the stone ring, the water, the jet). */
export function jetBasin(water, jets) {
  const g = new THREE.Group(), S = rs(20, 10);
  g.add(cyl(4, 4.2, 0.7, STONE, 0, 0.35, 0, S)); g.add(disc(3.5, water, 0.72, S));
  const j = new THREE.Mesh(new THREE.ConeGeometry(0.28, 7, 6), jets); j.position.y = 4.2; g.add(j);
  const s = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.6, 8), jets); s.position.y = 1.4; s.rotation.x = Math.PI; g.add(s);   // the spray falling back
  return g;
}
/** A rowing boat moored at the head of the canal. */
export function rowboat() {
  const g = new THREE.Group(); g.add(box(4.2, 0.6, 1.5, pick([0xf6f1e4, 0x2f5f32, 0x1f3a93]), 0, 0.3, 0)); g.add(box(3.8, 0.1, 1.2, 0x8b5a2b, 0, 0.62, 0));
  const bow = cone(0.75, 1.2, 0xf6f1e4, 2.6, 0.3, 0, 4); bow.rotation.z = -Math.PI / 2; g.add(bow); g.add(box(0.3, 0.08, 1.2, 0x8b5a2b, -0.6, 0.7, 0));
  return g;
}
/** A puddle on the gravel, for the overcast climate. */
export function puddle(water) { const g = new THREE.Group(); const p = disc(1, water, 0.38, 10); p.scale.set(1.8, 1, 1.1); g.add(p); return g; }

// ---------- Merged pieces ----------
/** Eight flower palettes for the parterres: two bed colours and the centre's. */
export const PALETTES = [
  [0xe36f8a, 0xf6f1e4, 0xc8102e], [0xf2c14e, 0xe0a030, 0xf6f1e4], [0x8a5fc8, 0xf0f0f0, 0xd95f5f], [0xd95f5f, 0xf2c14e, 0x9fd0e8],
  [0xf0f0f0, 0xe36f8a, 0x8a5fc8], [0x2a7fd4, 0xf6f1e4, 0xf2c14e], [0xff8c1a, 0xc8102e, 0xf2c14e], [0xb04a8a, 0xf2b8c8, 0xf6f1e4],
];
/**
 * A parterre de broderie, w x d (scale-1, so it stretches with the circuit): a gravel surround, the lawn, a box-hedge
 * border, scrolls of box (the two diagonals and a diamond), four corner beds and a round centre bed in `palette`,
 * clipped cones at the corners. Merged.
 */
export function broderie(w, d, palette) {
  return merged(g => {
    const [a, b, c] = palette, lw = w - 1.5, ld = d - 1.5;
    const flat = (pw, pd, color, y, x = 0, z = 0) => { const p = plane(pw, pd, color, x, z); p.position.y = y; g.add(p); };
    const hedge = (bw, bd, x, z, r = 0) => { const m = box(bw, 0.45, bd, BOXWOOD, x, 0.25, z); m.rotation.y = r; g.add(m); };
    flat(w, d, GRAVEL, 0.02); flat(lw, ld, LAWN, 0.04);
    hedge(lw, 0.35, 0, -ld / 2); hedge(lw, 0.35, 0, ld / 2); hedge(0.35, ld, -lw / 2, 0); hedge(0.35, ld, lw / 2, 0);
    const diag = Math.hypot(lw, ld) * 0.36, ang = Math.atan2(ld, lw); hedge(diag, 0.3, 0, 0, ang); hedge(diag, 0.3, 0, 0, -ang);
    const side = Math.hypot(lw / 4, ld / 4), da = Math.atan2(ld / 4, lw / 4);
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => hedge(side, 0.3, sx * lw / 8, sz * ld / 8, sx * sz > 0 ? da : -da));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => { flat(lw * 0.2, ld * 0.2, i % 3 ? a : b, 0.06, sx * lw * 0.32, sz * ld * 0.32); g.add(cone(0.45, 1.6, BOXWOOD, sx * (lw / 2 - 0.4), 0.8, sz * (ld / 2 - 0.4), 6)); });
    g.add(cyl(Math.min(lw, ld) * 0.13, Math.min(lw, ld) * 0.13, 0.12, c, 0, 0.08, 0, rs(16, 8)));
    g.add(cyl(Math.min(lw, ld) * 0.07, Math.min(lw, ld) * 0.07, 0.14, a, 0, 0.1, 0, rs(12, 6)));
  });
}
/**
 * The Latona fountain, in world units at the origin: the round basin, four marble tiers rising to Latona and her
 * children in gold, gilded frogs round the rim and the first tier, and their jets arcing in (one mesh, which pulses).
 */
export function latone(water, jets) {
  let spray = null;
  const g = merged(p => {
    const S = rs(40, 20);
    p.add(cyl(27, 27.6, 1.2, STONE, 0, 0.6, 0, S)); p.add(disc(26, water, 0.95, S));
    [[15, 1.2], [11.5, 2.4], [8, 3.6], [4.6, 4.8]].forEach(([r, y]) => p.add(cyl(r, r + 0.6, 1.2, MARBLE, 0, y + 0.1, 0, S)));
    p.add(box(2.6, 2.2, 2.6, MARBLE, 0, 6.5, 0));
    const latona = figure(GOLD, GOLD, null); latona.scale.setScalar(1.8); latona.position.y = 7.6; p.add(latona);
    [-1, 1].forEach(s => { const c = figure(GOLD, GOLD, null); c.scale.setScalar(0.9); c.position.set(s * 1.1, 7.6, 0.7); p.add(c); });
    spray = new THREE.Group(); spray.name = 'jets'; p.add(spray);
    const frog = (r, a, y) => { const f = sph(0.55, GOLD, Math.cos(a) * r, y, Math.sin(a) * r, 8); f.scale.set(1, 0.6, 1.3); f.rotation.y = -a; p.add(f); };
    for (let i = 0; i < rs(24, 12); i++) { const a = i / rs(24, 12) * Math.PI * 2; frog(24.5, a, 1.3); spray.add(inward(jets, 9, 24.5, a, 1.3, 0.9)); }
    for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * Math.PI * 2; frog(14.2, a, 2.2); }
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.5, 9, 8), jets); top.position.y = 12.5; spray.add(top);
  }, o => o.name === 'jets');
  g.name = 'versailles:latone';
  return { g, spray: g.getObjectByName('jets') ?? spray };
}
/**
 * The Apollo basin, world units at the origin: the great stone ring, the water, Apollo's chariot rising out of it
 * drawn by four gilded horses, tritons blowing their conches round it, and the jets (one mesh, which pulses).
 */
export function apollon(water, jets) {
  const g = merged(p => {
    const S = rs(44, 22);
    p.add(cyl(42, 42.8, 1.2, STONE, 0, 0.6, 0, S)); p.add(disc(41, water, 0.95, S));
    const chariot = new THREE.Group(); p.add(chariot); chariot.position.set(0, 0.6, -2);
    chariot.add(box(4, 1.6, 3, GOLD, 0, 1.6, -3)); const wheel = cyl(1.3, 1.3, 0.3, GOLD, 2.1, 1.4, -3, 14); wheel.rotation.z = Math.PI / 2; chariot.add(wheel); const w2 = wheel.clone(); w2.position.x = -2.1; chariot.add(w2);
    const apollo = figure(GOLD, GOLD, null); apollo.scale.setScalar(2); apollo.position.set(0, 2.2, -3.4); chariot.add(apollo);
    for (let i = 0; i < 4; i++) {
      const hx = (i - 1.5) * 2.4, horse = new THREE.Group(); horse.position.set(hx, 1, 3 + Math.abs(i - 1.5) * 0.8); horse.rotation.x = -0.45; horse.rotation.y = (i - 1.5) * 0.18; chariot.add(horse);
      horse.add(box(1.0, 1.1, 2.8, GOLD, 0, 1.2, 0)); const neck = box(0.6, 1.4, 0.7, GOLD, 0, 2.2, 1.2); neck.rotation.x = 0.5; horse.add(neck); horse.add(box(0.55, 0.6, 1.1, GOLD, 0, 2.9, 1.8));
      [[-0.35, 1], [0.35, 1]].forEach(([lx, lz]) => { const leg = box(0.22, 1.2, 0.22, GOLD, lx, 1.0, lz + 0.6); leg.rotation.x = -1.0; horse.add(leg); });
    }
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2, t = figure(GOLD, GOLD, null); t.scale.setScalar(1.3); t.position.set(Math.cos(a) * 13, 0.4, Math.sin(a) * 13); t.rotation.y = -a - Math.PI / 2; p.add(t); p.add(cone(0.3, 1.2, GOLD, Math.cos(a) * 13, 3.6, Math.sin(a) * 13, 6)); }
    const spray = new THREE.Group(); spray.name = 'jets'; p.add(spray);
    [[0, 0, 14], [-6, -8, 9], [6, -8, 9], [-9, 4, 8], [9, 4, 8]].forEach(([x, z, h]) => { const j = new THREE.Mesh(new THREE.ConeGeometry(0.35, h, 6), jets); j.position.set(x, h / 2 + 0.9, z); spray.add(j); });
    for (let i = 0; i < 4; i++) spray.add(inward(jets, 7, 13, Math.PI / 4 + i * Math.PI / 2, 3.6, 0.8));
  }, o => o.name === 'jets');
  g.name = 'versailles:apollon';
  return { g, spray: g.getObjectByName('jets') };
}
/**
 * The Colonnade bosquet, world units at the origin: a ring of paired pink-marble columns under an entablature of
 * white marble, gilded urns over each pair, the circular basin within and the Rape of Proserpina on its pedestal.
 */
export function colonnade(water, hedges) {
  const g = merged(p => {
    const R = 17, n = rs(24, 16), S = rs(10, 6);
    p.add(cyl(R + 3, R + 3, 0.3, MARBLE, 0, 0.15, 0, rs(32, 16)));
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R;
      p.add(box(1.4, 0.6, 1.4, MARBLE, x, 0.6, z)); p.add(cyl(0.38, 0.42, 6, 0xd9a0a0, x, 3.9, z, S)); p.add(box(1.2, 0.5, 1.2, MARBLE, x, 7.1, z));
      const b = (i + 0.5) / n * Math.PI * 2, span = 2 * R * Math.sin(Math.PI / n) + 1.2, e = box(1.4, 1.0, span, MARBLE, Math.cos(b) * R, 7.85, Math.sin(b) * R); e.rotation.y = -b; p.add(e);
      p.add(sph(0.45, GOLD, x, 8.8, z, S));
    }
    p.add(cyl(7, 7.4, 0.8, MARBLE, 0, 0.4, 0, rs(28, 14))); p.add(disc(6.5, water, 0.82, rs(28, 14)));
    p.add(box(2.4, 3, 2.4, MARBLE, 0, 1.5, 0)); const a = figure(MARBLE, MARBLE, null); a.scale.setScalar(1.4); a.position.set(0.3, 3, 0); p.add(a); const b2 = figure(MARBLE, MARBLE, null); b2.scale.setScalar(1.1); b2.position.set(-0.5, 4.6, 0.2); b2.rotation.z = 1.1; p.add(b2);
    // the bosquet's hedge round it, open on four sides
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const w = hedgeBox(23, 4, 1.6, hedges); const ang = i * Math.PI / 2; const cx = Math.cos(ang) * (R + 12) - Math.sin(ang) * s * 17.5, cz = Math.sin(ang) * (R + 12) + Math.cos(ang) * s * 17.5; along(w, cx, 1.6, cz, -ang + Math.PI / 2); p.add(w); }
  });
  g.name = 'versailles:colonnade';
  return g;
}
/** A hedge-walled bosquet, world units at the origin, w x d, open in the middle of each side, a small fountain within. */
export function bosquet(w, d, water, hedges) {
  return merged(p => {
    for (const s of [-1, 1]) {
      [-1, 1].forEach(k => { const a = hedgeBox(w / 2 - 6, 4, 1.6, hedges); along(a, k * (w / 4 + 3), 1.6, s * d / 2, 0); p.add(a); const b = hedgeBox(d / 2 - 6, 4, 1.6, hedges); along(b, s * w / 2, 1.6, k * (d / 4 + 3), Math.PI / 2); p.add(b); });
    }
    p.add(cyl(5, 5.3, 0.8, STONE, 0, 0.4, 0, rs(24, 12))); p.add(disc(4.4, water, 0.82, rs(24, 12))); p.add(cyl(0.5, 0.7, 2.4, STONE, 0, 1.6, 0, 8)); p.add(sph(0.6, GOLD, 0, 3.1, 0, 8));
  });
}
/** A gondola: the black hull with its iron prow, the gondolier at the stern. Merged; the caller moves it. */
export function gondola() {
  return merged(p => {
    p.add(box(1.4, 0.55, 8, 0x111111, 0, 0.3, 0)); [-1, 1].forEach(s => { const t = cone(0.7, 2.2, 0x111111, 0, 0.55, s * 5, 4); t.rotation.x = s * Math.PI / 2; t.rotation.y = Math.PI / 4; p.add(t); });
    p.add(box(0.12, 1.1, 0.4, 0xc9c9c9, 0, 1.2, 5.9)); p.add(box(1.0, 0.5, 1.4, 0xc8102e, 0, 0.75, 0.6));
    const man = figure(0xf6f1e4, pick(SKINS), null); man.position.set(0, 0.55, -3.2); p.add(man); const oar = cyl(0.05, 0.05, 4, 0x8b5a2b, 0.6, 1.6, -3.6, 5); oar.rotation.x = 0.6; p.add(oar);
  });
}
/** A wagon of the petit train (or its locomotive): open benches under a canopy, passengers aboard. Merged; the caller moves it. */
export function trainCar(loco) {
  return merged(p => {
    p.add(box(2.4, 1.0, 4.6, loco ? 0x1f3a93 : 0xf6f1e4, 0, 0.95, 0)); p.add(box(2.6, 0.12, 4.8, 0x1f3a93, 0, 3.2, 0));
    [[-1.1, -2.1], [1.1, -2.1], [-1.1, 2.1], [1.1, 2.1]].forEach(([x, z]) => { p.add(cyl(0.05, 0.05, 1.8, 0xd4af37, x, 2.3, z, 5)); p.add(cyl(0.35, 0.35, 0.25, 0x222222, x, 0.35, z * 0.8, 8).rotateZ(Math.PI / 2)); });
    if (loco) { p.add(box(2.2, 1.6, 1.8, 0x1f3a93, 0, 2.0, 1.2)); p.add(cyl(0.25, 0.3, 1.0, 0x222222, 0, 3.6, 1.6, 8)); p.add(box(2.0, 0.8, 0.1, 0x223344, 0, 2.3, 2.15)); p.add(sph(0.2, 0xfff1b0, 0.7, 1.2, 2.35, 6)); p.add(sph(0.2, 0xfff1b0, -0.7, 1.2, 2.35, 6)); }
    else for (const z of [-1.4, 0, 1.4]) for (const x of [-0.6, 0.6]) { const f = figure(pick(JACKETS), pick(SKINS), null); f.scale.setScalar(0.7); f.position.set(x, 1.1, z); f.rotation.y = Math.PI; p.add(f); }
  });
}
/**
 * A courtier, a tourist or a visitor under an umbrella (in the rain), into the crowd: a bobbing figure whose `base` is
 * the ground's height under it (scale-1 pieces stand at 0 until the spread sets them on the ground; `world` ones at base).
 */
export function visitor(scene, x, z, rotY, { wet = false, base = 0, world = false } = {}) {
  const r = Math.random(), f = figure(r < 0.25 ? pick([0x8a2b2b, 0x4b3f8a, 0xe0b040, 0x2e7d5b]) : pick(JACKETS), pick(SKINS), r > 0.85 && !wet ? 'press' : null);
  if (r < 0.25) { f.add(sph(0.34, 0xf3f0ea, 0, 1.9, -0.06, 8)); f.add(cyl(0.5, 0.6, 0.6, f.children[0].material.color.getHex(), 0, 0.35, 0, 8)); }   // a powdered wig and a skirted coat: a courtier
  if (wet) { f.add(cyl(0.025, 0.025, 1.2, 0x333333, 0.25, 2.0, 0, 4)); f.add(cone(0.85, 0.35, pick([0x111111, 0x1f3a93, 0xc8102e, 0x2f5f32]), 0.25, 2.65, 0, rs(10, 6))); }
  f.position.set(x, world ? base : 0, z); f.rotation.y = rotY ?? rand(0, 6.28); scene.add(f); G.crowd.push({ g: f, ph: rand(0, 6.28), amp: 0.06, base });
  return f;
}
