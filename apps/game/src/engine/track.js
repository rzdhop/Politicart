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
import { box, canvasTexture, cone, cyl, imgPlane, mat, plane, sph, tag, textPlane } from './primitives.js';
import { buildCyclists } from './cyclists.js';
import { CFG, G, isClear, seg } from './state.js';
import { TEX, textures } from './textures.js';
import { hex, pick, rand } from './util.js';

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
  return g;
}
function crowdZone(scene, from, to, sideSign, dense) {
  const hw = CFG.roadHalfWidth, N = G.N;
  // metal rail
  for (let i = from; i < to; i += 2) { const s = G.samples[i % N]; const n = G.samples[(i + 2) % N]; const dx = (n.x + n.sx * sideSign * (hw + 1.9)) - (s.x + s.sx * sideSign * (hw + 1.9)), dz = (n.z + n.sz * sideSign * (hw + 1.9)) - (s.z + s.sz * sideSign * (hw + 1.9)); const len = Math.hypot(dx, dz); const r = box(0.06, 0.06, len, 0x9a9a9a, 0, 1.0, 0); r.position.set(s.x + s.sx * sideSign * (hw + 1.9) + dx / 2, 1.0, s.z + s.sz * sideSign * (hw + 1.9) + dz / 2); r.rotation.y = Math.atan2(dx, dz); scene.add(r); if (i % 6 === from % 6) scene.add(cyl(0.05, 0.05, 1.1, 0x9a9a9a, s.x + s.sx * sideSign * (hw + 1.9), 0.55, s.z + s.sz * sideSign * (hw + 1.9), 5)); }
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
  g.position.set(s.x + s.sx * sideSign * (hw + 3), 0, s.z + s.sz * sideSign * (hw + 3)); g.rotation.y = Math.atan2(s.sx * sideSign, s.sz * sideSign); scene.add(g);
}
function adBoard(scene, idx, sideSign, text, bg, fg, img) {
  const s = G.samples[idx]; const hw = CFG.roadHalfWidth; const g = new THREE.Group();
  g.add(cyl(0.12, 0.12, 3, 0x444444, -2.6, 1.5, 0, 6)); g.add(cyl(0.12, 0.12, 3, 0x444444, 2.6, 1.5, 0, 6));
  const p = img ? imgPlane(6, 2, img) : textPlane(6, 2, text, bg, fg, 56); p.position.set(0, 3.8, 0); g.add(p); g.add(box(6.2, 2.2, 0.1, 0x222222, 0, 3.8, -0.08));
  g.position.set(s.x + s.sx * sideSign * (hw + 4.5), 0, s.z + s.sz * sideSign * (hw + 4.5)); g.rotation.y = Math.atan2(-s.sx * sideSign, -s.sz * sideSign); scene.add(g);
}
const ADS = [['VOTEZ UTILE', '#1f3a93', '#f6f1e4'], ['SONDAGE : 52 % D’INDÉCIS', '#f6f1e4', '#111'], ['RÉFORME EN COURS', '#c8102e', '#fff'], ['ENGAGEMENT N°12 : ROULER', '#f2c14e', '#111'], ['DÉBAT CE SOIR 21H', '#111', '#f2c14e'], ['LA RÉPUBLIQUE ROULE', '#2f55c7', '#fff'], ['GRAND PRIX DE L’HÉMICYCLE', '#f6f1e4', '#c8102e'], ['AMENDEMENT 49.3', '#5c1a33', '#f6f1e4']];

