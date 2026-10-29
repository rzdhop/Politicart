// The networked client, end to end in node: a real headless race is recorded
// as the server would send it, then replayed into the client.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CHARACTERS } from './data.js';
import { drain } from './events.js';
import { setInputSource } from './input.js';
import { defaultStyle, playerStyle } from './kartstyle.js';
import { useItem } from './items.js';
import { getState, resetMachine, transition } from './machine.js';
import { connect, disconnect, setTransport } from './net.js';
import { encodeKartPrivate, encodeSnapshot } from './netstate.js';
import { abortNetRace, beginNetRace, finishNetRace, isNetRace, netStep, onNetResults, pressItem, receiveKartJoin, receivePong, receiveSnap } from './netrace.js';
import { lastSeq } from './predict.js';
import { simStep, startField } from './race.js';
import { G } from './state.js';
import { MIN_SPEED } from './trail.js';

const ROSTER = ['victor', 'gege', 'maurice', 'capucine', 'hubert', 'lulu'].map((charId, i) => ({ charId, isAI: i < 4, team: i < 4 ? null : (i === 4 ? 'bleu' : 'rouge'), name: 'P' + i }));
const SEED = 1;                 // the race seed (DEC-049): the "server" below and every client build the same race from it
const SNAPS = [];
let barricadeId = null, staticIds = [];
// A second recording with slot 5 driven, as the race worker would see that client (DEC-052): the
// controls of the client's tick j reach the server for its tick j + D, and the server's snapshot
// of tick T reaches the client D ticks later, so the round trip is about 2D ticks (200 ms).
const D = 6;
const LIVE = [];                 // the messages the client gets: { s, ev, fx, ack, n, me }
const TRUTH = [];                // slot 5 after each server tick
const drive = j => ({ throttle: true, brake: false, left: j % 120 > 70 && j % 120 < 90, right: j % 120 > 20 && j % 120 < 35, drift: false });

// A fixed-seed Math.random (mulberry32) for the recording. The AI picks lanes
// and powers at random; unseeded, a kart now and then drove into the barricade
// before snapshot 354 and the hazard assertion failed about one run in 25.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeAll(() => {
  // "Server": race 6 s at 60 Hz, a snapshot every third tick, a barricade dropped at 5 s.
  const random = vi.spyOn(Math, 'random').mockImplementation(seeded(1));
  resetMachine('tracks'); G.trackIdx = 0;
  startField(ROSTER.map(s => ({ def: CHARACTERS.find(c => c.id === s.charId), isAI: s.isAI, team: s.team })), { seed: SEED });
  staticIds = G.hazards.map(h => h.id);
  for (let tick = 1; tick <= 360; tick++) {
    if (tick === 300) {
      const k = G.karts[4]; k.item = 'greve'; k.itemRolling = 0; useItem(k);
      // parked well off the road, so no kart can drive into it before snapshot 354, whatever the AI does
      const h = G.hazards.at(-1); h.x += 500; h.z += 500; barricadeId = h.id;
    }
    simStep(1 / 60);
    if (tick % 3 === 0) SNAPS.push(JSON.parse(JSON.stringify(encodeSnapshot(G, tick))));
  }
  drain();

  random.mockImplementation(seeded(2));
  resetMachine('tracks'); G.trackIdx = 0;
  startField(ROSTER.map(s => ({ def: CHARACTERS.find(c => c.id === s.charId), isAI: s.isAI, team: s.team })), { seed: SEED });
  const k5 = G.karts[5]; let T = 0;
  k5.ctrl = () => (T - D >= 1 ? drive(T - D) : { throttle: false, brake: false, left: false, right: false, drift: false });
  for (T = 1; T <= 700; T++) {
    simStep(1 / 60);
    TRUTH[T] = { x: k5.pos.x, z: k5.pos.z, idx: k5.idx, lap: k5.lap };
    if (T % 3 === 0) {
      LIVE.push(JSON.parse(JSON.stringify({ s: encodeSnapshot(G, T), ev: [], fx: [], ...(T - D >= 1 ? { ack: T - D, n: 1 } : {}), me: encodeKartPrivate(k5) })));
    }
  }
  drain();
  random.mockRestore();
});
afterEach(() => { abortNetRace(); disconnect(); });

function clientInLobby() { resetMachine('title'); transition('lobby'); }

