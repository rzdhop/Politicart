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
//   setHash(id, hash)              -> the updated user, or null; also closes
//                                     every session of that user
//   listUsers({ limit })           -> every account, newest first, without
//                                     hashes: { id, name, xp, created, seen, banned }
//   setBanned(id, reason | null)   -> the updated user, or null. A reason bans
//                                     (banned = { at, reason }) and closes every
//                                     session of that user; null lifts the ban
//   touchSeen(id)                  -> notes that the account was just seen
//   createSession(userId)          -> a new random token
//   sessionUser(token)             -> user or null (sessions last 60 days; a
//                                     banned account has no valid session)
//   dropSession(token)
//   dropSessionsOf(userId)         -> closes every session of that user
//   links(id)                      -> [{ id, name, xp, status }] with status
//                                     'friend' | 'incoming' | 'outgoing'
//   requestFriend(from, to)        -> 'requested' | 'accepted' | 'already'
//   acceptFriend(me, other)        -> true if a request from `other` was accepted
//   removeFriend(me, other)        -> drops a friendship or a request, either way
//   getDoc(key)                    -> a stored JSON document, or null
//   putDoc(key, value)             -> stores it, replacing the previous one;
//                                     resolves once it is durable
//   close()
//
// Documents are whole JSON values under a fixed set of keys (DOC_KEYS; any
// other key throws), for data the server keeps besides accounts: the admin's
// cast (roster.js) and the race counters of the admin's dashboard
// (dashboard.js). The file store keeps each in its own file next to the
// accounts file, <dir of KR_DATA>/kr-docs/<key>.json, written atomically: the
// cast can weigh megabytes and must not ride along every account rewrite.
// Postgres keeps them in kr_docs.
//
// A user is { id, name, hash, xp, created, seen, banned }: `seen` is when the
// account last logged in or said hello (null until it does), `banned` is null
// or { at, reason } once the admin bans it (dashboard.js). Passwords arrive
// here already hashed (accounts.js); this module never sees one.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SESSION_MS = 60 * 24 * 3600 * 1000;

/** The case- and accent-form-blind key two names are compared by. */
export const nameKey = name => String(name).normalize('NFKC').toLowerCase();
const newToken = () => randomBytes(32).toString('hex');

/** The only document keys a store accepts; they become file names, so never user input. */
export const DOC_KEYS = Object.freeze(['roster', 'stats']);
const docKey = key => { if (!DOC_KEYS.includes(key)) throw new TypeError('Unknown document key: ' + String(key)); return key; };

/** Open the store the environment asks for. */
export async function openStore({ databaseUrl, file } = {}) {
  if (databaseUrl) return openPgStore(databaseUrl);
  return openFileStore(file);
}

// ---------- JSON file (or memory) ----------

export function openFileStore(file, { log = console } = {}) {
  let data = { users: {}, sessions: {}, links: [] };
  if (file) {
    try { data = { ...data, ...JSON.parse(readFileSync(file, 'utf8')) }; }
    catch (e) { if (e.code !== 'ENOENT') throw new Error('Cannot read the accounts file ' + file + ': ' + e.message); }
  }
  const docs = openDocFiles(file ? join(dirname(file), 'kr-docs') : null, log);
  let timer = null;
  const flush = () => {
    timer = null; if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(data)); renameSync(tmp, file);
  };
  const save = () => { if (file && !timer) timer = setTimeout(flush, 200); };
  const byKey = key => Object.values(data.users).find(u => nameKey(u.name) === key) ?? null;
  const link = (a, b) => data.links.find(l => l.a === a && l.b === b) ?? null;
  // Older files have neither field; read them as "never seen, not banned".
  const full = u => ({ ...u, seen: u.seen ?? null, banned: u.banned ?? null });
  const closeSessions = id => { for (const [t, sess] of Object.entries(data.sessions)) if (sess.userId === id) delete data.sessions[t]; };

  return {
    kind: file ? 'file' : 'memory',
    async createUser({ name, hash }) {
      if (byKey(nameKey(name))) return null;
      const u = { id: randomUUID(), name, hash, xp: 0, created: Date.now(), seen: null, banned: null };
      data.users[u.id] = u; save(); return { ...u };
    },
    async user(id) { const u = data.users[id]; return u ? full(u) : null; },
    async userByName(name) { const u = byKey(nameKey(name)); return u ? full(u) : null; },
    async addXp(id, xp) { const u = data.users[id]; if (!u) return null; u.xp += Math.max(0, Math.floor(xp)); save(); return full(u); },
    async setHash(id, hash) {
      const u = data.users[id]; if (!u) return null;
      closeSessions(id);
      u.hash = hash; save(); return full(u);
    },
    async listUsers({ limit = 500 } = {}) {
      return Object.values(data.users).reverse().sort((a, b) => b.created - a.created).slice(0, limit)   // reversed first: two accounts of the same millisecond list newest first too
        .map(u => ({ id: u.id, name: u.name, xp: u.xp, created: u.created, seen: u.seen ?? null, banned: u.banned ?? null }));
    },
    async setBanned(id, reason) {
      const u = data.users[id]; if (!u) return null;
      if (reason == null) u.banned = null;
      else { u.banned = { at: Date.now(), reason: String(reason) }; closeSessions(id); }
      save(); return full(u);
    },
    async touchSeen(id) { const u = data.users[id]; if (!u) return null; u.seen = Date.now(); save(); return full(u); },
    async createSession(userId) { const t = newToken(); data.sessions[t] = { userId, at: Date.now() }; save(); return t; },
    async sessionUser(token) {
      const s = typeof token === 'string' ? data.sessions[token] : null;
      if (!s) return null;
      if (Date.now() - s.at > SESSION_MS) { delete data.sessions[token]; save(); return null; }
      const u = await this.user(s.userId);
      return u && !u.banned ? u : null;
    },
    async dropSession(token) { if (typeof token === 'string' && data.sessions[token]) { delete data.sessions[token]; save(); } },
    async dropSessionsOf(userId) { closeSessions(userId); save(); },
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
    getDoc: docs.get,
    putDoc: docs.put,
    async close() { if (timer) { clearTimeout(timer); flush(); } await docs.idle(); },
  };
}

