// The game server: the built game over HTTP, and rooms over a WebSocket, on
// one origin and one port (DEC-014).
//
//   GET /api/kr   -> {"kr":"server",...}  the client's "am I served by the
//                    game server?" probe; the Multijoueur button shows only
//                    when it answers. GitHub Pages has no such route.
//   GET /api/roster -> the cast as the admin edited it (roster.js), public,
//                    never cached: every client reads the same one
//   GET /*        -> apps/game/dist, read-only, no directory escapes
//   WS  /ws       -> the lobby protocol below; races run in a worker
//
//   POST /api/admin/login  {user,password} -> 204 + cookie | 401 | 429
//   POST /api/admin/logout                 -> 204, cookie cleared
//   GET  /api/admin/me     -> {enabled, admin, user?}
//   PUT  /api/admin/roster {chars, ads}    -> 200 + the stored roster | 400 {error, field}
//   The only non-GET routes. Each mutating one needs a JSON content type and
//   a same-origin Origin (auth.js); all answer 503 while admin is disabled,
//   except `me`, which says so.
//
// Client -> server: hello {name} | create {style} | join {code, style} |
// set {team,charId,ready,style} | track {trackIdx} | start | leave | input {...} (during a race).
// Server -> client: welcome {id} | room {room} | error {msg} | race {...} |
// snap {...} | results {...}. Every message is one JSON object with a `t`.

import { randomUUID } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

import { WebSocketServer } from 'ws';

import { BASE, CHARACTERS } from '../../game/src/engine/data.js';
import { createAdmin } from './auth.js';
import { newCode, Room } from './lobby.js';
import { applyRoster, createRosterStore } from './roster.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp',
};

export const PROTOCOL = 1;

export const LOGIN_BODY_LIMIT = 4 * 1024;
// 11 liveries at 256 KB and 8 posters at 512 KB come to about 7 MB of JSON.
export const ROSTER_BODY_LIMIT = 8 * 1024 * 1024;

/** An error that carries the HTTP status to answer with. */
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/**
 * Read a JSON object body of at most `limitBytes`. Rejects with HttpError 413
 * as soon as the declared or received size passes the limit, without waiting
 * for the rest (later chunks are discarded, never buffered), and with 400 on
 * invalid JSON or a non-object. Stage 6 reuses it with a larger cap.
 */
export function readJson(req, limitBytes) {
  return new Promise((ok, ko) => {
    if (Number(req.headers['content-length']) > limitBytes) { req.resume(); ko(new HttpError(413, 'Requête trop volumineuse.')); return; }
    const chunks = []; let size = 0; let settled = false;
    const settle = (fn, v) => { if (!settled) { settled = true; fn(v); } };
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > limitBytes) { chunks.length = 0; settle(ko, new HttpError(413, 'Requête trop volumineuse.')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      let v; try { v = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { settle(ko, new HttpError(400, 'JSON invalide.')); return; }
      if (!v || typeof v !== 'object' || Array.isArray(v)) { settle(ko, new HttpError(400, 'Objet JSON attendu.')); return; }
      settle(ok, v);
    });
    req.on('error', () => settle(ko, new HttpError(400, 'Requête interrompue.')));
  });
}

/** A JSON answer that no cache may keep. A 204 or a HEAD goes out without a body. */
function sendJson(res, status, body, headers = {}) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    ...(data ? { 'content-type': 'application/json' } : {}), ...headers,
  });
  res.end(data);
}

/**
 * Start a game server. `runRace(room, roster, io)` starts a race and returns
 * `{ input(playerId, msg), leave(playerId), stop() }`; io carries
 * `send(playerId, msg)`, `broadcast(msg)` and `done(results)`.
 * `admin` is `{ user, passwordHash, trustProxy, now }` (auth.js); without a
 * hash the admin endpoints are disabled.
 * `roster` is a loaded store (roster.js); without one the cast edits live in
 * memory only. Its names are applied to CHARACTERS now and on every save.
 * Resolves to `{ port, close() }` once listening.
 */
