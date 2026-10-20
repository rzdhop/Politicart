// The cast in force: names, colours, liveries, per-character kart defaults
// and campaign posters, as the admin set them on the game server.
//
// The roster comes from the game server (GET /api/roster) and is the same for
// every player. The static build (GitHub Pages) has no server and plays the
// default cast. Nothing is kept in this browser any more: the old per-browser
// edits under localStorage['kr-custom'] are deleted once at load, so they can
// never resurface (A-018).
//
// Two copies, on purpose:
//   - the roster in force, which applyCustom lays over the shared CHARACTERS
//     in place (so the rest of the game needs no knowledge of this module) and
//     which the circuits read their posters from;
//   - the Workshop's draft, which the admin form mutates. It only reaches the
//     game once the server has accepted it and sent it back (setRoster), so a
//     rejected or abandoned edit never shows in a race.
import { BASE, CHARACTERS } from './data.js';
import { cleanStyle } from './kartstyle.js';
import { G } from './state.js';

const LEGACY_KEY = 'kr-custom';
const ADS_MAX = 8;
const COLOUR = /^#[0-9a-f]{6}$/i;

const empty = () => ({ chars: {}, ads: [] });
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isImage = v => typeof v === 'string' && v.startsWith('data:image/');

/**
 * Keep only what the game can render from an untrusted roster: known
 * character ids, string texts, `#rrggbb` colours, image data URLs and a
 * cleaned style. The server validates strictly; this only makes sure a
 * malformed answer degrades to the default cast instead of breaking a race.
 */
export function normaliseRoster(input) {
  const out = empty();
  if (!isPlain(input)) return out;
  const chars = isPlain(input.chars) ? input.chars : {};
  for (const c of CHARACTERS) {
    const o = Object.hasOwn(chars, c.id) && isPlain(chars[c.id]) ? chars[c.id] : null;
    if (!o) continue;
    const e = {};
    for (const k of ['name', 'title', 'quote']) if (typeof o[k] === 'string' && o[k].trim()) e[k] = o[k];
    for (const k of ['suit', 'kart']) if (typeof o[k] === 'string' && COLOUR.test(o[k])) e[k] = o[k].toLowerCase();
    if (isImage(o.livery)) e.livery = o.livery;
    const style = cleanStyle(o.style);
    if (Object.keys(style).length) e.style = style;
    if (Object.keys(e).length) out.chars[c.id] = e;
  }
  if (Array.isArray(input.ads)) out.ads = input.ads.filter(isImage).slice(0, ADS_MAX);
  return out;
}

const clone = roster => normaliseRoster(JSON.parse(JSON.stringify(roster)));

/** The roster in force. Treat as read-only; setRoster replaces it. */
let CUSTOM = empty();
/** The Workshop's working copy, which the admin form edits in place. */
let DRAFT = empty();

/** The roster in force: what every race and screen shows. */
export const getCustom = () => CUSTOM;

/** The Workshop's draft. Mutating it is how the admin form edits. */
export const getDraft = () => DRAFT;

/** Start editing from the roster in force, dropping any abandoned draft. */
export function beginDraft() { DRAFT = clone(CUSTOM); return DRAFT; }

/** Empty the draft: the form shows the default cast until it is saved. */
export function clearDraft() { DRAFT = empty(); return DRAFT; }

/** Put a roster in force (the server's answer) and apply it to the cast. */
export function setRoster(roster) {
  CUSTOM = normaliseRoster(roster);
  applyCustom();
}

/**
 * At load: the default cast, until the server's roster arrives. Deletes the
 * old per-browser edits, which are no longer read.
 */
export function loadCustom() {
  try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* storage unavailable: nothing to forget */ }
  CUSTOM = empty();
  DRAFT = empty();
  applyCustom();
}

/** Lay the roster in force over the shared CHARACTERS, falling back to BASE. */
export function applyCustom() {
  CHARACTERS.forEach((c, i) => {
    const b = BASE[i], o = CUSTOM.chars[c.id] || {};
    c.name = (o.name || '').trim() || b.name;
    c.title = (o.title || '').trim() || b.title;
    c.quote = (o.quote || '').trim() || b.quote;
    c.look.suit = o.suit ? parseInt(o.suit.slice(1), 16) : b.suit;
    c.kart = o.kart ? parseInt(o.kart.slice(1), 16) : b.kart;
    c.livery = o.livery || null;
    c.style = o.style || undefined;
  });
  G.thumbPoly = null;
}
