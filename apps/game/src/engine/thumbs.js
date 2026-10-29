// The circuits screen's thumbnails: a bird's-eye picture of each circuit,
// rendered in 3D at 320x180 behind a placeholder (PLAN stage 8, DEC-045's
// pattern for the portraits).
//
// What is drawn: not the race scene. Building a circuit's full decor takes
// seconds of slices (prebuild.js) and is the selected circuit's alone, so a
// thumbnail is a light scene of its own, made from the track's data: the
// road ribbon at its width over the elevation profile (RELIEF times the real
// heights, or a 22 m climb would be four pixels), kerb and pavement bands,
// the start line and a gold pole, a terrain grid that follows the road's
// heights, and on "détaillés" blocks of buildings (hedges in a park) along
// both sides, coloured per circuit. Every vertex has its colour baked from
// the circuit's first climate (sun direction, colour, ambient), so the
// whole thumbnail is one MeshBasicMaterial with vertex colours: one shader
// program for all five, compiled once, no lights, no shadows, no textures.
// The camera is orthographic, tilted THUMB_ELEVATION above the horizon from
// the +z side, and fitted by thumbFrame(): the same frame the 2D
// placeholder outline is drawn in, so the picture lands where the outline
// was.
//
// Cost and slicing: a thumbnail is a generator of steps (the samples, the
// terrain, the road, the blocks, then the render) run a few per frame
// within the budget the caller gives (game.js passes what the race
// pre-build left of the frame, at most BUDGET_MS: the pre-build of the
// selected circuit keeps priority). A step starts only when its last
// measured cost still fits in the slice, so a slice stays within its
// budget once each step has been seen once. The shared program is compiled
// in a step of its own before the first render. The render step draws into a
// render target at twice the size ("légers": once, and no blocks), reads it
// back and filters it down into the thumbnail's own canvas, which is kept
// per circuit and detail level for the session. A GPU that takes longer
// than SLOW_MS for that step twice, or a select stage the frame governor
// (DEC-046) has stood still, gets no 3D thumbnails: the placeholders stay
// (state 'static').
//
// Headless-safe: without a document the steps still build (the tests time
// them in Node) and every thumbnail ends 'static'; nothing touches the DOM
// at import.
import * as THREE from 'three';

import { CLIMATES } from './climate.js';
import { TRACKS } from './data.js';
import { layoutNames, profileHeights } from './layout.js';
import { onTransition } from './machine.js';
import { CFG, G, getPoly } from './state.js';

export const THUMB_W = 320, THUMB_H = 180;
/** The camera's elevation above the horizon. */
export const THUMB_ELEVATION = 58 * Math.PI / 180;
/** The most a frame's slice may take, ms. */
export const BUDGET_MS = 6;
/** A render step slower than this (twice) means a GPU that cannot spare it: the rest stay placeholders. */
export const SLOW_MS = 40;
/** How much the thumbnail exaggerates the heights. */
export const RELIEF = 3;
/** The frame's margin around the road, in pixels. */
const PAD = 12;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const hasDom = () => typeof document !== 'undefined';

// ---------- A circuit's figures (pure, cached) ----------

const META = new Map(), CURVES = new Map();
/** The flat lap of `track` at its scale, as a curve (cached with its arc lengths; the admin never moves a circuit's points). */
function curveOf(track) {
  const hit = CURVES.get(track.id); if (hit) return hit;
  const S = track.scale || 1;
  const c = new THREE.CatmullRomCurve3(track.points.map(p => new THREE.Vector3(p[0] * S, 0, p[1] * S)), true, 'catmullrom', 0.5);
  c.arcLengthDivisions = 600;
  CURVES.set(track.id, c);
  return c;
}

/**
 * Work out every circuit's figures and frame ahead, one circuit per task,
 * so the circuits screen finds them cached (the store calls it when the
 * roster opens: the click to the circuits stays within its 100 ms).
 */
