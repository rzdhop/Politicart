// The game server: the built game over HTTP, and rooms over a WebSocket, on
// one origin and one port (DEC-014).
//
//   GET /api/kr   -> {"kr":"server",...}  the client's "is the game server
//                    up?" probe; the Multijoueur button shows only when it
//                    answers. Open to every origin (CORS), so a static build
//                    elsewhere (GitHub Pages) can probe a remote server.
//   /api/register, /api/login, /api/logout, /api/me, /api/progress
//                 -> accounts (accounts.js), open to every origin
//   /api/shop/char, /api/shop/part, /api/box/open, /api/stats/friends
//                 -> the politicoins economy (economy.js), the account's own
//   GET /api/roster, PUT /api/admin/roster
//                 -> the admin's cast (roster.js): public read, admin write
//   /api/admin/stats, /api/admin/users, /api/admin/live, /api/admin/users/ban,
//   /api/admin/users/unban, /api/admin/users/logout, /api/admin/rooms/close,
//   /api/admin/connections/kick, /api/admin/coins
//                 -> the admin's dashboard (dashboard.js), admin only
//   GET /*        -> apps/game/dist, read-only, no directory escapes
//   WS  /ws       -> the lobby protocol below; races run in a worker
//
// Client -> server: hello {name, token?} | create | join {code} | set {team,
// charId, ready} | track {trackIdx} | start | leave | input {...} (during a
// race) | friends | friendAdd {name} | friendAccept {id} | friendRemove {id}
// | invite {id} | godJoin {code, style} (the admin enters a room as a god,
// DEC-030, mid-race included) | god {code?, cmd} (the admin changes any room
// at will, DEC-031: lobby commands here, race commands in the worker).
// Server -> client: welcome {id, profile} | room {room} | error {msg} |
// notice {msg} | race {...} | snap {...} | results {...} | profile {profile,
// gained, coins, bonus} | friends {list} | invite {from: {id, name}, code}.
// Every message is one JSON object with a `t`.
//
// A connection that says hello with a valid session token is that account:
// its friends see it online, it can create rooms, invite friends into them,
// and earns experience, politicoins and stats from team races (economy.js
// settleRace). Without a token it is a guest, who may only join a room (by
// code or by invitation) with the starters.
// Every player's kart style (their Garage edits) rides on create, join and
// set, is cleaned by the lobby and stripped of what the account does not own
// (DEC-035; a guest owns the commons only), and reaches every client with
// the race grid.

import { randomUUID } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

import { WebSocketServer } from 'ws';

import { emptyOwned } from '../../game/src/engine/catalog.js';
import { TRACKS } from '../../game/src/engine/data.js';
import { levelFromXp } from '../../game/src/engine/progress.js';
import { accountApi } from './accounts.js';
import { dashboardApi, recordRace, recordSolo } from './dashboard.js';
import { economyApi, settleRace } from './economy.js';
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
 * `rng` draws the Politibox and `now` is the clock of race rewards (the daily
 * bonus); tests inject both.
 * Resolves to `{ port, close() }` once listening.
 */
