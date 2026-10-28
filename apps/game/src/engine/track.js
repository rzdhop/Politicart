// Track construction: the road, its features and the decor around it.
//
// buildTrack samples the circuit's spline into G.samples / G.N and then lays
// down the road, the kerbs, the item boxes, the features (ramps, pits, dash
// pads, crossings, chicanes), the crowd and the circuit-specific scenery.
//
// **Order matters inside this module and cannot be rearranged:** textures()
// runs first so every builder can read TEX.*, and G.samples / G.N are set
// before buildFeatures, crowdZone, grandstand and adBoard read them. The
// builders also register into G.animated, G.crowd, G.itemBoxes, G.ramps,
// G.pits, G.pads and G.crossings as a side effect of building, which is how
// the physics step later finds them.
import * as THREE from 'three';

import { getCustom } from './custom.js';
import { box, canvasTexture, cone, cyl, imgPlane, mat, plane, sph, tag, textPlane, torus } from './primitives.js';
import { buildCyclists } from './cyclists.js';
import { bakeVertexColours, finishOf, mergeByMaterial, mergeInWorld } from './geo.js';
import { CFG, G, getPoly, isClear, seg } from './state.js';
import { TEX, textures } from './textures.js';
import { hex, pick, rand } from './util.js';

// ---------- "Légers": still decor in fewer draws (PLAN 4.2) ----------
// The decor is built part by part, one mesh and so one draw call each: a
// plane tree is five, a figure three to seven, a parked sedan ten. On
// "légers" the pieces that never move inside themselves are folded after
// the build: every lit, untextured part takes its colour as a vertex colour
// on one shared material of the same finish, then each piece is merged into
// one mesh per material (geo.js). Same triangles, same colours, same
// finishes, so the same picture in fewer draws. A piece that moves as a
// whole (a figure that bobs, a cyclist) keeps its own transform; a crowd
// figure inside a still piece (a café's waiter) stays apart and bobs on.
// Still meshes standing alone (chimneys, roofs, rails, lamp posts) are
// merged with their neighbours of the same material, cell by cell, so the
// frustum still culls them in blocks. Builders mark what is still with
// still(); "détaillés" draws everything as before.
let STILL = [];
/** Mark decor that never moves inside itself (a group, or a mesh standing alone) for the "légers" fold; returns it. */
const still = o => { STILL.push(o); return o; };
/** The side of the cells still loose meshes are merged by, in metres. */
const CELL = 60;
function foldStill(scene) {
  const marked = new Set(STILL), crowd = new Set(G.crowd.map(c => c.g)), cells = new Map(), v = new THREE.Vector3();
  const under = o => { for (let p = o.parent; p; p = p.parent) if (marked.has(p)) return true; return false; };
  scene.updateMatrixWorld(true);
  for (const o of STILL) {
    if (under(o) || !o.parent) continue;   // its marked ancestor folds it
    bakeVertexColours(o, finishOf);
    if (!o.isMesh) { mergeByMaterial(o, c => crowd.has(c)); continue; }
    if (o.children.length || !o.visible) continue;
    const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    v.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld);
    const key = Math.floor(v.x / CELL) + ',' + Math.floor(v.z / CELL) + '|' + o.material.uuid + '|' + o.castShadow + '|' + o.receiveShadow + '|' + o.renderOrder;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(o);
  }
  for (const meshes of cells.values()) {
    if (meshes.length < 2) continue;
    scene.add(mergeInWorld(meshes));
    for (const m of meshes) m.parent.remove(m);
  }
  STILL = [];
}

// ---------- Small figures (crowd, guards, press) ----------
const JACKETS = [0x3b4a6b, 0x8a2b2b, 0x2e7d5b, 0xe0b040, 0x5a5a5a, 0xd96c3a, 0x4b3f8a, 0xf0f0f0, 0x222222, 0x9ad04f];
const SKINS = [0xf1c27d, 0xe8b48a, 0xc68642, 0x8d5524, 0xf5d6c6, 0xd9a577];
function figure(color, skin, hat) {
  const g = new THREE.Group(); const S = Math.max(6, seg() / 2);
  g.add(cyl(0.32, 0.36, 1.1, color, 0, 0.95, 0, S)); g.add(sph(0.28, skin, 0, 1.78, 0, S));
  g.add(box(0.5, 0.5, 0.4, 0x2b2b35, 0, 0.3, 0));
  if (hat === 'guard') { g.add(cyl(0.3, 0.3, 0.3, 0xd4af37, 0, 2.08, 0, S)); const pl = cyl(0.08, 0.14, 0.7, 0xc8102e, 0, 2.5, 0, 6); g.add(pl); g.add(box(0.74, 0.12, 0.5, 0xffffff, 0, 1.0, 0)); g.add(cyl(0.03, 0.03, 1.4, 0xdddddd, 0.45, 1.4, 0.2, 5)); }
  if (hat === 'press') { g.add(box(0.36, 0.26, 0.3, 0x111111, 0, 1.3, 0.45)); g.add(cyl(0.1, 0.12, 0.3, 0x222222, 0, 1.3, 0.72, 8)); g.add(sph(0.08, 0xffffff, 0, 1.52, 0.5, 6)); }
  if (hat === 'sign') { const s = textPlane(0.9, 0.5, pick(['VOTEZ', 'NON !', 'OUI !', 'RÉFORME', 'PLUS VITE', 'DÉMISSION', 'BRAVO']), pick(['#f6f1e4', '#f2c14e', '#c8102e']), '#111', 90); s.position.set(0.5, 2.2, 0); g.add(s); g.add(cyl(0.03, 0.03, 1.2, 0x8b5a2b, 0.5, 1.5, 0, 5)); }
  if (hat === 'flag') { g.add(cyl(0.03, 0.03, 2, 0xdddddd, 0.5, 1.8, 0, 5)); [0x2f55c7, 0xffffff, 0xe63946].forEach((c, i) => g.add(box(0.3, 0.5, 0.03, c, 0.65 + i * 0.3, 2.5, 0))); }
  return still(g);   // a crowd figure bobs as a whole: still inside
}
function crowdZone(scene, from, to, sideSign, dense) {
  const hw = CFG.roadHalfWidth, N = G.N;
  // metal rail
  for (let i = from; i < to; i += 2) { const s = G.samples[i % N]; const n = G.samples[(i + 2) % N]; const dx = (n.x + n.sx * sideSign * (hw + 1.9)) - (s.x + s.sx * sideSign * (hw + 1.9)), dz = (n.z + n.sz * sideSign * (hw + 1.9)) - (s.z + s.sz * sideSign * (hw + 1.9)); const len = Math.hypot(dx, dz); const r = box(0.06, 0.06, len, 0x9a9a9a, 0, 1.0, 0); r.position.set(s.x + s.sx * sideSign * (hw + 1.9) + dx / 2, 1.0, s.z + s.sz * sideSign * (hw + 1.9) + dz / 2); r.rotation.y = Math.atan2(dx, dz); scene.add(still(r)); if (i % 6 === from % 6) scene.add(still(cyl(0.05, 0.05, 1.1, 0x9a9a9a, s.x + s.sx * sideSign * (hw + 1.9), 0.55, s.z + s.sz * sideSign * (hw + 1.9), 5))); }
  for (let i = from; i < to; i += dense ? 3 : 5) {
    const s = G.samples[i % N]; const n = dense ? 3 : 2;
    for (let j = 0; j < n; j++) { const lat = sideSign * (hw + 2.8 + j * 1.1 + rand(-0.3, 0.3)); const f = figure(pick(JACKETS), pick(SKINS), Math.random() < 0.18 ? 'sign' : Math.random() < 0.12 ? 'flag' : null); f.position.set(s.x + s.sx * lat + s.tx * rand(-0.8, 0.8), 0, s.z + s.sz * lat + s.tz * rand(-0.8, 0.8)); f.rotation.y = Math.atan2(-s.sx * sideSign, -s.sz * sideSign) + rand(-0.4, 0.4); scene.add(f); G.crowd.push({ g: f, ph: rand(0, 6.28), amp: Math.random() < 0.5 ? 0.25 : 0, base: 0 }); }
  }
}
function grandstand(scene, idx, sideSign) {
  const s = G.samples[idx]; const hw = CFG.roadHalfWidth; const g = new THREE.Group();
  for (let t = 0; t < 4; t++) { g.add(box(26, 1.2, 2.4, 0x6a6f7a, 0, 0.6 + t * 1.3, 2 + t * 2.4)); for (let x = -11; x <= 11; x += 2.2) { const f = figure(pick(JACKETS), pick(SKINS), Math.random() < 0.2 ? 'flag' : null); f.scale.setScalar(0.85); f.position.set(x + rand(-0.3, 0.3), 1.2 + t * 1.3, 2.2 + t * 2.4); f.rotation.y = Math.PI; g.add(f); G.crowd.push({ g: f, ph: rand(0, 6.28), amp: 0.2, base: f.position.y }); } }
  g.add(box(28, 0.4, 11, 0x1f3a93, 0, 7.5, 6)); [-13, 13].forEach(x => { g.add(cyl(0.2, 0.2, 7.5, 0x555555, x, 3.75, 1)); g.add(cyl(0.2, 0.2, 7.5, 0x555555, x, 3.75, 11)); });
  const ban = textPlane(26, 2.2, 'TRIBUNE OFFICIELLE', '#1f3a93', '#f6f1e4', 64); ban.position.set(0, 6.3, 0.9); g.add(ban);
  g.position.set(s.x + s.sx * sideSign * (hw + 3), 0, s.z + s.sz * sideSign * (hw + 3)); g.rotation.y = Math.atan2(s.sx * sideSign, s.sz * sideSign); scene.add(still(g));
}
function adBoard(scene, idx, sideSign, text, bg, fg, img) {
  const s = G.samples[idx]; const hw = CFG.roadHalfWidth; const g = new THREE.Group();
  g.add(cyl(0.12, 0.12, 3, 0x444444, -2.6, 1.5, 0, 6)); g.add(cyl(0.12, 0.12, 3, 0x444444, 2.6, 1.5, 0, 6));
  const p = img ? imgPlane(6, 2, img) : textPlane(6, 2, text, bg, fg, 56); p.position.set(0, 3.8, 0); g.add(p); g.add(box(6.2, 2.2, 0.1, 0x222222, 0, 3.8, -0.08));
  g.position.set(s.x + s.sx * sideSign * (hw + 4.5), 0, s.z + s.sz * sideSign * (hw + 4.5)); g.rotation.y = Math.atan2(-s.sx * sideSign, -s.sz * sideSign); scene.add(still(g));
}
const ADS = [['VOTEZ UTILE', '#1f3a93', '#f6f1e4'], ['SONDAGE : 52 % D’INDÉCIS', '#f6f1e4', '#111'], ['RÉFORME EN COURS', '#c8102e', '#fff'], ['ENGAGEMENT N°12 : ROULER', '#f2c14e', '#111'], ['DÉBAT CE SOIR 21H', '#111', '#f2c14e'], ['LA RÉPUBLIQUE ROULE', '#2f55c7', '#fff'], ['GRAND PRIX DE L’HÉMICYCLE', '#f6f1e4', '#c8102e'], ['AMENDEMENT 49.3', '#5c1a33', '#f6f1e4']];

