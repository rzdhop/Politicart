// Track construction: the road, its features and the decor around it.
//
// buildTrack samples the circuit's spline into G.samples / G.N -- each sample
// with its height `y` and `slope` from the track's elevation profile, its
// half-width `hw`, its camber `bank` and its side wind `wind` (DEC-050) -- and
// then lays down the road, the kerbs, the item boxes, the features (ramps,
// pits, dash pads, crossings, chicanes, static obstacles), the crowd and the
// circuit-specific scenery, the last from engine/decor/<id>.js on the shared
// props of engine/decor/street.js.
//
// The race's seed (DEC-049) picks the layout at the top: G.layout is the
// track's fixed skeleton plus the variant the seed drew (engine/layout.js),
// and every draw that shapes the race -- the obstacles' kinds and yaw, the
// chicanes' side, the crossings' phase, the cyclists' count, spawns and
// speeds -- comes from streams derived from the seed, so the server worker
// and every client build the same gameplay state. Static obstacles take an
// entity id at build, in layout order, so snapshots can name them; the
// counter is reset before buildTrack (race.js startField). The decor's own
// draws stay cosmetic and on Math.random.
//
// **Order matters inside this module and cannot be rearranged:** textures()
// runs first so every builder can read TEX.*, and G.samples / G.N are set
// before buildFeatures, crowdZone, grandstand and adBoard read them. The
// builders also register into G.animated, G.crowd, G.itemBoxes, G.ramps,
// G.pits, G.pads, G.crossings and G.hazards as a side effect of building,
// which is how the physics step later finds them.
import * as THREE from 'three';

import { getCustom } from './custom.js';
import { box, canvasTexture, cone, cyl, mat, tag, textPlane } from './primitives.js';
import { buildCyclists } from './cyclists.js';
import { bakeVertexColours, finishOf, mergeByMaterial, mergeInWorld } from './geo.js';
import { chooseLayout, profileHeights } from './layout.js';
import { SALT_CYCLISTS, SALT_FEATURES, SALT_RACE, derive, makeRng } from './seed.js';
import { CFG, G, bikeLaneOf, disposable, getPoly, nextEntityId } from './state.js';
import { TEX, bakeSurface, surface, textures } from './textures.js';
import { pick, rand } from './util.js';
import { EMBANK, PAVEMENT, STILL, setDecorScale, setTerrain, still, terrainY, yAt } from './decor/context.js';
import { BUILDERS, DECOR_SURFACES } from './decor/index.js';
import { ADS, JACKETS, SKINS, adBoard, crowdZone, figure, flagPole, grandstand, lamp, sedan } from './decor/street.js';

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

// ---------- The samples' shape: width, camber, wind, bumps (DEC-050) ----------
/** A smooth 0..1..0 window over `len` samples: eased in over the first fifth and out over the last. */
const ease = (rel, len) => { const e = Math.max(1, len * 0.2); return Math.min(1, rel / e, (len - rel) / e); };
/**
 * Apply the layout's shaping features to the samples just drawn: `narrow`
 * pinches `hw` to `w`, `bank` cambers by `a` radians, `wind` pushes sideways
 * by `push` m/s, `bump` adds a hump of `h` to the height. The slopes are
 * computed after, from the final heights.
 */
function shapeSamples(samples, features, step) {
  const N = samples.length;
  for (const f of features) {
    if (!['narrow', 'bank', 'wind', 'bump'].includes(f.t)) continue;
    const i0 = Math.floor(f.f * N), len = f.len || 6;
    for (let rel = 0; rel < len; rel++) {
      const s = samples[(i0 + rel) % N], k = ease(rel + 0.5, len);
      if (f.t === 'narrow') s.hw = Math.min(s.hw, s.hw + (f.w - s.hw) * k);
      else if (f.t === 'bank') s.bank += (f.a ?? 0.1) * k;
      else if (f.t === 'wind') s.wind += (f.push ?? 3) * k;
      else if (f.t === 'bump') s.y += (f.h ?? 0.5) * Math.sin(Math.PI * (rel + 0.5) / len);
    }
  }
  for (let i = 0; i < N; i++) samples[i].slope = (samples[(i + 1) % N].y - samples[(i - 1 + N) % N].y) / (2 * step);
}

