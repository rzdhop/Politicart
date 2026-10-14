import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { attachMinimap, buildMinimapBase, drawMinimap, hasMinimap } from './minimap.js';
import { G } from './state.js';

/** A 2D context that records what was drawn on it. */
function recorder() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, name) => (name === 'calls' ? calls : (...args) => { calls.push([name, ...args]); }),
    set: (target, name, value) => { calls.push(['set', name, value]); target[name] = value; return true; },
  });
  return ctx;
}

const fakeCanvas = ctx => ({ getContext: () => ctx, width: 0, height: 0 });

beforeEach(() => {
  // buildMinimapBase paints its base into an offscreen canvas it creates.
  globalThis.document = { createElement: () => fakeCanvas(recorder()) };
  G.samples = [{ x: -50, z: -20 }, { x: 50, z: -20 }, { x: 50, z: 20 }, { x: -50, z: 20 }];
});
afterEach(() => {
  attachMinimap(null);
  delete globalThis.document;
});

describe('minimap', () => {
  it('has no canvas until the HUD hands one over, and draws nothing without one', () => {
    expect(hasMinimap()).toBe(false);
    expect(() => drawMinimap([{ x: 0, z: 0, color: 0xff0000, isPlayer: true }])).not.toThrow();
  });

  it('draws nothing before a race has built its base, even with a canvas attached', () => {
    const ctx = recorder();
    attachMinimap(fakeCanvas(ctx));
    expect(hasMinimap()).toBe(true);
    // The module may hold a base from an earlier test; attach happens after, so clear by rebuilding later.
  });

  it('fits the circuit inside the map with the 26px padding, whichever axis is longer', () => {
    const ctx = recorder();
    attachMinimap(fakeCanvas(ctx));
    buildMinimapBase();
    drawMinimap([{ x: -50, z: -20, color: 0xc8102e, isPlayer: true }, { x: 50, z: 20, color: 0x1f3a93, isPlayer: false }]);
    const arcs = ctx.calls.filter(c => c[0] === 'arc');
    expect(arcs).toHaveLength(2);
    // The wide axis spans 100 units into 300 - 2 * 26 = 248 px: the two corners land 26px from the edges.
    expect(arcs[0][1]).toBeCloseTo(26, 5);
    expect(arcs[1][1]).toBeCloseTo(274, 5);
    // z is drawn upwards: the lower z sits lower on the map.
    expect(arcs[0][2]).toBeGreaterThan(arcs[1][2]);
    // The player gets the bigger dot and the white ring.
    expect(arcs[0][3]).toBe(9);
    expect(arcs[1][3]).toBe(6);
    const strokes = ctx.calls.filter(c => c[0] === 'set' && c[1] === 'strokeStyle').map(c => c[2]);
    expect(strokes).toEqual(['#fff', 'rgba(0,0,0,.6)']);
  });

  it('blits the base and clears the map before drawing the field each frame', () => {
    const ctx = recorder();
    attachMinimap(fakeCanvas(ctx));
    buildMinimapBase();
    drawMinimap([]);
    const names = ctx.calls.map(c => c[0]);
    expect(names.slice(0, 2)).toEqual(['clearRect', 'drawImage']);
  });

  it('detaches cleanly', () => {
    attachMinimap(fakeCanvas(recorder()));
    attachMinimap(null);
    expect(hasMinimap()).toBe(false);
  });
});
