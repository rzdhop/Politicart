// Paris props for the Élysée and the Palais Bourbon (stage 7): the street
// furniture both circuits repeat by the hundred (plane trees, bollards,
// candelabra, Morris columns, benches, police panels, pigeons, flashes), the
// Haussmann blocks that line their roads, the garde républicaine's horses,
// and the helpers that keep all of it cheap:
//
// - batch(): an instanced() batch (decor/instanced.js, DEC-056) whose cells
//   are twice as wide on "légers", so a phone draws a prop in a quarter of
//   the meshes;
// - compact(): a still group that "détaillés" merges by material at once
//   (the race does not fold there) and "légers" leaves to the fold, so both
//   tiers draw a landmark in a handful of meshes; crowd figures stay apart;
// - kit(): the build's shared textured finishes (stone, zinc, awnings,
//   windows lit at night), so every block of a sector merges into one mesh
//   per finish instead of one material per building as street.js building()
//   makes.
//
// Everything here is cosmetic and draws on Math.random (util.js), never on
// the race's seeded streams.
import * as THREE from 'three';

import { CLIMATES } from '../climate.js';
import { bakeVertexColours, finishOf, mergeByMaterial } from '../geo.js';
import { box, cone, cyl, mat, tag, textPlane } from '../primitives.js';
import { G, SHADOWS, disposable, getPoly } from '../state.js';
import { surface } from '../textures.js';
import { pick, rand } from '../util.js';
import { DS, EMBANK, PAVEMENT, nOf, still, terrainY } from './context.js';
import { fromBuilder, instanced } from './instanced.js';
import { SKINS, cafe, figure, lampMat, metroEntrance, sedan } from './street.js';

export const high = () => getPoly() === 'high';
/** Whether the race's climate lights the lamps (dusk, night): the shop windows and some flats glow then. */
export const lampsLit = () => !!CLIMATES[G.layout?.climate ?? G.track?.climates?.[0]]?.lampsOn;

/** The ground's height at world (x, z), `lat` metres past the road's edge: the pavement's top (0.35 m over the road) to 6 m out, then down the embankment (track.js) to the terrain. */
export const groundAt = (x, z, lat) => groundY(x, z) + 0.35 * Math.max(0, Math.min(1, lat <= 6 ? 1 : 1 - (lat - 6) / 34));

/** An instanced() batch with cells of 200 m on "détaillés", 500 m on "légers". */
export const batch = (make, opts = {}) => instanced(make, { cell: high() ? 200 : 500, ...opts });

/**
 * Mark `g` still and, on "détaillés", merge it by material now (vertex
 * colours on the shared finishes first, so its plain parts make one mesh):
 * "légers" folds it the same way after the build. Crowd figures, and what
 * `keep` names, stay their own objects.
 */
export function compact(g, keep = () => false) {
  if (high()) {
    const crowd = new Set(G.crowd.map(c => c.g));
    bakeVertexColours(g, finishOf, { skip: o => crowd.has(o) || keep(o) });
    mergeByMaterial(g, o => crowd.has(o) || keep(o));
  }
  return still(g);
}

/** A mesh of `geo` in the shared plain finish of `color`, at (x, y, z), casting and taking shadows. */
export const part = (geo, color, x = 0, y = 0, z = 0) => { const m = tag(new THREE.Mesh(geo, mat(color))); m.position.set(x, y, z); return m; };
/** A box in the shared plain finish of `color`, turned `ry` about y. */
export const slab = (w, h, d, color, x, y, z, ry = 0) => { const m = box(w, h, d, color, x, y, z); m.rotation.y = ry; return m; };

// ---------- The build's shared textured finishes ----------
/**
 * The textured materials of one build: `stone(i)` the Haussmann facade in
 * one of three tints, `zinc` the mansard roofs, `cobble` the paved courts,
 * `awning(c)` a striped awning of colour c, and `window` the shop windows,
 * dark glass by day and lit when the climate lights the lamps. Built once per
 * circuit build (the materials are the race's: disposable), so blocks share
 * them and merge.
 */
export function kit() {
  const fs = surface('facade'), zs = surface('zinc'), cs = surface('cobble'), as = surface('awning');
  const tints = [0xffffff, 0xf4ead6, 0xe4ddd2];
  const stone = tints.map(color => disposable(new THREE.MeshStandardMaterial({ map: fs.map, normalMap: fs.normalMap, roughness: 0.9, color })));
  const zinc = disposable(new THREE.MeshStandardMaterial({ map: zs.map, normalMap: zs.normalMap, roughness: 0.6, metalness: 0.2 }));
  const cobble = disposable(new THREE.MeshStandardMaterial({ map: cs.map, normalMap: cs.normalMap, roughness: 1 }));
  const awnings = new Map();
  const lit = lampsLit();
  const glass = disposable(lit ? new THREE.MeshBasicMaterial({ color: 0xffd98a }) : new THREE.MeshStandardMaterial({ color: 0x1e2a3a, roughness: 0.15, metalness: 0.5 }));
  return {
    lit, zinc, cobble, window: glass,
    stone: i => stone[((i % 3) + 3) % 3],
    awning: c => { if (!awnings.has(c)) awnings.set(c, disposable(new THREE.MeshStandardMaterial({ map: as.map, normalMap: as.normalMap, roughness: 0.9, color: c }))); return awnings.get(c); },
  };
}

