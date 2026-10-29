// Track construction: the road, its features and the decor around it.
//
// buildTrack samples the circuit's spline into G.samples / G.N and then lays
// down the road, the kerbs, the item boxes, the features (ramps, pits, dash
// pads, crossings, chicanes), the crowd and the circuit-specific scenery, the
// last from engine/decor/<id>.js on the shared props of engine/decor/street.js.
//
// **Order matters inside this module and cannot be rearranged:** textures()
// runs first so every builder can read TEX.*, and G.samples / G.N are set
// before buildFeatures, crowdZone, grandstand and adBoard read them. The
// builders also register into G.animated, G.crowd, G.itemBoxes, G.ramps,
// G.pits, G.pads and G.crossings as a side effect of building, which is how
// the physics step later finds them.
import * as THREE from 'three';

import { getCustom } from './custom.js';
import { box, canvasTexture, cone, cyl, mat, tag, textPlane } from './primitives.js';
import { buildCyclists } from './cyclists.js';
import { bakeVertexColours, finishOf, mergeByMaterial, mergeInWorld } from './geo.js';
import { CFG, G, getPoly } from './state.js';
import { TEX, textures } from './textures.js';
import { hex, pick, rand } from './util.js';
import { STILL, setDecorScale, still } from './decor/context.js';
import { BUILDERS } from './decor/index.js';
import { ADS, JACKETS, SKINS, adBoard, crowdZone, figure, grandstand, lamp, sedan } from './decor/street.js';

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
  STILL.length = 0;
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
  textures(); STILL.length = 0;
  // The circuit is drawn at track.scale; CFG.samples grows with it so the
  // samples stay about as far apart as before and every distance counted in
  // samples (feature lengths, AI look-ahead, power offsets) keeps its meaning.
  const S = track.scale || 1; setDecorScale(S);
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
  (BUILDERS[track.id] ?? BUILDERS.versailles)(decor, scene);
  spreadDecor(decor, scene, S);
  if (fold) foldStill(scene); else STILL.length = 0;
}

/** The road's surface texture: gravel for the park, cobbles for the butte, asphalt elsewhere. */
export function roadTexOf(track) { return track.gravel ? TEX.gravel : track.cobble ? TEX.cobble : TEX.asphalt; }


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
