// Stage 7, worker 7c: Marseille's dense decor and the shared street life
// (instanced crowds, flocks, swaying trees, furniture, bike kinds), headless.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyClimate } from '../climate.js';
import { BIKE_KINDS, buildCyclists } from '../cyclists.js';
import { TRACKS } from '../data.js';
import { countMeshes, countTriangles } from '../geo.js';
import { makeRng } from '../seed.js';
import { G, getPoly, togglePoly } from '../state.js';
import { buildTrack } from '../track.js';
import { CROWD_KINDS, crowdCount } from './crowd.js';
import { birdCount } from './flock.js';
import { MOTION } from './life.js';
import { TREE_KINDS } from './trees.js';

const MARSEILLE = TRACKS.findIndex(t => t.id === 'marseille');
const STEP = 1 / 60;
// Every circuit built twice from one random sequence is the same build (the pattern of headless.test.js).
const real = Math.random;
function mockRandom(seed) {
  let s = 20261028 + seed;
  vi.spyOn(Math, 'random').mockImplementation(() => { if (new Error().stack.includes('generateUUID')) return real(); s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; });
}
/** Build circuit i into a fresh scene on `level`, under a fixed random sequence; returns the scene and what the build registered. */
function build(i, level, { random = 3, seed = 7 } = {}) {
  if (getPoly() !== level) togglePoly();
  const scene = new THREE.Scene(); G.animated = []; G.hazards = []; G.crowd = []; G.lamps = []; G.disposables = []; G.entitySeq = 0; G.trackIdx = i; G.track = TRACKS[i];
  mockRandom(random); buildTrack(scene, TRACKS[i], { seed }); vi.restoreAllMocks();
  return { scene, animated: G.animated, crowd: crowdCount(), birds: birdCount() };
}
const instancedIn = scene => { const out = []; scene.traverse(o => { if (o.isInstancedMesh) out.push(o); }); return out; };
const run = (animated, steps) => { for (let n = 0; n < steps; n++) { G.time += STEP; for (const f of animated) f(STEP); } };

afterEach(() => { MOTION.on = false; if (getPoly() !== 'high') togglePoly(); G.karts = []; });