// ---------- Static obstacles (DEC-049) ----------
/** The obstacle kinds a layout may name; an obstacle without a kind draws one. */
export const OBSTACLE_KINDS = ['sedan', 'van', 'barrier', 'stall', 'bins', 'scaffold'];
/** A police (Vauban) panel on its feet, 7.8 m wide, facing +z, into group g. */
function vaubanPanel(g) {
  for (let b = -2.6; b <= 2.6; b += 2.6) { g.add(box(2.4, 0.08, 0.08, 0x9a9a9a, b, 1.05, 0)); g.add(box(2.4, 0.08, 0.08, 0x9a9a9a, b, 0.55, 0)); g.add(cyl(0.06, 0.06, 1.1, 0x9a9a9a, b - 1.2, 0.55, 0, 5)); g.add(cyl(0.06, 0.06, 1.1, 0x9a9a9a, b + 1.2, 0.55, 0, 5)); }
  g.add(box(7.8, 0.5, 0.06, 0xc8102e, 0, 0.8, 0.05));
}
/**
 * The mesh of a static obstacle of `kind` at (x, y, z) turned by `yaw`, added
 * to `scene` and marked still (the fold keeps the group, so it stays
 * removable when mown). Returns { g, r }: the group and its contact radius.
 */
function obstacleMesh(scene, kind, x, y, z, yaw, rng) {
  if (kind === 'sedan') { const g = sedan(scene, x, z, yaw, rng.pick([0x111111, 0x2b2b35, 0xf6f1e4, 0x8a2b2b, 0x1f3a93])); g.position.y = y; return { g, r: 3.0 }; }
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  if (kind === 'van') {
    const c = rng.pick([0xf6f1e4, 0xe0a030, 0x2a7d50, 0x9a9a92]);
    g.add(box(5.4, 2.0, 2.2, c, 0, 1.5, 0)); g.add(box(1.6, 1.3, 2.1, c, -3.1, 1.15, 0)); g.add(box(1.4, 0.5, 2.0, 0x223344, -3.0, 1.9, 0));
    [[-2.4, 1.0], [1.8, 1.0], [-2.4, -1.0], [1.8, -1.0]].forEach(p => { const w = cyl(0.42, 0.42, 0.35, 0x1a1a1a, p[0], 0.42, p[1], 10); w.rotation.x = Math.PI / 2; g.add(w); });
    scene.add(still(g)); return { g, r: 3.4 };
  }
  if (kind === 'barrier') { vaubanPanel(g); [-3, 3].forEach(b => g.add(cone(0.4, 0.9, 0xff6a00, b, 0.45, 1.4, 8))); scene.add(still(g)); return { g, r: 4.2 }; }
  if (kind === 'stall') {
    const c = rng.pick([0xc8102e, 0x1f3a93, 0x2e8b57, 0xe0a030]);
    g.add(box(4, 1.0, 2.2, 0x8b5a2b, 0, 0.5, 0)); g.add(box(4.2, 0.1, 2.4, 0xf6f1e4, 0, 1.05, 0));
    [[-1.9, -1.0], [1.9, -1.0], [-1.9, 1.0], [1.9, 1.0]].forEach(p => g.add(cyl(0.05, 0.05, 2.6, 0x555555, p[0], 1.3, p[1], 5)));
    const awn = box(4.6, 0.08, 2.8, c, 0, 2.6, 0); awn.rotation.x = 0.12; g.add(awn);
    for (let i = 0; i < 6; i++) g.add(box(0.5, 0.3, 0.5, rng.pick([0xe63946, 0xf2c14e, 0x9ad04f, 0xff7f11]), -1.5 + i * 0.6, 1.25, (i % 2 ? 0.5 : -0.5)));
    scene.add(still(g)); return { g, r: 2.8 };
  }
  if (kind === 'bins') {
    [-1.2, 0, 1.2].forEach((o, i) => { g.add(box(1.0, 1.2, 1.0, i === 1 ? 0xe0a030 : 0x3a5a3a, o, 0.6, 0)); g.add(box(1.04, 0.1, 1.04, 0x222222, o, 1.25, 0)); });
    scene.add(still(g)); return { g, r: 1.8 };
  }
  // scaffold: poles, planks on three levels, a tarpaulin at the back
  for (const px of [-2.8, 0, 2.8]) for (const pz of [-0.8, 0.8]) g.add(cyl(0.06, 0.06, 6, 0x9a9a9a, px, 3, pz, 5));
  for (const py of [2, 4, 6]) { g.add(box(6, 0.08, 1.8, 0xc9a56a, 0, py, 0)); g.add(box(6, 0.06, 0.06, 0x9a9a9a, 0, py + 0.9, -0.8)); }
  g.add(box(6, 6, 0.05, 0x2a7d50, 0, 3, -0.95)); g.add(box(6.4, 0.3, 2.0, 0xc8102e, 0, 0.15, 0));
  scene.add(still(g)); return { g, r: 3.6 };
}

