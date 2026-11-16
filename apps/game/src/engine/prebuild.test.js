// The race pre-build (prebuild.js, DEC-055), headless: the circuit built
// ahead a slice at a time, G untouched between slices, the result the same
// as the synchronous build, taken by startField when its key matches and
// dropped when it does not.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHARACTERS, TRACKS } from './data.js';
import { countMeshes, countTriangles } from './geo.js';
import { chooseLayout } from './layout.js';
import { getState, resetMachine, transition } from './machine.js';
import { framePayload } from './payload.js';
import { openBatches } from './decor/instanced.js';
import { applyPrebuilt, buildExtras, dropPrebuild, HAZARD_TYPES, prebuildFrame, prebuildKey, prebuildStatus, prebuiltSeed, PROJECTILE_TYPES, requestPrebuild, startStream, STREAM, streamFrame, streamStatus, takePrebuilt } from './prebuild.js';
import { cullDecor, startField, startRace } from './race.js';
import { camera } from './render.js';
import { CFG, G, getPoly, togglePoly } from './state.js';
import { takeSurfaceRequests } from './textures.js';
import { buildTrack, buildTrackPhases, PLAYABLE, samplesOf, surfacesOf, TRACK_PHASES } from './track.js';

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
    const st = prebuildStatus();
    expect(st).toMatchObject({ trackIdx: 2, key: prebuildKey({ trackIdx: 2, seed: st.seed }), built: false });
    expect(prebuiltSeed(2)).toBe(st.seed);                                    // solo play races on the seed the pre-build drew
    expect(prebuiltSeed(1)).toBeNull();
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
    expect(requestPrebuild(1, { seed: 5 })).toMatchObject({ trackIdx: 1, seed: 5, built: false, primed: false, phase: null });
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
    const pre = takePrebuilt({ trackIdx: 1, seed: 5 });
    expect(pre.scene).toBe(st.scene);
    expect(pre.state.N).toBe(samplesOf(TRACKS[1]));                           // CFG.samples grown with the scale (DEC-061)
    expect(pre.state.seed).toBe(5);
    expect(pre.state.layout).toEqual(chooseLayout(TRACKS[1], 5));             // the seed's layout, obstacles and cyclists (DEC-049)
    expect(pre.state.entitySeq).toBeGreaterThan(0);                           // the static obstacles took their ids
    expect(pre.state.lamps.length).toBeGreaterThan(0);                        // the lamp heads for the climate to light
    expect(pre.state.climate).toBeNull();                                     // headless: no priming, so no climate yet
    expect(pre.state.samples).toHaveLength(samplesOf(TRACKS[1]));
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
    mockRandom(1); requestPrebuild(0, { seed: 11 }); runFrames(4); const sliced = takePrebuilt({ trackIdx: 0, seed: 11 }); vi.restoreAllMocks();
    mockRandom(1); const scene = new THREE.Scene(); G.animated = []; G.hazards = []; G.crowd = []; G.lamps = []; G.disposables = []; G.entitySeq = 0; G.track = TRACKS[0]; buildTrack(scene, TRACKS[0], { seed: 11 }); vi.restoreAllMocks();
    expect(sliced.state.layout).toEqual(G.layout);
    expect(sliced.state.hazards.map(h => [h.id, h.x, h.z])).toEqual(G.hazards.map(h => [h.id, h.x, h.z]));
    expect(countTriangles(sliced.scene)).toBe(countTriangles(scene));
    expect(countMeshes(sliced.scene, true)).toBe(countMeshes(scene, true));
    expect(sliced.state.cyclists.length).toBe(G.cyclists.length);
    expect(sliced.state.hazards.length).toBe(G.hazards.length);
    expect(sliced.state.crowd.length).toBe(G.crowd.length);
    expect(sliced.state.animated.length).toBe(G.animated.length);
  }, 60000);

  // ---- the stream (the browser's way: STREAM.on)
  const fresh = () => { G.animated = []; G.hazards = []; G.crowd = []; G.lamps = []; G.disposables = []; G.entitySeq = 0; G.track = TRACKS[0]; G.climate = null; };
  const drain = () => { let n = 0; while (streamFrame({ budget: 4 }) && n < 5000) n++; return n; };
  it.each([['détaillés', 'high'], ['légers (folded)', 'low']])('streams the decor after the circuit is playable into the same circuit as at once, on %s', (_n, level) => {
    if (getPoly() !== level) togglePoly();
    mockRandom(2); fresh(); const scene = new THREE.Scene(); G.scene = scene;
    const gen = buildTrackPhases(scene, TRACKS[0], { seed: 11 });
    for (let r = gen.next(); r.value !== PLAYABLE; r = gen.next()) { /* the road, the urnes, the features, the riders */ }
    const playable = { tris: countTriangles(scene), hazards: G.hazards.length, cyclists: G.cyclists.length };
    startStream(scene, gen);
    expect(countTriangles(scene)).toBeGreaterThan(playable.tris);              // the start line's furniture is there at once
    expect(streamStatus()).toMatchObject({ building: true });
    expect(scene.userData.decor).toBeUndefined();                             // nothing is culled while the build goes on
    expect(drain()).toBeGreaterThan(3);                                        // over frames
    expect(streamStatus()).toBeNull();
    expect(openBatches()).toBe(0);
    const streamed = { tris: countTriangles(scene), crowd: G.crowd.length, animated: G.animated.length, lamps: G.lamps.length, hazards: G.hazards.length, cyclists: G.cyclists.length };
    vi.restoreAllMocks();
    mockRandom(2); fresh(); const whole = new THREE.Scene(); buildTrack(whole, TRACKS[0], { seed: 11 }); vi.restoreAllMocks();
    expect(streamed).toEqual({ tris: countTriangles(whole), crowd: G.crowd.length, animated: G.animated.length, lamps: G.lamps.length, hazards: G.hazards.length, cyclists: G.cyclists.length });
    expect(streamed.hazards).toBe(playable.hazards);                           // the race's own pieces were all there at the start
    expect(streamed.cyclists).toBe(playable.cyclists);
    expect(scene.userData.decor.length).toBeGreaterThan(50);
  }, 60000);

  it('starts a race as soon as the circuit is playable, built ahead or not, and builds the rest in its frames', () => {
    STREAM.on = true;
    try {
      startField(slots(), { seed: 3 });                                       // nothing built ahead
      expect(getState()).toBe('countdown');
      expect(G.samples).toHaveLength(samplesOf(TRACKS[0]));
      expect(G.itemBoxes.length).toBeGreaterThanOrEqual(16);
      expect(streamStatus()).toMatchObject({ building: true });
      const early = countMeshes(G.scene);
      drain();
      expect(streamStatus()).toBeNull();
      expect(countMeshes(G.scene)).toBeGreaterThan(early);
      expect(countMeshes(G.scene)).toBeGreaterThan(1500);

      resetMachine('tracks');
      requestPrebuild(0); prebuildFrame({ budget: 1 });                       // built ahead, but only just begun
      const st = prebuildStatus();
      startField(slots(), { seed: st.seed });
      expect(G.scene).toBe(st.scene);
      expect(streamStatus()).toMatchObject({ building: true });
      drain();
      expect(countMeshes(G.scene)).toBeGreaterThan(1500);

      resetMachine('tracks');
      requestPrebuild(0); runFrames();                                        // built ahead to the end: nothing to stream
      startField(slots(), { seed: prebuildStatus().seed });
      expect(streamStatus()).toBeNull();
    } finally { STREAM.on = false; }
  }, 60000);

  it('gives way to the next pre-build: one build at a time', () => {
    STREAM.on = true;
    try {
      startField(slots(), { seed: 3 });
      expect(streamStatus()).not.toBeNull();
      requestPrebuild(1, { seed: 5 }); prebuildFrame({ budget: 1 });          // the results screen builds "Rejouer" ahead
      expect(streamStatus()).toBeNull();
      expect(streamFrame()).toBe(false);
    } finally { STREAM.on = false; }
  });

  it('builds a circuit without its decor for the game server: the same race, nothing to look at', () => {
    fresh(); const bare = new THREE.Scene(); buildTrack(bare, TRACKS[0], { seed: 11, decor: false });
    const race = () => ({ layout: G.layout, hazards: G.hazards.map(h => [h.id, h.x, h.z]), cyclists: G.cyclists.map(c => [c.x, c.z]), n: G.N, boxes: G.itemBoxes.length, coins: G.coins.length, pads: G.pads.length, ramps: G.ramps.length, ids: G.entitySeq });
    const without = race();
    expect(bare.userData.world.children).toHaveLength(0);
    takeSurfaceRequests(); fresh(); buildTrack(new THREE.Scene(), TRACKS[0], { seed: 11, decor: false });
    expect(takeSurfaceRequests().sort()).toEqual(['asphalt', 'grass']);       // a playable circuit bakes its road and its ground, no more
    fresh(); const full = new THREE.Scene(); buildTrack(full, TRACKS[0], { seed: 11 });
    expect(without).toEqual(race());
    expect(countMeshes(bare)).toBeLessThan(countMeshes(full) / 2);
  }, 60000);

  it('stops drawing the decor the fog has swallowed, and only that', () => {
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0, 100, 500);
    const piece = (x, y, z, h) => { const m = new THREE.Mesh(new THREE.BoxGeometry(4, h, 4), new THREE.MeshBasicMaterial()); m.position.set(x, y + h / 2, z); scene.add(m); return m; };
    const near = piece(0, 0, 100, 2), far = piece(0, 0, 900, 2), tower = piece(0, 0, 900, 60), behind = piece(0, 0, -900, 2), off = piece(0, 0, 900, 2), mover = piece(0, 0, 100, 2);
    off.visible = false;                                                      // a builder's own choice
    scene.userData.decor = [near, far, tower, behind, off, mover];
    scene.updateMatrixWorld(true);
    camera.position.set(0, 6, 0); camera.lookAt(0, 6, 100); camera.updateMatrixWorld(true);
    expect(cullDecor(scene)).toBe(1);
    expect([near, far, tower, behind, off, mover].map(o => o.visible)).toEqual([true, false, true, true, false, true]);
    mover.position.z = 900; scene.updateMatrixWorld(true);                    // a piece that travels is followed
    expect(cullDecor(scene)).toBe(2);
    expect(mover.visible).toBe(false);
    camera.position.set(0, 6, 700); camera.updateMatrixWorld(true);           // the kart comes back in range
    expect(cullDecor(scene)).toBe(0);
    expect([far, mover, off].map(o => o.visible)).toEqual([true, true, false]);
  });

  it('is taken by startField when the circuit matches: the scene and its registrations, not rebuilt, the climate applied', () => {
    requestPrebuild(0, { seed: 3 }); runFrames();
    const { scene, ms } = prebuildStatus();
    const meshes = countMeshes(scene);
    startField(slots(), { seed: 3 });
    expect(getState()).toBe('countdown');
    expect(G.scene).toBe(scene);
    expect(G.samples).toHaveLength(samplesOf(TRACKS[0]));
    expect(G.cyclists.length).toBeGreaterThan(8);
    expect(G.itemBoxes.length).toBeGreaterThanOrEqual(16);
    expect(G.hazards.length).toBeGreaterThan(0);
    // the circuit itself was not built again: startField added the climate, six karts and their trails
    expect(countMeshes(scene) - meshes).toBeLessThan(meshes / 2);
    expect(prebuildStatus()).toBeNull();
    expect(Object.keys(ms)).toHaveLength(TRACK_PHASES.length);
    // the seed's layout and climate are the race's (DEC-049, DEC-051), as the HUD and the sky see them
    const layout = chooseLayout(TRACKS[0], 3);
    expect(G.seed).toBe(3);
    expect(G.layout).toEqual(layout);
    expect(framePayload(G, CFG).layoutName).toBe(layout.name);
    expect(G.climate.id).toBe(layout.climate);
    expect(scene.getObjectByName('sky')).toBeTruthy();
    expect(G.sun.parent).toBe(scene);
    expect(scene.children.filter(o => o.isLight)).toHaveLength(3);           // the climate's three, once
    expect(G.entitySeq).toBeGreaterThan(0);                                   // the ids go on from the static obstacles'
  });

  it('gives solo play its seed: startRace races on the circuit built ahead', () => {
    requestPrebuild(0); runFrames();
    const { scene, seed } = prebuildStatus();
    startRace();
    expect(G.scene).toBe(scene);
    expect(G.seed).toBe(seed);
    expect(G.layout).toEqual(chooseLayout(TRACKS[0], seed));
    expect(prebuildStatus()).toBeNull();
  });

  it('finishes synchronously what the frames did not get to', () => {
    requestPrebuild(0); prebuildFrame({ budget: 1 });
    const st = prebuildStatus();
    expect(st.built).toBe(false);
    startField(slots(), { seed: st.seed });
    expect(G.scene).toBe(st.scene);
    expect(G.samples).toHaveLength(samplesOf(TRACKS[0]));
    expect(countMeshes(G.scene)).toBeGreaterThan(1500);
  });

  it('is dropped and the race built as before when the circuit, the detail level or the seed differ', () => {
    requestPrebuild(0, { seed: 0 }); runFrames();
    const other = prebuildStatus().scene;
    G.trackIdx = 1; startField(slots());
    expect(G.scene).not.toBe(other);
    expect(G.track).toBe(TRACKS[1]);
    expect(prebuildStatus()).toBeNull();
    expect(countMeshes(other)).toBeGreaterThan(0);                              // dropped, its geometries disposed, the objects left to the collector

    G.trackIdx = 0; requestPrebuild(0, { seed: 0 }); runFrames();
    const high = prebuildStatus().scene; togglePoly();
    expect(prebuiltSeed(0)).toBeNull();                                       // another detail level: not this one's
    resetMachine('tracks'); startField(slots());
    expect(G.scene).not.toBe(high);
    expect(prebuildStatus()).toBeNull();
    togglePoly();

    requestPrebuild(0, { seed: 0 }); runFrames();
    const seedless = prebuildStatus().scene;
    resetMachine('tracks'); startField(slots(), { seed: 42 });
    expect(G.scene).not.toBe(seedless);
    requestPrebuild(0, { seed: 42 }); runFrames();
    const seeded = prebuildStatus().scene;
    resetMachine('tracks'); startField(slots(), { seed: 42 });
    expect(G.scene).toBe(seeded);
  }, 30000);   // several full circuit builds: well over the 5 s default on a loaded machine

  it('keeps the same circuit when asked again, and replaces another circuit or seed', () => {
    requestPrebuild(0); runFrames();
    const built = prebuildStatus();
    expect(requestPrebuild(0)).toMatchObject({ built: true, seed: built.seed, scene: built.scene });   // any seed: the one it drew
    expect(requestPrebuild(0, { seed: built.seed })).toMatchObject({ built: true, scene: built.scene });
    expect(requestPrebuild(0, { seed: built.seed + 1 })).toMatchObject({ built: false, seed: built.seed + 1 });   // a given seed: that one
    expect(prebuildStatus().scene).not.toBe(built.scene);
    expect(requestPrebuild(3)).toMatchObject({ trackIdx: 3, built: false });
    expect(requestPrebuild(99)).toBeNull();
    expect(prebuildStatus()).toBeNull();
  });

  // A renderer that compiles and draws nothing: enough to walk the priming's steps headless.
  const stubRenderer = () => ({ info: { programs: [] }, compile(scene) { scene.traverse(() => {}); }, render() {}, setRenderTarget() {}, setScissor() {}, setScissorTest() {} });
  it('lights the scene with its climate for the priming, with the sample kart, and takes both off before the hand-over', () => {
    requestPrebuild(0, { seed: 3 }); runFrames();
    const r = stubRenderer(), job = prebuildStatus();
    const children = job.scene.children.length;
    const G0 = { climate: G.climate, sun: G.sun, animated: G.animated, disposables: G.disposables };
    expect(prebuildFrame({ renderer: r, budget: 1e9 })).toBe(false);          // compile and prime, all at once
    const after = prebuildStatus();
    expect(after).toMatchObject({ phase: 'ready', primed: true, lit: false, sampled: false });
    expect(after.scene.children.length).toBe(children);                       // the climate and the sample are gone
    expect(after.scene.getObjectByName('sky')).toBeUndefined();
    expect(after.scene.children.some(o => o.isLight)).toBe(false);
    expect(after.ms.sample).toBeGreaterThanOrEqual(0);
    for (const [k, v] of Object.entries(G0)) expect(G[k], k).toBe(v);         // nothing of it leaked into G
    startField(slots(), { seed: 3 });                                        // takes it, primed
    expect(G.scene).toBe(after.scene);
    expect(G.climate.id).toBe(chooseLayout(TRACKS[0], 3).climate);
    expect(G.scene.children.filter(o => o.isLight)).toHaveLength(3);
    expect(G.scene.getObjectByName('sky')).toBeTruthy();
  });

  it('applies a taken pre-build into G field by field', () => {
    requestPrebuild(0); runFrames();
    const pre = takePrebuilt({ trackIdx: 0, seed: prebuildStatus().seed });
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

describe("the circuits' surfaces", () => {
  // A surface baked by the builder that first asks for it is 512 px of noise in one step, a stall on the circuits screen: every kind a build uses has to be in the list the pre-build bakes ahead.
  it.each(TRACKS.map((t, i) => [t.name, i]))('%s bakes ahead every surface kind its build uses, on every layout', (_name, i) => {
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      takeSurfaceRequests();
      const scene = new THREE.Scene(); G.animated = []; G.hazards = []; G.entitySeq = 0; G.trackIdx = i; G.track = TRACKS[i];
      buildTrack(scene, TRACKS[i], { seed });
      const listed = new Set(surfacesOf(TRACKS[i]));
      expect(takeSurfaceRequests().filter(k => !listed.has(k)), `seed ${seed} (${chooseLayout(TRACKS[i], seed).name})`).toEqual([]);
    }
  }, 60000);
});
