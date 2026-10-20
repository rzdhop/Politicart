// The player's own kart: the Garage's edits, kept in this browser.
//
// A partial kart style (kartstyle.js): only the fields the player changed.
// Whatever they left alone falls back to the chosen character's default, so
// one set of edits applies to whichever candidate they pick.
//
// Stored under its own localStorage key, wrapped like custom.js: a browser
// with storage disabled or full still plays, it just forgets the edits. The
// game server imports this module through race.js, where there is no
// localStorage at all, so every access is guarded.
import { cleanStyle, playerStyle } from './kartstyle.js';

const KEY = 'kr-kart';

let EDITS = {};

/** The player's edits, already cleaned. Treat as read-only; use setGarage. */
export const getGarage = () => EDITS;

/** Read the edits from storage, dropping anything invalid. */
export function loadGarage() {
  try {
    const j = localStorage.getItem(KEY);
    EDITS = j ? cleanStyle(JSON.parse(j)) : {};
  } catch (e) {
    EDITS = {};       /* storage unavailable or corrupt: no edits */
  }
  return EDITS;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(EDITS)); return true; } catch (e) { return false; }
}

/**
 * Change one field and persist. An invalid value is ignored, so the edits can
 * never hold something the kart cannot render. Returns whether it was kept.
 */
export function setGarage(key, value) {
  const clean = cleanStyle({ [key]: value });
  if (!Object.hasOwn(clean, key)) return false;
  EDITS = { ...EDITS, ...clean };
  save();
  return true;
}

/** Forget every edit: the kart goes back to the character's default. */
export function resetGarage() {
  EDITS = {};
  try { localStorage.removeItem(KEY); } catch (e) { /* in-memory reset is enough */ }
}

/** The full style the player's kart renders with when driving `char`. */
export const myStyle = char => playerStyle(char, EDITS);
