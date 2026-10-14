// The player's own cast: names, colours, liveries and campaign posters.
//
// The one persistence boundary in the game. Everything is kept under a single
// localStorage key, and every read and write is wrapped: a browser with
// storage disabled or full must still be able to play, so a failure here
// degrades to "customisations are not kept" rather than breaking the game.
//
// applyCustom merges the customisations into the shared CHARACTERS objects in
// place, so the rest of the game needs no knowledge of this module.
import { BASE, CHARACTERS } from './data.js';
import { G } from './state.js';

/**
 * What the player has changed in the workshop.
 *
 * Module-private because it is replaced wholesale -- by loadCustom when
 * reading storage, and by resetCustom when the player clears everything -- and
 * an imported binding cannot be reassigned by the importer. Readers mutate the
 * object they are handed, which is how the admin form edits it in place.
 */
let CUSTOM = { chars: {}, ads: [] };

/** The live customisation object. Mutating it is how the workshop edits. */
export const getCustom = () => CUSTOM;

/** Forget every customisation, in memory and in storage. */
export function resetCustom() {
  CUSTOM = { chars: {}, ads: [] };
  try {
    localStorage.removeItem('kr-custom');
  } catch (e) {
    /* storage unavailable: in-memory reset is enough */
  }
  applyCustom();
}
export function loadCustom() { try { const j = localStorage.getItem('kr-custom'); if (j) { const o = JSON.parse(j); if (o && o.chars) CUSTOM = { chars: o.chars || {}, ads: o.ads || [] }; } } catch (e) { /* storage unavailable: defaults */ } applyCustom(); }
export function saveCustom() { try { localStorage.setItem('kr-custom', JSON.stringify(CUSTOM)); return true; } catch (e) { return false; } }
export function applyCustom() {
  CHARACTERS.forEach((c, i) => { const b = BASE[i], o = CUSTOM.chars[c.id] || {};
    c.name = (o.name || '').trim() || b.name; c.title = (o.title || '').trim() || b.title; c.quote = (o.quote || '').trim() || b.quote;
    c.look.suit = o.suit ? parseInt(o.suit.slice(1), 16) : b.suit; c.kart = o.kart ? parseInt(o.kart.slice(1), 16) : b.kart; c.livery = o.livery || null; });
  G.thumbPoly = null;
}