describe('a networked race on the client', () => {
  it('builds the announced grid and follows our slot', () => {
    clientInLobby();
    beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5, seed: SEED });
    expect(isNetRace()).toBe(true);
    expect(getState()).toBe('countdown');
    expect(G.karts.map(k => k.def.id)).toEqual(ROSTER.map(s => s.charId));
    expect(G.player).toBe(G.karts[5]);
    expect(G.karts[4].team).toBe('bleu');
  });

  it('builds a kart that joins the race in progress at the slot the server names, and nothing else (DEC-031)', () => {
    clientInLobby();
    beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5, seed: SEED });
    receiveKartJoin({ slot: 9, entry: { charId: 'thierry', name: 'Rida', isAI: false, team: null, god: true } });   // not the next slot: ignored
    expect(G.karts).toHaveLength(6);
    receiveKartJoin({ slot: 6, entry: { charId: 'thierry', name: 'Rida', isAI: false, team: null, god: true, style: { wheels: 'gold' } } });
    expect(G.karts).toHaveLength(7);
    expect(G.karts[6]).toMatchObject({ god: true, team: null });
    expect(G.karts[6].style.wheels).toBe('gold');
    expect(G.netRoster.at(-1).name).toBe('Rida');
    expect(G.player).toBe(G.karts[5]);
    netStep(1 / 60);                                     // snapshots without the seventh kart do not break the frame
  });

  it("draws each human's kart with their Garage edits over the candidate default, and AI with the default", () => {
    clientInLobby();
    const roster = ROSTER.map((s, i) => (i === 4 ? { ...s, style: { wheels: 'gold', number: 7 } } : s));
    beginNetRace({ trackIdx: 0, roster, you: 5, seed: SEED });
    const def = id => CHARACTERS.find(c => c.id === id);
    expect(G.karts[4].style).toEqual(playerStyle(def(roster[4].charId), { wheels: 'gold', number: 7 }));
    expect(G.karts[0].style).toEqual(defaultStyle(def(roster[0].charId)));
    expect(G.karts[5].style).toEqual(defaultStyle(def(roster[5].charId)));
  });

  it("gives a slot's kart the trail of its style, in the scene, and none to the rest (DEC-036)", () => {
    clientInLobby();
    const roster = ROSTER.map((s, i) => (i === 0 ? { ...s, style: { trail: 'laser' } } : s));
    beginNetRace({ trackIdx: 0, roster, you: 5, seed: SEED });
    const trail = G.karts[0].mesh.userData.trail;
    expect(trail).not.toBeNull();
    expect(trail.group.name).toBe('trail:laser');
    expect(G.scene.children).toContain(trail.group);
    expect(G.karts.filter(k => k.mesh.userData.trail)).toHaveLength(1);
    for (const s of SNAPS) receiveSnap({ s, ev: [], fx: [] });      // 6 s in: the field is racing
    for (let n = 0; n < 30; n++) netStep(1 / 60);
    expect(G.karts[0].speed).toBeGreaterThan(MIN_SPEED);
    expect(trail.group.children.filter(o => o.visible).length).toBeGreaterThan(0);   // a kart at speed, drawn through updateKartVisual, trails
  });

  it('draws the karts between snapshots, goes green with the server, and mirrors hazards', () => {
    clientInLobby();
    beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5, seed: SEED });
    for (const s of SNAPS) receiveSnap({ s, ev: [], fx: [] });
    const payload = netStep(1 / 60);
    // Rendered six ticks behind the newest snapshot (tick 360): snapshot 354, give or take the
    // milliseconds between receiving and stepping, which is a fraction of a tick.
    const at354 = SNAPS.find(s => s.tk === 354);
    G.karts.forEach((k, i) => { expect(k.pos.x).toBeCloseTo(at354.k[i].x, 0); expect(k.pos.z).toBeCloseTo(at354.k[i].z, 0); });
    expect(getState()).toBe('race');
    expect(payload.rank).toBe(at354.k[5].rk);
    expect(G.karts[0].mesh.position.x).toBeCloseTo(G.karts[0].pos.x, 5);
    const ids = at354.h.map(h => h.id);
    expect(ids).toContain(barricadeId);
    expect(G.scene.children.filter(o => o.isGroup && Math.abs(o.position.x - at354.h.at(-1).x) < 1e-6)).not.toHaveLength(0);
  });

  it('replays our messages through the usual queue and ignores stale snapshots', () => {
    clientInLobby();
    beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5, seed: SEED });
    drain();
    receiveSnap({ s: SNAPS[10], ev: [['toast', 'TOUR 2 — 0:31.2']], fx: [] });
    receiveSnap({ s: SNAPS[5], ev: [['toast', 'stale']], fx: [] });
    expect(drain()).toEqual([{ type: 'toast', text: 'TOUR 2 — 0:31.2' }]);
  });

  it('sends controls and counts presses so none is lost or doubled', () => {
    const sent = [];
    class Sock { constructor() { this.readyState = 1; queueMicrotask(() => this.onopen?.()); } send(s) { sent.push(JSON.parse(s)); } close() {} }
    setTransport(Sock); connect('ws://x/ws', 'me');
    return new Promise(r => setTimeout(r, 0)).then(() => {
      clientInLobby(); beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5, seed: SEED });
      pressItem(); pressItem();
      netStep(1 / 60);
      expect(sent.filter(m => m.t === 'input')).toEqual([]);   // nothing until the first frame has been drawn
      netStep(1 / 60);
      const inputs = sent.filter(m => m.t === 'input');
      expect(inputs.at(-1)).toMatchObject({ item: 2, power: 0, c: { throttle: false } });
      expect(inputs.at(-1).seq).toBe(1);                         // the first tick numbered
      expect(sent.filter(m => m.t === 'ping')).toHaveLength(1);   // and a ping, to time the round trip
    });
  });

  it('shows the results the server sends and hands them to the UI', () => {
    let got = null; onNetResults(r => { got = r; });
    clientInLobby(); beginNetRace({ trackIdx: 0, roster: ROSTER, you: 4, seed: SEED });
    for (const s of SNAPS) receiveSnap({ s, ev: [], fx: [] });
    netStep(1 / 60);
    finishNetRace({ ranking: [], teams: [{ team: 'bleu', name: 'Bleu', points: 10, drivers: [4] }] });
    expect(getState()).toBe('results');
    expect(isNetRace()).toBe(false);
    expect(got).toMatchObject({ you: 4, teams: [{ team: 'bleu', points: 10 }] });
  });

  it('builds the circuit\'s static obstacles from the seed, by the server\'s ids, and drops one the server has mown (DEC-049)', () => {
    clientInLobby();
    beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5, seed: SEED });
    expect(staticIds.length).toBeGreaterThan(0);
    expect(G.hazards.map(h => h.id)).toEqual(staticIds);                          // the same build as the server's
    const victim = G.hazards[0]; const mesh = victim.mesh;
    expect(G.scene.children).toContain(mesh);
    for (const s of SNAPS.slice(0, 20)) receiveSnap({ s, ev: [], fx: [] });
    netStep(1 / 60);
    expect(G.scene.children).toContain(mesh);                                       // still listed: still there
    const mown = SNAPS.slice(20, 40).map(s => ({ ...s, hs: s.hs.filter(id => id !== victim.id) }));   // the server's fauchage removed it
    for (const s of mown) receiveSnap({ s, ev: [], fx: [] });
    netStep(1 / 60);
    expect(G.scene.children).not.toContain(mesh);
    expect(G.hazards.find(h => h.id === victim.id)).toBeUndefined();
    expect(G.hazards).toHaveLength(staticIds.length - 1);
    finishNetRace({ ranking: [], teams: [] });
    expect(G.hazards.every(h => G.scene.children.includes(h.mesh))).toBe(true);     // the results screen keeps the circuit, obstacles included
  });

  it('refuses a start without a seed (a server older than protocol 2)', () => {
    clientInLobby(); drain();
    beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5 });
    expect(isNetRace()).toBe(false);
    expect(getState()).toBe('lobby');
    expect(drain()).toEqual([{ type: 'toast', text: 'SERVEUR TROP ANCIEN' }]);
  });

  it('turns the server\'s echo of a ping into the round trip the HUD shows', () => {
    const t = vi.spyOn(performance, 'now').mockReturnValue(1000);
    try {
      clientInLobby(); beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5, seed: SEED });
      expect(netStep(1 / 60).net.rtt).toBeNull();
      t.mockReturnValue(1080); receivePong({ n: 1, at: 1000 });
      expect(netStep(1 / 60).net).toMatchObject({ rtt: 80, delay: 100 });
    } finally { t.mockRestore(); }
  });

  it('falls back to the lobby when the race is abandoned', () => {
    clientInLobby(); beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5, seed: SEED });
    abortNetRace();
    expect(getState()).toBe('lobby');
    expect(isNetRace()).toBe(false);
  });
});

