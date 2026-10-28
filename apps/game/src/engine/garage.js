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
//
// The edits are stored as typed, owned or not (the Garage's locks are the
// UI's business), but the kart is drawn and raced through what the account
// owns (DEC-035): setOwned() says what that is, and myStyle() drops any
// edited part or trail it does not own, so a stale `politikart-kart` from the static
// build never shows an unowned part on a server. `null` means no economy
// (the static build, and the game server's own headless races): everything
// renders.
import { cleanOwned, ownedStyle } from './catalog.js';
import { cleanStyle, playerStyle } from './kartstyle.js';

const KEY = 'politikart-kart';
const LEGACY_KEY = 'kr-kart';   // the key from before the game was renamed, moved under KEY on first load

let EDITS = {};

/** The player's edits, already cleaned. Treat as read-only; use setGarage. */
export const getGarage = () => EDITS;

/** Read the edits from storage, dropping anything invalid. */
export function loadGarage() {
  try {
    let j = localStorage.getItem(KEY);
    if (j === null) {
      j = localStorage.getItem(LEGACY_KEY);
      if (j !== null) { localStorage.setItem(KEY, j); localStorage.removeItem(LEGACY_KEY); }
    }
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

let OWNED = null;

/**
 * What the player owns ({chars, parts, trails}, catalog.js), or null when
 * there is no economy. The store calls it on every profile, sign-out and
 * server probe.
 */
export function setOwned(owned) { OWNED = owned === null || owned === undefined ? null : cleanOwned(owned); }

/** What setOwned() last said, cleaned; null without an economy. */
export const getOwned = () => OWNED;

/** The full style the player's kart renders with when driving `char`: the owned edits over the character default. */
export const myStyle = char => playerStyle(char, ownedStyle(EDITS, OWNED));