/** A box whose uvs repeat the texture every `ru` metres across each face and every `rv` metres up it (BoxGeometry's faces: +x, -x, +y, -y, +z, -z). */
export function uvBox(w, h, d, ru, rv) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, span = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * span[f][0] / ru, uv.getY(i) * span[f][1] / rv); }
  return g;
}
/** A mansard: a square-cornered frustum w x d at its foot, `inset` metres in at its top, `h` high, flat-shaded, its uvs one zinc panel row per 3 m. */
export function mansardGeo(w, d, h, inset) {
  const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, false).toNonIndexed();
  g.rotateY(Math.PI / 4);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0, sx = Math.sign(p.getX(i)), sz = Math.sign(p.getZ(i));
    p.setXYZ(i, sx * (w / 2 - (top ? inset : 0)), top ? h : 0, sz * (d / 2 - (top ? inset : 0)));
    uv.setXY(i, uv.getX(i) * (w + d) * 2 / 6, uv.getY(i) * h / 3);
  }
  g.computeVertexNormals();
  return g;
}

/** The mansard of a w x d block (4.2 m high, 2.2 m in at the top), one geometry per size to two metres (they only feed Merger, which copies them). */
const MANSARDS = new Map();
function mansardOf(w, d) {
  const qw = Math.round(w / 2) * 2, qd = Math.round(d / 2) * 2, key = qw + 'x' + qd;
  if (!MANSARDS.has(key)) MANSARDS.set(key, mansardGeo(qw, qd, 4.2, 2.2));
  return MANSARDS.get(key);
}

// ---------- Straight into merged buffers ----------
const P3 = new THREE.Vector3(), S3 = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), L = new THREE.Matrix4(), W = new THREE.Matrix4(), NM = new THREE.Matrix3(), C = new THREE.Color();
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1), UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
/** The material of a sign showing `text` (primitives.js textPlane's, shared with every identical sign). */
const SIGNS = new Map();
export const signMat = (w, h, text, bg, fg, px) => { const key = [w, h, text, bg, fg, px].join('|'); if (!SIGNS.has(key)) SIGNS.set(key, textPlane(w, h, text, bg, fg, px).material); return SIGNS.get(key); };
/**
 * Geometry gathered straight into one buffer per material, for the blocks
 * and the shopfronts that would otherwise be hundreds of meshes to bake and
 * merge (mergeByMaterial's work, without its meshes): plain colours go to the
 * shared vertex-coloured finish (geo.js finishOf) as vertex colours, textured
 * parts to their own material. `at()` sets the frame the next parts are
 * placed in; `into(group)` makes the meshes.
 */
