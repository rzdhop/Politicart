// Versailles' and Montmartre's decor (stage 7), headless: each circuit's
// landmarks are built, nothing the decor places stands on the road, the
// crowd it adds stands on the relief, the maze's gate piers follow the side
// the race's seed drew, and a full build keeps the stage's budgets on both
// tiers ("détaillés" no more meshes than before stage 7 and at most 40 % more
// triangles; "légers", folded as track.js folds it, no more meshes and at most
// 10 % more triangles).
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TRACKS } from '../data.js';
import { countMeshes, countTriangles } from '../geo.js';
import { seedForVariant } from '../layout.js';
import { animateCrowd } from '../race.js';
import { G, getPoly, togglePoly } from '../state.js';
import { buildTrack } from '../track.js';
import { yAt } from './context.js';
import { BUILDERS } from './index.js';
import { openedBatches as montmartreBatches } from './montmartre.js';
import { openedBatches as versaillesBatches } from './versailles.js';

/** A full build at seed 7 without karts before stage 7 (the mean of six builds): the budgets' base. */
const BEFORE = {
  versailles: { high: { meshes: 2746, tris: 491000 }, low: { meshes: 1146, tris: 191000 } },
  montmartre: { high: { meshes: 2835, tris: 561000 }, low: { meshes: 1220, tris: 185000 } },
};
const LANDMARKS = {
  versailles: ['versailles:chateau', 'versailles:latone', 'versailles:apollon', 'versailles:colonnade', 'versailles:orangerie', 'versailles:terrasses', 'versailles:labyrinthe'],
  montmartre: ['montmartre:butte', 'montmartre:sacre-coeur', 'montmartre:funiculaire', 'montmartre:place-du-tertre', 'montmartre:moulin-galette', 'montmartre:lapin-agile', 'montmartre:mur-je-taime', 'montmartre:terrasses'],
};
const BATCHES = { versailles: versaillesBatches, montmartre: montmartreBatches };

const setPoly = p => { if (getPoly() !== p) togglePoly(); };
afterEach(() => { setPoly('high'); vi.restoreAllMocks(); });

/**
 * Build circuit `id` on tier `poly` from a fixed random sequence (three's uuids keep their own), folded as a race
 * folds it; what its themed builder placed: the scale-1 pieces and the world pieces it added, and its batches.
 */
function build(id, poly, seed = 7) {
  setPoly(poly);
  const real = Math.random; let s = 20261029;
  vi.spyOn(Math, 'random').mockImplementation(() => { if (new Error().stack.includes('generateUUID')) return real(); s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; });
  const i = TRACKS.findIndex(t => t.id === id), orig = BUILDERS[id];
  let pieces = [];
  BUILDERS[id] = function* (decor, world) { const n0 = world.children.length; yield* orig(decor, world); pieces = [...decor.children, ...world.children.slice(n0)]; };
  const scene = new THREE.Scene(); G.animated = []; G.hazards = []; G.lamps = []; G.entitySeq = 0; G.trackIdx = i; G.track = TRACKS[i];
  try { buildTrack(scene, TRACKS[i], { seed }); } finally { BUILDERS[id] = orig; vi.restoreAllMocks(); }
  scene.updateMatrixWorld(true);
  return { scene, pieces, batches: BATCHES[id]().map(b => b.batch), opened: BATCHES[id]() };
}

/** The nearest sample to (x, z) (every other one, as isClear) and its distance. */
function nearest(x, z) {
  let best = null, bd = Infinity;
  for (let i = 0; i < G.N; i += 2) { const s = G.samples[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = s; } }
  return { s: best, d: Math.sqrt(bd) };
}
/** The vertices, in world space, of what `pieces` and `batches` draw: every one, so a merged piece is checked part by part. */
function* vertices(pieces, batches) {
  const v = new THREE.Vector3(), m = new THREE.Matrix4();
  for (const p of pieces) for (const o of (() => { const out = []; p.traverse(c => { if (c.isMesh && !c.isInstancedMesh) out.push(c); }); return out; })()) {
    const pos = o.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld); yield v; }
  }
  for (const b of batches) for (const mesh of b.meshes) {
    const pos = mesh.geometry.attributes.position;
    for (let n = 0; n < mesh.count; n++) { mesh.getMatrixAt(n, m); for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k).applyMatrix4(m); yield v; } }
  }
}

