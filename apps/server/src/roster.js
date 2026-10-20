// The cast as the admin edited it: names, titles, quotes, suit and kart
// colours, liveries, per-character kart default styles, and the campaign
// posters. One JSON document, kept in the account store (store.js, the
// 'roster' document) and served to every client, so all players see the same
// cast.
//
//   { chars: { <id>: { name?, title?, quote?, suit?, kart?, livery?, style? } },
//     ads: [dataURL, ...] }
//
//   GET /api/roster        -> the roster, {chars: {}, ads: []} when nothing
//                             was saved. Public, open to every origin, never
//                             cached (an edit shows on the next load).
//   PUT /api/admin/roster  (Authorization: Bearer, the admin's session;
//                           Content-Type: application/json; at most 10 MB)
//                          -> 200 the roster as stored (cleaned)
//                             401 not the admin (no token, an expired one, or
//                                 any other account: one answer for all, so
//                                 the route says nothing about who is admin)
//                             415 not JSON, 413 too large, 400 unreadable
//                             400 {error, field} the first invalid field
//
// Validation is strict on purpose: an unknown or invalid field rejects the
// whole document with an error naming it, instead of being dropped quietly,
// so the admin sees why an edit did not take. Only images whose bytes match
// their declared type get in, and never SVG, since every client renders them.

import { BASE, CHARACTERS } from '../../game/src/engine/data.js';
import { cleanStyle } from '../../game/src/engine/kartstyle.js';
import { isJson, readJsonBody } from './body.js';

export const CHAR_IDS = CHARACTERS.map(c => c.id);
export const TEXT_MAX = { name: 28, title: 40, quote: 64 };   // the Workshop form's caps
export const LIVERY_MAX = 256 * 1024;                          // bytes of data URL
export const AD_MAX = 512 * 1024;
export const ADS_MAX = 8;
/** The largest PUT body: every livery and poster at its cap, with room for the JSON around them. */
export const BODY_MAX = 10 * 1024 * 1024;   // every image at its cap (8 MB) plus the JSON around it, with room to spare
/** The store document the roster lives in. */
export const DOC = 'roster';

const COLOUR = /^#[0-9a-f]{6}$/i;
// C0, DEL, C1, and the bidi controls (embeddings, overrides, isolates, marks)
// that could make a name read backwards.
const STRIP = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩<>]/g;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]*={0,2})$/;
const MAGIC = {
  jpeg: b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: b => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  webp: b => b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};
const CHAR_FIELDS = ['name', 'title', 'quote', 'suit', 'kart', 'livery', 'style'];
const CAST_FIELDS = ['name', 'title', 'quote'];

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
  for (const key of CAST_FIELDS) {
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

/**
 * Lay the roster's names, titles and quotes over `characters` (AI karts in
 * lobbies and results are named from them), falling back to `base` for
 * anything the roster leaves out. Colours and images only matter to clients,
 * which read the roster themselves.
 */
export function applyRoster(roster, characters, base) {
  characters.forEach((c, i) => {
    const edit = (roster?.chars && Object.hasOwn(roster.chars, c.id)) ? roster.chars[c.id] : {};
    for (const key of CAST_FIELDS) c[key] = edit[key] ?? base[i][key];
  });
}

/** What a race worker needs of the cast: `[{ id, name, title, quote }]`. */
export const castOf = characters => characters.map(({ id, name, title, quote }) => ({ id, name, title, quote }));

/**
 * Copy a cast from castOf() over `characters` (a race worker's own copy of
 * CHARACTERS, which starts at the defaults). Unknown ids and non-text values
 * are ignored, so a bad message can never break the field.
 */
export function applyCast(cast, characters) {
  if (!Array.isArray(cast)) return;
  for (const c of cast) {
    const def = c && characters.find(d => d.id === c.id); if (!def) continue;
    for (const key of CAST_FIELDS) if (typeof c[key] === 'string' && c[key]) def[key] = c[key];
  }
}

/**
 * The roster routes on `store` (its 'roster' document). `requireAdmin(req)`
 * resolves to the admin's user for an admin session, else null (accounts.js).
 * The server's cast is `characters`, reset to `base` and renamed from the
 * roster on load() and after every save.
 *
 * Returns `handle(req, res, path)`, which answers and returns true for the two
 * routes above, false for any other path, plus:
 *   handle.load()  read the stored roster and apply it, once, before listening.
 *                  A stored document that fails validation is logged and
 *                  ignored: the default cast, never a crash.
 *   handle.json()  the current roster, serialised once per save.
 *
 * Saves run one at a time, in arrival order: validating, storing and applying
 * one never interleaves with another, so the stored document, the served one
 * and the server's names always agree.
 */
export function rosterApi(store, { requireAdmin, characters = CHARACTERS, base = BASE, log = console } = {}) {
  let json = JSON.stringify(emptyRoster());
  let queue = Promise.resolve();

  const use = roster => { applyRoster(roster, characters, base); json = JSON.stringify(roster); };

  const reply = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', ...headers });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  async function load() {
    const stored = await store.getDoc(DOC);
    if (stored == null) { use(emptyRoster()); return; }
    const r = validateRoster(stored);
    if (r.ok) { use(r.roster); return; }
    log.warn(`roster: the stored cast is invalid (${r.error}); serving the default cast until the admin saves again`);
    use(emptyRoster());
  }

  /** Validate, store, then apply: one save at a time. Resolves to validateRoster's result, plus `json` once stored. */
  function save(input) {
    const run = async () => {
      const r = validateRoster(input);
      if (!r.ok) return r;
      await store.putDoc(DOC, r.roster);       // throws on an I/O error: nothing is applied
      use(r.roster);
      return { ...r, json };                   // what was stored, whatever later saves do
    };
    const p = queue.then(run);
    queue = p.catch(() => {});                 // one failed save does not block the next
    return p;
  }

  const routes = {
    'GET /api/roster': (_req, res) => reply(res, 200, json),
    'PUT /api/admin/roster': async (req, res) => {
      // Rejected before the body is read; `connection: close` stops an upload nobody will read.
      if (!(await requireAdmin(req))) return reply(res, 401, { error: 'Réservé à l’administrateur : connectez-vous avec son compte.' }, { connection: 'close' });
      if (!isJson(req)) return reply(res, 415, { error: 'Le contenu doit être du JSON.' }, { connection: 'close' });
      const body = await readJsonBody(req, BODY_MAX);
      if (!body.ok) {
        const error = body.status === 413 ? `Distribution trop lourde (${BODY_MAX / 1024 / 1024} Mo au plus).` : 'Requête illisible.';
        return reply(res, body.status, { error }, body.close ? { connection: 'close' } : {});
      }
      const r = await save(body.value);
      if (!r.ok) return reply(res, 400, { error: r.error, field: r.field });
      reply(res, 200, r.json);
    },
  };

  async function handle(req, res, path) {
    const route = routes[req.method + ' ' + path]; if (!route) return false;
    try { await route(req, res); }
    catch (e) { log.error('roster API failed:', e); if (!res.headersSent) reply(res, 500, { error: 'Erreur du serveur.' }); }
    return true;
  }
  handle.load = load;
  handle.json = () => json;
  return handle;
}
