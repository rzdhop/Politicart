import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { startServer } from './server.js';

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