export class Merger {
  constructor() { this.buckets = new Map(); this.frame = new THREE.Matrix4(); }
  /** Place the next parts in a frame at (x, y, z) turned `rotY` about y. */
  at(x, y, z, rotY = 0) { this.frame.compose(P3.set(x, y, z), Q.setFromEuler(E.set(0, rotY, 0)), S3.set(1, 1, 1)); return this; }
  /** Add `geo` placed by `m` in the frame, drawn with `material`; `color` its vertex colour on a vertex-coloured material; `uvScale[i >> 2]` scales vertex i's uv (a box's faces). */
  geo(geo, material, m, color = 0xffffff, uvScale = null) {
    const count = geo.attributes.position.count, ix = geo.index?.array, icount = ix ? ix.length : count, coloured = material.vertexColors;
    let b = this.buckets.get(material);
    if (!b) this.buckets.set(material, b = { material, n: 0, ni: 0, pos: new Float32Array(3072), nor: new Float32Array(3072), uv: new Float32Array(2048), col: coloured ? new Float32Array(3072) : null, idx: new Uint32Array(4096) });
    if ((b.n + count) * 3 > b.pos.length) { const grow = a => { const o = new a.constructor(Math.max(a.length * 2, a.length + count * 4)); o.set(a); return o; }; b.pos = grow(b.pos); b.nor = grow(b.nor); b.uv = grow(b.uv); if (b.col) b.col = grow(b.col); }
    if (b.ni + icount > b.idx.length) { const o = new Uint32Array(Math.max(b.idx.length * 2, b.idx.length + icount)); o.set(b.idx); b.idx = o; }
    W.multiplyMatrices(this.frame, m); NM.getNormalMatrix(W);
    const e = W.elements, n = NM.elements, P = geo.attributes.position.array, R = geo.attributes.normal.array, U = geo.attributes.uv?.array, base = b.n, { pos, nor, uv, col } = b;
    if (coloured) C.set(color);
    for (let i = 0, v = base * 3, t = base * 2; i < count; i++, v += 3, t += 2) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], a = R[i * 3], c = R[i * 3 + 1], d = R[i * 3 + 2];
      pos[v] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos[v + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos[v + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const ox = n[0] * a + n[3] * c + n[6] * d, oy = n[1] * a + n[4] * c + n[7] * d, oz = n[2] * a + n[5] * c + n[8] * d, l = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
      nor[v] = ox / l; nor[v + 1] = oy / l; nor[v + 2] = oz / l;
      if (!U) { uv[t] = 0; uv[t + 1] = 0; } else if (uvScale) { const f = uvScale[i >> 2]; uv[t] = U[i * 2] * f[0]; uv[t + 1] = U[i * 2 + 1] * f[1]; } else { uv[t] = U[i * 2]; uv[t + 1] = U[i * 2 + 1]; }
      if (coloured) { col[v] = C.r; col[v + 1] = C.g; col[v + 2] = C.b; }
    }
    if (ix) for (let i = 0; i < icount; i++) b.idx[b.ni + i] = base + ix[i];
    else for (let i = 0; i < icount; i++) b.idx[b.ni + i] = base + i;
    b.n += count; b.ni += icount;
    return this;
  }
  /** A w x h x d box of plain `color` at (x, y, z) in the frame, turned `ry` about y then `rx` about x. */
  box(w, h, d, color, x, y, z, ry = 0, rx = 0) { L.compose(P3.set(x, y, z), Q.setFromEuler(E.set(rx, ry, 0, 'YXZ')), S3.set(w, h, d)); return this.geo(UNIT_BOX, finishOf(mat(color)), L, color); }
  /** The same box on a textured `material`, a tile every `ru` metres across each face and `rv` up it (uvBox). */
  texBox(w, h, d, material, ru, rv, x, y, z, ry = 0, rx = 0) {
    L.compose(P3.set(x, y, z), Q.setFromEuler(E.set(rx, ry, 0, 'YXZ')), S3.set(w, h, d));
    return this.geo(UNIT_BOX, material, L, 0xffffff, [[d / ru, h / rv], [d / ru, h / rv], [w / ru, d / rv], [w / ru, d / rv], [w / ru, h / rv], [w / ru, h / rv]]);
  }
  /** A w x h upright plane facing local +z on `material` at (x, y, z), turned `ry`. */
  plane(w, h, material, x, y, z, ry = 0, color = 0xffffff) { L.compose(P3.set(x, y, z), Q.setFromEuler(E.set(0, ry, 0)), S3.set(w, h, 1)); return this.geo(UNIT_PLANE, material, L, color); }
  /** Any geometry at (x, y, z), turned `ry`, scaled `sc`, in plain `color` (or on `material`). */
  shape(geo, color, x, y, z, ry = 0, sc = 1, material = null) { L.compose(P3.set(x, y, z), Q.setFromEuler(E.set(0, ry, 0)), S3.set(sc, sc, sc)); return this.geo(geo, material || finishOf(mat(color)), L, color); }
  /** Make the gathered parts into `group`, one mesh per material, casting shadows unless unlit; returns the group. */
  into(group) {
    for (const b of this.buckets.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(b.pos.slice(0, b.n * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(b.nor.slice(0, b.n * 3), 3)); g.setAttribute('uv', new THREE.BufferAttribute(b.uv.slice(0, b.n * 2), 2));
      if (b.col) g.setAttribute('color', new THREE.BufferAttribute(b.col.slice(0, b.n * 3), 3));
      g.setIndex(new THREE.BufferAttribute(b.n > 65535 ? b.idx.slice(0, b.ni) : Uint16Array.from(b.idx.subarray(0, b.ni)), 1));
      const m = new THREE.Mesh(g, b.material); m.castShadow = !b.material.isMeshBasicMaterial && SHADOWS(); m.receiveShadow = true; m.name = 'merged'; group.add(m);
    }
    this.buckets.clear();
    return group;
  }
}

// ---------- Haussmann blocks (world units) ----------
/**
 * A Haussmann block into merger `M`, in world units, its front (local +z) on
 * the street: the stone body on the kit's facade (bays every 2.4 m, floors
 * every 3.2 m), a ground floor of shopfronts under coloured awnings, two
 * lines of iron balconies, the cornice, the zinc mansard with dormers and
 * chimney stacks ("détaillés" only for the small parts). `y` is the ground's
 * height at its centre. Leaves M's frame on the block, for more parts.
 */
export function haussmann(M, k, x, y, z, w, d, h, rotY, { tint = Math.floor(Math.random() * 3), shops = true, detail = high(), awnings = [0x1f3a93, 0xc8102e, 0x2e5d3a, 0x5c1a33, 0x222222, 0xb08a3a] } = {}) {
  const gf = 5.2; M.at(x, y, z, rotY);
  M.texBox(w, h - gf, d, k.stone(tint), 12, 9.6, 0, gf + (h - gf) / 2, 0);
  M.box(w, gf, d, 0xcdbf9f, 0, gf / 2, 0);                                                              // the ground floor's rusticated stone
  M.box(w + 0.8, 0.7, d + 0.8, 0xd9cfb8, 0, h + 0.35, 0);                                               // the cornice
  M.box(w + 0.3, 0.35, d + 0.3, 0xd9cfb8, 0, gf, 0);                                                    // the string course over the shops
  L.makeTranslation(0, h + 0.7, 0); M.geo(mansardOf(w, d), k.zinc, L);
  for (const fy of high() ? [gf + 3.2, h - 3.0] : []) M.box(w * 0.98, 0.12, 0.9, 0x2a2a2a, 0, fy, d / 2 + 0.45);   // the balconies of the second and the fifth floors
  if (shops) for (let sx = -w / 2 + 4; sx < w / 2 - 3; sx += high() ? rand(7, 10) : rand(16, 22)) { M.plane(4.4, 2.8, k.window, sx + 2, 1.9, d / 2 + 0.02); M.box(5, 0.12, 1.8, pick(awnings), sx + 2, 3.9, d / 2 + 0.9, 0, 0.3); }
  if (detail) {
    for (let dx = -w / 2 + 3; dx < w / 2 - 2; dx += 6.4) M.box(1.3, 1.5, 1.2, 0x5b626d, dx, h + 2.6, d / 2 - 1.6);     // the dormers
    for (let dx = -w / 2 + 6; dx < w / 2 - 4; dx += rand(11, 16)) M.box(1.4, 2.6, 0.7, 0xb5795c, dx, h + 5.7, 0);         // the chimney stacks
  }
  return M;
}

// ---------- Clearance of the road, fast ----------
/** The samples by 50 m cell, for the circuit being built (rebuilt when G.samples changes). */
let GRID = null, GRID_OF = null;
const GCELL = 50;
function grid() {
  if (GRID_OF === G.samples) return GRID;
  GRID = new Map(); GRID_OF = G.samples;
  for (const s of G.samples) { const k = Math.floor(s.x / GCELL) + ',' + Math.floor(s.z / GCELL); if (!GRID.has(k)) GRID.set(k, []); GRID.get(k).push(s); }
  return GRID;
}
/**
 * isClear (state.js) on a grid: whether world (x, z) is at least `margin`
 * metres clear of the road's edge, every sample counted. Exact for margins up
 * to 50 m less the road's half-width; for the hundreds of pieces placed along
 * the road, where a full search per piece would be the build's main cost.
 */
export function clear(x, z, margin) {
  const g = grid(), cx = Math.floor(x / GCELL), cz = Math.floor(z / GCELL), reach = Math.ceil((G.hw + margin) / GCELL);
  for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
    const list = g.get((cx + i) + ',' + (cz + j)); if (!list) continue;
    for (const s of list) { const lim = (s.hw ?? G.hw) + margin; if ((s.x - x) ** 2 + (s.z - z) ** 2 < lim * lim) return false; }
  }
  return true;
}

