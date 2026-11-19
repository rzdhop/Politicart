// The roadside's dressing (decor/roadside.js), headless: every circuit gets
// its recipe on "détaillés", nothing of it on "légers" or on the road, and a
// butte listed by a track rises where it says.
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';

import { TRACKS } from '../data.js';
import { G, getPoly, togglePoly } from '../state.js';
import { buildTrack } from '../track.js';
import { PAVEMENT, terrainY } from './context.js';
import { roadsideCount } from './roadside.js';

const setPoly = p => { if (getPoly() !== p) togglePoly(); };
afterEach(() => setPoly('high'));
function build(i, opts = {}) {
  const scene = new THREE.Scene(); G.animated = []; G.hazards = []; G.entitySeq = 0; G.trackIdx = i; G.track = TRACKS[i]; G.crowd = []; G.lamps = [];
  buildTrack(scene, TRACKS[i], { seed: 4, ...opts });
  return scene;
}

describe('the roadside dressing', () => {
  it.each(TRACKS.map((t, i) => [t.id, i]))('lines %s on « détaillés » and leaves « légers » as it was', (_id, i) => {
    const high = build(i), counts = { ...roadsideCount() }, total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(900);
    expect(total).toBeLessThan(3600);                       // the budget: a few thousand instanced copies, a few draws per 400 m cell
    // every copy is clear of the road: past its edge, the kerb's posts included
    const roadside = high.userData.world.children.filter(o => o.isInstancedMesh);   // the decor's batches: the urnes and the coins on the road are the scene's own
    const m = new THREE.Matrix4(), v = new THREE.Vector3(); let onRoad = 0;
    for (const o of roadside) for (let k = 0; k < o.count; k += 7) {
      o.getMatrixAt(k, m); v.setFromMatrixPosition(m);
      for (let n = 0; n < G.N; n += 2) { const s = G.samples[n]; if ((s.x - v.x) ** 2 + (s.z - v.z) ** 2 < (s.hw - 0.3) ** 2 && Math.abs(v.y - s.y) < 3) { onRoad++; break; } }
    }
    expect(onRoad).toBe(0);
    setPoly('low'); build(i);
    expect(Object.keys(roadsideCount())).toEqual([]);
  }, 60000);

  it('raises a track’s buttes beside the road and keeps them off it', () => {
    const i = TRACKS.findIndex(t => t.hills), track = TRACKS[i], [x, z, , h] = track.hills[0];
    build(i, { decor: false });
    expect(terrainY(x * track.scale, z * track.scale)).toBeGreaterThan(h * 0.8);
    for (let k = 0; k < G.N; k += 9) { const s = G.samples[k], lat = s.hw + PAVEMENT; expect(terrainY(s.x + s.sx * lat, s.z + s.sz * lat)).toBeLessThanOrEqual(s.y + lat * s.bank); }
  });
});
