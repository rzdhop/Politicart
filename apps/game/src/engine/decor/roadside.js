// The roadside's dressing: what fills the pavements and the verges of every
// circuit once its own decor stands (track.js, after the themed decor is
// spread and its instanced props are made).
//
// A circuit's builder places its landmarks by hand; between them the road ran
// through bare grass. This pass lines the kerbs with bollards and planters,
// plants trees, shrubs and hedges on the verges and sets houses behind them,
// from a recipe per circuit (RECIPES). It never asks a builder where its
// pieces are: occupancy() rasterises what was built -- every decor triangle's
// edges, every instanced copy, the road -- on a 3 m grid, and a spot is free
// only if the grid is empty there and the road can be walked to from it (so
// nothing lands inside a building's walls or on a sheet of water, whose
// outlines close them off).
//
// "Détaillés" only: every prop here is an instanced batch (decor/life.js), a
// few draws per 200 m cell whatever the number of copies, and "légers" -- the
// phones' tier -- keeps the scene it had (dressRoadside returns at once).
import * as THREE from 'three';

import { box, cone, cyl, mat, sph } from '../primitives.js';
import { G, getPoly } from '../state.js';
import { pick, rand } from '../util.js';
import { PAVEMENT, yAt } from './context.js';
import { batch, perBuild } from './life.js';
import { treeAt } from './trees.js';

// ---------- What stands where ----------
/** The grid's cell and half-extent, in metres: every circuit's loop and its verges fit inside. */
const CELL = 3, HALF = 1300, SIDE = Math.ceil(2 * HALF / CELL);

/**
 * The grid of what the build has put down, a generator yielding every few
 * meshes (and returning the grid): `solid` cells hold decor, `road` cells the
 * road and its pavements, `reach` cells can be walked to from the road
 * without crossing either. Returns { free, clear, claim }: whether a disc of
 * radius r round (x, z) is open verge (clear of decor, its centre walkable
 * to), whether it is clear of decor (for a spot on the pavement), and the
 * taking of one.
 */
