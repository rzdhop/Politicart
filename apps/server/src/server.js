// The game server: the built game over HTTP, and rooms over a WebSocket, on
// one origin and one port (DEC-014).
//
//   GET /api/kr   -> {"kr":"server",...}  the client's "is the game server
//                    up?" probe; the Multijoueur button shows only when it
//                    answers. Open to every origin (CORS), so a static build
//                    elsewhere (GitHub Pages) can probe a remote server.
//   /api/register, /api/login, /api/logout, /api/me, /api/progress
//                 -> accounts (accounts.js), open to every origin
//   GET /api/roster, PUT /api/admin/roster
//                 -> the admin's cast (roster.js): public read, admin write
//   /api/admin/stats, /api/admin/users, /api/admin/live, /api/admin/users/ban,
//   /api/admin/users/unban, /api/admin/users/logout, /api/admin/rooms/close,
//   /api/admin/connections/kick
//                 -> the admin's dashboard (dashboard.js), admin only
//   GET /*        -> apps/game/dist, read-only, no directory escapes
//   WS  /ws       -> the lobby protocol below; races run in a worker
//
// Client -> server: hello {name, token?} | create | join {code} | set {team,
// charId, ready} | track {trackIdx} | start | leave | input {...} (during a
// race) | friends | friendAdd {name} | friendAccept {id} | friendRemove {id}
// | invite {id} | godJoin {code, style} (the admin enters a room as a god,
// DEC-030).
// Server -> client: welcome {id, profile} | room {room} | error {msg} |
// notice {msg} | race {...} | snap {...} | results {...} | profile {profile,
// gained} | friends {list} | invite {from: {id, name}, code}. Every message is
// one JSON object with a `t`.
//
// A connection that says hello with a valid session token is that account:
// its friends see it online, it can create rooms, invite friends into them,
// and earns experience from team races. Without a token it is a guest, who
// may only join a room (by code or by invitation) with the starters.
// Every player's kart style (their Garage edits) rides on create, join and
// set, is cleaned by the lobby, and reaches every client with the race grid.

import { randomUUID } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

import { WebSocketServer } from 'ws';

import { levelFromXp, xpForRace } from '../../game/src/engine/progress.js';
import { accountApi } from './accounts.js';
import { dashboardApi, recordRace, recordSolo } from './dashboard.js';
import { newCode, Room } from './lobby.js';
import { rosterApi } from './roster.js';
import { openFileStore } from './store.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp',
};

export const PROTOCOL = 1;

/**
 * Start a game server. `runRace(room, roster, io)` starts a race and returns
 * `{ input(playerId, msg), leave(playerId), stop() }`; io carries
 * `send(playerId, msg)`, `broadcast(msg)` and `done(results)`. `store` keeps
 * the accounts (store.js); without one they live in memory. `loginTries`
 * caps sign-ups and failed logins per address and minute (tests raise it).
 * `admin` is `{ user, hash }` (admin.js): run ensureAdmin() on the store
 * first; that name is reserved even without a hash.
 * Before listening it loads the admin's cast from the store and applies it to
 * CHARACTERS (roster.js), so lobbies and races name the AI as edited; an
 * invalid stored cast is logged and the default one used.
 * Resolves to `{ port, close() }` once listening.
 */
