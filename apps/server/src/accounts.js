// Accounts over HTTP: sign up, log in, log out, who am I, and the experience
// a solo race earns.
//
//   POST /api/register  {name, password}         -> {token, profile}
//   POST /api/login     {name, password}         -> {token, profile}
//   POST /api/logout    (Authorization: Bearer)  -> {}
//   GET  /api/me        (Authorization: Bearer)  -> {profile}
//   POST /api/progress  {rank, field, finished}  -> {profile, gained}   (Bearer)
//
// Errors answer {error} with a 4xx status, in French, ready to show. The
// token is a random 64-hex string the client keeps; it travels in the
// Authorization header, never in a cookie, so the API can stay open to every
// origin (the GitHub Pages build calls it from another one).
//
// Passwords are hashed with scrypt and a per-user salt; only the hash is
// stored. The game is "not serious for now" (no anti-cheat): a solo race's
// result is the client's word, so the only guard is a minimum time between
// two solo rewards.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { profileOf, xpForRace } from '../../game/src/engine/progress.js';

const scrypt = promisify(scryptCb);
const MIN_SOLO_GAP_MS = 60_000;          // a three-lap race takes minutes; one reward a minute at most
const LOGIN_WINDOW_MS = 60_000, LOGIN_TRIES = 10;

/** Why a name cannot be an account name, or null. 3 to 16 letters, digits, - _ . */
export function badName(name) {
  if (typeof name !== 'string') return 'Pseudo manquant.';
  if (name.length < 3 || name.length > 16) return 'Le pseudo fait de 3 à 16 caractères.';
  if (!/^[\p{L}\p{N}_.-]+$/u.test(name)) return 'Lettres, chiffres, tiret, point et souligné seulement (pas d’espace).';
  return null;
}

/** Why a password is refused, or null. */
export function badPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 6) return 'Le mot de passe fait au moins 6 caractères.';
  if (pw.length > 128) return 'Mot de passe trop long.';
  return null;
}

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + key.toString('hex');
}

export async function checkPassword(pw, stored) {
  const [kind, salt, hex] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !hex) return false;
  const want = Buffer.from(hex, 'hex');
  const got = await scrypt(String(pw), Buffer.from(salt, 'hex'), want.length);
  return timingSafeEqual(got, want);
}

/** The bearer token of a request, or null. */
export function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function readJson(req, limit = 4096) {
  return new Promise(ok => {
    let size = 0; const parts = [];
    req.on('data', c => { size += c.length; if (size > limit) { req.destroy(); ok(null); } else parts.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch { ok(null); } });
    req.on('error', () => ok(null));
  });
}

/**
 * The account API on `store`. Returns `handle(req, res, path)`, which answers
 * and returns true for the paths above, false for any other. `onProfile(user)`
 * is told whenever an account's experience changes, so live connections can
 * be updated. `tries` caps sign-ups and failed logins per address and minute.
 */
export function accountApi(store, { onProfile = () => {}, tries: maxTries = LOGIN_TRIES } = {}) {
  const lastSolo = new Map();       // user id -> time of the last solo reward
  const tries = new Map();          // ip -> { n, since }

  const reply = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(body));
  };
  // Per client address; behind a host's proxy (Render, Fly) that is the first X-Forwarded-For hop.
  const addr = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  /** Whether this address has used up its tries for now. */
  const blocked = req => { const t = tries.get(addr(req)); return !!t && Date.now() - t.since <= LOGIN_WINDOW_MS && t.n >= maxTries; };
  /** Count one try (a failed login, or any sign-up) against this address. */
  const count = req => {
    const ip = addr(req), now = Date.now(); const t = tries.get(ip);
    if (!t || now - t.since > LOGIN_WINDOW_MS) tries.set(ip, { n: 1, since: now }); else t.n++;
    if (tries.size > 10_000) tries.clear();      // never grows without bound
  };
  const TOO_MANY = { error: 'Trop d’essais, patientez une minute.' };
  const session = async req => store.sessionUser(bearer(req));

  const routes = {
    'POST /api/register': async (req, res) => {
      if (blocked(req)) return reply(res, 429, TOO_MANY);
      count(req);
      const b = await readJson(req); if (!b) return reply(res, 400, { error: 'Requête illisible.' });
      const name = typeof b.name === 'string' ? b.name.trim() : b.name;
      const why = badName(name) || badPassword(b.password); if (why) return reply(res, 400, { error: why });
      const user = await store.createUser({ name, hash: await hashPassword(b.password) });
      if (!user) return reply(res, 409, { error: 'Ce pseudo est déjà pris.' });
      reply(res, 200, { token: await store.createSession(user.id), profile: profileOf(user) });
    },
    'POST /api/login': async (req, res) => {
      if (blocked(req)) return reply(res, 429, TOO_MANY);
      const b = await readJson(req); if (!b) return reply(res, 400, { error: 'Requête illisible.' });
      const user = typeof b.name === 'string' ? await store.userByName(b.name.trim()) : null;
      // only failures count, so players sharing an address can still log in
      if (!user || !(await checkPassword(b.password, user.hash))) { count(req); return reply(res, 401, { error: 'Pseudo ou mot de passe incorrect.' }); }
      reply(res, 200, { token: await store.createSession(user.id), profile: profileOf(user) });
    },
    'POST /api/logout': async (req, res) => { await store.dropSession(bearer(req)); reply(res, 200, {}); },
    'GET /api/me': async (req, res) => {
      const user = await session(req); if (!user) return reply(res, 401, { error: 'Session expirée.' });
      reply(res, 200, { profile: profileOf(user) });
    },
    'POST /api/progress': async (req, res) => {
      const user = await session(req); if (!user) return reply(res, 401, { error: 'Session expirée.' });
      const b = await readJson(req); if (!b) return reply(res, 400, { error: 'Requête illisible.' });
      const now = Date.now();
      if (now - (lastSolo.get(user.id) ?? 0) < MIN_SOLO_GAP_MS) return reply(res, 200, { profile: profileOf(user), gained: 0 });
      lastSolo.set(user.id, now);
      const field = Number.isInteger(b.field) && b.field > 1 && b.field <= 12 ? b.field : 6;
      const gained = xpForRace({ rank: Number(b.rank) || 0, field, finished: b.finished === true });
      const after = await store.addXp(user.id, gained);
      onProfile(after);
      reply(res, 200, { profile: profileOf(after), gained });
    },
  };

  return async function handle(req, res, path) {
    if (req.method === 'OPTIONS' && path.startsWith('/api/')) {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '86400' });
      res.end(); return true;
    }
    const route = routes[req.method + ' ' + path]; if (!route) return false;
    try { await route(req, res); }
    catch (e) { console.error('account API failed:', e); if (!res.headersSent) reply(res, 500, { error: 'Erreur du serveur.' }); }
    return true;
  };
}