// ---------- Track features: ramps, pits, dash pads, crossings, chicanes, obstacles ----------
function rampTex() { if (!TEX.ramp) { TEX.ramp = canvasTexture(256, 256, (c, w, h) => { c.fillStyle = '#f2c14e'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; for (let y = -64; y < h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w / 2, y + 40); c.lineTo(w, y); c.lineTo(w, y + 28); c.lineTo(w / 2, y + 68); c.lineTo(0, y + 28); c.closePath(); c.fill(); } }); TEX.ramp.wrapS = TEX.ramp.wrapT = THREE.RepeatWrapping; TEX.ramp.repeat.set(1, 3); } return TEX.ramp; }
function padTex() { if (!TEX.pad) { TEX.pad = canvasTexture(256, 256, (c, w, h) => { c.fillStyle = '#1f3a93'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2c14e'; for (let y = 20; y < h; y += 80) { c.beginPath(); c.moveTo(20, y + 50); c.lineTo(w / 2, y); c.lineTo(w - 20, y + 50); c.lineTo(w - 20, y + 30); c.lineTo(w / 2, y - 20); c.lineTo(20, y + 30); c.closePath(); c.fill(); } }); } return TEX.pad; }
/**
 * Build the layout's features. `rng` is the features stream: it draws the
 * crossings' phase, the chicanes' first side and the obstacles' kinds and
 * yaw, in layout order, so every side gets the same race. Chicane blocks and
 * obstacles enter G.hazards with an entity id each.
 */
function buildFeatures(scene, layout, rng) {
  G.ramps = []; G.pits = []; G.pads = []; G.crossings = [];
  const N = G.N;
  for (const f of layout.features || []) {
    const i0 = Math.floor(f.f * N); const a = G.samples[i0]; const hw = a.hw;
    if (f.t === 'ramp') {
      const len = f.len || 10, h = f.h || 3.4; const b = G.samples[(i0 + len) % N]; const L = Math.hypot(b.x - a.x, b.z - a.z); const slope = Math.atan2(h, L);
      G.ramps.push({ i0, len, h, slope, L, y0: a.y });
      const g = new THREE.Group(); g.position.set((a.x + b.x) / 2, a.y, (a.z + b.z) / 2); g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      const plank = tag(new THREE.Mesh(new THREE.BoxGeometry(hw * 2 - 1, 0.4, L / Math.cos(slope)), new THREE.MeshStandardMaterial({ map: rampTex(), roughness: 0.8 }))); plank.position.y = h / 2 - 0.1; plank.rotation.x = -slope; g.add(plank);
      [-hw + 0.5, hw - 0.5].forEach(x => { const sk = box(0.3, h, L, 0xc8102e, x, h / 2 - 0.05, 0); const sl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, L / Math.cos(slope)), mat(0xf6f1e4)); sl.position.set(x, h / 2 + 0.1, 0); sl.rotation.x = -slope; g.add(sl); g.add(sk); });
      g.add(box(hw * 2 - 1, h, 0.5, 0xc8102e, 0, h / 2, L / 2 - 0.25)); scene.add(g);
    } else if (f.t === 'pit') {
      const len = f.len || 9; const b = G.samples[(i0 + len) % N]; const L = Math.hypot(b.x - a.x, b.z - a.z); G.pits.push({ i0, len, kind: f.kind });
      const g = new THREE.Group(); g.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      if (f.kind === 'water') { const w = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 1, L), disposable(new THREE.MeshStandardMaterial({ map: TEX.water, normalMap: surface('water').normalMap, roughness: 0.15, metalness: 0.3 }))); w.rotation.x = -Math.PI / 2; w.position.y = 0.12; g.add(w); [-hw - 0.3, hw + 0.3].forEach(x => g.add(box(0.6, 0.5, L, 0xd9cfb8, x, 0.25, 0))); G.animated.push(dt => { w.material.map.offset.y += dt * 0.05; }); }
      else if (f.kind === 'works') { const t = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, L), mat(0x4a3b2a)); t.rotation.x = -Math.PI / 2; t.position.y = 0.09; g.add(t); for (let z = -L / 2 + 1; z < L / 2; z += 3) { [-hw + 1, hw - 1].forEach(x => { g.add(cone(0.45, 1.1, 0xff6a00, x, 0.55, z, 8)); g.add(box(0.9, 0.06, 0.9, 0x222222, x, 0.06, z)); }); } g.add(box(hw * 2, 0.4, 0.4, 0xe0a030, 0, 0.5, -L / 2)); const sg = textPlane(4, 1.2, 'TRAVAUX', '#f2c14e', '#111', 90); sg.position.set(hw + 2.4, 2.4, -L / 2 - 1); g.add(sg); g.add(cyl(0.06, 0.06, 2, 0x555555, hw + 2.4, 1, -L / 2 - 1, 5)); for (let i = 0; i < 3; i++) { const wk = figure(0xff6a00, pick(SKINS), null); wk.position.set(rand(-4, 4), 0, rand(-L / 2 + 2, L / 2 - 2)); wk.rotation.y = rand(0, 6); g.add(wk); G.crowd.push({ g: wk, ph: rand(0, 6), amp: 0.08, base: 0 }); } }
      else if (f.kind === 'manif') { for (let i = 0; i < 16; i++) { const m = figure(pick(JACKETS), pick(SKINS), i % 3 === 0 ? 'sign' : i % 4 === 1 ? 'flag' : null); m.position.set(rand(-hw + 1.5, hw - 1.5), 0, rand(-L / 2 + 1.5, L / 2 - 1.5)); m.rotation.y = rand(0, 6); g.add(m); G.crowd.push({ g: m, ph: rand(0, 6), amp: 0.3, base: 0 }); } const ban = textPlane(hw * 2 - 2, 1.4, 'TOUS EN GRÈVE', '#c8102e', '#fff', 80); ban.position.set(0, 2.6, 0); g.add(ban); [-hw + 1, hw - 1].forEach(x => g.add(cyl(0.06, 0.06, 3.2, 0x8b5a2b, x, 1.6, 0, 5))); }
      scene.add(g);
    } else if (f.t === 'pad') {
      G.pads.push({ i0, len: 3 }); const b = G.samples[(i0 + 3) % N]; const L = Math.hypot(b.x - a.x, b.z - a.z);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 - 2, L), new THREE.MeshBasicMaterial({ map: padTex() })); p.rotation.x = -Math.PI / 2;
      const holder = new THREE.Group(); holder.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.09, (a.z + b.z) / 2); holder.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); holder.add(p); scene.add(holder);
    } else if (f.t === 'crossing') {
      const yaw = Math.atan2(a.sx, a.sz); const car = sedan(scene, a.x, a.z, yaw, f.color || 0x111111, f.taxi); car.position.y = a.y;
      const street = new THREE.Mesh(new THREE.PlaneGeometry(14, 90), new THREE.MeshStandardMaterial({ map: TEX.asphalt, roughness: 1 })); street.rotation.x = -Math.PI / 2; const sh = new THREE.Group(); sh.position.set(a.x, a.y + 0.04, a.z); sh.rotation.y = yaw; sh.add(street); scene.add(sh);
      const sg = textPlane(3, 1, 'PRIORITÉ', '#fff', '#c8102e', 90); sg.position.set(a.x + a.sx * (hw + 2.5) + a.tx * 6, a.y + 2.4, a.z + a.sz * (hw + 2.5) + a.tz * 6); sg.rotation.y = Math.atan2(-a.tx, -a.tz); scene.add(sg);
      G.crossings.push({ s: a, mesh: car, t: rng.rand(0, 20), range: 40, speed: f.speed || 14 });
    } else if (f.t === 'chicane') {
      // two blocks per gate, so each gate still closes two thirds of the road whatever its width; the first gate's side is the seed's
      const first = f.side ?? rng.pick([1, -1]);
      for (let j = 0; j < (f.n || 3); j++) for (const off of [0.27, 0.67]) { const s = G.samples[(i0 + j * 9) % N]; const lat = (j % 2 ? -first : first) * (s.hw - s.hw * off); const x = s.x + s.sx * lat, z = s.z + s.sz * lat; const yaw = Math.atan2(s.tx, s.tz); const g = new THREE.Group(); g.position.set(x, s.y + lat * s.bank, z); g.rotation.y = yaw;
        if (f.kind === 'hedge') { g.add(box(7, 2.6, 2.4, 0x2f6b3a, 0, 1.3, 0)); g.add(box(7.2, 0.3, 2.6, 0x3a7f45, 0, 2.7, 0)); g.add(cone(1.0, 2.2, 0x2f6b3a, 0, 3.9, 0, 12)); }
        else { vaubanPanel(g); [-3, 3].forEach(b => g.add(cone(0.4, 0.9, 0xff6a00, b, 0.45, 1.6, 8))); const gd = figure(0x1f2a5e, pick(SKINS), null); gd.position.set(3.2, 0, -1.2); g.add(gd); }
        scene.add(g); G.hazards.push({ id: nextEntityId(), type: 'obstacle', kind: f.kind === 'hedge' ? 'hedge' : 'vauban', x, z, y: g.position.y, mesh: g, life: 1e9, r: f.kind === 'hedge' ? 4.3 : 4.2, stun: 0, owner: null, team: null });
      }
    } else if (f.t === 'obstacle') {
      const kind = OBSTACLE_KINDS.includes(f.kind) ? f.kind : rng.pick(OBSTACLE_KINDS);
      const lat = f.lat ?? 0, x = a.x + a.sx * lat, z = a.z + a.sz * lat, y = a.y + lat * a.bank;
      const along = Math.atan2(a.tx, a.tz); const yaw = f.yaw ?? (kind === 'sedan' || kind === 'van' ? along + rng.rand(-0.25, 0.25) : along + Math.PI / 2 + rng.rand(-0.3, 0.3));
      const { g, r } = obstacleMesh(scene, kind, x, y, z, yaw, rng);
      G.hazards.push({ id: nextEntityId(), type: 'obstacle', kind, x, z, y, mesh: g, life: 1e9, r, stun: 0, owner: null, team: null });
    } else if (f.t === 'wind') {
      // the mistral zone is announced: a sign and a flag pole at its start, on the right
      const sg = textPlane(3.6, 1, 'VENT VIOLENT', '#111', '#f2c14e', 90); sg.position.set(a.x + a.sx * (hw + 2.4), a.y + 2.4, a.z + a.sz * (hw + 2.4)); sg.rotation.y = Math.atan2(-a.tx, -a.tz); scene.add(sg);
      scene.add(cyl(0.06, 0.06, 2, 0x555555, a.x + a.sx * (hw + 2.4), a.y + 1, a.z + a.sz * (hw + 2.4), 5));
      flagPole(scene, a.x + a.sx * (hw + 4), a.z + a.sz * (hw + 4), [0x2f55c7, 0xffffff, 0xe63946], 9, a.y);
    } else if (f.t === 'narrow') {
      const sg = textPlane(3.6, 1, 'VOIE RÉTRÉCIE', '#fff', '#c8102e', 90); sg.position.set(a.x + a.sx * (hw + 2.4), a.y + 2.4, a.z + a.sz * (hw + 2.4)); sg.rotation.y = Math.atan2(-a.tx, -a.tz); scene.add(sg);
      scene.add(cyl(0.06, 0.06, 2, 0x555555, a.x + a.sx * (hw + 2.4), a.y + 1, a.z + a.sz * (hw + 2.4), 5));
    }
  }
}
// ---------- Bike lane ----------
// A green painted lane along the right-hand edge of the road, behind a dashed
// white line, with a cycle pictogram every so often. Its offsets follow the
// road's width sample by sample (bikeLaneOf). The cyclists who use it (and
// leave it whenever they like) live in cyclists.js.
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
/** The height of the road's surface at lateral offset `lat` of sample s: its own height plus the camber. */
const roadY = (s, lat) => s.y + lat * s.bank;
function bikeLane(scene, track, strip) {
  const N = G.N, lane = bikeLaneOf(0);   // offsets relative to the sample's own half-width
  strip(lane.inner, lane.outer, 0.062, 0.062, 0, 1, 0x2a7d50, 0x2a7d50, 0.95);                    // the green lane
  // dashed separation line: one dash every four samples
  const pos = [], ix = [];
  for (let i = 0; i < N; i += 4) {
    const a = G.samples[i], b = G.samples[(i + 2) % N]; const n = pos.length / 3;
    for (const s of [a, b]) for (const l of [s.hw + lane.inner - 0.15, s.hw + lane.inner + 0.15]) pos.push(s.x + s.sx * l, roadY(s, l) + 0.066, s.z + s.sz * l);
    ix.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ix); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf6f1e4, side: THREE.DoubleSide })));
  // pictograms, pointing the way the lane runs
  for (let i = 20; i < N; i += 70) {
    const s = G.samples[i]; const mid = s.hw + (lane.inner + lane.outer) / 2; const p = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: bikeTex(), transparent: true }));
    p.rotation.x = -Math.PI / 2; p.rotation.z = Math.PI / 2;
    const h = new THREE.Group(); h.position.set(s.x + s.sx * mid, roadY(s, mid) + 0.07, s.z + s.sz * mid); h.rotation.y = Math.atan2(s.tx, s.tz); h.add(p); scene.add(h);
  }
}

