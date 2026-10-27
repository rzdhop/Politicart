// The admin's dashboard (dashboard.js) on a real server: the routes, who may
// call them, bans and their effect on live sockets, closing rooms, kicking
// connections, the race counters, and the god seat over the WebSocket.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { hashPassword } from './accounts.js';
import { ensureAdmin } from './admin.js';
import { emptyStats, recordRace, recordSolo } from './dashboard.js';
import { startServer } from './server.js';
import { openFileStore } from './store.js';

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const seen = []; const waiters = [];
  ws.on('message', raw => {
    const m = JSON.parse(String(raw)); seen.push(m);
    for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.ok(m); }
  });
  const open = new Promise(ok => ws.once('open', ok));
  const closed = new Promise(ok => ws.once('close', ok));
  return {
    ws, seen, open, closed,
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

let srv, store, adminPw;
const races = [];
const fakeRace = (room, roster, io) => { const r = { room: room.code, roster, io, stopped: false }; races.push(r); return { input() {}, leave() {}, stop: () => { r.stopped = true; } }; };

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kr-dash-')); writeFileSync(join(dir, 'index.html'), '<!doctype html>');
  adminPw = randomBytes(12).toString('hex');
  const admin = { user: 'rida', hash: await hashPassword(adminPw) };
  store = openFileStore(null);
  await ensureAdmin(store, admin, () => {});
  srv = await startServer({ port: 0, host: '127.0.0.1', staticDir: dir, runRace: fakeRace, store, loginTries: 1000, admin });
});
afterAll(() => srv.close());

const url = p => `http://127.0.0.1:${srv.port}${p}`;
const headers = token => ({ 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) });
const post = (p, body, token) => fetch(url(p), { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
const get = (p, token) => fetch(url(p), { headers: headers(token) });
let seq = 0;
async function account(prefix = 'Dash') {
  const name = prefix + (++seq);
  const j = await (await post('/api/register', { name, password: 'secret1' })).json();
  return { name, token: j.token, profile: j.profile };
}
async function adminToken() { return (await (await post('/api/login', { name: 'rida', password: adminPw })).json()).token; }
async function hello(token) {
  const c = client(srv.port); await c.open; c.send({ t: 'hello', token }); c.welcome = await c.next(m => m.t === 'welcome'); return c;
}

describe('who may use the dashboard', () => {
  it('answers 401 to everyone but the admin, on every route', async () => {
    const player = await account();
    for (const [method, path] of [['GET', '/api/admin/stats'], ['GET', '/api/admin/users'], ['GET', '/api/admin/live'], ['POST', '/api/admin/users/ban'], ['POST', '/api/admin/rooms/close']]) {
      for (const token of [undefined, player.token, 'forged']) {
        const r = await fetch(url(path), { method, headers: headers(token), body: method === 'POST' ? '{}' : undefined });
        expect(r.status, method + ' ' + path).toBe(401);
      }
    }
  });
});

describe('statistics and accounts', () => {
  it('counts accounts, sockets and rooms, and lists users with level, presence and room', async () => {
    const token = await adminToken();
    const alice = await account('Alice'), bob = await account('Bob');
    const a = await hello(alice.token); a.send({ t: 'create' });
    const { room } = await a.next(isRoom(r => r.players.length === 1));

    const stats = await (await get('/api/admin/stats', token)).json();
    expect(stats.accounts.total).toBeGreaterThanOrEqual(3);
    expect(stats.accounts.new7d).toBe(stats.accounts.total);
    expect(stats.accounts.online).toBeGreaterThanOrEqual(1);
    expect(stats.live.rooms).toBeGreaterThanOrEqual(1);
    expect(stats.races).toMatchObject({ races: expect.any(Number), solo: expect.any(Number), recent: expect.any(Array) });
    expect(stats.top[0]).toMatchObject({ name: expect.any(String), level: expect.any(Number) });

    const { users } = await (await get('/api/admin/users?q=' + alice.name.toLowerCase(), token)).json();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ name: alice.name, level: 1, online: true, room: room.code, banned: null });
    expect(users[0]).not.toHaveProperty('hash');
    expect(users[0].seen).toBeGreaterThan(0);
    const all = await (await get('/api/admin/users', token)).json();
    expect(all.users.some(u => u.name === bob.name && !u.online)).toBe(true);

    const live = await (await get('/api/admin/live', token)).json();
    expect(live.rooms.find(r => r.code === room.code)).toMatchObject({ phase: 'lobby', players: [expect.objectContaining({ name: alice.name })] });
    expect(live.connections.some(c => c.userId === alice.profile.id && c.room === room.code)).toBe(true);
    a.close();
  });

  it('bans an account, which closes its sockets, refuses its login and its token, until the ban is lifted', async () => {
    const token = await adminToken();
    const mallory = await account('Mallory');
    const m = await hello(mallory.token);
    const r = await post('/api/admin/users/ban', { id: mallory.profile.id, reason: 'triche' }, token);
    expect(r.status).toBe(200);
    expect((await r.json()).user.banned).toMatchObject({ reason: 'triche' });
    await m.closed;
    expect(m.seen.some(x => x.t === 'error' && /banni/.test(x.msg))).toBe(true);
    expect((await get('/api/me', mallory.token)).status).toBe(401);
    const login = await post('/api/login', { name: mallory.name, password: 'secret1' });
    expect(login.status).toBe(403);
    expect((await login.json()).error).toMatch(/banni.*triche/i);

    expect((await post('/api/admin/users/unban', { id: mallory.profile.id }, token)).status).toBe(200);
    expect((await post('/api/login', { name: mallory.name, password: 'secret1' })).status).toBe(200);
    expect((await post('/api/admin/users/ban', { id: 'nobody' }, token)).status).toBe(404);
    expect((await post('/api/admin/users/ban', {}, token)).status).toBe(400);
  });

  it('never lets the admin ban itself, and can close every session of an account', async () => {
    const token = await adminToken();
    const me = await (await get('/api/me', token)).json();
    expect((await post('/api/admin/users/ban', { id: me.profile.id }, token)).status).toBe(409);
    const carol = await account('Carol');
    expect((await post('/api/admin/users/logout', { id: carol.profile.id }, token)).status).toBe(200);
    expect((await get('/api/me', carol.token)).status).toBe(401);
    expect((await post('/api/login', { name: carol.name, password: 'secret1' })).status).toBe(200);   // not banned
  });
});

