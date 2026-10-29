// The engine must run without a browser: the game server steps it in Node
// (DEC-014). This suite imports the real race orchestration in vitest's node
// environment -- no DOM, no canvas, no WebGL -- builds every circuit and
// drives a race for thirty simulated seconds at the server's fixed step.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHARACTERS, TRACKS } from './data.js';
import { builtinStyle, mergeStyle } from './kartstyle.js';
import { chooseLayout, seedForVariant } from './layout.js';
import { getState, resetMachine } from './machine.js';
import { animateCrowd, simStep, startField, startRace } from './race.js';
import { drain, resolveFor } from './events.js';
import { countMeshes, countTriangles } from './geo.js';
import { CFG, G, getPoly, togglePoly } from './state.js';
import { buildTrack, roadTexOf } from './track.js';
import { POOL } from './trail.js';

const STEP = 1 / 60;
/** Visible instanced meshes under a scene. */
const countInstanced = scene => { let n = 0; scene.traverseVisible(o => { if (o.isInstancedMesh) n++; }); return n; };

describe('headless engine', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; });

  it('imports without a DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof simStep).toBe('function');
  });

  it.each(TRACKS.map((t, i) => [t.name, i]))('builds %s and races it for 30 s', (_name, i) => {
    G.trackIdx = i;
    startRace({ seed: 11 + i });
    expect(getState()).toBe('countdown');
    expect(G.karts).toHaveLength(6);
    // the race pilots are headless here (stage 8): the driver contract, no geometry
    for (const k of G.karts) {
      const d = k.mesh.userData.driver;
      expect(d.userData).toMatchObject({ lod: 'headless', id: k.def.id, driver: d });
      let meshes = 0; d.traverse(o => { if (o.isMesh) meshes++; });
      expect(meshes).toBe(0);
    }
    const start = G.karts.map(k => k.progress);
    let low = Infinity, high = -Infinity;
    for (let n = 0; n < 30 * 60; n++) { simStep(STEP); for (const k of G.karts) { const y = k.mesh.userData.driver.position.y; low = Math.min(low, y); high = Math.max(high, y); } }
    // the stun bob goes up from the pilots' rest at MOUNT, never below it
    expect(low).toBe(0.75); expect(high).toBeLessThanOrEqual(0.75 + 0.3 + 1e-9);
    expect(getState()).toBe('race');
    const ai = G.karts.filter(k => k.isAI);
    // Every AI kart has moved forward along the circuit (a lap is about 3 km now), and the ranks are a permutation.
    ai.forEach((k, j) => expect(k.progress).toBeGreaterThan(start[j] + 0.1));
    expect(G.karts.map(k => k.rank).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    for (const k of G.karts) { expect(Number.isFinite(k.pos.x)).toBe(true); expect(Number.isFinite(k.pos.z)).toBe(true); }
  });

  it.each(TRACKS.map((t, i) => [t.name, i]))('builds %s with its road and a bounded mesh count', (_name, i) => {
    G.trackIdx = i;
    startRace({ seed: 11 + i });
    // The road itself: one textured ribbon of (samples + 1) * 2 vertices, added to the scene (a comment once swallowed its scene.add).
    const road = G.scene.children.find(o => o.isMesh && o.material.map && o.geometry.attributes.uv && o.geometry.attributes.position.count === (G.N + 1) * 2);
    expect(road).toBeTruthy();
    expect(road.material.map).toBe(roadTexOf(TRACKS[i]));
    // Decor budget: generous, so it never flakes, but a runaway loop would trip it.
    let meshes = 0; G.scene.traverse(o => { if (o.isMesh) meshes++; });
    expect(meshes).toBeGreaterThan(1500);
    expect(meshes).toBeLessThan(14000);
  });
});