// ---------- The ground's height, fast ----------
/** The terrain's heights at the ground mesh's own vertices (track.js groundMesh: 25 m apart, 3200 m square, the terrain within 800 m), filled as asked, for the build. */
const LAT = new Float32Array(129 * 129); let LAT_OF = null, LAT_FLAT = true;
function latticeY(i, j) {
  const k = i * 129 + j; if (Number.isNaN(LAT[k])) { const x = -1600 + j * 25, z = -1600 + i * 25; LAT[k] = Math.abs(x) <= 800 && Math.abs(z) <= 800 ? terrainY(x, z) : 0; }
  return LAT[k];
}
/**
 * yAt (context.js) for the hundreds of pieces a builder places: the nearest
 * sample found on the grid, and the terrain as the ground mesh draws it
 * (bilinear between its vertices, cached) instead of the full blend per call.
 */
export function groundY(x, z) {
  if (LAT_OF !== G.samples) { LAT.fill(NaN); LAT_OF = G.samples; LAT_FLAT = G.samples.every(s => Math.abs(s.y || 0) < 1e-6); }
  if (LAT_FLAT) return 0;
  const g = grid(), cx = Math.floor(x / GCELL), cz = Math.floor(z / GCELL);
  let best = null, bd = Infinity;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const list = g.get((cx + i) + ',' + (cz + j)); if (list) for (const s of list) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = s; } } }
  const fx = Math.min(127.999, Math.max(0, (x + 1600) / 25)), fz = Math.min(127.999, Math.max(0, (z + 1600) / 25)), j = Math.floor(fx), i = Math.floor(fz), u = fx - j, v = fz - i;
  const t = (latticeY(i, j) * (1 - u) + latticeY(i, j + 1) * u) * (1 - v) + (latticeY(i + 1, j) * (1 - u) + latticeY(i + 1, j + 1) * u) * v;
  if (!best) return t;
  const d = Math.sqrt(bd), edge = (best.hw ?? G.hw) + PAVEMENT, y = best.y || 0;
  if (d <= edge) return y;
  if (d >= edge + EMBANK) return t;
  return y + (t - y) * (d - edge) / EMBANK;
}

/** Whether a block of w x d centred at (x, z), turned rotY, sits `margin` metres clear of the road (world units): its corners, its edges' midpoints and its centre. */
export function blockClear(x, z, w, d, rotY, margin) {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  for (const [lx, lz] of [[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, d / 2], [0, -d / 2], [-w / 2, 0], [w / 2, 0]]) if (!clear(x + lx * c + lz * s, z - lx * s + lz * c, margin)) return false;
  return true;
}
/** Footprints (world units) placed so far, to keep blocks out of one another and out of the landmarks: { x, z, w, d, rotY }. */
export function footprints() {
  const list = [];
  const inside = (f, px, pz, pad) => { const c = Math.cos(f.rotY), s = Math.sin(f.rotY), dx = px - f.x, dz = pz - f.z; const lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < f.w / 2 + pad && Math.abs(lz) < f.d / 2 + pad; };
  const corners = f => { const c = Math.cos(f.rotY), s = Math.sin(f.rotY); return [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]].map(([a, b]) => [f.x + a * f.w / 2 * c + b * f.d / 2 * s, f.z - a * f.w / 2 * s + b * f.d / 2 * c]); };
  return {
    list,
    /** Reserve a footprint. */
    add(f) { list.push(f); return f; },
    /** Whether `f` overlaps none reserved, within `pad` metres. */
    free(f, pad = 1) { const rf = Math.hypot(f.w, f.d) / 2; return list.every(o => Math.hypot(o.x - f.x, o.z - f.z) > rf + Math.hypot(o.w, o.d) / 2 + pad || corners(f).every(([px, pz]) => !inside(o, px, pz, pad)) && corners(o).every(([px, pz]) => !inside(f, px, pz, pad))); },
  };
}

/**
 * Line the road with Haussmann blocks, in world units, into `sectors` groups
 * around the circuit's centre (merged per sector, so the frustum still culls
 * them by part of town): along both edges, fronts `front` metres past the
 * road's edge, a cross street now and then, each block clear of every part of
 * the road and of the reserved footprints. Returns the blocks' footprints.
 * `side` limits it to one edge (+1 / -1), `skip(i, side)` drops stretches.
 */