export function warmFigures() {
  const left = TRACKS.filter(t => !META.has(t.id) || !FRAMES.has(t.id));
  const next = () => { const t = left.shift(); if (!t) return; trackMeta(t); thumbFrame(t); setTimeout(next, 0); };
  if (left.length) setTimeout(next, 0);
}

/**
 * What the circuits screen says about `track`: the lap's `length` (m), the
 * `climb` a lap goes up (m, from the elevation profile), the road's `width`
 * (m), the race's `laps`, the layout variants' names and the climates it
 * allows. Cached per track id.
 */
export function trackMeta(track) {
  const hit = META.get(track.id); if (hit) return hit;
  const h = profileHeights(track.profile, 512);
  let climb = 0;
  for (let i = 0; i < h.length; i++) { const d = h[(i + 1) % h.length] - h[i]; if (d > 0) climb += d; }
  const meta = Object.freeze({
    length: curveOf(track).getLength(),
    climb,
    width: 2 * (track.roadHalfWidth ?? CFG.roadHalfWidth),
    laps: CFG.laps,
    layouts: Object.freeze(layoutNames(track)),
    climates: Object.freeze([...(track.climates || [])]),
  });
  META.set(track.id, meta);
  return meta;
}

// ---------- The frame (shared by the 3D camera and the 2D placeholder) ----------

const FRAMES = new Map();
/**
 * The thumbnail's frame for `track`: the flat lap seen from the camera,
 * fitted into THUMB_W x THUMB_H with PAD pixels around the road. `sc` is
 * pixels per metre, `cx`/`cz` the world point at the picture's centre, `pts`
 * the lap's centre line in pixels (200 points, x right, y down), `start` the
 * start line's point, `hw` the road's half-width in pixels. Cached.
 */
export function thumbFrame(track) {
  const hit = FRAMES.get(track.id); if (hit) return hit;
  const curve = curveOf(track), n = 200, sin = Math.sin(THUMB_ELEVATION);
  const raw = curve.getSpacedPoints(n).slice(0, n);
  const hw = track.roadHalfWidth ?? CFG.roadHalfWidth;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of raw) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  x0 -= hw; x1 += hw; z0 -= hw; z1 += hw;
  const sc = Math.min((THUMB_W - 2 * PAD) / (x1 - x0), (THUMB_H - 2 * PAD) / ((z1 - z0) * sin));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const px = x => THUMB_W / 2 + (x - cx) * sc, py = z => THUMB_H / 2 + (z - cz) * sin * sc;
  const frame = Object.freeze({ sc, cx, cz, hw: hw * sc, pts: raw.map(p => [px(p.x), py(p.z)]), start: [px(raw[0].x), py(raw[0].z)] });
  FRAMES.set(track.id, frame);
  return frame;
}

// ---------- The light scene ----------

/** Per circuit: what the blocks along the road look like (a park's are hedges). */
const BLOCKS = {
  elysee: { colors: [0xe3d6bd, 0xd8cbb0, 0xcfc2a6], h: [10, 22], roof: 0x5d6470 },
  bourbon: { colors: [0xe6dcc6, 0xd9cdb4, 0xc9bc9f], h: [9, 20], roof: 0x5a6270 },
  versailles: { colors: [0x3e6b35, 0x4a7a3c, 0x355e2e], h: [2, 4], roof: null },
  montmartre: { colors: [0xf1ece0, 0xe6dccb, 0xd2c6b1], h: [8, 18], roof: 0x6b5a4e },
  marseille: { colors: [0xe8c79a, 0xdcb488, 0xf0d9b5], h: [8, 18], roof: 0xb5653d },
};
const ROAD = { asphalt: 0x4a4b50, gravel: 0xcdbb94, cobble: 0x8f8a82 };

/** A small deterministic hash in [0, 1) (no Math.random: a thumbnail looks the same every time). */
function hash(i, salt = 0) { let x = (i * 374761393 + salt * 668265263) | 0; x = (x ^ (x >>> 13)) * 1274126177; x ^= x >>> 16; return (x >>> 0) / 4294967296; }

