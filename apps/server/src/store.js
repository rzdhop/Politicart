// Where accounts live: users, login sessions and friendships.
//
// Two backends behind one async interface, picked by openStore():
//
//   DATABASE_URL set  -> Postgres (pg). For hosts whose disk does not survive
//                        a restart, such as Render's free plan: point it at
//                        any Postgres (a free Neon or Supabase database works).
//   otherwise         -> one JSON file (KR_DATA), rewritten atomically a
//                        moment after each change. Fine on a LAN, in Docker
//                        with a volume, or on Fly.io with a volume.
//   neither (tests)   -> the same as the file store, kept in memory only.
//
// The interface (every method async):
//   createUser({ name, hash })     -> user, or null if the name is taken
//   user(id) / userByName(name)    -> user or null (names compare case-blind)
//   addXp(id, xp)                  -> the updated user
//   createSession(userId)          -> a new random token
//   sessionUser(token)             -> user or null (sessions last 60 days)
//   dropSession(token)
//   links(id)                      -> [{ id, name, xp, status }] with status
//                                     'friend' | 'incoming' | 'outgoing'
//   requestFriend(from, to)        -> 'requested' | 'accepted' | 'already'
//   acceptFriend(me, other)        -> true if a request from `other` was accepted
//   removeFriend(me, other)        -> drops a friendship or a request, either way
//   close()
//
// A user is { id, name, hash, xp, created }. Passwords arrive here already
// hashed (accounts.js); this module never sees one.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SESSION_MS = 60 * 24 * 3600 * 1000;

/** The case- and accent-form-blind key two names are compared by. */
export const nameKey = name => String(name).normalize('NFKC').toLowerCase();
const newToken = () => randomBytes(32).toString('hex');

/** Open the store the environment asks for. */
export async function openStore({ databaseUrl, file } = {}) {
  if (databaseUrl) return openPgStore(databaseUrl);
  return openFileStore(file);
}

// ---------- JSON file (or memory) ----------

export function openFileStore(file) {
  let data = { users: {}, sessions: {}, links: [] };
  if (file) {
    try { data = { ...data, ...JSON.parse(readFileSync(file, 'utf8')) }; }
    catch (e) { if (e.code !== 'ENOENT') throw new Error('Cannot read the accounts file ' + file + ': ' + e.message); }
  }
  let timer = null;
  const flush = () => {
    timer = null; if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(data)); renameSync(tmp, file);
  };
  const save = () => { if (file && !timer) timer = setTimeout(flush, 200); };
  const byKey = key => Object.values(data.users).find(u => nameKey(u.name) === key) ?? null;
  const link = (a, b) => data.links.find(l => l.a === a && l.b === b) ?? null;

  return {
    kind: file ? 'file' : 'memory',
    async createUser({ name, hash }) {
      if (byKey(nameKey(name))) return null;
      const u = { id: randomUUID(), name, hash, xp: 0, created: Date.now() };
      data.users[u.id] = u; save(); return { ...u };
    },
    async user(id) { const u = data.users[id]; return u ? { ...u } : null; },
    async userByName(name) { const u = byKey(nameKey(name)); return u ? { ...u } : null; },
    async addXp(id, xp) { const u = data.users[id]; if (!u) return null; u.xp += Math.max(0, Math.floor(xp)); save(); return { ...u }; },
    async createSession(userId) { const t = newToken(); data.sessions[t] = { userId, at: Date.now() }; save(); return t; },
    async sessionUser(token) {
      const s = typeof token === 'string' ? data.sessions[token] : null;
      if (!s) return null;
      if (Date.now() - s.at > SESSION_MS) { delete data.sessions[token]; save(); return null; }
      return this.user(s.userId);
    },
    async dropSession(token) { if (typeof token === 'string' && data.sessions[token]) { delete data.sessions[token]; save(); } },
    async links(id) {
      const out = [];
      for (const l of data.links) {
        const other = l.a === id ? l.b : l.b === id ? l.a : null; if (!other) continue;
        const u = data.users[other]; if (!u) continue;
        out.push({ id: u.id, name: u.name, xp: u.xp, status: l.status === 'friend' ? 'friend' : l.a === id ? 'outgoing' : 'incoming' });
      }
      return out;
    },
    async requestFriend(from, to) {
      if (link(from, to) || (link(to, from) && link(to, from).status === 'friend')) return 'already';
      const back = link(to, from);
      if (back) { back.status = 'friend'; save(); return 'accepted'; }   // they had asked us: that is a yes
      data.links.push({ a: from, b: to, status: 'pending' }); save(); return 'requested';
    },
    async acceptFriend(me, other) {
      const l = link(other, me); if (!l || l.status !== 'pending') return false;
      l.status = 'friend'; save(); return true;
    },
    async removeFriend(me, other) {
      const n = data.links.length;
      data.links = data.links.filter(l => !((l.a === me && l.b === other) || (l.a === other && l.b === me)));
      if (data.links.length !== n) save();
    },
    async close() { if (timer) { clearTimeout(timer); flush(); } },
  };
}