// Every circuit under every variant of its layout pool (DEC-049) builds and
// races, and the same seed builds the same race twice: the layout, the
// static obstacles' ids and places, the riders and the crossings' clocks.
describe('seeded layouts, headless', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; });

  it.each(TRACKS.flatMap((t, i) => t.variants.map((v, j) => [t.id, v.name, i, j])))('races %s « %s » for 30 s with six karts', (_id, name, i, j) => {
    G.trackIdx = i;
    startRace({ seed: seedForVariant(TRACKS[i], j) });
    expect(G.layout.name).toBe(name);
    expect(G.layout).toEqual(chooseLayout(TRACKS[i], G.seed));
    expect(G.karts).toHaveLength(6);
    expect(G.hw).toBe(TRACKS[i].roadHalfWidth);
    for (let n = 0; n < 30 * 60; n++) simStep(STEP);
    expect(getState()).toBe('race');
    for (const k of G.karts) { expect(Number.isFinite(k.pos.x)).toBe(true); expect(Number.isFinite(k.pos.z)).toBe(true); expect(Number.isFinite(k.y)).toBe(true); }
    expect(G.karts.map(k => k.rank).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    for (const c of G.cyclists) expect(Number.isFinite(c.x + c.z + c.y)).toBe(true);
  }, 30000);

  const picture = () => ({
    layout: G.layout, seq: G.entitySeq,
    hazards: G.hazards.map(h => [h.id, h.type, h.kind, Math.round(h.x * 1000), Math.round(h.z * 1000), Math.round((h.y || 0) * 1000), h.r]),
    cyclists: G.cyclists.map(c => [Math.round(c.d * 1000), Math.round(c.lat * 1000), c.base, c.timer]),
    crossings: G.crossings.map(c => c.t), ramps: G.ramps.map(r => [r.i0, r.len, r.h]), pits: G.pits.map(p => [p.i0, p.len, p.kind]), pads: G.pads.map(p => p.i0),
    samples: [G.samples[100].y, G.samples[900].hw, G.samples[1300].bank],
  });

  it('builds the same race twice from one seed, and another from another', () => {
    G.trackIdx = 4; startRace({ seed: 2024 }); const a = picture();
    resetMachine('tracks'); G.trackIdx = 4; startRace({ seed: 2024 }); const b = picture();
    expect(b).toEqual(a);
    expect(a.hazards.length).toBeGreaterThan(0);
    expect(a.hazards.every(h => Number.isInteger(h[0]))).toBe(true);
    expect(new Set(a.hazards.map(h => h[0])).size).toBe(a.hazards.length);
    expect(a.cyclists).toHaveLength(G.layout.cyclists);
    resetMachine('tracks'); G.trackIdx = 4; startRace({ seed: seedForVariant(TRACKS[4], (a.layout.variant + 1) % 3) }); const c = picture();
    expect(c.layout.name).not.toBe(a.layout.name);
    expect(c.hazards).not.toEqual(a.hazards);
  });

  it('numbers the static obstacles first, so a hazard dropped later never collides with them', () => {
    G.trackIdx = 0; startRace({ seed: 3 });
    const statics = G.hazards.map(h => h.id);
    expect(statics).toEqual(statics.map((_, i) => i + 1));
    expect(G.entitySeq).toBe(statics.length);
  });
});