/** The shared material: vertex colours, no lighting (it is baked). */
let material = null;
const thumbMaterial = () => material || (material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));

/** The light from `climate`: the sun's direction, its colour mixed into white, and the ambient share. */
function lightOf(climate) {
  const el = climate.sun.elevation * Math.PI / 180, az = climate.sun.azimuth * Math.PI / 180;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  const tint = new THREE.Color(0xffffff).lerp(new THREE.Color(climate.sun.color), 0.35).multiplyScalar(Math.min(1.15, 0.55 + climate.sun.intensity * 0.45));
  return { dir, tint, ambient: climate.lampsOn ? 0.62 : 0.5 };
}

/**
 * Bake `geo`'s colours: each vertex's base colour (`base(i)` as a THREE.Color,
 * or one colour for all) lit by `light` through its normal. The normals are
 * dropped afterwards: the material does not read them.
 */
function bake(geo, base, light, twoSided = true) {
  geo.computeVertexNormals();
  const n = geo.attributes.normal, count = geo.attributes.position.count, col = new Float32Array(count * 3), c = new THREE.Color(), v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(n, i);
    const ndl = v.dot(light.dir), lit = light.ambient + (1 - light.ambient) * Math.max(0, twoSided ? Math.abs(ndl) : ndl);
    if (typeof base === 'function') c.copy(base(i)); else c.copy(base);
    col[i * 3] = c.r * lit * light.tint.r; col[i * 3 + 1] = c.g * lit * light.tint.g; col[i * 3 + 2] = c.b * lit * light.tint.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute('normal');
  return geo;
}

/** The terrain's height at (x, z): the road's nearby heights by inverse squared distance, fading out past FADE (terrainY's idea, on the thumbnail's own samples). */
function terrainAt(coarse, x, z) {
  const RADIUS = 260, FADE = 110;
  let sw = 0, sy = 0, dmin = Infinity;
  for (const s of coarse) { const d2 = (s.x - x) ** 2 + (s.z - z) ** 2; if (d2 > RADIUS * RADIUS) continue; const w = 1 / (d2 + 400); sw += w; sy += w * s.y; if (d2 < dmin) dmin = d2; }
  if (!sw) return 0;
  const d = Math.sqrt(dmin);
  return (sy / sw) * (d > FADE ? Math.max(0, (RADIUS - d) / (RADIUS - FADE)) : 1);
}

/** A ribbon along `samples` between lateral offsets `a` and `b` (m from the centre line) at `lift` above the road. */
function ribbon(samples, a, b, lift, color, light) {
  const N = samples.length, pos = new Float32Array((N + 1) * 6), idx = [];
  for (let i = 0; i <= N; i++) {
    const s = samples[i % N], o = i * 6;
    pos[o] = s.x + s.sx * a; pos[o + 1] = s.y + lift; pos[o + 2] = s.z + s.sz * a;
    pos[o + 3] = s.x + s.sx * b; pos[o + 4] = s.y + lift; pos[o + 5] = s.z + s.sz * b;
  }
  for (let i = 0; i < N; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
  return bake(g, typeof color === 'function' ? color : new THREE.Color(color), light);
}

/** One box's five faces (no floor), as triangles, appended to `out`: centre (x, y0, z), size w x d, height h, turned `yaw`. */
function pushBox(out, x, y0, z, w, d, h, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), P = (u, v, y) => [x + u * c - v * s, y, z + u * s + v * c];
  const a = P(-w / 2, -d / 2, y0), b = P(w / 2, -d / 2, y0), e = P(w / 2, d / 2, y0), f = P(-w / 2, d / 2, y0);
  const A = P(-w / 2, -d / 2, y0 + h), B = P(w / 2, -d / 2, y0 + h), E = P(w / 2, d / 2, y0 + h), F = P(-w / 2, d / 2, y0 + h);
  const quad = (p, q, r, t) => out.push(...p, ...r, ...q, ...p, ...t, ...r);   // wound outwards
  quad(A, B, E, F);                       // the roof first: its 6 vertices are told apart by index
  quad(a, b, B, A); quad(b, e, E, B); quad(e, f, F, E); quad(f, a, A, F);
}

