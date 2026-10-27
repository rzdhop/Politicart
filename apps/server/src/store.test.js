// The account store, both backends, against the same contract. The Postgres
// run needs a scratch database: set KR_TEST_DATABASE_URL (its kr_* tables are
// dropped first). Without it only the file store runs.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { checkPassword, hashPassword } from './accounts.js';
import { DOC_KEYS, openFileStore, openPgStore } from './store.js';

const PG = process.env.KR_TEST_DATABASE_URL;

async function freshPg() {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: PG });
  await pool.query('drop table if exists kr_docs, kr_friends, kr_sessions, kr_users');
  await pool.end();
  return openPgStore(PG);
}

const backends = [['file', async () => openFileStore(join(mkdtempSync(join(tmpdir(), 'kr-store-')), 'accounts.json'))]];
if (PG) backends.push(['postgres', freshPg]);

describe.each(backends)('%s store', (_kind, open) => {
  let store;
  afterAll(() => store?.close());

  it('creates users with unique, case-blind names and finds them again', async () => {
    store = await open();
    const a = await store.createUser({ name: 'Élise', hash: 'h' });
    expect(a).toMatchObject({ name: 'Élise', xp: 0 });
    expect(await store.createUser({ name: 'élise', hash: 'h' })).toBeNull();
    expect((await store.userByName('ÉLISE')).id).toBe(a.id);
    expect((await store.user(a.id)).name).toBe('Élise');
    expect(await store.user('nobody')).toBeNull();
    expect((await store.addXp(a.id, 75)).xp).toBe(75);
    expect((await store.addXp(a.id, -10)).xp).toBe(75);       // never takes experience away
  });

  it('lists accounts newest first without their hashes, bans and unbans them, and notes when they were seen', async () => {
    const a = await store.createUser({ name: 'Liste1', hash: 'h' }), b = await store.createUser({ name: 'Liste2', hash: 'h' });
    const list = await store.listUsers();
    expect(list.map(u => u.name)).toContain('Liste1');
    expect(list.every(u => !('hash' in u) && 'banned' in u && 'seen' in u)).toBe(true);
    expect(list.findIndex(u => u.id === b.id)).toBeLessThanOrEqual(list.findIndex(u => u.id === a.id));
    expect((await store.listUsers({ limit: 1 }))).toHaveLength(1);

    const t = await store.createSession(a.id);
    expect((await store.sessionUser(t)).id).toBe(a.id);
    const banned = await store.setBanned(a.id, 'triche');
    expect(banned.banned).toMatchObject({ reason: 'triche' }); expect(banned.banned.at).toBeGreaterThan(0);
    expect(await store.sessionUser(t)).toBeNull();                              // banned: no valid session
    expect((await store.userByName('Liste1')).banned.reason).toBe('triche');     // but the account is still there
    expect((await store.setBanned(a.id, null)).banned).toBeNull();
    expect(await store.setBanned('nobody', 'x')).toBeNull();

    expect((await store.user(a.id)).seen).toBeNull();
    const before = Date.now(); const seen = await store.touchSeen(a.id);
    expect(seen.seen).toBeGreaterThanOrEqual(before);
    const t2 = await store.createSession(a.id);
    await store.dropSessionsOf(a.id);
    expect(await store.sessionUser(t2)).toBeNull();
  });

  it('keeps sessions until they are dropped', async () => {
    const u = await store.createUser({ name: 'Sess', hash: 'h' });
    const t = await store.createSession(u.id);
    expect((await store.sessionUser(t)).id).toBe(u.id);
    expect(await store.sessionUser('forged')).toBeNull();
    expect(await store.sessionUser(undefined)).toBeNull();
    await store.dropSession(t);
    expect(await store.sessionUser(t)).toBeNull();
  });

  it('tracks friend requests both ways, crossed requests, and removals', async () => {
    const a = await store.createUser({ name: 'FA', hash: 'h' }), b = await store.createUser({ name: 'FB', hash: 'h' }), c = await store.createUser({ name: 'FC', hash: 'h' });
    expect(await store.requestFriend(a.id, b.id)).toBe('requested');
    expect(await store.requestFriend(a.id, b.id)).toBe('already');
    expect((await store.links(a.id)).map(l => [l.name, l.status])).toEqual([['FB', 'outgoing']]);
    expect((await store.links(b.id)).map(l => [l.name, l.status])).toEqual([['FA', 'incoming']]);
    expect(await store.acceptFriend(a.id, b.id)).toBe(false);   // only the one asked can accept
    expect(await store.acceptFriend(b.id, a.id)).toBe(true);
    expect((await store.links(a.id))[0].status).toBe('friend');
    expect(await store.requestFriend(b.id, a.id)).toBe('already');
    await store.requestFriend(c.id, a.id);
    expect(await store.requestFriend(a.id, c.id)).toBe('accepted');
    expect((await store.links(a.id)).map(l => l.status)).toEqual(['friend', 'friend']);
    await store.removeFriend(a.id, b.id);
    expect((await store.links(a.id)).map(l => l.name)).toEqual(['FC']);
    expect(await store.links(b.id)).toEqual([]);
  });

  it('replaces a password hash and closes only that user’s sessions', async () => {
    const a = await store.createUser({ name: 'HashA', hash: 'old' }), b = await store.createUser({ name: 'HashB', hash: 'other' });
    const ta1 = await store.createSession(a.id), ta2 = await store.createSession(a.id), tb = await store.createSession(b.id);
    expect(await store.setHash(a.id, 'new')).toMatchObject({ id: a.id, name: 'HashA', hash: 'new' });
    expect((await store.userByName('hasha')).hash).toBe('new');
    expect(await store.sessionUser(ta1)).toBeNull();
    expect(await store.sessionUser(ta2)).toBeNull();
    expect((await store.sessionUser(tb)).hash).toBe('other');
    expect(await store.setHash('nobody', 'x')).toBeNull();
  });

  it('keeps documents by key, replacing them whole, and only under known keys', async () => {
    expect(await store.getDoc('roster')).toBeNull();
    const doc = { chars: { victor: { name: 'Manu' } }, ads: ['data:image/png;base64,AAAA'] };
    await store.putDoc('roster', doc);
    expect(await store.getDoc('roster')).toEqual(doc);
    await store.putDoc('roster', { chars: {}, ads: [] });
    expect(await store.getDoc('roster')).toEqual({ chars: {}, ads: [] });
    for (const key of ['users', '../roster', 'roster/../x', '', undefined]) {
      await expect(store.putDoc(key, {})).rejects.toThrow(/Unknown document key/);
      await expect(store.getDoc(key)).rejects.toThrow(/Unknown document key/);
    }
  });
});