// ---------- Decor builders ----------
function tree(scene, x, z, kind) {
  const g = new THREE.Group(); const S = seg();
  if (kind === 'plane') { g.add(cyl(0.4, 0.55, 7, 0x9a9282, 0, 3.5, 0, 8)); g.add(sph(3.2, 0x5d9a4a, 0, 8.5, 0, S)); g.add(sph(2.2, 0x6fab55, 1.8, 9.5, 0.8, S)); g.add(sph(2.0, 0x4f8a40, -1.6, 9.2, -0.9, S)); g.add(sph(1.8, 0x6fab55, 0.3, 11, 0, S)); }
  else if (kind === 'cypress') { g.add(cyl(0.2, 0.3, 1.5, 0x6b4a2b, 0, 0.75, 0, 6)); const c = cone(1.1, 7, 0x2f5f32, 0, 4.5, 0, S); g.add(c); }
  else if (kind === 'topiary') { g.add(cyl(0.18, 0.22, 1.2, 0x6b4a2b, 0, 0.6, 0, 6)); g.add(cone(1.0, 2.6, 0x2f6b3a, 0, 2.5, 0, S)); }
  else if (kind === 'orange') { g.add(box(1.6, 1.4, 1.6, 0x2f6b3a, 0, 0.7, 0)); g.add(box(1.7, 0.15, 1.7, 0xf6f1e4, 0, 1.4, 0)); g.add(cyl(0.12, 0.14, 1.2, 0x6b4a2b, 0, 2.0, 0, 6)); g.add(sph(1.1, 0x3f8a3a, 0, 3.2, 0, S)); for (let i = 0; i < 6; i++) g.add(sph(0.12, 0xff8c1a, rand(-0.8, 0.8), 3.2 + rand(-0.6, 0.6), rand(-0.8, 0.8), 6)); }
  else if (kind === 'palm') { const t = cyl(0.22, 0.34, 9, 0x8a6a42, 0, 4.5, 0, 7); t.rotation.z = rand(-0.08, 0.08); g.add(t); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const f = box(0.5, 0.12, 4.2, i % 2 ? 0x3f8a3a : 0x4fa044, 0, 0, 0); f.position.set(Math.sin(a) * 1.6, 8.6, Math.cos(a) * 1.6); f.rotation.order = 'YXZ'; f.rotation.y = a; f.rotation.x = 0.55; g.add(f); } g.add(sph(0.5, 0x6b4a2b, 0, 8.8, 0, 6)); }
  else { g.add(cyl(0.35, 0.5, 3, 0x6b4a2b, 0, 1.5, 0, 8)); g.add(sph(2.4, 0x3f8a3a, 0, 4.6, 0, S)); g.add(sph(1.6, 0x4fa044, 1.2, 5.6, 0.6, S)); g.add(sph(1.5, 0x3a7f35, -1.1, 5.4, -0.5, S)); }
  g.position.set(x, 0, z); g.scale.setScalar(rand(0.85, 1.25)); scene.add(still(g));
}
/** The lamps' and the sedans' lights: unlit, one material each for every lamp and car (they never change). */
let LAMP_MAT = null, HEADLIGHT_MAT = null;
const lampMat = () => LAMP_MAT || (LAMP_MAT = new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
const headlightMat = () => HEADLIGHT_MAT || (HEADLIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0xfff1b0 }));
function lamp(scene, x, z, style) { if (style === 'paris') { scene.add(still(cyl(0.14, 0.22, 6, 0x2f3a3a, x, 3, z, 8))); scene.add(still(box(0.7, 0.9, 0.7, 0x2f3a3a, x, 6.4, z))); const l = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.55), lampMat()); l.position.set(x, 6.4, z); scene.add(still(l)); } else { scene.add(still(cyl(0.12, 0.18, 6, 0x2f3a44, x, 3, z, 6))); const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampMat()); l.position.set(x, 6.2, z); scene.add(still(l)); } }
function flagPole(scene, x, z, colors, h) { h = h || 9; scene.add(still(cyl(0.1, 0.12, h, 0xdddddd, x, h / 2, z, 6))); colors.forEach((c, i) => scene.add(still(box(1.2, 2.2, 0.06, c, x + 0.6 + i * 1.2, h - 1.2, z)))); }
function sedan(scene, x, z, rotY, color, taxi) {
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
// ---------- Track features: ramps, pits, dash pads, crossings, chicanes ----------
function rampTex() { if (!TEX.ramp) { TEX.ramp = canvasTexture(256, 256, (c, w, h) => { c.fillStyle = '#f2c14e'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; for (let y = -64; y < h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w / 2, y + 40); c.lineTo(w, y); c.lineTo(w, y + 28); c.lineTo(w / 2, y + 68); c.lineTo(0, y + 28); c.closePath(); c.fill(); } }); TEX.ramp.wrapS = TEX.ramp.wrapT = THREE.RepeatWrapping; TEX.ramp.repeat.set(1, 3); } return TEX.ramp; }
function padTex() { if (!TEX.pad) { TEX.pad = canvasTexture(256, 256, (c, w, h) => { c.fillStyle = '#1f3a93'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2c14e'; for (let y = 20; y < h; y += 80) { c.beginPath(); c.moveTo(20, y + 50); c.lineTo(w / 2, y); c.lineTo(w - 20, y + 50); c.lineTo(w - 20, y + 30); c.lineTo(w / 2, y - 20); c.lineTo(20, y + 30); c.closePath(); c.fill(); } }); } return TEX.pad; }
function buildFeatures(scene, track) {
  G.ramps = []; G.pits = []; G.pads = []; G.crossings = [];
  const N = G.N, hw = CFG.roadHalfWidth;
  for (const f of track.features || []) {
    const i0 = Math.floor(f.f * N); const a = G.samples[i0];
    if (f.t === 'ramp') {
      const len = f.len || 10, h = f.h || 3.4; const b = G.samples[(i0 + len) % N]; const L = Math.hypot(b.x - a.x, b.z - a.z); const slope = Math.atan2(h, L);
      G.ramps.push({ i0, len, h, slope, L });
      const g = new THREE.Group(); g.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2); g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      const plank = tag(new THREE.Mesh(new THREE.BoxGeometry(hw * 2 - 1, 0.4, L / Math.cos(slope)), new THREE.MeshStandardMaterial({ map: rampTex(), roughness: 0.8 }))); plank.position.y = h / 2 - 0.1; plank.rotation.x = -slope; g.add(plank);
      [-hw + 0.5, hw - 0.5].forEach(x => { const sk = box(0.3, h, L, 0xc8102e, x, h / 2 - 0.05, 0); const sl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, L / Math.cos(slope)), mat(0xf6f1e4)); sl.position.set(x, h / 2 + 0.1, 0); sl.rotation.x = -slope; g.add(sl); g.add(sk); });
      g.add(box(hw * 2 - 1, h, 0.5, 0xc8102e, 0, h / 2, L / 2 - 0.25)); scene.add(g);
    } else if (f.t === 'pit') {
      const len = f.len || 9; const b = G.samples[(i0 + len) % N]; const L = Math.hypot(b.x - a.x, b.z - a.z); G.pits.push({ i0, len, kind: f.kind });
      const g = new THREE.Group(); g.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2); g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      if (f.kind === 'water') { const w = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 1, L), new THREE.MeshStandardMaterial({ map: TEX.water, roughness: 0.15, metalness: 0.3 })); w.rotation.x = -Math.PI / 2; w.position.y = 0.12; g.add(w); [-hw - 0.3, hw + 0.3].forEach(x => g.add(box(0.6, 0.5, L, 0xd9cfb8, x, 0.25, 0))); G.animated.push(dt => { w.material.map.offset.y += dt * 0.05; }); }
      else if (f.kind === 'works') { const t = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, L), mat(0x4a3b2a)); t.rotation.x = -Math.PI / 2; t.position.y = 0.09; g.add(t); for (let z = -L / 2 + 1; z < L / 2; z += 3) { [-hw + 1, hw - 1].forEach(x => { g.add(cone(0.45, 1.1, 0xff6a00, x, 0.55, z, 8)); g.add(box(0.9, 0.06, 0.9, 0x222222, x, 0.06, z)); }); } g.add(box(hw * 2, 0.4, 0.4, 0xe0a030, 0, 0.5, -L / 2)); const sg = textPlane(4, 1.2, 'TRAVAUX', '#f2c14e', '#111', 90); sg.position.set(hw + 2.4, 2.4, -L / 2 - 1); g.add(sg); g.add(cyl(0.06, 0.06, 2, 0x555555, hw + 2.4, 1, -L / 2 - 1, 5)); for (let i = 0; i < 3; i++) { const wk = figure(0xff6a00, pick(SKINS), null); wk.position.set(rand(-4, 4), 0, rand(-L / 2 + 2, L / 2 - 2)); wk.rotation.y = rand(0, 6); g.add(wk); G.crowd.push({ g: wk, ph: rand(0, 6), amp: 0.08, base: 0 }); } }
      else if (f.kind === 'manif') { for (let i = 0; i < 16; i++) { const m = figure(pick(JACKETS), pick(SKINS), i % 3 === 0 ? 'sign' : i % 4 === 1 ? 'flag' : null); m.position.set(rand(-hw + 1.5, hw - 1.5), 0, rand(-L / 2 + 1.5, L / 2 - 1.5)); m.rotation.y = rand(0, 6); g.add(m); G.crowd.push({ g: m, ph: rand(0, 6), amp: 0.3, base: 0 }); } const ban = textPlane(hw * 2 - 2, 1.4, 'TOUS EN GRÈVE', '#c8102e', '#fff', 80); ban.position.set(0, 2.6, 0); g.add(ban); [-hw + 1, hw - 1].forEach(x => g.add(cyl(0.06, 0.06, 3.2, 0x8b5a2b, x, 1.6, 0, 5))); }
      scene.add(g);
    } else if (f.t === 'pad') {
      G.pads.push({ i0, len: 3 }); const b = G.samples[(i0 + 3) % N]; const L = Math.hypot(b.x - a.x, b.z - a.z);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 - 2, L), new THREE.MeshBasicMaterial({ map: padTex() })); p.rotation.x = -Math.PI / 2; p.position.set((a.x + b.x) / 2, 0.09, (a.z + b.z) / 2); p.rotation.z = -Math.atan2(b.x - a.x, b.z - a.z); scene.add(p);
      const holder = new THREE.Group(); holder.position.set((a.x + b.x) / 2, 0.09, (a.z + b.z) / 2); holder.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); p.position.set(0, 0, 0); p.rotation.z = 0; holder.add(p); scene.add(holder);
    } else if (f.t === 'crossing') {
      const yaw = Math.atan2(a.sx, a.sz); const car = sedan(scene, a.x, a.z, yaw, f.color || 0x111111, f.taxi);
      const street = new THREE.Mesh(new THREE.PlaneGeometry(14, 90), new THREE.MeshStandardMaterial({ map: TEX.asphalt, roughness: 1 })); street.rotation.x = -Math.PI / 2; const sh = new THREE.Group(); sh.position.set(a.x, 0.04, a.z); sh.rotation.y = yaw; sh.add(street); scene.add(sh);
      const sg = textPlane(3, 1, 'PRIORITÉ', '#fff', '#c8102e', 90); sg.position.set(a.x + a.sx * (hw + 2.5) + a.tx * 6, 2.4, a.z + a.sz * (hw + 2.5) + a.tz * 6); sg.rotation.y = Math.atan2(-a.tx, -a.tz); scene.add(sg);
      G.crossings.push({ s: a, mesh: car, t: rand(0, 20), range: 40, speed: f.speed || 14 });
    } else if (f.t === 'chicane') {
      // two blocks per gate on the wide road, so each gate still closes two thirds of it
      for (let j = 0; j < (f.n || 3); j++) for (const off of [4, 10]) { const s = G.samples[(i0 + j * 9) % N]; const lat = (j % 2 ? 1 : -1) * (hw - off); const x = s.x + s.sx * lat, z = s.z + s.sz * lat; const yaw = Math.atan2(s.tx, s.tz); const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw;
        if (f.kind === 'hedge') { g.add(box(7, 2.6, 2.4, 0x2f6b3a, 0, 1.3, 0)); g.add(box(7.2, 0.3, 2.6, 0x3a7f45, 0, 2.7, 0)); g.add(cone(1.0, 2.2, 0x2f6b3a, 0, 3.9, 0, 12)); }
        else { for (let b = -2.6; b <= 2.6; b += 2.6) { g.add(box(2.4, 0.08, 0.08, 0x9a9a9a, b, 1.05, 0)); g.add(box(2.4, 0.08, 0.08, 0x9a9a9a, b, 0.55, 0)); g.add(cyl(0.06, 0.06, 1.1, 0x9a9a9a, b - 1.2, 0.55, 0, 5)); g.add(cyl(0.06, 0.06, 1.1, 0x9a9a9a, b + 1.2, 0.55, 0, 5)); } g.add(box(7.8, 0.5, 0.06, 0xc8102e, 0, 0.8, 0.05)); [-3, 3].forEach(b => g.add(cone(0.4, 0.9, 0xff6a00, b, 0.45, 1.6, 8))); const gd = figure(0x1f2a5e, pick(SKINS), null); gd.position.set(3.2, 0, -1.2); g.add(gd); }
        scene.add(g); G.hazards.push({ type: 'obstacle', x, z, mesh: g, life: 1e9, r: f.kind === 'hedge' ? 4.3 : 4.2, stun: 0, owner: null });
      }
    }
  }
}
// A Haussmann block; `tint` multiplies the facade (ochre and pink in Marseille), `roofColor` swaps the zinc for tiles.
function building(scene, x, z, w, d, h, rotY, tint, roofColor) {
  const m = tag(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: TEX.facade.clone(), roughness: 0.9, color: tint || 0xffffff })));
  m.material.map.needsUpdate = true; m.material.map.repeat.set(Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(h / 9)));
  m.position.set(x, h / 2, z); m.rotation.y = rotY || 0; scene.add(m);
  const roof = box(w * 0.96, 2.6, d * 0.96, roofColor || 0x59606b, 0, h + 1.3, 0); roof.position.set(x, h + 1.3, z); roof.rotation.y = rotY || 0; scene.add(still(roof));
  for (let i = -w / 2 + 4; i < w / 2 - 2; i += 6) { const ch = box(0.9, 1.6, 0.9, 0x8a8a8a, 0, 0, 0); const a = (rotY || 0); ch.position.set(x + Math.cos(a) * i, h + 3.2, z - Math.sin(a) * i); scene.add(still(ch)); }
}
function palace(scene, x, z, w, h, d, rotY, roofColor) {
  const g = new THREE.Group();
  const body = tag(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: TEX.palace.clone(), roughness: 0.9 }))); body.material.map.needsUpdate = true; body.material.map.repeat.set(Math.round(w / 10), Math.round(h / 10)); body.position.y = h / 2; g.add(body);
  g.add(box(w + 1, 1.4, d + 1, 0xd9cfb8, 0, h + 0.7, 0));
  const roof = box(w - 2, 4, d - 3, roofColor || 0x4a4f5a, 0, h + 3.4, 0); g.add(roof);
  const central = box(w * 0.22, h + 6, d + 2, 0xeadfc8, 0, (h + 6) / 2, 0); g.add(central); g.add(box(w * 0.22 + 1, 1.2, d + 3, 0xd9cfb8, 0, h + 6.6, 0));
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.11, d + 3, 3, 1), mat(0xe8dcc0)); ped.rotation.z = Math.PI / 2; ped.scale.set(1, 1, 0.45); ped.position.set(0, h + 8.5, 0); g.add(ped);
  for (let i = -3; i <= 3; i++) g.add(cyl(0.9, 1.0, h + 1, 0xf3ead6, i * (w * 0.22) / 7, (h + 1) / 2, d / 2 + 1.5, 10));
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(still(g)); return g;
}
function gate(scene, x, z, rotY, width) {
  const g = new THREE.Group();
  [-width / 2, width / 2].forEach(px => { g.add(box(2.2, 7, 2.2, 0xd9cfb8, px, 3.5, 0)); g.add(sph(0.9, 0xd4af37, px, 7.8, 0, 12)); });
  for (let px = -width / 2 + 2.4; px < width / 2 - 2; px += 1.1) { g.add(cyl(0.07, 0.07, 5.5, 0x1a1a1a, px, 2.75, 0, 5)); g.add(cone(0.12, 0.4, 0xd4af37, px, 5.7, 0, 5)); }
  g.add(box(width - 4, 0.12, 0.12, 0x1a1a1a, 0, 1.2, 0)); g.add(box(width - 4, 0.12, 0.12, 0x1a1a1a, 0, 4.6, 0)); g.add(box(width - 4, 0.3, 0.3, 0xd4af37, 0, 3.0, 0));
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(still(g));
}
function obelisk(scene, x, z) { scene.add(still(box(6, 6, 6, 0x9a8f7a, x, 3, z))); scene.add(still(box(4, 1.5, 4, 0xb0a48c, x, 6.75, z))); const o = cyl(0.9, 1.8, 20, 0xc9a56a, x, 17.5, z, 4); o.rotation.y = Math.PI / 4; scene.add(still(o)); const t = cone(1.2, 2.5, 0xf2c14e, x, 28.7, z, 4); t.rotation.y = Math.PI / 4; scene.add(still(t)); }
function bridge(scene, x, z0, z1) {
  const len = z1 - z0; const cz = (z0 + z1) / 2;
  scene.add(box(30, 1.6, len, 0xd3c7ad, x, 5.2, cz)); [-15.5, 15.5].forEach(o => scene.add(box(1, 1.2, len, 0xbfb398, x + o, 6.6, cz)));
  for (let z = z0 + 8; z < z1; z += 14) { scene.add(box(30, 4.6, 3, 0xbfb398, x, 2.3, z)); const a = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 30, 20), mat(0xd3c7ad)); a.rotation.z = Math.PI / 2; a.position.set(x, 0.6, z + 7); scene.add(a); }
  for (let z = z0 + 4; z < z1; z += 14) { const l1 = cyl(0.14, 0.22, 5, 0x2f3a3a, x - 14, 8.5, z, 8); scene.add(l1); const l2 = l1.clone(); l2.position.x = x + 14; scene.add(l2); }
}
function bateau(scene) {
  const g = new THREE.Group(); g.add(box(26, 1.6, 7, 0xf6f1e4, 0, 1.0, 0)); g.add(box(20, 2.0, 6, 0x9fd0e8, -1, 2.8, 0)); g.add(box(21, 0.4, 6.4, 0xffffff, -1, 3.9, 0)); g.add(box(5, 2.2, 5, 0x1f3a93, 9, 2.9, 0));
  for (let x = -9; x <= 7; x += 2.2) for (let zz = -2; zz <= 2; zz += 2) { const f = figure(pick(JACKETS), pick(SKINS), null); f.scale.setScalar(0.7); f.position.set(x, 1.8, zz); g.add(f); }
  g.add(box(0.5, 0.5, 0.5, 0xc8102e, -12, 4.3, 0)); scene.add(g); G.animated.push(dt => { g.position.x += dt * 6; if (g.position.x > 420) g.position.x = -420; }); g.position.set(-200, 0, -165);
}
function fountain(scene, x, z, r, tiers, gold) {
  scene.add(cyl(r, r, 1.0, 0xd9cfb8, x, 0.5, z, 32)); const w = new THREE.Mesh(new THREE.CircleGeometry(r - 0.8, 32), new THREE.MeshStandardMaterial({ map: TEX.water, roughness: 0.2, metalness: 0.2 })); w.rotation.x = -Math.PI / 2; w.position.set(x, 1.02, z); scene.add(w);
  for (let t = 0; t < tiers; t++) { const rr = r * (0.42 - t * 0.12); scene.add(cyl(rr, rr * 1.1, 0.6, 0xd9cfb8, x, 1.3 + t * 2.2, z, 24)); scene.add(cyl(0.5, 0.7, 1.6, 0xd9cfb8, x, 2.4 + t * 2.2, z, 12)); }
  if (gold) { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; scene.add(sph(0.6, 0xd4af37, x + Math.cos(a) * (r * 0.55), 1.5, z + Math.sin(a) * (r * 0.55), 10)); } scene.add(box(2.2, 1.4, 1.4, 0xd4af37, x, 1.4 + tiers * 2.2 + 0.4, z)); }
  const jets = [];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const j = new THREE.Mesh(new THREE.ConeGeometry(0.35, 5, 6), new THREE.MeshStandardMaterial({ color: 0xcfe8f8, transparent: true, opacity: 0.75, roughness: 0.1 })); j.position.set(x + Math.cos(a) * (r * 0.6), 3.4, z + Math.sin(a) * (r * 0.6)); j.rotation.z = Math.cos(a) * 0.35; j.rotation.x = -Math.sin(a) * 0.35; scene.add(j); jets.push(j); }
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.6, 8, 8), new THREE.MeshStandardMaterial({ color: 0xcfe8f8, transparent: true, opacity: 0.75, roughness: 0.1 })); top.position.set(x, 1.3 + tiers * 2.2 + 4, z); scene.add(top); jets.push(top);
  G.animated.push(dt => { jets.forEach((j, i) => { j.scale.y = 0.9 + Math.sin(G.time * 5 + i) * 0.12; }); });
}
function hedgeWall(scene, x, z, w, d, h) { scene.add(still(box(w, h, d, 0x2f6b3a, x, h / 2, z))); scene.add(still(box(w + 0.2, 0.3, d + 0.2, 0x3a7f45, x, h + 0.1, z))); }
function statue(scene, x, z, rot) { scene.add(still(box(1.6, 2.2, 1.6, 0xcfc6b5, x, 1.1, z))); const f = figure(0xe8e2d6, 0xe8e2d6, null); f.position.set(x, 2.2, z); f.rotation.y = rot || 0; f.scale.setScalar(1.15); scene.add(f); }
function parterre(scene, x, z, w, d) { const p = plane(w, d, 0x4f8f3f, x, z); scene.add(p); const inner = plane(w - 3, d - 3, pick([0xe36f8a, 0xf2c14e, 0xd95f5f, 0xf0f0f0, 0x8a5fc8]), x, z); inner.position.y = 0.04; scene.add(inner); const edge = box(w, 0.6, 0.5, 0x2f6b3a, x, 0.3, z - d / 2); scene.add(edge); const e2 = edge.clone(); e2.position.z = z + d / 2; scene.add(e2); const e3 = box(0.5, 0.6, d, 0x2f6b3a, x - w / 2, 0.3, z); scene.add(e3); const e4 = e3.clone(); e4.position.x = x + w / 2; scene.add(e4); }
function kiosk(scene, x, z, color, signText, rotY) { const g = new THREE.Group(); g.add(box(5, 3.2, 4, 0xf3ead6, 0, 1.6, 0)); g.add(box(6, 0.4, 5, color, 0, 3.4, 0)); g.add(cone(3.4, 2.5, color, 0, 4.8, 0, 4)); const sign = textPlane(4.6, 1.15, signText, '#fffaf0', '#222', 60); sign.position.set(0, 2.6, 2.05); g.add(sign); g.add(box(5.2, 0.1, 1.6, color, 0, 2.2, 2.6)); g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(still(g)); }
function shopRow(scene, x0, x1, z, facing) {
  const names = [['BOULANGERIE', '#c8102e'], ['PHARMACIE', '#2e8b57'], ['CAFÉ DE LA PAIX', '#1f3a93'], ['TABAC · PRESSE', '#b8102e'], ['GALERIE', '#5c1a33'], ['CHOCOLATIER', '#6b4a2b'], ['FLEURISTE', '#e36f8a'], ['BRASSERIE', '#e0a030']];
  let i = 0;
  for (let x = x0; x < x1; x += 20) { building(scene, x + 10, z, 20, 14, 18, 0); const n = names[i++ % names.length]; const aw = box(18, 0.2, 2.6, parseInt(n[1].slice(1), 16), x + 10, 3.6, z + facing * 8.2); aw.rotation.x = facing * 0.25; scene.add(still(aw)); const sg = textPlane(10, 1.2, n[0], n[1], '#fffaf0', 70); sg.position.set(x + 10, 4.6, z + facing * 7.1); sg.rotation.y = facing > 0 ? 0 : Math.PI; scene.add(sg); const win = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshStandardMaterial({ color: 0x1e2a3a, roughness: 0.2, metalness: 0.5 })); win.position.set(x + 10, 1.6, z + facing * 7.05); win.rotation.y = facing > 0 ? 0 : Math.PI; scene.add(win); }
}
function pigeon(scene, x, z) { const g = new THREE.Group(); g.add(sph(0.22, 0x8a8a92, 0, 0.22, 0, 8)); g.add(sph(0.12, 0x6a6a74, 0.2, 0.42, 0, 6)); g.add(cone(0.04, 0.12, 0xe0a030, 0.33, 0.4, 0, 4)); g.position.set(x, 0, z); g.rotation.y = rand(0, 6.28); scene.add(still(g)); }
function bouquiniste(scene, x, z, rotY) { const g = new THREE.Group(); g.add(box(2.2, 1.1, 0.9, 0x2f5f32, 0, 1.4, 0)); g.add(box(2.3, 0.1, 1.0, 0x244a28, 0, 1.95, 0)); const lid = box(2.2, 0.08, 0.9, 0x2f5f32, 0, 2.3, -0.6); lid.rotation.x = -1.1; g.add(lid); for (let i = 0; i < 5; i++) g.add(box(0.3, 0.5, 0.7, pick([0xc8102e, 0xf2c14e, 0x1f3a93, 0xf6f1e4, 0x6b4a2b]), -0.8 + i * 0.4, 1.95 + 0.25, 0)); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(still(g)); }
// ---------- Street life shared by several circuits ----------
// Figure counts drop by half on 'low' detail (phones), big pieces stay.
const nOf = n => (getPoly() === 'high' ? n : Math.ceil(n / 2));
function person(scene, x, z, rotY, hat, amp) { const f = figure(pick(JACKETS), pick(SKINS), hat || null); f.position.set(x, 0, z); f.rotation.y = rotY ?? rand(0, 6.28); scene.add(f); G.crowd.push({ g: f, ph: rand(0, 6.28), amp: amp ?? 0.1, base: 0 }); return f; }
// A café terrace: round tables under parasols in front of an awning with the sign. Faces local +z.
function cafe(scene, x, z, rotY, name, color, tables) {
  const g = new THREE.Group(); const n = tables || 3, w = n * 3.2 + 1;
  for (let i = 0; i < n; i++) { const tx = (i - (n - 1) / 2) * 3.2; g.add(cyl(0.7, 0.7, 0.08, 0xf6f1e4, tx, 0.75, 0, 12)); g.add(cyl(0.06, 0.1, 0.75, 0x333333, tx, 0.37, 0, 6)); [-1, 1].forEach(s => { g.add(box(0.5, 0.06, 0.5, 0x8b5a2b, tx + s * 1.05, 0.45, 0.2)); g.add(box(0.06, 0.55, 0.5, 0x8b5a2b, tx + s * 1.3, 0.72, 0.2)); }); g.add(cyl(0.04, 0.04, 2.4, 0x555555, tx, 1.2, 0, 5)); g.add(cone(1.6, 0.6, color, tx, 2.5, 0, 10)); if (i % 2 === 0) { const f = figure(pick(JACKETS), pick(SKINS), null); f.scale.setScalar(0.8); f.position.set(tx - 1.05, -0.3, 0.3); f.rotation.y = -Math.PI / 2; g.add(f); } }
  const aw = box(w, 0.15, 2.0, color, 0, 3.2, -2.2); aw.rotation.x = 0.3; g.add(aw); [-w / 2, w / 2].forEach(px => g.add(cyl(0.05, 0.05, 3.6, 0x555555, px, 1.8, -3.2, 5)));
  const sg = textPlane(w - 0.6, 0.9, name, hex(color), '#fffaf0', 64); sg.position.set(0, 4.0, -3.1); g.add(sg);
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(still(g));
}
// A painter's easel with a canvas on it, and the painter at work behind it.
const CANVASES = [0xe36f8a, 0x9fd0e8, 0xf2c14e, 0x5d9a4a, 0xf6f1e4, 0x8a5fc8, 0xd95f5f];
function easel(scene, x, z, rotY) {
  const g = new THREE.Group();
  [[-0.4, 0.25], [0.4, 0.25], [0, -0.45]].forEach(([lx, lz]) => { const l = cyl(0.025, 0.025, 1.9, 0x8b5a2b, lx * 0.55, 0.95, lz * 0.55, 5); l.rotation.set(lz * 0.5, 0, -lx * 0.45); g.add(l); });
  g.add(box(0.9, 0.7, 0.04, pick(CANVASES), 0, 1.3, 0.12)); g.add(box(0.3, 0.2, 0.04, pick(CANVASES), rand(-0.2, 0.2), rand(1.1, 1.5), 0.15));
  const p = figure(pick(JACKETS), pick(SKINS), null); p.position.set(0, 0, -1.0); g.add(p); G.crowd.push({ g: p, ph: rand(0, 6.28), amp: 0.05, base: 0 });
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
}
// Two cabins on a sloped rail, going up and down in opposite directions. World coordinates.
function funicular(world, x, z0, z1, h) {
  const L = Math.hypot(z1 - z0, h), slope = Math.atan2(h, z1 - z0); const g = new THREE.Group(); g.position.set(x, 0, z0);
  [-1.5, 1.5].forEach(rx => { const r = box(0.25, 0.25, L, 0x555555, rx, h / 2 + 0.2, (z1 - z0) / 2); r.rotation.x = -slope; g.add(r); const b = box(0.4, 0.4, L, 0x9a9282, rx, h / 2 - 0.1, (z1 - z0) / 2); b.rotation.x = -slope; g.add(b); });
  const cab = () => { const c = new THREE.Group(); c.add(box(2.8, 2.6, 3.4, 0xf2c14e, 0, 1.6, 0)); c.add(box(2.9, 1.0, 3.5, 0x223344, 0, 1.9, 0)); c.add(box(2.6, 0.2, 3.2, 0x8a8a8a, 0, 2.95, 0)); return c; };
  const a = cab(), b = cab(); g.add(a); g.add(b); world.add(g);
  let t = 0, dir = 1;
  G.animated.push(dt => { t += dt * 0.06 * dir; if (t > 1) { t = 1; dir = -1; } if (t < 0) { t = 0; dir = 1; } a.position.set(-1.5, t * h + 0.3, t * (z1 - z0)); b.position.set(1.5, (1 - t) * h + 0.3, (1 - t) * (z1 - z0)); });
}
// A fairground carousel: eight horses on poles under a striped roof, turning slowly.
function carousel(scene, x, z) {
  const g = new THREE.Group(); g.add(cyl(5.2, 5.4, 0.4, 0xc8102e, 0, 0.2, 0, 24)); g.add(cyl(0.25, 0.25, 5.5, 0xd4af37, 0, 3, 0, 8)); g.add(cone(6.2, 2.4, 0xf6f1e4, 0, 6.6, 0, 12)); g.add(cyl(6.2, 6.2, 0.5, 0xc8102e, 0, 5.4, 0, 12)); g.add(sph(0.5, 0xd4af37, 0, 8.0, 0, 8));
  const spin = new THREE.Group(); g.add(spin);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, hx = Math.cos(a) * 3.8, hz = Math.sin(a) * 3.8; spin.add(cyl(0.05, 0.05, 4.6, 0xd4af37, hx, 2.7, hz, 5)); const body = box(1.3, 0.55, 0.45, pick([0xf6f1e4, 0xe0a030, 0x8b5a2b, 0x222222]), hx, 1.6, hz); body.rotation.y = -a; spin.add(body); const head = box(0.4, 0.45, 0.3, 0xf6f1e4, hx - Math.sin(a) * 0.75, 2.05, hz + Math.cos(a) * 0.75); head.rotation.y = -a; spin.add(head); }
  G.animated.push(dt => { spin.rotation.y += dt * 0.45; for (let i = 0; i < 8; i++) spin.children[i * 3 + 1].position.y = 1.6 + Math.sin(G.time * 2 + i) * 0.25; });
  g.position.set(x, 0, z); scene.add(g);
}
// The Moulin de la Galette: a wooden mill on a stone base, its four sails turning.
function windmill(scene, x, z, rotY) {
  const g = new THREE.Group(); g.add(cyl(3.2, 3.5, 2.6, 0x9a9282, 0, 1.3, 0, 12)); g.add(cyl(2.2, 2.8, 7, 0x8b6a3b, 0, 6.1, 0, 10)); g.add(cone(2.7, 2.6, 0x4a3b2a, 0, 10.9, 0, 10));
  const sails = new THREE.Group(); sails.position.set(0, 8.4, 2.9); g.add(sails); sails.add(sph(0.4, 0x4a3b2a, 0, 0, 0, 6));
  for (let i = 0; i < 4; i++) { const b = new THREE.Group(); b.rotation.z = i * Math.PI / 2; b.add(box(0.9, 6.5, 0.12, 0xd9cfb8, 0.3, 3.6, 0)); b.add(box(0.12, 7, 0.14, 0x4a3b2a, -0.25, 3.5, 0)); sails.add(b); }
  G.animated.push(dt => { sails.rotation.z += dt * 0.35; });
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g);
}
// A Guimard Métro entrance: green cast iron, the lamps and the sign. Stairs go down on local +z.
function metroEntrance(scene, x, z, rotY) {
  const g = new THREE.Group(); [-1.7, 1.7].forEach(px => { g.add(cyl(0.1, 0.14, 3.4, 0x2f6b3a, px, 1.7, 0, 6)); g.add(sph(0.3, 0xe0a030, px, 3.6, 0, 8)); g.add(box(0.08, 0.9, 3.2, 0x2f6b3a, px, 0.45, 1.6)); });
  g.add(box(3.8, 0.5, 0.25, 0x2f6b3a, 0, 3.0, 0)); const sg = textPlane(3.4, 0.7, 'MÉTROPOLITAIN', '#2f6b3a', '#f2c14e', 56); sg.position.set(0, 3.0, 0.14); g.add(sg); g.add(box(3.2, 0.1, 3.2, 0x222222, 0, 0.05, 1.6));
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(still(g));
}
// A bus shelter with somebody waiting in it.
function busStop(scene, x, z, rotY) {
  const g = new THREE.Group(); [-1.9, 1.9].forEach(px => g.add(cyl(0.06, 0.06, 2.8, 0x2f3a3a, px, 1.4, -0.8, 5))); g.add(box(4.2, 0.15, 1.8, 0x2f3a3a, 0, 2.85, -0.2)); g.add(box(4, 2.0, 0.06, 0x9fb4cf, 0, 1.7, -0.85)); g.add(box(2.4, 0.1, 0.5, 0x8b5a2b, 0, 0.5, -0.5)); g.add(cyl(0.05, 0.05, 3.6, 0x2f3a3a, 2.4, 1.8, 0.4, 5)); const sg = textPlane(0.9, 0.5, 'BUS', '#1f3a93', '#fff', 90); sg.position.set(2.4, 3.4, 0.4); g.add(sg);
  const f = figure(pick(JACKETS), pick(SKINS), null); f.position.set(-0.8, 0, -0.2); g.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: 0.05, base: 0 });
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(still(g));
}
// A Wallace fountain: dark green, four caryatids under a little dome.
function wallace(scene, x, z) { const g = new THREE.Group(); g.add(cyl(0.9, 1.0, 0.5, 0x1f5a3a, 0, 0.25, 0, 10)); g.add(cyl(0.45, 0.6, 1.0, 0x1f5a3a, 0, 1.0, 0, 8)); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; g.add(cyl(0.1, 0.12, 1.2, 0x1f5a3a, Math.cos(a) * 0.4, 2.1, Math.sin(a) * 0.4, 5)); } g.add(sph(0.55, 0x1f5a3a, 0, 2.9, 0, 10)); g.add(cone(0.15, 0.4, 0x1f5a3a, 0, 3.5, 0, 5)); g.position.set(x, 0, z); scene.add(still(g)); }
// A moored péniche: a long low barge with a cabin aft and a tarp over the hold.
function peniche(scene, x, z, rotY, color) { const g = new THREE.Group(); g.add(box(26, 1.6, 6, color, 0, 0.5, 0)); g.add(box(6, 2.4, 5, 0xf6f1e4, -8.5, 2.5, 0)); g.add(box(6.2, 0.3, 5.2, 0x8a2b2b, -8.5, 3.8, 0)); g.add(box(14, 0.7, 5.4, 0x444444, 3, 1.6, 0)); g.add(cyl(0.2, 0.2, 1.6, 0x222222, -10.5, 4.4, 1.5, 6)); g.add(box(0.5, 0.35, 0.05, 0xc8102e, 12.5, 2.4, 0)); g.position.set(x, 0.2, z); g.rotation.y = rotY; scene.add(g); }
// A swan: body, curved neck, head and an orange beak.
function swan(scene, x, z) { const g = new THREE.Group(); const b = sph(0.45, 0xffffff, 0, 0.3, 0, 8); b.scale.set(1, 0.7, 1.4); g.add(b); const n = cyl(0.07, 0.1, 0.9, 0xffffff, 0, 0.8, 0.5, 6); n.rotation.x = -0.25; g.add(n); g.add(sph(0.14, 0xffffff, 0, 1.25, 0.6, 6)); g.add(cone(0.06, 0.25, 0xe0a030, 0, 1.25, 0.8, 5).rotateX(Math.PI / 2)); g.position.set(x, 0, z); g.rotation.y = rand(0, 6.28); scene.add(g); return g; }
// An orangery: a long, low, pale building with a row of arched windows; faces local +z.
function orangery(scene, x, z, w, rotY) {
  const g = new THREE.Group(); g.add(box(w, 8, 14, 0xeadfc8, 0, 4, 0)); g.add(box(w + 1, 0.8, 15, 0xd9cfb8, 0, 8.4, 0)); g.add(box(w - 2, 1.8, 12, 0x6b6f78, 0, 9.2, 0));
  for (let px = -w / 2 + 5; px < w / 2 - 3; px += 7) { g.add(box(3.4, 4.6, 0.3, 0x334a66, px, 2.5, 7.1)); const arc = cyl(1.7, 1.7, 0.3, 0x334a66, px, 4.8, 7.1, 12); arc.rotation.x = Math.PI / 2; g.add(arc); }
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g);
}
// A small sailing boat: hull, deck, cabin, mast and sail; returns the inner group that rolls.
function boat(scene, x, z, rotY, color) {
  const g = new THREE.Group(), b = new THREE.Group(); g.add(b); b.add(box(7, 1.2, 2.6, color, 0, 0.6, 0)); b.add(box(6.6, 0.2, 2.3, 0xf6f1e4, 0, 1.25, 0)); b.add(box(2.2, 1.1, 1.8, 0xffffff, -1.4, 1.9, 0)); b.add(cyl(0.06, 0.09, 7.5, 0xdddddd, 1.0, 4.8, 0, 6)); b.add(box(2.4, 4.2, 0.06, pick([0xfffaf0, 0xf6f1e4, 0xffd34d, 0x9fd0e8]), -0.3, 5.0, 0)); b.add(cone(0.9, 1.2, color, 3.9, 0.7, 0, 4).rotateZ(-Math.PI / 2));
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g); return b;
}
// The little ferry-boat that crosses the harbour and back, turning round at each quay. Bounds in scale-1 coordinates.
function ferry(scene, x0, x1, z) {
  const g = new THREE.Group(); g.add(box(11, 1.4, 4.2, 0xffffff, 0, 0.9, 0)); g.add(box(6.5, 2.2, 3.4, 0x1f3a93, -0.5, 2.6, 0)); g.add(box(7, 0.3, 3.8, 0xf6f1e4, -0.5, 3.85, 0)); g.add(box(0.5, 0.35, 0.05, 0x2a7fd4, 5, 2.2, 0));
  for (let i = 0; i < 4; i++) { const f = figure(pick(JACKETS), pick(SKINS), null); f.scale.setScalar(0.7); f.position.set(-3 + i * 1.6, 1.4, i % 2 ? 1.2 : -1.2); g.add(f); }
  g.position.set(x0, 0, z); scene.add(g); let dir = 1;
  G.animated.push(dt => { g.position.x += dt * 5 * dir; if (g.position.x > x1 * DS) dir = -1; if (g.position.x < x0 * DS) dir = 1; g.rotation.y = dir > 0 ? 0 : Math.PI; g.position.y = Math.sin(G.time * 1.4) * 0.15; });
}
// The big wheel: a rim, spokes, twelve gondolas that stay upright, on two A-frames. World coordinates.
function ferrisWheel(world, x, z, r) {
  const g = new THREE.Group(); g.position.set(x, 0, z); const wheel = new THREE.Group(); wheel.position.y = r + 4; g.add(wheel);
  wheel.add(torus(r, 0.45, 0xf6f1e4, 0, 0, 0)); wheel.add(torus(r * 0.28, 0.3, 0xf6f1e4, 0, 0, 0)); const hub = cyl(1.2, 1.2, 3, 0x9a9a9a, 0, 0, 0, 10); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  for (let i = 0; i < 8; i++) { const s = box(0.3, r * 2, 0.3, 0x9a9a9a, 0, 0, 0); s.rotation.z = i * Math.PI / 8; wheel.add(s); }
  const gondolas = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const c = new THREE.Group(); c.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); c.add(box(2.4, 2.2, 2.0, pick([0xc8102e, 0x2a7fd4, 0xf2c14e, 0xf6f1e4]), 0, -1.6, 0)); c.add(box(2.5, 0.9, 2.1, 0x223344, 0, -1.3, 0)); wheel.add(c); gondolas.push(c); }
  [-1.6, 1.6].forEach(lz => [-1, 1].forEach(sx => { const leg = cyl(0.4, 0.5, Math.hypot(r * 0.6, r + 4), 0x9a9a9a, sx * r * 0.3, (r + 4) / 2, lz, 8); leg.rotation.z = -sx * Math.atan2(r * 0.6, r + 4); g.add(leg); }));
  G.animated.push(dt => { wheel.rotation.z += dt * 0.12; for (const c of gondolas) c.rotation.z = -wheel.rotation.z; });
  world.add(g);
}
// A fish stall: a bed of ice with the catch on it under a parasol, the vendor behind.
function fishStall(scene, x, z, rotY) {
  const g = new THREE.Group(); g.add(box(3, 0.1, 1.4, 0x8b5a2b, 0, 0.9, 0)); [-1.3, 1.3].forEach(px => g.add(box(0.1, 0.9, 1.2, 0x8b5a2b, px, 0.45, 0))); g.add(box(2.8, 0.25, 1.2, 0xeaf6ff, 0, 1.07, 0));
  for (let i = 0; i < 6; i++) { const f = sph(0.18, 0xc0c8d0, -1.1 + i * 0.44, 1.22, rand(-0.3, 0.3), 6); f.scale.set(1, 0.5, 2.2); f.rotation.y = rand(-0.3, 0.3); g.add(f); }
  g.add(cyl(0.04, 0.04, 2.6, 0x555555, 0, 1.3, -0.6, 5)); g.add(cone(2.4, 0.8, 0x2a7fd4, 0, 2.95, -0.6, 4)); const sg = textPlane(2.6, 0.6, 'POISSONNERIE', '#1f3a93', '#fff', 56); sg.position.set(0, 2.2, 0.75); g.add(sg);
  const v = figure(0x3b4a6b, pick(SKINS), null); v.position.set(0, 0, -1.3); g.add(v); G.crowd.push({ g: v, ph: rand(0, 6), amp: 0.08, base: 0 });
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g);
}
// Fort Saint-Jean: two stone walls meeting at a round tower. World coordinates.
function fort(world, x, z, rotY) { const g = new THREE.Group(); g.add(box(70, 11, 9, 0xc9b48c, 20, 5.5, 0)); g.add(box(9, 11, 60, 0xc9b48c, 0, 5.5, -25)); g.add(box(72, 1.5, 10, 0xb9a47c, 20, 11.6, 0)); g.add(cyl(8, 8.6, 26, 0xd3c09a, 0, 13, 0, 16)); g.add(cyl(9, 9, 2, 0xb9a47c, 0, 26.8, 0, 16)); g.add(cyl(0.12, 0.12, 8, 0xdddddd, 0, 31, 0, 5)); g.add(box(3, 1.8, 0.1, 0x2f55c7, 1.5, 33.5, 0)); g.position.set(x, 0, z); g.rotation.y = rotY || 0; world.add(g); }
// A dockside crane. World coordinates, so the jib keeps its proportions.
function crane(world, x, z, rotY) { const g = new THREE.Group(); g.add(box(4, 1.2, 4, 0x444444, 0, 0.6, 0)); g.add(cyl(0.6, 0.8, 26, 0xe0a030, 0, 13.6, 0, 6)); g.add(box(1, 1, 24, 0xe0a030, 0, 26.5, 7)); g.add(box(1.2, 1.2, 6, 0xe0a030, 0, 26.5, -5)); g.add(box(2, 2, 2, 0x222222, 0, 25, 1.5)); g.add(cyl(0.04, 0.04, 14, 0x333333, 0, 19, 15, 4)); g.add(box(0.8, 0.8, 0.8, 0x333333, 0, 11.8, 15)); g.position.set(x, 0, z); g.rotation.y = rotY || 0; world.add(g); }
// A tram on a short line, back and forth along x. Bounds in scale-1 coordinates.
function tram(scene, x0, x1, z) {
  [-1.1, 1.1].forEach(rz => scene.add(box(x1 - x0, 0.12, 0.2, 0x555555, (x0 + x1) / 2, 0.06, z + rz)));
  const g = new THREE.Group(); g.add(box(9, 2.8, 2.4, 0xf6f1e4, 0, 1.9, 0)); g.add(box(8.4, 1.0, 2.5, 0x223344, 0, 2.3, 0)); g.add(box(9.1, 0.4, 2.45, 0x2a7fd4, 0, 1.0, 0)); g.add(box(9, 0.2, 2.2, 0x9a9a9a, 0, 3.4, 0)); g.add(cyl(0.04, 0.04, 1.6, 0x333333, 0, 4.2, 0, 4));
  g.position.set(x0 + 5, 0, z); scene.add(g); let dir = 1;
  G.animated.push(dt => { g.position.x += dt * 6 * dir; if (g.position.x > (x1 - 5) * DS) dir = -1; if (g.position.x < (x0 + 5) * DS) dir = 1; });
}
// A game of pétanque: the boules, the cochonnet, and the players arguing around them.
function petanque(scene, x, z) { const g = new THREE.Group(); g.add(plane(9, 7, 0xcdbc8e, 0, 0)); for (let i = 0; i < 6; i++) g.add(sph(0.13, 0x9a9a9a, rand(-1.5, 1.5), 0.13, rand(-1, 1), 6)); g.add(sph(0.06, 0xe0a030, rand(-0.5, 0.5), 0.06, rand(-0.5, 0.5), 5)); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.4; const f = figure(pick(JACKETS), pick(SKINS), null); f.position.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.2); f.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); g.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: i === 0 ? 0.3 : 0.05, base: 0 }); } g.position.set(x, 0, z); scene.add(g); }
// A seagull on a mooring post.
function seagull(scene, x, z, h) { const g = new THREE.Group(); g.add(cyl(0.1, 0.14, h, 0x6b4a2b, 0, h / 2, 0, 6)); const b = sph(0.22, 0xffffff, 0, h + 0.2, 0, 7); b.scale.set(1, 0.8, 1.5); g.add(b); [-1, 1].forEach(s => { const w = box(0.7, 0.04, 0.3, 0xe8e8e8, s * 0.4, h + 0.3, 0); w.rotation.z = -s * 0.25; g.add(w); }); g.add(cone(0.05, 0.18, 0xe0a030, 0, h + 0.28, 0.42, 5).rotateX(Math.PI / 2)); g.position.set(x, 0, z); g.rotation.y = rand(0, 6.28); scene.add(g); }
// A lower village house with a tiled roof: Montmartre's and Le Panier's.
function house(scene, x, z, w, d, h, rotY) { building(scene, x, z, w, d, h, rotY, pick([0xffffff, 0xf4e6c8, 0xf2d7c2, 0xe8d6a8, 0xf0d9c0]), pick([0xa0523d, 0x8f4a36, 0xb0623f])); }
// A straight flight of steps with a handrail: Montmartre's stairs, parallel to local z.
function stairs(scene, x, z, rotY, n) { const g = new THREE.Group(); for (let i = 0; i < n; i++) g.add(box(3.4, 0.3 * (i + 1), 1.4, 0xbfb398, 0, 0.15 * (i + 1), i * 1.4)); for (let i = 0; i < n; i += 3) [-1.8, 1.8].forEach(px => g.add(cyl(0.04, 0.04, 1.0, 0x2f3a3a, px, 0.3 * (i + 1) + 0.5, i * 1.4, 5))); [-1.8, 1.8].forEach(px => { const r = box(0.06, 0.06, Math.hypot(n * 1.4, n * 0.3), 0x2f3a3a, px, 0.3 * n / 2 + 1.0, (n - 1) * 0.7); r.rotation.x = -Math.atan2(0.3, 1.4); g.add(r); }); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g); }
// A patch of vines: posts in rows with the vine stock on each.
function vines(scene, x, z, rotY) { const g = new THREE.Group(); for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { const px = (c - 2.5) * 2.2, pz = (r - 1) * 2.2; g.add(cyl(0.05, 0.05, 1.6, 0x6b4a2b, px, 0.8, pz, 4)); g.add(cone(0.55, 1.3, pick([0x3f8a3a, 0x4fa044, 0x5d9a4a]), px, 1.5, pz, 6)); } g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g); }
// The Sacré-Cœur on its mound: the stepped base, the great dome, four small domes, the campanile and the stairs in front. World coordinates, facing -z.
function sacreCoeur(world, x, z) {
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
function bonneMere(world, x, z) {
  const g = new THREE.Group(); g.add(box(140, 16, 100, 0x8aa860, 0, 8, 0)); g.add(box(80, 8, 70, 0xc9b48c, 0, 20, 0)); g.add(box(34, 18, 54, 0xe8dcc0, 0, 33, 6)); g.add(box(36, 2.2, 56, 0x2f6b3a, 0, 36, 6)); g.add(box(36, 2.2, 56, 0x2f6b3a, 0, 30, 6)); const dm = sph(10, 0xe8dcc0, 0, 44, 8, 14); dm.scale.set(1, 0.8, 1); g.add(dm);
  g.add(box(14, 44, 14, 0xe8dcc0, 0, 46, -24)); g.add(box(10, 9, 10, 0xd9cfb8, 0, 72.5, -24)); g.add(box(11, 1.5, 11, 0xd4af37, 0, 77.5, -24));
  const m = figure(0xd4af37, 0xd4af37, null); m.scale.setScalar(5); m.position.set(0, 78, -24); g.add(m);
  g.position.set(x, 0, z); world.add(g);
}
function cloudsAndSky(scene, top, horizon) {
  const t = canvasTexture(16, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, hex(top)); gr.addColorStop(0.55, hex(horizon)); gr.addColorStop(1, hex(horizon)); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 24, 12), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })); scene.add(sky);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(28, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff7d0, fog: false })); sun.position.set(400, 520, 260); scene.add(sun);
  const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
  for (let i = 0; i < 16; i++) { const g = new THREE.Group(); const n = 3 + Math.floor(Math.random() * 3); for (let j = 0; j < n; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(rand(7, 14), 10, 8), cm); s.position.set(j * 9 - n * 4, rand(-2, 3), rand(-4, 4)); s.scale.y = 0.55; g.add(s); } g.position.set(rand(-700, 700), rand(120, 190), rand(-700, 700)); scene.add(g); G.animated.push(dt => { g.position.x += dt * 2.5; if (g.position.x > 760) g.position.x = -760; }); }
}

