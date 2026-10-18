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

// samples grew from 600 to 900 with the circuits (scale 1.5), keeping the spacing between them.
export const CFG = { roadHalfWidth: 9, samples: 900, laps: 3, numAI: 5, powerCooldown: 24 };

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
  resultsAt: Infinity, wrongTimer: 0, previewKart: null, previewScene: null, sun: null, thumbs: {}, thumbPoly: null,
};
Object.defineProperty(G, 'state', { enumerable: true, get: getState });
export function isClear(x, z, margin) {
  const lim = (CFG.roadHalfWidth + margin) ** 2;
  for (let i = 0; i < G.N; i += 2) { const s = G.samples[i]; if ((s.x - x) ** 2 + (s.z - z) ** 2 < lim) return false; }
  return true;
}