/**
 * Build the light scene of `track` step by step: a generator that yields the
 * name of each step done ('shape', 'terrain', 'road', 'blocks') and returns
 * `{ scene, camera, background }`. `poly` 'low' leaves the blocks out and
 * uses fewer samples.
 */
export function* thumbSteps(track, { poly = getPoly() } = {}) {
  const low = poly === 'low', N = low ? 240 : 360;
  const curve = curveOf(track), heights = profileHeights(track.profile, N), hw = track.roadHalfWidth ?? CFG.roadHalfWidth;
  const samples = [];
  for (let i = 0; i < N; i++) {
    const u = i / N, p = curve.getPointAt(u), t = curve.getTangentAt(u).normalize();
    samples.push({ x: p.x, z: p.z, y: heights[i] * RELIEF, sx: -t.z, sz: t.x, tx: t.x, tz: t.z });
    if (i === N >> 1) yield 'shape';
  }
  const climate = CLIMATES[track.climates?.[0]] ?? CLIMATES.noon, light = lightOf(climate);
  const frame = thumbFrame(track), scene = new THREE.Scene(), mat = thumbMaterial();
  yield 'shape';

  // the terrain: a grid over the picture's ground (and beyond its edges), following the road's heights
  const coarse = samples.filter((_, i) => i % 6 === 0), flat = samples.every(p => p.y === 0);
  const halfW = THUMB_W / 2 / frame.sc * 1.15, halfD = THUMB_H / 2 / frame.sc / Math.sin(THUMB_ELEVATION) * 1.35;
  const GX = low ? 24 : 40, GZ = low ? 16 : 26, gpos = new Float32Array((GX + 1) * (GZ + 1) * 3), gidx = [];
  for (let j = 0; j <= GZ; j++) {
    for (let i = 0; i <= GX; i++) {
      const x = frame.cx - halfW + (2 * halfW * i) / GX, z = frame.cz - halfD + (2 * halfD * j) / GZ, o = (j * (GX + 1) + i) * 3;
      gpos[o] = x; gpos[o + 1] = (flat ? 0 : terrainAt(coarse, x, z)) - 0.6; gpos[o + 2] = z;
    }
    if (j === GZ >> 1) yield 'terrain';
  }
  for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) { const a = j * (GX + 1) + i, b = a + 1, c = a + GX + 1, d = c + 1; gidx.push(a, c, b, b, c, d); }
  const ground = new THREE.BufferGeometry(); ground.setAttribute('position', new THREE.BufferAttribute(gpos, 3)); ground.setIndex(gidx);
  const grass = new THREE.Color(track.ground ?? 0x6f9a55), tmp = new THREE.Color();
  bake(ground, i => tmp.copy(grass).multiplyScalar(0.94 + hash(i, 7) * 0.12), light);
  scene.add(new THREE.Mesh(ground, mat));
  yield 'terrain';

  // the road, its kerbs (alternating), the pavement, and the start line with a gold pole
  const road = ROAD[track.gravel ? 'gravel' : track.cobble ? 'cobble' : 'asphalt'];
  const kerbA = new THREE.Color(track.kerb?.[0] ?? 0xd83b4b), kerbB = new THREE.Color(track.kerb?.[1] ?? 0xf6f1e4);
  const kerb = i => ((Math.floor((i >> 1) / 3) % 2) ? kerbA : kerbB);
  for (const sg of [1, -1]) {
    scene.add(new THREE.Mesh(ribbon(samples, sg * (hw + 1.6), sg * (hw + 7), 0.35, track.pavement ?? 0x9a9a92, light), mat));
    scene.add(new THREE.Mesh(ribbon(samples, sg * hw, sg * (hw + 1.8), 0.45, kerb, light), mat));
    yield 'road';
  }
  scene.add(new THREE.Mesh(ribbon(samples, -hw, hw, 0.4, road, light), mat));
  const s0 = samples[0], line = [];
  pushBox(line, s0.x, s0.y + 0.4, s0.z, 4, hw * 2, 0.15, Math.atan2(s0.tz, s0.tx));   // 4 m along the road, across its width
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
  scene.add(new THREE.Mesh(bake(lineGeo, new THREE.Color(0xffffff), light), mat));
  const pole = [], off = hw + 5;
  pushBox(pole, s0.x + s0.sx * off, s0.y, s0.z + s0.sz * off, 3, 3, 16, 0);
  const poleGeo = new THREE.BufferGeometry(); poleGeo.setAttribute('position', new THREE.Float32BufferAttribute(pole, 3));
  scene.add(new THREE.Mesh(bake(poleGeo, new THREE.Color(0xf2c14e), light, false), mat));
  yield 'road';

  // blocks of buildings (or hedges) along both sides, kept clear of every stretch of road
  if (!low) {
    const look = BLOCKS[track.id] ?? BLOCKS.elysee, out = [], colors = [];
    const clear = coarse.filter((_, i) => i % 2 === 0);
    const step = 8;
    for (let i = 0; i < N; i += step) for (const sg of [1, -1]) {
      const k = i * 2 + (sg > 0 ? 0 : 1);
      if (hash(k, 3) < 0.18) continue;                     // gaps between the blocks
      const s = samples[i], w = 10 + hash(k, 4) * 14, d = 8 + hash(k, 5) * 12, lat = sg * (hw + 9 + d / 2 + hash(k, 6) * 6);
      const x = s.x + s.sx * lat, z = s.z + s.sz * lat, r = Math.hypot(w, d) / 2;
      if (clear.some(c => (c.x - x) ** 2 + (c.z - z) ** 2 < (hw + 8 + r) ** 2)) continue;
      const h = look.h[0] + hash(k, 8) * (look.h[1] - look.h[0]);
      pushBox(out, x, (flat ? 0 : terrainAt(coarse, x, z)) - 0.6, z, w, d, h * RELIEF * 0.5, Math.atan2(s.tz, s.tx));
      colors.push(look.colors[Math.floor(hash(k, 9) * look.colors.length)]);
    }
    if (out.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      const wall = new THREE.Color(), roof = look.roof === null ? null : new THREE.Color(look.roof);
      bake(g, i => { const box = Math.floor(i / 30), face = i % 30; wall.set(colors[box]); return roof && face < 6 ? roof : wall; }, light, false);
      scene.add(new THREE.Mesh(g, mat));
    }
    yield 'blocks';
  }

  // the camera: orthographic, tilted, fitted to the frame (thumbFrame) around (cx, 0, cz)
  const halfX = THUMB_W / 2 / frame.sc, halfY = THUMB_H / 2 / frame.sc;
  const camera = new THREE.OrthographicCamera(-halfX, halfX, halfY, -halfY, 1, 6000);
  camera.position.set(frame.cx, Math.sin(THUMB_ELEVATION) * 3000, frame.cz + Math.cos(THUMB_ELEVATION) * 3000);
  camera.lookAt(frame.cx, 0, frame.cz);
  camera.updateMatrixWorld(true);
  return { scene, camera, background: new THREE.Color(climate.sky?.[2] ?? 0xc9dff2) };
}

