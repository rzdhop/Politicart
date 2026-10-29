// The race pre-build (prebuild.js, DEC-055), headless: the circuit built
// ahead a slice at a time, G untouched between slices, the result the same
// as the synchronous build, taken by startField when its key matches and
// dropped when it does not.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHARACTERS, TRACKS } from './data.js';
import { countMeshes, countTriangles } from './geo.js';
import { getState, resetMachine, transition } from './machine.js';
import { applyPrebuilt, buildExtras, dropPrebuild, HAZARD_TYPES, prebuildFrame, prebuildKey, prebuildStatus, PROJECTILE_TYPES, requestPrebuild, takePrebuilt } from './prebuild.js';
import { startField } from './race.js';
import { CFG, G, getPoly, togglePoly } from './state.js';
import { buildTrack, TRACK_PHASES } from './track.js';

const slots = () => CHARACTERS.slice(0, 6).map((def, i) => ({ def, isAI: i < 5, local: i === 5 }));
/** Run the pre-build's frames headless until it reports nothing left; the number of frames it took. */
function runFrames(budget = 8) {
  let n = 0;
  while (prebuildFrame({ budget }) && n < 1000) n++;
  return n;
}

describe('the circuits screen and the results ask for the pre-build', () => {
  // This file's module instance registered its transition listener at import; resetMachine (below) clears listeners, so this runs first.
  it('queues the chosen circuit on the way to the circuits, keeps it on the results, drops it on the title', () => {
    G.trackIdx = 2;
    transition('select'); transition('tracks');
    expect(prebuildStatus()).toMatchObject({ trackIdx: 2, key: prebuildKey({ trackIdx: 2 }), built: false });
    transition('countdown'); transition('race'); transition('results');
    expect(prebuildStatus()).toMatchObject({ trackIdx: 2 });
    transition('title');
    expect(prebuildStatus()).toBeNull();
  });
});