// ---------- Decor builders ----------
function tree(scene, x, z, kind) {
  const g = new THREE.Group(); const S = seg();
  if (kind === 'plane') { g.add(cyl(0.4, 0.55, 7, 0x9a9282, 0, 3.5, 0, 8)); g.add(sph(3.2, 0x5d9a4a, 0, 8.5, 0, S)); g.add(sph(2.2, 0x6fab55, 1.8, 9.5, 0.8, S)); g.add(sph(2.0, 0x4f8a40, -1.6, 9.2, -0.9, S)); g.add(sph(1.8, 0x6fab55, 0.3, 11, 0, S)); }
  else if (kind === 'cypress') { g.add(cyl(0.2, 0.3, 1.5, 0x6b4a2b, 0, 0.75, 0, 6)); const c = cone(1.1, 7, 0x2f5f32, 0, 4.5, 0, S); g.add(c); }
  else if (kind === 'topiary') { g.add(cyl(0.18, 0.22, 1.2, 0x6b4a2b, 0, 0.6, 0, 6)); g.add(cone(1.0, 2.6, 0x2f6b3a, 0, 2.5, 0, S)); }
  else if (kind === 'orange') { g.add(box(1.6, 1.4, 1.6, 0x2f6b3a, 0, 0.7, 0)); g.add(box(1.7, 0.15, 1.7, 0xf6f1e4, 0, 1.4, 0)); g.add(cyl(0.12, 0.14, 1.2, 0x6b4a2b, 0, 2.0, 0, 6)); g.add(sph(1.1, 0x3f8a3a, 0, 3.2, 0, S)); for (let i = 0; i < 6; i++) g.add(sph(0.12, 0xff8c1a, rand(-0.8, 0.8), 3.2 + rand(-0.6, 0.6), rand(-0.8, 0.8), 6)); }
  else { g.add(cyl(0.35, 0.5, 3, 0x6b4a2b, 0, 1.5, 0, 8)); g.add(sph(2.4, 0x3f8a3a, 0, 4.6, 0, S)); g.add(sph(1.6, 0x4fa044, 1.2, 5.6, 0.6, S)); g.add(sph(1.5, 0x3a7f35, -1.1, 5.4, -0.5, S)); }
  g.position.set(x, 0, z); g.scale.setScalar(rand(0.85, 1.25)); scene.add(g);
}
function lamp(scene, x, z, style) { if (style === 'paris') { scene.add(cyl(0.14, 0.22, 6, 0x2f3a3a, x, 3, z, 8)); scene.add(box(0.7, 0.9, 0.7, 0x2f3a3a, x, 6.4, z)); const l = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.55), new THREE.MeshBasicMaterial({ color: 0xfff2b0 })); l.position.set(x, 6.4, z); scene.add(l); } else { scene.add(cyl(0.12, 0.18, 6, 0x2f3a44, x, 3, z, 6)); const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0 })); l.position.set(x, 6.2, z); scene.add(l); } }
function flagPole(scene, x, z, colors, h) { h = h || 9; scene.add(cyl(0.1, 0.12, h, 0xdddddd, x, h / 2, z, 6)); colors.forEach((c, i) => scene.add(box(1.2, 2.2, 0.06, c, x + 0.6 + i * 1.2, h - 1.2, z))); }
function sedan(scene, x, z, rotY, color, taxi) {
  const g = new THREE.Group(); const S = seg();
  if (taxi) { const sg = textPlane(1.2, 0.4, 'TAXI', '#111', '#f2c14e', 110); sg.position.set(-0.2, 2.4, 0); sg.rotation.y = Math.PI / 2; g.add(sg); g.add(box(1.2, 0.4, 0.1, 0x111111, -0.2, 2.4, -0.06)); }
  g.add(box(4.6, 1.0, 2.0, color, 0, 0.9, 0)); g.add(box(2.6, 0.8, 1.8, color, -0.2, 1.75, 0));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.6, 1.84), new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.2, metalness: 0.4 })); glass.position.set(-0.2, 1.8, 0); g.add(glass);
  const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.35, S); wg.rotateX(Math.PI / 2);
  [[-1.5, 1.0], [1.5, 1.0], [-1.5, -1.0], [1.5, -1.0]].forEach(p => { const w = tag(new THREE.Mesh(wg, mat(0x1a1a1a))); w.position.set(p[0], 0.42, p[1]); g.add(w); });
  [-0.7, 0.7].forEach(zz => { const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff1b0 })); hl.position.set(2.31, 0.95, zz); g.add(hl); });
  if (!taxi) g.add(box(0.05, 0.2, 0.3, 0x2f55c7, -0.2, 2.2, 0.5)); // blue light
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g); return g;
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
function building(scene, x, z, w, d, h, rotY) {
  const m = tag(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: TEX.facade.clone(), roughness: 0.9 })));
  m.material.map.needsUpdate = true; m.material.map.repeat.set(Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(h / 9)));
  m.position.set(x, h / 2, z); m.rotation.y = rotY || 0; scene.add(m);
  const roof = box(w * 0.96, 2.6, d * 0.96, 0x59606b, 0, h + 1.3, 0); roof.position.set(x, h + 1.3, z); roof.rotation.y = rotY || 0; scene.add(roof);
  for (let i = -w / 2 + 4; i < w / 2 - 2; i += 6) { const ch = box(0.9, 1.6, 0.9, 0x8a8a8a, 0, 0, 0); const a = (rotY || 0); ch.position.set(x + Math.cos(a) * i, h + 3.2, z - Math.sin(a) * i); scene.add(ch); }
}
function palace(scene, x, z, w, h, d, rotY, roofColor) {
  const g = new THREE.Group();
  const body = tag(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: TEX.palace.clone(), roughness: 0.9 }))); body.material.map.needsUpdate = true; body.material.map.repeat.set(Math.round(w / 10), Math.round(h / 10)); body.position.y = h / 2; g.add(body);
  g.add(box(w + 1, 1.4, d + 1, 0xd9cfb8, 0, h + 0.7, 0));
  const roof = box(w - 2, 4, d - 3, roofColor || 0x4a4f5a, 0, h + 3.4, 0); g.add(roof);
  const central = box(w * 0.22, h + 6, d + 2, 0xeadfc8, 0, (h + 6) / 2, 0); g.add(central); g.add(box(w * 0.22 + 1, 1.2, d + 3, 0xd9cfb8, 0, h + 6.6, 0));
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.11, d + 3, 3, 1), mat(0xe8dcc0)); ped.rotation.z = Math.PI / 2; ped.scale.set(1, 1, 0.45); ped.position.set(0, h + 8.5, 0); g.add(ped);
  for (let i = -3; i <= 3; i++) g.add(cyl(0.9, 1.0, h + 1, 0xf3ead6, i * (w * 0.22) / 7, (h + 1) / 2, d / 2 + 1.5, 10));
  g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g); return g;
}
function gate(scene, x, z, rotY, width) {
  const g = new THREE.Group();
  [-width / 2, width / 2].forEach(px => { g.add(box(2.2, 7, 2.2, 0xd9cfb8, px, 3.5, 0)); g.add(sph(0.9, 0xd4af37, px, 7.8, 0, 12)); });
  for (let px = -width / 2 + 2.4; px < width / 2 - 2; px += 1.1) { g.add(cyl(0.07, 0.07, 5.5, 0x1a1a1a, px, 2.75, 0, 5)); g.add(cone(0.12, 0.4, 0xd4af37, px, 5.7, 0, 5)); }
  g.add(box(width - 4, 0.12, 0.12, 0x1a1a1a, 0, 1.2, 0)); g.add(box(width - 4, 0.12, 0.12, 0x1a1a1a, 0, 4.6, 0)); g.add(box(width - 4, 0.3, 0.3, 0xd4af37, 0, 3.0, 0));
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
}
function obelisk(scene, x, z) { scene.add(box(6, 6, 6, 0x9a8f7a, x, 3, z)); scene.add(box(4, 1.5, 4, 0xb0a48c, x, 6.75, z)); const o = cyl(0.9, 1.8, 20, 0xc9a56a, x, 17.5, z, 4); o.rotation.y = Math.PI / 4; scene.add(o); const t = cone(1.2, 2.5, 0xf2c14e, x, 28.7, z, 4); t.rotation.y = Math.PI / 4; scene.add(t); }
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
function hedgeWall(scene, x, z, w, d, h) { scene.add(box(w, h, d, 0x2f6b3a, x, h / 2, z)); scene.add(box(w + 0.2, 0.3, d + 0.2, 0x3a7f45, x, h + 0.1, z)); }
function statue(scene, x, z, rot) { scene.add(box(1.6, 2.2, 1.6, 0xcfc6b5, x, 1.1, z)); const f = figure(0xe8e2d6, 0xe8e2d6, null); f.position.set(x, 2.2, z); f.rotation.y = rot || 0; f.scale.setScalar(1.15); scene.add(f); }
function parterre(scene, x, z, w, d) { const p = plane(w, d, 0x4f8f3f, x, z); scene.add(p); const inner = plane(w - 3, d - 3, pick([0xe36f8a, 0xf2c14e, 0xd95f5f, 0xf0f0f0, 0x8a5fc8]), x, z); inner.position.y = 0.04; scene.add(inner); const edge = box(w, 0.6, 0.5, 0x2f6b3a, x, 0.3, z - d / 2); scene.add(edge); const e2 = edge.clone(); e2.position.z = z + d / 2; scene.add(e2); const e3 = box(0.5, 0.6, d, 0x2f6b3a, x - w / 2, 0.3, z); scene.add(e3); const e4 = e3.clone(); e4.position.x = x + w / 2; scene.add(e4); }
function kiosk(scene, x, z, color, signText, rotY) { const g = new THREE.Group(); g.add(box(5, 3.2, 4, 0xf3ead6, 0, 1.6, 0)); g.add(box(6, 0.4, 5, color, 0, 3.4, 0)); g.add(cone(3.4, 2.5, color, 0, 4.8, 0, 4)); const sign = textPlane(4.6, 1.15, signText, '#fffaf0', '#222', 60); sign.position.set(0, 2.6, 2.05); g.add(sign); g.add(box(5.2, 0.1, 1.6, color, 0, 2.2, 2.6)); g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g); }
function shopRow(scene, x0, x1, z, facing) {
  const names = [['BOULANGERIE', '#c8102e'], ['PHARMACIE', '#2e8b57'], ['CAFÉ DE LA PAIX', '#1f3a93'], ['TABAC · PRESSE', '#b8102e'], ['GALERIE', '#5c1a33'], ['CHOCOLATIER', '#6b4a2b'], ['FLEURISTE', '#e36f8a'], ['BRASSERIE', '#e0a030']];
  let i = 0;
  for (let x = x0; x < x1; x += 20) { building(scene, x + 10, z, 20, 14, 18, 0); const n = names[i++ % names.length]; const aw = box(18, 0.2, 2.6, parseInt(n[1].slice(1), 16), x + 10, 3.6, z + facing * 8.2); aw.rotation.x = facing * 0.25; scene.add(aw); const sg = textPlane(10, 1.2, n[0], n[1], '#fffaf0', 70); sg.position.set(x + 10, 4.6, z + facing * 7.1); sg.rotation.y = facing > 0 ? 0 : Math.PI; scene.add(sg); const win = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshStandardMaterial({ color: 0x1e2a3a, roughness: 0.2, metalness: 0.5 })); win.position.set(x + 10, 1.6, z + facing * 7.05); win.rotation.y = facing > 0 ? 0 : Math.PI; scene.add(win); }
}
function pigeon(scene, x, z) { const g = new THREE.Group(); g.add(sph(0.22, 0x8a8a92, 0, 0.22, 0, 8)); g.add(sph(0.12, 0x6a6a74, 0.2, 0.42, 0, 6)); g.add(cone(0.04, 0.12, 0xe0a030, 0.33, 0.4, 0, 4)); g.position.set(x, 0, z); g.rotation.y = rand(0, 6.28); scene.add(g); }
function bouquiniste(scene, x, z, rotY) { const g = new THREE.Group(); g.add(box(2.2, 1.1, 0.9, 0x2f5f32, 0, 1.4, 0)); g.add(box(2.3, 0.1, 1.0, 0x244a28, 0, 1.95, 0)); const lid = box(2.2, 0.08, 0.9, 0x2f5f32, 0, 2.3, -0.6); lid.rotation.x = -1.1; g.add(lid); for (let i = 0; i < 5; i++) g.add(box(0.3, 0.5, 0.7, pick([0xc8102e, 0xf2c14e, 0x1f3a93, 0xf6f1e4, 0x6b4a2b]), -0.8 + i * 0.4, 1.95 + 0.25, 0)); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g); }
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
export function buildTrack(scene, track) {
  textures();
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

  // road surface (asphalt or gravel)
  const roadTex = track.gravel ? TEX.gravel : TEX.asphalt;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) { const s = samples[i % N]; const v = (i * step) / (track.gravel ? 10 : 20); pos.push(s.x + s.sx * hw, 0.05, s.z + s.sz * hw, s.x - s.sx * hw, 0.05, s.z - s.sz * hw); uv.push(0, v, 1, v); }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx); rg.computeVertexNormals();
  const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95, side: THREE.DoubleSide })); road.receiveShadow = true; scene.add(road);

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
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 3.2, 3), new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide })); bm.position.set(0, 8, 0); gantry.add(bm); scene.add(gantry);

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
  // themed decor, laid out at scale 1 and then spread out to the circuit's scale
  const decor = new THREE.Group();
  if (track.id === 'elysee') buildElysee(decor, scene);
  else if (track.id === 'bourbon') buildBourbon(decor, scene);
  else buildVersailles(decor, scene);
  spreadDecor(decor, scene, S);
}

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

