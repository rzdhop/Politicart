// Admin authentication for the game server: one account whose scrypt hash
// comes from the env, in-memory sessions behind an HttpOnly cookie, a failed
// login limiter, and the CSRF checks every mutating admin request passes.
// node:crypto only; nothing here touches the disk.
//
// Sessions live in memory on purpose: Fly stops the machine when idle, and a
// restart only means the admin logs in again.

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const SCRYPT = { N: 16384, r: 8, p: 1 };
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const HASH_RE = /^scrypt\$N=(\d{1,8}),r=(\d{1,3}),p=(\d{1,3})\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;     // 32 random bytes, base64url

export const COOKIE = 'kr_admin';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Parse `scrypt$N=..,r=..,p=..$<salt b64>$<key b64>`, or null. The cost
 * bounds only guard against a typo in the env making every login allocate
 * gigabytes; the hash itself is trusted config.
 */
export function parseHash(stored) {
  const m = typeof stored === 'string' ? HASH_RE.exec(stored) : null;
  if (!m) return null;
  const N = Number(m[1]), r = Number(m[2]), p = Number(m[3]);
  if (N < 1024 || N > 1 << 20 || (N & (N - 1)) !== 0 || r < 1 || r > 32 || p < 1 || p > 16) return null;
  if (128 * N * r > 256 * 1024 * 1024) return null;
  const salt = Buffer.from(m[4], 'base64'), key = Buffer.from(m[5], 'base64');
  if (salt.length < 16 || key.length < 16 || key.length > 64) return null;
  return { N, r, p, salt, key };
}

export const isPasswordHash = stored => parseHash(stored) !== null;

// NFC so a password with accents verifies whatever keyboard typed it.
const derive = (password, { N, r, p, salt }, len) =>
  scryptAsync(password.normalize('NFC'), salt, len, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 });

/** Hash a password into the self-describing format `parseHash` reads. */
export async function hashPassword(password) {
  if (typeof password !== 'string') throw new TypeError('password must be a string');
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, { ...SCRYPT, salt }, KEY_BYTES);
  return `scrypt$N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** True when `password` matches `stored`. Never throws: a bad hash is a no. */
export async function verifyPassword(password, stored) {
  const h = parseHash(stored);
  if (!h || typeof password !== 'string') return false;
  try { return timingSafeEqual(await derive(password, h, h.key.length), h.key); }
  catch { return false; }
}

/** Constant-time string equality; hashing first hides the length too. */
export function safeEqual(a, b) {
  const d = s => createHash('sha256').update(String(s)).digest();
  return timingSafeEqual(d(a), d(b));
}

/**
 * Sessions: token -> { user, expires }. A token is 32 random bytes; expired
 * entries go on read and on every create, and `max` bounds the map even if
 * someone logs in in a loop.
 */
export function createSessions({ ttlMs = SESSION_TTL_MS, now = Date.now, max = 64 } = {}) {
  const map = new Map();
  const sweep = () => { const t = now(); for (const [k, s] of map) if (s.expires <= t) map.delete(k); };
  return {
    ttlMs,
    create(user) {
      sweep();
      while (map.size >= max) map.delete(map.keys().next().value);
      const token = randomBytes(32).toString('base64url');
      map.set(token, { user, expires: now() + ttlMs });
      return token;
    },
    get(token) {
      if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
      const s = map.get(token);
      if (!s) return null;
      if (s.expires <= now()) { map.delete(token); return null; }
      return s;
    },
    destroy(token) { if (typeof token === 'string') map.delete(token); },
    sweep,
    get size() { return map.size; },
  };
}

/**
 * Failed-login limiter over a sliding window: `perIp` per client, and
 * `global` across all clients so spoofed or rotating IPs still cannot brute
 * force. `take(ip)` reserves an attempt BEFORE the slow password check, so a
 * burst of parallel requests cannot all slip in; it returns
 * `{ ok: true, success() }` or `{ ok: false, retryAfterS }`. `success()`
 * un-counts that one attempt and clears the client's own record, but leaves
 * the global window as it was.
 */
export function createRateLimiter({ perIp = 5, global = 30, windowMs = 60_000, now = Date.now } = {}) {
  const byIp = new Map();     // ip -> sorted failure times
  const all = [];             // every failure time, sorted
  const prune = (list, t) => { while (list.length && list[0] <= t - windowMs) list.shift(); };
  const sweep = t => { prune(all, t); for (const [ip, list] of byIp) { prune(list, t); if (!list.length) byIp.delete(ip); } };
  return {
    take(ip) {
      const t = now(); sweep(t);
      const mine = byIp.get(ip) ?? [];
      const waits = [];
      if (mine.length >= perIp) waits.push(mine[mine.length - perIp] + windowMs - t);
      if (all.length >= global) waits.push(all[all.length - global] + windowMs - t);
      if (waits.length) return { ok: false, retryAfterS: Math.max(1, Math.ceil(Math.max(...waits) / 1000)) };
      mine.push(t); byIp.set(ip, mine); all.push(t);
      return {
        ok: true,
        success() { byIp.delete(ip); const i = all.lastIndexOf(t); if (i >= 0) all.splice(i, 1); },
      };
    },
    get size() { return byIp.size; },
  };
}

/**
 * Cookie header -> { name: value }. First occurrence wins, malformed pairs
 * are skipped, a value that fails to decode is kept raw, and the result has
 * no prototype so a cookie named `__proto__` is just a key.
 */
export function parseCookies(header) {
  const out = Object.create(null);
  if (typeof header !== 'string' || !header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name || name in out) continue;
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try { value = decodeURIComponent(value); } catch { /* keep it raw */ }
    out[name] = value;
  }
  return out;
}

/** The Set-Cookie value for a session token, or for clearing it (token ''). */
export function sessionCookie(token, { secure, maxAgeS }) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeS}${secure ? '; Secure' : ''}`;
}

