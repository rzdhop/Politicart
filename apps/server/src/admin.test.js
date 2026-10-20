// The administrator account: configuration, the reserved name, the boot-time
// seeding, the admin flag in profiles, and requireAdmin. Every password and
// hash here is made up at run time.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { accountApi, hashPassword } from './accounts.js';
import { adminConfig, ensureAdmin, isAdminUser, isReservedName } from './admin.js';
import { startServer } from './server.js';
import { openFileStore } from './store.js';

const password = () => randomBytes(12).toString('hex');
const quiet = () => {};

/** A memory store whose admin account was seeded, with its password. */
async function seeded(user = 'rida') {
  const pw = password(), hash = await hashPassword(pw);
  const store = openFileStore(null), admin = { user, hash };
  await ensureAdmin(store, admin, quiet);
  return { store, admin, pw, hash };
}

describe('admin configuration', () => {
  it('is enabled only by a well-formed hash, and defaults the name to rida', async () => {
    const hash = await hashPassword(password());
    expect(adminConfig({ hash })).toMatchObject({ user: 'rida', hash, enabled: true, reason: null });
    expect(adminConfig({ user: '  Chef  ', hash })).toMatchObject({ user: 'Chef', enabled: true });
    expect(adminConfig({ user: '', hash }).user).toBe('rida');
    for (const bad of [undefined, '', '   ', 'scrypt$abc$def', hash.toUpperCase(), hash.replace('scrypt$', 'bcrypt$'), hash + '00', hash.slice(0, -2), 'scrypt$' + 'g'.repeat(32) + '$' + 'a'.repeat(128)]) {
      const cfg = adminConfig({ hash: bad });
      expect(cfg.enabled).toBe(false);
      expect(cfg.hash).toBeNull();
      expect(cfg.reason).toMatch(/KR_ADMIN_PASSWORD_HASH/);
      if (bad) expect(cfg.reason).not.toContain(bad.trim() || '\0');
    }
    expect(adminConfig({ user: 'a b', hash })).toMatchObject({ enabled: false, reason: expect.stringMatching(/KR_ADMIN_USER/) });
  });

  it('reserves the name case-, width- and accent-blind, even without a hash', () => {
    for (const admin of [{}, { hash: 'scrypt$' + 'a'.repeat(32) + '$' + 'b'.repeat(128) }]) {
      for (const name of ['rida', 'RIDA', 'Rida', 'ｒｉｄａ', 'Rídà', 'RÏDA', 'ridá']) expect(isReservedName(admin, name)).toBe(true);
      for (const name of ['ridas', 'rid', 'Marianne']) expect(isReservedName(admin, name)).toBe(false);
    }
    expect(isReservedName({ user: 'Chef' }, 'CHEF')).toBe(true);
    expect(isReservedName({ user: 'Chef' }, 'rida')).toBe(false);
  });
});

describe('ensureAdmin', () => {
  it('creates the account, keeps it, and resets a changed hash closing its sessions', async () => {
    const store = openFileStore(null), log = vi.fn();
    const first = { user: 'rida', hash: await hashPassword(password()) };
    expect(await ensureAdmin(store, first, log)).toBe('created');
    const u = await store.userByName('RIDA');
    expect(u).toMatchObject({ name: 'rida', hash: first.hash });
    expect(await ensureAdmin(store, first, log)).toBe('kept');

    const token = await store.createSession(u.id);
    const second = { user: 'rida', hash: await hashPassword(password()) };
    expect(await ensureAdmin(store, second, log)).toBe('reset');
    expect((await store.user(u.id)).hash).toBe(second.hash);
    expect(await store.sessionUser(token)).toBeNull();
    // logged, never with the hash
    expect(log).toHaveBeenCalledTimes(2);
    for (const [line] of log.mock.calls) { expect(line).not.toContain(first.hash); expect(line).not.toContain(second.hash); expect(line).not.toMatch(/scrypt\$[0-9a-f]/); }
  });

  it('takes over an account someone had already registered under that name', async () => {
    const store = openFileStore(null), log = vi.fn();
    const squatter = await store.createUser({ name: 'Rida', hash: await hashPassword(password()) });
    const theirs = await store.createSession(squatter.id);
    const admin = { user: 'rida', hash: await hashPassword(password()) };
    expect(await ensureAdmin(store, admin, log)).toBe('reset');
    expect(await store.sessionUser(theirs)).toBeNull();
    expect((await store.user(squatter.id)).hash).toBe(admin.hash);
    expect(log.mock.calls[0][0]).toMatch(/Rida/);
  });

  it('does nothing without a valid hash', async () => {
    const store = openFileStore(null), log = vi.fn();
    expect(await ensureAdmin(store, { user: 'rida' }, log)).toBe('disabled');
    expect(await ensureAdmin(store, { user: 'rida', hash: 'scrypt$00$11' }, log)).toBe('disabled');
    expect(await store.userByName('rida')).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });
});

