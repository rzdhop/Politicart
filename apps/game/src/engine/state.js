// The game's shared mutable state.
//
// This module exists so that the engine modules can read the same `G` and the
// same tunables without importing each other -- which is what would otherwise
// make this split circular, since `game.js` imports them all.
//
// `G` is a single mutable object, carried over from the original file. It
// mixes engine state (karts, samples, hazards) with selection state (charIdx,
// trackIdx, thumbs) that the menus write. `G.state` is not a field any more:
// it is a read-only view of engine/machine.js, so there is one record of
// where the game is and assigning to it throws (see stage 11, DEC-011).

import { getState } from './machine.js';

// samples grew from 600 to 900 and then 1800 with the circuits (scale 1.5, then 3), keeping
// the spacing between them. roadHalfWidth is the default half-width: each circuit carries
// its own (DEC-050), which buildTrack puts in G.hw and in every sample's `hw` (a `narrow`
// feature pinches it), and that is what the engine reads. A bike lane runs along the road's
// right-hand edge (lateral offsets, right is +): bikeLane is its offsets at the default
// width, bikeLaneOf(hw) the same lane on a road of half-width hw.
export const CFG = { roadHalfWidth: 15, samples: 1800, laps: 3, numAI: 5, powerCooldown: 24, bikeLane: { inner: 10.3, outer: 13.9 } };
/** The bike lane's lateral offsets on a road of half-width `hw`: 4.7 m to 1.1 m in from the right-hand kerb. */
export const bikeLaneOf = hw => ({ inner: hw - 4.7, outer: hw - 1.1 });

/**
 * Graphics detail. 'high' adds segments and shadows, 'low' lightens both.
 *
 * Exported through functions rather than as a binding: an imported `let` is
 * read-only for the importer, and the title screen's toggle has to change it.
 */
let poly = 'high';
export const getPoly = () => poly;
export const seg = () => (poly === 'high' ? 28 : 10);
export const SHADOWS = () => poly === 'high';

/** Flip the detail level and return what it became. */
export function togglePoly() {
  poly = poly === 'low' ? 'high' : 'low';
  return poly;
}

export const G = {
  scene: null, track: null, karts: [], player: null, samples: [], N: 0, trackLength: 0,
  hazards: [], projectiles: [], itemBoxes: [], animated: [], crowd: [], ramps: [], pits: [], pads: [], crossings: [], time: 0, countdown: 0, charIdx: 0, trackIdx: 0,
  resultsAt: Infinity, wrongTimer: 0, laps: CFG.laps, previewKart: null, previewScene: null, sun: null, thumbs: {}, thumbPoly: null,
  // the race's seed and what it drew (DEC-049): the layout (engine/layout.js), the race's own
  // random stream, and the circuit's half-width (DEC-050); entitySeq numbers hazards and
  // projectiles so snapshots can name them, static obstacles first (reset before buildTrack)
  seed: 0, layout: null, rng: null, hw: CFG.roadHalfWidth, entitySeq: 0,
};
Object.defineProperty(G, 'state', { enumerable: true, get: getState });
/** The next entity id: hazards and projectiles carry one so a snapshot can name them (DEC-014); static obstacles take theirs at build. */
export const nextEntityId = () => (G.entitySeq = (G.entitySeq || 0) + 1);
/** Whether (x, z) is at least `margin` metres clear of the road's edge, at the road's width where it passes. */
export function isClear(x, z, margin) {
  for (let i = 0; i < G.N; i += 2) { const s = G.samples[i]; const lim = (s.hw ?? G.hw) + margin; if ((s.x - x) ** 2 + (s.z - z) ** 2 < lim * lim) return false; }
  return true;
}
/** The road's height under (x, z): the nearest sample's y (0 before a circuit is built). A full search; for spawns, not for every frame. */
export function roadYAt(x, z) {
  let best = null, bd = Infinity;
  for (let i = 0; i < G.N; i++) { const s = G.samples[i]; const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = s; } }
  return best ? best.y || 0 : 0;
}