describe('documents', () => {
  const doc = name => ({ chars: { victor: { name } }, ads: [] });

  it('accept only the allowlisted keys', () => {
    expect(DOC_KEYS).toEqual(['roster', 'stats']);
    expect(Object.isFrozen(DOC_KEYS)).toBe(true);
  });

  it('live in memory for a memory store, never shared with the caller', async () => {
    const store = openFileStore(null);
    expect(await store.getDoc('roster')).toBeNull();
    const d = doc('Manu');
    await store.putDoc('roster', d);
    d.chars.victor.name = 'Changé après coup';
    const got = await store.getDoc('roster');
    expect(got).toEqual(doc('Manu'));
    got.chars.victor.name = 'Changé aussi';
    expect(await store.getDoc('roster')).toEqual(doc('Manu'));
    await expect(store.putDoc('roster', undefined)).rejects.toThrow(/JSON value/);
    await expect(store.putDoc('nope', {})).rejects.toThrow(/Unknown document key/);
  });

  it('go to their own file next to the accounts file, and survive a reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kr-store-'));
    const file = join(dir, 'kr-accounts.json');
    const s1 = openFileStore(file);
    await s1.createUser({ name: 'Voisine', hash: 'h' });
    await s1.putDoc('roster', doc('Manu'));
    expect(readdirSync(join(dir, 'kr-docs'))).toEqual(['roster.json']);       // written at once, no temp file left
    expect(JSON.parse(readFileSync(join(dir, 'kr-docs', 'roster.json'), 'utf8'))).toEqual(doc('Manu'));
    await s1.close();
    const accounts = JSON.parse(readFileSync(file, 'utf8'));
    expect(Object.keys(accounts).sort()).toEqual(['links', 'sessions', 'users']);
    expect(JSON.stringify(accounts)).not.toContain('Manu');

    const s2 = openFileStore(file);
    expect(await s2.getDoc('roster')).toEqual(doc('Manu'));
    expect(await s2.userByName('voisine')).not.toBeNull();
    await s2.close();
  });

  it('are written one at a time, in call order, the last one winning', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kr-store-'));
    const store = openFileStore(join(dir, 'kr-accounts.json'));
    const names = ['A', 'B', 'C', 'D', 'E', 'F'];
    const order = [];
    await Promise.all(names.map(n => store.putDoc('roster', doc(n)).then(() => order.push(n))));
    expect(order).toEqual(names);
    expect(await store.getDoc('roster')).toEqual(doc('F'));
    expect(JSON.parse(readFileSync(join(dir, 'kr-docs', 'roster.json'), 'utf8'))).toEqual(doc('F'));
    expect(readdirSync(join(dir, 'kr-docs'))).toEqual(['roster.json']);
  });

  it('keep the previous document when a write fails, and the next write still goes through', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kr-store-'));
    const store = openFileStore(join(dir, 'kr-accounts.json'));
    await store.putDoc('roster', doc('Avant'));
    const docs = join(dir, 'kr-docs'), target = join(docs, 'roster.json');
    // a non-empty directory where the file must go: the rename fails
    renameSync(target, target + '.bak'); mkdirSync(target); writeFileSync(join(target, 'x'), 'x');
    await expect(store.putDoc('roster', doc('Raté'))).rejects.toThrow();
    expect(await store.getDoc('roster')).toEqual(doc('Avant'));
    expect(readdirSync(docs).filter(n => n.endsWith('.tmp'))).toEqual([]);
    rmSync(target, { recursive: true }); renameSync(target + '.bak', target);
    await store.putDoc('roster', doc('Après'));
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual(doc('Après'));
  });

  it('ignore a document that is not JSON, with a warning, and clear temp files a crash left', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kr-store-'));
    mkdirSync(join(dir, 'kr-docs'));
    writeFileSync(join(dir, 'kr-docs', 'roster.json'), '{ half a fi');
    writeFileSync(join(dir, 'kr-docs', 'roster.json.abc123.tmp'), '{');
    const warn = vi.fn();
    const store = openFileStore(join(dir, 'kr-accounts.json'), { log: { warn } });
    expect(await store.getDoc('roster')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/roster\.json is not JSON/);
    expect(existsSync(join(dir, 'kr-docs', 'roster.json.abc123.tmp'))).toBe(false);
    await store.putDoc('roster', doc('Réparé'));
    expect(await openFileStore(join(dir, 'kr-accounts.json')).getDoc('roster')).toEqual(doc('Réparé'));
  });
});