// ---------- Bike lane ----------
// A green painted lane along the right-hand edge of the road, behind a dashed
// white line, with a cycle pictogram every so often. The cyclists who use it
// (and leave it whenever they like) live in cyclists.js.
function bikeTex() {
  if (!TEX.bike) {
    TEX.bike = canvasTexture(128, 128, (c, w, h) => {
      c.strokeStyle = '#f6f1e4'; c.lineWidth = 7; c.lineCap = 'round';
      [[34, 84], [94, 84]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 20, 0, 7); c.stroke(); });
      c.beginPath(); c.moveTo(34, 84); c.lineTo(58, 52); c.lineTo(86, 52); c.lineTo(94, 84); c.moveTo(58, 52); c.lineTo(64, 84); c.lineTo(34, 84); c.moveTo(86, 52); c.lineTo(82, 38); c.lineTo(94, 38); c.moveTo(52, 44); c.lineTo(66, 44); c.stroke();
    });
  }
  return TEX.bike;
}
function bikeLane(scene, track, strip) {
  const { inner, outer } = CFG.bikeLane, N = G.N;
  strip(inner, outer, 0.062, 0.062, 0, 1, 0x2a7d50, 0x2a7d50, 0.95);                    // the green lane
  // dashed separation line: one dash every four samples
  const pos = [], ix = [];
  for (let i = 0; i < N; i += 4) {
    const a = G.samples[i], b = G.samples[(i + 2) % N]; const n = pos.length / 3;
    for (const s of [a, b]) for (const l of [inner - 0.15, inner + 0.15]) pos.push(s.x + s.sx * l, 0.066, s.z + s.sz * l);
    ix.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ix); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf6f1e4, side: THREE.DoubleSide })));
  // pictograms, pointing the way the lane runs
  const mid = (inner + outer) / 2;
  for (let i = 20; i < N; i += 70) {
    const s = G.samples[i]; const p = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: bikeTex(), transparent: true }));
    p.rotation.x = -Math.PI / 2; p.rotation.z = Math.PI / 2;
    const h = new THREE.Group(); h.position.set(s.x + s.sx * mid, 0.07, s.z + s.sz * mid); h.rotation.y = Math.atan2(s.tx, s.tz); h.add(p); scene.add(h);
  }
}

