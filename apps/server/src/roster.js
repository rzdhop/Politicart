// The cast as the admin edited it: names, titles, quotes, suit and kart
// colours, liveries, per-character kart default styles, and the campaign
// posters. One JSON document, stored on disk by the game server and served to
// every client, so all players see the same cast.
//
//   { chars: { <id>: { name?, title?, quote?, suit?, kart?, livery?, style? } },
//     ads: [dataURL, ...] }
//
// Validation is strict on purpose: an unknown or invalid field rejects the
// whole document with an error naming it, instead of being dropped quietly,
// so the admin sees why an edit did not take. Only images whose bytes match
// their declared type get in, and never SVG, since every client renders them.

import { randomBytes } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { CHARACTERS } from '../../game/src/engine/data.js';
import { cleanStyle } from '../../game/src/engine/kartstyle.js';

export const CHAR_IDS = CHARACTERS.map(c => c.id);
export const TEXT_MAX = { name: 28, title: 40, quote: 64 };   // the Workshop form's caps
export const LIVERY_MAX = 256 * 1024;                          // bytes of data URL
export const AD_MAX = 512 * 1024;
export const ADS_MAX = 8;

const FILE = 'roster.json';
const TMP_PREFIX = `.${FILE}.`;
const TMP_SUFFIX = '.tmp';
const COLOUR = /^#[0-9a-f]{6}$/i;
// C0, DEL, C1, and the bidi overrides that could make a name read backwards.
const STRIP = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩<>]/g;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]*={0,2})$/;
const MAGIC = {
  jpeg: b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: b => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  webp: b => b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};
const CHAR_FIELDS = ['name', 'title', 'quote', 'suit', 'kart', 'livery', 'style'];

export const emptyRoster = () => ({ chars: {}, ads: [] });

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
// null and '' both mean "the default": the field is left out.
const isUnset = v => v === undefined || v === null || v === '';
// Read only own keys, so nothing is ever picked up from a prototype.
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);

class Invalid extends Error {
  constructor(field, message) { super(`${field} : ${message}`); this.field = field; }
}

function text(v, field, max) {
  if (typeof v !== 'string') throw new Invalid(field, 'texte attendu.');
  const s = v.replace(STRIP, '').trim();
  if (s.length > max) throw new Invalid(field, `${max} caractères au plus.`);
  return s;
}

function colour(v, field) {
  if (typeof v !== 'string' || !COLOUR.test(v)) throw new Invalid(field, 'couleur #rrggbb attendue.');
  return v.toLowerCase();
}

/** A JPEG, PNG or WebP data URL whose first bytes really are that format. */
function image(v, field, maxBytes) {
  if (typeof v !== 'string') throw new Invalid(field, 'image attendue.');
  if (v.length > maxBytes) throw new Invalid(field, `image trop lourde (${Math.floor(maxBytes / 1024)} Ko au plus).`);
  const m = DATA_URL.exec(v);
  if (!m || m[2].length % 4 !== 0 || m[2].length === 0) throw new Invalid(field, 'image JPEG, PNG ou WebP en base64 attendue.');
  // 16 base64 characters decode to 12 bytes: enough for every magic number.
  if (!MAGIC[m[1]](Buffer.from(m[2].slice(0, 16), 'base64'))) throw new Invalid(field, `le contenu n’est pas une image ${m[1].toUpperCase()}.`);
  return v;
}

function style(v, field) {
  if (!isPlain(v)) throw new Invalid(field, 'objet attendu.');
  const clean = cleanStyle(v);
  // cleanStyle drops what it does not know; here a dropped key is an error.
  for (const key of Object.keys(v)) if (!Object.hasOwn(clean, key)) throw new Invalid(`${field}.${key}`, 'valeur invalide ou champ inconnu.');
  return clean;
}

function character(v, id) {
  const at = `chars.${id}`;
  if (!isPlain(v)) throw new Invalid(at, 'objet attendu.');
  for (const key of Object.keys(v)) if (!CHAR_FIELDS.includes(key)) throw new Invalid(`${at}.${key}`, 'champ inconnu.');
  const out = {};
  for (const key of ['name', 'title', 'quote']) {
    if (isUnset(own(v, key))) continue;
    const s = text(own(v, key), `${at}.${key}`, TEXT_MAX[key]);
    if (s) out[key] = s;
  }
  for (const key of ['suit', 'kart']) if (!isUnset(own(v, key))) out[key] = colour(own(v, key), `${at}.${key}`);
  if (!isUnset(own(v, 'livery'))) out.livery = image(own(v, 'livery'), `${at}.livery`, LIVERY_MAX);
  if (!isUnset(own(v, 'style'))) {
    const s = style(own(v, 'style'), `${at}.style`);
    if (Object.keys(s).length) out.style = s;
  }
  return out;
}