// ---------- Postgres ----------

const SCHEMA = `
create table if not exists kr_users (
  id text primary key, name text not null, name_key text not null unique,
  hash text not null, xp integer not null default 0, created bigint not null);
create table if not exists kr_sessions (
  token text primary key, user_id text not null references kr_users(id) on delete cascade, created bigint not null);
create table if not exists kr_friends (
  a text not null references kr_users(id) on delete cascade, b text not null references kr_users(id) on delete cascade,
  status text not null, primary key (a, b));`;

const row = r => (r ? { id: r.id, name: r.name, hash: r.hash, xp: Number(r.xp), created: Number(r.created) } : null);

export async function openPgStore(databaseUrl, { Pool } = {}) {
  if (!Pool) ({ Pool } = (await import('pg')).default);
  // TLS follows the URL: hosted databases hand out URLs ending in ?sslmode=require.
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  await pool.query(SCHEMA);
  const q = (text, values) => pool.query(text, values);
  const one = async (text, values) => row((await q(text, values)).rows[0]);

  return {
    kind: 'postgres',
    async createUser({ name, hash }) {
      const r = await q('insert into kr_users (id, name, name_key, hash, xp, created) values ($1, $2, $3, $4, 0, $5) on conflict (name_key) do nothing returning *',
        [randomUUID(), name, nameKey(name), hash, Date.now()]);
      return row(r.rows[0]);
    },
    user: id => one('select * from kr_users where id = $1', [id]),
    userByName: name => one('select * from kr_users where name_key = $1', [nameKey(name)]),
    addXp: (id, xp) => one('update kr_users set xp = xp + $2 where id = $1 returning *', [id, Math.max(0, Math.floor(xp))]),
    async createSession(userId) { const t = newToken(); await q('insert into kr_sessions (token, user_id, created) values ($1, $2, $3)', [t, userId, Date.now()]); return t; },
    async sessionUser(token) {
      if (typeof token !== 'string') return null;
      return one('select u.* from kr_sessions s join kr_users u on u.id = s.user_id where s.token = $1 and s.created > $2', [token, Date.now() - SESSION_MS]);
    },
    async dropSession(token) { if (typeof token === 'string') await q('delete from kr_sessions where token = $1', [token]); },
    async links(id) {
      const r = await q(`select u.id, u.name, u.xp, f.status, f.a from kr_friends f join kr_users u on u.id = case when f.a = $1 then f.b else f.a end
                         where f.a = $1 or f.b = $1`, [id]);
      return r.rows.map(x => ({ id: x.id, name: x.name, xp: Number(x.xp), status: x.status === 'friend' ? 'friend' : x.a === id ? 'outgoing' : 'incoming' }));
    },
    async requestFriend(from, to) {
      const r = await q('select a, b, status from kr_friends where (a = $1 and b = $2) or (a = $2 and b = $1)', [from, to]);
      const mine = r.rows.find(x => x.a === from), back = r.rows.find(x => x.a === to);
      if (mine || back?.status === 'friend') return 'already';
      if (back) { await q('update kr_friends set status = $3 where a = $1 and b = $2', [to, from, 'friend']); return 'accepted'; }
      await q('insert into kr_friends (a, b, status) values ($1, $2, $3) on conflict do nothing', [from, to, 'pending']);
      return 'requested';
    },
    async acceptFriend(me, other) {
      const r = await q('update kr_friends set status = $3 where a = $1 and b = $2 and status = $4', [other, me, 'friend', 'pending']);
      return r.rowCount > 0;
    },
    async removeFriend(me, other) { await q('delete from kr_friends where (a = $1 and b = $2) or (a = $2 and b = $1)', [me, other]); },
    close: () => pool.end(),
  };
}