export function startServer({ port = 0, host = '0.0.0.0', staticDir, runRace, store = openFileStore(null), loginTries, admin }) {
  const root = resolve(staticDir);
  const rooms = new Map();          // code -> Room
  const races = new Map();          // code -> race handle
  const raceSince = new Map();      // code -> when its race started
  const conns = new Map();          // id -> { ws, id, name, code, user }
  const online = new Map();         // user id -> Set of connections

  const api = accountApi(store, { onProfile: user => updateProfile(user, 0), onSoloRace: () => recordSolo(store).catch(e => console.error('solo race not counted:', e)), tries: loginTries, admin });
  const cast = rosterApi(store, { requireAdmin: api.requireAdmin });
  // The dashboard's window on the live server: sockets and rooms, and the levers on them.
  const live = {
    connections: () => [...conns.values()].map(c => ({ id: c.id, name: c.name, userId: c.user?.id ?? null, guest: !c.user, admin: !!c.user && api.isAdmin(c.user), room: c.code })),
    rooms: () => [...rooms.values()].map(r => ({ ...r.view(), since: raceSince.get(r.code) ?? null })),
    kick: id => { const c = conns.get(id); if (!c) return false; send(id, { t: 'error', msg: 'Connexion fermée par l’administrateur.' }); c.ws.close(); return true; },
    closeRoom: code => { const room = rooms.get(code); if (!room) return false; for (const p of [...room.players]) { const c = conns.get(p.id); send(p.id, { t: 'error', msg: 'Salle fermée par l’administrateur.' }); if (c) leaveRoom(c); } races.get(code)?.stop(); races.delete(code); rooms.delete(code); return true; },
    disconnectUser: (userId, msg) => { for (const c of [...(online.get(userId) ?? [])]) { send(c.id, { t: 'error', msg }); c.ws.close(); } },
  };
  const dashboard = dashboardApi(store, { requireAdmin: api.requireAdmin, live });

  const http = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/api/kr') {
      // Readable from any origin: the GitHub Pages build probes a remote server.
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ kr: 'server', protocol: PROTOCOL, rooms: rooms.size, accounts: store.kind }));
      return;
    }
    if (url.pathname.startsWith('/api/') && (await api(req, res, url.pathname) || await cast(req, res, url.pathname) || await dashboard(req, res, url.pathname))) return;
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
  const notice = (id, msg) => send(id, { t: 'notice', msg });
  const toUser = (userId, msg) => { for (const c of online.get(userId) ?? []) send(c.id, msg); };

  // ---- presence and friends
  /** Where a user is, as their friends see it: the room code of one of their connections, if any. */
  const whereIs = userId => { for (const c of online.get(userId) ?? []) if (c.code) return c.code; return null; };

  /** Send `userId` their friend list: friends, requests both ways, who is online and in which room. */
  async function pushFriends(userId) {
    if (!online.has(userId)) return;
    const links = await store.links(userId);
    const list = links.map(l => ({ id: l.id, name: l.name, level: levelFromXp(l.xp).level, status: l.status, online: l.status === 'friend' && online.has(l.id), room: l.status === 'friend' ? whereIs(l.id) : null }));
    toUser(userId, { t: 'friends', list });
  }
  /** Refresh the lists of everyone linked to `userId` (they came online, went offline, changed room). */
  async function pushToFriendsOf(userId) {
    for (const l of await store.links(userId)) if (online.has(l.id)) await pushFriends(l.id);
  }

  /** Tie connection c to an account (or to none: a guest). */
  async function setUser(c, user) {
    const before = c.user?.id ?? null;
    if (before && before !== user?.id) { const set = online.get(before); set?.delete(c); if (set && !set.size) online.delete(before); await pushToFriendsOf(before); }
    c.user = user;
    if (user) {
      c.name = user.name;
      if (!online.has(user.id)) online.set(user.id, new Set());
      online.get(user.id).add(c);
      if (before !== user.id) { await pushFriends(user.id); await pushToFriendsOf(user.id); }
    }
  }

  /** An account's experience changed: tell its connections, and let it drive what it unlocked. */
  function updateProfile(user, gained) {
    const profile = api.profile(user);
    for (const c of online.get(user.id) ?? []) {
      c.user = user; send(c.id, { t: 'profile', profile, gained });
      const room = c.code && rooms.get(c.code); if (room) { room.setLevel(c.id, profile.level); showRoom(room); }
    }
  }

  // ---- rooms
  function leaveRoom(c) {
    const room = c.code && rooms.get(c.code); c.code = null;
    if (c.user) pushToFriendsOf(c.user.id).catch(console.error);
    if (!room) return;
    room.leave(c.id);
    races.get(room.code)?.leave(c.id);
    if (room.empty) { races.get(room.code)?.stop(); races.delete(room.code); rooms.delete(room.code); return; }
    showRoom(room);
  }

  function enter(c, room) {
    const r = room.join(c.id, c.name, c.user ? { userId: c.user.id, level: levelFromXp(c.user.xp).level } : {}, c.style);
    if (typeof r === 'string') return fail(c.id, r);
    c.code = room.code; showRoom(room);
    if (c.user) pushToFriendsOf(c.user.id).catch(console.error);
  }

  /** Award each account in the race its experience, once the results are out. A god earns none. */
  async function award(roster, results) {
    const first = results.teams?.[0];
    for (const r of results.ranking ?? []) {
      const playerId = roster[r.slot]?.playerId; const c = playerId && conns.get(playerId);
      if (!c || !c.user || r.isAI || roster[r.slot]?.god) continue;
      const gained = xpForRace({ rank: r.rank, field: results.ranking.length, finished: r.finished, teamWon: !!first && first.points > 0 && first.team === r.team });
      const after = await store.addXp(c.user.id, gained);
      if (after) updateProfile(after, gained);
    }
  }

  function start(c, room) {
    const why = room.cannotStart(c.id); if (why) return fail(c.id, why);
    room.phase = 'race';
    const roster = room.roster();
    const io = {
      send, broadcast: msg => toRoom(room, msg),
      done: results => {
        races.delete(room.code); raceSince.delete(room.code); room.endRace(); toRoom(room, { t: 'results', ...results }); showRoom(room);
        if (!results.error) award(roster, results).catch(e => console.error('experience not awarded:', e));
        recordRace(store, { room, roster, results }).catch(e => console.error('race not counted:', e));
      },
    };
    try { races.set(room.code, runRace(room, roster, io)); raceSince.set(room.code, Date.now()); }
    catch (e) { room.endRace(); fail(c.id, 'Impossible de lancer la course.'); console.error(e); }
    showRoom(room);
  }

  const handlers = {
    hello: async (c, m) => {
      const user = typeof m.token === 'string' && m.token ? await store.sessionUser(m.token) : null;
      if (!user) c.name = typeof m.name === 'string' ? m.name : c.name;
      else store.touchSeen(user.id).catch(console.error);
      await setUser(c, user);
      send(c.id, { t: 'welcome', id: c.id, protocol: PROTOCOL, profile: user ? api.profile(user) : null });
    },
    create: (c, m) => {
      if (!c.user) return fail(c.id, 'Connectez-vous pour créer une salle. Les invité·es peuvent en rejoindre une.');
      c.style = m.style; leaveRoom(c); const room = new Room(newCode(new Set(rooms.keys()))); rooms.set(room.code, room); enter(c, room);
    },
    join: (c, m) => { const room = rooms.get(String(m.code ?? '').toUpperCase().trim()); if (!room) return fail(c.id, 'Aucune salle avec ce code.'); c.style = m.style; if (c.code !== room.code) { leaveRoom(c); enter(c, room); } },
    // The admin enters a room as a god (DEC-030): outside the six, in any phase, on no team.
    godJoin: (c, m) => {
      if (!c.user || !api.isAdmin(c.user)) return fail(c.id, 'Réservé à l’administrateur.');
      const room = rooms.get(String(m.code ?? '').toUpperCase().trim()); if (!room) return fail(c.id, 'Aucune salle avec ce code.');
      c.style = m.style;
      if (c.code === room.code) return showRoom(room);
      leaveRoom(c);
      const r = room.joinGod(c.id, c.name, { userId: c.user.id, level: levelFromXp(c.user.xp).level }, c.style);
      if (typeof r === 'string') return fail(c.id, r);
      c.code = room.code; showRoom(room);
      for (const p of room.players) if (p.id !== c.id) notice(p.id, c.name + ' entre dans la salle en dieu' + (room.phase === 'race' ? ' et attend la prochaine course.' : '.'));
      pushToFriendsOf(c.user.id).catch(console.error);
    },
    set: (c, m) => { const room = rooms.get(c.code); if (!room) return; const e = room.set(c.id, { team: m.team, charId: m.charId, ready: m.ready, style: m.style }); if (e) fail(c.id, e); showRoom(room); },
    track: (c, m) => { const room = rooms.get(c.code); if (!room) return; const e = room.setTrack(c.id, m.trackIdx); if (e) fail(c.id, e); showRoom(room); },
    start: c => { const room = rooms.get(c.code); if (room) start(c, room); },
    leave: c => leaveRoom(c),
    input: (c, m) => { races.get(c.code)?.input(c.id, m); },

    // ---- friends (accounts only)
    friends: async c => { if (c.user) await pushFriends(c.user.id); },
    friendAdd: async (c, m) => {
      if (!c.user) return fail(c.id, 'Connectez-vous pour ajouter des ami·es.');
      const other = typeof m.name === 'string' ? await store.userByName(m.name.trim()) : null;
      if (!other) return fail(c.id, 'Aucun compte à ce nom.');
      if (other.id === c.user.id) return fail(c.id, 'Vous êtes déjà votre meilleur·e ami·e.');
      const r = await store.requestFriend(c.user.id, other.id);
      notice(c.id, r === 'accepted' ? 'Vous êtes maintenant ami·es avec ' + other.name + ' !' : r === 'already' ? other.name + ' est déjà dans votre liste.' : 'Demande envoyée à ' + other.name + '.');
      await pushFriends(c.user.id); await pushFriends(other.id);
    },
    friendAccept: async (c, m) => {
      if (!c.user || typeof m.id !== 'string') return;
      if (await store.acceptFriend(c.user.id, m.id)) { await pushFriends(c.user.id); await pushFriends(m.id); }
    },
    friendRemove: async (c, m) => {
      if (!c.user || typeof m.id !== 'string') return;
      await store.removeFriend(c.user.id, m.id); await pushFriends(c.user.id); await pushFriends(m.id);
    },
    invite: async (c, m) => {
      if (!c.user) return fail(c.id, 'Connectez-vous pour inviter des ami·es.');
      const room = c.code && rooms.get(c.code); if (!room) return fail(c.id, 'Créez ou rejoignez d’abord une salle.');
      const link = (await store.links(c.user.id)).find(l => l.id === m.id && l.status === 'friend');
      if (!link) return fail(c.id, 'Vous ne pouvez inviter que vos ami·es.');
      if (!online.has(link.id)) return fail(c.id, link.name + ' n’est pas en ligne.');
      toUser(link.id, { t: 'invite', from: { id: c.user.id, name: c.user.name }, code: room.code });
      notice(c.id, 'Invitation envoyée à ' + link.name + '.');
    },
  };

  wss.on('connection', ws => {
    const c = { ws, id: randomUUID(), name: '', code: null, alive: true, user: null, queue: Promise.resolve() };
    conns.set(c.id, c);
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      const h = m && typeof m.t === 'string' && Object.hasOwn(handlers, m.t) ? handlers[m.t] : null;
      // One message at a time per connection: hello may wait on the store, and what follows it must see its outcome.
      if (h) c.queue = c.queue.then(() => h(c, m)).catch(e => console.error('message ' + m.t + ' failed:', e));
    });
    ws.on('close', () => { leaveRoom(c); conns.delete(c.id); c.queue = c.queue.then(() => setUser(c, null)).catch(console.error); });
  });

  // Hosts behind proxies drop idle sockets; a ping every 15 s also reaps dead clients.
  const beat = setInterval(() => { for (const c of conns.values()) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; c.ws.ping(); } }, 15_000);
  beat.unref();

  return cast.load().then(() => new Promise((ok, ko) => {
    http.once('error', ko);
    http.listen(port, host, () => ok({
      port: http.address().port,
      rooms,
      live,
      close: () => new Promise(done => { clearInterval(beat); for (const r of races.values()) r.stop(); for (const c of conns.values()) c.ws.terminate(); wss.close(); http.close(() => done()); }),
    }));
  }));
}
