// The Élysée's and the Palais Bourbon's decor (stage 7, worker 7a), headless:
// their budgets on both detail levels against the decor they replaced, their
// landmarks, nothing of theirs on the road, everything inside the sky.
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';

import { TRACKS } from '../data.js';
import { countMeshes, countTriangles } from '../geo.js';
import { seedForVariant } from '../layout.js';
import { G, getPoly, togglePoly } from '../state.js';
import { buildTrack } from '../track.js';

/**
 * The scene before this decor (the integration tip 998a64d with stage 0's
 * builders, same seeds), headless, at race start, one row per layout variant:
 * [meshes, triangles] on "détaillés", then on "légers" (folded); the median
 * of eight builds, since the cosmetic draws vary between builds.
 */
const BEFORE = {
  elysee: { high: [[2215, 768555], [2312, 776211], [2226, 774187]], low: [[763, 205027], [759, 209963], [702, 209383]] },
  bourbon: { high: [[2026, 604702], [2008, 612148], [2107, 623330]], low: [[684, 182886], [602, 184520], [674, 188346]] },
};
/** The landmarks each circuit must show, by group name. */
const LANDMARKS = {
  elysee: ['elysee:palais', 'elysee:cour-honneur', 'elysee:jardin', 'elysee:helicoptere', 'elysee:faubourg', 'elysee:beauvau', 'elysee:presse', 'elysee:cour-pavee', 'elysee:tapis-rouge', 'elysee:escorte'],
  bourbon: ['bourbon:assemblee', 'bourbon:presse', 'bourbon:obelisque', 'bourbon:concorde', 'bourbon:seine', 'bourbon:pont-concorde', 'bourbon:pont-alexandre-iii', 'bourbon:pylones', 'bourbon:tunnel', 'bourbon:pont-route', 'bourbon:bateau-mouche', 'bourbon:batobus', 'bourbon:paris-plages', 'bourbon:peniche', 'bourbon:rive-droite'],
};
/** What lies on the road on purpose: the cour pavée's cobbles, the red carpet, the tunnel's haze, the escort riding with the crossing's car. */
const ON_ROAD = /:pavers|:carpet|:haze|escorte/;

const setPoly = p => { if (getPoly() !== p) togglePoly(); };
afterEach(() => setPoly('high'));
function build(i, seed) {
  const scene = new THREE.Scene(); G.animated = []; G.hazards = []; G.entitySeq = 0; G.trackIdx = i; G.track = TRACKS[i]; G.crowd = []; G.lamps = [];
  buildTrack(scene, TRACKS[i], { seed });
  return scene;
}
const named = (scene, prefix) => { const out = []; scene.traverse(o => { if (o.name.startsWith(prefix + ':')) out.push(o); }); return out; };

describe.each([['elysee', 0], ['bourbon', 1]])('%s decor', (id, i) => {
  it.each(['high', 'low'])('holds its budget on « %s », every layout: no more meshes than before, triangles +40 % / +10 % at most', poly => {
    setPoly(poly);
    for (let v = 0; v < 3; v++) {
      const scene = build(i, seedForVariant(TRACKS[i], v)), [meshes, tris] = BEFORE[id][poly][v];
      expect(countMeshes(scene, true), `${id} ${poly} variant ${v} meshes`).toBeLessThanOrEqual(meshes);
      expect(countTriangles(scene, true), `${id} ${poly} variant ${v} triangles`).toBeLessThanOrEqual(tris * (poly === 'high' ? 1.4 : 1.1));
    }
  }, 60000);

  it('shows its landmarks, its street life and its lamps', () => {
    const scene = build(i, 7);
    for (const name of LANDMARKS[id]) expect(named(scene, name.split(':')[0]).some(o => o.name === name), name).toBe(true);
    let copies = 0; scene.traverse(o => { if (o.isInstancedMesh) copies += o.count; });
    expect(copies).toBeGreaterThan(2000);                                       // trees, bollards, benches, candelabra, crowds, bouquinistes...
    expect(G.lamps.length).toBeGreaterThan(120);                                // the candelabra light at dusk and at night
    if (id === 'elysee') expect(G.crossings[0].mesh.getObjectByName('elysee:escorte')).toBeTruthy();
  });

  it('puts nothing on the road but what belongs there, and nothing beyond the sky', () => {
    for (const seed of [seedForVariant(TRACKS[i], 0), seedForVariant(TRACKS[i], 1), seedForVariant(TRACKS[i], 2)]) {
      const scene = build(i, seed); scene.updateMatrixWorld(true);
      const grid = new Map(); for (const s of G.samples) { const k = Math.floor(s.x / 20) + ',' + Math.floor(s.z / 20); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
      /** The nearest sample to (x, z) within 40 m, and its distance. */
      const near = (x, z) => { let b = null, bd = Infinity; const cx = Math.floor(x / 20), cz = Math.floor(z / 20); for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) for (const s of grid.get((cx + a) + ',' + (cz + c)) || []) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; b = s; } } return b && { s: b, d: Math.sqrt(bd) }; };
      const moving = new Set([...G.crossings.map(c => c.mesh), ...G.hazards.map(h => h.mesh), ...G.cyclists.map(c => c.mesh)]);
      const owner = o => { for (let p = o; p; p = p.parent) { if (moving.has(p) || ON_ROAD.test(p.name)) return null; if (p.name.startsWith(id + ':') || p.name.startsWith('paris:')) return p.name; } return o.isInstancedMesh ? 'instanced' : null; };
      const onRoad = [], v = new THREE.Vector3(), m = new THREE.Matrix4();
      scene.traverse(o => {
        if (!o.isMesh) return;
        const name = owner(o); if (!name) return;
        // a vertex under 9 m over the road (the tunnel's slab and the gate's arch pass over it), inside the road's half-width
        const test = (x, y, z) => { const n = near(x, z); if (n && y - n.s.y < 9 && n.d < n.s.hw - 0.05) onRoad.push(name); };
        if (o.isInstancedMesh) { for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, m); v.setFromMatrixPosition(m); test(v.x, v.y, v.z); } return; }
        const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 3000));
        for (let k = 0; k < pos.count; k += step) { v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld); test(v.x, v.y, v.z); }
      });
      expect([...new Set(onRoad)], `seed ${seed}`).toEqual([]);
      // the sky is a sphere of 1,100 m round the origin (climate.js): nothing of the decor beyond it
      let far = 0; for (const g of named(scene, id)) g.traverse(o => { if (!o.isMesh || o.isInstancedMesh) return; const pos = o.geometry.attributes.position; for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld); far = Math.max(far, Math.hypot(v.x, v.z)); } });
      expect(far).toBeLessThan(1100);
    }
  }, 60000);
});
