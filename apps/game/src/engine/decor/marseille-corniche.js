// Marseille's Corniche (stage 7): the back half of the lap climbs to the
// cliffs over the sea, banked and in the mistral (data.js). Along its sea
// side: the white balustrade the whole way, the Corniche's own lamps, a
// bench or two; below it the limestone rocks and umbrella pines going down
// to the sea; out on the water the Château d'If on its island and the
// Frioul islands, each one merged mesh.
//
// The sea side of a sample is the side away from the circuit's middle (the
// loop goes round Le Panier); the stretch is found from the elevation, the
// samples above 10 m on the west half, so it follows the profile in data.js.
import * as THREE from 'three';

import { box, cyl, sph } from '../primitives.js';
import { G, disposable, getPoly, isClear } from '../state.js';
import { pick, rand } from '../util.js';
import { terrainY, yAt } from './context.js';
import { batch, perBuild } from './life.js';
import { landmark } from './marseille-port.js';
import { bench, lampAt, treeAt } from './street.js';

/** The Corniche's samples: [first, last) indices of the high stretch on the west half, and the sea side's sign at each. */
export function cornicheSpan() {
  const N = G.N, cx = G.samples.reduce((t, s) => t + s.x, 0) / N, cz = G.samples.reduce((t, s) => t + s.z, 0) / N;
  let first = -1, last = -1;
  for (let i = 0; i < N; i++) { const s = G.samples[i]; if (s.y > 10 && s.x < cx) { if (first < 0) first = i; last = i + 1; } }
  const sea = i => { const s = G.samples[i]; return (s.x + s.sx - cx) ** 2 + (s.z + s.sz - cz) ** 2 > (s.x - s.sx - cx) ** 2 + (s.z - s.sz - cz) ** 2 ? 1 : -1; };
  return { first, last, sea };
}

const rail = () => perBuild('marseille:balustrade', () => {
  const hi = getPoly() === 'high', len = hi ? 2.1 : 6.3;
  return batch(() => {
    const g = new THREE.Group(); g.add(box(0.5, hi ? 0.25 : 0.95, len, 0xf2ede0, 0, hi ? 0.12 : 0.47, 0)); g.add(box(0.42, 0.14, len, 0xf6f1e4, 0, 1.0, 0));   // on "légers" a solid parapet
    if (hi) for (const z of [-0.7, 0, 0.7]) g.add(box(0.18, 0.75, 0.18, 0xeae4d4, 0, 0.55, z));
    return g;
  });
});
const rocks = () => perBuild('marseille:rocks', () => batch(() => { const g = new THREE.Group(); const r = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xd9d2c0, roughness: 0.95 })); r.scale.set(1.3, 0.7, 1); r.castShadow = getPoly() === 'high'; r.receiveShadow = true; g.add(r); return g; }, { tint: true }));

/** The Corniche along its samples: balustrade, lamps and benches on the sea side, rocks and pines down the slope. World units. */
export function* corniche(scene, world) {
  const { first, last, sea } = cornicheSpan(); if (first < 0) return;
  const hi = getPoly() === 'high', step = hi ? 1 : 3, at = (s, lat) => ({ x: s.x + s.sx * lat, z: s.z + s.sz * lat, y: s.y + lat * (s.bank || 0) });
  for (let i = first; i < last; i += step) {
    const s = G.samples[i], sg = sea(i), p = at(s, sg * (s.hw + 6.1));
    rail().add(p.x, p.z, { y: p.y, rotY: Math.atan2(s.tx, s.tz) });
    if ((i - first) % 24 === 12) { const l = at(s, sg * (s.hw + 5.4)); lampAt(world, l.x, l.z, 'corniche', { world: true, y: l.y, rotY: Math.atan2(sg * s.sz, -sg * s.sx) }); }   // the arm, local +x, over the road
    if ((i - first) % 60 === 30) { const b = at(s, sg * (s.hw + 4.6)); bench(world, b.x, b.z, Math.atan2(sg * s.sx, sg * s.sz), { world: true, y: b.y }); }   // facing the sea, not the road
  }
  yield;
  // down the slope to the sea: limestone boulders, umbrella pines, a few olives and oleanders
  for (let i = first; i < last; i += hi ? 4 : 8) {
    const s = G.samples[i], sg = sea(i);
    for (let k = hi ? 0 : 1; k < 2; k++) {
      const lat = sg * (s.hw + (k ? rand(12, 40) : rand(41, 50))), x = s.x + s.sx * lat + s.tx * rand(-4, 4), z = s.z + s.sz * lat + s.tz * rand(-4, 4);
      if (!isClear(x, z, 9)) continue;
      const y = yAt(x, z), r = Math.random();
      if (r < 0.55 || k === 0) rocks().add(x, z, { y: y + 0.2, rotY: rand(0, 6.28), tiltX: rand(-0.3, 0.3), scale: rand(1.2, 4.2), color: pick([0xffffff, 0xf2eee4, 0xe6e0d0, 0xd8d2c2]) });
      else treeAt(world, x, z, r < 0.85 ? 'pine' : r < 0.93 ? 'olive' : 'oleander', { world: true, y });
    }
  }
  yield;
}