describe('rooms, connections and races', () => {
  it('closes a room, stops its race, and kicks one connection', async () => {
    const token = await adminToken();
    const dan = await account('Dan');
    const d = await hello(dan.token); d.send({ t: 'create' });
    const { room } = await d.next(isRoom(r => r.players.length === 1));
    d.send({ t: 'start' }); await d.next(isRoom(r => r.phase === 'race'));
    const race = races.at(-1);
    expect((await post('/api/admin/rooms/close', { code: room.code.toLowerCase() }, token)).status).toBe(200);
    expect(race.stopped).toBe(true);
    expect((await d.next(m => m.t === 'error')).msg).toMatch(/fermée/);
    expect((await post('/api/admin/rooms/close', { code: room.code }, token)).status).toBe(404);

    const live = await (await get('/api/admin/live', token)).json();
    const mine = live.connections.find(c => c.userId === dan.profile.id);
    expect(mine.room).toBeNull();
    expect((await post('/api/admin/connections/kick', { id: mine.id }, token)).status).toBe(200);
    await d.closed;
    expect((await post('/api/admin/connections/kick', { id: mine.id }, token)).status).toBe(404);
  });

  it('counts finished races and solo reports in the stats document', async () => {
    const s = openFileStore(null);
    expect(await s.getDoc('stats')).toBeNull();
    const room = { code: 'ABCD', trackIdx: 2 };
    const roster = [{ isAI: true }, { isAI: false, name: 'A' }, { isAI: false, god: true, name: 'Rida' }];
    await recordRace(s, { room, roster, results: { ranking: [{ name: 'A' }], teams: [{ team: 'bleu', points: 10 }] } });
    await recordRace(s, { room, roster, results: { ranking: [], teams: [], error: true } });
    await recordSolo(s);
    const doc = await s.getDoc('stats');
    expect(doc).toMatchObject({ races: 2, finished: 1, solo: 1, byTrack: { 2: 2 } });
    expect(doc.recent[1]).toMatchObject({ code: 'ABCD', trackIdx: 2, humans: 1, gods: 1, winner: 'A', teams: [{ team: 'bleu', points: 10 }] });
    expect(emptyStats()).toEqual({ races: 0, finished: 0, solo: 0, byTrack: {}, recent: [] });
  });

  it('counts a race the server ran, once it reports its results', async () => {
    const token = await adminToken();
    const before = (await (await get('/api/admin/stats', token)).json()).races.races;
    const eve = await account('Eve');
    const e = await hello(eve.token); e.send({ t: 'create' });
    await e.next(isRoom(r => r.players.length === 1));
    e.send({ t: 'start' }); await e.next(isRoom(r => r.phase === 'race'));
    races.at(-1).io.done({ ranking: [{ slot: 1, name: eve.name, rank: 0, finished: true, isAI: false, team: 'bleu' }], teams: [{ team: 'bleu', points: 10 }] });
    await e.next(m => m.t === 'results');
    await new Promise(r => setTimeout(r, 50));
    const after = (await (await get('/api/admin/stats', token)).json()).races;
    expect(after.races).toBe(before + 1);
    expect(after.recent[0]).toMatchObject({ winner: eve.name, humans: 1 });
    e.close();
  });
});