// ---------- Track construction ----------
/** Build circuit `track` into `scene`. `fold` (default: on "légers") folds the still decor into fewer draws (foldStill). */
export function buildTrack(scene, track, { fold = getPoly() === 'low' } = {}) {
  textures(); STILL = [];
  // The circuit is drawn at track.scale; CFG.samples grows with it so the
  // samples stay about as far apart as before and every distance counted in
  // samples (feature lengths, AI look-ahead, power offsets) keeps its meaning.
  const S = track.scale || 1; DS = S;
  const pts = track.points.map(p => new THREE.Vector3(p[0] * S, 0, p[1] * S));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  curve.arcLengthDivisions = 2000;
  const N = CFG.samples, samples = [];
  for (let i = 0; i < N; i++) { const u = i / N; const p = curve.getPointAt(u); const t = curve.getTangentAt(u).normalize(); samples.push({ x: p.x, z: p.z, tx: t.x, tz: t.z, sx: -t.z, sz: t.x }); }
  const total = curve.getLength();
  G.samples = samples; G.N = N; G.trackLength = total;
  const hw = CFG.roadHalfWidth, step = total / N;

  // road surface (asphalt, gravel or cobbles; the texture tiles every `period` metres)
  const roadTex = roadTexOf(track), period = track.gravel ? 10 : track.cobble ? 8 : 20;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) { const s = samples[i % N]; const v = (i * step) / period; pos.push(s.x + s.sx * hw, 0.05, s.z + s.sz * hw, s.x - s.sx * hw, 0.05, s.z - s.sz * hw); uv.push(0, v, 1, v); }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx); rg.computeVertexNormals();
  // the cobbles are tinted down: the pale stones would otherwise wash out next to the pavement
  const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: roadTex, color: track.cobble ? 0x8f8a82 : 0xffffff, roughness: 0.95, side: THREE.DoubleSide })); road.receiveShadow = true; scene.add(road);

  function strip(inner, outer, y0, y1, period, sideSign, c1, c2, rough) {
    const p = [], col = [], ix = []; const A = new THREE.Color(c1), B = new THREE.Color(c2);
    for (let i = 0; i <= N; i++) { const s = samples[i % N]; const c = period ? (Math.floor(i / period) % 2 === 0 ? A : B) : A; p.push(s.x + s.sx * inner * sideSign, y0, s.z + s.sz * inner * sideSign, s.x + s.sx * outer * sideSign, y1, s.z + s.sz * outer * sideSign); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
    for (let i = 0; i < N; i++) { const a = i * 2; ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(ix); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: rough || 0.9 })); m.receiveShadow = true; scene.add(m);
  }
  [1, -1].forEach(sg => {
    strip(hw - 1.1, hw, 0.07, 0.07, 4, sg, track.kerb[0], track.kerb[1]);             // kerb stripes
    strip(hw, hw + 0.8, 0.07, 0.35, 0, sg, track.pavement, track.pavement);           // kerb stone
    strip(hw + 0.8, hw + 6, 0.35, 0.35, 0, sg, track.pavement, track.pavement);       // pavement
    strip(hw + 0.8, hw + 0.8, 0.35, 1.25, 6, sg, track.kerb[0], 0xf6f1e4);            // barrier wall
  });
  bikeLane(scene, track, strip);

  // start line + gantry
  const s0 = samples[0]; const yaw = Math.atan2(s0.tx, s0.tz);
  const checker = canvasTexture(128, 32, (c) => { for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect(x * 16, y * 16, 16, 16); } });
  const lineHolder = new THREE.Group(); lineHolder.position.set(s0.x, 0.08, s0.z); lineHolder.rotation.y = yaw; const lineMesh = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 3), new THREE.MeshBasicMaterial({ map: checker })); lineMesh.rotation.x = -Math.PI / 2; lineHolder.add(lineMesh); scene.add(lineHolder);
  const gantry = new THREE.Group(); gantry.position.set(s0.x, 0, s0.z); gantry.rotation.y = yaw;
  gantry.add(cyl(0.35, 0.35, 9, 0xdddddd, hw + 1.6, 4.5, 0, 8)); gantry.add(cyl(0.35, 0.35, 9, 0xdddddd, -hw - 1.6, 4.5, 0, 8));
  const banner = canvasTexture(1024, 160, (c, w, h) => { c.fillStyle = '#1f3a93'; c.fillRect(0, 0, w / 3, h); c.fillStyle = '#fffaf0'; c.fillRect(w / 3, 0, w / 3, h); c.fillStyle = '#c8102e'; c.fillRect(2 * w / 3, 0, w / 3, h); c.fillStyle = '#0c1230'; c.font = 'bold 96px sans-serif'; c.textAlign = 'center'; c.fillText('DÉPART · ARRIVÉE', w / 2, 112); });
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 3.2, 3), new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide })); bm.position.set(0, 8, 0); gantry.add(bm); scene.add(still(gantry));

  // ground
  const gt = (track.gravel ? TEX.gravel : TEX.grass).clone(); gt.needsUpdate = true; gt.repeat.set(280, 280);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  cloudsAndSky(scene, track.sky[0], track.sky[1]);

  // item boxes: rows of 4 golden urns across the wide road, four rows unless the track lists more
  G.itemBoxes = [];
  const boxGeo = new THREE.OctahedronGeometry(1.1, 0); const boxMat = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0x6a4a00, transparent: true, opacity: 0.9, roughness: 0.3, metalness: 0.4 });
  (track.boxRows || [0.18, 0.42, 0.66, 0.88]).forEach(f => { const s = samples[Math.floor(f * N)]; [-9, -3, 3, 9].forEach(o => { const m = new THREE.Mesh(boxGeo, boxMat); m.position.set(s.x + s.sx * o, 1.4, s.z + s.sz * o); scene.add(m); G.itemBoxes.push({ x: m.position.x, z: m.position.z, mesh: m, active: true, timer: 0 }); }); });

  // shared street furniture: lamps, ad boards, crowd zones, grandstand
  for (let i = 0; i < N; i += 36) { const s = samples[i]; const sg = (i / 36) % 2 ? 1 : -1; lamp(scene, s.x + s.sx * sg * (hw + 5.2), s.z + s.sz * sg * (hw + 5.2), track.gravel ? 'plain' : 'paris'); }
  for (let i = 0; i < 8; i++) adBoard(scene, Math.floor(N * (0.07 + i * 0.118)), i % 2 ? 1 : -1, ...ADS[i], getCustom().ads[i]);
  G.crowd = [];
  grandstand(scene, 0, 1);
  crowdZone(scene, N - 30, N + 30, -1, true);
  [0.28, 0.5, 0.74].forEach((f, i) => crowdZone(scene, Math.floor(N * f), Math.floor(N * f) + 36, i % 2 ? 1 : -1, false));

  buildFeatures(scene, track);
  buildCyclists(scene);
  for (const c of G.cyclists) still(c.mesh);   // a rider moves and falls as a whole
  // themed decor, laid out at scale 1 and then spread out to the circuit's scale
  const decor = new THREE.Group();
  (BUILDERS[track.id] ?? buildVersailles)(decor, scene);
  spreadDecor(decor, scene, S);
  if (fold) foldStill(scene); else STILL = [];
}