function* occupancy(world, layout) {
  const solid = new Uint8Array(SIDE * SIDE), road = new Uint8Array(SIDE * SIDE), reach = new Uint8Array(SIDE * SIDE);
  const at = (x, z) => { const i = Math.floor((x + HALF) / CELL), j = Math.floor((z + HALF) / CELL); return i < 0 || j < 0 || i >= SIDE || j >= SIDE ? -1 : j * SIDE + i; };
  const line = (into, ax, az, bx, bz) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL / 2))); for (let k = 0; k <= n; k++) { const c = at(ax + (bx - ax) * k / n, az + (bz - az) * k / n); if (c >= 0) into[c] = 1; } };
  // the road and its pavements, sample by sample; the crossing's street, 45 m either side
  const N = G.N, S = G.samples;
  for (const s of S) { const w = s.hw + PAVEMENT - CELL / 2; line(road, s.x - s.sx * w, s.z - s.sz * w, s.x + s.sx * w, s.z + s.sz * w); }
  for (const f of layout.features || []) if (f.t === 'crossing') { const s = S[Math.floor(f.f * N)]; for (const o of [-5, 0, 5]) line(road, s.x - s.sx * 48 + s.tx * o, s.z - s.sz * 48 + s.tz * o, s.x + s.sx * 48 + s.tx * o, s.z + s.sz * 48 + s.tz * o); }
  yield;
  // the decor: every triangle's edges, so a wall, a lawn's border and a water sheet's outline all close what they hold
  world.updateMatrixWorld(true);
  const meshes = []; world.traverse(o => { if (o.isMesh && o.visible && o.geometry) meshes.push(o); });
  const v = new THREE.Vector3(), m = new THREE.Matrix4();
  let n = 0;
  for (const o of meshes) {
    if (o.isInstancedMesh) { for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, m); v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld); const c = at(v.x, v.z); if (c >= 0) solid[c] = 1; } continue; }
    const pos = o.geometry.attributes.position, ix = o.geometry.index, xz = new Float32Array(pos.count * 2);
    for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld); xz[k * 2] = v.x; xz[k * 2 + 1] = v.z; }
    const count = ix ? ix.count : pos.count;
    for (let k = 0; k + 2 < count; k += 3) {
      const a = (ix ? ix.getX(k) : k) * 2, b = (ix ? ix.getX(k + 1) : k + 1) * 2, c = (ix ? ix.getX(k + 2) : k + 2) * 2;
      line(solid, xz[a], xz[a + 1], xz[b], xz[b + 1]); line(solid, xz[b], xz[b + 1], xz[c], xz[c + 1]); line(solid, xz[c], xz[c + 1], xz[a], xz[a + 1]);
    }
    if (++n % 40 === 0) yield;
  }
  // what can be walked to from just past the pavements, four ways (a diagonal wall's cells touch by their corners only)
  const queue = new Int32Array(SIDE * SIDE); let head = 0, tail = 0;
  const seed = c => { if (c >= 0 && !reach[c] && !solid[c] && !road[c]) { reach[c] = 1; queue[tail++] = c; } };
  for (const s of S) for (const sg of [1, -1]) { const w = (s.hw + PAVEMENT + CELL) * sg; seed(at(s.x + s.sx * w, s.z + s.sz * w)); }
  while (head < tail) {
    const c = queue[head++], i = c % SIDE;
    if (i > 0) seed(c - 1); if (i < SIDE - 1) seed(c + 1); if (c >= SIDE) seed(c - SIDE); if (c < SIDE * (SIDE - 1)) seed(c + SIDE);
    if (head % 60000 === 0) yield;
  }
  const disc = (x, z, r, test) => { for (let dz = -r; dz <= r; dz += CELL) for (let dx = -r; dx <= r; dx += CELL) { const c = at(x + dx, z + dz); if (c < 0 || !test(c)) return false; } return true; };
  return {
    free: (x, z, r) => reach[at(x, z)] === 1 && disc(x, z, r, c => !solid[c]),
    clear: (x, z, r) => disc(x, z, r, c => !solid[c]),
    claim: (x, z, r) => { disc(x, z, r, c => { solid[c] = 1; return true; }); },
  };
}

// ---------- The props ----------
// Kept to a few dozen triangles each: there are hundreds of copies. Their parts are plain colours, which a batch bakes
// into one mesh per finish (decor/instanced.js), so a prop is one draw per cell.
/** A flat panel facing local +z turned by `rotY`: a window, a shutter, a door, two triangles each. */
const pane = (w, h, color, x, y, z, rotY = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(color)); m.position.set(x, y, z); m.rotation.y = rotY; return m; };
/** A prop's batch, made once per build: cells of 400 m and no shadow cast unless `shadow` (a second draw each), as these props are small and a draw costs a phone more than their triangles. */
const prop = (name, build, { shadow = false, ...opts } = {}) => perBuild('roadside:' + name, () => batch(() => { const g = new THREE.Group(); build(g); if (!shadow) g.traverse(o => { o.castShadow = false; }); return g; }, { cell: 400, ...opts }));
const GREENS = [0xffffff, 0xe6f2dc, 0xdcebd2, 0xf4f0d8, 0xd0e4c8];
/** The walls a house takes, by circuit: pale, so the tint leaves the shutters and the tiles their own colour. */
const WALLS = { montmartre: [0xffffff, 0xfff4dc, 0xfde8e0, 0xf4f0e6, 0xfff0c8], marseille: [0xfff0d8, 0xffe2c4, 0xffd8c8, 0xfff6e0, 0xf8e0b8] };

/**
 * Every prop a recipe may name: (x, y, z, towards, along, track) puts one copy
 * down, `towards` the yaw facing the road and `along` the yaw of its tangent.
 * A name of the form `tree:<kind>` plants a tree of decor/trees.js instead.
 */