/**
 * Play the LIVE recording into a client driving slot 5 with the same script,
 * frame by frame at 60 fps on a mocked clock. A snapshot of tick T arrives
 * at frame T + D + late(T). Returns what each frame showed and sent.
 */
async function playLive({ acks = true, late = () => 0, frames = 560, at = null, finishAt = Infinity } = {}) {
  const sent = [];
  class Sock { constructor() { this.readyState = 1; queueMicrotask(() => this.onopen?.()); } send(x) { sent.push(JSON.parse(x)); } close() {} }
  setTransport(Sock); connect('ws://x/ws', 'me'); await new Promise(r => setTimeout(r, 0));
  let ms = 0; const clock = vi.spyOn(performance, 'now').mockImplementation(() => ms);
  const shown = [];
  try {
    clientInLobby(); beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5, seed: SEED });
    setInputSource(() => drive(lastSeq() + 1));
    const finished = m => (m.s.tk < finishAt ? m : { ...m, s: { ...m.s, k: m.s.k.map((k, i) => (i === 5 ? { ...k, fin: 1 } : k)) } });   // the server says we crossed the line
    const queue = LIVE.map(m => (acks ? m : { s: m.s, ev: [], fx: [] })).map(finished).map(m => ({ m, due: m.s.tk + D + late(m.s.tk) })).sort((a, b) => a.due - b.due);
    let next = 0;
    for (let f = 0; f <= frames; f++) {
      ms = f * 1000 / 60;
      const before = getState();
      while (next < queue.length && queue[next].due <= f) receiveSnap(queue[next++].m);
      const green = before === 'countdown' && getState() === 'race';
      const p = netStep(1 / 60);
      shown.push({ f, seq: lastSeq(), green, newest: queue[next - 1]?.m.s.tk ?? 0, net: p.net, me: { ...G.player.pos, idx: G.player.idx }, mesh: { x: G.player.mesh.position.x, z: G.player.mesh.position.z }, others: G.karts.slice(0, 5).map(k => ({ ...k.pos })) });
      at?.(f);
    }
  } finally { clock.mockRestore(); setInputSource(null); }
  return { shown, sent };
}