/** Free a built thumbnail scene's geometries (the material is shared and stays). */
export function disposeThumbScene(scene) { scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }

// ---------- Rendering ----------

let target = null, readBuf = null, bigCanvas = null;

/** Render a built scene into a new THUMB_W x THUMB_H canvas: at `k` times the size into a target, read back, flipped and filtered down. */
function renderThumb(r, built, k) {
  const W = THUMB_W * k, H = THUMB_H * k;
  if (!target || target.width !== W) { if (target) target.dispose(); target = new THREE.WebGLRenderTarget(W, H); readBuf = new Uint8Array(W * H * 4); }
  const clear = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha(), scissor = r.getScissorTest();
  r.setScissorTest(false);
  r.setRenderTarget(target); r.setClearColor(built.background, 1); r.clear(); r.render(built.scene, built.camera);
  r.readRenderTargetPixels(target, 0, 0, W, H, readBuf);
  r.setRenderTarget(null); r.setClearColor(clear, alpha); r.setScissorTest(scissor);
  const out = document.createElement('canvas'); out.width = THUMB_W; out.height = THUMB_H;
  const big = k === 1 ? out : (bigCanvas || (bigCanvas = document.createElement('canvas')));
  if (big !== out) { big.width = W; big.height = H; }
  const bc = big.getContext('2d'); if (!bc) return null;
  const img = bc.createImageData(W, H), row = W * 4;
  for (let y = 0; y < H; y++) img.data.set(readBuf.subarray((H - 1 - y) * row, (H - y) * row), y * row);
  bc.putImageData(img, 0, 0);
  if (big !== out) { const c = out.getContext('2d'); if (!c) return null; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(big, 0, 0, THUMB_W, THUMB_H); }
  return out;
}

