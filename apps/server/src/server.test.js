import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { startServer } from './server.js';
import { openFileStore } from './store.js';

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
/** A chunk big enough to compress (the real ones are hundreds of kB). */
const CHUNK = 'export const chunk = ' + JSON.stringify('politikart '.repeat(400)) + ';\n';
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
  for (const f of ['favicon.ico', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png']) writeFileSync(join(dir, f), 'icon');
  // a hashed chunk with the siblings the build's compress script writes, and one without
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'chunk-abc123.js'), CHUNK);
  writeFileSync(join(dir, 'assets', 'chunk-abc123.js.br'), brotliCompressSync(Buffer.from(CHUNK)));
  writeFileSync(join(dir, 'assets', 'chunk-abc123.js.gz'), gzipSync(Buffer.from(CHUNK)));
  writeFileSync(join(dir, 'assets', 'plain-def456.js'), 'export const plain = 1;');
  srv = await startServer({ port: 0, host: '127.0.0.1', staticDir: dir, runRace: fakeRace, loginTries: 1000 });
});
afterAll(() => srv.close());

const url = p => `http://127.0.0.1:${srv.port}${p}`;
const post = (p, body, token) => fetch(url(p), { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
let seq = 0;
/** A fresh account: its name and session token. */
async function account(prefix = 'User') {
  const name = prefix + (++seq);
  const r = await post('/api/register', { name, password: 'secret1' });
  const j = await r.json(); return { name, token: j.token, profile: j.profile };
}
/** An open socket that said hello, as an account (token) or a guest (name). */
async function hello(who) {
  const c = client(srv.port); await c.open;
  c.send({ t: 'hello', ...(typeof who === 'string' ? { name: who } : { token: who.token }) });
  c.welcome = await c.next(m => m.t === 'welcome');
  return c;
}

describe('http', () => {
  it('answers the probe the client uses to show the Multijoueur button', async () => {
    const r = await fetch(url('/api/kr'));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ kr: 'server', protocol: 3 });
  });

  it('lets a page on another origin read the probe', async () => {
    const r = await fetch(url('/api/kr'), { headers: { origin: 'https://rzdhop.github.io' } });
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('serves the built game with content types', async () => {
    const page = await fetch(url('/'));
    expect(page.headers.get('content-type')).toMatch(/text\/html/);
    expect(await page.text()).toContain('<title>kr</title>');
    expect((await fetch(url('/app.js'))).headers.get('content-type')).toMatch(/javascript/);
    expect((await fetch(url('/nope.js'))).status).toBe(404);
  });

  it('serves the icons the game links, the bare /favicon.ico a browser asks for included', async () => {
    for (const [f, type] of [['favicon.ico', 'image/x-icon'], ['favicon.svg', 'image/svg+xml'], ['favicon-32.png', 'image/png'], ['apple-touch-icon.png', 'image/png']]) {
      const r = await fetch(url('/' + f));
      expect(r.status, f).toBe(200);
      expect(r.headers.get('content-type'), f).toBe(type);
    }
  });

  it('never serves a file outside the game build', async () => {
    const r = await fetch(url('/%2e%2e/%2e%2e/package.json'));
    expect([403, 404]).toContain(r.status);
  });

  // DEC-055: hashed assets are immutable, the rest revalidate with an ETag.
  it('caches the hashed assets for a year and the page not at all', async () => {
    const chunk = await fetch(url('/assets/chunk-abc123.js'), { headers: { 'accept-encoding': 'identity' } });
    expect(chunk.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    for (const p of ['/', '/index.html', '/app.js', '/favicon.svg']) {
      const r = await fetch(url(p), { headers: { 'accept-encoding': 'identity' } });
      expect(r.headers.get('cache-control'), p).toBe('no-cache');
      expect(r.headers.get('etag'), p).toMatch(/^W\/"[0-9a-f]+-[0-9a-f]+"$/);
    }
  });

  it('answers 304 to a page the browser already has, and 200 once it changed', async () => {
    const first = await fetch(url('/'), { headers: { 'accept-encoding': 'identity' } });
    const etag = first.headers.get('etag');
    const again = await fetch(url('/'), { headers: { 'accept-encoding': 'identity', 'if-none-match': etag } });
    expect(again.status).toBe(304);
    expect(again.headers.get('etag')).toBe(etag);
    expect(await again.text()).toBe('');
    const stale = await fetch(url('/'), { headers: { 'accept-encoding': 'identity', 'if-none-match': 'W/"0-0"' } });
    expect(stale.status).toBe(200);
    // a HEAD carries the same headers and no body
    const head = await fetch(url('/'), { method: 'HEAD', headers: { 'accept-encoding': 'identity' } });
    expect(head.headers.get('etag')).toBe(etag);
    expect(head.headers.get('content-length')).toBe(String(Buffer.byteLength('<!doctype html><title>kr</title>')));
  });

  it('serves a text asset from its brotli sibling, else gzip, else as is, with Vary', async () => {
    const raw = Buffer.byteLength(CHUNK);
    const br = await fetch(url('/assets/chunk-abc123.js'), { headers: { 'accept-encoding': 'gzip, deflate, br' } });
    expect(br.headers.get('content-encoding')).toBe('br');
    expect(br.headers.get('vary')).toBe('Accept-Encoding');
    expect(br.headers.get('content-type')).toMatch(/javascript/);
    expect(Number(br.headers.get('content-length'))).toBeLessThan(raw);
    expect(await br.text()).toBe(CHUNK);                                       // fetch inflates it
    const gz = await fetch(url('/assets/chunk-abc123.js'), { headers: { 'accept-encoding': 'gzip;q=1, br;q=0' } });
    expect(gz.headers.get('content-encoding')).toBe('gzip');
    expect(await gz.text()).toBe(CHUNK);
    const plain = await fetch(url('/assets/chunk-abc123.js'), { headers: { 'accept-encoding': 'identity' } });
    expect(plain.headers.get('content-encoding')).toBeNull();
    expect(plain.headers.get('content-length')).toBe(String(raw));
    expect(await plain.text()).toBe(CHUNK);
    // each encoding has its own ETag, so a cache never hands a brotli body to a client that cannot read it
    expect(br.headers.get('etag')).not.toBe(plain.headers.get('etag'));
    expect(br.headers.get('etag')).toContain('-br');
    // no sibling, or a binary file: as is
    const none = await fetch(url('/assets/plain-def456.js'), { headers: { 'accept-encoding': 'br, gzip' } });
    expect(none.headers.get('content-encoding')).toBeNull();
    expect(await none.text()).toBe('export const plain = 1;');
    const icon = await fetch(url('/favicon-32.png'), { headers: { 'accept-encoding': 'br, gzip' } });
    expect(icon.headers.get('vary')).toBeNull();
    expect(icon.headers.get('content-encoding')).toBeNull();
  });
});

describe('lobby over WebSocket', () => {
  it('creates a room, lets a guest join by code, and keeps both in sync', async () => {
    const alice = await account('Alice');
    const a = await hello(alice), b = await hello('Bob');
    const wa = a.welcome, wb = b.welcome;
    expect(wa.profile.name).toBe(alice.name);
    expect(wa.profile).toMatchObject({ coins: 0, owned: { chars: [], parts: [], trails: [] }, reachable: ['victor', 'gege', 'maurice', 'capucine'] });
    expect(wb.profile).toBeNull();
    a.send({ t: 'create' });
    const { room } = await a.next(isRoom(r => r.players.length === 1));
    expect(room.host).toBe(wa.id);
    expect(room.code).toMatch(/^[A-Z]{4}$/);
    // a guest owns the commons only: the gold wheels it sends are dropped, its colours kept (DEC-035)
    b.send({ t: 'join', code: room.code.toLowerCase(), style: { wheels: 'gold', trail: 'laser', body: '#112233' } });
    const both = await a.next(isRoom(r => r.players.length === 2));
    expect(both.room.players[1].style).toEqual({ body: '#112233' });
    expect(both.room.players.map(p => p.name)).toEqual([alice.name, 'Bob']);
    expect(both.room.players.map(p => p.guest)).toEqual([false, true]);
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
    const a = await hello(await account()), b = await hello('B'); const wb = b.welcome;
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

describe('accounts', () => {
  it('signs up, refuses a taken name or a bad password, logs in and out', async () => {
    const r = await post('/api/register', { name: 'Marianne', password: 'liberte' });
    expect(r.status).toBe(200);
    const { token, profile } = await r.json();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(profile).toMatchObject({ name: 'Marianne', xp: 0, level: 1, unlocked: ['victor', 'gege', 'maurice', 'capucine'] });
    expect((await post('/api/register', { name: 'marianne', password: 'egalite' })).status).toBe(409);
    expect((await post('/api/register', { name: 'Jo', password: 'egalite' })).status).toBe(400);
    expect((await post('/api/register', { name: 'Fraternite', password: '123' })).status).toBe(400);
    expect((await post('/api/login', { name: 'MARIANNE', password: 'nope' })).status).toBe(401);
    const login = await (await post('/api/login', { name: 'MARIANNE', password: 'liberte' })).json();
    expect(login.profile.name).toBe('Marianne');
    const me = await fetch(url('/api/me'), { headers: { authorization: 'Bearer ' + login.token } });
    expect((await me.json()).profile.name).toBe('Marianne');
    await post('/api/logout', {}, login.token);
    expect((await fetch(url('/api/me'), { headers: { authorization: 'Bearer ' + login.token } })).status).toBe(401);
    // the first session still works
    expect((await fetch(url('/api/me'), { headers: { authorization: 'Bearer ' + token } })).status).toBe(200);
  });

  it('answers the browser preflight for another origin', async () => {
    const r = await fetch(url('/api/login'), { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-headers')).toMatch(/authorization/);
  });

  it('awards experience for a solo race, at most once a minute', async () => {
    const u = await account();
    const first = await (await post('/api/progress', { rank: 0, field: 6, finished: true }, u.token)).json();
    expect(first.gained).toBe(70);
    expect(first.profile.xp).toBe(70);
    const again = await (await post('/api/progress', { rank: 0, field: 6, finished: true }, u.token)).json();
    expect(again).toMatchObject({ gained: 0, coins: 0, bonus: { daily: false, levelUp: false, levelUpCoins: 0 } });
    expect((await post('/api/progress', { rank: 0 })).status).toBe(401);
  });

  it('pays a solo race in politicoins and keeps its stats: circuit, candidate, times', async () => {
    const u = await account();
    const r = await (await post('/api/progress', { rank: 1, field: 6, finished: true, trackId: 'bourbon', charId: 'gege', time: 201.5, bestLap: 55.25 }, u.token)).json();
    expect(r).toMatchObject({ gained: 60, coins: 45 + 50, bonus: { daily: true, levelUp: false, levelUpCoins: 0 } });
    expect(r.profile.coins).toBe(95);
    expect(r.profile.stats).toMatchObject({ races: 1, podiums: 1, wins: 0, solo: 1, team: 0, bestLap: { bourbon: 55.25 }, bestTime: { bourbon: 201.5 }, byChar: { gege: 1 }, coinsEarned: 95 });
    // anything else in those fields is ignored, never refused
    const v = await account();
    const odd = await (await post('/api/progress', { rank: 5, field: 6, finished: true, trackId: 'nowhere', charId: '__proto__', time: 'fast', bestLap: 2 }, v.token)).json();
    expect(odd).toMatchObject({ gained: 20, coins: 12 + 50 });
    expect(odd.profile.stats).toMatchObject({ races: 1, bestLap: {}, bestTime: {}, byChar: {} });
  });

  it('keeps guests out of room creation and away from locked candidates', async () => {
    const g = await hello('Invité');
    g.send({ t: 'create' });
    expect((await g.next(m => m.t === 'error')).msg).toMatch(/Connectez-vous/);
    const host = await hello(await account());
    host.send({ t: 'create' }); const { room } = await host.next(isRoom(() => true));
    g.send({ t: 'join', code: room.code }); await g.next(isRoom(r => r.players.length === 2));
    g.send({ t: 'set', charId: 'thierry' });
    expect((await g.next(m => m.t === 'error')).msg).toMatch(/invité/);
    host.send({ t: 'set', charId: 'thierry' });
    expect((await host.next(m => m.t === 'error')).msg).toMatch(/débloqué/);
    g.close(); host.close();
  });

  it('awards experience to the accounts in a team race', async () => {
    const u = await account();
    const a = await hello(u), b = await hello('Guest');
    a.send({ t: 'create' }); const { room } = await a.next(isRoom(() => true));
    b.send({ t: 'join', code: room.code }); await a.next(isRoom(r => r.players.length === 2));
    b.send({ t: 'set', ready: true }); await a.next(isRoom(r => r.players[1]?.ready));
    a.send({ t: 'start' }); await a.next(isRoom(r => r.phase === 'race'));
    const race = races.at(-1);
    const slotA = race.roster.findIndex(s => s.playerId === a.welcome.id), slotB = race.roster.findIndex(s => s.playerId === b.welcome.id);
    race.io.done({
      ranking: [{ slot: slotA, rank: 0, finished: true, team: 'bleu', isAI: false, time: 130, bestLap: 41.5 }, { slot: slotB, rank: 1, finished: true, team: 'rouge', isAI: false }],
      teams: [{ team: 'bleu', points: 10, drivers: [slotA] }, { team: 'rouge', points: 8, drivers: [slotB] }],
    });
    const p = await a.next(m => m.t === 'profile');
    expect(p.gained).toBe(70 + 20);          // winner, and the winning team
    expect(p.profile.xp).toBe(90);
    expect(p.coins).toBe(60 + 20 + 50);      // first place, the winning team, the first race of the day
    expect(p.bonus).toEqual({ daily: true, levelUp: false, levelUpCoins: 0 });
    expect(p.profile.coins).toBe(130);
    expect(p.profile.stats).toMatchObject({ races: 1, wins: 1, podiums: 1, finished: 1, team: 1, teamWins: 1, solo: 0, bestLap: { elysee: 41.5 }, bestTime: { elysee: 130 } });
    expect(b.seen.some(m => m.t === 'profile')).toBe(false);
    a.close(); b.close();
  });
});

describe('friends', () => {
  it('requests, accepts, shows who is online and where, and invites into a room', async () => {
    const ua = await account('Ami'), ub = await account('Amie');
    const a = await hello(ua), b = await hello(ub);
    a.send({ t: 'friendAdd', name: ub.name });
    expect((await a.next(m => m.t === 'notice')).msg).toMatch(/Demande envoyée/);
    const incoming = await b.next(m => m.t === 'friends' && m.list.some(f => f.status === 'incoming'));
    expect(incoming.list[0]).toMatchObject({ name: ua.name, status: 'incoming', online: false });

    a.send({ t: 'invite', id: b.welcome.profile.id });
    expect((await a.next(m => m.t === 'error')).msg).toMatch(/salle/);

    b.send({ t: 'friendAccept', id: incoming.list[0].id });
    const fa = await a.next(m => m.t === 'friends' && m.list.some(f => f.status === 'friend'));
    expect(fa.list[0]).toMatchObject({ name: ub.name, online: true, room: null });

    a.send({ t: 'create' }); const { room } = await a.next(isRoom(() => true));
    await b.next(m => m.t === 'friends' && m.list[0]?.room === room.code);
    a.send({ t: 'invite', id: b.welcome.profile.id });
    const inv = await b.next(m => m.t === 'invite');
    expect(inv).toMatchObject({ from: { name: ua.name }, code: room.code });

    b.close();
    await a.next(m => m.t === 'friends' && m.list[0]?.online === false);
    a.send({ t: 'friendRemove', id: b.welcome.profile.id });
    await a.next(m => m.t === 'friends' && m.list.length === 0);
    a.close();
  });

  it('turns two crossed requests into a friendship, and refuses strangers and guests', async () => {
    const ua = await account(), ub = await account();
    const a = await hello(ua), b = await hello(ub), g = await hello('Anonyme');
    a.send({ t: 'friendAdd', name: ub.name }); await a.next(m => m.t === 'notice');
    b.send({ t: 'friendAdd', name: ua.name });
    expect((await b.next(m => m.t === 'notice')).msg).toMatch(/maintenant ami/);
    a.send({ t: 'friendAdd', name: 'PersonneIci' });
    expect((await a.next(m => m.t === 'error')).msg).toMatch(/Aucun compte/);
    g.send({ t: 'friendAdd', name: ua.name });
    expect((await g.next(m => m.t === 'error')).msg).toMatch(/Connectez-vous/);
    a.close(); b.close(); g.close();
  });
});

// DEC-052: a race's controls and the round-trip pings go past the per-connection queue,
// snapshots go out already stringified and skip a socket that has not drained.
describe('race traffic', () => {
  /** A server of its own (options for startServer), an account in a room of its own, and the race started there. */
  async function racing(opts = {}) {
    const store = opts.store ?? openFileStore(null);
    const own = await startServer({ port: 0, host: '127.0.0.1', staticDir: dir, runRace: fakeRace, loginTries: 1000, ...opts, store });
    const r = await fetch(`http://127.0.0.1:${own.port}/api/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Pilote' + (++seq), password: 'secret1' }) });
    const { token } = await r.json();
    const c = client(own.port); await c.open;
    c.send({ t: 'hello', token }); const welcome = await c.next(m => m.t === 'welcome', 5000);
    c.send({ t: 'create' }); await c.next(isRoom(() => true));
    c.send({ t: 'start' }); await c.next(isRoom(room => room.phase === 'race'));
    return { own, c, token, welcome, race: races.at(-1) };
  }

  it('answers a ping at once with its number and time', async () => {
    const c = await hello('Pingueur');
    c.send({ t: 'ping', n: 7, at: 1234.5 });
    expect(await c.next(m => m.t === 'pong')).toEqual({ t: 'pong', n: 7, at: 1234.5 });
    c.close();
  });

  it('hands an input to the race, and answers a ping, while a slow hello is still being looked up', async () => {
    const base = openFileStore(null); let slow = false;
    const store = { ...base, sessionUser: t => (slow ? new Promise(ok => setTimeout(() => ok(base.sessionUser(t)), 400)) : base.sessionUser(t)) };
    const { own, c, token, race } = await racing({ store });
    try {
      slow = true;
      c.send({ t: 'hello', token });                                    // a re-login: the store takes 400 ms
      c.send({ t: 'input', seq: 1, c: { throttle: true } });
      c.send({ t: 'ping', n: 1, at: 1 });
      await c.next(m => m.t === 'pong', 300);                           // well before the hello's answer
      expect(race.inputs.map(([, m]) => m)).toEqual([{ t: 'input', seq: 1, c: { throttle: true } }]);
      expect(c.seen.some(m => m.t === 'welcome')).toBe(false);
      await c.next(m => m.t === 'welcome', 2000);
    } finally { c.close(); await own.close(); }
  });

  it('holds inputs back by POLITIKART_TEST_DELAY_MS when it is set, and only then', async () => {
    const { own, c, race } = await racing({ inputDelayMs: 150 });
    try {
      const t = Date.now();
      c.send({ t: 'input', seq: 1, c: {} });
      c.send({ t: 'ping', n: 1, at: 1 }); await c.next(m => m.t === 'pong');   // pings are not held back
      expect(race.inputs).toHaveLength(0);
      for (let n = 0; n < 40 && !race.inputs.length; n++) await new Promise(ok => setTimeout(ok, 25));
      expect(race.inputs).toHaveLength(1);
      expect(Date.now() - t).toBeGreaterThanOrEqual(140);
    } finally { c.close(); await own.close(); }
  });

  it('sends a stringified snapshot as it is, and skips it for a socket over the backlog limit', async () => {
    const open = await racing();
    try {
      open.race.io.sendRaw(open.welcome.id, '{"t":"snap","s":{"tk":3},"ev":[],"fx":[]}');
      expect(await open.c.next(m => m.t === 'snap')).toEqual({ t: 'snap', s: { tk: 3 }, ev: [], fx: [] });
    } finally { open.c.close(); await open.own.close(); }
    const full = await racing({ maxBuffered: -1 });                     // every socket counts as backed up
    try {
      full.race.io.sendRaw(full.welcome.id, '{"t":"snap","s":{"tk":3},"ev":[],"fx":[]}');
      full.race.io.send(full.welcome.id, { t: 'notice', msg: 'après' });  // the other messages still go
      await full.c.next(m => m.t === 'notice' && m.msg === 'après');
      expect(full.c.seen.some(m => m.t === 'snap')).toBe(false);
    } finally { full.c.close(); await full.own.close(); }
  });
});
