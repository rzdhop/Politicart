// Montmartre's own props (stage 7): the butte the Sacré-Cœur stands on, the
// stairs of the rue Foyatier, the Lapin Agile, the Mur des je t'aime, the
// terraced streets beside the climb, the café terraces' fronts, and the
// repeated pieces the builder instances (decor/instanced.js): village houses,
// Citroën 2CVs, bistro tables, the painters' red parasols and easels, vine
// stocks, trees. Merged pieces go through versailles-props.js merged() (baked
// to the shared finishes, merged by material: one draw per finish).
import * as THREE from 'three';

import { box, cone, cyl, mat, sph, tag, textPlane } from '../primitives.js';
import { G, disposable } from '../state.js';
import { surface } from '../textures.js';
import { hex, pick, rand } from '../util.js';
import { terrainY, yAt } from './context.js';
import { JACKETS, SKINS, figure } from './street.js';
import { merged, rs } from './versailles-props.js';

/** The butte: its centre (world), the plateau's height and radius, the radius where it meets the plain. */
export const BUTTE = Object.freeze({ x: 0, z: 770, top: 40, plateau: 120, rim: 215 });
/** The butte's height at world (x, z): the plateau, a straight slope down to the terrain at the rim (so a funicular rail laid along a radius sits on it), the terrain beyond; a little below the terrain at the rim, so the plain's coarser grid never shows a seam. */
export function butteY(x, z) {
  const r = Math.hypot(x - BUTTE.x, z - BUTTE.z), k = Math.max(0, Math.min(1, (BUTTE.rim - r) / (BUTTE.rim - BUTTE.plateau)));
  if (k >= 1) return BUTTE.top;
  const t = terrainY(x, z) - 0.3;
  return t + (BUTTE.top - t) * k;
}
/** The point at radius r of the butte, angle a from due south (towards -x as a grows). */
export const onButte = (r, a) => ({ x: BUTTE.x - r * Math.sin(a), z: BUTTE.z - r * Math.cos(a) });

// ---------- Materials, one per race ----------
/** Village walls (the plaster surface, tiled by the metre through plasterBox's uvs). */
export const plasterMat = (color = 0xffffff) => disposable(new THREE.MeshStandardMaterial({ map: surface('plaster').map, normalMap: surface('plaster').normalMap, color, roughness: 0.92 }));
/** The butte's grass, the plain's own surface at the plain's tiling (11.4 m). */
export const grassMat = () => disposable(new THREE.MeshStandardMaterial({ map: surface('grass').map, normalMap: surface('grass').normalMap, roughness: 1 }));

/** A box whose texture repeats every tw x th metres on its walls (the plaster tile is three 3 m bays by three 3 m floors), aligned on its foot. */
function plasterBox(w, h, d, m, tw = 9, th = 9) {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tw, uv.getY(i) * dims[f][1] / th); }
  return tag(new THREE.Mesh(geo, m));
}
/** A gable roof (a triangular prism standing on y = 0): its ridge `len` long along local x, `span` wide across, `rise` high. */
function gable(len, span, rise, color) {
  const geo = new THREE.CylinderGeometry(1, 1, len, 3); geo.rotateZ(-Math.PI / 2); geo.rotateX(-Math.PI / 2); geo.translate(0, 0.5, 0); geo.scale(1, rise / 1.5, span / Math.sqrt(3));   // the three-sided cylinder's apex up, its axis along x
  return tag(new THREE.Mesh(geo, mat(color)));
}

// ---------- Instanced props (prop makers: build at the origin) ----------
/** The butte's trees, lighter than street.js's: a round lime or a plane tree. */
export function butteTree(kind) {
  const g = new THREE.Group(), S = rs(12, 5);
  if (kind === 'plane') { g.add(cyl(0.4, 0.55, 7, 0x9a9282, 0, 3.5, 0, 7)); g.add(sph(3.2, 0x5d9a4a, 0, 8.5, 0, S)); g.add(sph(2.2, 0x6fab55, 1.8, 9.5, 0.8, S)); g.add(sph(1.8, 0x4f8a40, -1.4, 10.2, -0.6, S)); }
  else { g.add(cyl(0.35, 0.5, 3, 0x6b4a2b, 0, 1.5, 0, 7)); g.add(sph(2.4, 0x3f8a3a, 0, 4.6, 0, S)); g.add(sph(1.6, 0x4fa044, 1.2, 5.6, 0.6, S)); }
  return g;
}
/**
 * A village house of the butte, w x d x h, front on local +z: plaster walls on a stone plinth that reaches into the
 * slope, a tiled gable, green shutters by its windows ("détaillés" only: the plaster draws the windows), a chimney.
 */
