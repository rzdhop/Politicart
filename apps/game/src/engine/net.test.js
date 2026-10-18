import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { connect, disconnect, getNet, joinRoom, onNet, onRace, onSnap, probeServer, sendInput, serverUrl, setTransport } from './net.js';

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

  it('points at a remote server when the build names one', () => {
    const pages = { protocol: 'https:', host: 'rzdhop.github.io' };
    expect(serverUrl(pages, 'https://kr.onrender.com')).toBe('wss://kr.onrender.com/ws');
    expect(serverUrl(pages, 'https://kr.onrender.com/')).toBe('wss://kr.onrender.com/ws');
    expect(serverUrl(pages, 'http://192.168.1.20:8080')).toBe('ws://192.168.1.20:8080/ws');
  });

  it('probes the remote server rather than the page when the build names one', async () => {
    const asked = [];
    const fetchImpl = async u => { asked.push(u); return { ok: true, json: async () => ({ kr: 'server' }) }; };
    expect(await probeServer(fetchImpl, 'https://kr.onrender.com/')).toBe(true);
    expect(await probeServer(fetchImpl)).toBe(true);
    expect(asked).toEqual(['https://kr.onrender.com/api/kr', './api/kr']);
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
