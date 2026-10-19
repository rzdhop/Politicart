import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { BASE, CHARACTERS } from '../../game/src/engine/data.js';
import { hashPassword } from './auth.js';
import { applyRoster, createRosterStore } from './roster.js';
import { ROSTER_BODY_LIMIT, startServer } from './server.js';

// A client that records every message and can wait for one matching a test.
function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const seen = []; const waiters = [];
  ws.on('message', raw => {
    const m = JSON.parse(String(raw)); seen.push(m);
    for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.ok(m); }
  });
  const open = new Promise(ok => ws.once('open', ok));
  return {
    seen, open,
    send: m => ws.send(JSON.stringify(m)),
    next: (test, ms = 2000) => new Promise((ok, ko) => {
      const hit = seen.find(test); if (hit) { seen.splice(seen.indexOf(hit), 1); return ok(hit); }
      const w = { test, ok: m => { clearTimeout(timer); seen.splice(seen.indexOf(m), 1); ok(m); } };
      const timer = setTimeout(() => ko(new Error('timed out waiting for a message')), ms);
      waiters.push(w);
    }),
    close: () => ws.close(),
  };
}
const isRoom = pred => m => m.t === 'room' && pred(m.room);

let srv, dir;
const races = [];
const fakeRace = (room, roster, io) => {
  const r = { room: room.code, roster, inputs: [], left: [], io, stopped: false };
  races.push(r);
  return { input: (id, m) => r.inputs.push([id, m]), leave: id => r.left.push(id), stop: () => { r.stopped = true; } };
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kr-static-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>kr</title>');
  writeFileSync(join(dir, 'app.js'), 'console.log(1)');
  srv = await startServer({ port: 0, host: '127.0.0.1', staticDir: dir, runRace: fakeRace });
});
afterAll(() => srv.close());

const url = p => `http://127.0.0.1:${srv.port}${p}`;

describe('http', () => {
  it('answers the probe the client uses to show the Multijoueur button', async () => {
    const r = await fetch(url('/api/kr'));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ kr: 'server', protocol: 1 });
  });

  it('serves the built game with content types', async () => {
    const page = await fetch(url('/'));
    expect(page.headers.get('content-type')).toMatch(/text\/html/);
    expect(await page.text()).toContain('<title>kr</title>');
    expect((await fetch(url('/app.js'))).headers.get('content-type')).toMatch(/javascript/);
    expect((await fetch(url('/nope.js'))).status).toBe(404);
  });

  it('never serves a file outside the game build', async () => {
    const r = await fetch(url('/%2e%2e/%2e%2e/package.json'));
    expect([403, 404]).toContain(r.status);
  });
});