/**
 * Check an untrusted roster. Returns `{ ok: true, roster }` with only own,
 * known keys (built fresh, so nothing from the input's prototype chain gets
 * through), or `{ ok: false, field, error }` naming the first bad field.
 */
export function validateRoster(input) {
  try {
    if (!isPlain(input)) throw new Invalid('roster', 'objet attendu.');
    for (const key of Object.keys(input)) if (key !== 'chars' && key !== 'ads') throw new Invalid(key, 'champ inconnu.');
    const roster = emptyRoster();
    const chars = own(input, 'chars'), ads = own(input, 'ads');
    if (!isUnset(chars)) {
      if (!isPlain(chars)) throw new Invalid('chars', 'objet attendu.');
      for (const id of Object.keys(chars)) {
        if (!CHAR_IDS.includes(id)) throw new Invalid(`chars.${id}`, 'candidat inconnu.');
        const c = character(chars[id], id);
        if (Object.keys(c).length) roster.chars[id] = c;
      }
    }
    if (!isUnset(ads)) {
      if (!Array.isArray(ads)) throw new Invalid('ads', 'liste attendue.');
      if (ads.length > ADS_MAX) throw new Invalid('ads', `${ADS_MAX} affiches au plus.`);
      roster.ads = ads.map((a, i) => image(a, `ads.${i}`, AD_MAX));
    }
    return { ok: true, roster };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, field: e.field, error: e.message };
    throw e;
  }
}

function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
}

/**
 * Lay the roster's names, titles and quotes over the server's own CHARACTERS
 * (AI karts in lobbies and results are named from it), falling back to
 * `base` for anything the roster leaves out. Colours and images only matter
 * to clients, which read the roster themselves.
 */
export function applyRoster(roster, characters, base) {
  characters.forEach((c, i) => {
    const edit = (roster?.chars && Object.hasOwn(roster.chars, c.id)) ? roster.chars[c.id] : {};
    for (const key of ['name', 'title', 'quote']) c[key] = edit[key] ?? base[i][key];
  });
}

/**
 * The roster on disk at `<dir>/roster.json`. Without a dir it lives in memory
 * only (tests, and servers started without storage).
 *
 *   load()       read the file; a corrupt or invalid one is moved aside to
 *                roster.json.corrupt-<now()> and the store starts empty, so a
 *                bad file never keeps the server from booting.
 *   get()        the current roster, frozen; json() the same, serialised once.
 *   save(input)  validate, then write a temp file in the same dir and rename
 *                it over the old one, so a crash leaves the old or the new
 *                file and never half of one. Saves run one at a time.
 *                Resolves to validateRoster's result; rejects on an I/O error,
 *                leaving the previous roster in place.
 */
export function createRosterStore({ dir = null, now = Date.now, log = console } = {}) {
  let current = deepFreeze(emptyRoster());
  let json = JSON.stringify(current);
  let queue = Promise.resolve();
  const file = dir ? join(dir, FILE) : null;

  const set = roster => { current = deepFreeze(roster); json = JSON.stringify(current); };

  async function load() {
    if (!dir) return current;
    await mkdir(dir, { recursive: true });
    // Temp files only outlive a crash mid-save; this process has none in flight yet.
    for (const name of await readdir(dir)) {
      if (name.startsWith(TMP_PREFIX) && name.endsWith(TMP_SUFFIX)) await unlink(join(dir, name)).catch(() => {});
    }
    let raw;
    try { raw = await readFile(file, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return current; throw e; }
    let result;
    try { result = validateRoster(JSON.parse(raw)); }
    catch { result = { ok: false, error: 'JSON invalide.' }; }
    if (result.ok) { set(result.roster); return current; }
    const aside = `${file}.corrupt-${now()}`;
    try { await rename(file, aside); log.warn(`roster: fichier invalide (${result.error}), mis de côté dans ${aside}`); }
    catch (e) { log.warn(`roster: fichier invalide (${result.error}), impossible de le déplacer : ${e.message}`); }
    return current;
  }

  async function write(roster) {
    const data = JSON.stringify(roster);
    const tmp = join(dir, `${TMP_PREFIX}${randomBytes(6).toString('hex')}${TMP_SUFFIX}`);
    try {
      const fh = await open(tmp, 'wx', 0o600);
      try { await fh.writeFile(data, 'utf8'); await fh.sync(); } finally { await fh.close(); }
      await rename(tmp, file);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      throw e;
    }
  }

  function save(input) {
    const result = validateRoster(input);
    if (!result.ok) return Promise.resolve(result);
    const run = async () => {
      if (dir) { await mkdir(dir, { recursive: true }); await write(result.roster); }
      set(result.roster);
      return { ok: true, roster: current };
    };
    const p = queue.then(run);
    queue = p.catch(() => {});      // one failed save does not block the next
    return p;
  }

  return { load, save, get: () => current, json: () => json, file };
}