export function* lineWithBlocks(world, k, fp, name, { sectors = 8, front = 15, side = 0, skip = () => false, hmin = 18, hmax = 23 } = {}) {
  const mergers = Array.from({ length: sectors }, () => new Merger());
  const N = G.N, placed = [], spacing = G.trackLength / N;
  let tried = 0;
  for (const sg of side ? [side] : [1, -1]) {
    for (let i = 0; i < N;) {
      const w = rand(42, 66), d = rand(20, 26), h = rand(hmin, hmax), step = Math.max(4, Math.round(w / spacing));
      const m = G.samples[(i + Math.round(step / 2)) % N], lat = sg * (G.hw + front + d / 2);
      const x = m.x + m.sx * lat, z = m.z + m.sz * lat, rotY = Math.atan2(-m.sx * sg, -m.sz * sg);
      const f = { x, z, w, d, rotY };
      if (!skip(i, sg) && fp.free(f, 0.3) && blockClear(x, z, w, d, rotY, front - 3)) {
        fp.add(f); placed.push(f);
        const a = Math.atan2(z, x), gi = Math.min(sectors - 1, Math.floor((a + Math.PI) / (2 * Math.PI) * sectors));
        haussmann(mergers[gi], k, x, groundY(x, z), z, w, d, h, rotY);
        i += step + 1 + (Math.random() < 0.3 ? Math.round(14 / spacing) : 0);   // a cross street every few blocks
      } else i += 4;   // try again a little further on
      if (++tried % 10 === 0) yield;
    }
  }
  for (const [i, M] of mergers.entries()) { if (!M.buckets.size) continue; const g = new THREE.Group(); g.name = name + ':' + i; world.add(still(M.into(g))); yield; }
  return placed;
}

/**
 * A few lit flats on the blocks' fronts when the climate lights the lamps:
 * warm quads on the facades, one instanced batch in world units. Nothing by
 * day.
 */
export function litWindows(blocks, perBlock = 5) {
  if (!lampsLit() || !blocks.length) return;
  const b = batch(() => new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.0), new THREE.MeshBasicMaterial({ color: 0xffd27a })), { world: true });
  for (const f of blocks) {
    const c = Math.cos(f.rotY), s = Math.sin(f.rotY), y0 = groundY(f.x, f.z);
    for (let n = 0; n < perBlock; n++) {
      const lx = rand(-f.w / 2 + 2, f.w / 2 - 2), fy = 5.2 + 1.6 + Math.floor(rand(0, 4)) * 3.2, lz = f.d / 2 + 0.06;
      b.add(f.x + lx * c + lz * s, f.z - lx * s + lz * c, { y: y0 + fy, rotY: f.rotY });
    }
  }
}

// ---------- Repeated street furniture, as instanced() prop makers ----------
const ball = r => (high() ? new THREE.SphereGeometry(r, 10, 7) : new THREE.IcosahedronGeometry(r, 1));
/**
 * A Paris street tree: 'plane' (a platane: pale trunk, three crowns),
 * 'chestnut' (rounder and darker) or 'curtain' (a plane clipped square, as
 * along the quais). A few hundred stand along a circuit: few segments.
 */
