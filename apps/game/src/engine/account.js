// The client's side of accounts: the game server's account API over HTTP.
//
// DOM-free like the rest of the engine: `fetchImpl` is injected (the
// platform's fetch by default) and `base` is the server's origin, empty for
// the page's own (see net.js). Every call resolves -- never throws -- to
// { ok, status, ...body }, where a failed call carries `error`, a French
// sentence ready to show. Keeping the token is the caller's business.

async function call(fetchImpl, base, method, path, { token, body } = {}) {
  if (typeof fetchImpl !== 'function') return { ok: false, status: 0, error: 'Serveur injoignable.' };
  const url = (base ? base.replace(/\/+$/, '') : '.') + path;
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = 'Bearer ' + token;
  try {
    const r = await fetchImpl(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    let j = {}; try { j = await r.json(); } catch { /* an empty or non-JSON answer */ }
    return { ok: r.ok, status: r.status, ...j, error: r.ok ? undefined : j.error || 'Erreur du serveur (' + r.status + ').' };
  } catch {
    return { ok: false, status: 0, error: 'Serveur injoignable.' };
  }
}

/** Create an account: { ok, token, profile } or { ok: false, error }. */
export const register = (name, password, { fetchImpl = globalThis.fetch, base = '' } = {}) =>
  call(fetchImpl, base, 'POST', '/api/register', { body: { name, password } });

/** Log in: { ok, token, profile } or { ok: false, error }. */
export const login = (name, password, { fetchImpl = globalThis.fetch, base = '' } = {}) =>
  call(fetchImpl, base, 'POST', '/api/login', { body: { name, password } });

/** End this session on the server. */
export const logout = (token, { fetchImpl = globalThis.fetch, base = '' } = {}) =>
  call(fetchImpl, base, 'POST', '/api/logout', { token, body: {} });

/** The profile behind a saved token: { ok, profile }, or status 401 once it expired. */
export const me = (token, { fetchImpl = globalThis.fetch, base = '' } = {}) =>
  call(fetchImpl, base, 'GET', '/api/me', { token });

/**
 * Report a finished solo race: { ok, profile, gained, coins, bonus }, where
 * `gained` is the experience, `coins` the politicoins and `bonus`
 * { daily, levelUp, levelUpCoins } what they include. `trackId`, `charId`,
 * `time` and `bestLap` (seconds) feed the account's stats.
 */
export const reportRace = (token, { rank, field, finished, trackId = null, charId = null, time = null, bestLap = null }, { fetchImpl = globalThis.fetch, base = '' } = {}) =>
  call(fetchImpl, base, 'POST', '/api/progress', { token, body: { rank, field, finished, trackId, charId, time, bestLap } });

// ---------- The politicoins economy (DEC-032..035) ----------
// Every call is the account's own. The server prices and rolls everything;
// a refusal carries its sentence: 402 short of coins, 403 below the level,
// 409 already owned, 429 too many calls in a minute.
export const shop = {
  /** Buy candidate `id`: { ok, profile, bought: { kind: 'char', id, price } }. */
  buyChar: (token, id, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'POST', '/api/shop/char', { token, body: { id } }),
  /** Buy option `value` of part `category`: { ok, profile, bought: { kind: 'part', key, price } }. */
  buyPart: (token, category, value, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'POST', '/api/shop/part', { token, body: { category, value } }),
  /** Open a Politibox: { ok, profile, drop } (catalog.js rollBox). */
  openBox: (token, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'POST', '/api/box/open', { token, body: {} }),
  /** The friends' stats: { ok, friends: [{ id, name, level, stats, collection }] }. */
  friendStats: (token, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'GET', '/api/stats/friends', { token }),
};

/** What a failed roster call says when the server gave no sentence of its own. */
const ROSTER_FALLBACK = {
  401: 'Session expirée : reconnectez-vous avec le compte administrateur.',
  413: 'Distribution trop lourde pour le serveur : allégez les images.',
};

/**
 * Split call()'s answer into `{ ok, status, roster }`, the roster being the
 * body (the server's whole JSON document), or the failure with its `error`
 * and, for a refused roster, the `field` the server names.
 */
function rosterReply(r) {
  const { ok, status, error, field, ...body } = r;
  if (ok && body && typeof body === 'object' && !Array.isArray(body)) return { ok: true, status, roster: body };
  if (ok) return { ok: false, status, error: 'Réponse illisible du serveur.' };
  const out = { ok: false, status, error: (status in ROSTER_FALLBACK && /^Erreur du serveur/.test(error)) ? ROSTER_FALLBACK[status] : error };
  if (typeof field === 'string') out.field = field;
  return out;
}

// ---------- The admin's dashboard (DEC-030) ----------
// Every call is the admin's: 401 for anyone else, which the store treats as an
// expired session. The answers are the server's JSON bodies (dashboard.js).
export const dashboard = {
  /** { ok, accounts, live, races, top } */
  stats: (token, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'GET', '/api/admin/stats', { token }),
  /** { ok, users }, filtered by `q` (a part of a name) when given. */
  users: (token, q = '', { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'GET', '/api/admin/users' + (q ? '?q=' + encodeURIComponent(q) : ''), { token }),
  /** { ok, connections, rooms } */
  live: (token, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'GET', '/api/admin/live', { token }),
  ban: (token, id, reason, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'POST', '/api/admin/users/ban', { token, body: { id, reason } }),
  unban: (token, id, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'POST', '/api/admin/users/unban', { token, body: { id } }),
  logoutUser: (token, id, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'POST', '/api/admin/users/logout', { token, body: { id } }),
  closeRoom: (token, code, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'POST', '/api/admin/rooms/close', { token, body: { code } }),
  kick: (token, id, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'POST', '/api/admin/connections/kick', { token, body: { id } }),
  /** Any command on room `code`, lobby or race (DEC-031): { ok, text }. */
  command: (token, code, cmd, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'POST', '/api/admin/rooms/command', { token, body: { code, cmd } }),
  /** Give account `id` `amount` politicoins (0 to 100 000): { ok, user: { id, name, coins } }. */
  grantCoins: (token, id, amount, { fetchImpl = globalThis.fetch, base = '' } = {}) => call(fetchImpl, base, 'POST', '/api/admin/coins', { token, body: { id, amount } }),
};

/** The cast the admin set, the same for every player: { ok, roster } or { ok: false, error }. Public. */
export const fetchRoster = async ({ fetchImpl = globalThis.fetch, base = '' } = {}) =>
  rosterReply(await call(fetchImpl, base, 'GET', '/api/roster'));

/**
 * The admin saves the cast for every player: { ok, roster } (the roster as
 * the server stored it), or { ok: false, status, error, field? } -- 400 names
 * the bad field, 401 means the session is no longer the admin's, 413 too large.
 */
export const saveRoster = async (roster, token, { fetchImpl = globalThis.fetch, base = '' } = {}) =>
  rosterReply(await call(fetchImpl, base, 'PUT', '/api/admin/roster', { token, body: roster }));