describe('who is admin', () => {
  it('is the account with the admin name key and the configured hash, and only while a hash is set', async () => {
    const { store, admin } = await seeded();
    const u = await store.userByName('rida');
    expect(isAdminUser(admin, u)).toBe(true);
    expect(isAdminUser({ user: 'rida' }, u)).toBe(false);                                 // no hash: nobody
    expect(isAdminUser(admin, { ...u, hash: await hashPassword(password()) })).toBe(false);   // not reset yet
    expect(isAdminUser(admin, { ...u, name: 'ridas' })).toBe(false);
    expect(isAdminUser(admin, null)).toBe(false);
  });
});

describe('requireAdmin', () => {
  const req = token => ({ headers: token ? { authorization: 'Bearer ' + token } : {} });
  afterEach(() => vi.restoreAllMocks());

  it('answers the admin for an admin session, null otherwise', async () => {
    const { store, admin } = await seeded();
    const api = accountApi(store, { admin });
    const adminUser = await store.userByName('rida');
    const normal = await store.createUser({ name: 'Marianne', hash: await hashPassword(password()) });
    const adminToken = await store.createSession(adminUser.id), normalToken = await store.createSession(normal.id);

    expect((await api.requireAdmin(req(adminToken)))?.id).toBe(adminUser.id);
    expect(await api.requireAdmin(req(normalToken))).toBeNull();
    expect(await api.requireAdmin(req(null))).toBeNull();
    expect(await api.requireAdmin(req('f'.repeat(64)))).toBeNull();
    expect(await accountApi(store, { admin: { user: 'rida' } }).requireAdmin(req(adminToken))).toBeNull();   // no hash: nobody

    const later = Date.now() + 61 * 24 * 3600 * 1000;                                    // sessions last 60 days
    vi.spyOn(Date, 'now').mockReturnValue(later);
    expect(await api.requireAdmin(req(adminToken))).toBeNull();
  });
});

// ---------- over HTTP and WebSocket ----------

const fakeRace = () => ({ input() {}, leave() {}, stop() {} });
let dir;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'kr-static-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>kr</title>');
});

/** A server on a fresh memory store, with `admin` seeded first as main.js does. */
async function serve(admin) {
  const store = openFileStore(null);
  await ensureAdmin(store, admin, quiet);
  const srv = await startServer({ port: 0, host: '127.0.0.1', staticDir: dir, runRace: fakeRace, store, loginTries: 1000, admin });
  const url = p => `http://127.0.0.1:${srv.port}${p}`;
  const post = (p, body, token) => fetch(url(p), { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  const me = token => fetch(url('/api/me'), { headers: { authorization: 'Bearer ' + token } }).then(r => r.json());
  const welcome = token => new Promise((ok, ko) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token })));
    ws.on('message', raw => { const m = JSON.parse(String(raw)); if (m.t === 'welcome') { ws.close(); ok(m); } });
    ws.on('error', ko);
  });
  return { srv, store, post, me, welcome };
}

const RESERVED = ['rida', 'RIDA', 'ｒｉｄａ', 'Rídà'];