describe('the pre-build', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; G.trackIdx = 0; dropPrebuild(); });
  afterEach(() => { dropPrebuild(); if (getPoly() !== 'high') togglePoly(); vi.restoreAllMocks(); });

  it('builds every phase over frames, with G left as it was between two slices', () => {
    const sentinel = { samples: ['mine'], N: 7, crowd: ['c'], animated: ['a'], hazards: ['h'], cyclists: ['y'], itemBoxes: ['b'], track: TRACKS[3] };
    Object.assign(G, sentinel);
    expect(requestPrebuild(1)).toMatchObject({ trackIdx: 1, built: false, primed: false, phase: null });
    let frames = 0;
    while (prebuildFrame({ budget: 8 })) {
      frames++;
      for (const [k, v] of Object.entries(sentinel)) expect(G[k], k).toBe(v);   // the job's fields never leak out of a slice
      expect(frames).toBeLessThan(100);
    }
    const st = prebuildStatus();
    expect(st.built).toBe(true);
    expect(st.phase).toBe('built');                                             // headless: no renderer, no priming
    expect(st.primed).toBe(false);
    expect(Object.keys(st.ms).sort()).toEqual([...TRACK_PHASES].sort());        // every phase ran, and was timed
    expect(frames).toBeGreaterThan(1);                                          // more than one slice: the decor alone outlasts the budget
    expect(st.slices).toBe(frames + 1);                                       // the call that found nothing left counts too
    for (const [k, v] of Object.entries(sentinel)) expect(G[k], k).toBe(v);
    const pre = takePrebuilt({ trackIdx: 1 });
    expect(pre.scene).toBe(st.scene);
    expect(pre.state.N).toBe(CFG.samples);
    expect(pre.state.samples).toHaveLength(CFG.samples);
    expect(pre.state.cyclists.length).toBeGreaterThan(8);
    expect(pre.state.itemBoxes.length).toBeGreaterThanOrEqual(16);
    expect(pre.state.crowd.length).toBeGreaterThan(10);
    expect(pre.state.animated.length).toBeGreaterThan(0);
    expect(countMeshes(pre.scene)).toBeGreaterThan(1500);
    expect(prebuildStatus()).toBeNull();
  });

  // Both builds under the same random draws (the pattern of headless.test.js): a phase boundary moves nothing.
  const real = Math.random;
  function mockRandom(seed) {
    let s = 20261029 + seed;
    vi.spyOn(Math, 'random').mockImplementation(() => { if (new Error().stack.includes('generateUUID')) return real(); s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; });
  }
  it.each([['détaillés', 'high'], ['légers (folded)', 'low']])('builds the same circuit sliced as at once, on %s', (_n, level) => {
    if (getPoly() !== level) togglePoly();
    mockRandom(1); requestPrebuild(0); runFrames(4); const sliced = takePrebuilt({ trackIdx: 0 }); vi.restoreAllMocks();
    mockRandom(1); const scene = new THREE.Scene(); G.animated = []; G.hazards = []; G.crowd = []; G.track = TRACKS[0]; buildTrack(scene, TRACKS[0]); vi.restoreAllMocks();
    expect(countTriangles(sliced.scene)).toBe(countTriangles(scene));
    expect(countMeshes(sliced.scene, true)).toBe(countMeshes(scene, true));
    expect(sliced.state.cyclists.length).toBe(G.cyclists.length);
    expect(sliced.state.hazards.length).toBe(G.hazards.length);
    expect(sliced.state.crowd.length).toBe(G.crowd.length);
    expect(sliced.state.animated.length).toBe(G.animated.length);
  }, 60000);

  it('is taken by startField when the circuit matches: the scene and its registrations, not rebuilt', () => {
    requestPrebuild(0); runFrames();
    const { scene, ms } = prebuildStatus();
    const meshes = countMeshes(scene), children = scene.children.length;
    startField(slots());
    expect(getState()).toBe('countdown');
    expect(G.scene).toBe(scene);
    expect(G.samples).toHaveLength(CFG.samples);
    expect(G.cyclists.length).toBeGreaterThan(8);
    expect(G.itemBoxes.length).toBeGreaterThanOrEqual(16);
    expect(G.hazards.length).toBeGreaterThan(0);
    // what startField added: lights (4), six karts and their trails; the circuit itself was not built again
    expect(scene.children.length - children).toBeLessThanOrEqual(4 + 6 * 2);
    expect(countMeshes(scene) - meshes).toBeLessThan(meshes / 2);
    expect(prebuildStatus()).toBeNull();
    expect(Object.keys(ms)).toHaveLength(TRACK_PHASES.length);
  });

  it('finishes synchronously what the frames did not get to', () => {
    requestPrebuild(0); prebuildFrame({ budget: 1 });
    const st = prebuildStatus();
    expect(st.built).toBe(false);
    startField(slots());
    expect(G.scene).toBe(st.scene);
    expect(G.samples).toHaveLength(CFG.samples);
    expect(countMeshes(G.scene)).toBeGreaterThan(1500);
  });

  it('is dropped and the race built as before when the circuit, the detail level or the seed differ', () => {
    requestPrebuild(0); runFrames();
    const other = prebuildStatus().scene;
    G.trackIdx = 1; startField(slots());
    expect(G.scene).not.toBe(other);
    expect(G.track).toBe(TRACKS[1]);
    expect(prebuildStatus()).toBeNull();
    expect(countMeshes(other)).toBeGreaterThan(0);                              // dropped, its geometries disposed, the objects left to the collector

    G.trackIdx = 0; requestPrebuild(0); runFrames();
    const high = prebuildStatus().scene; togglePoly();
    resetMachine('tracks'); startField(slots());
    expect(G.scene).not.toBe(high);
    expect(prebuildStatus()).toBeNull();
    togglePoly();

    requestPrebuild(0); runFrames();
    const seedless = prebuildStatus().scene;
    resetMachine('tracks'); startField(slots(), { seed: 42 });
    expect(G.scene).not.toBe(seedless);
    requestPrebuild(0, { seed: 42 }); runFrames();
    const seeded = prebuildStatus().scene;
    resetMachine('tracks'); startField(slots(), { seed: 42 });
    expect(G.scene).toBe(seeded);
  });

  it('keeps the same key when asked again, and replaces another', () => {
    requestPrebuild(0); runFrames();
    const built = prebuildStatus();
    expect(requestPrebuild(0)).toMatchObject({ built: true, scene: built.scene });
    expect(requestPrebuild(3)).toMatchObject({ trackIdx: 3, built: false });
    expect(prebuildStatus().scene).not.toBe(built.scene);
    expect(requestPrebuild(99)).toBeNull();
    expect(prebuildStatus()).toBeNull();
  });

  it('applies a taken pre-build into G field by field', () => {
    requestPrebuild(0); runFrames();
    const pre = takePrebuilt({ trackIdx: 0 });
    G.samples = []; G.cyclists = [];
    applyPrebuilt(pre);
    expect(G.samples).toBe(pre.state.samples);
    expect(G.cyclists).toBe(pre.state.cyclists);
    expect(G.track).toBe(TRACKS[0]);
  });
});

describe("the countdown's extras", () => {
  it('builds one of each hazard and projectile, hidden, without leaving animations in G.animated', () => {
    G.animated = [() => {}];
    const g = buildExtras();
    expect(g.visible).toBe(false);
    expect(g.children).toHaveLength(HAZARD_TYPES.length + PROJECTILE_TYPES.length);
    expect(countMeshes(g)).toBeGreaterThan(HAZARD_TYPES.length + PROJECTILE_TYPES.length);
    expect(G.animated).toHaveLength(1);                                         // the fake box's spin was taken back out
  });
});
