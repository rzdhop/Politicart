// The local kart's prediction (DEC-052): the replay must reproduce the
// server's kart, stay silent, and the bookkeeping of ack/n, the smoothing
// and the adaptive delay must do what predict.js says.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setSfxSink } from './audio.js';
import { CHARACTERS } from './data.js';
import { drain, pending } from './events.js';
import { resetMachine } from './machine.js';
import { encodeKart, encodeKartPrivate } from './netstate.js';
import { updateKart } from './physics.js';
import { blend, errorOffset, estimateDelay, getHistory, HISTORY, lastSeq, predictTick, reconcile, recordTick, resetPrediction, simulateLocal, SNAP_DIST } from './predict.js';
import { simStep, startField } from './race.js';
import { G, STEP } from './state.js';

const IDLE = { throttle: false, brake: false, left: false, right: false, drift: false };
/** A driver's script: full throttle, weaving, a drift held now and then (no release past a mini-turbo in the windows tested). */
const script = n => ({ throttle: true, brake: false, left: n % 90 < 30, right: n % 90 >= 55 && n % 90 < 75, drift: n % 240 > 200 });

/** Every field of the kart that the step reads or writes, copied (the ramp it is on by reference). */
function raw(k) {
  const o = {};
  for (const [key, v] of Object.entries(k)) if (v === null || typeof v !== 'object' || key === 'rampPrev') o[key] = v;
  o.pos = { ...k.pos }; o.drift = { ...k.drift };
  return o;
}
function restore(k, o) { for (const [key, v] of Object.entries(o)) k[key] = key === 'pos' || key === 'drift' ? { ...v } : v; }

/** One human kart alone on circuit `trackIdx`, nothing else that could touch it, the countdown run out. */
function soloRace(trackIdx = 0, seed = 3) {
  resetMachine('tracks'); G.trackIdx = trackIdx;
  startField([{ def: CHARACTERS[0], isAI: false, local: true }], { seed });
  G.cyclists = []; G.crossings = []; G.hazards = [];
  const k = G.player; let n = 0; k.ctrl = () => script(n);
  while (G.state === 'countdown') simStep(STEP);
  for (; n < 150; n++) simStep(STEP);                 // up to speed
  drain();
  return { k, step: () => { simStep(STEP); n++; }, controls: () => script(n) };
}

beforeEach(() => { resetPrediction(); setSfxSink(null); });
afterEach(() => { G.replaying = false; setSfxSink(null); drain(); });

