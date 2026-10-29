import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addFriend, clearInvite, connect, createRoom, disconnect, getNet, inviteFriend, joinRoom, onNet, onPong, onProfile, onRace, onSnap, probeServer, sendInput, sendPing, serverUrl, setTransport } from './net.js';

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
    expect(serverUrl({ protocol: 'https:', host: 'politikart.onrender.com' })).toBe('wss://politikart.onrender.com/ws');
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
    s.open(); joinRoom('ABCD'); sendInput({ throttle: true }, 1, 0, 17); sendPing(3, 1500);
    expect(s.sent.slice(1)).toEqual([{ t: 'join', code: 'ABCD' }, { t: 'input', seq: 17, c: { throttle: true }, item: 1, power: 0 }, { t: 'ping', n: 3, at: 1500 }]);
  });

  it("sends the player's kart style with create and join", () => {
    connect('ws://x/ws', 'Bob'); const s = FakeSocket.last; s.open();
    createRoom({ number: 7 }); joinRoom('ABCD', { wheels: 'gold' });
    expect(s.sent.slice(1)).toEqual([{ t: 'create', style: { number: 7 } }, { t: 'join', code: 'ABCD', style: { wheels: 'gold' } }]);
  });

  it('hands race traffic to the race handlers', () => {
    const races = [], snaps = [], pongs = [];
    onRace(m => races.push(m)); onSnap(m => snaps.push(m)); onPong(m => pongs.push(m));
    connect('ws://x/ws', 'C'); const s = FakeSocket.last; s.open();
    s.serve({ t: 'race', trackIdx: 1, roster: [], you: 4 });
    s.serve({ t: 'snap', s: { tk: 3 } });
    s.serve({ t: 'pong', n: 2, at: 99 });
    expect(races[0].you).toBe(4);
    expect(snaps[0].s.tk).toBe(3);
    expect(pongs).toEqual([{ t: 'pong', n: 2, at: 99 }]);
  });

  it('reports a lost connection and forgets the room', () => {
    connect('ws://x/ws', 'D'); const s = FakeSocket.last; s.open();
    s.serve({ t: 'room', room: { code: 'ABCD' } });
    s.close();
    expect(getNet()).toMatchObject({ status: 'closed', room: null });
    expect(getNet().error).toMatch(/perdue/);
  });
});

describe('the social side of the connection', () => {
  it('says hello with the session token, and again when it changes', () => {
    connect('ws://x/ws', 'Guest', 'tok1'); const sock = FakeSocket.last; sock.open();
    expect(sock.sent[0]).toEqual({ t: 'hello', name: 'Guest', token: 'tok1' });
    connect('ws://x/ws', 'Guest', null);
    expect(sock.sent.at(-1)).toEqual({ t: 'hello', name: 'Guest' });
  });

  it('hands profiles to the store and asks for the friends of an account', () => {
    const got = []; onProfile((p, g) => got.push([p?.name ?? null, g]));
    connect('ws://x/ws', 'A', 'tok'); const sock = FakeSocket.last; sock.open();
    sock.serve({ t: 'welcome', id: 'c1', profile: { name: 'Alice', level: 1 } });
    expect(sock.sent.at(-1)).toEqual({ t: 'friends' });
    sock.serve({ t: 'profile', profile: { name: 'Alice', level: 2 }, gained: 70 });
    expect(got).toEqual([['Alice', 0], ['Alice', 70]]);
  });

  it('passes what a race paid in politicoins, and its bonuses, along with the profile', () => {
    const got = []; onProfile((p, g, c, b) => got.push([p?.name ?? null, g, c, b]));
    connect('ws://x/ws', 'A', 'tok'); const sock = FakeSocket.last; sock.open();
    sock.serve({ t: 'welcome', id: 'c1', profile: { name: 'Alice', level: 1, coins: 0 } });
    sock.serve({ t: 'profile', profile: { name: 'Alice', level: 2, coins: 310 }, gained: 70, coins: 310, bonus: { daily: true, levelUp: true, levelUpCoins: 200 } });
    sock.serve({ t: 'profile', profile: { name: 'Alice', level: 2, coins: 999 } });     // an admin's grant: no race, no bonus
    expect(got).toEqual([
      ['Alice', 0, 0, null],
      ['Alice', 70, 310, { daily: true, levelUp: true, levelUpCoins: 200 }],
      ['Alice', 0, 0, null],
    ]);
  });

  it('keeps the friend list, invitations and notices in the view', () => {
    connect('ws://x/ws', 'A', 'tok'); const sock = FakeSocket.last; sock.open();
    sock.serve({ t: 'friends', list: [{ id: 'u2', name: 'Bob', status: 'friend', online: true }] });
    expect(getNet().friends.map(f => f.name)).toEqual(['Bob']);
    sock.serve({ t: 'invite', from: { id: 'u2', name: 'Bob' }, code: 'ABCD' });
    expect(getNet().invite).toEqual({ from: { id: 'u2', name: 'Bob' }, code: 'ABCD' });
    clearInvite(); expect(getNet().invite).toBeNull();
    sock.serve({ t: 'notice', msg: 'Demande envoyée.' });
    expect(getNet()).toMatchObject({ notice: 'Demande envoyée.', error: null });
    addFriend('Chloé'); inviteFriend('u2');
    expect(sock.sent.slice(-2)).toEqual([{ t: 'friendAdd', name: 'Chloé' }, { t: 'invite', id: 'u2' }]);
    sock.close();
    expect(getNet().friends).toEqual([]);
  });
});
