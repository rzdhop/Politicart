// The decor props shared by the circuits: crowd figures, trees, lamps, cars,
// buildings and palaces, Paris and Marseille landmarks, cafés, kiosks and the
// rest of the street life. Each builder adds what it builds to the scene it is
// given (the scale-1 decor group, or the world for pieces placed from
// G.samples) and registers what moves in G.crowd / G.animated, as before the
// split out of track.js (stage 0). Builders wrap what never moves in still()
// so the "légers" fold can merge it (DEC-047).
//
// Stage 7 adds the instanced street life (DEC-056), re-exported here so every
// circuit finds it in one place: crowd() figures (decor/crowd.js), flock()
// and circling() birds (decor/flock.js), treeAt() swaying trees
// (decor/trees.js), and below lampAt(), bench(), litterBin() and bollard()
// furniture. They add nothing to the scene when called: their batches are
// flushed after the decor (track.js), one draw per part and 200 m cell.
import * as THREE from 'three';

import { bakeVertexColours, finishOf, mergeByMaterial, mergeInWorld } from '../geo.js';
import { box, cone, cyl, imgPlane, mat, plane, sph, tag, textPlane, torus } from '../primitives.js';
import { G, disposable, getPoly, seg } from '../state.js';
import { TEX, surface } from '../textures.js';
import { hex, pick, rand } from '../util.js';
import { DS, still } from './context.js';
import { crowd, crowdKind } from './crowd.js';
import { batch, perBuild, place } from './life.js';
import { growTree } from './trees.js';

export { CROWD_JACKETS, CROWD_KINDS, CROWD_SKINS, crowd, crowdKind } from './crowd.js';
export { circling, flock } from './flock.js';
export { TREE_KINDS, growTree, treeAt } from './trees.js';

/** A landmark that never moves, baked to vertex colours and merged by material: one or two draws on either detail level; named for the tests. */
const merged = (g, name) => { bakeVertexColours(g, finishOf); mergeByMaterial(g); g.name = name; return g; };

// ---------- Small figures (crowd, guards, press) ----------
export const JACKETS = [0x3b4a6b, 0x8a2b2b, 0x2e7d5b, 0xe0b040, 0x5a5a5a, 0xd96c3a, 0x4b3f8a, 0xf0f0f0, 0x222222, 0x9ad04f];
export const SKINS = [0xf1c27d, 0xe8b48a, 0xc68642, 0x8d5524, 0xf5d6c6, 0xd9a577];
export function figure(color, skin, hat) {
  const g = new THREE.Group(); const S = Math.max(6, seg() / 2);
  g.add(cyl(0.32, 0.36, 1.1, color, 0, 0.95, 0, S)); g.add(sph(0.28, skin, 0, 1.78, 0, S));
  g.add(box(0.5, 0.5, 0.4, 0x2b2b35, 0, 0.3, 0));
  if (hat === 'guard') { g.add(cyl(0.3, 0.3, 0.3, 0xd4af37, 0, 2.08, 0, S)); const pl = cyl(0.08, 0.14, 0.7, 0xc8102e, 0, 2.5, 0, 6); g.add(pl); g.add(box(0.74, 0.12, 0.5, 0xffffff, 0, 1.0, 0)); g.add(cyl(0.03, 0.03, 1.4, 0xdddddd, 0.45, 1.4, 0.2, 5)); }
  if (hat === 'press') { g.add(box(0.36, 0.26, 0.3, 0x111111, 0, 1.3, 0.45)); g.add(cyl(0.1, 0.12, 0.3, 0x222222, 0, 1.3, 0.72, 8)); g.add(sph(0.08, 0xffffff, 0, 1.52, 0.5, 6)); }
  if (hat === 'sign') { const s = textPlane(0.9, 0.5, pick(['VOTEZ', 'NON !', 'OUI !', 'RÉFORME', 'PLUS VITE', 'DÉMISSION', 'BRAVO']), pick(['#f6f1e4', '#f2c14e', '#c8102e']), '#111', 90); s.position.set(0.5, 2.2, 0); g.add(s); g.add(cyl(0.03, 0.03, 1.2, 0x8b5a2b, 0.5, 1.5, 0, 5)); }
  if (hat === 'flag') { g.add(cyl(0.03, 0.03, 2, 0xdddddd, 0.5, 1.8, 0, 5)); [0x2f55c7, 0xffffff, 0xe63946].forEach((c, i) => g.add(box(0.3, 0.5, 0.03, c, 0.65 + i * 0.3, 2.5, 0))); }
  return still(g);   // a crowd figure bobs as a whole: still inside
}
/** The road's surface height at signed lateral offset `lat` of sample s, camber included (track.js roadY): where the pavement's furniture stands. */
const sideY = (s, lat) => s.y + lat * (s.bank || 0);
/**
 * A crowd behind a rail along samples [from, to) on side `sideSign`: the rail
 * one merged mesh, the spectators instanced figures (decor/crowd.js), a
 * third of them jumping. `dense` packs them closer; "détaillés" draws about
 * twice the legacy crowd, "légers" about the legacy count.
 */