describe('lobby over WebSocket', () => {
  it('creates a room, lets a friend join by code, and keeps both in sync', async () => {
    const a = client(srv.port), b = client(srv.port);
    await Promise.all([a.open, b.open]);
    a.send({ t: 'hello', name: 'Alice' }); const wa = await a.next(m => m.t === 'welcome');
    b.send({ t: 'hello', name: 'Bob' }); const wb = await b.next(m => m.t === 'welcome');
    a.send({ t: 'create' });
    const { room } = await a.next(isRoom(r => r.players.length === 1));
    expect(room.host).toBe(wa.id);
    expect(room.code).toMatch(/^[A-Z]{4}$/);
    b.send({ t: 'join', code: room.code.toLowerCase() });
    const both = await a.next(isRoom(r => r.players.length === 2));
    expect(both.room.players.map(p => p.name)).toEqual(['Alice', 'Bob']);
    expect(both.room.players.map(p => p.team)).toEqual(['bleu', 'rouge']);

    b.send({ t: 'set', team: 'bleu', ready: true });
    await a.next(isRoom(r => r.players[1].team === 'bleu' && r.players[1].ready));

    b.send({ t: 'start' });
    expect((await b.next(m => m.t === 'error')).msg).toMatch(/hôte/);

    a.send({ t: 'track', trackIdx: 2 });
    a.send({ t: 'start' });
    await a.next(isRoom(r => r.phase === 'race' && r.trackIdx === 2));
    const race = races.at(-1);
    expect(race.room).toBe(room.code);
    expect(race.roster).toHaveLength(6);
    expect(race.roster.filter(s => !s.isAI).map(s => s.playerId)).toEqual([wa.id, wb.id]);

    b.send({ t: 'input', seq: 1, c: { throttle: true } });
    await new Promise(r => setTimeout(r, 100));
    expect(race.inputs).toEqual([[wb.id, { t: 'input', seq: 1, c: { throttle: true } }]]);

    // The race reports back: everyone gets the results and the room returns to the lobby.
    race.io.done({ ranking: [], teams: [] });
    await b.next(m => m.t === 'results');
    await b.next(isRoom(r => r.phase === 'lobby' && r.players.every(p => !p.ready)));

    a.close(); b.close();
  });

  it('rejects an unknown code and ignores garbage', async () => {
    const c = client(srv.port); await c.open;
    c.send({ t: 'hello', name: 'Zoé' }); await c.next(m => m.t === 'welcome');
    c.send({ t: 'join', code: 'ZZZZ' });
    expect((await c.next(m => m.t === 'error')).msg).toMatch(/Aucune salle/);
    c.send({ t: '__proto__' }); c.send({ t: 'constructor' });
    c.send({ t: 'hello', name: 'Zoé' }); await c.next(m => m.t === 'welcome');   // still alive
    c.close();
  });

  it('hands the race the departure of a player and drops an empty room', async () => {
    const a = client(srv.port), b = client(srv.port); await Promise.all([a.open, b.open]);
    a.send({ t: 'hello', name: 'A' }); await a.next(m => m.t === 'welcome');
    b.send({ t: 'hello', name: 'B' }); const wb = await b.next(m => m.t === 'welcome');
    a.send({ t: 'create' }); const { room } = await a.next(isRoom(() => true));
    b.send({ t: 'join', code: room.code }); await a.next(isRoom(r => r.players.length === 2));
    b.send({ t: 'set', ready: true }); await a.next(isRoom(r => r.players[1]?.ready));
    a.send({ t: 'start' }); await a.next(isRoom(r => r.phase === 'race'));
    const race = races.at(-1);
    b.close();
    await a.next(isRoom(r => r.players.length === 1));
    expect(race.left).toEqual([wb.id]);
    a.close();
    await new Promise(r => setTimeout(r, 100));
    expect(srv.rooms.has(room.code)).toBe(false);
    expect(race.stopped).toBe(true);
  });
});

