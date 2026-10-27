// The networked client, end to end in node: a real headless race is recorded
// as the server would send it, then replayed into the client.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CHARACTERS } from './data.js';
import { drain } from './events.js';
import { defaultStyle, playerStyle } from './kartstyle.js';
import { useItem } from './items.js';
import { getState, resetMachine, transition } from './machine.js';
import { connect, disconnect, setTransport } from './net.js';
import { encodeSnapshot } from './netstate.js';
import { abortNetRace, beginNetRace, finishNetRace, isNetRace, netStep, onNetResults, pressItem, receiveKartJoin, receiveSnap } from './netrace.js';
import { simStep, startField } from './race.js';
import { G } from './state.js';

const ROSTER = ['victor', 'gege', 'maurice', 'capucine', 'hubert', 'lulu'].map((charId, i) => ({ charId, isAI: i < 4, team: i < 4 ? null : (i === 4 ? 'bleu' : 'rouge'), name: 'P' + i }));
const SNAPS = [];
let barricadeId = null;

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
  startField(ROSTER.map(s => ({ def: CHARACTERS.find(c => c.id === s.charId), isAI: s.isAI, team: s.team })));
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
  random.mockRestore();
});
afterEach(() => { abortNetRace(); disconnect(); });

function clientInLobby() { resetMachine('title'); transition('lobby'); }

describe('a networked race on the client', () => {
  it('builds the announced grid and follows our slot', () => {
    clientInLobby();
    beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5 });
    expect(isNetRace()).toBe(true);
    expect(getState()).toBe('countdown');
    expect(G.karts.map(k => k.def.id)).toEqual(ROSTER.map(s => s.charId));
    expect(G.player).toBe(G.karts[5]);
    expect(G.karts[4].team).toBe('bleu');
  });

  it('builds a kart that joins the race in progress at the slot the server names, and nothing else (DEC-031)', () => {
    clientInLobby();
    beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5 });
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
    beginNetRace({ trackIdx: 0, roster, you: 5 });
    const def = id => CHARACTERS.find(c => c.id === id);
    expect(G.karts[4].style).toEqual(playerStyle(def(roster[4].charId), { wheels: 'gold', number: 7 }));
    expect(G.karts[0].style).toEqual(defaultStyle(def(roster[0].charId)));
    expect(G.karts[5].style).toEqual(defaultStyle(def(roster[5].charId)));
  });

  it('draws the karts between snapshots, goes green with the server, and mirrors hazards', () => {
    clientInLobby();
    beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5 });
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
    beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5 });
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
      clientInLobby(); beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5 });
      pressItem(); pressItem();
      netStep(1 / 60);
      expect(sent.filter(m => m.t === 'input')).toEqual([]);   // nothing until the first frame has been drawn
      netStep(1 / 60);
      const inputs = sent.filter(m => m.t === 'input');
      expect(inputs.at(-1)).toMatchObject({ item: 2, power: 0, c: { throttle: false } });
    });
  });

  it('shows the results the server sends and hands them to the UI', () => {
    let got = null; onNetResults(r => { got = r; });
    clientInLobby(); beginNetRace({ trackIdx: 0, roster: ROSTER, you: 4 });
    for (const s of SNAPS) receiveSnap({ s, ev: [], fx: [] });
    netStep(1 / 60);
    finishNetRace({ ranking: [], teams: [{ team: 'bleu', name: 'Bleu', points: 10, drivers: [4] }] });
    expect(getState()).toBe('results');
    expect(isNetRace()).toBe(false);
    expect(got).toMatchObject({ you: 4, teams: [{ team: 'bleu', points: 10 }] });
  });

  it('falls back to the lobby when the race is abandoned', () => {
    clientInLobby(); beginNetRace({ trackIdx: 0, roster: ROSTER, you: 5 });
    abortNetRace();
    expect(getState()).toBe('lobby');
    expect(isNetRace()).toBe(false);
  });
});