describe('the god seat over the WebSocket (DEC-030)', () => {
  it('lets only the admin enter a room as a god, beyond the six, and flags the god in the grid', async () => {
    const token = await adminToken();
    const host = await account('Host');
    const h = await hello(host.token); h.send({ t: 'create' });
    const { room } = await h.next(isRoom(r => r.players.length === 1));

    const mortal = await account('Mortal'); const m = await hello(mortal.token);
    m.send({ t: 'godJoin', code: room.code });
    expect((await m.next(x => x.t === 'error')).msg).toMatch(/administrateur/);

    const g = await hello(token);
    g.send({ t: 'godJoin', code: 'ZZZZ' });
    expect((await g.next(x => x.t === 'error')).msg).toMatch(/Aucune salle/);
    g.send({ t: 'godJoin', code: room.code, style: { body: '#123456' } });
    const view = await g.next(isRoom(r => r.players.length === 2));
    const god = view.room.players.find(p => p.god);
    expect(god).toMatchObject({ name: 'rida', team: null, guest: false, style: { body: '#123456' } });
    expect((await h.next(x => x.t === 'notice')).msg).toMatch(/dieu/);

    g.send({ t: 'set', team: 'bleu' });
    expect((await g.next(x => x.t === 'error')).msg).toMatch(/dieu/);
    g.send({ t: 'set', ready: true, charId: 'thierry' });
    await h.next(isRoom(r => r.players[1].ready && r.players[1].charId === 'thierry'));
    h.send({ t: 'start' });
    await h.next(isRoom(r => r.phase === 'race'));
    const race = races.at(-1);
    expect(race.roster).toHaveLength(7);
    expect(race.roster.filter(s => s.isAI)).toHaveLength(5);
    expect(race.roster.find(s => s.god)).toMatchObject({ playerId: g.welcome.id, team: null });
    // the god's result earns no experience
    const xpBefore = (await (await get('/api/me', token)).json()).profile.xp;
    race.io.done({ ranking: [{ slot: 6, name: 'rida', rank: 0, finished: true, isAI: false, team: null, god: true }, { slot: 5, name: host.name, rank: 1, finished: true, isAI: false, team: 'bleu' }], teams: [{ team: 'bleu', points: 8 }] });
    await g.next(x => x.t === 'results');
    await new Promise(r => setTimeout(r, 50));
    expect((await (await get('/api/me', token)).json()).profile.xp).toBe(xpBefore);
    expect((await (await get('/api/me', host.token)).json()).profile.xp).toBeGreaterThan(0);
    h.close(); m.close(); g.close();
  });
});