export function crowdZone(scene, from, to, sideSign, dense) {
  const hw = G.hw, N = G.N, hi = getPoly() === 'high', rails = [];
  // the rail: two bars and a post every other step
  for (let i = from; i < to; i += 2) {
    const s = G.samples[i % N], n = G.samples[(i + 2) % N], l = sideSign * ((s.hw ?? hw) + 1.9), ln = sideSign * ((n.hw ?? hw) + 1.9);
    const ax = s.x + s.sx * l, az = s.z + s.sz * l, dx = n.x + n.sx * ln - ax, dz = n.z + n.sz * ln - az, len = Math.hypot(dx, dz), y = sideY(s, l);
    for (const h of hi ? [1.0, 0.45] : [1.0]) { const r = box(0.06, 0.06, len, 0x9a9a9a, 0, 0, 0); r.position.set(ax + dx / 2, y + h, az + dz / 2); r.rotation.y = Math.atan2(dx, dz); rails.push(r); }
    if (hi || (i - from) % 6 === 0) rails.push(cyl(0.05, 0.05, 1.1, 0x9a9a9a, ax, y + 0.55, az, 5));
  }
  // one mesh on "détaillés"; on "légers" the fold merges the bars with their cell's other still pieces
  if (hi && rails.length) { rails.forEach(r => r.updateMatrixWorld()); const m = mergeInWorld(rails); m.name = 'crowdRail'; scene.add(still(m)); } else for (const r of rails) scene.add(still(r));
  const step = hi ? (dense ? 2 : 3) : (dense ? 3 : 5), rows = hi ? (dense ? 4 : 3) : (dense ? 3 : 2);
  for (let i = from; i < to; i += step) {
    const s = G.samples[i % N];
    for (let j = 0; j < rows; j++) {
      const lat = sideSign * ((s.hw ?? hw) + 2.8 + j * 1.1 + rand(-0.3, 0.3)), u = rand(-0.8, 0.8), r = Math.random();
      crowd(scene, s.x + s.sx * lat + s.tx * u, s.z + s.sz * lat + s.tz * u, { world: true, y: sideY(s, lat), rotY: Math.atan2(-s.sx * sideSign, -s.sz * sideSign) + rand(-0.4, 0.4), kind: r < 0.16 ? 'sign' : r < 0.27 ? 'flag' : r < 0.34 ? 'scarf' : crowdKind(), amp: Math.random() < 0.5 ? 0.25 : 0 });
    }
  }
}
export function grandstand(scene, idx, sideSign) {
  const s = G.samples[idx]; const hw = G.hw; const g = new THREE.Group(), hi = getPoly() === 'high';
  const gx = s.x + s.sx * sideSign * (hw + 3), gz = s.z + s.sz * sideSign * (hw + 3), rot = Math.atan2(s.sx * sideSign, s.sz * sideSign), c = Math.cos(rot), sn = Math.sin(rot);
  // the spectators, instanced, in the stand's frame turned into the world's
  for (let t = 0; t < 4; t++) { g.add(box(26, 1.2, 2.4, 0x6a6f7a, 0, 0.6 + t * 1.3, 2 + t * 2.4)); for (let x = -11; x <= 11; x += hi ? 1.6 : 2.2) { const lx = x + rand(-0.3, 0.3), lz = 2.2 + t * 2.4; crowd(scene, gx + lx * c + lz * sn, gz - lx * sn + lz * c, { world: true, y: s.y + 1.2 + t * 1.3, rotY: rot + Math.PI, scale: 0.85, kind: Math.random() < 0.2 ? 'flag' : crowdKind(), amp: 0.2 }); } }
  g.add(box(28, 0.4, 11, 0x1f3a93, 0, 7.5, 6)); [-13, 13].forEach(x => { g.add(cyl(0.2, 0.2, 7.5, 0x555555, x, 3.75, 1)); g.add(cyl(0.2, 0.2, 7.5, 0x555555, x, 3.75, 11)); });
  const ban = textPlane(26, 2.2, 'TRIBUNE OFFICIELLE', '#1f3a93', '#f6f1e4', 64); ban.position.set(0, 6.3, 0.9); g.add(ban);
  g.position.set(gx, s.y, gz); g.rotation.y = rot; g.name = 'grandstand'; scene.add(still(g));
}
export function adBoard(scene, idx, sideSign, text, bg, fg, img) {
  const s = G.samples[idx]; const hw = G.hw; const g = new THREE.Group();
  g.add(cyl(0.12, 0.12, 3, 0x444444, -2.6, 1.5, 0, 6)); g.add(cyl(0.12, 0.12, 3, 0x444444, 2.6, 1.5, 0, 6));
  const p = img ? imgPlane(6, 2, img) : textPlane(6, 2, text, bg, fg, 56); p.position.set(0, 3.8, 0); g.add(p); g.add(box(6.2, 2.2, 0.1, 0x222222, 0, 3.8, -0.08));
  g.position.set(s.x + s.sx * sideSign * (hw + 4.5), s.y, s.z + s.sz * sideSign * (hw + 4.5)); g.rotation.y = Math.atan2(-s.sx * sideSign, -s.sz * sideSign); scene.add(still(g));
}
export const ADS = [['VOTEZ UTILE', '#1f3a93', '#f6f1e4'], ['SONDAGE : 52 % D’INDÉCIS', '#f6f1e4', '#111'], ['RÉFORME EN COURS', '#c8102e', '#fff'], ['ENGAGEMENT N°12 : ROULER', '#f2c14e', '#111'], ['DÉBAT CE SOIR 21H', '#111', '#f2c14e'], ['LA RÉPUBLIQUE ROULE', '#2f55c7', '#fff'], ['GRAND PRIX DE L’HÉMICYCLE', '#f6f1e4', '#c8102e'], ['AMENDEMENT 49.3', '#5c1a33', '#f6f1e4']];
// ---------- Decor builders ----------
export function tree(scene, x, z, kind, y = 0) {
  const g = growTree(new THREE.Group(), kind, seg());   // every kind of TREE_KINDS (decor/trees.js)
  g.position.set(x, y, z); g.scale.setScalar(rand(0.85, 1.25)); scene.add(still(g));
}
/** The lamps' and the sedans' lights: unlit, one material each for every lamp and car (they never change). */
let LAMP_MAT = null, HEADLIGHT_MAT = null;
export const lampMat = () => LAMP_MAT || (LAMP_MAT = new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
const headlightMat = () => HEADLIGHT_MAT || (HEADLIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0xfff1b0 }));
// Every head goes into G.lamps with its height over the lamp's foot, for the climate to light at night (climate.js).
export function lamp(scene, x, z, style, y = 0) { if (style === 'paris') { scene.add(still(cyl(0.14, 0.22, 6, 0x2f3a3a, x, y + 3, z, 8))); scene.add(still(box(0.7, 0.9, 0.7, 0x2f3a3a, x, y + 6.4, z))); const l = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.55), lampMat()); l.position.set(x, y + 6.4, z); scene.add(still(l)); G.lamps.push({ head: l, rise: 6.4 }); } else { scene.add(still(cyl(0.12, 0.18, 6, 0x2f3a44, x, y + 3, z, 6))); const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampMat()); l.position.set(x, y + 6.2, z); scene.add(still(l)); G.lamps.push({ head: l, rise: 6.2 }); } }
// ---------- Instanced street furniture (stage 7) ----------
/** The lamp styles: the post's height to the head (`rise`) and its parts, the head always in lampMat(). */
const LAMPS = {
  paris: { rise: 6.4, build: g => { if (getPoly() === 'high') g.add(cyl(0.3, 0.36, 0.5, 0x2f3a3a, 0, 0.25, 0, 8)); g.add(cyl(0.12, 0.2, 6, 0x2f3a3a, 0, 3.2, 0, getPoly() === 'high' ? 8 : 6)); g.add(box(0.5, 0.12, 0.5, 0x2f3a3a, 0, 5.98, 0)); g.add(cone(0.5, 0.55, 0x2f3a3a, 0, 6.95, 0, 4).rotateY(Math.PI / 4)); const h = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.66, 0.46), lampMat()); h.position.y = 6.4; g.add(h); } },
  plain: { rise: 6.2, build: g => { g.add(cyl(0.12, 0.18, 6, 0x2f3a44, 0, 3, 0, 6)); const h = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampMat()); h.position.y = 6.2; g.add(h); } },
  corniche: { rise: 5.6, build: g => { g.add(cyl(0.1, 0.16, 5.8, 0xf6f1e4, 0, 2.9, 0, 6)); g.add(box(1.2, 0.08, 0.1, 0xf6f1e4, 0.5, 5.75, 0)); const h = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), lampMat()); h.position.set(1.0, 5.6, 0); g.add(h); } },
};
// on "légers" the head is baked with the post into one part: a pale lit head, one draw per cell (the night glow is climate.js's quads either way)
const lampBatch = style => perBuild('lamp:' + style, () => batch(() => { const g = new THREE.Group(); LAMPS[style].build(g); if (getPoly() !== 'high') g.traverse(o => { if (o.isMesh && o.material === lampMat()) o.material = mat(0xfff2b0); }); return g; }));
/**
 * An instanced street lamp (`style` 'paris', 'plain' or 'corniche') at (x, z),
 * turned `rotY`; its head registered in G.lamps for the climate to light at
 * night (climate.js reads the head's world position from its matrix, so a
 * bare marker stands in for the instanced head). Coordinates as life.js
 * place(): scale-1 decor coordinates by default, `world` units with an
 * absolute `y`.
 */