export function startServer({ port = 0, host = '0.0.0.0', staticDir, runRace, admin: adminConfig = {}, roster = createRosterStore() }) {
  const root = resolve(staticDir);
  const rooms = new Map();          // code -> Room
  const races = new Map();          // code -> race handle
  const conns = new Map();          // id -> { ws, id, name, code }
  const admin = createAdmin(adminConfig);
  applyRoster(roster.get(), CHARACTERS, BASE);

  const DISABLED = { error: 'Administration désactivée.' };
  const DENIED = { error: 'Identifiant ou mot de passe incorrect.' };

  async function login(req, res) {
    if (!admin.enabled) return sendJson(res, 503, DISABLED);
    const bad = admin.checkMutation(req); if (bad) return sendJson(res, bad.status, { error: bad.error });
    const body = await readJson(req, LOGIN_BODY_LIMIT);
    const slot = admin.limiter.take(admin.clientIp(req));
    if (!slot.ok) return sendJson(res, 429, { error: 'Trop de tentatives. Réessayez dans une minute.' }, { 'retry-after': String(slot.retryAfterS) });
    if (!await admin.verify(body.user, body.password)) return sendJson(res, 401, DENIED);
    slot.success();
    admin.sessions.destroy(admin.tokenOf(req));
    const token = admin.sessions.create(body.user);
    sendJson(res, 204, undefined, { 'set-cookie': admin.cookie(req, token) });
  }

  function logout(req, res) {
    if (!admin.enabled) return sendJson(res, 503, DISABLED);
    const bad = admin.checkMutation(req); if (bad) return sendJson(res, bad.status, { error: bad.error });
    req.resume();
    admin.sessions.destroy(admin.tokenOf(req));
    sendJson(res, 204, undefined, { 'set-cookie': admin.clearCookie(req) });
  }

  function me(req, res) {
    const who = admin.requireAdmin(req);
    sendJson(res, 200, who ? { enabled: true, admin: true, user: who.user } : { enabled: admin.enabled, admin: false });
  }

  // The order matters: nothing is read from an unauthenticated client, so
  // only the admin can make the server buffer a body of up to 8 MB.
  async function putRoster(req, res) {
    if (!admin.enabled) return sendJson(res, 503, DISABLED);
    const bad = admin.checkMutation(req); if (bad) return sendJson(res, bad.status, { error: bad.error });
    if (!admin.requireAdmin(req)) { req.resume(); return sendJson(res, 401, { error: 'Connexion administrateur requise.' }); }
    const body = await readJson(req, ROSTER_BODY_LIMIT);
    const saved = await roster.save(body);
    if (!saved.ok) return sendJson(res, 400, { error: saved.error, field: saved.field });
    applyRoster(roster.get(), CHARACTERS, BASE);      // the latest, should two saves overlap
    sendJson(res, 200, saved.roster);
  }

  const adminRoutes = {
    '/api/admin/login': ['POST', login], '/api/admin/logout': ['POST', logout], '/api/admin/me': ['GET', me],
    '/api/admin/roster': ['PUT', putRoster],
  };

  /** Answer an admin route; false when the path is not one, so it falls through. */
  function adminRoute(req, res, path) {
    const route = Object.hasOwn(adminRoutes, path) ? adminRoutes[path] : null;
    if (!route) return false;
    const [method, handler] = route;
    if (req.method !== method && !(method === 'GET' && req.method === 'HEAD')) {
      req.resume();
      sendJson(res, 405, { error: 'Méthode non autorisée.' }, { allow: method === 'GET' ? 'GET, HEAD' : method });
      return true;
    }
    Promise.resolve().then(() => handler(req, res)).catch(e => {
      if (res.headersSent) { res.destroy(); return; }
      // Past a 413 the rest of the body is read and dropped, never buffered,
      // so the client finishes its upload and actually sees the answer
      // (closing early makes it a connection reset instead).
      if (e instanceof HttpError) { sendJson(res, e.status, { error: e.message }); return; }
      console.error(e);
      sendJson(res, 500, { error: 'Erreur interne.' });
    });
    return true;
  }

  const http = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/api/kr') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ kr: 'server', protocol: PROTOCOL, rooms: rooms.size }));
      return;
    }
    if (url.pathname === '/api/roster') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { req.resume(); sendJson(res, 405, { error: 'Méthode non autorisée.' }, { allow: 'GET, HEAD' }); return; }
      // Serialised once per save, not per request: the roster can weigh megabytes.
      const data = roster.json();
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-length': Buffer.byteLength(data) });
      res.end(req.method === 'HEAD' ? undefined : data);
      return;
    }
    if (url.pathname.startsWith('/api/admin/') && adminRoute(req, res, url.pathname)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let rel; try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    let st; try { st = statSync(file); } catch { st = null; }
    if (!st || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(rel === '/index.html' ? 'The game is not built yet: run `npm run build -w @kart-republique/game`.' : 'Not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': st.size });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });

  const send = (id, msg) => { const c = conns.get(id); if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); };
  const toRoom = (room, msg) => { for (const p of room.players) send(p.id, msg); };
  const showRoom = room => toRoom(room, { t: 'room', room: room.view() });
  const fail = (id, msg) => send(id, { t: 'error', msg });

  function leaveRoom(c) {
    const room = c.code && rooms.get(c.code); c.code = null;
    if (!room) return;
    room.leave(c.id);
    races.get(room.code)?.leave(c.id);
    if (room.empty) { races.get(room.code)?.stop(); races.delete(room.code); rooms.delete(room.code); return; }
    showRoom(room);
  }

  function enter(c, room) {
    const r = room.join(c.id, c.name, c.style);
    if (typeof r === 'string') return fail(c.id, r);
    c.code = room.code; showRoom(room);
  }

  function start(c, room) {
    const why = room.cannotStart(c.id); if (why) return fail(c.id, why);
    room.phase = 'race';
    const roster = room.roster();
    const io = {
      send, broadcast: msg => toRoom(room, msg),
      done: results => { races.delete(room.code); room.endRace(); toRoom(room, { t: 'results', ...results }); showRoom(room); },
    };
    try { races.set(room.code, runRace(room, roster, io)); }
    catch (e) { room.endRace(); fail(c.id, 'Impossible de lancer la course.'); console.error(e); }
    showRoom(room);
  }

  const handlers = {
    hello: (c, m) => { c.name = typeof m.name === 'string' ? m.name : c.name; send(c.id, { t: 'welcome', id: c.id, protocol: PROTOCOL }); },
    create: (c, m) => { c.style = m.style; leaveRoom(c); const room = new Room(newCode(new Set(rooms.keys()))); rooms.set(room.code, room); enter(c, room); },
    join: (c, m) => { const room = rooms.get(String(m.code ?? '').toUpperCase().trim()); if (!room) return fail(c.id, 'Aucune salle avec ce code.'); c.style = m.style; if (c.code !== room.code) { leaveRoom(c); enter(c, room); } },
    set: (c, m) => { const room = rooms.get(c.code); if (!room) return; const e = room.set(c.id, { team: m.team, charId: m.charId, ready: m.ready, style: m.style }); if (e) fail(c.id, e); showRoom(room); },
    track: (c, m) => { const room = rooms.get(c.code); if (!room) return; const e = room.setTrack(c.id, m.trackIdx); if (e) fail(c.id, e); showRoom(room); },
    start: c => { const room = rooms.get(c.code); if (room) start(c, room); },
    leave: c => leaveRoom(c),
    input: (c, m) => { races.get(c.code)?.input(c.id, m); },
  };

  wss.on('connection', ws => {
    const c = { ws, id: randomUUID(), name: '', code: null, alive: true };
    conns.set(c.id, c);
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      const h = m && typeof m.t === 'string' && Object.hasOwn(handlers, m.t) ? handlers[m.t] : null;
      if (h) h(c, m);
    });
    ws.on('close', () => { leaveRoom(c); conns.delete(c.id); });
  });

  // Hosts behind proxies drop idle sockets; a ping every 15 s also reaps dead clients.
  const beat = setInterval(() => { for (const c of conns.values()) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; c.ws.ping(); } }, 15_000);
  beat.unref();

  return new Promise((ok, ko) => {
    http.once('error', ko);
    http.listen(port, host, () => ok({
      port: http.address().port,
      rooms,
      close: () => new Promise(done => { clearInterval(beat); for (const r of races.values()) r.stop(); for (const c of conns.values()) c.ws.terminate(); wss.close(); http.close(() => done()); }),
    }));
  });
}