export function treeProp(kind = 'plane') {
  return () => {
    const g = new THREE.Group(), lo = !high(), crown = (r, c, x, y, z, sy = 1, small = false) => { const m = part(lo && small ? new THREE.IcosahedronGeometry(r, 0) : ball(r), c, x, y, z); m.scale.y = sy; g.add(m); };
    g.add(part(new THREE.CylinderGeometry(0.32, 0.48, 6.6, lo ? 5 : 6, 1, true), 0xa39a86, 0, 3.3, 0));
    if (kind === 'curtain') { g.add(box(4.6, 4.0, 3.0, 0x55913f, 0, 8.4, 0)); g.add(box(3.9, 0.9, 2.5, 0x67a34c, 0, 10.8, 0)); }
    else if (kind === 'chestnut') { crown(3.3, 0x3f7a35, 0, 8.3, 0, 0.9); crown(2.4, 0x4a8a3c, 1.6, 9.7, 0.6, 1, true); if (!lo) crown(2.2, 0x37702f, -1.5, 9.4, -0.7, 1, true); }
    else { crown(3.0, 0x5d9a4a, 0, 8.6, 0, 0.85); crown(2.2, 0x6fab55, 1.7, 9.8, 0.7, 1, true); if (!lo) crown(2.0, 0x4f8a40, -1.5, 9.5, -0.9, 1, true); }
    return g;
  };
}
/** A brown Paris bollard (potelet) with its ring. */
export const bollardProp = () => { const g = new THREE.Group(), S = high() ? 6 : 5; g.add(part(new THREE.CylinderGeometry(0.09, 0.11, 0.95, S), 0x4a3a2e, 0, 0.47, 0)); g.add(part(new THREE.CylinderGeometry(0.13, 0.13, 0.08, S, 1, true), 0x4a3a2e, 0, 0.78, 0)); return g; };
/** A Morris column: dark green foot and dome, posters around the drum. */
export const morrisProp = () => {
  const g = new THREE.Group(), S = high() ? 10 : 6; g.add(cyl(0.78, 0.82, 0.5, 0x1f4a35, 0, 0.25, 0, S)); g.add(cyl(0.62, 0.62, 3.1, 0xe8dcc0, 0, 2.05, 0, S)); g.add(cyl(0.74, 0.7, 0.35, 0x1f4a35, 0, 3.75, 0, S));
  const d = part(ball(0.66), 0x1f4a35, 0, 3.95, 0); d.scale.y = 0.6; g.add(d); g.add(cone(0.12, 0.5, 0x1f4a35, 0, 4.55, 0, 5));
  [0xc8102e, 0xf2c14e, 0x1f3a93, 0x2e8b57, 0xe36f8a].forEach((c, i) => { const a = i / 5 * Math.PI * 2, p = box(0.62, 1.5, 0.04, c, Math.sin(a) * 0.63, 2.1, Math.cos(a) * 0.63); p.rotation.y = a; g.add(p); });
  return g;
};
/** A Wallace fountain: dark green, four caryatids under a little dome (street.js wallace, in fewer segments). */
export const wallaceProp = () => {
  const g = new THREE.Group(), S = high() ? 10 : 6, G2 = 0x1f5a3a; g.add(cyl(0.9, 1.0, 0.5, G2, 0, 0.25, 0, S)); g.add(cyl(0.45, 0.6, 1.0, G2, 0, 1.0, 0, S));
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; g.add(cyl(0.1, 0.12, 1.2, G2, Math.cos(a) * 0.4, 2.1, Math.sin(a) * 0.4, high() ? 5 : 4)); }
  g.add(part(ball(0.55), G2, 0, 2.9, 0)); g.add(cone(0.15, 0.4, G2, 0, 3.5, 0, 5));
  return g;
};
/** A wooden slat bench on cast-iron feet; faces local +z. */
export const benchProp = () => { const g = new THREE.Group(); g.add(box(1.9, 0.08, 0.5, 0x8b5a2b, 0, 0.48, 0)); g.add(box(1.9, 0.42, 0.06, 0x8b5a2b, 0, 0.78, -0.24)); [-0.8, 0.8].forEach(x => g.add(box(0.08, 0.5, 0.5, 0x1f3a2e, x, 0.25, 0))); return g; };
/** A police (Vauban) panel, 2.5 m, with its feet; along local x. */
export const vaubanProp = () => { const g = new THREE.Group(); [1.05, 0.55].forEach(y => g.add(box(2.4, 0.07, 0.07, 0x9a9a9a, 0, y, 0))); [-1.2, 1.2].forEach(x => { g.add(cyl(0.05, 0.05, 1.1, 0x9a9a9a, x, 0.55, 0, 5)); g.add(box(0.1, 0.06, 0.8, 0x9a9a9a, x, 0.03, 0)); }); for (let x = -1; x <= 1; x += 0.25) g.add(box(0.03, 0.5, 0.03, 0x9a9a9a, x, 0.8, 0)); return g; };
/** A brass stanchion of a red-carpet rope. */
export const stanchionProp = () => { const g = new THREE.Group(); g.add(cyl(0.05, 0.05, 1.0, 0xd4af37, 0, 0.5, 0, 6)); g.add(cyl(0.22, 0.22, 0.05, 0xd4af37, 0, 0.03, 0, 8)); g.add(part(ball(0.08), 0xd4af37, 0, 1.04, 0)); return g; };
/** A pigeon on the pavement: a few facets. */
export const pigeonProp = () => { const g = new THREE.Group(); const b = part(new THREE.IcosahedronGeometry(0.2, 0), 0x8a8a92, 0, 0.2, 0); b.scale.set(1.4, 0.8, 1); g.add(b); g.add(part(new THREE.IcosahedronGeometry(0.11, 0), 0x6a6a74, 0.22, 0.38, 0)); g.add(cone(0.035, 0.1, 0xe0a030, 0.33, 0.37, 0, 3).rotateZ(-Math.PI / 2)); return g; };
/** A Paris candelabrum: foot, fluted post, lantern; its glass head is the shared lamp glow (street.js lampMat). Head at LAMP_RISE. */
export const LAMP_RISE = 5.9;
export const lampProp = () => {
  const g = new THREE.Group(), S = high() ? 8 : 5; g.add(cyl(0.26, 0.34, 0.9, 0x23302e, 0, 0.45, 0, S)); g.add(cyl(0.09, 0.15, 4.6, 0x23302e, 0, 3.2, 0, S)); g.add(box(0.62, 0.14, 0.62, 0x23302e, 0, 5.45, 0));
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.75, 0.46), lampMat()); head.position.y = LAMP_RISE; g.add(head); if (high()) g.add(cone(0.45, 0.45, 0x23302e, 0, 6.5, 0, 4)); return g;
};
/**
 * A batch of candelabra whose heads the climate lights at dusk and at night
 * (G.lamps): `add(x, z, { y, world })` places one in the batch's coordinates
 * and registers a head where its glass will stand.
 */
export function lampRow({ world = false } = {}) {
  const b = batch(lampProp, { world });
  return {
    batch: b,
    add(x, z, { y = 0, rotY = 0 } = {}) {
      const wx = world ? x : x * DS, wz = world ? z : z * DS, wy = world ? y : groundY(wx, wz) + y;
      const head = new THREE.Object3D(); head.position.set(wx, wy + LAMP_RISE, wz); head.updateMatrixWorld(true);
      G.lamps.push({ head, rise: LAMP_RISE });
      return b.add(x, z, { y, rotY });
    },
  };
}

/**
 * Photographers' flashes: a white burst at each camera, on for a few
 * hundredths of a second at its own rhythm. One instanced batch moved
 * in place (decor/instanced.js move); the rhythm is a function of the race
 * clock, so a replayed scene flashes alike. `spots` in the batch's
 * coordinates: [{ x, z, y }].
 */
export function flashes(spots, { world = false } = {}) {
  if (!spots.length) return;
  const b = batch(() => new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })), { world, pad: 1 });
  const ids = spots.map(p => ({ i: b.add(p.x, p.z, { y: p.y, scale: 0.001 }), rate: rand(0.25, 0.7), ph: rand(0, 1), on: false }));
  G.animated.push(() => {
    for (const f of ids) {
      const on = ((G.time * f.rate + f.ph) % 1) < 0.035;
      if (on !== f.on) { f.on = on; b.move(f.i, { scale: on ? 1 : 0.001 }); }
    }
  });
}

