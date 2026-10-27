// The admin's dashboard: statistics, the accounts, what is live right now,
// and the levers to act on them (DEC-030).
//
// All over HTTP, every route for the admin's Bearer session only. The answer
// to anyone else is 401 with one sentence, so the routes say nothing about
// who is admin. CORS is open like the rest of the API: the admin uses the
// dashboard from the GitHub Pages build too.
//
//   GET  /api/admin/stats              -> { accounts, live, races, top }
//   GET  /api/admin/users?q=<text>     -> { users: [...] }   newest first, 200 at most
//   GET  /api/admin/live               -> { connections, rooms }
//   POST /api/admin/users/ban          {id, reason?}  -> { user }  closes the account's sessions and sockets
//   POST /api/admin/users/unban        {id}           -> { user }
//   POST /api/admin/users/logout       {id}           -> {}  closes the account's sessions and sockets, no ban
//   POST /api/admin/rooms/close        {code}         -> {}  ends the race if one runs, empties the room
//   POST /api/admin/connections/kick   {id}           -> {}  closes one socket
//
// The race counters live in the store's 'stats' document, written once per
// race from recordRace() and recordSolo(); everything else is computed on
// request from the store and from `live`, the server's view of its sockets
// and rooms (server.js hands it in):
//
//   live.connections()  -> [{ id, name, userId, guest, admin, room }]
//   live.rooms()        -> [{ code, host, phase, trackIdx, since, players: [...] }]
//   live.kick(connId)   -> closes that socket
//   live.closeRoom(code)
//   live.disconnectUser(userId, msg)  -> closes every socket of that account

import { levelFromXp } from '../../game/src/engine/progress.js';
import { nameKey } from './store.js';
import { readJsonBody } from './body.js';

/** The store document the race counters live in. */
export const DOC = 'stats';
/** How many finished races the dashboard remembers in detail. */
export const RECENT_MAX = 20;
const USERS_MAX = 200;
const BODY_MAX = 4096;
const DAY_MS = 24 * 3600 * 1000;

export const emptyStats = () => ({ races: 0, finished: 0, solo: 0, byTrack: {}, recent: [] });

const clean = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120) : '');

/** A stored stats document, repaired field by field: an old or damaged one never breaks the dashboard. */
function normaliseStats(s) {
  const out = emptyStats();
  if (!s || typeof s !== 'object') return out;
  for (const k of ['races', 'finished', 'solo']) if (Number.isInteger(s[k]) && s[k] >= 0) out[k] = s[k];
  if (s.byTrack && typeof s.byTrack === 'object') for (const [k, v] of Object.entries(s.byTrack)) if (Number.isInteger(v)) out.byTrack[k] = v;
  if (Array.isArray(s.recent)) out.recent = s.recent.filter(r => r && typeof r === 'object').slice(0, RECENT_MAX);
  return out;
}

/** Note a finished team race: which circuit, how many humans, who won. `results` is what the race worker reported. */
export async function recordRace(store, { room, roster, results }) {
  const s = normaliseStats(await store.getDoc(DOC));
  s.races++;
  if (!results.error) s.finished++;
  s.byTrack[room.trackIdx] = (s.byTrack[room.trackIdx] ?? 0) + 1;
  const winner = results.ranking?.[0];
  s.recent.unshift({
    at: Date.now(), code: room.code, trackIdx: room.trackIdx,
    humans: roster.filter(r => !r.isAI && !r.god).length, gods: roster.filter(r => r.god).length,
    winner: winner ? winner.name : null, teams: (results.teams ?? []).map(t => ({ team: t.team, points: t.points })),
  });
  s.recent = s.recent.slice(0, RECENT_MAX);
  await store.putDoc(DOC, s);
}

/** Count a solo race an account reported. */
export async function recordSolo(store) {
  const s = normaliseStats(await store.getDoc(DOC));
  s.solo++;
  await store.putDoc(DOC, s);
}

/**
 * The dashboard routes on `store`. `requireAdmin(req)` resolves to the admin's
 * user for an admin session, else null (accounts.js); `live` is described
 * above. Returns `handle(req, res, path)`, which answers and returns true for
 * the routes above, false for any other path.
 */