/**
 * Documents as one file each in `dir` (or in memory without one), all read
 * once now. Each is kept as its JSON text, so a caller never shares an object
 * with the store. A write goes to a fresh temp file, synced, then renamed over
 * the old one: a crash leaves the old document or the new one, never half.
 * Writes run one at a time. A file that is not JSON is logged and ignored
 * (the next put replaces it); temp files a crash left behind are removed.
 */
function openDocFiles(dir, log) {
  const text = new Map();             // key -> JSON text
  if (dir) {
    let names = [];
    try { names = readdirSync(dir); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    for (const name of names) if (name.endsWith('.tmp')) { try { unlinkSync(join(dir, name)); } catch { /* gone already */ } }
    for (const key of DOC_KEYS) {
      let raw;
      try { raw = readFileSync(join(dir, key + '.json'), 'utf8'); }
      catch (e) { if (e.code === 'ENOENT') continue; throw new Error('Cannot read the document ' + join(dir, key + '.json') + ': ' + e.message); }
      try { JSON.parse(raw); text.set(key, raw); }
      catch (e) { log.warn(`store: ${join(dir, key + '.json')} is not JSON (${e.message}); ignored until it is saved again`); }
    }
  }
  let queue = Promise.resolve();

  async function write(key, json) {
    mkdirSync(dir, { recursive: true });
    const target = join(dir, key + '.json');
    const tmp = join(dir, `${key}.json.${randomBytes(6).toString('hex')}.tmp`);
    try {
      const fh = await open(tmp, 'wx', 0o600);
      try { await fh.writeFile(json, 'utf8'); await fh.sync(); } finally { await fh.close(); }
      await rename(tmp, target);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      throw e;
    }
  }

  return {
    async get(key) { const raw = text.get(docKey(key)); return raw === undefined ? null : JSON.parse(raw); },
    put(key, value) {
      let json;
      try { docKey(key); json = JSON.stringify(value); } catch (e) { return Promise.reject(e); }
      if (json === undefined) return Promise.reject(new TypeError('A document must be a JSON value'));
      const p = queue.then(async () => { if (dir) await write(key, json); text.set(key, json); });
      queue = p.catch(() => {});      // one failed write does not block the next
      return p;
    },
    idle: () => queue,
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
  status text not null, primary key (a, b));
create table if not exists kr_docs (key text primary key, value jsonb not null, updated bigint not null);
alter table kr_users add column if not exists seen bigint;
alter table kr_users add column if not exists banned jsonb;`;

const row = r => (r ? { id: r.id, name: r.name, hash: r.hash, xp: Number(r.xp), created: Number(r.created), seen: r.seen == null ? null : Number(r.seen), banned: r.banned ?? null } : null);

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
    async setHash(id, hash) {
      // Sessions first: if the update then fails, the next boot retries both,
      // and no session opened under the old password survives a reset.
      await q('delete from kr_sessions where user_id = $1', [id]);
      return one('update kr_users set hash = $2 where id = $1 returning *', [id, hash]);
    },
    async listUsers({ limit = 500 } = {}) {
      const r = await q('select id, name, xp, created, seen, banned from kr_users order by created desc limit $1', [limit]);
      return r.rows.map(x => { const { hash: _hash, ...u } = row(x); return u; });
    },
    async setBanned(id, reason) {
      if (reason == null) return one('update kr_users set banned = null where id = $1 returning *', [id]);
      await q('delete from kr_sessions where user_id = $1', [id]);
      return one('update kr_users set banned = $2::jsonb where id = $1 returning *', [id, JSON.stringify({ at: Date.now(), reason: String(reason) })]);
    },
    touchSeen: id => one('update kr_users set seen = $2 where id = $1 returning *', [id, Date.now()]),
    async createSession(userId) { const t = newToken(); await q('insert into kr_sessions (token, user_id, created) values ($1, $2, $3)', [t, userId, Date.now()]); return t; },
    async sessionUser(token) {
      if (typeof token !== 'string') return null;
      return one('select u.* from kr_sessions s join kr_users u on u.id = s.user_id where s.token = $1 and s.created > $2 and u.banned is null', [token, Date.now() - SESSION_MS]);
    },
    async dropSession(token) { if (typeof token === 'string') await q('delete from kr_sessions where token = $1', [token]); },
    async dropSessionsOf(userId) { await q('delete from kr_sessions where user_id = $1', [userId]); },
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
    async getDoc(key) {
      const r = await q('select value from kr_docs where key = $1', [docKey(key)]);
      return r.rows[0]?.value ?? null;
    },
    async putDoc(key, value) {
      // Stringified here: pg would turn a top-level array into a Postgres array.
      const json = JSON.stringify(value);
      if (json === undefined) throw new TypeError('A document must be a JSON value');
      await q('insert into kr_docs (key, value, updated) values ($1, $2::jsonb, $3) on conflict (key) do update set value = excluded.value, updated = excluded.updated',
        [docKey(key), json, Date.now()]);
    },
    close: () => pool.end(),
  };
}