// ---------- Statues ----------
let STATUE = null;
/** The parts of a statue, feet at the origin: a draped body, the head, a raised arm (and a Renommée's wings). */
const statueParts = () => STATUE || (STATUE = {
  body: new THREE.CylinderGeometry(0.3, 0.5, 1.9, 8).translate(0, 0.95, 0), head: new THREE.IcosahedronGeometry(0.25, 1).translate(0, 2.15, 0),
  arm: new THREE.BoxGeometry(0.13, 0.95, 0.13).rotateZ(-0.45).translate(0.42, 2.05, 0), base: new THREE.CylinderGeometry(0.55, 0.6, 0.25, 8).translate(0, 0.12, 0),
  wings: new THREE.BoxGeometry(1.6, 1.2, 0.08).translate(0, 1.7, -0.32),
});
/** A statue of `color` into merger M standing at (x, y, z), `s` times life size, turned `ry`; `wings` for the gilded Renommées of the bridges. */
export function statueInto(M, x, y, z, s = 1, color = 0xe8e2d6, ry = 0, wings = false) {
  const p = statueParts();
  for (const geo of wings ? [p.base, p.body, p.head, p.arm, p.wings] : [p.base, p.body, p.head, p.arm]) M.shape(geo, color, x, y, z, ry, s);
  return M;
}

// ---------- The garde républicaine ----------
/**
 * A horse of the garde républicaine with its rider, into a new group facing
 * local +x: the horse in boxes (body, neck, head, legs, tail, the saddle
 * cloth), the rider in blue with white breeches and the plumed helmet.
 */
export function horseman(coat = 0x5a3a22) {
  const g = new THREE.Group(); g.name = 'garde';
  g.add(box(2.1, 0.85, 0.7, coat, 0, 1.6, 0));
  const neck = box(0.42, 1.0, 0.36, coat, 1.0, 2.2, 0); neck.rotation.z = -0.55; g.add(neck);
  const head = box(0.75, 0.3, 0.3, coat, 1.48, 2.62, 0); head.rotation.z = -0.35; g.add(head);
  g.add(box(0.08, 0.5, 0.14, 0x1a1a1a, 1.12, 2.55, 0));                                                    // the mane
  for (const [lx, lz] of [[0.82, 0.22], [0.82, -0.22], [-0.82, 0.22], [-0.82, -0.22]]) g.add(box(0.17, 1.25, 0.17, coat, lx, 0.62, lz));
  const tail = box(0.12, 0.85, 0.12, 0x1a1a1a, -1.12, 1.45, 0); tail.rotation.z = 0.35; g.add(tail);
  g.add(box(0.95, 0.55, 0.8, 0x1f2a5e, -0.1, 1.72, 0)); g.add(box(0.97, 0.08, 0.82, 0xd4af37, -0.1, 1.45, 0));   // the saddle cloth and its braid
  g.add(box(0.36, 0.55, 0.9, 0xf6f1e4, -0.05, 2.12, 0));                                                    // the breeches astride
  g.add(cyl(0.24, 0.29, 0.8, 0x1f2a5e, -0.05, 2.75, 0, 8)); g.add(box(0.5, 0.1, 0.6, 0xc8102e, -0.05, 2.4, 0));
  g.add(part(ball(0.2), 0xf1c27d, -0.05, 3.32, 0)); g.add(cyl(0.22, 0.22, 0.26, 0xd4af37, -0.05, 3.5, 0, 8));
  g.add(box(0.5, 0.14, 0.06, 0x1a1a1a, -0.1, 3.68, 0)); g.add(cyl(0.04, 0.06, 0.4, 0xc8102e, 0.05, 3.85, 0, 5));   // the horsehair crest and the plume
  g.add(cyl(0.025, 0.025, 1.1, 0xdddddd, 0.15, 3.0, 0.32, 4));                                               // the sabre at the shoulder
  return g;
}

// ---------- A Paris circuit's street life ----------
/** A flower kiosk: a green stall under an awning, three tiers of buckets of flowers in front, at world (x, z). Faces local +z. */
export function fleuriste(x, z, rotY, y = groundY(x, z)) {
  const g = new THREE.Group(); g.name = 'paris:fleuriste';
  g.add(slab(4.2, 2.6, 2.4, 0x2e5d3a, 0, 1.3, -0.6)); g.add(slab(4.8, 0.12, 2.2, 0x2e5d3a, 0, 2.9, 0.9)); g.add(slab(4.6, 0.6, 0.1, 0xf6f1e4, 0, 2.6, 1.95));
  const sg = textPlane(3.6, 0.6, 'FLEURS', '#2e5d3a', '#f6f1e4', 72); sg.position.set(0, 2.25, 0.62); g.add(sg);
  const bucket = new THREE.CylinderGeometry(0.2, 0.16, 0.36, high() ? 8 : 5), bunch = new THREE.IcosahedronGeometry(0.3, 0);
  for (let t = 0; t < 3; t++) {
    g.add(slab(4.2, 0.08, 0.5, 0x8b5a2b, 0, 0.35 + t * 0.4, 0.8 - t * 0.45));
    for (let i = 0; i < 7; i += high() ? 1 : 2) { const bx = -1.8 + i * 0.6, by = 0.57 + t * 0.4, bz = 0.8 - t * 0.45; g.add(part(bucket, 0x9a9a9a, bx, by, bz)); g.add(part(bunch, pick([0xe63946, 0xf2c14e, 0xf6f1e4, 0xe36f8a, 0x8a5fc8, 0xff7f11]), bx, by + 0.35, bz)); }
  }
  g.position.set(x, y, z); g.rotation.y = rotY;
  return g;
}

/**
 * The street life of a Paris circuit built in world units: the build's kit
 * and footprints, the instanced batches its builder fills (trees, bollards,
 * candelabra, benches, Wallace fountains, Morris columns, pigeons, police
 * panels, black berlines), and helpers: `spot(i, side, lat)` a point `lat`
 * metres past the road's edge at sample i (with the ground's height and the
 * yaw that faces the road), `photographer()` a press figure whose flash
 * fires, `roadside()` the furniture along both edges of the road, `finish()`
 * at the end of the build (the flashes).
 */
