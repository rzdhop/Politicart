// Repeated decor props as InstancedMesh batches (decor/instanced.js, DEC-056), headless.
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';

import { countMeshes, countTriangles } from '../geo.js';
import { G } from '../state.js';
import { setDecorScale, STILL, still } from './context.js';
import { CELL, flushInstanced, fromBuilder, instanced, openBatches, resetInstanced } from './instanced.js';

/** A three-part prop: two parts of one plain colour finish (merged into one), one of another. */
function prop() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 })); trunk.position.y = 1.5; trunk.castShadow = true;
  const crown = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.9 })); crown.position.y = 4.5; crown.castShadow = true;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff })); sign.position.set(0, 2, 0.5);
  g.add(trunk, crown, sign);
  return g;
}
const flush = scene => { for (const _ of flushInstanced(scene)) { /* every batch */ } };

afterEach(() => { resetInstanced(); setDecorScale(1); });

describe('instanced decor batches', () => {
  it('draws a prop once per merged part and cell, with every copy\'s triangles', () => {
    const one = countTriangles(prop());
    const b = instanced(prop);
    for (let i = 0; i < 300; i++) b.add((i % 30) * 6, Math.floor(i / 30) * 6);   // 174 x 54 m: one cell
    const scene = new THREE.Scene(); flush(scene);
    expect(b.count).toBe(300);
    expect(b.meshes).toHaveLength(2);                                    // the two colour parts merged into one finish, the sign kept
    expect(countMeshes(scene)).toBe(2);
    expect(b.meshes.every(m => m.isInstancedMesh && m.count === 300)).toBe(true);
    expect(countTriangles(scene)).toBe(one * 300);
    expect(b.meshes.find(m => m.material.vertexColors).castShadow).toBe(true);
    expect(openBatches()).toBe(0);
  });

  it('splits copies by cell, and each cell\'s bounds hold every copy it draws', () => {
    const b = instanced(prop);
    const spots = [[0, 0], [10, 10], [CELL * 3 + 5, 0], [-CELL * 2, CELL * 4]];
    for (const [x, z] of spots) b.add(x, z, { scale: 1.5, rotY: 1 });
    const scene = new THREE.Scene(); flush(scene);
    expect(b.meshes).toHaveLength(3 * 2);                                // three cells, two parts each
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (const mesh of b.meshes) {
      expect(mesh.frustumCulled).toBe(true);
      for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m); expect(mesh.geometry.boundingSphere.containsPoint(p)).toBe(true); }
    }
    // the cells share the parts' buffers: one upload per part, not per cell
    const sameKind = b.meshes.filter(x => x.material === b.meshes[0].material);
    expect(new Set(sameKind.map(x => x.geometry.attributes.position)).size).toBe(1);
  });

  it('places scale-1 copies at the circuit\'s scale, and world copies as given', () => {
    setDecorScale(3);
    const local = instanced(prop), world = instanced(prop, { world: true });
    local.add(10, 20); world.add(10, 20, { y: 4 });
    const scene = new THREE.Scene(); flush(scene);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), base = new THREE.Vector3();
    local.meshes[0].getMatrixAt(0, m); p.setFromMatrixPosition(m);
    expect([Math.round(p.x), Math.round(p.z)]).toEqual([30, 60]);
    world.meshes[0].getMatrixAt(0, m); base.setFromMatrixPosition(m);
    expect([Math.round(base.x), Math.round(base.z)]).toEqual([10, 20]);
    expect(base.y).toBeCloseTo(4);                                       // a merged part keeps its offset in its vertices: the matrix is the copy's pose
  });

  it('tints copies only when asked, and moves a copy after the flush', () => {
    const plain = instanced(prop), tinted = instanced(prop, { tint: true });
    plain.add(0, 0); const i = tinted.add(0, 0, { color: 0xff0000 }); tinted.add(5, 5);
    const scene = new THREE.Scene(); flush(scene);
    expect(plain.meshes.every(m => m.instanceColor === null)).toBe(true);
    tinted.meshes.forEach((m, i) => { expect(m.material).not.toBe(plain.meshes[i].material); });   // a program of their own (r128)
    const c = new THREE.Color(); const mesh = tinted.meshes[0];
    expect(mesh.instanceColor).not.toBeNull();
    c.fromArray(mesh.instanceColor.array, i * 3); expect(c.getHex()).toBe(0xff0000);
    c.fromArray(mesh.instanceColor.array, 3); expect(c.getHex()).toBe(0xffffff);
    const before = mesh.instanceMatrix.version;
    tinted.move(i, { y: 3, rotY: 0.5 });
    const m = new THREE.Matrix4(), p = new THREE.Vector3(); mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m);
    expect(mesh.instanceMatrix.version).toBeGreaterThan(before);
    expect(p.y).toBeCloseTo(3);
  });

  it('makes nothing for an empty batch, and a new build forgets unflushed batches', () => {
    instanced(prop);
    const scene = new THREE.Scene(); flush(scene);
    expect(scene.children).toHaveLength(0);
    instanced(prop).add(0, 0); resetInstanced();
    expect(openBatches()).toBe(0);
  });

  it('makes a prop from a scene builder and takes back what the builder registered', () => {
    G.crowd = []; G.animated = []; const marks = STILL.length;
    const make = fromBuilder(scene => { const p = still(prop()); scene.add(p); G.crowd.push({ g: p }); G.animated.push(() => {}); });
    const b = instanced(make); b.add(0, 0); b.add(30, 0);
    const scene = new THREE.Scene(); flush(scene);
    expect(b.meshes).toHaveLength(2);
    expect([STILL.length, G.crowd.length, G.animated.length]).toEqual([marks, 0, 0]);
  });
});