export function villageHouse(w, d, h, walls) {
  const g = new THREE.Group(), body = plasterBox(w, h, d, walls); body.position.y = h / 2; g.add(body);
  g.add(box(w + 0.3, 2.2, d + 0.3, 0x9a9282, 0, -0.9, 0));
  const roof = gable(w + 0.8, d + 0.8, 3, 0xa0523d); roof.position.y = h; g.add(roof);
  g.add(box(0.9, 2.2, 0.9, 0x8a6a5a, w * 0.3, h + 2, -d * 0.2));
  if (rs(1, 0)) for (let fl = 1; fl < Math.floor(h / 3); fl++) for (let x = -w / 2 + 1.5; x < w / 2 - 0.5; x += 3) for (const s of [-1, 1]) g.add(box(0.35, 1.5, 0.08, 0x2f6b3a, x + s * 0.8, fl * 3 + 1.2, d / 2 + 0.05));
  return g;
}
/** A Citroën 2CV painted `body`, front on local +x: the round cabin over the body, the fenders, the rolled canvas roof, its bulging lamps. */
export function deuxCV(body = 0xd0d4d8) {
  const g = new THREE.Group(), S = rs(10, 6);
  g.add(box(3.6, 0.55, 1.45, body, 0, 0.62, 0));
  const hood = box(1.2, 0.45, 1.25, body, 1.35, 0.98, 0); hood.rotation.z = -0.3; g.add(hood);
  const cab = sph(1, body, -0.35, 1.0, 0, S); cab.scale.set(1.45, 0.72, 0.74); g.add(cab);
  g.add(box(0.06, 0.42, 1.2, 0x223344, 0.55, 1.35, 0)); g.add(box(1.5, 0.05, 0.9, 0x333333, -0.45, 1.73, 0));
  [[-1.25, 1], [1.2, 1], [-1.25, -1], [1.2, -1]].forEach(([x, s]) => { g.add(box(1.1, 0.35, 0.3, body, x, 0.75, s * 0.72)); const w = cyl(0.34, 0.34, 0.22, 0x1a1a1a, x, 0.34, s * 0.7, S); w.rotation.x = Math.PI / 2; g.add(w); });
  [-0.45, 0.45].forEach(z => g.add(sph(0.14, 0xe8e2c8, 1.85, 1.0, z, 6))); g.add(box(0.05, 0.3, 0.6, 0x9a9a9a, 1.9, 0.75, 0));
  return g;
}
/** A bistro table with two cane chairs. */
export function bistroSet() {
  const g = new THREE.Group(), S = rs(10, 6);
  g.add(cyl(0.38, 0.38, 0.05, 0xece6da, 0, 0.74, 0, S)); g.add(cyl(0.04, 0.04, 0.72, 0x333333, 0, 0.37, 0, 5)); g.add(cyl(0.22, 0.22, 0.04, 0x333333, 0, 0.02, 0, S));
  [-1, 1].forEach(s => { g.add(box(0.42, 0.05, 0.42, 0xc9a56a, s * 0.65, 0.46, 0)); g.add(box(0.05, 0.45, 0.42, 0x8b5a2b, s * 0.86, 0.7, 0)); [-0.17, 0.17].forEach(z => g.add(box(0.04, 0.46, 0.04, 0x8b5a2b, s * 0.48, 0.23, z))); });
  return g;
}
/** The painters' red parasol of the place du Tertre, over a table. */
export function parasolProp() { const g = new THREE.Group(); g.add(cyl(0.04, 0.04, 2.6, 0x555555, 0, 1.3, 0, 5)); g.add(cone(1.6, 0.6, 0xc8102e, 0, 2.5, 0, rs(10, 6))); g.add(sph(0.08, 0xf6f1e4, 0, 2.85, 0, 5)); return g; }
/** A painter's easel and its canvas (the painter is a figure of the crowd). */
export function easelProp() {
  const g = new THREE.Group();
  [[-0.4, 0.25], [0.4, 0.25], [0, -0.45]].forEach(([lx, lz]) => { const l = cyl(0.025, 0.025, 1.9, 0x8b5a2b, lx * 0.55, 0.95, lz * 0.55, 4); l.rotation.set(lz * 0.5, 0, -lx * 0.45); g.add(l); });
  g.add(box(0.9, 0.7, 0.04, pick([0xe36f8a, 0x9fd0e8, 0xf2c14e, 0x5d9a4a, 0xf6f1e4]), 0, 1.3, 0.12)); g.add(box(0.3, 0.2, 0.04, pick([0x8a5fc8, 0xd95f5f, 0x2a7fd4]), 0.1, 1.25, 0.15));
  return g;
}
/** A vine stock on its post, a few bunches of grapes. */
export function vineStock() { const g = new THREE.Group(); g.add(cyl(0.05, 0.05, 1.6, 0x6b4a2b, 0, 0.8, 0, 4)); g.add(cone(0.55, 1.3, 0x4f8f3f, 0, 1.45, 0, rs(7, 5))); if (rs(1, 0)) [[0.3, 0.2], [-0.25, -0.3]].forEach(([x, z]) => g.add(sph(0.12, 0x5a2a6a, x, 1.0, z, 5))); return g; }
/** A pigeon pecking. */
export function pigeonProp() { const g = new THREE.Group(); g.add(sph(0.22, 0x8a8a92, 0, 0.22, 0, 6)); g.add(sph(0.12, 0x6a6a74, 0.2, 0.42, 0, 5)); g.add(cone(0.04, 0.12, 0xe0a030, 0.33, 0.4, 0, 4).rotateZ(-Math.PI / 2)); return g; }