// ---------- The queue, a slice per frame ----------

/**
 * `cache`: by `id|poly`, `{ canvas, state }` once done ('ready' with its
 * canvas, or 'static'); `queue`: the track indices still to do; `job`: the
 * one in hand `{ idx, key, gen, built }`; `est`: each step's last measured
 * cost (ms); `slow`: renders past SLOW_MS; `stats`: for the test hook.
 */
const T = { cache: new Map(), queue: [], job: null, listener: null, still: false, slow: 0, compiled: false, est: { shape: 1, terrain: 1, road: 1, blocks: 1, compile: 4, render: 3 }, stats: { slices: 0, maxSlice: 0, maxStep: 0, maxStepName: null, total: 0, started: null, done: null } };
/** A stage the frame governor stood still (stagegate.js stillStage), asked when work starts. */
let isStill = () => false;
/** Tell the thumbnails how to ask whether the GPU is a slow one (the stage's governor); the store wires it. */
export function setStillProbe(fn) { isStill = typeof fn === 'function' ? fn : () => false; }

const keyOf = (track, poly = getPoly()) => track.id + '|' + poly;

/** The thumbnails of the current detail level, by track id: `{ state: 'pending' | 'ready' | 'static', canvas }` (canvas null but when ready). */
export function thumbsView() {
  const out = {};
  for (const t of TRACKS) { const c = T.cache.get(keyOf(t)); out[t.id] = c ? { state: c.state, canvas: c.canvas } : { state: 'pending', canvas: null }; }
  return out;
}
function notify() { if (T.listener) T.listener(thumbsView()); }
/** Hear of every thumbnail that lands (and once right away); the latest listener is kept. */
export function onThumbs(fn) { T.listener = typeof fn === 'function' ? fn : null; notify(); }

/**
 * Queue every circuit whose thumbnail at the current detail level is not
 * done, `first` (the selected circuit) ahead. A job in hand for another
 * detail level is dropped.
 */
export function requestThumbs(first = G.trackIdx) {
  if (T.job && T.job.key !== keyOf(TRACKS[T.job.idx])) dropJob();
  const order = TRACKS.map((_, i) => i).filter(i => i !== first); if (TRACKS[first]) order.unshift(first);
  T.queue = order.filter(i => !T.cache.has(keyOf(TRACKS[i])) && !(T.job && T.job.idx === i));
  if ((T.queue.length || T.job) && T.stats.started === null) T.stats.started = now();
  notify();
  return T.queue.length + (T.job ? 1 : 0);
}

function dropJob() { if (T.job && T.job.built) disposeThumbScene(T.job.built.scene); T.job = null; }