/**
 * The sea west of the Corniche, from the harbour's mouth up past the islands,
 * in two sheets: past the cliffs' foot (where the terrain is back to sea
 * level, decor/context.js terrainY) and round the mouth west of the
 * harbour's own water, out to the sky dome (climate.js, 1,100 m round the
 * origin: nothing beyond it is ever seen). World units; its own copy of the
 * harbour's water.
 */
export function sea(world, waterMat) {
  const m = seaMaterial(waterMat, 12, 45), g = new THREE.Group(); g.name = 'marseille:sea';
  // the uvs scaled to each sheet's size: one texel size on both
  for (const [x0, x1, z0, z1] of [[-1120, -760, -560, 760], [-1120, -935, -820, -560]]) { const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / 360, uv.getY(i) * (z1 - z0) / 1320); const w = new THREE.Mesh(geo, m); w.rotation.x = -Math.PI / 2; w.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2); w.receiveShadow = true; g.add(w); }
  world.add(g);
  return g;
}
/** A copy of the harbour's water with its own tiling (`rx` x `ry` over a sheet), drifting like it. */
export function seaMaterial(waterMat, rx, ry) {
  const m = disposable(waterMat.clone()); m.map = disposable(waterMat.map.clone()); m.map.needsUpdate = true; m.map.repeat.set(rx, ry);
  G.animated.push(dt => { m.map.offset.x += dt * 0.012; m.map.offset.y += dt * 0.006; });
  return m;
}

/**
 * A sheet of water whose height follows the ground under it (decor/context.js
 * terrainY, a little above), so the relief the road's climb spreads round it
 * never pokes through: `rows` is a list of rows of [x, z] world points, all
 * rows as long; the uvs run 0..1 over the sheet as a plane's would.
 */
export function waterSheet(world, material, rows, name) {
  const pos = [], uv = [], idx = [], R = rows.length, C = rows[0].length;
  rows.forEach((row, j) => row.forEach(([x, z], i) => { pos.push(x, Math.max(0.03, terrainY(x, z) + 0.08), z); uv.push(i / (C - 1), 1 - j / (R - 1)); }));
  // wound to face up whichever way the rows run
  const [x0, , z0] = pos.slice(0, 3), up = (pos[C * 3] - x0) * (pos[5] - z0) - (pos[C * 3 + 2] - z0) * (pos[3] - x0) < 0;
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < C - 1; i++) { const a = j * C + i; if (up) idx.push(a, a + C, a + 1, a + 1, a + C, a + C + 1); else idx.push(a, a + 1, a + C, a + 1, a + C + 1, a + C); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.receiveShadow = true; m.name = name; world.add(m);
  return m;
}
/** The sea below the Corniche, from the shore past its rocks out to the open sea: a sheet along the west-facing samples of the high stretch. */
export function cornicheSea(world, material) {
  const { first, last, sea } = cornicheSpan(); if (first < 0) return null;
  const rows = [];
  for (let i = first; i < last; i += 6) { const s = G.samples[i], sg = sea(i); if (sg * s.sx > -0.5) continue; rows.push([45, 80, 130, 180, 230, 290].map(d => [s.x + s.sx * sg * (s.hw + d), s.z + s.sz * sg * (s.hw + d)])); }
  return rows.length > 1 ? waterSheet(world, material, rows, 'marseille:shore') : null;
}

/** The Château d'If on its rock: the square keep and its three round towers inside a wall. World units. */
export function chateauIf(world, x, z) {
  const g = new THREE.Group(), R = 0xcfc6a8, W = 0xe0d6bc, s = getPoly() === 'high' ? 14 : 9;
  const rock = cyl(58, 70, 7, R, 0, 2, 0, s); rock.scale.z = 0.7; g.add(rock); const rock2 = sph(30, R, 26, 3, 8, s); rock2.scale.set(1.2, 0.25, 0.8); g.add(rock2);
  g.add(box(70, 6, 46, W, -4, 8, 0)); g.add(box(24, 14, 24, W, -4, 18, 0)); g.add(box(25, 1.2, 25, 0xc9b48c, -4, 25.6, 0));
  for (const [px, pz] of [[-16, -12], [-16, 12], [8, 12]]) { g.add(cyl(5, 5.4, 20, W, px, 15, pz, s)); g.add(cyl(5.6, 5.6, 1.5, 0xc9b48c, px, 25.6, pz, s)); }
  g.add(cyl(0.15, 0.15, 6, 0xdddddd, -4, 29, 0, 5)); g.add(box(2.4, 1.5, 0.1, 0x2f55c7, -2.8, 31, 0));
  g.position.set(x, 0, z); world.add(landmark(g, 'marseille:if'));
}
/** The Frioul islands: two long low rocks further out. World units. */
export function frioul(world, x, z) {
  const g = new THREE.Group(), s = getPoly() === 'high' ? 14 : 9;
  for (const [px, pz, rx, rz, h] of [[0, 0, 110, 36, 16], [-30, 140, 80, 28, 12], [40, 70, 24, 10, 6]]) { const r = sph(1, 0xcfc6a8, px, 0, pz, s); r.scale.set(rx, h, rz); r.rotation.y = 0.5; g.add(r); }
  g.position.set(x, 0, z); world.add(landmark(g, 'marseille:frioul'));
}