describe('the local kart, predicted (DEC-052)', () => {
  it('runs ahead of the delayed field, where the server will have it, within 2 m', async () => {
    const { shown } = await playLive();
    const racing = shown.filter(x => x.f > 300);
    let worst = 0;
    for (const x of racing) {
      const truth = TRUTH[x.seq + D];                            // the server applies our tick j at its tick j + D
      worst = Math.max(worst, Math.hypot(x.me.x - truth.x, x.me.z - truth.z));
      expect(x.me.idx).toBeGreaterThan(TRUTH[x.newest].idx);   // ahead of the newest snapshot, let alone the delayed field
    }
    expect(worst).toBeLessThan(2);
  });

  it('hands our kart back to the snapshots past the line without a jump on screen', async () => {
    const { shown } = await playLive({ finishAt: 450 });
    const at = shown.findIndex(x => x.newest >= 450);
    expect(shown[at + 1].me.idx).toBeLessThan(shown[at - 1].me.idx);   // the kart itself goes back to the snapshots' place...
    let worst = 0;
    for (let i = 300; i < shown.length; i++) worst = Math.max(worst, Math.hypot(shown[i].mesh.x - shown[i - 1].mesh.x, shown[i].mesh.z - shown[i - 1].mesh.z));
    expect(worst).toBeLessThan(2);                                       // ...but the one on screen eases there (40 m/s is 0.7 m a frame)
  });

  it('leaves the other karts exactly where interpolation puts them', async () => {
    const predicted = await playLive();
    const plain = await playLive({ acks: false });
    const a = predicted.shown.at(-1).others, b = plain.shown.at(-1).others;
    a.forEach((p, i) => { expect(p.x).toBeCloseTo(b[i].x, 9); expect(p.z).toBeCloseTo(b[i].z, 9); });
    // without the server's echo, our kart is drawn like the others, from the snapshots, behind
    const last = plain.shown.at(-1); expect(last.me.idx).toBeLessThan(TRUTH[last.newest].idx + 1);
  });

  it('numbers its ticks without a gap and sends each frame\'s controls with the newest number', async () => {
    const { sent } = await playLive({ frames: 200 });
    const seqs = sent.filter(m => m.t === 'input').map(m => m.seq);
    expect(seqs.length).toBeGreaterThan(150);
    seqs.forEach((q, i) => { expect(Number.isInteger(q)).toBe(true); if (i) expect(q).toBe(seqs[i - 1] + 1); });
    expect(sent.filter(m => m.t === 'ping').length).toBe(4);   // one a second
  });

  it('goes green on the newest snapshot, not on the delayed render tick', async () => {
    const { shown } = await playLive({ frames: 260 });
    const g = shown.find(x => x.green);
    const firstRace = LIVE.find(m => m.s.st === 'race').s.tk;
    expect(g.newest).toBe(firstRace);                           // the frame that delivered the first 'race' snapshot
  });

  it('sizes the others\' delay from the jitter, moving it a tick a second at most', async () => {
    const jitter = tk => ((tk * 7919) % 13) % 7;                // 0 to 6 ticks late, in no order
    const { shown } = await playLive({ late: jitter });
    const d = shown.map(x => x.net.delay);
    for (let i = 60; i < d.length; i++) expect(Math.abs(d[i] - d[i - 60])).toBeLessThanOrEqual(17 + 1);   // a tick (16.7 ms) a second, give or take the rounding
    expect(d.at(-1)).toBeGreaterThan(d[0]);                     // and it did grow towards what the jitter needs
    const calm = await playLive();
    expect(calm.shown.at(-1).net.delay).toBe(100);               // on time: six ticks, as before
  });
});
