// The gate to the Politibox opening: lootbox.js is a chunk of its own,
// loaded the first time a box is opened (DEC-055, vite.config.js
// engine-box). The store and game.js call the opening through this module.
// An opening asked for before the chunk is here plays as soon as it lands,
// unless the player left meanwhile (stopOpening); until then the canvas is
// cleared each frame, as any menu's is.
//
// Headless-safe: nothing here touches the DOM at import.
import { clearCanvas } from './render.js';

/** The grade colours, as the library's `--grade-<g>` tokens. */
export const GRADE_COLOUR = Object.freeze({ common: 0xb9b3d8, rare: 0x4fa3ff, mythic: 0xb14cff, incredible: 0xffb400 });

/**
 * The grade a drop shows in: the catalogue's for an item, and for coins one
 * by the amount (a big win deserves a colour too).
 */
export function dropGrade(drop) {
  if (!drop) return 'common';
  if (drop.kind !== 'coins') return GRADE_COLOUR[drop.grade] === undefined ? 'common' : drop.grade;
  return drop.amount >= 500 ? 'mythic' : drop.amount >= 50 ? 'rare' : 'common';
}

let mod = null, loading = null;
/** The opening asked for while the chunk loads: `{ drops, opts }`, or null once played or stopped. */
let pending = null;

/** Start loading the Politibox chunk (once); resolves to lootbox.js's exports. */
export function loadBox() {
  if (!loading) {
    loading = import('./lootbox.js').then(m => {
      mod = m;
      if (pending) { const { drops, opts } = pending; pending = null; m.playOpening(drops, opts); }
      return m;
    });
  }
  return loading;
}
/** Whether lootbox.js is loaded. */
export const boxLoaded = () => !!mod;

/**
 * Play the opening of `drops` (one drop, or a bundle's list; lootbox.js
 * playOpening, with its `{ onPhase(name, index), cut }` options passed
 * through); deferred until the chunk is here.
 */
export function playOpening(drops, opts = {}) {
  if (mod) { mod.playOpening(drops, opts); return; }
  pending = { drops, opts };
  loadBox();
}
/** Hurry the opening along (lootbox.js skipOpening); nothing to hurry before it plays. */
export function skipOpening() { if (mod) mod.skipOpening(); }
/** Stop the opening (lootbox.js stopOpening), or forget the one still waiting for the chunk. */
export function stopOpening() { pending = null; if (mod) mod.stopOpening(); }
/** Draw the opening for this frame (lootbox.js renderLootbox); the plain background until the chunk is here. */
export function renderLootbox(dt) { if (mod) mod.renderLootbox(dt); else clearCanvas(); }