describe('documents on Postgres (a fake Pool)', () => {
  function fakePool(rows = []) {
    const calls = [];
    class Pool {
      async query(text, values) { calls.push([text, values]); return /^select value from kr_docs/.test(text) ? { rows, rowCount: rows.length } : { rows: [], rowCount: 1 }; }
      async end() {}
    }
    return { Pool, calls };
  }

  it('creates kr_docs with the schema', async () => {
    const { Pool, calls } = fakePool();
    await openPgStore('postgres://fake', { Pool });
    expect(calls[0][0]).toContain('create table if not exists kr_docs (key text primary key, value jsonb not null, updated bigint not null)');
  });

  it('upserts a document as JSON text, and reads it back', async () => {
    const { Pool, calls } = fakePool([{ value: { chars: {}, ads: [] } }]);
    const store = await openPgStore('postgres://fake', { Pool });
    calls.length = 0;
    const before = Date.now();
    await store.putDoc('roster', { chars: { victor: { name: 'Manu' } }, ads: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('insert into kr_docs (key, value, updated) values ($1, $2::jsonb, $3) on conflict (key) do update set value = excluded.value, updated = excluded.updated');
    expect(calls[0][1][0]).toBe('roster');
    expect(calls[0][1][1]).toBe('{"chars":{"victor":{"name":"Manu"}},"ads":[]}');
    expect(calls[0][1][2]).toBeGreaterThanOrEqual(before);
    expect(await store.getDoc('roster')).toEqual({ chars: {}, ads: [] });
    expect(calls[1]).toEqual(['select value from kr_docs where key = $1', ['roster']]);
  });

  it('answers null for a missing document, and refuses unknown keys without a query', async () => {
    const { Pool, calls } = fakePool([]);
    const store = await openPgStore('postgres://fake', { Pool });
    calls.length = 0;
    expect(await store.getDoc('roster')).toBeNull();
    await expect(store.putDoc('../etc', {})).rejects.toThrow(/Unknown document key/);
    await expect(store.getDoc('users')).rejects.toThrow(/Unknown document key/);
    await expect(store.putDoc('roster', undefined)).rejects.toThrow(/JSON value/);
    expect(calls).toHaveLength(1);
  });
});

describe('setHash on the memory store', () => {
  it('replaces the hash and closes the sessions', async () => {
    const store = openFileStore(null);
    expect(store.kind).toBe('memory');
    const u = await store.createUser({ name: 'Mem', hash: 'old' }); const t = await store.createSession(u.id);
    expect((await store.setHash(u.id, 'new')).hash).toBe('new');
    expect((await store.user(u.id)).hash).toBe('new');
    expect(await store.sessionUser(t)).toBeNull();
    expect(await store.setHash('nobody', 'x')).toBeNull();
  });
});

describe('setHash on Postgres (a fake Pool)', () => {
  /** Records every query; answers the update with `rows`. */
  function fakePool(rows) {
    const calls = [];
    class Pool {
      async query(text, values) { calls.push([text, values]); return /^update kr_users set hash/.test(text) ? { rows, rowCount: rows.length } : { rows: [], rowCount: 0 }; }
      async end() {}
    }
    return { Pool, calls };
  }

  it('closes the sessions first, then updates the hash, and maps the row', async () => {
    const { Pool, calls } = fakePool([{ id: 'u1', name: 'Pg', hash: 'new', xp: '12', created: '5' }]);
    const store = await openPgStore('postgres://fake', { Pool });
    calls.length = 0;                                  // drop the schema query
    expect(await store.setHash('u1', 'new')).toEqual({ id: 'u1', name: 'Pg', hash: 'new', xp: 12, created: 5, seen: null, banned: null });
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toMatch(/^delete from kr_sessions where user_id = \$1$/);
    expect(calls[0][1]).toEqual(['u1']);
    expect(calls[1][0]).toMatch(/^update kr_users set hash = \$2 where id = \$1 returning \*$/);
    expect(calls[1][1]).toEqual(['u1', 'new']);
  });

  it('answers null for an unknown user', async () => {
    const { Pool } = fakePool([]);
    const store = await openPgStore('postgres://fake', { Pool });
    expect(await store.setHash('nobody', 'x')).toBeNull();
  });
});

describe('the file store on disk', () => {
  it('survives a restart', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'kr-store-')), 'sub', 'accounts.json');
    const s1 = openFileStore(file);
    const u = await s1.createUser({ name: 'Durable', hash: 'h' }); await s1.addXp(u.id, 40);
    const t = await s1.createSession(u.id);
    await s1.close();
    expect(JSON.parse(readFileSync(file, 'utf8')).users[u.id].xp).toBe(40);
    const s2 = openFileStore(file);
    expect((await s2.sessionUser(t)).xp).toBe(40);
  });
});

describe('passwords', () => {
  it('are salted and checked in constant time', async () => {
    const h1 = await hashPassword('république'), h2 = await hashPassword('république');
    expect(h1).not.toBe(h2);
    expect(h1).not.toContain('république');
    expect(await checkPassword('république', h1)).toBe(true);
    expect(await checkPassword('monarchie', h1)).toBe(false);
    expect(await checkPassword('x', 'garbage')).toBe(false);
  });
});