describe('the replay of the local kart', () => {
  it('reproduces the server kart step by step, within 1e-6 in process', () => {
    const { k, step, controls } = soloRace(0);
    const start = raw(k), t0 = G.time;
    const inputs = [], server = [];
    for (let i = 0; i < 120; i++) { inputs.push(controls()); step(); server.push({ x: k.pos.x, z: k.pos.z, y: k.y, h: k.heading, s: k.speed }); }
    restore(k, start); G.time = t0;
    let worst = 0;
    inputs.forEach((c, i) => {
      G.time = t0 + (i + 1) * STEP; simulateLocal(k, c);
      const s = server[i];
      worst = Math.max(worst, Math.abs(k.pos.x - s.x), Math.abs(k.pos.z - s.z), Math.abs(k.y - s.y), Math.abs(k.heading - s.h), Math.abs(k.speed - s.s));
    });
    expect(worst).toBeLessThan(1e-6);
  });

  it('reproduces it within 2 mm through the wire: quantised, stringified, applied, replayed (reconcile)', () => {
    const { k, step, controls } = soloRace(3, 5);
    // the server's state at a snapshot, as the client receives it
    const s = JSON.parse(JSON.stringify(encodeKart(k))), me = JSON.parse(JSON.stringify(encodeKartPrivate(k))), t = Math.round(G.time * 1000) / 1000;
    const inputs = [];
    for (let i = 0; i < 12; i++) { inputs.push(controls()); step(); }       // 200 ms of the server
    const truth = { x: k.pos.x, z: k.pos.z, y: k.y };
    // the client predicted those twelve ticks; the server's echo says it stands at tick 0
    for (const c of inputs) recordTick(c);
    k.pos.x += 5; k.speed = 0;                                                 // whatever the client had: the snapshot overrides it
    const r = reconcile(k, s, me, 0, 1, t);
    expect(r).toEqual({ replayed: 12, lead: 12 });
    const err = Math.hypot(k.pos.x - truth.x, k.pos.z - truth.z, k.y - truth.y);
    expect(err).toBeLessThan(2e-3);
  });

  it('needs the private block: a kart leaving a water pit splashes in again without its grace', () => {
    resetMachine('tracks'); G.trackIdx = 1;
    startField([{ def: CHARACTERS[0], isAI: false, local: true }], { seed: 2 });           // « Crue de la Seine »: water at 216 and 540
    G.cyclists = []; G.crossings = []; G.hazards = [];
    while (G.state === 'countdown') simStep(STEP);
    const pit = G.pits.find(p => p.kind === 'water'); expect(pit).toBeTruthy();
    const k = G.player, s0 = G.samples[pit.i0 - 14];
    Object.assign(k, { idx: pit.i0 - 14, heading: Math.atan2(s0.tx, s0.tz), speed: 30, y: s0.y }); k.pos.x = s0.x; k.pos.z = s0.z;
    k.ctrl = () => ({ ...IDLE, throttle: true });
    let n = 0; while (k.pitGrace <= 0 && n++ < 120) simStep(STEP);
    expect(k.pitGrace).toBeGreaterThan(0);                                     // the server's kart hit the water
    for (let i = 0; i < 6; i++) simStep(STEP);                                 // ...and is still in it at the snapshot
    const s = JSON.parse(JSON.stringify(encodeKart(k))), me = JSON.parse(JSON.stringify(encodeKartPrivate(k)));
    const start = raw(k);
    for (let i = 0; i < 12; i++) simStep(STEP);
    const truth = { x: k.pos.x, z: k.pos.z, s: k.speed };
    const replay = withBlock => {
      restore(k, start); k.pitGrace = 0; k.stun = 0;                           // the client's own idea, before the snapshot
      resetPrediction(); for (let i = 0; i < 12; i++) recordTick({ ...IDLE, throttle: true });
      reconcile(k, s, withBlock ? me : null, 0, 1, G.time);
      return Math.hypot(k.pos.x - truth.x, k.pos.z - truth.z);
    };
    expect(replay(true)).toBeLessThan(2e-3);
    expect(replay(false)).toBeGreaterThan(0.5);
  });

  it('is silent: no message, no sound, no lap, no item roll, no pose, while the same step played for real is heard', () => {
    resetMachine('tracks'); G.trackIdx = 1;
    startField([{ def: CHARACTERS[0], isAI: false, local: true }], { seed: 2 });
    G.cyclists = []; G.crossings = []; G.hazards = [];
    while (G.state === 'countdown') simStep(STEP);
    drain();
    const heard = []; setSfxSink(name => heard.push(name));
    const pit = G.pits.find(p => p.kind === 'water'), k = G.player;
    const into = () => { const s = G.samples[pit.i0]; k.pos.x = s.x; k.pos.z = s.z; k.idx = pit.i0; k.y = s.y; k.speed = 30; k.pitGrace = 0; k.stun = 0; k.air = false; k.itemRolling = 0.01; k.pendingItem = 'turbo'; k.item = null; };
    into(); const mesh = { ...k.mesh.position };
    simulateLocal(k, { ...IDLE, throttle: true });
    expect(k.pitGrace).toBeGreaterThan(0);                                     // it splashed...
    expect(pending()).toBe(0); expect(heard).toEqual([]);                      // ...without a word or a sound
    expect(k.item).toBeNull(); expect(k.itemRolling).toBe(0.01);               // the roll is the server's
    expect({ ...k.mesh.position }).toEqual(mesh);                              // and nothing was posed
    // the line: a replayed tick across it counts no lap
    const end = G.samples[G.N - 2]; Object.assign(k, { idx: G.N - 2, lap: 0, maxLap: 0, heading: Math.atan2(end.tx, end.tz), speed: 40, y: end.y, stun: 0, pitGrace: 9 }); k.pos.x = end.x; k.pos.z = end.z;
    for (let i = 0; i < 10; i++) simulateLocal(k, { ...IDLE, throttle: true });
    expect(k.idx).toBeLessThan(G.N / 2); expect(k.lap).toBe(0);
    expect(G.replaying).toBe(false);
    // the positive control: the same splash, simulated for real, speaks
    into(); updateKart(k, STEP);
    expect(drain().map(e => e.text)).toContain('PLOUF !');
    expect(heard).toContain('hit');
  });
});