export function startServer({ port = 0, host = '0.0.0.0', staticDir, runRace, store = openFileStore(null), loginTries, admin, rng = Math.random, now = Date.now }) {
  const root = resolve(staticDir);
  const rooms = new Map();          // code -> Room
  const races = new Map();          // code -> race handle
  const raceSince = new Map();      // code -> when its race started
  const conns = new Map();          // id -> { ws, id, name, code, user }
  const online = new Map();         // user id -> Set of connections

  // A change of balance or inventory outside a race (a solo report, a purchase, a box, an admin grant): no gain to show.
  const tellProfile = user => { updateProfile(user).catch(e => console.error('profile not pushed:', e)); };
  const api = accountApi(store, { onProfile: tellProfile, onSoloRace: () => recordSolo(store).catch(e => console.error('solo race not counted:', e)), tries: loginTries, admin, now });
  const economy = economyApi(store, { profile: api.profile, onProfile: tellProfile, isAdmin: api.isAdmin, rng, now });
  const cast = rosterApi(store, { requireAdmin: api.requireAdmin });
  // The dashboard's window on the live server: sockets and rooms, and the levers on them.
  const live = {
    connections: () => [...conns.values()].map(c => ({ id: c.id, name: c.name, userId: c.user?.id ?? null, guest: !c.user, admin: !!c.user && api.isAdmin(c.user), room: c.code })),
    rooms: () => [...rooms.values()].map(r => ({ ...r.view(), since: raceSince.get(r.code) ?? null, race: raceGrid(r.code) })),
    kick: id => { const c = conns.get(id); if (!c) return false; send(id, { t: 'error', msg: 'Connexion fermée par l’administrateur.' }); c.ws.close(); return true; },
    closeRoom: code => { const room = rooms.get(code); if (!room) return false; for (const p of [...room.players]) { const c = conns.get(p.id); send(p.id, { t: 'error', msg: 'Salle fermée par l’administrateur.' }); if (c) leaveRoom(c); } races.get(code)?.stop(); races.delete(code); rooms.delete(code); return true; },
    disconnectUser: (userId, msg) => { for (const c of [...(online.get(userId) ?? [])]) { send(c.id, { t: 'error', msg }); c.ws.close(); } },
    command: (code, cmd) => godCommand(code, cmd, null),
  };
  // A race in progress is listed with its grid, so the dashboard can name its karts.
  const raceGrid = code => races.get(code)?.grid?.map((g, slot) => ({ slot, name: g.name, charId: g.charId, isAI: g.isAI, god: g.god === true })) ?? null;
  const isAdminConn = c => !!c?.user && api.isAdmin(c.user);
  const dashboard = dashboardApi(store, { requireAdmin: api.requireAdmin, live, onProfile: tellProfile });

  const http = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/api/kr') {
      // Readable from any origin: the GitHub Pages build probes a remote server.
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ kr: 'server', protocol: PROTOCOL, rooms: rooms.size, accounts: store.kind }));
      return;
    }
    if (url.pathname.startsWith('/api/') && (await api(req, res, url.pathname) || await economy(req, res, url.pathname) || await cast(req, res, url.pathname) || await dashboard(req, res, url.pathname))) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let rel; try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    let st; try { st = statSync(file); } catch { st = null; }
    if (!st || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(rel === '/index.html' ? 'The game is not built yet: run `npm run build -w @politikart/game`.' : 'Not found');
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

  /**
   * An account changed (experience, coins, inventory, stats): tell its
   * connections what it gained, if anything, and let it drive and wear what it
   * owns now. `gained` stays the experience, a number, as before the economy.
   */
  async function updateProfile(user, gain = null) {
    const profile = await api.profile(user);
    const msg = { t: 'profile', profile, gained: gain?.xp ?? 0, coins: gain?.coins ?? 0, bonus: { daily: !!gain?.daily, levelUp: !!gain?.levelUp, levelUpCoins: gain?.levelUpCoins ?? 0 } };
    for (const c of online.get(user.id) ?? []) {
      c.user = user; send(c.id, msg);
      const room = c.code && rooms.get(c.code); if (room) { room.setProfile(c.id, { level: profile.level, owned: profile.owned }); showRoom(room); }
    }
  }
  /** Who a connection is for the lobby: its account, level and inventory, or a guest who owns the commons. */
  const whoOf = async c => (c.user ? { userId: c.user.id, level: levelFromXp(c.user.xp).level, owned: await api.ownedOf(c.user) } : { owned: emptyOwned() });

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

  /** Seat c in room; `who` is whoOf(c), read before anything changed so nothing awaits in between. */
  function enter(c, room, who) {
    const r = room.join(c.id, c.name, who, c.style);
    if (typeof r === 'string') return fail(c.id, r);
    c.code = room.code; showRoom(room);
    if (c.user) pushToFriendsOf(c.user.id).catch(console.error);
  }

  /**
   * Pay each account in the race (experience, politicoins, stats: economy.js
   * settleRace), once the results are out. A god earns nothing. `trackIdx`
   * is the circuit the race ran on.
   */
  async function award(roster, results, trackIdx) {
    const first = results.teams?.[0];
    const trackId = TRACKS[trackIdx]?.id ?? null;
    for (const r of results.ranking ?? []) {
      const slot = roster[r.slot]; const c = slot?.playerId && conns.get(slot.playerId);
      if (!c || !c.user || r.isAI || r.god || slot.god) continue;
      const settled = await settleRace(store, c.user, {
        rank: r.rank, field: results.ranking.length, finished: r.finished, teamWon: !!first && first.points > 0 && first.team === r.team,
        trackId, bestLap: r.bestLap, time: r.time, charId: slot.charId, solo: false,
      }, { now: now() });
      if (settled) await updateProfile(settled.after, settled.gain);
    }
  }

  /** Start the room's race. `force` (the admin) skips the host and readiness checks. */
  function start(c, room, force = false) {
    if (force) { if (room.phase !== 'lobby') return c && fail(c.id, 'La course a déjà commencé.'); }
    else { const why = room.cannotStart(c.id); if (why) return fail(c.id, why); }
    room.phase = 'race';
    const roster = room.roster(), trackIdx = room.trackIdx;
    const io = {
      send, broadcast: msg => toRoom(room, msg),
      done: results => {
        races.delete(room.code); raceSince.delete(room.code); room.endRace(); toRoom(room, { t: 'results', ...results }); showRoom(room);
        if (!results.error) award(roster, results, trackIdx).catch(e => console.error('race not paid:', e));
        recordRace(store, { room, roster, results }).catch(e => console.error('race not counted:', e));
      },
    };
    try { races.set(room.code, runRace(room, roster, io)); raceSince.set(room.code, Date.now()); }
    catch (e) { room.endRace(); if (c) fail(c.id, 'Impossible de lancer la course.'); console.error(e); }
    showRoom(room);
  }

  /** Seat the admin's connection `c`, already a god in `room`, in the race running there, if one is. */
  function enterRace(c, room) {
    const race = races.get(room.code); const p = room.player(c.id);
    if (race?.addGod && p) race.addGod(c.id, { charId: p.charId, name: p.name, style: p.style });
  }

  /**
   * The admin's absolute power over room `code` (DEC-031). Lobby commands run
   * here: start (forced), track, kick, team, char. Every other command goes
   * to the room's race (godcmd.js), as `actor`'s kart when the admin drives
   * one. Resolves to { ok, text }. The caller has checked it is the admin.
   */
  async function godCommand(code, cmd, actor) {
    const room = rooms.get(String(code ?? '').toUpperCase().trim());
    if (!room) return { ok: false, text: 'Aucune salle avec ce code.' };
    if (!cmd || typeof cmd !== 'object' || typeof cmd.cmd !== 'string') return { ok: false, text: 'Commande inconnue.' };
    const done = (e, text) => { if (e) return { ok: false, text: e }; showRoom(room); return { ok: true, text }; };
    switch (cmd.cmd) {
      case 'start':
        if (room.phase !== 'lobby') return { ok: false, text: 'La course a déjà commencé.' };
        start(null, room, true);
        return races.has(room.code) ? { ok: true, text: 'Course lancée.' } : { ok: false, text: 'Impossible de lancer la course.' };
      case 'track': return done(room.forceTrack(cmd.trackIdx), 'Circuit changé.');
      case 'team': return done(room.force(cmd.id, { team: cmd.team }), 'Équipe changée.');
      case 'char': return done(room.force(cmd.id, { charId: cmd.charId }), 'Candidat changé.');
      case 'kick': {
        const p = typeof cmd.id === 'string' ? room.player(cmd.id) : null; const victim = p && conns.get(p.id);
        if (!p) return { ok: false, text: 'Joueur inconnu.' };
        // the empty room first: a room message clears the client's error line, which then says why
        if (victim) { leaveRoom(victim); send(victim.id, { t: 'room', room: null }); send(victim.id, { t: 'error', msg: 'Exclu·e de la salle par l’administrateur.' }); }
        else { room.leave(p.id); races.get(room.code)?.leave(p.id); showRoom(room); }
        return { ok: true, text: p.name + ' est exclu·e.' };
      }
    }
    const race = races.get(room.code);
    if (!race?.god) return { ok: false, text: 'Aucune course en cours dans cette salle.' };
    return race.god(cmd, actor?.id);
  }

  const handlers = {
    hello: async (c, m) => {
      const user = typeof m.token === 'string' && m.token ? await store.sessionUser(m.token) : null;
      if (!user) c.name = typeof m.name === 'string' ? m.name : c.name;
      else store.touchSeen(user.id).catch(console.error);
      await setUser(c, user);
      send(c.id, { t: 'welcome', id: c.id, protocol: PROTOCOL, profile: user ? await api.profile(user) : null });
    },
    create: async (c, m) => {
      if (!c.user) return fail(c.id, 'Connectez-vous pour créer une salle. Les invité·es peuvent en rejoindre une.');
      const who = await whoOf(c);
      c.style = m.style; leaveRoom(c); const room = new Room(newCode(new Set(rooms.keys()))); rooms.set(room.code, room); enter(c, room, who);
    },
    join: async (c, m) => {
      const who = await whoOf(c);
      const room = rooms.get(String(m.code ?? '').toUpperCase().trim()); if (!room) return fail(c.id, 'Aucune salle avec ce code.');
      c.style = m.style; if (c.code !== room.code) { leaveRoom(c); enter(c, room, who); }
    },
    // The admin enters a room as a god (DEC-030): outside the six, in any phase, on no team; mid-race, straight into the race (DEC-031).
    godJoin: async (c, m) => {
      if (!isAdminConn(c)) return fail(c.id, 'Réservé à l’administrateur.');
      const who = await whoOf(c);
      const room = rooms.get(String(m.code ?? '').toUpperCase().trim()); if (!room) return fail(c.id, 'Aucune salle avec ce code.');
      c.style = m.style;
      if (c.code === room.code) { showRoom(room); return enterRace(c, room); }
      leaveRoom(c);
      const avoid = races.get(room.code)?.grid?.map(g => g.charId) ?? [];
      const r = room.joinGod(c.id, c.name, who, c.style, avoid);
      if (typeof r === 'string') return fail(c.id, r);
      c.code = room.code; showRoom(room);
      const racing = room.phase === 'race';
      for (const p of room.players) if (p.id !== c.id) notice(p.id, c.name + (racing ? ' entre dans la course en dieu.' : ' entre dans la salle en dieu.'));
      enterRace(c, room);
      pushToFriendsOf(c.user.id).catch(console.error);
    },
    // The admin changes any room at will (DEC-031): its own room by default, any other by code.
    god: async (c, m) => {
      if (!isAdminConn(c)) return fail(c.id, 'Réservé à l’administrateur.');
      const r = await godCommand(m.code ?? c.code, m.cmd, c);
      (r.ok ? notice : fail)(c.id, r.text);
    },
    // the style is filtered by what the player owns, as the lobby last heard it (join, or a profile change since)
    set: (c, m) => { const room = rooms.get(c.code); if (!room) return; const e = room.set(c.id, { team: m.team, charId: m.charId, ready: m.ready, style: m.style }); if (e) fail(c.id, e); showRoom(room); },
    // the admin picks the circuit and starts, host or not, ready or not (DEC-031)
    track: (c, m) => { const room = rooms.get(c.code); if (!room) return; const e = isAdminConn(c) ? room.forceTrack(m.trackIdx) : room.setTrack(c.id, m.trackIdx); if (e) fail(c.id, e); showRoom(room); },
    start: c => { const room = rooms.get(c.code); if (room) start(c, room, isAdminConn(c)); },
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