// Relief (DEC-050): a kart on a slope sits on the road's height, climbs and
// descends with it, and the samples carry the width a `narrow` pinches.
describe('elevation and width, headless', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; });

  it('keeps a kart on the road height of its sample, camber included', () => {
    G.trackIdx = 3; startRace({ seed: 5 });   // the butte
    transitionToRace();
    const k = G.karts[0]; const i = G.samples.findIndex(s => s.y > 10 && Math.abs(s.slope) < 0.02);
    expect(i).toBeGreaterThan(0);
    const s = G.samples[i]; k.idx = i; k.pos.x = s.x + s.sx * 2; k.pos.z = s.z + s.sz * 2; k.speed = 0; k.air = false; k.y = 0;
    k.ctrl = () => ({ throttle: false, brake: false, left: false, right: false, drift: false }); k.isAI = false;
    simStep(STEP);
    expect(k.y).toBeCloseTo(s.y + 2 * s.bank, 6);
    expect(k.mesh.position.y).toBeCloseTo(k.y, 6);
    expect(Math.abs(k.y)).toBeGreaterThan(10);
  });

  it('pinches the width over a narrow feature and keeps the AI inside it', () => {
    G.trackIdx = 3; startRace({ seed: seedForVariant(TRACKS[3], 2) });   // « Nuit blanche »: narrow to 8 m around f = 0.5
    const f = G.layout.features.find(x => x.t === 'narrow'); const i0 = Math.floor(f.f * G.N);
    expect(G.samples[i0 + Math.floor(f.len / 2)].hw).toBeCloseTo(f.w, 6);
    expect(G.samples[(i0 - 20 + G.N) % G.N].hw).toBe(11);
    expect(G.samples[i0 + f.len + 20].hw).toBe(11);
  });

  it('lifts the riders and the item boxes with the road', () => {
    G.trackIdx = 3; startRace({ seed: 5 });
    const high = G.cyclists.filter(c => c.y > 10);
    expect(high.length).toBeGreaterThan(0);
    for (const c of G.cyclists) { const s = G.samples[Math.floor(c.d) % G.N]; expect(Math.abs(c.y - s.y)).toBeLessThan(2); }
    expect(G.itemBoxes.some(b => b.mesh.position.y > 12)).toBe(true);
  });

  function transitionToRace() { for (let n = 0; n < 4 * 60; n++) simStep(STEP); drain(); }
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
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; G.trackIdx = 0; startRace({ seed: 21 }); drain(); });

  it('puts cyclists on every circuit, and they keep riding', () => {
    expect(G.cyclists.length).toBeGreaterThan(8);
    const before = G.cyclists.map(c => [c.x, c.z]);
    for (let n = 0; n < 10 * 60; n++) simStep(STEP);
    const moved = G.cyclists.filter((c, i) => Math.hypot(c.x - before[i][0], c.z - before[i][1]) > 5);
    expect(moved.length).toBeGreaterThan(G.cyclists.length / 2);
    for (const c of G.cyclists) { expect(Number.isFinite(c.x)).toBe(true); expect(Math.abs(c.lat)).toBeLessThan(G.hw + 3); }
  });

  it('knocks over a cyclist a kart drives into, and shakes the kart', () => {
    for (let n = 0; n < 4 * 60; n++) simStep(STEP);   // racing
    drain();
    // a rider on the road (one on the pavement is out of the kart's reach: the wall keeps the kart on the road), upright
    const k = G.player, c = G.cyclists.find(o => o.fallen <= 0 && Math.abs(o.lat) < G.hw - 1);
    k.hazardGrace = 0; k.invincible = 0; k.shield = 0; k.speed = 30; k.pos.x = c.x; k.pos.z = c.z; k.idx = Math.floor(c.d); k.y = c.y;
    simStep(STEP);
    expect(c.fallen).toBeGreaterThan(0);
    expect(k.stun).toBeGreaterThan(0);
    expect(drain().map(e => resolveFor(e, k)).filter(Boolean).length).toBeGreaterThan(0);
  });
});

describe('several humans in one race', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; G.trackIdx = 0; startRace({ seed: 21 }); drain(); });

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