// ---------- Track construction ----------
/** Build circuit `track` into `scene`: every phase of buildTrackPhases at once, `opts` as there ({ fold, seed }). */
export function buildTrack(scene, track, opts = {}) {
  for (const _phase of buildTrackPhases(scene, track, opts)) { /* every phase, at once */ }
}

/**
 * The names of buildTrack's phases, in order: what buildTrackPhases yields
 * after each. The pre-build (prebuild.js) runs them one or a few per frame.
 */
export const TRACK_PHASES = Object.freeze(['textures', 'road', 'strips', 'furniture', 'features', 'cyclists', 'decor', 'fold']);
/**
 * Inside a heavy phase the generator also yields, under that phase's name,
 * every SLICE_SAMPLES samples and every SLICE_CHILDREN decor pieces spread
 * (and wherever a circuit's builder yields), so one slice of the pre-build
 * stays a few milliseconds and never stalls the circuits screen.
 */
const SLICE_SAMPLES = 256, SLICE_CHILDREN = 48;

/**
 * buildTrack as a generator: the same statements in the same order, with a
 * yield between phases (named as TRACK_PHASES; a heavy phase yields its own
 * name several times), so the pre-build can spread the work over frames
 * while the player is still choosing (DEC-055). `fold`
 * (default: on "légers") folds the still decor into fewer draws (foldStill).
 * `seed` is the race's (DEC-049): it picks the layout and seeds every draw
 * that shapes the race; 0 by default, so a bare build is deterministic. The
 * output is the build's, phase by phase or all at once: no seeded or random
 * draw, no registration into G moves. Between two phases the scene is half
 * built and G's samples, layout, crowd, hazards and the rest are the ones
 * this build is filling: the caller owns G meanwhile (prebuild.js swaps the
 * fields in and out around every slice).
 */