export function paris(scene, world) {
  const N = G.N, flashSpots = [];
  const walkers = [0x3b4a6b, 0x8a2b2b, 0x2e7d5b, 0xe0b040, 0x5a5a5a, 0x222222].map(c => batch(fromBuilder(g => { const f = figure(c, pick(SKINS), null); g.add(f); }), { world: true }));
  const trees = { plane: batch(treeProp('plane'), { world: true }), chestnut: batch(treeProp('chestnut'), { world: true }), curtain: batch(treeProp('curtain'), { world: true }) };
  const P = {
    k: kit(), fp: footprints(), trees, flashSpots,
    bollards: batch(bollardProp, { world: true }), lamps: lampRow({ world: true }), benches: batch(benchProp, { world: true }), wallaces: batch(wallaceProp, { world: true }),
    morris: batch(morrisProp, { world: true }), pigeons: batch(pigeonProp, { world: true }), vauban: batch(vaubanProp, { world: true }), berlines: batch(fromBuilder(g => sedan(g, 0, 0, 0, 0x111111)), { world: true }),
    /** A world coordinate in the scale-1 decor group, for street.js props the spread puts back where they belong. */
    s1: v => v / DS,
    /** A plain lit material of `color` (one per call: for the few big planes). */
    plain: (color, rough = 0.95) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 }),
    /** A w x d plane lying at height y in group g, centred on (x, z). */
    flat: (g, w, d, x, z, m, y = 0.03) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; g.add(p); return p; },
    tree: (kind, x, z, y = groundY(x, z)) => trees[kind].add(x, z, { y, rotY: rand(0, 6.28), scale: rand(0.85, 1.15) }),
    spot(i, sg, lat) { const s = G.samples[((i % N) + N) % N], l = sg * (s.hw + lat), x = s.x + s.sx * l, z = s.z + s.sz * l; return { s, x, z, y: groundAt(x, z, lat), face: Math.atan2(-s.sx * sg, -s.sz * sg) }; },
    photographer(parent, x, z, rot, y = 0) {
      const f = figure(pick([0x222222, 0x3b4a6b, 0x5a5a5a, 0x6b4a2b]), pick(SKINS), 'press'); f.position.set(x, y, z); f.rotation.y = rot; parent.add(f);
      G.crowd.push({ g: f, ph: rand(0, 6), amp: 0.08, base: y }); flashSpots.push({ x: x + Math.sin(rot) * 0.75, z: z + Math.cos(rot) * 0.75, y: y + 1.32 });
      return f;
    },
    /**
     * Along both edges of the road: plane trees (and clipped ones), Wallace
     * fountains, Morris columns, benches, Métro entrances at `metro`, café
     * terraces at `cafes` ([f, name, colour]), flower kiosks at `fleurs`,
     * pigeons on the pavements. `skip(i, side)` keeps a stretch bare (a
     * tunnel, a bridge).
     */
    *roadside({ cafes = [], metro = [], fleurs = [], skip = () => false } = {}) {
      const step = high() ? 10 : 44;
      for (let i = 0; i < N; i += step) for (const sg of [1, -1]) {
        const at = i + (sg > 0 ? 0 : step / 2); if ((sg > 0 && (at < 12 || at > N - 12)) || skip(at, sg)) continue;   // the grandstand at the start
        const p = P.spot(at, sg, 9.5); if (clear(p.x, p.z, 7.5)) P.tree(i % 180 < 90 ? 'plane' : 'curtain', p.x, p.z);
      }
      yield;
      const along = (n, f0, df, lat, sg0, add) => { for (let j = 0; j < n; j++) { const at = Math.floor(N * (f0 + j * df)) % N, sg = j % 2 ? -sg0 : sg0; if (skip(at, sg)) continue; const p = P.spot(at, sg, lat); if (clear(p.x, p.z, lat - 1)) add(p); } };
      along(10, 0.05, 0.097, 7.5, 1, p => P.wallaces.add(p.x, p.z, { y: p.y }));
      along(10, 0.1, 0.093, 7.6, -1, p => P.morris.add(p.x, p.z, { y: p.y }));
      along(28, 0.003, 1 / 28, 7.2, 1, p => P.benches.add(p.x, p.z, { y: p.y, rotY: p.face }));
      for (const f of metro) along(1, f, 0, 9, -1, p => metroEntrance(scene, P.s1(p.x), P.s1(p.z), p.face + Math.PI));
      for (const [f, name, c] of cafes) along(1, f, 0, 11.5, -1, p => cafe(scene, P.s1(p.x), P.s1(p.z), p.face, name, c, 3));
      for (const f of fleurs) along(1, f, 0, 11, 1, p => { const fl = fleuriste(p.x, p.z, p.face, p.y); world.add(fl); compact(fl); });
      for (let n = 0; n < nOf(50); n++) { const at = Math.floor(rand(0, N)), sg = pick([1, -1]); if (skip(at, sg)) continue; const p = P.spot(at, sg, rand(2, 5.5)); P.pigeons.add(p.x, p.z, { y: p.y, rotY: rand(0, 6.28) }); }
      for (let n = 0; n < (high() ? 90 : 24); n++) { const at = Math.floor(rand(0, N)), sg = pick([1, -1]); if (skip(at, sg)) continue; const p = P.spot(at, sg, rand(1.6, 5.6)); if (clear(p.x, p.z, 1)) pick(walkers).add(p.x, p.z, { y: p.y, rotY: rand(0, 6.28) }); }   // passers-by, standing
      yield;
    },
    finish() { flashes(flashSpots, { world: true }); },
  };
  return P;
}
