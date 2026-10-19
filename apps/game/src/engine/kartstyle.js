// A kart's look: colours, wheels, spoiler, side pods, race number, sticker.
//
// Pure and DOM-free, because the server imports it to validate what players
// send (DEC-014). A style comes in two shapes:
//
//   - a full style, every field set, which is what the kart mesh renders;
//   - a partial style, only the fields someone changed. The admin's
//     per-character defaults (`char.style`) and a player's Garage edits are
//     both partial, and anything left out falls back a level: player ->
//     character default -> the built-in look derived from the character.
//
// Every partial that crosses a trust boundary (storage, the network, the
// admin API) goes through cleanStyle first, which keeps only known keys with
// valid values.
import { hex } from './util.js';

export const WHEELS = ['classic', 'chrome', 'offroad', 'gold'];
export const SPOILERS = ['none', 'standard', 'wing'];
export const STICKERS = ['none', 'tricolore', 'rosette', 'etoile', 'marianne'];

/** The bumpers and spoiler struts of the original kart. */
export const DEFAULT_ACCENT = '#333333';

const HEX = /^#[0-9a-f]{6}$/;

const isColour = v => typeof v === 'string' && HEX.test(v.toLowerCase());
const oneOf = list => v => typeof v === 'string' && list.includes(v);
const isNumber = v => v === null || (Number.isInteger(v) && v >= 0 && v <= 99);

/** One validator per field; the keys of this table are the whole vocabulary. */
const FIELDS = {
  body: isColour,
  accent: isColour,
  wheels: oneOf(WHEELS),
  spoiler: oneOf(SPOILERS),
  pods: v => typeof v === 'boolean',
  number: isNumber,
  sticker: oneOf(STICKERS),
};

/**
 * Keep the valid, known fields of an untrusted partial style and drop the
 * rest. Never throws: anything that is not a plain object cleans to {}.
 */
export function cleanStyle(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const key of Object.keys(FIELDS)) {
    if (!Object.hasOwn(input, key)) continue;
    const v = input[key];
    if (FIELDS[key](v)) out[key] = FIELDS[key] === isColour ? v.toLowerCase() : v;
  }
  return out;
}

/** Lay partial styles over a base, later ones winning, field by field. */
export function mergeStyle(base, ...partials) {
  const out = { ...base };
  for (const p of partials) Object.assign(out, cleanStyle(p));
  return out;
}

/** The look a character's kart had before styles existed. */
export function builtinStyle(char) {
  return { body: hex(char.kart), accent: DEFAULT_ACCENT, wheels: 'classic', spoiler: 'standard', pods: true, number: null, sticker: 'none' };
}

/** A character's full default style: the built-in look, then the admin's defaults. */
export function defaultStyle(char) {
  return mergeStyle(builtinStyle(char), char.style);
}

/** The full style a player's kart renders with: their edits over the character default. */
export function playerStyle(char, edits) {
  return mergeStyle(defaultStyle(char), edits);
}