export function lampAt(scene, x, z, style, { y = 0, world = false, rotY = 0 } = {}) {
  const st = LAMPS[style] ? style : 'paris', p = place(x, z, { y, world }), L = LAMPS[st];
  lampBatch(st).add(p.x, p.z, { y: p.y, rotY });
  const head = new THREE.Object3D(); head.name = 'lampHead';
  head.position.set(p.x + (st === 'corniche' ? Math.cos(rotY) * 1.0 : 0), p.y + L.rise, p.z - (st === 'corniche' ? Math.sin(rotY) * 1.0 : 0)); head.updateMatrixWorld(true);
  G.lamps.push({ head, rise: L.rise });
}
const furniture = (name, build) => perBuild(name, () => batch(() => { const g = new THREE.Group(); build(g); return g; }));
/** An instanced park bench (wood on cast iron), its seat facing local +z. Coordinates as lampAt(). */
export function bench(scene, x, z, rotY, { y = 0, world = false } = {}) {
  const p = place(x, z, { y, world });
  furniture('bench', g => { [-0.8, 0.8].forEach(px => { g.add(box(0.08, 0.45, 0.5, 0x1f3a2a, px, 0.22, 0)); g.add(box(0.08, 0.5, 0.06, 0x1f3a2a, px, 0.7, -0.24)); }); g.add(box(1.9, 0.06, 0.48, 0x8b5a2b, 0, 0.46, 0)); g.add(box(1.9, 0.3, 0.05, 0x8b5a2b, 0, 0.78, -0.26)); }).add(p.x, p.z, { y: p.y, rotY });
}
/** An instanced litter bin: the green bag on its hoop, as the Paris streets have them. Coordinates as lampAt(). */
export function litterBin(scene, x, z, { y = 0, world = false } = {}) {
  const p = place(x, z, { y, world });
  furniture('bin', g => { g.add(cyl(0.04, 0.04, 1.0, 0x2f3a3a, 0, 0.5, -0.3, 5)); g.add(cyl(0.3, 0.26, 0.7, 0x4f9a4a, 0, 0.55, 0, 7)); g.add(cyl(0.32, 0.32, 0.05, 0x2f3a3a, 0, 0.92, 0, 7)); }).add(p.x, p.z, { y: p.y, rotY: rand(0, 6.28) });
}
/** An instanced bollard: the dark cast-iron post along a pavement. Coordinates as lampAt(). */
export function bollard(scene, x, z, { y = 0, world = false } = {}) {
  const p = place(x, z, { y, world });
  furniture('bollard', g => { g.add(cyl(0.11, 0.14, 0.9, 0x2a2f33, 0, 0.45, 0, 6)); g.add(sph(0.13, 0x2a2f33, 0, 0.92, 0, 6)); }).add(p.x, p.z, { y: p.y });
}
export function flagPole(scene, x, z, colors, h, y = 0) { h = h || 9; scene.add(still(cyl(0.1, 0.12, h, 0xdddddd, x, y + h / 2, z, 6))); colors.forEach((c, i) => scene.add(still(box(1.2, 2.2, 0.06, c, x + 0.6 + i * 1.2, y + h - 1.2, z)))); }
export function sedan(scene, x, z, rotY, color, taxi) {
  const g = new THREE.Group(); const S = seg();
  if (taxi) { const sg = textPlane(1.2, 0.4, 'TAXI', '#111', '#f2c14e', 110); sg.position.set(-0.2, 2.4, 0); sg.rotation.y = Math.PI / 2; g.add(sg); g.add(box(1.2, 0.4, 0.1, 0x111111, -0.2, 2.4, -0.06)); }
  g.add(box(4.6, 1.0, 2.0, color, 0, 0.9, 0)); g.add(box(2.6, 0.8, 1.8, color, -0.2, 1.75, 0));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.6, 1.84), new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.2, metalness: 0.4 })); glass.position.set(-0.2, 1.8, 0); g.add(glass);
  const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.35, S); wg.rotateX(Math.PI / 2);
  [[-1.5, 1.0], [1.5, 1.0], [-1.5, -1.0], [1.5, -1.0]].forEach(p => { const w = tag(new THREE.Mesh(wg, mat(0x1a1a1a))); w.position.set(p[0], 0.42, p[1]); g.add(w); });
  [-0.7, 0.7].forEach(zz => { const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.4), headlightMat()); hl.position.set(2.31, 0.95, zz); g.add(hl); });
  if (!taxi) g.add(box(0.05, 0.2, 0.3, 0x2f55c7, -0.2, 2.2, 0.5)); // blue light
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(still(g)); return g;   // a cortège car moves as a whole
}
// A Haussmann block; `tint` multiplies the facade (ochre and pink in Marseille), `roofColor` swaps the zinc for tiles.
export function building(scene, x, z, w, d, h, rotY, tint, roofColor) {
  const fs = surface('facade'), m = tag(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), disposable(new THREE.MeshStandardMaterial({ map: disposable(fs.map.clone()), normalMap: fs.normalMap, roughness: 0.9, color: tint || 0xffffff }))));
  m.material.map.needsUpdate = true; m.material.map.repeat.set(Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(h / 9)));
  m.position.set(x, h / 2, z); m.rotation.y = rotY || 0; scene.add(m);
  const roof = box(w * 0.96, 2.6, d * 0.96, roofColor || 0x59606b, 0, h + 1.3, 0); roof.position.set(x, h + 1.3, z); roof.rotation.y = rotY || 0; scene.add(still(roof));
  for (let i = -w / 2 + 4; i < w / 2 - 2; i += 6) { const ch = box(0.9, 1.6, 0.9, 0x8a8a8a, 0, 0, 0); const a = (rotY || 0); ch.position.set(x + Math.cos(a) * i, h + 3.2, z - Math.sin(a) * i); scene.add(still(ch)); }
}
export function palace(scene, x, z, w, h, d, rotY, roofColor) {
  const g = new THREE.Group();
  const ps = surface('palace'), body = tag(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), disposable(new THREE.MeshStandardMaterial({ map: disposable(ps.map.clone()), normalMap: ps.normalMap, roughness: 0.9 })))); body.material.map.needsUpdate = true; body.material.map.repeat.set(Math.round(w / 10), Math.round(h / 10)); body.position.y = h / 2; g.add(body);
  g.add(box(w + 1, 1.4, d + 1, 0xd9cfb8, 0, h + 0.7, 0));
  const roof = box(w - 2, 4, d - 3, roofColor || 0x4a4f5a, 0, h + 3.4, 0); g.add(roof);
  const central = box(w * 0.22, h + 6, d + 2, 0xeadfc8, 0, (h + 6) / 2, 0); g.add(central); g.add(box(w * 0.22 + 1, 1.2, d + 3, 0xd9cfb8, 0, h + 6.6, 0));
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.11, d + 3, 3, 1), mat(0xe8dcc0)); ped.rotation.z = Math.PI / 2; ped.scale.set(1, 1, 0.45); ped.position.set(0, h + 8.5, 0); g.add(ped);
  for (let i = -3; i <= 3; i++) g.add(cyl(0.9, 1.0, h + 1, 0xf3ead6, i * (w * 0.22) / 7, (h + 1) / 2, d / 2 + 1.5, 10));
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(still(g)); return g;
}
export function gate(scene, x, z, rotY, width) {
  const g = new THREE.Group();
  [-width / 2, width / 2].forEach(px => { g.add(box(2.2, 7, 2.2, 0xd9cfb8, px, 3.5, 0)); g.add(sph(0.9, 0xd4af37, px, 7.8, 0, 12)); });
  for (let px = -width / 2 + 2.4; px < width / 2 - 2; px += 1.1) { g.add(cyl(0.07, 0.07, 5.5, 0x1a1a1a, px, 2.75, 0, 5)); g.add(cone(0.12, 0.4, 0xd4af37, px, 5.7, 0, 5)); }
  g.add(box(width - 4, 0.12, 0.12, 0x1a1a1a, 0, 1.2, 0)); g.add(box(width - 4, 0.12, 0.12, 0x1a1a1a, 0, 4.6, 0)); g.add(box(width - 4, 0.3, 0.3, 0xd4af37, 0, 3.0, 0));
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(still(g));
}
export function obelisk(scene, x, z) { scene.add(still(box(6, 6, 6, 0x9a8f7a, x, 3, z))); scene.add(still(box(4, 1.5, 4, 0xb0a48c, x, 6.75, z))); const o = cyl(0.9, 1.8, 20, 0xc9a56a, x, 17.5, z, 4); o.rotation.y = Math.PI / 4; scene.add(still(o)); const t = cone(1.2, 2.5, 0xf2c14e, x, 28.7, z, 4); t.rotation.y = Math.PI / 4; scene.add(still(t)); }
export function bridge(scene, x, z0, z1) {
  const len = z1 - z0; const cz = (z0 + z1) / 2;
  scene.add(box(30, 1.6, len, 0xd3c7ad, x, 5.2, cz)); [-15.5, 15.5].forEach(o => scene.add(box(1, 1.2, len, 0xbfb398, x + o, 6.6, cz)));
  for (let z = z0 + 8; z < z1; z += 14) { scene.add(box(30, 4.6, 3, 0xbfb398, x, 2.3, z)); const a = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 30, 20), mat(0xd3c7ad)); a.rotation.z = Math.PI / 2; a.position.set(x, 0.6, z + 7); scene.add(a); }
  for (let z = z0 + 4; z < z1; z += 14) { const l1 = cyl(0.14, 0.22, 5, 0x2f3a3a, x - 14, 8.5, z, 8); scene.add(l1); const l2 = l1.clone(); l2.position.x = x + 14; scene.add(l2); }
}
export function bateau(scene) {
  const g = new THREE.Group(); g.add(box(26, 1.6, 7, 0xf6f1e4, 0, 1.0, 0)); g.add(box(20, 2.0, 6, 0x9fd0e8, -1, 2.8, 0)); g.add(box(21, 0.4, 6.4, 0xffffff, -1, 3.9, 0)); g.add(box(5, 2.2, 5, 0x1f3a93, 9, 2.9, 0));
  for (let x = -9; x <= 7; x += 2.2) for (let zz = -2; zz <= 2; zz += 2) { const f = figure(pick(JACKETS), pick(SKINS), null); f.scale.setScalar(0.7); f.position.set(x, 1.8, zz); g.add(f); }
  g.add(box(0.5, 0.5, 0.5, 0xc8102e, -12, 4.3, 0)); scene.add(g); G.animated.push(dt => { g.position.x += dt * 6; if (g.position.x > 420) g.position.x = -420; }); g.position.set(-200, 0, -165);
}
export function fountain(scene, x, z, r, tiers, gold) {
  scene.add(cyl(r, r, 1.0, 0xd9cfb8, x, 0.5, z, 32)); const w = new THREE.Mesh(new THREE.CircleGeometry(r - 0.8, 32), disposable(new THREE.MeshStandardMaterial({ map: TEX.water, normalMap: surface('water').normalMap, roughness: 0.2, metalness: 0.2 }))); w.rotation.x = -Math.PI / 2; w.position.set(x, 1.02, z); scene.add(w);
  for (let t = 0; t < tiers; t++) { const rr = r * (0.42 - t * 0.12); scene.add(cyl(rr, rr * 1.1, 0.6, 0xd9cfb8, x, 1.3 + t * 2.2, z, 24)); scene.add(cyl(0.5, 0.7, 1.6, 0xd9cfb8, x, 2.4 + t * 2.2, z, 12)); }
  if (gold) { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; scene.add(sph(0.6, 0xd4af37, x + Math.cos(a) * (r * 0.55), 1.5, z + Math.sin(a) * (r * 0.55), 10)); } scene.add(box(2.2, 1.4, 1.4, 0xd4af37, x, 1.4 + tiers * 2.2 + 0.4, z)); }
  const jets = [];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const j = new THREE.Mesh(new THREE.ConeGeometry(0.35, 5, 6), new THREE.MeshStandardMaterial({ color: 0xcfe8f8, transparent: true, opacity: 0.75, roughness: 0.1 })); j.position.set(x + Math.cos(a) * (r * 0.6), 3.4, z + Math.sin(a) * (r * 0.6)); j.rotation.z = Math.cos(a) * 0.35; j.rotation.x = -Math.sin(a) * 0.35; scene.add(j); jets.push(j); }
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.6, 8, 8), new THREE.MeshStandardMaterial({ color: 0xcfe8f8, transparent: true, opacity: 0.75, roughness: 0.1 })); top.position.set(x, 1.3 + tiers * 2.2 + 4, z); scene.add(top); jets.push(top);
  G.animated.push(dt => { jets.forEach((j, i) => { j.scale.y = 0.9 + Math.sin(G.time * 5 + i) * 0.12; }); });
}
export function hedgeWall(scene, x, z, w, d, h) { scene.add(still(box(w, h, d, 0x2f6b3a, x, h / 2, z))); scene.add(still(box(w + 0.2, 0.3, d + 0.2, 0x3a7f45, x, h + 0.1, z))); }
export function statue(scene, x, z, rot) { scene.add(still(box(1.6, 2.2, 1.6, 0xcfc6b5, x, 1.1, z))); const f = figure(0xe8e2d6, 0xe8e2d6, null); f.position.set(x, 2.2, z); f.rotation.y = rot || 0; f.scale.setScalar(1.15); scene.add(f); }
export function parterre(scene, x, z, w, d) { const p = plane(w, d, 0x4f8f3f, x, z); scene.add(p); const inner = plane(w - 3, d - 3, pick([0xe36f8a, 0xf2c14e, 0xd95f5f, 0xf0f0f0, 0x8a5fc8]), x, z); inner.position.y = 0.04; scene.add(inner); const edge = box(w, 0.6, 0.5, 0x2f6b3a, x, 0.3, z - d / 2); scene.add(edge); const e2 = edge.clone(); e2.position.z = z + d / 2; scene.add(e2); const e3 = box(0.5, 0.6, d, 0x2f6b3a, x - w / 2, 0.3, z); scene.add(e3); const e4 = e3.clone(); e4.position.x = x + w / 2; scene.add(e4); }
export function kiosk(scene, x, z, color, signText, rotY) { const g = new THREE.Group(); g.add(box(5, 3.2, 4, 0xf3ead6, 0, 1.6, 0)); g.add(box(6, 0.4, 5, color, 0, 3.4, 0)); g.add(cone(3.4, 2.5, color, 0, 4.8, 0, 4)); const sign = textPlane(4.6, 1.15, signText, '#fffaf0', '#222', 60); sign.position.set(0, 2.6, 2.05); g.add(sign); g.add(box(5.2, 0.1, 1.6, color, 0, 2.2, 2.6)); g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(still(g)); }
export function shopRow(scene, x0, x1, z, facing) {
  const names = [['BOULANGERIE', '#c8102e'], ['PHARMACIE', '#2e8b57'], ['CAFÉ DE LA PAIX', '#1f3a93'], ['TABAC · PRESSE', '#b8102e'], ['GALERIE', '#5c1a33'], ['CHOCOLATIER', '#6b4a2b'], ['FLEURISTE', '#e36f8a'], ['BRASSERIE', '#e0a030']];
  let i = 0;
  for (let x = x0; x < x1; x += 20) { building(scene, x + 10, z, 20, 14, 18, 0); const n = names[i++ % names.length]; const aw = box(18, 0.2, 2.6, parseInt(n[1].slice(1), 16), x + 10, 3.6, z + facing * 8.2); aw.rotation.x = facing * 0.25; scene.add(still(aw)); const sg = textPlane(10, 1.2, n[0], n[1], '#fffaf0', 70); sg.position.set(x + 10, 4.6, z + facing * 7.1); sg.rotation.y = facing > 0 ? 0 : Math.PI; scene.add(sg); const win = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshStandardMaterial({ color: 0x1e2a3a, roughness: 0.2, metalness: 0.5 })); win.position.set(x + 10, 1.6, z + facing * 7.05); win.rotation.y = facing > 0 ? 0 : Math.PI; scene.add(win); }
}
export function pigeon(scene, x, z) { const g = new THREE.Group(); g.add(sph(0.22, 0x8a8a92, 0, 0.22, 0, 8)); g.add(sph(0.12, 0x6a6a74, 0.2, 0.42, 0, 6)); g.add(cone(0.04, 0.12, 0xe0a030, 0.33, 0.4, 0, 4)); g.position.set(x, 0, z); g.rotation.y = rand(0, 6.28); scene.add(still(g)); }
export function bouquiniste(scene, x, z, rotY) { const g = new THREE.Group(); g.add(box(2.2, 1.1, 0.9, 0x2f5f32, 0, 1.4, 0)); g.add(box(2.3, 0.1, 1.0, 0x244a28, 0, 1.95, 0)); const lid = box(2.2, 0.08, 0.9, 0x2f5f32, 0, 2.3, -0.6); lid.rotation.x = -1.1; g.add(lid); for (let i = 0; i < 5; i++) g.add(box(0.3, 0.5, 0.7, pick([0xc8102e, 0xf2c14e, 0x1f3a93, 0xf6f1e4, 0x6b4a2b]), -0.8 + i * 0.4, 1.95 + 0.25, 0)); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(still(g)); }
// ---------- Street life shared by several circuits ----------
// Figure counts drop by half on 'low' detail (phones), big pieces stay.
export function person(scene, x, z, rotY, hat, amp) { const f = figure(pick(JACKETS), pick(SKINS), hat || null); f.position.set(x, 0, z); f.rotation.y = rotY ?? rand(0, 6.28); scene.add(f); G.crowd.push({ g: f, ph: rand(0, 6.28), amp: amp ?? 0.1, base: 0 }); return f; }
// A café terrace: round tables under parasols in front of an awning with the sign. Faces local +z.
export function cafe(scene, x, z, rotY, name, color, tables) {
  const g = new THREE.Group(); const n = tables || 3, w = n * 3.2 + 1;
  for (let i = 0; i < n; i++) { const tx = (i - (n - 1) / 2) * 3.2; g.add(cyl(0.7, 0.7, 0.08, 0xf6f1e4, tx, 0.75, 0, 12)); g.add(cyl(0.06, 0.1, 0.75, 0x333333, tx, 0.37, 0, 6)); [-1, 1].forEach(s => { g.add(box(0.5, 0.06, 0.5, 0x8b5a2b, tx + s * 1.05, 0.45, 0.2)); g.add(box(0.06, 0.55, 0.5, 0x8b5a2b, tx + s * 1.3, 0.72, 0.2)); }); g.add(cyl(0.04, 0.04, 2.4, 0x555555, tx, 1.2, 0, 5)); g.add(cone(1.6, 0.6, color, tx, 2.5, 0, 10)); if (i % 2 === 0) { const f = figure(pick(JACKETS), pick(SKINS), null); f.scale.setScalar(0.8); f.position.set(tx - 1.05, -0.3, 0.3); f.rotation.y = -Math.PI / 2; g.add(f); } }
  const aw = box(w, 0.15, 2.0, color, 0, 3.2, -2.2); aw.rotation.x = 0.3; g.add(aw); [-w / 2, w / 2].forEach(px => g.add(cyl(0.05, 0.05, 3.6, 0x555555, px, 1.8, -3.2, 5)));
  const sg = textPlane(w - 0.6, 0.9, name, hex(color), '#fffaf0', 64); sg.position.set(0, 4.0, -3.1); g.add(sg);
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(still(g));
}
// A painter's easel with a canvas on it, and the painter at work behind it.
const CANVASES = [0xe36f8a, 0x9fd0e8, 0xf2c14e, 0x5d9a4a, 0xf6f1e4, 0x8a5fc8, 0xd95f5f];
export function easel(scene, x, z, rotY) {
  const g = new THREE.Group();
  [[-0.4, 0.25], [0.4, 0.25], [0, -0.45]].forEach(([lx, lz]) => { const l = cyl(0.025, 0.025, 1.9, 0x8b5a2b, lx * 0.55, 0.95, lz * 0.55, 5); l.rotation.set(lz * 0.5, 0, -lx * 0.45); g.add(l); });
  g.add(box(0.9, 0.7, 0.04, pick(CANVASES), 0, 1.3, 0.12)); g.add(box(0.3, 0.2, 0.04, pick(CANVASES), rand(-0.2, 0.2), rand(1.1, 1.5), 0.15));
  const p = figure(pick(JACKETS), pick(SKINS), null); p.position.set(0, 0, -1.0); g.add(p); G.crowd.push({ g: p, ph: rand(0, 6.28), amp: 0.05, base: 0 });
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
}
// Two cabins on a sloped rail, going up and down in opposite directions. World coordinates.
export function funicular(world, x, z0, z1, h) {
  const L = Math.hypot(z1 - z0, h), slope = Math.atan2(h, z1 - z0); const g = new THREE.Group(); g.position.set(x, 0, z0);
  [-1.5, 1.5].forEach(rx => { const r = box(0.25, 0.25, L, 0x555555, rx, h / 2 + 0.2, (z1 - z0) / 2); r.rotation.x = -slope; g.add(r); const b = box(0.4, 0.4, L, 0x9a9282, rx, h / 2 - 0.1, (z1 - z0) / 2); b.rotation.x = -slope; g.add(b); });
  const cab = () => { const c = new THREE.Group(); c.add(box(2.8, 2.6, 3.4, 0xf2c14e, 0, 1.6, 0)); c.add(box(2.9, 1.0, 3.5, 0x223344, 0, 1.9, 0)); c.add(box(2.6, 0.2, 3.2, 0x8a8a8a, 0, 2.95, 0)); return c; };
  const a = cab(), b = cab(); g.add(a); g.add(b); world.add(g);
  let t = 0, dir = 1;
  G.animated.push(dt => { t += dt * 0.06 * dir; if (t > 1) { t = 1; dir = -1; } if (t < 0) { t = 0; dir = 1; } a.position.set(-1.5, t * h + 0.3, t * (z1 - z0)); b.position.set(1.5, (1 - t) * h + 0.3, (1 - t) * (z1 - z0)); });
}
// A fairground carousel: eight horses on poles under a striped roof, turning slowly.
export function carousel(scene, x, z) {
  const g = new THREE.Group(); g.add(cyl(5.2, 5.4, 0.4, 0xc8102e, 0, 0.2, 0, 24)); g.add(cyl(0.25, 0.25, 5.5, 0xd4af37, 0, 3, 0, 8)); g.add(cone(6.2, 2.4, 0xf6f1e4, 0, 6.6, 0, 12)); g.add(cyl(6.2, 6.2, 0.5, 0xc8102e, 0, 5.4, 0, 12)); g.add(sph(0.5, 0xd4af37, 0, 8.0, 0, 8));
  const spin = new THREE.Group(); g.add(spin);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, hx = Math.cos(a) * 3.8, hz = Math.sin(a) * 3.8; spin.add(cyl(0.05, 0.05, 4.6, 0xd4af37, hx, 2.7, hz, 5)); const body = box(1.3, 0.55, 0.45, pick([0xf6f1e4, 0xe0a030, 0x8b5a2b, 0x222222]), hx, 1.6, hz); body.rotation.y = -a; spin.add(body); const head = box(0.4, 0.45, 0.3, 0xf6f1e4, hx - Math.sin(a) * 0.75, 2.05, hz + Math.cos(a) * 0.75); head.rotation.y = -a; spin.add(head); }
  G.animated.push(dt => { spin.rotation.y += dt * 0.45; for (let i = 0; i < 8; i++) spin.children[i * 3 + 1].position.y = 1.6 + Math.sin(G.time * 2 + i) * 0.25; });
  g.position.set(x, 0, z); scene.add(g);
}
// The Moulin de la Galette: a wooden mill on a stone base, its four sails turning.
export function windmill(scene, x, z, rotY) {
  const g = new THREE.Group(); g.add(cyl(3.2, 3.5, 2.6, 0x9a9282, 0, 1.3, 0, 12)); g.add(cyl(2.2, 2.8, 7, 0x8b6a3b, 0, 6.1, 0, 10)); g.add(cone(2.7, 2.6, 0x4a3b2a, 0, 10.9, 0, 10));
  const sails = new THREE.Group(); sails.position.set(0, 8.4, 2.9); g.add(sails); sails.add(sph(0.4, 0x4a3b2a, 0, 0, 0, 6));
  for (let i = 0; i < 4; i++) { const b = new THREE.Group(); b.rotation.z = i * Math.PI / 2; b.add(box(0.9, 6.5, 0.12, 0xd9cfb8, 0.3, 3.6, 0)); b.add(box(0.12, 7, 0.14, 0x4a3b2a, -0.25, 3.5, 0)); sails.add(b); }
  G.animated.push(dt => { sails.rotation.z += dt * 0.35; });
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g);
}
// A Guimard Métro entrance: green cast iron, the lamps and the sign. Stairs go down on local +z.
export function metroEntrance(scene, x, z, rotY) {
  const g = new THREE.Group(); [-1.7, 1.7].forEach(px => { g.add(cyl(0.1, 0.14, 3.4, 0x2f6b3a, px, 1.7, 0, 6)); g.add(sph(0.3, 0xe0a030, px, 3.6, 0, 8)); g.add(box(0.08, 0.9, 3.2, 0x2f6b3a, px, 0.45, 1.6)); });
  g.add(box(3.8, 0.5, 0.25, 0x2f6b3a, 0, 3.0, 0)); const sg = textPlane(3.4, 0.7, 'MÉTROPOLITAIN', '#2f6b3a', '#f2c14e', 56); sg.position.set(0, 3.0, 0.14); g.add(sg); g.add(box(3.2, 0.1, 3.2, 0x222222, 0, 0.05, 1.6));
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(still(g));
}
// A bus shelter with somebody waiting in it.
export function busStop(scene, x, z, rotY) {
  const g = new THREE.Group(); [-1.9, 1.9].forEach(px => g.add(cyl(0.06, 0.06, 2.8, 0x2f3a3a, px, 1.4, -0.8, 5))); g.add(box(4.2, 0.15, 1.8, 0x2f3a3a, 0, 2.85, -0.2)); g.add(box(4, 2.0, 0.06, 0x9fb4cf, 0, 1.7, -0.85)); g.add(box(2.4, 0.1, 0.5, 0x8b5a2b, 0, 0.5, -0.5)); g.add(cyl(0.05, 0.05, 3.6, 0x2f3a3a, 2.4, 1.8, 0.4, 5)); const sg = textPlane(0.9, 0.5, 'BUS', '#1f3a93', '#fff', 90); sg.position.set(2.4, 3.4, 0.4); g.add(sg);
  const f = figure(pick(JACKETS), pick(SKINS), null); f.position.set(-0.8, 0, -0.2); g.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: 0.05, base: 0 });
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(still(g));
}
// A Wallace fountain: dark green, four caryatids under a little dome.
export function wallace(scene, x, z) { const g = new THREE.Group(); g.add(cyl(0.9, 1.0, 0.5, 0x1f5a3a, 0, 0.25, 0, 10)); g.add(cyl(0.45, 0.6, 1.0, 0x1f5a3a, 0, 1.0, 0, 8)); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; g.add(cyl(0.1, 0.12, 1.2, 0x1f5a3a, Math.cos(a) * 0.4, 2.1, Math.sin(a) * 0.4, 5)); } g.add(sph(0.55, 0x1f5a3a, 0, 2.9, 0, 10)); g.add(cone(0.15, 0.4, 0x1f5a3a, 0, 3.5, 0, 5)); g.position.set(x, 0, z); scene.add(still(g)); }
// A moored péniche: a long low barge with a cabin aft and a tarp over the hold.
export function peniche(scene, x, z, rotY, color) { const g = new THREE.Group(); g.add(box(26, 1.6, 6, color, 0, 0.5, 0)); g.add(box(6, 2.4, 5, 0xf6f1e4, -8.5, 2.5, 0)); g.add(box(6.2, 0.3, 5.2, 0x8a2b2b, -8.5, 3.8, 0)); g.add(box(14, 0.7, 5.4, 0x444444, 3, 1.6, 0)); g.add(cyl(0.2, 0.2, 1.6, 0x222222, -10.5, 4.4, 1.5, 6)); g.add(box(0.5, 0.35, 0.05, 0xc8102e, 12.5, 2.4, 0)); g.position.set(x, 0.2, z); g.rotation.y = rotY; scene.add(g); }
// A swan: body, curved neck, head and an orange beak.
export function swan(scene, x, z) { const g = new THREE.Group(); const b = sph(0.45, 0xffffff, 0, 0.3, 0, 8); b.scale.set(1, 0.7, 1.4); g.add(b); const n = cyl(0.07, 0.1, 0.9, 0xffffff, 0, 0.8, 0.5, 6); n.rotation.x = -0.25; g.add(n); g.add(sph(0.14, 0xffffff, 0, 1.25, 0.6, 6)); g.add(cone(0.06, 0.25, 0xe0a030, 0, 1.25, 0.8, 5).rotateX(Math.PI / 2)); g.position.set(x, 0, z); g.rotation.y = rand(0, 6.28); scene.add(g); return g; }
// An orangery: a long, low, pale building with a row of arched windows; faces local +z.
export function orangery(scene, x, z, w, rotY) {
  const g = new THREE.Group(); g.add(box(w, 8, 14, 0xeadfc8, 0, 4, 0)); g.add(box(w + 1, 0.8, 15, 0xd9cfb8, 0, 8.4, 0)); g.add(box(w - 2, 1.8, 12, 0x6b6f78, 0, 9.2, 0));
  for (let px = -w / 2 + 5; px < w / 2 - 3; px += 7) { g.add(box(3.4, 4.6, 0.3, 0x334a66, px, 2.5, 7.1)); const arc = cyl(1.7, 1.7, 0.3, 0x334a66, px, 4.8, 7.1, 12); arc.rotation.x = Math.PI / 2; g.add(arc); }
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g);
}
// A small sailing boat: hull, deck, cabin, mast and sail; returns the inner group that rolls.
export function boat(scene, x, z, rotY, color) {
  const g = new THREE.Group(), b = new THREE.Group(); g.add(b); b.add(box(7, 1.2, 2.6, color, 0, 0.6, 0)); b.add(box(6.6, 0.2, 2.3, 0xf6f1e4, 0, 1.25, 0)); b.add(box(2.2, 1.1, 1.8, 0xffffff, -1.4, 1.9, 0)); b.add(cyl(0.06, 0.09, 7.5, 0xdddddd, 1.0, 4.8, 0, 6)); b.add(box(2.4, 4.2, 0.06, pick([0xfffaf0, 0xf6f1e4, 0xffd34d, 0x9fd0e8]), -0.3, 5.0, 0)); b.add(cone(0.9, 1.2, color, 3.9, 0.7, 0, 4).rotateZ(-Math.PI / 2));
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g); return b;
}
// The little ferry-boat that crosses the harbour and back, turning round at each quay. Bounds in scale-1 coordinates.
export function ferry(scene, x0, x1, z) {
  const g = new THREE.Group(); g.add(box(11, 1.4, 4.2, 0xffffff, 0, 0.9, 0)); g.add(box(6.5, 2.2, 3.4, 0x1f3a93, -0.5, 2.6, 0)); g.add(box(7, 0.3, 3.8, 0xf6f1e4, -0.5, 3.85, 0)); g.add(box(0.5, 0.35, 0.05, 0x2a7fd4, 5, 2.2, 0));
  for (let i = 0; i < 4; i++) { const f = figure(pick(JACKETS), pick(SKINS), null); f.scale.setScalar(0.7); f.position.set(-3 + i * 1.6, 1.4, i % 2 ? 1.2 : -1.2); g.add(f); }
  merged(g, 'ferry'); g.position.set(x0, 0, z); scene.add(g); let dir = 1;
  G.animated.push(dt => { g.position.x += dt * 5 * dir; if (g.position.x > x1 * DS) dir = -1; if (g.position.x < x0 * DS) dir = 1; g.rotation.y = dir > 0 ? 0 : Math.PI; g.position.y = Math.sin(G.time * 1.4) * 0.15; });
}
// The big wheel: a rim, spokes, twelve gondolas that stay upright, on two A-frames. World coordinates.
export function ferrisWheel(world, x, z, r) {
  const g = new THREE.Group(); g.position.set(x, 0, z); const wheel = new THREE.Group(); wheel.position.y = r + 4; g.add(wheel);
  wheel.add(torus(r, 0.45, 0xf6f1e4, 0, 0, 0)); wheel.add(torus(r * 0.28, 0.3, 0xf6f1e4, 0, 0, 0)); const hub = cyl(1.2, 1.2, 3, 0x9a9a9a, 0, 0, 0, 10); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  for (let i = 0; i < 8; i++) { const s = box(0.3, r * 2, 0.3, 0x9a9a9a, 0, 0, 0); s.rotation.z = i * Math.PI / 8; wheel.add(s); }
  const gondolas = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const c = new THREE.Group(); c.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); c.add(box(2.4, 2.2, 2.0, pick([0xc8102e, 0x2a7fd4, 0xf2c14e, 0xf6f1e4]), 0, -1.6, 0)); c.add(box(2.5, 0.9, 2.1, 0x223344, 0, -1.3, 0)); wheel.add(c); gondolas.push(c); }
  [-1.6, 1.6].forEach(lz => [-1, 1].forEach(sx => { const leg = cyl(0.4, 0.5, Math.hypot(r * 0.6, r + 4), 0x9a9a9a, sx * r * 0.3, (r + 4) / 2, lz, 8); leg.rotation.z = -sx * Math.atan2(r * 0.6, r + 4); g.add(leg); }));
  G.animated.push(dt => { wheel.rotation.z += dt * 0.12; for (const c of gondolas) c.rotation.z = -wheel.rotation.z; });
  bakeVertexColours(g, finishOf); mergeByMaterial(g, [wheel, ...gondolas]);   // the frame, the wheel and each gondola one draw apiece, still turning
  g.name = 'ferrisWheel'; world.add(g);
}
// A fish stall: a bed of ice with the catch on it under a parasol, the vendor behind.
export function fishStall(scene, x, z, rotY) {
  const g = new THREE.Group(); g.add(box(3, 0.1, 1.4, 0x8b5a2b, 0, 0.9, 0)); [-1.3, 1.3].forEach(px => g.add(box(0.1, 0.9, 1.2, 0x8b5a2b, px, 0.45, 0))); g.add(box(2.8, 0.25, 1.2, 0xeaf6ff, 0, 1.07, 0));
  for (let i = 0; i < 6; i++) { const f = sph(0.18, 0xc0c8d0, -1.1 + i * 0.44, 1.22, rand(-0.3, 0.3), 6); f.scale.set(1, 0.5, 2.2); f.rotation.y = rand(-0.3, 0.3); g.add(f); }
  g.add(cyl(0.04, 0.04, 2.6, 0x555555, 0, 1.3, -0.6, 5)); g.add(cone(2.4, 0.8, 0x2a7fd4, 0, 2.95, -0.6, 4)); const sg = textPlane(2.6, 0.6, 'POISSONNERIE', '#1f3a93', '#fff', 56); sg.position.set(0, 2.2, 0.75); g.add(sg);
  const v = figure(0x3b4a6b, pick(SKINS), null); v.position.set(0, 0, -1.3); g.add(v); G.crowd.push({ g: v, ph: rand(0, 6), amp: 0.08, base: 0 });
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g);
}
// Fort Saint-Jean: two stone walls meeting at a round tower. World coordinates.
export function fort(world, x, z, rotY) { const g = new THREE.Group(); g.add(box(70, 11, 9, 0xc9b48c, 20, 5.5, 0)); g.add(box(9, 11, 60, 0xc9b48c, 0, 5.5, -25)); g.add(box(72, 1.5, 10, 0xb9a47c, 20, 11.6, 0)); g.add(cyl(8, 8.6, 26, 0xd3c09a, 0, 13, 0, 16)); g.add(cyl(9, 9, 2, 0xb9a47c, 0, 26.8, 0, 16)); g.add(cyl(0.12, 0.12, 8, 0xdddddd, 0, 31, 0, 5)); g.add(box(3, 1.8, 0.1, 0x2f55c7, 1.5, 33.5, 0)); g.position.set(x, 0, z); g.rotation.y = rotY || 0; world.add(merged(g, 'fort')); }
// A dockside crane. World coordinates, so the jib keeps its proportions.
export function crane(world, x, z, rotY) { const g = new THREE.Group(); g.add(box(4, 1.2, 4, 0x444444, 0, 0.6, 0)); g.add(cyl(0.6, 0.8, 26, 0xe0a030, 0, 13.6, 0, 6)); g.add(box(1, 1, 24, 0xe0a030, 0, 26.5, 7)); g.add(box(1.2, 1.2, 6, 0xe0a030, 0, 26.5, -5)); g.add(box(2, 2, 2, 0x222222, 0, 25, 1.5)); g.add(cyl(0.04, 0.04, 14, 0x333333, 0, 19, 15, 4)); g.add(box(0.8, 0.8, 0.8, 0x333333, 0, 11.8, 15)); g.position.set(x, 0, z); g.rotation.y = rotY || 0; world.add(merged(g, 'crane')); }
// A tram on a short line, back and forth along x. Bounds in scale-1 coordinates.
export function tram(scene, x0, x1, z) {
  [-1.1, 1.1].forEach(rz => scene.add(box(x1 - x0, 0.12, 0.2, 0x555555, (x0 + x1) / 2, 0.06, z + rz / DS)));   // the rails stretch with the line, the tram keeps its gauge
  const g = new THREE.Group(); g.add(box(9, 2.8, 2.4, 0xf6f1e4, 0, 1.9, 0)); g.add(box(8.4, 1.0, 2.5, 0x223344, 0, 2.3, 0)); g.add(box(9.1, 0.4, 2.45, 0x2a7fd4, 0, 1.0, 0)); g.add(box(9, 0.2, 2.2, 0x9a9a9a, 0, 3.4, 0)); g.add(cyl(0.04, 0.04, 1.6, 0x333333, 0, 4.2, 0, 4));
  merged(g, 'tram'); g.position.set(x0 + 5, 0, z); scene.add(g); let dir = 1;
  G.animated.push(dt => { g.position.x += dt * 6 * dir; if (g.position.x > (x1 - 5) * DS) dir = -1; if (g.position.x < (x0 + 5) * DS) dir = 1; });
}
// A game of pétanque: the boules, the cochonnet, and the players arguing around them.
export function petanque(scene, x, z) { const g = new THREE.Group(); g.add(plane(9, 7, 0xcdbc8e, 0, 0)); for (let i = 0; i < 6; i++) g.add(sph(0.13, 0x9a9a9a, rand(-1.5, 1.5), 0.13, rand(-1, 1), 6)); g.add(sph(0.06, 0xe0a030, rand(-0.5, 0.5), 0.06, rand(-0.5, 0.5), 5)); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.4; const f = figure(pick(JACKETS), pick(SKINS), null); f.position.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.2); f.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); g.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: i === 0 ? 0.3 : 0.05, base: 0 }); } g.position.set(x, 0, z); scene.add(g); }
// A seagull on a mooring post.
export function seagull(scene, x, z, h) { const g = new THREE.Group(); g.add(cyl(0.1, 0.14, h, 0x6b4a2b, 0, h / 2, 0, 6)); const b = sph(0.22, 0xffffff, 0, h + 0.2, 0, 7); b.scale.set(1, 0.8, 1.5); g.add(b); [-1, 1].forEach(s => { const w = box(0.7, 0.04, 0.3, 0xe8e8e8, s * 0.4, h + 0.3, 0); w.rotation.z = -s * 0.25; g.add(w); }); g.add(cone(0.05, 0.18, 0xe0a030, 0, h + 0.28, 0.42, 5).rotateX(Math.PI / 2)); g.position.set(x, 0, z); g.rotation.y = rand(0, 6.28); scene.add(g); }
// A lower village house with a tiled roof: Montmartre's and Le Panier's.
export function house(scene, x, z, w, d, h, rotY) { building(scene, x, z, w, d, h, rotY, pick([0xffffff, 0xf4e6c8, 0xf2d7c2, 0xe8d6a8, 0xf0d9c0]), pick([0xa0523d, 0x8f4a36, 0xb0623f])); }
// A straight flight of steps with a handrail: Montmartre's stairs, parallel to local z.
export function stairs(scene, x, z, rotY, n) { const g = new THREE.Group(); for (let i = 0; i < n; i++) g.add(box(3.4, 0.3 * (i + 1), 1.4, 0xbfb398, 0, 0.15 * (i + 1), i * 1.4)); for (let i = 0; i < n; i += 3) [-1.8, 1.8].forEach(px => g.add(cyl(0.04, 0.04, 1.0, 0x2f3a3a, px, 0.3 * (i + 1) + 0.5, i * 1.4, 5))); [-1.8, 1.8].forEach(px => { const r = box(0.06, 0.06, Math.hypot(n * 1.4, n * 0.3), 0x2f3a3a, px, 0.3 * n / 2 + 1.0, (n - 1) * 0.7); r.rotation.x = -Math.atan2(0.3, 1.4); g.add(r); }); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g); }
// A patch of vines: posts in rows with the vine stock on each.
export function vines(scene, x, z, rotY) { const g = new THREE.Group(); for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { const px = (c - 2.5) * 2.2, pz = (r - 1) * 2.2; g.add(cyl(0.05, 0.05, 1.6, 0x6b4a2b, px, 0.8, pz, 4)); g.add(cone(0.55, 1.3, pick([0x3f8a3a, 0x4fa044, 0x5d9a4a]), px, 1.5, pz, 6)); } g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g); }
// The Sacré-Cœur on its mound: the stepped base, the great dome, four small domes, the campanile and the stairs in front. World coordinates, facing -z.
export function sacreCoeur(world, x, z) {
  const g = new THREE.Group(); const W = 0xf2eee6;
  g.add(box(190, 10, 110, 0x6f9a55, 0, 5, 0)); g.add(box(130, 1.5, 76, 0xd9cfb8, 0, 10.7, 0)); g.add(box(64, 20, 44, W, 0, 21, 4)); g.add(box(70, 1.2, 50, 0xe4ded2, 0, 31.4, 4));
  g.add(box(48, 11, 9, W, 0, 16.5, -22)); [-14, 0, 14].forEach(px => g.add(box(7, 8, 0.6, 0x334a66, px, 15, -26.6)));
  g.add(cyl(12, 13, 9, W, 0, 36, 4, 16)); const d = sph(12.5, W, 0, 41, 4, 20); d.scale.set(1, 1.2, 1); g.add(d); g.add(cone(1.2, 5, 0xd4af37, 0, 57.5, 4, 6));
  [[-24, -12], [24, -12], [-24, 20], [24, 20]].forEach(([px, pz]) => { g.add(cyl(5, 5.5, 6, W, px, 34, pz, 12)); const s = sph(5.2, W, px, 38, pz, 12); s.scale.set(1, 1.15, 1); g.add(s); });
  g.add(cyl(5, 5.6, 48, W, -40, 35, 14, 10)); g.add(cone(5.6, 9, 0x6b6f78, -40, 63.5, 14, 10));
  [-14, 14].forEach(px => { const st = box(12, 1.2, 46, 0xd9cfb8, px, 5.6, -58); st.rotation.x = Math.atan2(10, 46); g.add(st); });
  for (let px = -60; px <= 60; px += 20) g.add(cyl(0.14, 0.2, 5, 0x2f3a3a, px, 13.5, -36, 6));
  g.position.set(x, 0, z); world.add(g);
}
// Notre-Dame de la Garde on her hill: the church, the square tower and the gilded Bonne Mère on top. World coordinates.
export function bonneMere(world, x, z) {
  const g = new THREE.Group(); g.add(box(140, 16, 100, 0x8aa860, 0, 8, 0)); g.add(box(80, 8, 70, 0xc9b48c, 0, 20, 0)); g.add(box(34, 18, 54, 0xe8dcc0, 0, 33, 6)); g.add(box(36, 2.2, 56, 0x2f6b3a, 0, 36, 6)); g.add(box(36, 2.2, 56, 0x2f6b3a, 0, 30, 6)); const dm = sph(10, 0xe8dcc0, 0, 44, 8, 14); dm.scale.set(1, 0.8, 1); g.add(dm);
  g.add(box(14, 44, 14, 0xe8dcc0, 0, 46, -24)); g.add(box(10, 9, 10, 0xd9cfb8, 0, 72.5, -24)); g.add(box(11, 1.5, 11, 0xd4af37, 0, 77.5, -24));
  const m = figure(0xd4af37, 0xd4af37, null); m.scale.setScalar(5); m.position.set(0, 78, -24); g.add(m);
  g.position.set(x, 0, z); world.add(merged(g, 'bonneMere'));
}