/** Mark `idx` done, as `state`. */
function settle(idx, state, canvas = null) {
  T.cache.set(keyOf(TRACKS[idx]), { state, canvas });
  if (!T.queue.length && !T.job) T.stats.done = now();
  notify();
}

/**
 * A frame's share of the thumbnails, within `budget` ms (0 does nothing):
 * the next steps of the circuit in hand, a step started only while its last
 * measured cost fits (at least one per slice), its render once built.
 * Without a renderer or a document, or on a slow GPU, the circuits left are
 * marked 'static' at once. Returns whether there is work left.
 */
export function thumbsFrame({ renderer = null, budget = BUDGET_MS } = {}) {
  if (budget <= 0) return T.queue.length > 0 || !!T.job;
  const t0 = now();
  let steps = 0;
  while (T.queue.length || T.job) {
    if (!T.job) {
      const idx = T.queue.shift();
      if (!T.still && renderer && isStill()) T.still = true;
      if (T.still || !renderer || !hasDom()) { settle(idx, 'static'); continue; }
      T.job = { idx, key: keyOf(TRACKS[idx]), gen: thumbSteps(TRACKS[idx]), built: null, next: 'shape' };
    }
    const j = T.job, name = !j.built ? j.next : T.compiled ? 'render' : 'compile';
    if (steps > 0 && now() - t0 + (T.est[name] ?? 1) > budget) break;
    const t1 = now();
    if (!j.built) {
      const r = j.gen.next();
      if (r.done) j.built = r.value; else j.next = nextStep(r.value);
    } else if (!T.compiled) {
      // the one program every thumbnail uses, compiled in a slice of its own before the first render
      renderer.compile(j.built.scene, j.built.camera);
      T.compiled = true;
    } else {
      const k = getPoly() === 'low' ? 1 : 2;
      const canvas = renderThumb(renderer, j.built, k);
      disposeThumbScene(j.built.scene);
      T.job = null;
      if (now() - t1 > SLOW_MS && ++T.slow >= 2) T.still = true;
      settle(j.idx, canvas ? 'ready' : 'static', canvas);
    }
    const dt = now() - t1;
    T.est[name] = dt;
    if (dt > T.stats.maxStep) { T.stats.maxStep = dt; T.stats.maxStepName = name; }
    steps++;
  }
  if (steps) {
    const spent = now() - t0;
    T.stats.slices++; T.stats.total += spent; T.stats.maxSlice = Math.max(T.stats.maxSlice, spent);
  }
  return T.queue.length > 0 || !!T.job;
}
const STEPS = ['shape', 'terrain', 'road', 'blocks'];
/** The step that follows `name` (the generator's next one; the last leads to the camera, measured as part of it). */
function nextStep(name) { const i = STEPS.indexOf(name); return STEPS[i + 1] ?? 'blocks'; }

/** What the thumbnails have done, for the test hook: how many are ready or static of how many, and what the slices cost (ms). */
export function thumbStatus() {
  const v = thumbsView(), states = Object.values(v).map(x => x.state);
  const s = T.stats;
  return {
    ready: states.filter(x => x === 'ready').length, static: states.filter(x => x === 'static').length, total: states.length,
    still: T.still, slices: s.slices, maxSlice: Math.round(s.maxSlice * 10) / 10, maxStep: Math.round(s.maxStep * 10) / 10, maxStepName: s.maxStepName,
    total_ms: Math.round(s.total), elapsed: s.started !== null && s.done !== null ? Math.round(s.done - s.started) : null,
  };
}

/** Forget every thumbnail and the queue (tests). */
export function resetThumbs() {
  dropJob(); T.cache.clear(); T.queue = []; T.still = false; T.slow = 0; T.compiled = false;
  T.stats = { slices: 0, maxSlice: 0, maxStep: 0, maxStepName: null, total: 0, started: null, done: null };
}

// The circuits screen asks for the thumbnails it shows; the selected circuit first.
onTransition(to => { if (to === 'tracks') requestThumbs(G.trackIdx); });
