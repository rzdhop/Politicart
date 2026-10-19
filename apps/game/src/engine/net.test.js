import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  adminLogin, adminLogout, connect, disconnect, fetchAdmin, fetchRoster, getNet, joinRoom, onNet, onRace, onSnap, probeServer, saveRoster, sendInput, serverUrl, setTransport,
} from './net.js';

// A stand-in WebSocket: records what is sent and lets the test play the server.
class FakeSocket {
  static last = null;
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeSocket.last = this; }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  serve(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

beforeEach(() => { setTransport(FakeSocket); });
afterEach(() => { disconnect(); });

describe('net client', () => {
  it('derives the socket URL from the page origin', () => {
    expect(serverUrl({ protocol: 'http:', host: '192.168.1.20:8080' })).toBe('ws://192.168.1.20:8080/ws');
    expect(serverUrl({ protocol: 'https:', host: 'kr.fly.dev' })).toBe('wss://kr.fly.dev/ws');
  });

  it('detects the game server only from its own probe', async () => {
    expect(await probeServer(async () => ({ ok: true, json: async () => ({ kr: 'server' }) }))).toBe(true);
    expect(await probeServer(async () => ({ ok: true, json: async () => { throw new Error('html'); } }))).toBe(false);
    expect(await probeServer(async () => ({ ok: false }))).toBe(false);
    expect(await probeServer(async () => { throw new Error('offline'); })).toBe(false);
    expect(await probeServer(undefined)).toBe(false);
  });

  it('says hello on open and mirrors the room the server sends', () => {
    const seen = []; const off = onNet(v => seen.push(v.status));
    connect('ws://x/ws', 'Alice');
    const s = FakeSocket.last;
    expect(getNet().status).toBe('connecting');
    s.open();
    expect(s.sent[0]).toEqual({ t: 'hello', name: 'Alice' });
    s.serve({ t: 'welcome', id: 'me' });
    s.serve({ t: 'room', room: { code: 'ABCD', players: [] } });
    expect(getNet()).toMatchObject({ status: 'open', id: 'me', room: { code: 'ABCD' } });
    s.serve({ t: 'error', msg: 'Ce candidat est déjà pris.' });
    expect(getNet().error).toMatch(/déjà pris/);
    expect(seen).toEqual(['connecting', 'open', 'open', 'open', 'open']);
    off();
  });

  it('sends commands only on an open socket', () => {
    connect('ws://x/ws', 'Bob'); const s = FakeSocket.last;
    joinRoom('ABCD');
    expect(s.sent).toEqual([]);
    s.open(); joinRoom('ABCD'); sendInput({ throttle: true }, 1, 0);
    expect(s.sent.slice(1)).toEqual([{ t: 'join', code: 'ABCD' }, { t: 'input', c: { throttle: true }, item: 1, power: 0 }]);
  });

  it('hands race traffic to the race handlers', () => {
    const races = [], snaps = [];
    onRace(m => races.push(m)); onSnap(m => snaps.push(m));
    connect('ws://x/ws', 'C'); const s = FakeSocket.last; s.open();
    s.serve({ t: 'race', trackIdx: 1, roster: [], you: 4 });
    s.serve({ t: 'snap', s: { tk: 3 } });
    expect(races[0].you).toBe(4);
    expect(snaps[0].s.tk).toBe(3);
  });

  it('reports a lost connection and forgets the room', () => {
    connect('ws://x/ws', 'D'); const s = FakeSocket.last; s.open();
    s.serve({ t: 'room', room: { code: 'ABCD' } });
    s.close();
    expect(getNet()).toMatchObject({ status: 'closed', room: null });
    expect(getNet().error).toMatch(/perdue/);
  });
});

/** A fetch that answers every call with `status` and `body`, and records the calls. */
function fakeFetch(status, body) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('no body'); return body; } };
  };
  fn.calls = calls;
  return fn;
}