const PROPS = {
  // a kerb post: slimmer than street.js bollard(), as it stands every few metres
  post: (x, y, z) => prop('post', g => { g.add(cyl(0.1, 0.13, 0.85, 0x2a2f33, 0, 0.42, 0, 5)); g.add(cone(0.13, 0.16, 0x2a2f33, 0, 0.93, 0, 5)); }).add(x, z, { y }),
  // a cast-iron tub with a clipped shrub and its flowers
  planter: (x, y, z, towards) => prop('planter', g => { g.add(box(1.3, 0.7, 1.3, 0x3f4a44, 0, 0.35, 0)); g.add(box(1.4, 0.08, 1.4, 0x2f3a3a, 0, 0.72, 0)); g.add(sph(0.62, 0x3a7f45, 0, 1.15, 0, 6)); for (const [px, pz, c] of [[0.42, 0.42, 0xe36f8a], [-0.42, 0.4, 0xf2c14e], [0.4, -0.42, 0xf6f1e4], [-0.42, -0.42, 0xe36f8a]]) g.add(box(0.26, 0.26, 0.26, c, px, 0.88, pz)); }).add(x, z, { y, rotY: towards }),
  // a colonne Morris: the green drum of posters under its little dome
  morris: (x, y, z) => prop('morris', g => { g.add(cyl(0.7, 0.75, 0.5, 0x1f3a2a, 0, 0.25, 0, 10)); g.add(cyl(0.62, 0.62, 2.6, 0xe8dcc0, 0, 1.8, 0, 10)); for (const [a, c] of [[0, 0xc8102e], [2.1, 0x1f3a93], [4.2, 0xf2c14e]]) g.add(box(0.7, 1.1, 0.04, c, Math.sin(a) * 0.63, 1.9, Math.cos(a) * 0.63)).rotation.y = a; g.add(cyl(0.8, 0.7, 0.3, 0x1f3a2a, 0, 3.25, 0, 10)); g.add(cone(0.7, 0.9, 0x1f3a2a, 0, 3.85, 0, 10)); g.add(sph(0.12, 0x1f3a2a, 0, 4.35, 0, 5)); }).add(x, z, { y, rotY: rand(0, 6.28) }),
  shrub: (x, y, z) => prop('shrub', g => { const a = sph(0.9, 0x3f8a48, 0, 0.55, 0, 6); a.scale.set(1.2, 0.8, 1); g.add(a); const b = sph(0.6, 0x4f9a52, 0.7, 0.45, 0.3, 5); b.scale.set(1, 0.8, 1.1); g.add(b); }, { tint: true }).add(x, z, { y, rotY: rand(0, 6.28), scale: rand(0.8, 1.6), color: pick(GREENS) }),
  // a clipped hedge, 5.6 m of it along the road
  hedge: (x, y, z, _towards, along) => prop('hedge', g => { g.add(box(5.6, 1.5, 1.2, 0x2f6b3a, 0, 0.75, 0)); g.add(box(5.7, 0.14, 1.3, 0x3a7f45, 0, 1.55, 0)); }).add(x, z, { y, rotY: along }),
  // a stone vase on its pedestal, as the park's allées are lined with
  vase: (x, y, z) => prop('vase', g => { g.add(box(1.1, 1.3, 1.1, 0xd9cfb8, 0, 0.65, 0)); g.add(box(1.3, 0.16, 1.3, 0xcfc6b5, 0, 1.38, 0)); g.add(cyl(0.58, 0.2, 1.0, 0xe8e2d6, 0, 1.96, 0, 6)); g.add(cone(0.5, 0.8, 0x3a7f45, 0, 2.86, 0, 5)); }).add(x, z, { y }),
  flowerbed: (x, y, z, _towards, along) => prop('flowerbed', g => { g.add(box(4.2, 0.3, 1.8, 0x6b4a2b, 0, 0.15, 0)); g.add(box(4, 0.2, 1.6, 0x3f8a48, 0, 0.36, 0)); [0xe36f8a, 0xf2c14e, 0xf6f1e4, 0xd95f5f, 0x8a5fc8, 0xf2c14e, 0xe36f8a].forEach((c, i) => g.add(box(0.42, 0.34, 0.42, c, -1.65 + i * 0.55, 0.58, i % 2 ? 0.35 : -0.35))); }).add(x, z, { y, rotY: along }),
  // a boulder of the calanques' limestone
  rock: (x, y, z) => prop('rock', g => { const a = sph(1, 0xd8d0bc, 0, 0.45, 0, 5); a.scale.set(1.3, 0.75, 1); g.add(a); const b = sph(0.6, 0xc8c0aa, 0.9, 0.3, 0.5, 4); b.scale.set(1, 0.7, 1.2); g.add(b); }, { tint: true }).add(x, z, { y: y - 0.1, rotY: rand(0, 6.28), scale: rand(0.7, 2.2), color: pick([0xffffff, 0xf0ece0, 0xe6e0d0]) }),
  // a small house under its tiles: door, shuttered windows on two floors, a chimney; the front (+z) faces the road
  house: (x, y, z, towards, _along, track) => prop('house', g => {
    g.add(box(9, 6.2, 8, 0xffffff, 0, 3.1, 0)); g.add(box(9.5, 0.25, 8.5, 0xe8dcc0, 0, 6.3, 0));
    const roof = cone(1, 2.6, 0xa0523d, 0, 7.7, 0, 4); roof.rotation.y = Math.PI / 4; roof.scale.set(6.9, 1, 6.2); g.add(roof);
    g.add(box(0.8, 1.8, 0.8, 0xb9a98c, 2.4, 8.2, -1));
    g.add(pane(1.2, 2.3, 0x5a3a24, -2.6, 1.15, 4.02)); g.add(box(1.6, 0.14, 0.6, 0xb9a98c, -2.6, 0.07, 4.3));
    for (const [wx, wy] of [[0.4, 1.9], [3, 1.9], [-2.6, 4.5], [0.4, 4.5], [3, 4.5]]) { g.add(pane(1, 1.4, 0x223344, wx, wy, 4.02)); g.add(pane(0.45, 1.5, 0x2e6b4f, wx - 0.75, wy, 4.04)); g.add(pane(0.45, 1.5, 0x2e6b4f, wx + 0.75, wy, 4.04)); }
    for (const sg of [-1, 1]) for (const [wz, wy] of [[-1.6, 1.9], [1.8, 4.5]]) g.add(pane(1, 1.4, 0x223344, sg * 4.52, wy, wz, sg * Math.PI / 2));
  }, { tint: true, shadow: true }).add(x, z, { y, rotY: towards, scale: rand(0.95, 1.15), color: pick(WALLS[track.id] || WALLS.montmartre) }),
};