describe('Marseille — Vieux-Port, dense', () => {
  // The stage-7 tip before this work, measured the same way (fixed seed and random sequence, headless, no karts):
  // "détaillés" 3,091 meshes / 296.7k triangles, "légers" (folded) 1,135 / 163.5k.
  const BEFORE = { high: { meshes: 3091, tris: 296700 }, low: { meshes: 1135, tris: 163500 } };

  it.each([['détaillés', 'high', 1.4], ['légers', 'low', 1.1]])('holds the budget on %s: no more draws than before, triangles within the margin', (_n, level, margin) => {
    const { scene, crowd, birds } = build(MARSEILLE, level);
    expect(countMeshes(scene, true)).toBeLessThanOrEqual(BEFORE[level].meshes);
    expect(countTriangles(scene, true)).toBeLessThanOrEqual(BEFORE[level].tris * margin);
    // the density: about twice the legacy crowd (212 figures) on "détaillés", and the flocks
    if (level === 'high') { expect(crowd).toBeGreaterThan(350); expect(birds).toBeGreaterThan(100); }
    else { expect(crowd).toBeGreaterThan(150); expect(birds).toBeGreaterThan(30); }
  }, 30000);

  it('has its landmarks, each one named piece', () => {
    const { scene } = build(MARSEILLE, 'high');
    for (const name of ['marseille:ombriere', 'marseille:mucem', 'marseille:major', 'marseille:if', 'marseille:frioul', 'marseille:sea', 'marseille:harbour', 'marseille:shore', 'marseille:quays', 'fort', 'bonneMere', 'ferrisWheel', 'ferry', 'grandstand']) expect(scene.getObjectByName(name), name).toBeTruthy();
    // the far landmarks are merged: a draw or two each
    for (const name of ['marseille:mucem', 'marseille:major', 'marseille:if', 'fort', 'bonneMere']) expect(countMeshes(scene.getObjectByName(name)), name).toBeLessThanOrEqual(2);
  }, 30000);

  it('keeps every instanced copy and every landmark off the road', () => {
    const { scene } = build(MARSEILLE, 'high');
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    const nearest = (x, z) => { let best = Infinity, hw = 0; for (const s of G.samples) { const d = Math.hypot(s.x - x, s.z - z); if (d < best) { best = d; hw = s.hw; } } return best - hw; };
    let copies = 0;
    for (const mesh of instancedIn(scene)) for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m); copies++; expect(nearest(p.x, p.z), mesh.name + ' #' + i).toBeGreaterThan(1); }
    expect(copies).toBeGreaterThan(1000);
    const box = new THREE.Box3();
    for (const name of ['marseille:ombriere', 'marseille:mucem', 'marseille:major', 'marseille:if', 'marseille:frioul', 'marseille:sea', 'fort', 'bonneMere', 'ferrisWheel']) {
      box.setFromObject(scene.getObjectByName(name));
      for (const s of G.samples) expect(s.x > box.min.x - s.hw && s.x < box.max.x + s.hw && s.z > box.min.z - s.hw && s.z < box.max.z + s.hw, name).toBe(false);
    }
    // the water sheets that follow the ground: every vertex off the road and its pavement
    for (const name of ['marseille:harbour', 'marseille:shore']) { const pos = scene.getObjectByName(name).geometry.attributes.position; for (let i = 0; i < pos.count; i++) expect(nearest(pos.getX(i), pos.getZ(i)), name).toBeGreaterThan(6); }
  }, 60000);

  it('lines the Corniche with its balustrade and lamps on the sea side, lit at night', () => {
    const { scene } = build(MARSEILLE, 'high');
    const high = G.samples.filter(s => s.y > 10).length;
    // the shared lamps every 24 samples plus the Corniche's own every 24 of the high stretch
    expect(G.lamps.length).toBeGreaterThanOrEqual(Math.floor(G.N / 24) + Math.floor(high / 24) - 1);
    applyClimate(scene, TRACKS[MARSEILLE], 'night');
    const glow = scene.getObjectByName('lampGlow');
    expect(glow.geometry.index.count / 6).toBe(G.lamps.length * 2);   // two crossed quads per head, the instanced heads included
    for (const { head, rise } of G.lamps) { const y = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld).y; expect(Number.isFinite(y)).toBe(true); expect(rise).toBeGreaterThan(5); }
  }, 30000);
});

