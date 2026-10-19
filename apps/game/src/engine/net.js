// The client's side of the team race: one WebSocket to the game server, and
// what it last said (DEC-014).
//
// DOM-free, like every engine module. The transport is the platform's
// WebSocket unless a test injects another with setTransport(), in the same
// spirit as input.js's setInputSource. The module keeps a small immutable
// view -- connection status, own id, the room, the last error -- that the UI
// store mirrors through onNet(). Race traffic does not go through that view:
// the race start, the 20 Hz snapshots and the results go to the handlers
// registered with onRace/onSnap/onResults, which the networked race (netrace.js)
// consumes without re-rendering React twenty times a second.

let Transport = typeof WebSocket === 'undefined' ? null : WebSocket;
let ws = null;
let view = Object.freeze({ status: 'idle', id: null, room: null, error: null });
const viewListeners = new Set();
const handlers = { race: null, snap: null, results: null };
let pendingName = '';

function publish(patch) {
  view = Object.freeze({ ...view, ...patch });
  for (const fn of viewListeners) fn(view);
}

/** Use another WebSocket implementation (tests). */
export function setTransport(Impl) { Transport = Impl; }

/** The current connection view: { status, id, room, error }. */
export const getNet = () => view;

/** Subscribe to view changes. Returns the unsubscribe function. */
export function onNet(fn) { viewListeners.add(fn); return () => { viewListeners.delete(fn); }; }

/** Register the race consumers. Each takes the server's message. */
export function onRace(fn) { handlers.race = fn; }
export function onSnap(fn) { handlers.snap = fn; }
export function onResults(fn) { handlers.results = fn; }