describe.each(['versailles', 'montmartre'])('the %s decor', id => {
  it('builds its landmarks, and nothing it places stands on the road', () => {
    const { scene, pieces, batches } = build(id, 'high');
    for (const name of LANDMARKS[id]) expect(scene.getObjectByName(name), name).toBeTruthy();
    expect(batches.length).toBeGreaterThan(5);
    let on = 0, seen = 0; const where = [];
    for (const v of vertices(pieces, batches)) {
      seen++;
      const { s, d } = nearest(v.x, v.z);
      if (d < s.hw - 0.3 && v.y < s.y + 6) { on++; if (where.length < 5) where.push([Math.round(v.x), Math.round(v.y), Math.round(v.z)]); }
    }
    expect(seen).toBeGreaterThan(10000);
    expect(on, 'vertices on the road, e.g. ' + JSON.stringify(where)).toBe(0);
  }, 60000);

  it('stands its crowd on the relief', () => {
    const { scene } = build(id, 'high');
    G.time = 0; animateCrowd();
    scene.updateMatrixWorld(true);
    const p = new THREE.Vector3(); let n = 0;
    for (const c of G.crowd) {
      if (c.g.parent !== scene) continue;   // figures inside a stand or a café move with it
      c.g.getWorldPosition(p); n++;
      expect(Math.abs(p.y - yAt(p.x, p.z)), `a figure at ${Math.round(p.x)}, ${Math.round(p.z)}`).toBeLessThan(3);
    }
    expect(n).toBeGreaterThan(20);
  }, 60000);

  it.each(['high', 'low'])('keeps the budgets on "%s"', poly => {
    const { scene } = build(id, poly);
    const before = BEFORE[id][poly], meshes = countMeshes(scene, true), tris = countTriangles(scene, true);
    expect(meshes).toBeLessThanOrEqual(before.meshes);
    expect(tris).toBeLessThanOrEqual(before.tris * (poly === 'high' ? 1.4 : 1.1));
    expect(meshes).toBeLessThan(14000);
  }, 60000);
});

describe('the Versailles maze', () => {
  it.each([0, 1, 2])('puts the gate piers on the open side of every hedge gate (variant %i)', j => {
    const track = TRACKS.find(t => t.id === 'versailles');
    const { opened } = build('versailles', 'high', seedForVariant(track, j));
    const posts = opened.find(b => b.label === 'gate posts').batch;
    const gates = G.layout.features.filter(f => f.t === 'chicane' && f.kind === 'hedge');
    expect(gates.length).toBeGreaterThan(0);
    const spots = [], m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (const mesh of posts.meshes) for (let n = 0; n < mesh.count; n++) { mesh.getMatrixAt(n, m); spots.push(p.setFromMatrixPosition(m).clone()); }
    let gatesSeen = 0;
    for (const f of gates) for (let k = 0; k < (f.n || 3); k++) {
      const s = G.samples[(Math.floor(f.f * G.N) + k * 9) % G.N];
      const blocks = G.hazards.filter(h => h.kind === 'hedge' && Math.hypot(h.x - s.x, h.z - s.z) < s.hw + 1);
      const side = Math.sign((blocks[0].x - s.x) * s.sx + (blocks[0].z - s.z) * s.sz);
      const near = spots.filter(q => Math.abs((q.x - s.x) * s.tx + (q.z - s.z) * s.tz) < 5 && Math.abs((q.x - s.x) * s.sx + (q.z - s.z) * s.sz) < s.hw + 4);
      expect(near.length).toBeGreaterThanOrEqual(2);
      for (const q of near) expect(Math.sign((q.x - s.x) * s.sx + (q.z - s.z) * s.sz)).toBe(-side);
      gatesSeen++;
    }
    expect(gatesSeen).toBe(gates.reduce((a, f) => a + (f.n || 3), 0));
  }, 60000);
});