// ---------- The recipes ----------
/**
 * What lines each circuit, a list of layers. A layer puts `prop` down every
 * `every` samples (from sample `at`), on both sides or on one (`one`: sides
 * alternate), `lat` metres past the road's edge -- one distance, or a range a
 * draw picks in -- `n` times round the spot, keeping `r` metres clear. Under
 * PAVEMENT a spot is on the pavement and only decor can refuse it; past it,
 * it is on the verge and must be open ground.
 */
const kerb = { prop: 'post', every: 8, lat: 1.5, r: 0.5 };
const tubs = { prop: 'planter', every: 24, at: 6, lat: 2.8, r: 1, one: true };
const RECIPES = {
  elysee: [kerb, tubs, { prop: 'morris', every: 160, at: 66, lat: 3.4, r: 1.5, one: true },
    { prop: ['tree:lime', 'tree:lime', 'tree:chestnut', 'tree:plane'], every: 8, lat: [9.5, 70], r: 3.5 }, { prop: 'shrub', every: 9, at: 3, lat: [8, 40], r: 1.5 }],
  bourbon: [kerb, tubs, { prop: 'morris', every: 160, at: 66, lat: 3.4, r: 1.5, one: true },
    { prop: ['tree:lime', 'tree:poplar', 'tree:poplar', 'tree:plane'], every: 8, lat: [9.5, 70], r: 3.5 }, { prop: 'shrub', every: 9, at: 3, lat: [8, 40], r: 1.5 }],
  versailles: [{ prop: 'vase', every: 36, at: 15, lat: 4.2, r: 1 }, { prop: 'tree:topiary', every: 14, at: 5, lat: 2.4, r: 1 },
    { prop: 'hedge', every: 3, lat: 7.8, r: 0.6 }, { prop: 'flowerbed', every: 18, at: 9, lat: 10.8, r: 1.5 },
    { prop: 'tree:lime', every: 12, at: 4, lat: 15, r: 3 },
    { prop: ['tree:lime', 'tree:poplar', 'tree:cypress', 'tree:round'], every: 13, lat: [22, 90], r: 3.5 }, { prop: 'shrub', every: 18, lat: [11.5, 50], r: 1.5 }],
  montmartre: [kerb, tubs,
    { prop: 'house', every: 20, lat: [15, 19], r: 7.5 }, { prop: 'house', every: 30, at: 6, lat: [36, 50], r: 7.5 },
    { prop: ['tree:lime', 'tree:lime', 'tree:chestnut', 'tree:round'], every: 8, lat: [9.5, 75], r: 3.5 }, { prop: 'shrub', every: 12, at: 3, lat: [8, 45], r: 1.5 }],
  marseille: [kerb, tubs,
    { prop: 'tree:palm', every: 16, lat: 8.5, r: 2 }, { prop: 'house', every: 24, at: 8, lat: [20, 30], r: 7.5 }, { prop: 'house', every: 32, at: 3, lat: [44, 62], r: 7.5 },
    { prop: ['tree:cypress', 'tree:cypress', 'tree:pine', 'tree:olive', 'tree:oleander'], every: 5, lat: [12, 95], r: 3.5 }, { prop: 'rock', every: 12, at: 2, lat: [9.5, 70], r: 2 }, { prop: 'shrub', every: 12, at: 5, lat: [8.5, 40], r: 1.5 }],
};