// ---------- Merged pieces ----------
/** The butte under the basilica, in world units: a radial grid of grass whose height follows butteY. */
export function butteMesh(grass) {
  const rings = rs(26, 14), segs = rs(56, 28), p = [], uv = [], ix = [];
  const radius = k => (k === 0 ? 0 : k === 1 ? BUTTE.plateau * 0.6 : BUTTE.plateau + (BUTTE.rim - BUTTE.plateau) * (k - 2) / (rings - 2));
  for (let k = 0; k <= rings; k++) for (let j = 0; j <= segs; j++) { const a = j / segs * Math.PI * 2, r = radius(k), x = BUTTE.x + Math.cos(a) * r, z = BUTTE.z + Math.sin(a) * r; p.push(x, butteY(x, z), z); uv.push(x / 11.43, z / 11.43); }
  for (let k = 0; k < rings; k++) for (let j = 0; j < segs; j++) { const a = k * (segs + 1) + j, b = a + segs + 1; ix.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals();
  const m = new THREE.Mesh(g, grass); m.receiveShadow = true; m.name = 'montmartre:butte';
  return m;
}
/** A cobbled square w x d (world metres) centred on (cx, cz) whose cobbles follow the ground under them, a few centimetres up. */
export function cobbleSquare(w, d, cx, cz) {
  const geo = new THREE.PlaneGeometry(w, d, Math.ceil(w / 10), Math.ceil(d / 10)); geo.rotateX(-Math.PI / 2); geo.translate(cx, 0, cz);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, yAt(x, z) + 0.06); uv.setXY(i, x / 8, z / 8); }
  geo.computeVertexNormals();
  const cs = surface('cobble'), m = new THREE.Mesh(geo, disposable(new THREE.MeshStandardMaterial({ map: cs.map, normalMap: cs.normalMap, color: 0xb8b0a4, roughness: 1 })));
  m.receiveShadow = true; m.name = 'montmartre:place-du-tertre';
  return m;
}
/** The rue Foyatier: a flight of steps `run` metres per step from radius r0 down to r1 along angle a of the butte, handrail down the middle; world units, merged. */
export function foyatier(r0, r1, a, run = 0.9) {
  return merged(g => {
    const dir = Math.atan2(-Math.sin(a), -Math.cos(a));
    for (let r = r1; r <= r0; r += run) { const p = onButte(r, a), y = butteY(p.x, p.z); const st = box(7, 0.9, run + 0.05, 0xbfb398, 0, 0, 0); st.position.set(p.x, y - 0.3, p.z); st.rotation.y = dir; g.add(st); }
    for (let r = r1; r < r0; r += 6) { const p = onButte(r + 3, a), y = butteY(p.x, p.z); const rail = box(0.08, 0.08, 6.2, 0x2f3a3a, 0, 0, 0); rail.position.set(p.x, y + 1.1, p.z); rail.rotation.order = 'YXZ'; rail.rotation.y = dir; const lo = onButte(r + 6, a), hi = onButte(r, a); rail.rotation.x = Math.atan2(butteY(hi.x, hi.z) - butteY(lo.x, lo.z), 6); g.add(rail); g.add(cyl(0.04, 0.04, 1.1, 0x2f3a3a, p.x, y + 0.55, p.z, 4)); }
  });
}
/** A funicular station: a small pavilion of glass and iron with its sign, front on local +z. */
export function station(top) {
  return merged(g => { g.add(box(7, 4.2, 5, 0xe8e2d6, 0, 2.1, 0)); g.add(box(7.6, 0.4, 5.6, 0x2f3a3a, 0, 4.4, 0)); g.add(box(4, 2.6, 0.1, 0x334a66, 0, 1.8, 2.55)); const sg = textPlane(4.2, 0.8, top ? 'SACRÉ-CŒUR' : 'FUNICULAIRE', '#2f3a3a', '#f2c14e', 64); sg.position.set(0, 3.6, 2.6); g.add(sg); });
}
/** Au Lapin Agile: the pink cabaret with green shutters, its tiled roof, the painted rabbit sign, the low garden wall and its acacia. Front on local +z; merged. */
export function lapinAgile() {
  const g = merged(p => {
    p.add(box(12, 6.5, 8, 0xe8a7b0, 0, 3.25, 0)); p.add(box(12.4, 0.5, 8.4, 0xd99aa4, 0, 0.25, 0));
    const roof = gable(13, 9, 3.2, 0xa0523d); roof.position.y = 6.5; p.add(roof); p.add(box(1, 2.4, 1, 0x8a6a5a, -3.5, 9.4, 0));
    for (const x of [-4, -1.3, 1.3, 4]) for (const y of [1.6, 4.6]) { p.add(box(0.9, 1.4, 0.08, 0x334a66, x, y, 4.04)); [-1, 1].forEach(s => p.add(box(0.45, 1.5, 0.1, 0x2f6b3a, x + s * 0.72, y, 4.06))); }
    p.add(box(1.3, 2.3, 0.1, 0x2f6b3a, 0, 1.15, 4.06));
    const sg = textPlane(6, 0.9, 'AU LAPIN AGILE', '#e8a7b0', '#2f3a3a', 70); sg.position.set(0, 6.0, 4.1); p.add(sg);
    const rabbit = textPlane(2.2, 1.6, 'CABARET', '#2f6b3a', '#f6f1e4', 80); rabbit.position.set(6.3, 3.4, 2); rabbit.rotation.y = Math.PI / 2; p.add(rabbit); p.add(box(0.1, 0.1, 1.4, 0x2f3a3a, 6.1, 4.3, 2));
    p.add(box(14, 1.2, 0.5, 0xbfb398, 2, 0.6, 7)); p.add(box(0.5, 1.2, 6, 0xbfb398, 9, 0.6, 4));
    p.add(cyl(0.3, 0.4, 3.5, 0x6b4a2b, 7, 1.75, 6, 6)); p.add(sph(2.6, 0x5d9a4a, 7, 5, 6, rs(12, 7))); p.add(sph(1.8, 0x6fab55, 8, 6.2, 5, rs(10, 6)));
  });
  g.name = 'montmartre:lapin-agile';
  return g;
}
/** Le Mur des je t'aime: a wall of dark blue enamel tiles written over in white, in a little square garden. Front on local +z; merged. */
export function murJeTaime() {
  const g = merged(p => {
    p.add(box(14, 4.2, 0.5, 0x1d2a5a, 0, 2.1, 0)); p.add(box(14.4, 0.3, 0.7, 0xd9cfb8, 0, 4.35, 0));
    ["JE T'AIME", 'I LOVE YOU', 'TI AMO', 'TE QUIERO', 'ICH LIEBE DICH'].forEach((t, i) => { const s = textPlane(4.4, 0.7, t, '#1d2a5a', '#f6f1e4', 64); s.position.set(-4.4 + (i % 3) * 4.4, 3.4 - Math.floor(i / 3) * 1.1 - (i % 2) * 0.35, 0.27); p.add(s); });
    const r = textPlane(1.2, 0.8, '♥', '#1d2a5a', '#c8102e', 120); r.position.set(4.6, 1.2, 0.27); p.add(r);
    [-7.5, 7.5].forEach(x => p.add(box(0.5, 1, 6, 0x2f3a3a, x, 0.5, 3)));
  });
  g.name = 'montmartre:mur-je-taime';
  return g;
}
/** A café's front on a square: the awning in its colour, the sign, the posts; the tables are instanced in front of it (local +z). Merged. */
export function terraceFront(name, color, w) {
  return merged(p => {
    p.add(box(w, 4.2, 0.4, 0xf3ead6, 0, 2.1, -0.2)); p.add(box(w - 2, 2.4, 0.06, 0x223344, 0, 1.5, 0.02));
    const aw = box(w, 0.15, 2.6, color, 0, 3.3, 1.2); aw.rotation.x = 0.3; p.add(aw); [-w / 2, w / 2].forEach(x => p.add(cyl(0.05, 0.05, 3.2, 0x555555, x, 1.6, 2.4, 5)));
    const sg = textPlane(w - 1, 0.9, name, hex(color), '#fffaf0', 64); sg.position.set(0, 3.9, 0.05); p.add(sg);
  });
}
/** A figure of the crowd at (x, z) on `scene`, bobbing at height `base` above what it stands on; `world` pieces stand at `base` already. */
export function walker(scene, x, z, { rotY = rand(0, 6.28), hat = null, amp = 0.08, base = 0, world = false, coat = null } = {}) {
  const f = figure(coat ?? pick(JACKETS), pick(SKINS), hat); f.position.set(x, world ? base : 0, z); f.rotation.y = rotY; scene.add(f);
  G.crowd.push({ g: f, ph: rand(0, 6.28), amp, base });
  return f;
}
