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
//
// The same connection carries the social side of an account: hello sends the
// session token (none for a guest), and the view also holds the friend list,
// the last invitation received and the last notice. Profile updates (the
// experience a team race earned) go to the handler registered with onProfile.

let Transport = typeof WebSocket === 'undefined' ? null : WebSocket;
let ws = null;
let view = Object.freeze({ status: 'idle', id: null, room: null, error: null, friends: [], invite: null, notice: null });
const viewListeners = new Set();
const handlers = { race: null, snap: null, results: null, profile: null };
let pendingName = '';
let pendingToken = null;

function publish(patch) {
  view = Object.freeze({ ...view, ...patch });
  for (const fn of viewListeners) fn(view);
}

/** Use another WebSocket implementation (tests). */
export function setTransport(Impl) { Transport = Impl; }

/** The current connection view: { status, id, room, error, friends, invite, notice }. */
export const getNet = () => view;

/** Subscribe to view changes. Returns the unsubscribe function. */
export function onNet(fn) { viewListeners.add(fn); return () => { viewListeners.delete(fn); }; }

/** Register the race consumers. Each takes the server's message. */
export function onRace(fn) { handlers.race = fn; }
export function onSnap(fn) { handlers.snap = fn; }
export function onResults(fn) { handlers.results = fn; }
/** `fn(profile, gained)` whenever the server says who we are or what a race earned. */
export function onProfile(fn) { handlers.profile = fn; }

/**
 * ws://host/ws or wss://host/ws for the game server. That is the page's own
 * origin, unless `base` names a remote server (e.g. https://kr.onrender.com),
 * as the GitHub Pages build does: Pages is static and cannot host the rooms.
 */
export function serverUrl(loc, base = '') {
  const at = base ? new URL(base) : loc;
  return (at.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + at.host + '/ws';
}

/** Whether the game server answers its /api/kr probe, at the page's origin or at `base`. */
export async function probeServer(fetchImpl = globalThis.fetch, base = '') {
  if (typeof fetchImpl !== 'function') return false;
  try {
    const r = await fetchImpl(base ? base.replace(/\/+$/, '') + '/api/kr' : './api/kr', { cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    return j && j.kr === 'server';
  } catch { return false; }
}

const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

function onMessage(raw) {
  let m; try { m = JSON.parse(typeof raw === 'string' ? raw : String(raw)); } catch { return; }
  if (m.t === 'welcome') { publish({ id: m.id }); handlers.profile?.(m.profile ?? null, 0); if (m.profile) send({ t: 'friends' }); }
  else if (m.t === 'room') publish({ room: m.room, error: null });
  else if (m.t === 'error') publish({ error: m.msg, notice: null });
  else if (m.t === 'notice') publish({ notice: m.msg, error: null });
  else if (m.t === 'friends') publish({ friends: Array.isArray(m.list) ? m.list : [] });
  else if (m.t === 'invite') publish({ invite: { from: m.from, code: m.code } });
  else if (m.t === 'profile') handlers.profile?.(m.profile, m.gained || 0);
  else if (m.t === 'race') handlers.race?.(m);
  else if (m.t === 'snap') handlers.snap?.(m);
  else if (m.t === 'results') handlers.results?.(m);
}

/**
 * Open the connection (if none is open or opening) and introduce ourselves:
 * as the account behind `token`, or as a guest called `name`. On an open
 * connection it introduces us again, which is how logging in or out takes
 * effect without reconnecting.
 */
export function connect(url, name, token) {
  pendingName = name ?? pendingName;
  if (token !== undefined) pendingToken = token;
  const hello = () => send({ t: 'hello', name: pendingName, token: pendingToken || undefined });
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) { if (ws.readyState === 1) hello(); return; }
  if (!Transport) { publish({ status: 'closed', error: 'Pas de WebSocket dans ce navigateur.' }); return; }
  publish({ status: 'connecting', error: null });
  const sock = new Transport(url); ws = sock;
  sock.onopen = () => { if (ws !== sock) return; publish({ status: 'open' }); hello(); };
  sock.onmessage = e => { if (ws === sock) onMessage(e.data); };
  sock.onclose = () => { if (ws !== sock) return; ws = null; publish({ status: 'closed', room: null, friends: [], error: view.error ?? 'Connexion au serveur perdue.' }); };
  sock.onerror = () => { if (ws === sock) publish({ error: 'Serveur injoignable.' }); };
}

/** Close the connection and forget the room. */
export function disconnect() {
  const sock = ws; ws = null;
  if (sock) try { sock.close(); } catch { /* already closed */ }
  publish({ status: 'idle', room: null, error: null, friends: [], invite: null, notice: null });
}

/** Whether the connection is open. */
export const isOpen = () => !!ws && ws.readyState === 1;

// `style` is the player's Garage edits: everyone in the room draws their kart with it.
export const createRoom = style => send({ t: 'create', style });
export const joinRoom = (code, style) => send({ t: 'join', code, style });
export const setMine = patch => send({ t: 'set', ...patch });
export const pickTrack = trackIdx => send({ t: 'track', trackIdx });
export const startNetRace = () => send({ t: 'start' });
export const leaveRoom = () => { send({ t: 'leave' }); publish({ room: null }); };

export const requestFriends = () => send({ t: 'friends' });
export const addFriend = name => send({ t: 'friendAdd', name });
export const acceptFriend = id => send({ t: 'friendAccept', id });
export const removeFriend = id => send({ t: 'friendRemove', id });
export const inviteFriend = id => send({ t: 'invite', id });
/** Forget the invitation on screen (accepted or dismissed). */
export const clearInvite = () => publish({ invite: null });
/** Forget the last notice and error (a screen was left). */
export const clearMessages = () => publish({ notice: null, error: null });

/** Controls for this tick, plus the running counts of item and power presses. */
export const sendInput = (c, item, power) => send({ t: 'input', c, item, power });