/** How many copies the dressing put down in this build, by prop name (for tests). */
export const roadsideCount = () => perBuild('roadside:count', () => ({}));

/**
 * Dress circuit `track`'s roadside from its recipe, into `world`: a generator
 * for track.js, yielding between the grid's slices and the layers. The props
 * are instanced batches, made into meshes by the flush that follows.
 */
export function* dressRoadside(world, track, layout) {
  const recipe = RECIPES[track.id];
  if (!recipe || getPoly() !== 'high') return;
  const grid = yield* occupancy(world, layout), N = G.N, counts = roadsideCount();
  for (const [li, L] of recipe.entries()) {
    const [lo, hi] = Array.isArray(L.lat) ? L.lat : [L.lat, L.lat], onPavement = hi < PAVEMENT;
    for (let i = L.at || 0, k = 0; i < N; i += L.every, k++) for (const sg of L.one ? [k % 2 ? 1 : -1] : [1, -1]) for (let c = 0; c < (L.n || 1); c++) {
      const s = G.samples[i], lat = (s.hw + rand(lo, hi)) * sg, along = lo === hi ? 0 : rand(-L.every, L.every);
      const x = s.x + s.sx * lat + s.tx * along, z = s.z + s.sz * lat + s.tz * along;
      if (!(onPavement ? grid.clear(x, z, L.r) : grid.free(x, z, L.r))) continue;
      const name = Array.isArray(L.prop) ? pick(L.prop) : L.prop, y = onPavement ? s.y + lat * s.bank + 0.35 : yAt(x, z);
      const towards = Math.atan2(-s.sx * sg, -s.sz * sg), tangent = Math.atan2(-s.tz, s.tx);
      if (name.startsWith('tree:')) treeAt(null, x, z, name.slice(5), { world: true, y }); else PROPS[name](x, y, z, towards, tangent, track);
      grid.claim(x, z, L.r); counts[name] = (counts[name] || 0) + 1;
    }
    if (li % 2) yield;
  }
}