// "Légers" folds the still decor into fewer draws (track.js foldStill, PLAN
// 4.2): every circuit, built twice from the same random draws, once folded
// and once not, paints the same triangles in the same colours and finishes,
// before and after its animations and its crowd have run for a while, and
// everything that moves is still its own object in the scene.
describe('the "légers" decor', () => {
  let seed = 0;
  beforeEach(() => { if (getPoly() !== 'low') togglePoly(); });
  afterEach(() => { if (getPoly() !== 'high') togglePoly(); vi.restoreAllMocks(); });
  const r5 = v => Math.round(v * 1e5) / 1e5;
  /**
   * A scene's look: its visible triangles in world space, grouped by what paints them (material type, finish,
   * map tiling, and the colour, the material's times the vertex colour), each as its centroid, its area and the
   * side it faces (its winding against its vertex normals).
   */
  function look(root) {
    root.updateMatrixWorld(true);
    const out = new Map(), nm = new THREE.Matrix3(), col = new THREE.Color(), vcol = new THREE.Color(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    const walk = o => {
      if (!o.visible) return;
      if (o.isMesh) {
        const m = o.material, g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, vc = m.vertexColors ? g.attributes.color : null;
        nm.getNormalMatrix(o.matrixWorld);
        const total = g.index ? g.index.count : pos.count, at = g.index ? i => g.index.getX(i) : i => i;
        for (let t = g.drawRange.start; t + 2 < Math.min(total, g.drawRange.start + g.drawRange.count); t += 3) {
          const i0 = at(t), i1 = at(t + 1), i2 = at(t + 2);
          col.copy(m.color ?? vcol.setRGB(1, 1, 1)); if (vc) col.multiply(vcol.setRGB(vc.getX(i0), vc.getY(i0), vc.getZ(i0)));
          const key = [m.type, r5(m.roughness ?? -1), r5(m.metalness ?? -1), m.side, m.transparent ? 1 : 0, r5(m.opacity), m.blending, m.fog ? 1 : 0, m.map ? 'map' + m.map.repeat.toArray() + m.map.offset.toArray() : '', col.getHexString()].join(',');
          a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
          const face = e1.subVectors(b, a).cross(e2.subVectors(c, a));
          n.set(0, 0, 0); if (nor) for (const i of [i0, i1, i2]) n.add(e2.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize());
          if (!out.has(key)) out.set(key, []);
          out.get(key).push([(a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3, face.length() / 2, Math.sign(Math.round(face.dot(n) * 1e6))]);
        }
      }
      o.children.forEach(walk);
    };
    walk(root);
    return out;
  }
  /**
   * The same look: the same paints, and every triangle of one matched by its own triangle of the other, of the
   * same paint, within 1 mm, of the same area (to 1e-3, plus 1e-5 m² for the smallest caps) and facing the same
   * side. The folded decor keeps its vertices in world space, in float32 like every vertex: about 0.05 mm of
   * rounding at 700 m.
   */
  function sameLook(x, y, name) {
    expect([...x.keys()].sort(), name).toEqual([...y.keys()].sort());
    const cell = v => Math.floor(v / 0.01);
    for (const [key, xs] of x) {
      const ys = y.get(key); expect(ys.length, name + ' ' + key).toBe(xs.length);
      const grid = new Map(), used = new Uint8Array(ys.length);
      ys.forEach((t, j) => { const k = cell(t[0]) + ',' + cell(t[1]) + ',' + cell(t[2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(j); });
      let missing = 0;
      for (const t of xs) {
        let hit = -1;
        for (let dx = -1; dx <= 1 && hit < 0; dx++) for (let dy = -1; dy <= 1 && hit < 0; dy++) for (let dz = -1; dz <= 1 && hit < 0; dz++) {
          for (const j of grid.get((cell(t[0]) + dx) + ',' + (cell(t[1]) + dy) + ',' + (cell(t[2]) + dz)) ?? []) {
            const u = ys[j];
            if (!used[j] && Math.hypot(u[0] - t[0], u[1] - t[1], u[2] - t[2]) < 1e-3 && Math.abs(u[3] - t[3]) <= 1e-3 * t[3] + 1e-5 && u[4] === t[4]) { hit = j; break; }
          }
        }
        if (hit < 0) missing++; else used[hit] = 1;
      }
      expect(missing, name + ' ' + key + ': triangles without their match').toBe(0);
    }
  }
  /**
   * Build circuit i into a fresh scene from a fixed random sequence (three's uuids draw from their own: the
   * caches a first build fills make a second one create fewer objects); what it registered, for running it.
   */
  const real = Math.random;
  function build(i, fold) {
    let s = 20261028 + seed;
    vi.spyOn(Math, 'random').mockImplementation(() => { if (new Error().stack.includes('generateUUID')) return real(); s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; });
    const scene = new THREE.Scene(); G.animated = []; G.hazards = []; G.entitySeq = 0; G.trackIdx = i; G.track = TRACKS[i];
    buildTrack(scene, TRACKS[i], { fold, seed: 7 });   // the race seed is explicit: the seeded draws never go through Math.random
    vi.restoreAllMocks();
    return { scene, animated: G.animated, crowd: G.crowd, moving: [...G.crowd.map(c => c.g), ...G.cyclists.map(c => c.mesh), ...G.crossings.map(c => c.mesh), ...G.itemBoxes.map(b => b.mesh)] };
  }
  /** Run a built circuit's animations and crowd for `steps` server steps. */
  function run(built, steps) {
    const crowd = G.crowd; G.crowd = built.crowd;
    for (let n = 0; n < steps; n++) { G.time = n * STEP; for (const f of built.animated) f(STEP); animateCrowd(); }
    G.crowd = crowd;
  }

  it.each(TRACKS.map((t, i) => [t.name, i]))('paints %s the same in at most half the draws, and everything that moves still moves on its own', (_name, i) => {
    seed = i;
    const folded = build(i, true), plain = build(i, false);
    expect(countTriangles(folded.scene)).toBe(countTriangles(plain.scene));
    sameLook(look(folded.scene), look(plain.scene), TRACKS[i].id);
    // instanced batches (decor/instanced.js) are one draw a cell on both tiers and never fold: they stay out of the ratio
    const foldable = scene => countMeshes(scene, true) - countInstanced(scene);
    expect(foldable(folded.scene)).toBeLessThanOrEqual(foldable(plain.scene) / 2);
    for (const o of folded.moving) { let p = o; while (p.parent) p = p.parent; expect(p).toBe(folded.scene); expect(countMeshes(o)).toBeGreaterThan(0); }
    run(folded, 90); run(plain, 90);
    sameLook(look(folded.scene), look(plain.scene), TRACKS[i].id + ' after 1.5 s');
  }, 60000);
});