describe('reconcile', () => {
  const at = () => { const { k } = soloRace(0); return { k, s: encodeKart(k), me: encodeKartPrivate(k) }; };

  it('drops the history up to ack and the n - 1 ticks after it, and replays the rest', () => {
    const { k, s, me } = at();
    for (let i = 0; i < 10; i++) predictTick(k, script(i));
    expect(lastSeq()).toBe(10);
    const r = reconcile(k, s, me, 4, 3, G.time);                 // the server ran tick 4's controls three times: it stands at tick 6
    expect(getHistory().map(e => e.seq)).toEqual([7, 8, 9, 10]);
    expect(r).toEqual({ replayed: 4, lead: 4 });
  });

  it('numbers on from the server when it got ahead of us, and keeps four seconds of history at most', () => {
    const { k, s, me } = at();
    for (let i = 0; i < 5; i++) predictTick(k, script(i));
    const r = reconcile(k, s, me, 20, 1, G.time);
    expect(getHistory()).toEqual([]); expect(lastSeq()).toBe(20); expect(r.lead).toBe(0);
    expect(predictTick(k, script(0))).toBe(21);
    for (let i = 0; i < HISTORY + 50; i++) recordTick(IDLE);
    expect(getHistory()).toHaveLength(HISTORY);
    expect(getHistory().at(-1).seq).toBe(lastSeq());
  });

  it('turns a small correction into an offset that is gone within 120 ms, and snaps a big one, a teleport and the first', () => {
    const { k, s, me } = at();
    reconcile(k, s, me, 0, 1, G.time);
    expect(errorOffset()).toEqual({ x: 0, z: 0, y: 0, h: 0 });               // the first correction snaps
    const before = { ...k.pos };
    reconcile(k, { ...s, x: s.x - 0.5 }, me, 0, 1, G.time);                  // the server says we were half a metre short
    expect(k.pos.x).toBeCloseTo(before.x - 0.5, 6);
    expect(errorOffset().x).toBeCloseTo(0.5, 6);                             // on screen the kart has not moved yet
    for (let t = 0; t < 0.12; t += 1 / 60) blend(1 / 60);
    expect(Math.abs(errorOffset().x)).toBeLessThan(0.02);                    // 2 cm left after 120 ms
    reconcile(k, { ...s, x: s.x - 0.5 + SNAP_DIST + 1 }, me, 0, 1, G.time);
    expect(errorOffset().x).toBe(0);                                         // past 3 m: shown at once
    reconcile(k, { ...s, x: s.x + 2 }, me, 0, 1, G.time);
    expect(errorOffset().x).toBeCloseTo(1.5, 6);                             // a plain correction again...
    reconcile(k, { ...s, x: s.x + 2.4, tp: 1 }, me, 0, 1, G.time);
    expect(errorOffset()).toEqual({ x: 0, z: 0, y: 0, h: 0 });               // ...but a teleport snaps
  });

  it("takes the server's item after the replay, even when the roll ran out in between", () => {
    const { k } = at();
    k.item = 'turbo'; k.itemRolling = 0;
    const s = encodeKart(k), me = encodeKartPrivate(k);
    for (let i = 0; i < 6; i++) recordTick(script(i));
    k.item = null; k.itemRolling = 0.05; k.pendingItem = null;
    reconcile(k, s, me, 0, 1, G.time);
    expect(k.item).toBe('turbo'); expect(k.itemRolling).toBe(0);
  });
});

describe('estimateDelay', () => {
  it('is two snapshot intervals when snapshots come on time', () => {
    expect(estimateDelay([])).toBe(6);
    expect(estimateDelay([0, 0, 0, 0], 3)).toBe(6);
    expect(estimateDelay([0, 0], 2)).toBe(4);
  });
  it('adds the mean lateness and 2.5 standard deviations of it', () => {
    const devs = [0, 2, 0, 2, 0, 2];                                          // mean 1, sd 1
    expect(estimateDelay(devs, 3)).toBeCloseTo(6 + 1 + 2.5, 9);
  });
  it('stays between 4 and 18 ticks', () => {
    expect(estimateDelay([0], 1)).toBe(4);
    expect(estimateDelay([0, 30, 0, 30], 3)).toBe(18);
  });
});
