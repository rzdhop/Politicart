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

let TRY = null;

/**
 * The Boutique's fitting room (DEC-073): one part or trail (`key`, `value`
 * as setGarage takes them) worn on the podium while the shop shows it,
 * owned or not. Nothing is stored, and the store takes it off whenever the
 * shop is left, so a race never sees it. An invalid value is ignored.
 * Returns whether it is worn.
 */
export function setTryOn(key, value) {
  const clean = cleanStyle({ [key]: value });
  TRY = Object.hasOwn(clean, key) ? clean : null;
  return TRY !== null;
}
/** Take the fitting room's part off. */
export function clearTryOn() { TRY = null; }
/** What the fitting room wears ({key: value}), or null. */
export const getTryOn = () => TRY;

/** The full style the player's kart renders with when driving `char`: the owned edits over the character default, and the fitting room's part over both. */
export const myStyle = char => playerStyle(char, TRY ? { ...ownedStyle(EDITS, OWNED), ...TRY } : ownedStyle(EDITS, OWNED));

const SEEN_KEY = 'politikart-garage-seen';
/**
 * How many parts and trails the player owned the last time they opened the
 * Garage (DEC-072), so the title's Garage card can say "N nouveautés" when a
 * purchase or a Politibox drop added some since. Kept in this browser.
 */
export function garageSeen() {
  try { const n = Number(localStorage.getItem(SEEN_KEY)); return Number.isFinite(n) && n >= 0 ? n : 0; } catch (e) { return 0; }
}
/** Remember that the Garage was opened while `n` parts and trails were owned. */
export function markGarageSeen(n) {
  try { localStorage.setItem(SEEN_KEY, String(Math.max(0, Math.floor(n) || 0))); } catch (e) { /* storage unavailable: the badge just shows again */ }
}