describe.each([
  ['with a hash', true],
  ['without a hash', false],
])('the server %s', (_label, withHash) => {
  let s, pw;
  beforeAll(async () => {
    pw = password();
    s = await serve(withHash ? { user: 'rida', hash: await hashPassword(pw) } : { user: 'rida' });
  });
  afterAll(() => s.srv.close());

  it('refuses to sign anyone up under the admin name', async () => {
    for (const name of RESERVED) {
      const r = await s.post('/api/register', { name, password: password() });
      expect(r.status, name).toBe(409);
      expect((await r.json()).error).toMatch(/réservé/);
    }
    expect((await s.post('/api/register', { name: 'Ridicule', password: password() })).status).toBe(200);
  });

  it('gives a normal account no admin flag anywhere', async () => {
    const reg = await (await s.post('/api/register', { name: 'Citoyen', password: 'liberte' })).json();
    expect(reg.profile).not.toHaveProperty('admin');
    const login = await (await s.post('/api/login', { name: 'citoyen', password: 'liberte' })).json();
    expect(login.profile).not.toHaveProperty('admin');
    expect((await s.me(login.token)).profile).not.toHaveProperty('admin');
    expect((await s.welcome(login.token)).profile).not.toHaveProperty('admin');
    const prog = await (await s.post('/api/progress', { rank: 0, field: 6, finished: true }, login.token)).json();
    expect(prog.profile).not.toHaveProperty('admin');
  });

  it(withHash ? 'flags the admin in login, me, progress and the WebSocket welcome' : 'has no admin account at all', async () => {
    const r = await s.post('/api/login', { name: 'RIDA', password: pw });
    if (!withHash) { expect(r.status).toBe(401); expect(await s.store.userByName('rida')).toBeNull(); return; }
    const login = await r.json();
    expect(login.profile).toMatchObject({ name: 'rida', admin: true });
    expect((await s.me(login.token)).profile.admin).toBe(true);
    expect((await s.welcome(login.token)).profile).toMatchObject({ name: 'rida', admin: true });
    const prog = await (await s.post('/api/progress', { rank: 0, field: 6, finished: true }, login.token)).json();
    expect(prog.profile.admin).toBe(true);
    expect((await s.post('/api/login', { name: 'rida', password: 'wrong-password' })).status).toBe(401);
  });
});

// ---------- failed logins per account ----------

describe('the per-account login limit', () => {
  let http, port, clock, s, store, rida, other;
  const t0 = Date.now();
  let ip = 0;
  /** A login from a fresh X-Forwarded-For each time: the per-address limit never fires. */
  const login = (name, pw) => fetch(`http://127.0.0.1:${port}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${++ip % 250}, 10.0.0.1` },
    body: JSON.stringify({ name, password: pw }),
  });

  beforeAll(async () => {
    s = await seeded();
    store = s.store; rida = s.pw;
    other = password();
    await store.createUser({ name: 'Voisin', hash: await hashPassword(other) });
    clock = t0;
    const api = accountApi(store, { admin: s.admin, accountLock: { now: () => clock } });
    http = createServer(async (req, res) => { if (!(await api(req, res, new URL(req.url, 'http://x').pathname))) res.writeHead(404).end(); });
    await new Promise(ok => http.listen(0, '127.0.0.1', ok));
    port = http.address().port;
  });
  afterAll(() => new Promise(ok => http.close(ok)));
  afterEach(() => vi.restoreAllMocks());

  it('locks an account after 10 failures from any addresses, even against the right password, and not its neighbours', async () => {
    for (let i = 0; i < 10; i++) expect((await login(i % 2 ? 'RIDA' : 'rida', 'wrong-' + i)).status).toBe(401);
    const lookup = vi.spyOn(store, 'userByName');
    const locked = await login('rida', rida);
    expect(locked.status).toBe(429);
    expect((await locked.json()).error).toMatch(/Trop d’essais pour ce compte/);
    const after = Number(locked.headers.get('retry-after'));
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(15 * 60);
    expect(locked.headers.get('access-control-expose-headers')).toMatch(/retry-after/);
    expect(lookup).not.toHaveBeenCalled();                              // answered before any lookup or scrypt
    expect((await login('ｒｉｄａ', rida)).status).toBe(429);              // same name key, same lock
    vi.restoreAllMocks();

    const neighbour = await login('Voisin', other);
    expect(neighbour.status).toBe(200);
    expect((await neighbour.json()).profile).not.toHaveProperty('admin');

    clock = t0 + 15 * 60_000 + 1;                                       // the window has passed
    const back = await login('rida', rida);
    expect(back.status).toBe(200);
    expect((await back.json()).profile.admin).toBe(true);
  });

  it('starts counting again after a successful login', async () => {
    for (let i = 0; i < 9; i++) expect((await login('Voisin', 'wrong-' + i)).status).toBe(401);
    expect((await login('Voisin', other)).status).toBe(200);
    for (let i = 0; i < 9; i++) expect((await login('Voisin', 'wrong-' + i)).status).toBe(401);
    expect((await login('Voisin', other)).status).toBe(200);
  });

  it('does not lock names that have no account', async () => {
    for (let i = 0; i < 12; i++) expect((await login('Personne', 'wrong-' + i)).status).toBe(401);
  });
});
