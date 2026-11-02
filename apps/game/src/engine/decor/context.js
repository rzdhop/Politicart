// The decor builders' shared context (stage 0 split of track.js).
//
// Things every builder reads or writes, kept here so the circuits'
// builders (engine/decor/<id>.js), the shared street props (street.js) and
// the track itself (track.js) can live in separate modules without a cycle:
//
// - still(): marks decor that never moves inside itself for the "légers"
//   fold (DEC-047); STILL is the list track.js folds and clears.
// - DS: the scale of the circuit being built; the themed decor is written in
//   scale-1 coordinates, so its clearance checks against the road multiply
//   by it (track.js sets it through setDecorScale).
// - nOf(): figure counts drop by half on 'low' detail (phones), big pieces stay.
// - yAt(): the ground's height under a world point (DEC-050): the road's own
//   height on the road and its pavement, a blend down the embankment beside
//   it, and the terrain further out -- the road's height spread over the
//   ground around it (setTerrain builds that from the samples; track.js
//   shapes the ground mesh with the same function, so decor placed through
//   yAt sits on what is drawn).
import { G, getPoly, isClear } from '../state.js';

/** Decor marked still, in build order; track.js folds and empties it in place. */
export const STILL = [];
/** Mark decor that never moves inside itself (a group, or a mesh standing alone) for the "légers" fold; returns it. */
export const still = o => { STILL.push(o); return o; };

/** Scale of the circuit being built (a live binding: importers read the current value). */
export let DS = 1;
/**
 * The circuit scale the builders' world-unit layouts were drawn for: the
 * Élysée's palace, the Seine's quais, Versailles' bassins and the rest were
 * placed in metres around a road drawn at scale 3. Since the races became one
 * long lap (DEC-061) the circuits are drawn at 4.5; `K` (DS / LAYOUT_SCALE) is
 * the factor those world positions, and the lengths of what runs along the
 * road (rivers, quais, sea sheets), grow by so the landmarks keep framing the
 * road. Buildings, props and people keep their size.
 */
export const LAYOUT_SCALE = 3;
/** DS / LAYOUT_SCALE, a live binding like DS: 1 on a circuit drawn at scale 3, 1.5 at 4.5. */
export let K = 1;
export function setDecorScale(s) { DS = s; K = s / LAYOUT_SCALE; }
/**
 * A world coordinate `v` of such a layout that belongs with a point of the
 * road `d` metres away along that axis (v - d is the road's coordinate at
 * scale 3): moved out with that road point by K, still d metres from it. For
 * what must stay by the road (a square at its kerb, a hill just past it)
 * where `v * K` would leave it further off.
 */
export const follow = (v, d) => v * K - d * (K - 1);
/** Whether (x, z), in scale-1 coordinates, is at least `margin` metres (scale-1) clear of the road. */
export const clearAt = (x, z, margin) => isClear(x * DS, z * DS, margin * DS);

/** Figure counts drop by half on 'low' detail (phones), big pieces stay. */
export const nOf = n => (getPoly() === 'high' ? n : Math.ceil(n / 2));

// ---------- The ground's height (DEC-050) ----------
/** The pavement's reach beyond the road's edge, and the embankment's width beyond that, in metres. */
export const PAVEMENT = 6, EMBANK = 34;
/**
 * The ground plain (track.js groundMesh): GROUND_SIZE metres square in
 * GROUND_CELLS cells a side on "détaillés", its heights following the terrain
 * within TERRAIN_REACH of the origin (every circuit's loop and the terrain's
 * RADIUS around it fit inside), flat beyond. elysee-props.js groundY reads
 * the same lattice.
 */
export const GROUND_SIZE = 4000, GROUND_CELLS = 128, TERRAIN_REACH = 1200;
/** How far the road's height reaches into the terrain around it, and where it starts fading to the flat plain. */
const RADIUS = 220, FADE = 150;
let coarse = [], flat = true;

/** Take the circuit's samples for the terrain: every fourth one is enough for the blend. Call after G.samples is set. */
export function setTerrain(samples) {
  coarse = []; flat = true;
  for (let i = 0; i < samples.length; i += 4) { const s = samples[i]; coarse.push({ x: s.x, z: s.z, y: s.y || 0 }); if (Math.abs(s.y || 0) > 1e-6) flat = false; }
}

/** Whether the circuit being built is flat throughout: its ground is then one plane. */
export const terrainFlat = () => flat;

/**
 * The terrain's height at (x, z): the road's heights within RADIUS blended by
 * inverse squared distance, fading to the flat plain past FADE. On a flat
 * circuit it is 0 everywhere, at no cost.
 */
export function terrainY(x, z) {
  if (flat) return 0;
  let sw = 0, sy = 0, dmin = Infinity;
  for (const s of coarse) { const d2 = (s.x - x) ** 2 + (s.z - z) ** 2; if (d2 > RADIUS * RADIUS) continue; const w = 1 / (d2 + 400); sw += w; sy += w * s.y; if (d2 < dmin) dmin = d2; }
  if (!sw) return 0;
  const d = Math.sqrt(dmin);
  return (sy / sw) * (d > FADE ? Math.max(0, (RADIUS - d) / (RADIUS - FADE)) : 1);
}

/**
 * The ground's height under world point (x, z): the nearest sample's height on
 * the road and its pavement, a blend down to the terrain across the
 * embankment, the terrain beyond. 0 everywhere before a circuit is built or
 * on a flat one.
 */
export function yAt(x, z) {
  if (flat) return 0;
  let best = null, bd = Infinity;
  for (let i = 0; i < G.N; i += 2) { const s = G.samples[i]; const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = s; } }
  if (!best) return 0;
  const d = Math.sqrt(bd), edge = (best.hw ?? G.hw) + PAVEMENT, y = best.y || 0;
  if (d <= edge) return y;
  const t = terrainY(x, z);
  if (d >= edge + EMBANK) return t;
  return y + (t - y) * (d - edge) / EMBANK;
}
