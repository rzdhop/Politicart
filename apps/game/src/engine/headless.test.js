// The engine must run without a browser: the game server steps it in Node
// (DEC-014). This suite imports the real race orchestration in vitest's node
// environment -- no DOM, no canvas, no WebGL -- builds every circuit and
// drives a race for thirty simulated seconds at the server's fixed step.
import { beforeEach, describe, expect, it } from 'vitest';

import { CHARACTERS, TRACKS } from './data.js';
import { builtinStyle, mergeStyle } from './kartstyle.js';
import { getState, resetMachine } from './machine.js';
import { simStep, startField, startRace } from './race.js';
import { drain, resolveFor } from './events.js';
import { CFG, G } from './state.js';
import { POOL } from './trail.js';

const STEP = 1 / 60;

describe('headless engine', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; });

  it('imports without a DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof simStep).toBe('function');
  });

  it.each(TRACKS.map((t, i) => [t.name, i]))('builds %s and races it for 30 s', (_name, i) => {
    G.trackIdx = i;
    startRace();
    expect(getState()).toBe('countdown');
    expect(G.karts).toHaveLength(6);
    const start = G.karts.map(k => k.progress);
    for (let n = 0; n < 30 * 60; n++) simStep(STEP);
    expect(getState()).toBe('race');
    const ai = G.karts.filter(k => k.isAI);
    // Every AI kart has moved forward along the circuit (a lap is about 3 km now), and the ranks are a permutation.
    ai.forEach((k, j) => expect(k.progress).toBeGreaterThan(start[j] + 0.1));
    expect(G.karts.map(k => k.rank).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    for (const k of G.karts) { expect(Number.isFinite(k.pos.x)).toBe(true); expect(Number.isFinite(k.pos.z)).toBe(true); }
  });
});

describe('styled karts, headless', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; G.trackIdx = 0; });

  it('races every part, skin, animated part and a trail for 10 s without a NaN', () => {
    const parts = { exhaust: 'turbine', underglow: 'rainbow', mast: 'tricolore', nose: 'ram', skin: 'flames', trail: 'confetti' };
    const slots = CHARACTERS.slice(0, 6).map((def, i) => ({ def, isAI: i < 5, local: i === 5, style: mergeStyle(builtinStyle(def), parts) }));
    startField(slots);
    for (const k of G.karts) {
      expect(k.style).toMatchObject(parts);
      expect(k.mesh.userData.anim.length).toBeGreaterThanOrEqual(3);
      expect(k.mesh.userData.trail.group.children).toHaveLength(POOL);
      expect(G.scene.children).toContain(k.mesh.userData.trail.group);
    }
    for (let n = 0; n < 10 * 60; n++) simStep(STEP);
    expect(getState()).toBe('race');
    for (const k of G.karts) {
      expect(Number.isFinite(k.pos.x)).toBe(true); expect(Number.isFinite(k.pos.z)).toBe(true);
      expect(Number.isFinite(k.mesh.position.x)).toBe(true);
      const t = k.mesh.userData.trail; expect(t.group.children).toHaveLength(POOL);
      for (const o of t.group.children) { expect(Number.isFinite(o.position.x)).toBe(true); expect(Number.isFinite(o.position.y)).toBe(true); }
      if (k.isAI) expect(t.group.children.some(o => o.visible)).toBe(true);     // the AI is driving, so it trails
    }
  });
});

describe('the bike lane', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; G.trackIdx = 0; startRace(); drain(); });

  it('puts cyclists on every circuit, and they keep riding', () => {
    expect(G.cyclists.length).toBeGreaterThan(8);
    const before = G.cyclists.map(c => [c.x, c.z]);
    for (let n = 0; n < 10 * 60; n++) simStep(STEP);
    const moved = G.cyclists.filter((c, i) => Math.hypot(c.x - before[i][0], c.z - before[i][1]) > 5);
    expect(moved.length).toBeGreaterThan(G.cyclists.length / 2);
    for (const c of G.cyclists) { expect(Number.isFinite(c.x)).toBe(true); expect(Math.abs(c.lat)).toBeLessThan(CFG.roadHalfWidth + 3); }
  });

  it('knocks over a cyclist a kart drives into, and shakes the kart', () => {
    for (let n = 0; n < 4 * 60; n++) simStep(STEP);   // racing
    drain();
    const k = G.player, c = G.cyclists[0];
    k.hazardGrace = 0; k.invincible = 0; k.shield = 0; k.speed = 30; k.pos.x = c.x; k.pos.z = c.z;
    simStep(STEP);
    expect(c.fallen).toBeGreaterThan(0);
    expect(k.stun).toBeGreaterThan(0);
    expect(drain().map(e => resolveFor(e, k)).filter(Boolean).length).toBeGreaterThan(0);
  });
});

describe('several humans in one race', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; G.trackIdx = 0; startRace(); drain(); });

  // Put kart k just before the line on its last lap, so the next step finishes it.
  function onFinalStraight(k) {
    k.lap = CFG.laps - 1; k.maxLap = CFG.laps - 1; k.idx = G.N - 2;
    const s = G.samples[1]; k.pos.x = s.x; k.pos.z = s.z;
  }

  it('drives each human from its own controls', () => {
    const [a, b] = G.karts;
    a.isAI = false; a.ctrl = () => ({ throttle: true, brake: false, left: false, right: false, drift: false });
    b.isAI = false; b.ctrl = () => ({ throttle: false, brake: false, left: false, right: false, drift: false });
    for (let n = 0; n < 5 * 60; n++) simStep(STEP);
    expect(a.speed).toBeGreaterThan(10);
    expect(Math.abs(b.speed)).toBeLessThan(3);   // idle controls: b coasts at the line
  });

  it('arms the results timer only once every human has finished, and tells each one', () => {
    const [a, b] = G.karts;
    for (const k of [a, b]) { k.isAI = false; k.ctrl = () => ({ throttle: true, brake: false, left: false, right: false, drift: false }); }
    for (let n = 0; n < 4 * 60; n++) simStep(STEP);   // countdown over, race running
    drain();
    onFinalStraight(a); simStep(STEP);
    expect(a.finished).toBe(true);
    expect(G.resultsAt).toBe(Infinity);                // b and the player are still racing
    const toA = drain().map(e => resolveFor(e, a)).filter(Boolean);
    expect(toA.some(t => t.startsWith('ARRIVÉE !'))).toBe(true);
    onFinalStraight(b); onFinalStraight(G.player); simStep(STEP);
    expect(G.resultsAt).toBeLessThan(Infinity);
  });
});