function buildElysee(scene, world) {
  const hw = CFG.roadHalfWidth;
  // palace, cour d'honneur, gate on the Faubourg
  palace(scene, 0, 72, 76, 15, 24, 0, 0x4a4f5a);
  const court = new THREE.Mesh(new THREE.PlaneGeometry(80, 52), new THREE.MeshStandardMaterial({ map: TEX.cobble.clone(), roughness: 1 })); court.material.map.needsUpdate = true; court.material.map.repeat.set(10, 6); court.rotation.x = -Math.PI / 2; court.position.set(0, 0.03, 34); court.receiveShadow = true; scene.add(court);
  [-40, 40].forEach(x => scene.add(box(2, 14, 52, 0xeadfc8, x, 7, 34)));                // wings around the courtyard
  gate(scene, 0, 8, 0, 26);
  [-18, 18].forEach(x => { const gd = figure(0x1f2a5e, pick(SKINS), 'guard'); gd.position.set(x, 0, 10); gd.rotation.y = Math.PI; scene.add(gd); });
  [[-22, 30, 0.3], [-12, 42, 0.1], [20, 32, -0.2], [12, 46, 0.4]].forEach(p => sedan(scene, p[0], p[1], p[2], 0x111111));
  flagPole(scene, 0, 86, [0x2f55c7, 0xffffff, 0xe63946], 26);
  // press scrum on the street in front of the gate, behind a rail
  for (let i = 0; i < 14; i++) { const f = figure(pick([0x222222, 0x3b4a6b, 0x5a5a5a]), pick(SKINS), 'press'); f.position.set(rand(-20, 20), 0, rand(-8, -2)); f.rotation.y = 0; scene.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: 0.1, base: 0 }); }
  scene.add(box(44, 0.06, 0.06, 0x9a9a9a, 0, 1.0, -1)); for (let x = -22; x <= 22; x += 4) scene.add(cyl(0.05, 0.05, 1.1, 0x9a9a9a, x, 0.55, -1, 5));
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
}
function buildBourbon(scene, world) {
  const hw = CFG.roadHalfWidth;
  // the Seine, embankment, bridge, obelisk on the far bank
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 90), new THREE.MeshStandardMaterial({ map: TEX.water.clone(), roughness: 0.15, metalness: 0.3 })); water.material.map.needsUpdate = true; water.material.map.repeat.set(60, 4); water.rotation.x = -Math.PI / 2; water.position.set(0, -0.6, -170); scene.add(water);
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
  const canal = new THREE.Mesh(new THREE.PlaneGeometry(44, 240), new THREE.MeshStandardMaterial({ map: TEX.water.clone(), roughness: 0.15, metalness: 0.3 })); canal.material.map.needsUpdate = true; canal.material.map.repeat.set(2, 12); canal.rotation.x = -Math.PI / 2; canal.position.set(0, -0.4, -305); scene.add(canal);
  const cross = canal.clone(); cross.geometry = new THREE.PlaneGeometry(240, 36); cross.position.set(0, -0.4, -330); scene.add(cross);
  for (let z = -200; z >= -420; z -= 18) { tree(scene, -34, z, 'cypress'); tree(scene, 34, z, 'cypress'); }
  for (let i = 0; i < 160; i++) { const x = rand(-330, 330), z = rand(-330, 100); if (clearAt(x, z, 9) && Math.abs(x) > 110) tree(scene, x, z, Math.random() < 0.5 ? 'cypress' : 'round'); }
  // topiary and gravel edges all along the circuit
  for (let i = 0; i < G.N; i += 12) { const s = G.samples[i]; const sg = (i / 12) % 2 ? 1 : -1; const x = s.x + s.sx * sg * (CFG.roadHalfWidth + 8), z = s.z + s.sz * sg * (CFG.roadHalfWidth + 8); if (isClear(x, z, 6.5)) tree(world, x, z, 'topiary'); }
  for (let i = 0; i < 10; i++) { const f = figure(0x1f2a5e, pick(SKINS), 'guard'); f.position.set(-50 + i * 11, 0, 164); f.rotation.y = Math.PI; scene.add(f); }
}
