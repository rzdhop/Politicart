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

/** Report a finished solo race: { ok, profile, gained }. */
export const reportRace = (token, { rank, field, finished }, { fetchImpl = globalThis.fetch, base = '' } = {}) =>
  call(fetchImpl, base, 'POST', '/api/progress', { token, body: { rank, field, finished } });