describe('admin and roster calls', () => {
  it('fetch the roster, and say null when the server cannot', async () => {
    const roster = { chars: { victor: { name: 'X' } }, ads: [] };
    expect(await fetchRoster(fakeFetch(200, roster))).toEqual(roster);
    expect(await fetchRoster(fakeFetch(500, { error: 'x' }))).toBeNull();
    expect(await fetchRoster(async () => { throw new Error('offline'); })).toBeNull();
    expect(await fetchRoster(undefined)).toBeNull();
  });

  it('read the admin session, defaulting to no admin on anything unexpected', async () => {
    expect(await fetchAdmin(fakeFetch(200, { enabled: true, admin: true, user: 'rida' }))).toEqual({ enabled: true, admin: true, user: 'rida' });
    expect(await fetchAdmin(fakeFetch(200, { enabled: true, admin: false }))).toEqual({ enabled: true, admin: false });
    expect(await fetchAdmin(fakeFetch(200, { kr: 'server' }))).toEqual({ enabled: false, admin: false });
    expect(await fetchAdmin(fakeFetch(404, undefined))).toEqual({ enabled: false, admin: false });
    expect(await fetchAdmin(async () => { throw new Error('offline'); })).toEqual({ enabled: false, admin: false });
  });

  it('log in with a same-origin JSON POST, the password only in the body', async () => {
    const f = fakeFetch(204, undefined);
    expect(await adminLogin('rida', 's3cret', f)).toEqual({ ok: true });
    const [{ url, init }] = f.calls;
    expect(url).toBe('./api/admin/login');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ user: 'rida', password: 's3cret' });
    expect(url).not.toContain('s3cret');
  });

  it('report a refused login in the server words, or a French fallback', async () => {
    expect(await adminLogin('rida', 'x', fakeFetch(401, { error: 'Identifiant ou mot de passe incorrect.' })))
      .toEqual({ ok: false, status: 401, error: 'Identifiant ou mot de passe incorrect.' });
    expect(await adminLogin('rida', 'x', fakeFetch(429, { error: 'Trop de tentatives. Réessayez dans une minute.' })))
      .toMatchObject({ ok: false, status: 429, error: 'Trop de tentatives. Réessayez dans une minute.' });
    expect(await adminLogin('rida', 'x', fakeFetch(503, undefined))).toMatchObject({ ok: false, status: 503, error: 'Administration désactivée.' });
    expect(await adminLogin('rida', 'x', async () => { throw new Error('offline'); })).toMatchObject({ ok: false, status: 0, error: 'Serveur injoignable.' });
  });

  it('log out with a JSON POST', async () => {
    const f = fakeFetch(204, undefined);
    expect(await adminLogout(f)).toBe(true);
    expect(f.calls[0].url).toBe('./api/admin/logout');
    expect(f.calls[0].init.headers['content-type']).toBe('application/json');
    expect(await adminLogout(fakeFetch(503, { error: 'x' }))).toBe(false);
  });

  it('save the roster with a JSON PUT and hand back what the server stored, or the field it refused', async () => {
    const stored = { chars: { victor: { name: 'Y' } }, ads: [] };
    const f = fakeFetch(200, stored);
    expect(await saveRoster({ chars: { victor: { name: ' Y ' } }, ads: [] }, f)).toEqual({ ok: true, roster: stored });
    expect(f.calls[0].url).toBe('./api/admin/roster');
    expect(f.calls[0].init.method).toBe('PUT');
    expect(JSON.parse(f.calls[0].init.body)).toEqual({ chars: { victor: { name: ' Y ' } }, ads: [] });
    expect(await saveRoster({}, fakeFetch(400, { error: 'chars.victor.name : 28 caractères au plus.', field: 'chars.victor.name' })))
      .toEqual({ ok: false, status: 400, error: 'chars.victor.name : 28 caractères au plus.', field: 'chars.victor.name' });
    expect(await saveRoster({}, fakeFetch(413, undefined))).toMatchObject({ ok: false, status: 413 });
    expect(await saveRoster({}, fakeFetch(401, { error: 'Connexion administrateur requise.' }))).toMatchObject({ ok: false, status: 401 });
  });
});
