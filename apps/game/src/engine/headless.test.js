// The engine must run without a browser: the game server steps it in Node
// (DEC-014). This suite imports the real race orchestration in vitest's node
// environment -- no DOM, no canvas, no WebGL -- builds every circuit and
// drives a race for thirty simulated seconds at the server's fixed step.
import { beforeEach, describe, expect, it } from 'vitest';

import { TRACKS } from './data.js';
import { getState, resetMachine } from './machine.js';
import { simStep, startRace } from './race.js';
import { G } from './state.js';

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
    // Every AI kart has moved forward along the circuit, and the ranks are a permutation.
    ai.forEach((k, j) => expect(k.progress).toBeGreaterThan(start[j] + 0.2));
    expect(G.karts.map(k => k.rank).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    for (const k of G.karts) { expect(Number.isFinite(k.pos.x)).toBe(true); expect(Number.isFinite(k.pos.z)).toBe(true); }
  });
});