/** ws://host/ws or wss://host/ws for the page's own origin. */
export function serverUrl(loc) {
  return (loc.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + loc.host + '/ws';
}

/** Whether the page was served by the game server: its /api/kr answers. */
export async function probeServer(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') return false;
  try {
    const r = await fetchImpl('./api/kr', { cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    return j && j.kr === 'server';
  } catch { return false; }
}

// ---- The cast and the admin session (HTTP, same origin) ----
//
// The session is an HttpOnly cookie the page never sees; `credentials:
// 'same-origin'` sends it. Every mutating call says it is JSON, which the
// server requires (with the browser's own Origin header) against CSRF. The
// password goes into the request body and nowhere else: nothing here logs or
// keeps it.

const UNREACHABLE = 'Serveur injoignable.';
const FALLBACK = {
  401: 'Identifiant ou mot de passe incorrect.',
  413: 'Envoi trop lourd pour le serveur : allégez les images.',
  429: 'Trop de tentatives. Réessayez dans une minute.',
  503: 'Administration désactivée.',
};

/**
 * One request. Resolves to `{ status, body }`, where status 0 means the
 * server could not be reached and body is the parsed JSON or null. Never
 * throws.
 */
async function call(fetchImpl, url, init = {}) {
  if (typeof fetchImpl !== 'function') return { status: 0, body: null };
  let r;
  try { r = await fetchImpl(url, { cache: 'no-store', credentials: 'same-origin', ...init }); }
  catch { return { status: 0, body: null }; }
  let body = null;
  try { body = await r.json(); } catch { /* 204, or not JSON */ }
  return { status: typeof r.status === 'number' ? r.status : (r.ok ? 200 : 0), body };
}

const sendJson = (fetchImpl, url, method, data) =>
  call(fetchImpl, url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

/**
 * A refused or failed admin call: the HTTP status (0 when unreachable), the
 * server's French message, and for a rejected roster the field it names.
 * @typedef {{ ok: false, status: number, error: string, field?: string }} AdminFailure
 */

/**
 * The server's French message for a failed call, or a fallback for its status.
 * @returns {AdminFailure}
 */
function failure({ status, body }) {
  const error = body && typeof body.error === 'string' && body.error ? body.error
    : status === 0 ? UNREACHABLE : FALLBACK[status] ?? `Erreur du serveur (${status}).`;
  /** @type {AdminFailure} */
  const out = { ok: false, status, error };
  if (body && typeof body.field === 'string') out.field = body.field;
  return out;
}

/** The cast as the admin set it, or null when the server cannot say. */
export async function fetchRoster(fetchImpl = globalThis.fetch) {
  const res = await call(fetchImpl, './api/roster');
  return res.status === 200 && res.body && typeof res.body === 'object' ? res.body : null;
}

/** Whether admin is on, and whether this browser holds an admin session. */
export async function fetchAdmin(fetchImpl = globalThis.fetch) {
  const { status, body } = await call(fetchImpl, './api/admin/me');
  if (status !== 200 || !body || typeof body !== 'object') return { enabled: false, admin: false };
  return body.admin === true
    ? { enabled: true, admin: true, user: typeof body.user === 'string' ? body.user : '' }
    : { enabled: body.enabled === true, admin: false };
}

/**
 * Log in. Resolves to `{ ok: true }` or `{ ok: false, status, error }`.
 * @returns {Promise<{ ok: true } | AdminFailure>}
 */
export async function adminLogin(user, password, fetchImpl = globalThis.fetch) {
  const res = await sendJson(fetchImpl, './api/admin/login', 'POST', { user, password });
  return res.status === 204 || res.status === 200 ? { ok: true } : failure(res);
}

/** Log out. Resolves to whether the server confirmed it. */
export async function adminLogout(fetchImpl = globalThis.fetch) {
  const res = await sendJson(fetchImpl, './api/admin/logout', 'POST', {});
  return res.status === 204 || res.status === 200;
}

/**
 * Save the cast. Resolves to `{ ok: true, roster }` with what the server
 * stored, or `{ ok: false, status, error, field? }`.
 * @returns {Promise<{ ok: true, roster: object } | AdminFailure>}
 */
export async function saveRoster(roster, fetchImpl = globalThis.fetch) {
  const res = await sendJson(fetchImpl, './api/admin/roster', 'PUT', roster);
  return res.status === 200 && res.body && typeof res.body === 'object' ? { ok: true, roster: res.body } : failure(res);
}

const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

function onMessage(raw) {
  let m; try { m = JSON.parse(typeof raw === 'string' ? raw : String(raw)); } catch { return; }
  if (m.t === 'welcome') publish({ id: m.id });
  else if (m.t === 'room') publish({ room: m.room, error: null });
  else if (m.t === 'error') publish({ error: m.msg });
  else if (m.t === 'race') handlers.race?.(m);
  else if (m.t === 'snap') handlers.snap?.(m);
  else if (m.t === 'results') handlers.results?.(m);
}

/** Open the connection (no-op if one is open or opening) and introduce ourselves. */
export function connect(url, name) {
  pendingName = name ?? pendingName;
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) { if (ws.readyState === 1) send({ t: 'hello', name: pendingName }); return; }
  if (!Transport) { publish({ status: 'closed', error: 'Pas de WebSocket dans ce navigateur.' }); return; }
  publish({ status: 'connecting', error: null });
  const sock = new Transport(url); ws = sock;
  sock.onopen = () => { if (ws !== sock) return; publish({ status: 'open' }); send({ t: 'hello', name: pendingName }); };
  sock.onmessage = e => { if (ws === sock) onMessage(e.data); };
  sock.onclose = () => { if (ws !== sock) return; ws = null; publish({ status: 'closed', room: null, error: view.error ?? 'Connexion au serveur perdue.' }); };
  sock.onerror = () => { if (ws === sock) publish({ error: 'Serveur injoignable.' }); };
}

/** Close the connection and forget the room. */
export function disconnect() {
  const sock = ws; ws = null;
  if (sock) try { sock.close(); } catch { /* already closed */ }
  publish({ status: 'idle', room: null, error: null });
}

// `style` is the player's Garage edits: everyone in the room draws their kart with it.
export const createRoom = style => send({ t: 'create', style });
export const joinRoom = (code, style) => send({ t: 'join', code, style });
export const setMine = patch => send({ t: 'set', ...patch });
export const pickTrack = trackIdx => send({ t: 'track', trackIdx });
export const startNetRace = () => send({ t: 'start' });
export const leaveRoom = () => { send({ t: 'leave' }); publish({ room: null }); };

/** Controls for this tick, plus the running counts of item and power presses. */
export const sendInput = (c, item, power) => send({ t: 'input', c, item, power });