describe('the shared street life', () => {
  beforeEach(() => { G.time = 0; });

  it('draws the twelve crowd kinds and the twelve tree kinds', () => {
    expect(CROWD_KINDS).toHaveLength(12); expect(TREE_KINDS).toHaveLength(12); expect(BIKE_KINDS).toHaveLength(6);
    const { scene } = build(MARSEILLE, 'high');
    // the crowd's batches: torso, head and every kind's own parts; on "détaillés" a part of each kind is drawn somewhere
    const tris = new Set(instancedIn(scene).map(m => m.geometry.index.count));
    expect(tris.size).toBeGreaterThan(20);
  }, 30000);

  it('bobs the jumping figures with every part of them, and leaves the server\'s still', () => {
    const { animated, scene } = build(MARSEILLE, 'high');
    const snap = () => instancedIn(scene).map(m => Float32Array.from(m.instanceMatrix.array));
    const before = snap();
    run(animated, 30);                                   // headless: no motion
    expect(snap()).toEqual(before);
    MOTION.on = true; run(animated, 7);
    const after = snap(), moved = new Map();
    instancedIn(scene).forEach((m, k) => { for (let i = 0; i < m.count; i++) { const o = i * 16, dy = after[k][o + 13] - before[k][o + 13]; if (Math.abs(dy) > 1e-4 && Math.abs(after[k][o + 12] - before[k][o + 12]) < 1e-6) { const key = Math.round(before[k][o + 12] * 20) + ',' + Math.round(before[k][o + 14] * 20); (moved.get(key) || moved.set(key, []).get(key)).push(dy); } } });
    // figures whose three parts (torso, head, the kind's own) rose by the same height
    const whole = [...moved.values()].filter(d => d.length >= 3 && d.every(v => Math.abs(v - d[0]) < 1e-4));
    expect(whole.length).toBeGreaterThan(50);
  }, 30000);

  it('sends a pigeon flock up when a kart comes by, and lands it back where it was', () => {
    const { animated, scene } = build(0, 'high');
    // the furniture's first flock: a pavement spot; a kart drives up to it
    const sit = instancedIn(scene), m = new THREE.Matrix4(), p = new THREE.Vector3(), sc = new THREE.Vector3(), q = new THREE.Quaternion();
    const scaleOf = (mesh, i) => { mesh.getMatrixAt(i, m); m.decompose(p, q, sc); return sc.x; };
    const zeroes = () => sit.reduce((t, mesh) => { let n = 0; for (let i = 0; i < mesh.count; i++) if (scaleOf(mesh, i) < 1e-6) n++; return t + n; }, 0);
    MOTION.on = true;
    const hidden = zeroes();                              // the flying copies, shrunk while the birds sit
    expect(hidden).toBeGreaterThan(20);
    // find a sitting pigeon: its spot is where the flying copies wait
    const fly = sit.find(mesh => { for (let i = 0; i < mesh.count; i++) if (scaleOf(mesh, i) < 1e-6) return true; return false; });
    let spot = null; for (let i = 0; i < fly.count && !spot; i++) if (scaleOf(fly, i) < 1e-6) { fly.getMatrixAt(i, m); spot = new THREE.Vector3().setFromMatrixPosition(m); }
    G.karts = [{ pos: { x: spot.x + 4, z: spot.z }, speed: 20 }];
    run(animated, 60);
    expect(zeroes()).toBe(hidden);                       // as many copies hidden, but the other ones: the sitting birds
    fly.getMatrixAt(0, m); const up = []; for (let i = 0; i < fly.count; i++) { fly.getMatrixAt(i, m); m.decompose(p, q, sc); if (sc.x > 1e-6) up.push(p.y - spot.y); }
    expect(up.length).toBeGreaterThan(3);
    expect(Math.max(...up)).toBeGreaterThan(3);          // up in the air
    G.karts = []; run(animated, 9 * 60);
    let back = 0; for (let i = 0; i < fly.count; i++) if (scaleOf(fly, i) < 1e-6) back++;
    expect(back).toBe(fly.count);                         // all landed: every flying copy shrunk again
  }, 30000);

  it('sways the trees and rolls the boats', () => {
    const { animated, scene } = build(MARSEILLE, 'high');
    const before = instancedIn(scene).map(m => Float32Array.from(m.instanceMatrix.array));
    MOTION.on = true; G.climate = { id: 'overcast' }; run(animated, 40); G.climate = null;
    const changed = instancedIn(scene).filter((m, k) => m.instanceMatrix.array.some((v, j) => Math.abs(v - before[k][j]) > 1e-5));
    // crowd, birds wheeling, trees and boats: most parts of the circuit's street life move
    expect(changed.length).toBeGreaterThan(instancedIn(scene).length / 3);
  }, 30000);

  it('gives the riders six kinds of bike, cosmetic only: the seeded stream draws the same', () => {
    build(MARSEILLE, 'low');
    const kinds = new Set(), draws = [];
    for (let r = 0; r < 4; r++) { buildCyclists(new THREE.Scene(), makeRng(99), 24); for (const c of G.cyclists) kinds.add(c.mesh.userData.bike); draws.push(G.cyclists.map(c => [c.d, c.lat, c.base, c.timer])); }
    expect([...kinds].sort()).toEqual([...BIKE_KINDS].sort());
    for (const d of draws) expect(d).toEqual(draws[0]);
    expect(G.cyclists.every(c => countMeshes(c.mesh) > 5)).toBe(true);
  }, 30000);
});