describe('admin over HTTP', () => {
  // Generated per run: no password or real hash ever lands in the repo.
  const PASSWORD = `pw-${randomBytes(9).toString('base64url')}`;
  let hash, adm, clock = 0;
  const servers = [];
  const boot = async (admin = {}) => {
    const s = await startServer({ port: 0, host: '127.0.0.1', staticDir: dir, runRace: fakeRace, admin });
    servers.push(s); return s;
  };
  beforeAll(async () => {
    hash = await hashPassword(PASSWORD);
    adm = await boot({ user: 'rida', passwordHash: hash, now: () => clock });
  });
  afterAll(() => Promise.all(servers.map(s => s.close())));

  const at = (s, p) => `http://127.0.0.1:${s.port}${p}`;
  const origin = s => `http://127.0.0.1:${s.port}`;
  const post = (s, p, body, headers = {}) => fetch(at(s, p), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: origin(s), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const login = (s, user = 'rida', password = PASSWORD, headers) => post(s, '/api/admin/login', { user, password }, headers);
  const tokenOf = r => /kr_admin=([^;]*)/.exec(r.headers.get('set-cookie') ?? '')?.[1];
  const me = async (s, token) => (await fetch(at(s, '/api/admin/me'), { headers: token ? { cookie: `kr_admin=${token}` } : {} })).json();

  it('logs in: 204 and an HttpOnly, SameSite=Strict session cookie', async () => {
    const r = await login(adm);
    expect(r.status).toBe(204);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const cookie = r.headers.get('set-cookie');
    expect(cookie).toMatch(/^kr_admin=[A-Za-z0-9_-]{43}; /);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=43200');
    expect(cookie).not.toContain('Secure');            // plain http, no proxy trusted
    expect(await me(adm, tokenOf(r))).toEqual({ enabled: true, admin: true, user: 'rida' });
    expect(await me(adm)).toEqual({ enabled: true, admin: false });
    expect(await me(adm, 'A'.repeat(43))).toEqual({ enabled: true, admin: false });
  });

  it('answers a wrong password and a wrong user identically', async () => {
    const a = await login(adm, 'rida', 'wrong-password-123');
    const b = await login(adm, 'someone', PASSWORD);
    const c = await post(adm, '/api/admin/login', { user: 1, password: null });
    expect([a.status, b.status, c.status]).toEqual([401, 401, 401]);
    const bodies = await Promise.all([a.text(), b.text(), c.text()]);
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]).error).toBeTruthy();
    expect(a.headers.get('set-cookie')).toBeNull();
  });

  it('logs out: 204, the cookie cleared and the token dead', async () => {
    const token = tokenOf(await login(adm));
    const r = await post(adm, '/api/admin/logout', {}, { cookie: `kr_admin=${token}` });
    expect(r.status).toBe(204);
    expect(r.headers.get('set-cookie')).toMatch(/^kr_admin=; .*Max-Age=0/);
    expect(await me(adm, token)).toEqual({ enabled: true, admin: false });
  });

  it('expires a session after 12 hours', async () => {
    const token = tokenOf(await login(adm));
    clock += 12 * 3600 * 1000 - 1;
    expect((await me(adm, token)).admin).toBe(true);
    clock += 1;
    expect((await me(adm, token)).admin).toBe(false);
  });

  it('refuses a cross-site or missing Origin with 403', async () => {
    expect((await login(adm, 'rida', PASSWORD, { origin: 'http://evil.test' })).status).toBe(403);
    expect((await login(adm, 'rida', PASSWORD, { origin: 'https://127.0.0.1' })).status).toBe(403);
    expect((await login(adm, 'rida', PASSWORD, { origin: 'null' })).status).toBe(403);
    // A raw request can leave the Origin out.
    const status = await new Promise((ok, ko) => {
      const body = JSON.stringify({ user: 'rida', password: PASSWORD });
      const req = request({ host: '127.0.0.1', port: adm.port, path: '/api/admin/login', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, res => { res.resume(); ok(res.statusCode); });
      req.on('error', ko); req.end(body);
    });
    expect(status).toBe(403);
    expect((await post(adm, '/api/admin/logout', {}, { origin: 'http://evil.test' })).status).toBe(403);
  });

  it('refuses a non-JSON content type with 415', async () => {
    const r = await post(adm, '/api/admin/login', JSON.stringify({ user: 'rida', password: PASSWORD }), { 'content-type': 'text/plain' });
    expect(r.status).toBe(415);
    expect((await post(adm, '/api/admin/login', 'user=rida', { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(415);
    expect((await post(adm, '/api/admin/logout', '{}', { 'content-type': 'text/plain' })).status).toBe(415);
  });

  it('refuses an oversized body with 413 and bad JSON with 400', async () => {
    const big = await login(adm, 'rida', 'x'.repeat(5000));
    expect(big.status).toBe(413);
    expect(big.headers.get('cache-control')).toBe('no-store');
    // Chunked, so no Content-Length to refuse up front: the streaming cap answers.
    const chunk = new TextEncoder().encode(`{"password":"${'x'.repeat(16 * 1024)}`);
    const stream = new ReadableStream({ start(c) { for (let i = 0; i < 8; i++) c.enqueue(chunk); c.close(); } });
    expect((await fetch(at(adm, '/api/admin/login'), { method: 'POST', headers: { 'content-type': 'application/json', origin: origin(adm) }, body: stream, duplex: 'half' })).status).toBe(413);
    expect((await post(adm, '/api/admin/login', '{not json')).status).toBe(400);
    expect((await post(adm, '/api/admin/login', '[1,2]')).status).toBe(400);
    expect((await post(adm, '/api/admin/login', 'null')).status).toBe(400);
  });

  it('answers 405 for the wrong method on an admin route', async () => {
    expect((await fetch(at(adm, '/api/admin/login'))).status).toBe(405);
    expect((await post(adm, '/api/admin/me', {})).status).toBe(405);
  });

  it('rate-limits: 429 after 5 failures, even with the right password', async () => {
    const s = await boot({ user: 'rida', passwordHash: hash });
    for (let i = 0; i < 5; i++) expect((await login(s, 'rida', `wrong-${i}-password`)).status).toBe(401);
    const r = await login(s);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('is disabled without a hash: 503, and me says enabled:false', async () => {
    const s = await boot({ user: 'rida', passwordHash: '' });
    const r = await login(s);
    expect(r.status).toBe(503);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect((await post(s, '/api/admin/logout', {})).status).toBe(503);
    expect(await me(s)).toEqual({ enabled: false, admin: false });
    // The shared server above was started with no admin option at all.
    expect(await (await fetch(url('/api/admin/me'))).json()).toEqual({ enabled: false, admin: false });
  });

  it('keeps every other route as it was', async () => {
    for (const s of [adm, srv]) {
      expect((await fetch(at(s, '/'), { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', origin: origin(s) } })).status).toBe(405);
      expect((await fetch(at(s, '/app.js'), { method: 'PUT', body: 'x' })).status).toBe(405);
      expect((await fetch(at(s, '/api/admin/other'), { method: 'POST', body: '{}' })).status).toBe(405);
      expect((await fetch(at(s, '/api/kr'), { method: 'POST' })).status).toBe(200);
      expect(await (await fetch(at(s, '/api/kr'))).json()).toMatchObject({ kr: 'server', protocol: 1 });
      expect((await fetch(at(s, '/app.js'))).headers.get('content-type')).toMatch(/javascript/);
      expect((await fetch(at(s, '/api/admin/login'), { method: 'HEAD' })).status).toBe(405);
    }
    const c = client(adm.port); await c.open;
    c.send({ t: 'hello', name: 'Admin' });
    expect((await c.next(m => m.t === 'welcome')).protocol).toBe(1);
    c.close();
  });
});

describe('the roster over HTTP', () => {
  const PASSWORD = `pw-${randomBytes(9).toString('base64url')}`;
  const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]).toString('base64')}`;
  let hash, data, adm, token;
  const servers = [];
  const boot = async (admin, dataDir = data) => {
    const roster = createRosterStore({ dir: dataDir });
    await roster.load();
    const s = await startServer({ port: 0, host: '127.0.0.1', staticDir: dir, runRace: fakeRace, admin, roster });
    servers.push(s); return s;
  };
  const at = (s, p) => `http://127.0.0.1:${s.port}${p}`;
  const origin = s => `http://127.0.0.1:${s.port}`;
  const login = async s => {
    const r = await fetch(at(s, '/api/admin/login'), {
      method: 'POST', headers: { 'content-type': 'application/json', origin: origin(s) }, body: JSON.stringify({ user: 'rida', password: PASSWORD }),
    });
    return /kr_admin=([^;]*)/.exec(r.headers.get('set-cookie') ?? '')?.[1];
  };
  const put = (s, body, headers = {}) => fetch(at(s, '/api/admin/roster'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: origin(s), cookie: `kr_admin=${token}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const getRoster = async s => { const r = await fetch(at(s, '/api/roster')); return { status: r.status, cache: r.headers.get('cache-control'), body: await r.json() }; };

  beforeAll(async () => {
    hash = await hashPassword(PASSWORD);
    data = mkdtempSync(join(tmpdir(), 'kr-data-'));
    adm = await boot({ user: 'rida', passwordHash: hash });
    token = await login(adm);
  });
  // Later suites must see the default cast again, whatever these tests renamed.
  afterAll(async () => { await Promise.all(servers.map(s => s.close())); applyRoster(undefined, CHARACTERS, BASE); });

  it('serves the roster to anyone, never cached', async () => {
    expect(await getRoster(srv)).toEqual({ status: 200, cache: 'no-store', body: { chars: {}, ads: [] } });
    expect((await fetch(url('/api/roster'), { method: 'HEAD' })).status).toBe(200);
    const r = await fetch(url('/api/roster'), { method: 'PUT', body: '{}' });
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('GET, HEAD');
  });

  it('refuses a PUT without a session: 401', async () => {
    const r = await put(adm, { chars: {} }, { cookie: '' });
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBeTruthy();
    expect((await put(adm, {}, { cookie: `kr_admin=${'A'.repeat(43)}` })).status).toBe(401);
  });

  it('checks Origin and content type before the session: 403 and 415', async () => {
    expect((await put(adm, {}, { origin: 'http://evil.test' })).status).toBe(403);
    expect((await put(adm, {}, { origin: 'http://evil.test', cookie: '' })).status).toBe(403);
    expect((await put(adm, '{}', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await put(adm, '{}', { 'content-type': 'text/plain', cookie: '' })).status).toBe(415);
  });

  it('answers 503 while admin is disabled, and 405 for another method', async () => {
    expect((await put(srv, {})).status).toBe(503);
    const r = await fetch(at(adm, '/api/admin/roster'));
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('PUT');
  });

  it('refuses a body over 8 MB with 413, and bad JSON with 400', async () => {
    expect((await put(adm, JSON.stringify({ pad: 'x'.repeat(ROSTER_BODY_LIMIT) }))).status).toBe(413);
    expect((await put(adm, '{oops')).status).toBe(400);
  });

  it('refuses an invalid roster with 400, naming the field, and keeps the old one', async () => {
    const r = await put(adm, { chars: { victor: { suit: 'bleu' } } });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ field: 'chars.victor.suit', error: expect.stringContaining('chars.victor.suit') });
    const svg = await put(adm, { chars: { lulu: { livery: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}` } } });
    expect(svg.status).toBe(400);
    expect((await svg.json()).field).toBe('chars.lulu.livery');
    expect((await getRoster(adm)).body).toEqual({ chars: {}, ads: [] });
  });

  it('stores a valid roster, serves it, and keeps it across a restart', async () => {
    const edit = { chars: { victor: { name: ' Manu ', suit: '#AA0000', livery: jpeg, style: { wheels: 'gold' } } }, ads: [jpeg] };
    const stored = { chars: { victor: { name: 'Manu', suit: '#aa0000', livery: jpeg, style: { wheels: 'gold' } } }, ads: [jpeg] };
    const r = await put(adm, edit);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual(stored);
    expect((await getRoster(adm)).body).toEqual(stored);
    expect(readdirSync(data)).toEqual(['roster.json']);
    await adm.close();
    adm = await boot({ user: 'rida', passwordHash: hash });
    expect((await getRoster(adm)).body).toEqual(stored);
    expect(CHARACTERS.find(c => c.id === 'victor').name).toBe('Manu');
  });

  it('names the AI karts in a lobby after the admin’s edits', async () => {
    token = await login(adm);                     // the restart above ended the session
    const chars = Object.fromEntries(CHARACTERS.map(c => [c.id, { name: `Clone ${c.id}` }]));
    expect((await put(adm, { chars })).status).toBe(200);
    const c = client(adm.port); await c.open;
    c.send({ t: 'hello', name: 'Solo' }); await c.next(m => m.t === 'welcome');
    c.send({ t: 'create' }); await c.next(isRoom(() => true));
    c.send({ t: 'start' }); await c.next(isRoom(room => room.phase === 'race'));
    const ai = races.at(-1).roster.filter(s => s.isAI);
    expect(ai).toHaveLength(5);
    for (const s of ai) expect(s.name).toBe(`Clone ${s.charId}`);
    c.close();
  });
});