/** The road's surface texture: gravel for the park, cobbles for the butte, asphalt elsewhere. */
export function roadTexOf(track) { return track.gravel ? TEX.gravel : track.cobble ? TEX.cobble : TEX.asphalt; }

// Scale of the circuit being built; the themed decor is written in scale-1
// coordinates, so its clearance checks against the road multiply by it.
let DS = 1;
const clearAt = (x, z, margin) => isClear(x * DS, z * DS, margin * DS);

/**
 * Spread the themed decor, written for a scale-1 circuit, over a circuit
 * drawn at scale S. Big pieces -- palaces, buildings, lawns, the river, walls
 * -- stretch horizontally with the circuit, so they keep framing the road.
 * Small ones -- people, trees, lamps, cars, statues -- only move: they keep
 * their size, next to karts that kept theirs.
 */
function spreadDecor(decor, world, S) {
  decor.updateMatrixWorld(true);
  const size = new THREE.Vector3(), bb = new THREE.Box3();
  for (const child of [...decor.children]) {
    bb.setFromObject(child).getSize(size);
    if (Math.max(size.x, size.z) < 14) { child.position.x *= S; child.position.z *= S; world.add(child); }
  }
  decor.scale.set(S, 1, S); world.add(decor);
}

// The themed builders by circuit id; `scene` is the scale-1 decor group, `world` the real scene for
// pieces placed from G.samples or built in world units (landmarks whose domes and wheels must stay round).
const BUILDERS = { elysee: buildElysee, bourbon: buildBourbon, versailles: buildVersailles, montmartre: buildMontmartre, marseille: buildMarseille };