export function* buildTrackPhases(scene, track, { fold = getPoly() === 'low', seed = 0 } = {}) {
  textures(); STILL.length = 0;
  const layout = chooseLayout(track, seed);
  G.seed = seed >>> 0; G.layout = layout; G.rng = makeRng(derive(seed, SALT_RACE)); G.hw = track.roadHalfWidth ?? CFG.roadHalfWidth;
  for (const kind of surfacesOf(track)) for (const _ of bakeSurface(kind)) yield TRACK_PHASES[0];   // baked ahead, a few rows a step
  yield TRACK_PHASES[0];
  // The circuit is drawn at track.scale; CFG.samples grows with it so the
  // samples stay about as far apart as before and every distance counted in
  // samples (feature lengths, AI look-ahead, power offsets) keeps its meaning.
  const S = track.scale || 1; setDecorScale(S);
  const pts = track.points.map(p => new THREE.Vector3(p[0] * S, 0, p[1] * S));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  curve.arcLengthDivisions = 2000;
  const N = CFG.samples, samples = [], heights = profileHeights(track.profile, N);
  for (let i = 0; i < N; i++) {
    const u = i / N; const p = curve.getPointAt(u); const t = curve.getTangentAt(u).normalize(); samples.push({ x: p.x, z: p.z, y: heights[i], tx: t.x, tz: t.z, sx: -t.z, sz: t.x, hw: G.hw, bank: 0, wind: 0, slope: 0 });
    if (i % SLICE_SAMPLES === SLICE_SAMPLES - 1) yield TRACK_PHASES[1];
  }
  const total = curve.getLength(), step = total / N;
  shapeSamples(samples, layout.features, step);
  G.samples = samples; G.N = N; G.trackLength = total;
  setTerrain(samples);

  // road surface (asphalt, gravel or cobbles; the texture tiles every `period` metres), as wide as each sample says, with its relief and wear maps
  const roadSurf = surface(roadKindOf(track)), roadTex = roadSurf.map, period = track.gravel ? 10 : track.cobble ? 8 : 20;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) { const s = samples[i % N]; const v = (i * step) / period; pos.push(s.x + s.sx * s.hw, roadY(s, s.hw) + 0.05, s.z + s.sz * s.hw, s.x - s.sx * s.hw, roadY(s, -s.hw) + 0.05, s.z - s.sz * s.hw); uv.push(0, v, 1, v); }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx); rg.computeVertexNormals();
  // the cobbles are tinted down: the pale stones would otherwise wash out next to the pavement
  const road = new THREE.Mesh(rg, disposable(new THREE.MeshStandardMaterial({ map: roadTex, normalMap: roadSurf.normalMap, roughnessMap: roadSurf.roughnessMap, color: track.cobble ? 0x8f8a82 : 0xffffff, roughness: 0.95, side: THREE.DoubleSide }))); road.receiveShadow = true; scene.add(road);
  yield TRACK_PHASES[1];

  // A ribbon beside the road: `inner` and `outer` are lateral offsets from the sample's edge (its hw), y0 and y1 heights over the road's surface there.
  function strip(inner, outer, y0, y1, period, sideSign, c1, c2, rough) {
    const p = [], col = [], ix = []; const A = new THREE.Color(c1), B = new THREE.Color(c2);
    for (let i = 0; i <= N; i++) { const s = samples[i % N]; const c = period ? (Math.floor(i / period) % 2 === 0 ? A : B) : A; const li = (s.hw + inner) * sideSign, lo = (s.hw + outer) * sideSign; p.push(s.x + s.sx * li, roadY(s, li) + y0, s.z + s.sz * li, s.x + s.sx * lo, roadY(s, lo) + y1, s.z + s.sz * lo); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
    for (let i = 0; i < N; i++) { const a = i * 2; ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(ix); g.computeVertexNormals();
    const m = new THREE.Mesh(g, disposable(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: rough || 0.9 }))); m.receiveShadow = true; scene.add(m);
  }
  for (const sg of [1, -1]) {
    strip(-1.1, 0, 0.07, 0.07, 4, sg, track.kerb[0], track.kerb[1]);                  // kerb stripes
    strip(0, 0.8, 0.07, 0.35, 0, sg, track.pavement, track.pavement);                 // kerb stone
    strip(0.8, PAVEMENT, 0.35, 0.35, 0, sg, track.pavement, track.pavement);          // pavement
    strip(0.8, 0.8, 0.35, 1.25, 6, sg, track.kerb[0], 0xf6f1e4);                      // barrier wall
    yield TRACK_PHASES[2];
  }
  bikeLane(scene, track, strip);
  embankment(scene, samples, track.ground);
  yield TRACK_PHASES[2];

  // start line + gantry
  const s0 = samples[0]; const yaw = Math.atan2(s0.tx, s0.tz), hw0 = s0.hw;
  const checker = canvasTexture(128, 32, (c) => { for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect(x * 16, y * 16, 16, 16); } });
  const lineHolder = new THREE.Group(); lineHolder.position.set(s0.x, s0.y + 0.08, s0.z); lineHolder.rotation.y = yaw; const lineMesh = new THREE.Mesh(new THREE.PlaneGeometry(hw0 * 2, 3), new THREE.MeshBasicMaterial({ map: checker })); lineMesh.rotation.x = -Math.PI / 2; lineHolder.add(lineMesh); scene.add(lineHolder);
  const gantry = new THREE.Group(); gantry.position.set(s0.x, s0.y, s0.z); gantry.rotation.y = yaw;
  gantry.add(cyl(0.35, 0.35, 9, 0xdddddd, hw0 + 1.6, 4.5, 0, 8)); gantry.add(cyl(0.35, 0.35, 9, 0xdddddd, -hw0 - 1.6, 4.5, 0, 8));
  const banner = canvasTexture(1024, 160, (c, w, h) => { c.fillStyle = '#1f3a93'; c.fillRect(0, 0, w / 3, h); c.fillStyle = '#fffaf0'; c.fillRect(w / 3, 0, w / 3, h); c.fillStyle = '#c8102e'; c.fillRect(2 * w / 3, 0, w / 3, h); c.fillStyle = '#0c1230'; c.font = 'bold 96px sans-serif'; c.textAlign = 'center'; c.fillText('DÉPART · ARRIVÉE', w / 2, 112); });
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(hw0 * 2 + 3.2, 3), new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide })); bm.position.set(0, 8, 0); gantry.add(bm); scene.add(still(gantry));

  // ground: a plain that follows the road's relief around it (decor/context.js terrainY), flat on a flat circuit;
  // the map cloned for its own repeat (the normal map follows it: one uvTransform in r128), none of it on "légers"
  const gs = surface(track.gravel ? 'gravel' : 'grass'), gt = disposable(gs.map.clone()); gt.needsUpdate = true; gt.repeat.set(280, 280);
  const ground = { mesh: null };
  for (const _ of groundMesh(gt, gs.normalMap, ground)) yield TRACK_PHASES[2];
  scene.add(ground.mesh);
  yield TRACK_PHASES[2];

  // item boxes: rows of 4 golden urns across the road, four rows unless the track lists more
  G.itemBoxes = [];
  const boxGeo = new THREE.OctahedronGeometry(1.1, 0); const boxMat = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0x6a4a00, transparent: true, opacity: 0.9, roughness: 0.3, metalness: 0.4 });
  (track.boxRows || [0.18, 0.42, 0.66, 0.88]).forEach(f => { const s = samples[Math.floor(f * N)]; const sp = s.hw * 0.4; [-1.5, -0.5, 0.5, 1.5].forEach(o => { const m = new THREE.Mesh(boxGeo, boxMat); m.position.set(s.x + s.sx * o * sp, roadY(s, o * sp) + 1.4, s.z + s.sz * o * sp); scene.add(m); G.itemBoxes.push({ x: m.position.x, z: m.position.z, mesh: m, active: true, timer: 0 }); }); });

  // shared street furniture: lamps, ad boards, crowd zones, grandstand
  for (let i = 0; i < N; i += 36) { const s = samples[i]; const sg = (i / 36) % 2 ? 1 : -1; lamp(scene, s.x + s.sx * sg * (s.hw + 5.2), s.z + s.sz * sg * (s.hw + 5.2), track.gravel ? 'plain' : 'paris', s.y); }
  for (let i = 0; i < 8; i++) adBoard(scene, Math.floor(N * (0.07 + i * 0.118)), i % 2 ? 1 : -1, ...ADS[i], getCustom().ads[i]);
  yield TRACK_PHASES[3];
  G.crowd = [];
  grandstand(scene, 0, 1);
  crowdZone(scene, N - 30, N + 30, -1, true);
  yield TRACK_PHASES[3];
  for (const [i, f] of [0.28, 0.5, 0.74].entries()) { crowdZone(scene, Math.floor(N * f), Math.floor(N * f) + 36, i % 2 ? 1 : -1, false); yield TRACK_PHASES[3]; }
  yield TRACK_PHASES[3];

  buildFeatures(scene, layout, makeRng(derive(seed, SALT_FEATURES)));
  yield TRACK_PHASES[4];
  buildCyclists(scene, makeRng(derive(seed, SALT_CYCLISTS)), layout.cyclists);
  for (const c of G.cyclists) still(c.mesh);   // a rider moves and falls as a whole
  yield TRACK_PHASES[5];
  // themed decor, laid out at scale 1 and then spread out to the circuit's scale
  const decor = new THREE.Group();
  const themed = (BUILDERS[track.id] ?? BUILDERS.versailles)(decor, scene);
  if (themed && typeof themed.next === 'function') for (const _ of themed) yield TRACK_PHASES[6];   // a generator builder yields between its sections
  for (const _ of spreadDecor(decor, scene, S)) yield TRACK_PHASES[6];
  yield TRACK_PHASES[6];
  if (fold) foldStill(scene); else STILL.length = 0;
  yield TRACK_PHASES[7];
}