/**
 * The scheme of the request as the browser saw it. Behind Fly's proxy TLS
 * ends at the proxy, so only then is X-Forwarded-Proto believed.
 */
export function requestScheme(req, trustProxy) {
  if (!trustProxy) return 'http';
  const raw = req.headers['x-forwarded-proto'];
  const v = String(Array.isArray(raw) ? raw[0] : raw ?? '').split(',')[0]?.trim().toLowerCase();
  return v === 'https' ? 'https' : 'http';
}

/** The client address the rate limiter keys on. */
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const v = req.headers['fly-client-ip'];
    if (typeof v === 'string' && v.trim() && v.length <= 64) return v.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * CSRF guard for every mutating admin request: a JSON content type (a
 * cross-site form cannot send one without a CORS preflight, which this server
 * never grants) and an Origin equal to the request's own origin. A missing
 * Origin is refused: every browser sends it on a POST. Returns null when the
 * request may proceed, else `{ status, error }`.
 */
export function checkMutation(req, trustProxy) {
  const type = String(req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json') return { status: 415, error: 'Content-Type attendu : application/json.' };
  const origin = req.headers.origin, host = req.headers.host;
  let same = false;
  if (typeof origin === 'string' && typeof host === 'string' && host) {
    try { same = new URL(origin).origin === new URL(`${requestScheme(req, trustProxy)}://${host}`).origin; }
    catch { same = false; }
  }
  return same ? null : { status: 403, error: 'Origine refusée.' };
}

/**
 * Everything the server needs for one admin account. Without a well-formed
 * hash the account is disabled: no login is possible at all, rather than one
 * that can never succeed. `now` is injectable for tests.
 */
export function createAdmin({ user = 'rida', passwordHash = '', trustProxy = false, now = Date.now } = {}) {
  const parsed = parseHash(passwordHash);
  const enabled = parsed !== null;
  const sessions = createSessions({ now });
  const limiter = createRateLimiter({ now });
  // A wrong user still costs one scrypt with the same parameters, so the
  // response time does not reveal which half of the pair was wrong.
  const dummy = parsed
    ? `scrypt$N=${parsed.N},r=${parsed.r},p=${parsed.p}$${randomBytes(SALT_BYTES).toString('base64')}$${randomBytes(parsed.key.length).toString('base64')}`
    : '';
  const tokenOf = req => parseCookies(req.headers.cookie)[COOKIE];

  return {
    enabled,
    trustProxy,
    sessions,
    limiter,
    tokenOf,
    scheme: req => requestScheme(req, trustProxy),
    clientIp: req => clientIp(req, trustProxy),
    checkMutation: req => checkMutation(req, trustProxy),
    /** Check a {user, password} pair; any non-string is simply a wrong pair. */
    async verify(u, password) {
      if (!enabled) return false;
      const userOk = safeEqual(typeof u === 'string' ? u : '', user);
      const pwOk = await verifyPassword(typeof password === 'string' ? password : '', userOk ? passwordHash : dummy);
      return userOk && pwOk && typeof u === 'string' && typeof password === 'string';
    },
    /** The logged-in admin behind this request, or null. */
    requireAdmin(req) {
      if (!enabled) return null;
      const s = sessions.get(tokenOf(req));
      return s ? { user: s.user } : null;
    },
    cookie: (req, token) => sessionCookie(token, { secure: requestScheme(req, trustProxy) === 'https', maxAgeS: Math.floor(sessions.ttlMs / 1000) }),
    clearCookie: req => sessionCookie('', { secure: requestScheme(req, trustProxy) === 'https', maxAgeS: 0 }),
  };
}
