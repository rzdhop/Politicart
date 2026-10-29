// The street life's plumbing (stage 7): what the instanced crowds, flocks,
// trees, boats and street furniture share.
//
// - perBuild(): one set of instanced batches (decor/instanced.js) per
//   circuit build, opened on first use, so every crowd figure, pigeon or
//   lamp of a build lands in the same few batches and draws once per part
//   and 200 m cell. A build is told apart by its G.animated list (every
//   caller of buildTrack starts one; prebuild.js swaps its own in), and
//   track.js also calls resetLife() at the head of its furniture.
// - place(): where a copy stands in world units. The batches here all take
//   world units, so the decor's scale-1 coordinates are moved to the
//   circuit's scale and set on the ground (yAt) when added, as spreadDecor
//   does for small pieces; `world: true` takes them as they are, with an
//   absolute `y` (pieces placed from G.samples).
// - moving(): whether the decor's own motion runs. Swaying trees, bobbing
//   instanced crowds, flocks and rolling boats are only ever seen, so the
//   game server (no DOM, DEC-014) skips their per-frame matrix updates;
//   tests switch it on with MOTION.on.
import { mat } from '../primitives.js';
import { G, getPoly } from '../state.js';
import { DS, yAt } from './context.js';
import { CELL, instanced } from './instanced.js';

let OWNER = null;
const CACHE = new Map();

/** The value `make()` returns, made once per circuit build under `name`. */
export function perBuild(name, make) {
  if (OWNER !== G.animated) { OWNER = G.animated; CACHE.clear(); }
  if (!CACHE.has(name)) CACHE.set(name, make());
  return CACHE.get(name);
}
/** The value made under `name` in this build, or undefined if none was. */
export const peekBuild = name => (OWNER === G.animated ? CACHE.get(name) : undefined);
/** Forget the batches of the build before (track.js, before the furniture). */
export function resetLife() { OWNER = null; CACHE.clear(); }

/**
 * An instanced batch in world units (decor/instanced.js), in 200 m cells on
 * "détaillés" and 800 m on "légers", where a draw costs more than the
 * triangles the coarser culling lets through.
 */
export const batch = (build, opts = {}) => instanced(opts.tint ? () => tinted(build()) : build, { world: true, cell: getPoly() === 'high' ? CELL : CELL * 4, ...opts });
/**
 * A tinted prop's parts on materials of their own (roughness + 0.001, so the
 * shared finishes they bake to are the tinted copies' alone): r128 picks an
 * instanced mesh's program by `instancing` only, so a finish drawn first by
 * an untinted batch would drop every later batch's per-copy colours.
 */
function tinted(prop) {
  prop.traverse(o => { const m = o.material; if (o.isMesh && m && m.isMeshStandardMaterial && !m.map) o.material = mat(m.color.getHex(), Math.round(m.roughness * 1000) / 1000 + 0.001); });
  return prop;
}

/** World position of a copy at (x, z): scale-1 decor coordinates set on the ground, or world units with an absolute y (`world`). */
export function place(x, z, { y = 0, world = false } = {}) {
  if (world) return { x, y, z };
  const wx = x * DS, wz = z * DS;
  return { x: wx, y: yAt(wx, wz) + y, z: wz };
}

/** Switch the decor's motion on headless (tests). */
export const MOTION = { on: false };
/** Whether the decor's own motion runs: in a browser always, headless only when a test asks. */
export const moving = () => MOTION.on || typeof document !== 'undefined';

/** The key a copy's world spot is filed under, to 5 cm, from the float32 an instance matrix holds (so a key made at add time finds its copies). */
export const spotKey = (x, z) => Math.round(Math.fround(x) * 20) + ',' + Math.round(Math.fround(z) * 20);