/** Every surface kind a build of `track` uses: the road's, the ground's, the shared furniture's and features', and its decor's (decor/<id>.js SURFACES). */
export function surfacesOf(track) {
  return [...new Set([roadKindOf(track), track.gravel ? 'gravel' : 'grass', ...SHARED_SURFACES, ...(DECOR_SURFACES[track.id] ?? DECOR_SURFACES.versailles)])];
}
/** The surface kinds the road, its strips, the shared furniture and the features use on every circuit. */
const SHARED_SURFACES = Object.freeze([]);

/** The road's surface kind: gravel for the park, cobbles for the butte, asphalt elsewhere. */
export const roadKindOf = track => (track.gravel ? 'gravel' : track.cobble ? 'cobble' : 'asphalt');
/** The road's surface texture (its colour map; surface(roadKindOf(track)) has the relief). */
export function roadTexOf(track) { return TEX[roadKindOf(track)]; }

/** The embankment: from the pavement's edge, at the road's height, down (or up) to the terrain EMBANK metres out, both sides in one mesh. */
function embankment(scene, samples, color) {
  const N = samples.length, p = [], ix = [];
  for (const sg of [1, -1]) {
    const base = p.length / 3;
    for (let i = 0; i <= N; i++) { const s = samples[i % N]; const li = (s.hw + PAVEMENT) * sg, lo = (s.hw + PAVEMENT + EMBANK) * sg; const ox = s.x + s.sx * lo, oz = s.z + s.sz * lo; p.push(s.x + s.sx * li, roadY(s, li) + 0.35, s.z + s.sz * li, ox, terrainY(ox, oz), oz); }
    for (let i = 0; i < N; i++) { const a = base + i * 2; ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })); m.receiveShadow = true; scene.add(m);
}