function buildElysee(scene, world) {
  const hw = CFG.roadHalfWidth;
  // palace, cour d'honneur, gate on the Faubourg
  palace(scene, 0, 72, 76, 15, 24, 0, 0x4a4f5a);
  const court = new THREE.Mesh(new THREE.PlaneGeometry(80, 52), new THREE.MeshStandardMaterial({ map: TEX.cobble.clone(), roughness: 1 })); court.material.map.needsUpdate = true; court.material.map.repeat.set(10, 6); court.rotation.x = -Math.PI / 2; court.position.set(0, 0.03, 34); court.receiveShadow = true; scene.add(court);
  [-40, 40].forEach(x => scene.add(still(box(2, 14, 52, 0xeadfc8, x, 7, 34))));                // wings around the courtyard
  gate(scene, 0, 8, 0, 26);
  [-18, 18].forEach(x => { const gd = figure(0x1f2a5e, pick(SKINS), 'guard'); gd.position.set(x, 0, 10); gd.rotation.y = Math.PI; scene.add(gd); });
  [[-22, 30, 0.3], [-12, 42, 0.1], [20, 32, -0.2], [12, 46, 0.4]].forEach(p => sedan(scene, p[0], p[1], p[2], 0x111111));
  flagPole(scene, 0, 86, [0x2f55c7, 0xffffff, 0xe63946], 26);
  // press scrum on the street in front of the gate, behind a rail
  for (let i = 0; i < 14; i++) { const f = figure(pick([0x222222, 0x3b4a6b, 0x5a5a5a]), pick(SKINS), 'press'); f.position.set(rand(-20, 20), 0, rand(-8, -2)); f.rotation.y = 0; scene.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: 0.1, base: 0 }); }
  scene.add(still(box(44, 0.06, 0.06, 0x9a9a9a, 0, 1.0, -1))); for (let x = -22; x <= 22; x += 4) scene.add(still(cyl(0.05, 0.05, 1.1, 0x9a9a9a, x, 0.55, -1, 5)));
  // rue du Faubourg with shops facing the palace
  const street = new THREE.Mesh(new THREE.PlaneGeometry(260, 14), new THREE.MeshStandardMaterial({ map: TEX.asphalt.clone(), roughness: 1 })); street.material.map.needsUpdate = true; street.material.map.repeat.set(14, 1); street.rotation.x = -Math.PI / 2; street.rotation.z = Math.PI / 2; street.position.set(0, 0.03, -2); street.receiveShadow = true; scene.add(street);
  shopRow(scene, -120, 120, -24, 1);
  for (let x = -110; x <= 110; x += 22) { tree(scene, x, -10, 'plane'); lamp(scene, x + 11, -9, 'paris'); }
  // garden behind the palace
  scene.add(plane(120, 40, 0x5f9a48, 0, 100)); fountain(scene, 0, 102, 7, 1, false); [-30, 30].forEach(x => { hedgeWall(scene, x, 96, 24, 1.2, 2); tree(scene, x, 106, 'cypress'); tree(scene, x + 8, 106, 'cypress'); tree(scene, x - 8, 106, 'cypress'); });
  // Haussmann ring outside the loop, plane trees, pigeons
  for (let a = 0; a < Math.PI * 2; a += 0.2) { const r = 242; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (clearAt(x, z, 18)) building(scene, x, z, rand(22, 30), rand(16, 22), rand(16, 24), -a + Math.PI / 2); }
  for (let i = 0; i < 70; i++) { const x = rand(-270, 270), z = rand(-230, 270); if (clearAt(x, z, 9) && !(Math.abs(z) < 120 && Math.abs(x) < 140)) tree(scene, x, z, 'plane'); }
  for (let i = 0; i < 24; i++) { const x = rand(-60, 60), z = rand(12, 55); pigeon(scene, x, z); }
  for (let i = 0; i < G.N; i += 60) { const s = G.samples[i]; if (isClear(s.x + s.sx * (hw + 9), s.z + s.sz * (hw + 9), 7)) tree(world, s.x + s.sx * (hw + 9), s.z + s.sz * (hw + 9), 'plane'); }
  // the Faubourg's street life: bus stops, Métro entrances, café terraces, a kiosk, Wallace fountains, parked cars
  [-55, 66].forEach(x => busStop(scene, x, -12.5, 0)); [-82, 92].forEach(x => metroEntrance(scene, x, -12.5, Math.PI));
  cafe(scene, -36, -12.5, Math.PI, 'CAFÉ DU FAUBOURG', 0xc8102e, 3); cafe(scene, 40, -12.5, Math.PI, 'LE MARIGNY', 0x1f3a93, 3);
  kiosk(scene, -62, 13, 0x2e8b57, 'PRESSE', Math.PI); [[-96, 14], [96, 14], [0, 118]].forEach(([x, z]) => wallace(scene, x, z));
  [[-100, 3.5, 0], [-72, 3.5, 0], [72, 3.5, 0], [102, 3.5, 0], [-46, -7.5, Math.PI], [52, -7.5, Math.PI]].forEach(p => sedan(scene, p[0], p[1], p[2], pick([0x111111, 0x2b2b35, 0x4a4a52])));
  for (let i = 0; i < nOf(24); i++) person(scene, rand(-110, 110), rand(-14, -10), rand(0, 6.28), null, 0.05);
  for (let i = 0; i < 20; i++) pigeon(scene, rand(-110, 110), rand(-14, -8));
  // pedestrians waiting at the crossing, on both pavements
  const cr = (G.track?.features || []).find(f => f.t === 'crossing'); if (cr) { const s = G.samples[Math.floor(cr.f * G.N)]; for (let i = 0; i < nOf(8); i++) { const sg = i % 2 ? 1 : -1; const f = figure(pick(JACKETS), pick(SKINS), null); f.position.set(s.x + s.sx * sg * (hw + 2.5 + rand(0, 2)) + s.tx * rand(-3, 3), 0, s.z + s.sz * sg * (hw + 2.5 + rand(0, 2)) + s.tz * rand(-3, 3)); f.rotation.y = Math.atan2(-s.sx * sg, -s.sz * sg); world.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: 0.08, base: 0 }); } }
}
function buildBourbon(scene, world) {
  const hw = CFG.roadHalfWidth;
  // the Seine, embankment, bridge, obelisk on the far bank
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 90), new THREE.MeshStandardMaterial({ map: TEX.water.clone(), roughness: 0.15, metalness: 0.3 })); water.material.map.needsUpdate = true; water.material.map.repeat.set(60, 4); water.rotation.x = -Math.PI / 2; water.position.set(0, 0.03, -170); scene.add(water);   // just above the ground plane, which would otherwise hide it
  G.animated.push(dt => { water.material.map.offset.x += dt * 0.02; });
  scene.add(box(1600, 1.6, 3, 0xbfb398, 0, 0.8, -123)); scene.add(box(1600, 2, 4, 0xbfb398, 0, 1, -217));
  bridge(scene, 60, -122, -216); obelisk(scene, 60, -245);
  for (let a = -300; a <= 300; a += 40) if (Math.abs(a - 60) > 25) building(scene, a, -250, 32, 18, rand(18, 24), 0);
  bateau(scene);
  // Palais Bourbon facing the river, lawn with statues behind
  const pb = palace(scene, 0, -58, 56, 14, 22, Math.PI, 0x6d6d6d);
  [-24, 24].forEach(x => flagPole(scene, x, -75, [0x2f55c7, 0xffffff, 0xe63946]));
  [-10, 10].forEach(x => { const gd = figure(0x1f2a5e, pick(SKINS), 'guard'); gd.position.set(x, 0, -72); gd.rotation.y = Math.PI; scene.add(gd); });
  scene.add(plane(90, 50, 0x5f9a48, 0, -10)); [-30, -10, 10, 30].forEach(x => statue(scene, x, -40, Math.PI)); hedgeWall(scene, 0, 16, 90, 1.2, 2.2);
  // bouquinistes along the quai, between road and river
  for (let x = -92; x <= 92; x += 9) bouquiniste(scene, x, -117.5, 0);
  for (let i = 0; i < 18; i++) { const f = figure(pick(JACKETS), pick(SKINS), null); f.position.set(rand(-90, 90), 0, rand(-116, -113)); f.rotation.y = Math.PI; scene.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: 0, base: 0 }); }
  [[-60, -113, 1.5], [75, -114, 1.6]].forEach(p => sedan(scene, p[0], p[1], p[2], 0x111111));
  kiosk(scene, 120, -116, 0x2e8b57, 'JOURNAUX', 0);
  // Haussmann ring on the land side, plane trees
  for (let a = 0.15; a < Math.PI - 0.15; a += 0.19) { const r = 236; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (clearAt(x, z, 18)) building(scene, x, z, rand(22, 30), rand(16, 22), rand(16, 24), -a + Math.PI / 2); }
  for (let i = 0; i < 60; i++) { const x = rand(-270, 270), z = rand(-110, 270); if (clearAt(x, z, 9)) tree(scene, x, z, 'plane'); }
  for (let x = -100; x <= 100; x += 25) tree(scene, x, -112, 'plane');
  for (let i = 0; i < 16; i++) pigeon(scene, rand(-40, 40), rand(-45, -20));
  // more of the quai: bouquinistes to both ends, péniches on the far bank, a second bridge, a terrace by the kiosk, joggers
  for (let x = -164; x <= 164; x += 9) if (Math.abs(x) > 96 && Math.abs(x - 120) > 6) bouquiniste(scene, x, -117.5, 0);
  [[-150, 0x2f5f32], [-30, 0x8a2b2b], [175, 0x1f3a93]].forEach(([x, c]) => peniche(scene, x, -206, 0, c));
  bridge(scene, -150, -122, -216);
  cafe(scene, 138, -113, Math.PI, 'CAFÉ DU QUAI', 0x2e8b57, 3);
  const joggers = []; for (let i = 0; i < nOf(8); i++) { const f = person(scene, rand(-150, 150), rand(-115, -113), Math.PI / 2, null, 0.2); f.userData.v = rand(3, 4.5) * (i % 2 ? 1 : -1); f.rotation.y = f.userData.v > 0 ? Math.PI / 2 : -Math.PI / 2; joggers.push(f); }
  G.animated.push(dt => { for (const j of joggers) { j.position.x += j.userData.v * dt; if (j.position.x > 160 * DS) j.position.x = -160 * DS; if (j.position.x < -160 * DS) j.position.x = 160 * DS; } });
  for (let i = 0; i < nOf(10); i++) person(scene, rand(-160, 160), rand(-116, -113), Math.PI, null, 0);
  for (let i = 0; i < 14; i++) pigeon(scene, rand(-160, 160), rand(-119, -113));
}
function buildVersailles(scene, world) {
  // château along the north edge, parterres and water terrace in front
  palace(scene, 0, 182, 200, 18, 30, 0, 0x6b6f78);
  [-70, 70].forEach(x => { scene.add(box(50, 14, 26, 0xeadfc8, x, 7, 200)); scene.add(box(48, 3, 24, 0x6b6f78, x, 15.5, 200)); });
  for (let x = -90; x <= 90; x += 10) scene.add(box(0.8, 1.4, 0.8, 0xd4af37, x, 23.8, 170));
  [-45, 45].forEach(x => { scene.add(cyl(18, 18, 0.6, 0xd9cfb8, x, 0.3, 141, 36)); const w = new THREE.Mesh(new THREE.CircleGeometry(17, 36), new THREE.MeshStandardMaterial({ map: TEX.water, roughness: 0.15, metalness: 0.3 })); w.rotation.x = -Math.PI / 2; w.position.set(x, 0.62, 141); scene.add(w); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; statue(scene, x + Math.cos(a) * 20, 141 + Math.sin(a) * 20, -a); } });
  for (let x = -96; x <= 96; x += 16) tree(scene, x, 163, 'orange');
  [-110, -80, 80, 110].forEach(x => parterre(scene, x, 128, 22, 12));
  [[-10, 128], [10, 128]].forEach(p => parterre(scene, p[0], p[1], 14, 10));
  // inside the loop: Latone, the tapis vert, Apollo, bosquets
  fountain(scene, 0, 50, 14, 3, true);
  scene.add(plane(26, 100, 0x4f8f3f, 0, -20));
  for (let z = -60; z <= 20; z += 16) { statue(scene, -18, z, Math.PI / 2); statue(scene, 18, z, -Math.PI / 2); tree(scene, -24, z + 8, 'topiary'); tree(scene, 24, z + 8, 'topiary'); }
  fountain(scene, 0, -95, 18, 2, true);
  [[-62, -25], [62, -25], [-62, 45], [62, 45]].forEach(p => { if (clearAt(p[0], p[1], 20)) { hedgeWall(scene, p[0], p[1] - 14, 30, 1.6, 4); hedgeWall(scene, p[0], p[1] + 14, 30, 1.6, 4); hedgeWall(scene, p[0] - 14, p[1], 1.6, 26, 4); hedgeWall(scene, p[0] + 14, p[1], 1.6, 26, 4); fountain(scene, p[0], p[1], 5, 1, false); } });
  // Grand Canal and its tree lines south of the loop
  const canal = new THREE.Mesh(new THREE.PlaneGeometry(44, 240), new THREE.MeshStandardMaterial({ map: TEX.water.clone(), roughness: 0.15, metalness: 0.3 })); canal.material.map.needsUpdate = true; canal.material.map.repeat.set(2, 12); canal.rotation.x = -Math.PI / 2; canal.position.set(0, 0.03, -305); scene.add(canal);
  const cross = canal.clone(); cross.geometry = new THREE.PlaneGeometry(240, 36); cross.position.set(0, 0.03, -330); scene.add(cross);
  for (let z = -200; z >= -420; z -= 18) { tree(scene, -34, z, 'cypress'); tree(scene, 34, z, 'cypress'); }
  for (let i = 0; i < 160; i++) { const x = rand(-330, 330), z = rand(-330, 100); if (clearAt(x, z, 9) && Math.abs(x) > 110) tree(scene, x, z, Math.random() < 0.5 ? 'cypress' : 'round'); }
  // topiary and gravel edges all along the circuit
  for (let i = 0; i < G.N; i += 12) { const s = G.samples[i]; const sg = (i / 12) % 2 ? 1 : -1; const x = s.x + s.sx * sg * (CFG.roadHalfWidth + 8), z = s.z + s.sz * sg * (CFG.roadHalfWidth + 8); if (isClear(x, z, 6.5)) tree(world, x, z, 'topiary'); }
  for (let i = 0; i < 10; i++) { const f = figure(0x1f2a5e, pick(SKINS), 'guard'); f.position.set(-50 + i * 11, 0, 164); f.rotation.y = Math.PI; scene.add(f); }
  // more of the gardens: a ring of statues round Latone, topiary lines, extra parterres, the orangery, swans, strollers, guards
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; statue(scene, Math.cos(a) * 24, 50 + Math.sin(a) * 24, -a + Math.PI / 2); }
  for (let x = -120; x <= 120; x += 12) if (clearAt(x, 118, 4)) tree(scene, x, 118, 'topiary');
  [[-42, 86], [42, 86], [-42, -132], [42, -132]].forEach(([x, z]) => { if (clearAt(x, z, 16)) parterre(scene, x, z, 20, 12); });
  orangery(scene, -190, 150, 100, 0); for (let x = -236; x <= -144; x += 14) tree(scene, x, 164, 'orange');
  const swans = []; for (let i = 0; i < nOf(10); i++) swans.push(swan(scene, rand(-14, 14), rand(-215, -400)));
  G.animated.push(dt => { for (const s of swans) { s.position.z += Math.cos(s.rotation.y) * dt * 0.6; s.position.x += Math.sin(s.rotation.y) * dt * 0.6; if (Math.abs(s.position.x) > 16 * DS || s.position.z > -200 * DS || s.position.z < -420 * DS) s.rotation.y += Math.PI; } });
  for (let i = 0; i < nOf(12); i++) person(scene, rand(-10, 10), rand(-60, 24), rand(0, 6.28), i % 4 === 0 ? 'press' : null, 0.05);
  for (let i = 0; i < 6; i++) { const f = figure(0x1f2a5e, pick(SKINS), 'guard'); f.position.set(-30 + i * 12, 0, 74); f.rotation.y = Math.PI; scene.add(f); }
}
function buildMontmartre(scene, world) {
  const hw = CFG.roadHalfWidth, S = DS;
  // the Sacré-Cœur on its mound beyond the top of the loop, the funicular climbing to it
  sacreCoeur(world, 0, 712 * S / 3); funicular(world, -135 * S / 3, 548 * S / 3, 664 * S / 3, 10);
  // place du Tertre inside the top of the loop: cobbles, easels and their painters, tourists, mimes, pigeons, the terraces
  const sq = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), new THREE.MeshStandardMaterial({ map: TEX.cobble.clone(), roughness: 1 })); sq.material.map.needsUpdate = true; sq.material.map.repeat.set(9, 6); sq.rotation.x = -Math.PI / 2; sq.position.set(0, 0.03, 108); sq.receiveShadow = true; scene.add(sq);
  for (let i = 0; i < nOf(12); i++) { const a = i / 12 * Math.PI * 2; easel(scene, Math.cos(a) * 24, 108 + Math.sin(a) * 14, -a + Math.PI / 2); }
  for (let i = 0; i < nOf(24); i++) person(scene, rand(-30, 30), rand(90, 126), rand(0, 6.28), i % 3 === 0 ? 'press' : null, 0.08);
  for (let i = 0; i < 4; i++) { const m = figure(0x222222, 0xffffff, null); m.position.set(-12 + i * 8, 0, 84); m.rotation.y = Math.PI; scene.add(m); G.crowd.push({ g: m, ph: rand(0, 6), amp: 0.35, base: 0 }); }
  for (let i = 0; i < 30; i++) pigeon(scene, rand(-34, 34), rand(86, 130)); for (let i = 0; i < 14; i++) pigeon(scene, rand(-30, 30), rand(-150, -135));
  cafe(scene, -28, 134, Math.PI, 'LA MÈRE CATHERINE', 0xc8102e, 4); cafe(scene, 28, 134, Math.PI, 'LE CONSULAT', 0x2f6b3a, 4);
  cafe(scene, -120, 75, Math.PI / 2, 'AU LAPIN AGILE', 0xe36f8a, 3); cafe(scene, 60, -128, 0, 'CAFÉ DES DEUX MOULINS', 0xd4af37, 3);
  [[-70, 146], [-88, 143], [-106, 140], [70, 146], [88, 143], [106, 140], [-62, 108], [62, 108], [-62, 86], [62, 86]].forEach(([x, z]) => { if (clearAt(x, z, 10)) house(scene, x, z, 12, 10, rand(8, 11), 0); });
  // the foot of the butte, by the start: the carousel, the Métro, lamps
  carousel(scene, -45, -125); metroEntrance(scene, 22, -132, Math.PI); metroEntrance(scene, -140, -118, Math.PI / 2);
  // the Moulin de la Galette and its vines on the west side
  windmill(scene, -110, 20, Math.PI / 2); vines(scene, -112, -2, 0); vines(scene, -92, 8, 0.2); vines(scene, -125, 42, -0.1);
  // stairs and lamp posts climbing beside the long straight, one flight per ramp
  [-128, -78, -28].forEach(z => { stairs(scene, 193, z, 0, 12); lamp(scene, 190, z + 18, 'paris'); lamp(scene, 196, z - 2, 'paris'); });
  [-120, -70, -20, 30].forEach(z => { lamp(scene, -192, z, 'paris'); stairs(scene, -193, z, Math.PI, 8); });
  // Haussmann blocks and village houses ring the butte; the view up to the basilica stays open
  for (let a = 0; a < Math.PI * 2; a += 0.19) { const r = 248; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (z > 190 && Math.abs(x) < 110) continue; if (!clearAt(x, z, 18)) continue; if (Math.floor(a / 0.19) % 2) house(scene, x, z, rand(16, 22), rand(12, 16), rand(9, 13), -a + Math.PI / 2); else building(scene, x, z, rand(22, 30), rand(16, 22), rand(16, 22), -a + Math.PI / 2); }
  for (let a = 0.05; a < Math.PI * 2; a += 0.17) { const r = 207; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (z > 150 || !clearAt(x, z, 11)) continue; house(scene, x, z, rand(12, 16), rand(9, 12), rand(8, 12), -a + Math.PI / 2); }
  for (let i = 0; i < 40; i++) { const x = rand(-270, 270), z = rand(-240, 240); if (clearAt(x, z, 9) && !(Math.abs(x) < 60 && z > 70 && z < 145)) tree(scene, x, z, Math.random() < 0.6 ? 'round' : 'plane'); }
  // street artists and a few sedans in the lanes inside the loop
  for (let i = 0; i < nOf(6); i++) person(scene, rand(-40, 40), rand(-100, -60), rand(0, 6.28), 'sign', 0.1);
  [[-80, -100, 1.2], [90, -60, -0.3], [-20, 30, 1.6]].forEach(p => { if (clearAt(p[0], p[1], 6)) sedan(scene, p[0], p[1], p[2], pick([0x111111, 0xf6f1e4, 0x8a2b2b])); });
  for (let i = 0; i < G.N; i += 54) { const s = G.samples[i]; const sg = (i / 54) % 2 ? 1 : -1; if (isClear(s.x + s.sx * sg * (hw + 9), s.z + s.sz * sg * (hw + 9), 7)) tree(world, s.x + s.sx * sg * (hw + 9), s.z + s.sz * sg * (hw + 9), 'round'); }
}
function buildMarseille(scene, world) {
  const hw = CFG.roadHalfWidth, S = DS;
  // the harbour south of the quai des Belges, the rive neuve across it, the mouth and its fort to the west
  const water = new THREE.Mesh(new THREE.PlaneGeometry(520, 34), new THREE.MeshStandardMaterial({ map: TEX.water.clone(), roughness: 0.12, metalness: 0.3 })); water.material.map.needsUpdate = true; water.material.map.repeat.set(40, 3); water.rotation.x = -Math.PI / 2; water.position.set(-50, 0.03, -212); scene.add(water);
  const mouth = water.clone(); mouth.geometry = new THREE.PlaneGeometry(120, 150); mouth.material = water.material; mouth.position.set(-370, 0.03, -200); scene.add(mouth);
  G.animated.push(dt => { water.material.map.offset.x += dt * 0.015; water.material.map.offset.y += dt * 0.004; });
  scene.add(box(520, 1.6, 2, 0xbfb398, -50, 0.8, -194)); scene.add(box(520, 1.6, 2, 0xbfb398, -50, 0.8, -230)); scene.add(box(2, 1.6, 36, 0xbfb398, 211, 0.8, -212));
  fort(world, -300 * S, -245 * S, 0); crane(world, 225 * S, -175 * S, -0.6); crane(world, 232 * S, -140 * S, 0.4); crane(world, 60 * S, -238 * S, 2.6);
  bonneMere(world, 40 * S, -268 * S);
  for (let x = -290; x <= 190; x += 34) building(scene, x, -252, 28, 16, rand(12, 18), 0, pick([0xf2b88a, 0xf5d0b0, 0xf0c8a0, 0xf4a5a5, 0xf7dcb4]), pick([0xa0523d, 0xb0623f]));
  for (let x = -280; x <= 190; x += 30) tree(scene, x, -236, 'palm');
  // pontoons with the boats moored along them, bobbing; the ferry-boat crossing to the other quay
  const boats = []; let slot = 0;
  for (let px = -200; px <= 160; px += 60) { scene.add(box(2, 0.5, 30, 0xbfb398, px, 0.1, -210)); for (const sx of [-3.6, 3.6]) for (const bz of [-202, -214]) if (slot++ % 2 === 0 && boats.length < nOf(14)) boats.push(boat(scene, px + sx, bz, Math.PI / 2, pick([0xc8102e, 0x1f3a93, 0xf6f1e4, 0x2e8b57, 0xe0a030, 0x2a7fd4]))); }
  G.animated.push(dt => { boats.forEach((b, i) => { b.position.y = Math.sin(G.time * 1.3 + i) * 0.18; b.rotation.x = Math.sin(G.time * 0.9 + i * 1.7) * 0.05; b.rotation.z = Math.cos(G.time * 1.1 + i) * 0.03; }); });
  ferry(scene, -190, 170, -222);
  ferrisWheel(world, 218 * S, -208 * S, 18);
  // the quai: pastis terraces, fish stalls, the tram, pétanque, seagulls on the posts, palms
  cafe(scene, -120, -186, Math.PI, 'BAR DE LA MARINE', 0xf2c14e, 4); cafe(scene, 40, -186, Math.PI, 'LA SAMARITAINE', 0xf2c14e, 4); cafe(scene, -70, 40, 0, 'CHEZ ÉTIENNE', 0xf2c14e, 3);
  [-60, 10, 80].forEach(x => fishStall(scene, x, -187, Math.PI));
  tram(scene, -150, 150, -181);
  petanque(scene, -165, -186); petanque(scene, 140, -186);
  for (let x = -200; x <= 180; x += 38) seagull(scene, x + rand(-4, 4), -192.5, rand(1.2, 2.2));
  for (let x = -190; x <= 180; x += 36) if (Math.abs(x + 120) > 10 && Math.abs(x - 40) > 10) tree(scene, x, -190, 'palm');
  for (let i = 0; i < nOf(20); i++) person(scene, rand(-200, 180), rand(-191, -183), rand(0, 6.28), i % 4 === 0 ? 'press' : null, 0.06);
  for (let i = 0; i < 18; i++) pigeon(scene, rand(-100, 100), rand(-191, -182));
  // Le Panier inside the loop: ochre and pink houses round a little square, a few palms; the ochre ring round the outside
  const sq = plane(50, 40, 0xcdbc8e, -70, 10); scene.add(sq);
  [[-110, 40], [-110, -10], [-30, -10], [-70, 72], [-40, 50]].forEach(([x, z]) => { if (clearAt(x, z, 10)) house(scene, x, z, 14, 12, rand(9, 13), 0); });
  [[-100, 20], [-45, 25], [-95, -25]].forEach(([x, z]) => tree(scene, x, z, 'palm'));
  for (let i = 0; i < nOf(8); i++) person(scene, rand(-90, -50), rand(-8, 28), rand(0, 6.28), null, 0.05);
  for (let a = 0.05; a < Math.PI + 0.3; a += 0.16) { const r = 207; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (clearAt(x, z, 11)) house(scene, x, z, rand(12, 16), rand(9, 12), rand(8, 12), -a + Math.PI / 2); }
  for (let a = 0.1; a < Math.PI - 0.1; a += 0.18) { const r = 246; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (clearAt(x, z, 18)) building(scene, x, z, rand(22, 30), rand(16, 22), rand(14, 22), -a + Math.PI / 2, pick([0xf2b88a, 0xf5d0b0, 0xf4a5a5, 0xffffff, 0xf7dcb4]), pick([0xa0523d, 0x59606b])); }
  for (let i = 0; i < 36; i++) { const x = rand(-270, 270), z = rand(-150, 270); if (clearAt(x, z, 9)) tree(scene, x, z, Math.random() < 0.5 ? 'palm' : 'round'); }
  for (let i = 0; i < G.N; i += 72) { const s = G.samples[i]; const sg = (i / 72) % 2 ? 1 : -1; if (isClear(s.x + s.sx * sg * (hw + 9), s.z + s.sz * sg * (hw + 9), 7)) tree(world, s.x + s.sx * sg * (hw + 9), s.z + s.sz * sg * (hw + 9), 'palm'); }
}
