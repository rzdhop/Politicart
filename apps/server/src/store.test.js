// The account store, both backends, against the same contract. The Postgres
// run needs a scratch database: set KR_TEST_DATABASE_URL (its kr_* tables are
// dropped first). Without it only the file store runs.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { checkPassword, hashPassword } from './accounts.js';
import { openFileStore, openPgStore } from './store.js';

const PG = process.env.KR_TEST_DATABASE_URL;

async function freshPg() {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: PG });
  await pool.query('drop table if exists kr_friends, kr_sessions, kr_users');
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
    expect(await store.setHash('u1', 'new')).toEqual({ id: 'u1', name: 'Pg', hash: 'new', xp: 12, created: 5 });
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