export function dashboardApi(store, { requireAdmin, live, log = console }) {
  const reply = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', ...headers });
    res.end(JSON.stringify(body));
  };

  /** A user as the dashboard lists it: level, presence and room added, never the hash. */
  const describe = (u, conns) => {
    const mine = conns.filter(c => c.userId === u.id);
    return { id: u.id, name: u.name, xp: u.xp, level: levelFromXp(u.xp).level, created: u.created, seen: u.seen ?? null, banned: u.banned ?? null, online: mine.length > 0, room: mine.find(c => c.room)?.room ?? null };
  };

  const body = async req => { const b = await readJsonBody(req, BODY_MAX); return b.ok && b.value && typeof b.value === 'object' ? b.value : null; };
  const id = v => (typeof v === 'string' && v.length <= 64 ? v : null);

  const routes = {
    'GET /api/admin/stats': async (_req, res) => {
      const [users, stats] = await Promise.all([store.listUsers({ limit: 100_000 }), store.getDoc(DOC)]);
      const conns = live.connections(), rooms = live.rooms(); const now = Date.now();
      const onlineIds = new Set(conns.map(c => c.userId).filter(Boolean));
      reply(res, 200, {
        accounts: { total: users.length, banned: users.filter(u => u.banned).length, new7d: users.filter(u => now - u.created < 7 * DAY_MS).length, online: onlineIds.size },
        live: { connections: conns.length, guests: conns.filter(c => c.guest).length, rooms: rooms.length, races: rooms.filter(r => r.phase === 'race').length },
        races: normaliseStats(stats),
        top: [...users].sort((a, b) => b.xp - a.xp).slice(0, 10).map(u => ({ id: u.id, name: u.name, xp: u.xp, level: levelFromXp(u.xp).level })),
      });
    },
    'GET /api/admin/users': async (req, res, url) => {
      const q = nameKey(url.searchParams.get('q') ?? '').trim();
      const users = (await store.listUsers({ limit: 100_000 })).filter(u => !q || nameKey(u.name).includes(q)).slice(0, USERS_MAX);
      const conns = live.connections();
      reply(res, 200, { users: users.map(u => describe(u, conns)) });
    },
    'GET /api/admin/live': (_req, res) => reply(res, 200, { connections: live.connections(), rooms: live.rooms() }),
    'POST /api/admin/users/ban': async (req, res, _url, admin) => {
      const b = await body(req); const uid = b && id(b.id); if (!uid) return reply(res, 400, { error: 'Compte manquant.' });
      if (uid === admin.id) return reply(res, 409, { error: 'L’administrateur ne peut pas se bannir lui-même.' });
      const user = await store.setBanned(uid, clean(b.reason) || 'Banni par l’administrateur');
      if (!user) return reply(res, 404, { error: 'Aucun compte avec cet identifiant.' });
      live.disconnectUser(uid, 'Compte banni' + (user.banned?.reason ? ' : ' + user.banned.reason : '') + '.');
      reply(res, 200, { user: describe(user, live.connections()) });
    },
    'POST /api/admin/users/unban': async (req, res) => {
      const b = await body(req); const uid = b && id(b.id); if (!uid) return reply(res, 400, { error: 'Compte manquant.' });
      const user = await store.setBanned(uid, null);
      if (!user) return reply(res, 404, { error: 'Aucun compte avec cet identifiant.' });
      reply(res, 200, { user: describe(user, live.connections()) });
    },
    'POST /api/admin/users/logout': async (req, res, _url, admin) => {
      const b = await body(req); const uid = b && id(b.id); if (!uid) return reply(res, 400, { error: 'Compte manquant.' });
      if (uid === admin.id) return reply(res, 409, { error: 'Déconnectez-vous depuis Compte.' });
      await store.dropSessionsOf(uid);
      live.disconnectUser(uid, 'Session fermée par l’administrateur.');
      reply(res, 200, {});
    },
    'POST /api/admin/rooms/close': async (req, res) => {
      const b = await body(req); const code = b && typeof b.code === 'string' ? b.code.toUpperCase().trim() : '';
      if (!live.closeRoom(code)) return reply(res, 404, { error: 'Aucune salle avec ce code.' });
      reply(res, 200, {});
    },
    'POST /api/admin/connections/kick': async (req, res) => {
      const b = await body(req); const cid = b && id(b.id); if (!cid) return reply(res, 400, { error: 'Connexion manquante.' });
      if (!live.kick(cid)) return reply(res, 404, { error: 'Connexion inconnue.' });
      reply(res, 200, {});
    },
  };

  async function handle(req, res, path) {
    const route = routes[req.method + ' ' + path]; if (!route) return false;
    try {
      const admin = await requireAdmin(req);
      if (!admin) { reply(res, 401, { error: 'Réservé à l’administrateur : connectez-vous avec son compte.' }, { connection: 'close' }); return true; }
      await route(req, res, new URL(req.url ?? '/', 'http://x'), admin);
    } catch (e) { log.error('dashboard API failed:', e); if (!res.headersSent) reply(res, 500, { error: 'Erreur du serveur.' }); }
    return true;
  }
  return handle;
}