/**
 * The ground plain, 3200 m square: a grid whose heights follow the terrain within 800 m of the circuit, flat beyond (and flat throughout on a flat circuit).
 * A generator that yields every few rows (the terrain's heights are the cost on a hilly circuit) and leaves the mesh in `out.mesh`.
 */
function* groundMesh(texture, normalMap, out) {
  const SIZE = 3200, CELLS = 128, p = [], uv = [], ix = [];
  for (let j = 0; j <= CELLS; j++) {
    for (let i = 0; i <= CELLS; i++) {
      const x = -SIZE / 2 + i * SIZE / CELLS, z = -SIZE / 2 + j * SIZE / CELLS;
      p.push(x, Math.abs(x) <= 800 && Math.abs(z) <= 800 ? terrainY(x, z) : 0, z); uv.push(i / CELLS, j / CELLS);
    }
    if (j % 16 === 15) yield;
  }
  for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) { const a = j * (CELLS + 1) + i; ix.push(a, a + CELLS + 1, a + 1, a + 1, a + CELLS + 1, a + CELLS + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals();
  const ground = new THREE.Mesh(g, disposable(new THREE.MeshStandardMaterial({ map: texture, normalMap, roughness: 1 }))); ground.receiveShadow = true;
  out.mesh = ground;
}

/**
 * Spread the themed decor, written for a scale-1 circuit, over a circuit
 * drawn at scale S. Big pieces -- palaces, buildings, lawns, the river, walls
 * -- stretch horizontally with the circuit, so they keep framing the road.
 * Small ones -- people, trees, lamps, cars, statues -- only move: they keep
 * their size, next to karts that kept theirs. Every piece is then set on the
 * ground where it stands (yAt): small ones at their own spot, big ones at
 * their centre.
 */
function* spreadDecor(decor, world, S) {
  decor.updateMatrixWorld(true);
  const size = new THREE.Vector3(), centre = new THREE.Vector3(), bb = new THREE.Box3();
  let n = 0;
  for (const child of [...decor.children]) {
    bb.setFromObject(child).getSize(size); bb.getCenter(centre);
    if (Math.max(size.x, size.z) < 14) { child.position.x *= S; child.position.z *= S; child.position.y += yAt(child.position.x, child.position.z); world.add(child); }
    else child.position.y += yAt(centre.x * S, centre.z * S);
    if (++n % SLICE_CHILDREN === 0) yield;
  }
  decor.scale.set(S, 1, S); world.add(decor);
}
