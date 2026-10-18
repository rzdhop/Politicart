// The game server: the built game over HTTP, and rooms over a WebSocket, on
// one origin and one port (DEC-014).
//
//   GET /api/kr   -> {"kr":"server",...}  the client's "is the game server
//                    up?" probe; the Multijoueur button shows only when it
//                    answers. Open to every origin (CORS), so a static build
//                    elsewhere (GitHub Pages) can probe a remote server.
//   GET /*        -> apps/game/dist, read-only, no directory escapes
//   WS  /ws       -> the lobby protocol below; races run in a worker
//
// Client -> server: hello {name} | create | join {code} | set {team,charId,
// ready} | track {trackIdx} | start | leave | input {...} (during a race).
// Server -> client: welcome {id} | room {room} | error {msg} | race {...} |
// snap {...} | results {...}. Every message is one JSON object with a `t`.

import { randomUUID } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

import { WebSocketServer } from 'ws';

import { newCode, Room } from './lobby.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp',
};

export const PROTOCOL = 1;

/**
 * Start a game server. `runRace(room, roster, io)` starts a race and returns
 * `{ input(playerId, msg), leave(playerId), stop() }`; io carries
 * `send(playerId, msg)`, `broadcast(msg)` and `done(results)`.
 * Resolves to `{ port, close() }` once listening.
 */
export function startServer({ port = 0, host = '0.0.0.0', staticDir, runRace }) {
  const root = resolve(staticDir);
  const rooms = new Map();          // code -> Room
  const races = new Map();          // code -> race handle
  const conns = new Map();          // id -> { ws, id, name, code }

  const http = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/api/kr') {
      // Readable from any origin: the GitHub Pages build probes a remote server.
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ kr: 'server', protocol: PROTOCOL, rooms: rooms.size }));
      return;
    }
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
    const r = room.join(c.id, c.name);
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
    create: c => { leaveRoom(c); const room = new Room(newCode(new Set(rooms.keys()))); rooms.set(room.code, room); enter(c, room); },
    join: (c, m) => { const room = rooms.get(String(m.code ?? '').toUpperCase().trim()); if (!room) return fail(c.id, 'Aucune salle avec ce code.'); if (c.code !== room.code) { leaveRoom(c); enter(c, room); } },
    set: (c, m) => { const room = rooms.get(c.code); if (!room) return; const e = room.set(c.id, { team: m.team, charId: m.charId, ready: m.ready }); if (e) fail(c.id, e); showRoom(room); },
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
