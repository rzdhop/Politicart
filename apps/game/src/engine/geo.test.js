// Geometry helpers: the r128 capsule, the merge by material (DEC-044) and the
// vertex-colour bake, all headless.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { bakeVertexColours, capsule, capsuleTriangles, countMeshes, countTriangles, finishOf, geometryTriangles, mergeByMaterial, mergeInWorld } from './geo.js';

describe('capsule', () => {
  it.each([[4, 8, 1], [12, 32, 1], [1, 3, 1], [6, 16, 3], [12, 24, 2]])('has three\'s triangle count, 2 * radial * (2 * cap + height), for cap %i radial %i height %i', (cap, radial, hs) => {
    const g = capsule(0.3, 0.8, cap, radial, hs);
    expect(geometryTriangles(g)).toBe(2 * radial * (2 * cap + hs));
    expect(capsuleTriangles(cap, radial, hs)).toBe(2 * radial * (2 * cap + hs));
    expect(g.attributes.position.count).toBe((2 * cap + hs + 1) * (radial + 1));
  });

  it('matches the template\'s limb call and three\'s defaults', () => {
    expect(geometryTriangles(capsule(0.025, 0.3, 12, 32))).toBe(1600); // CapsuleGeometry(r, len, 12, 32) in characters.js
    expect(geometryTriangles(capsule())).toBe(144); // CapsuleGeometry() = (1, 1, 4, 8, 1)
    expect(capsule(1, 2, 3, 5).parameters).toEqual({ radius: 1, height: 2, capSegments: 3, radialSegments: 5, heightSegments: 1 });
    expect(capsule().type).toBe('CapsuleGeometry');
  });

  it('is a capsule: total height length + 2r, radius r, unit outward normals, v in [0, 1]', () => {
    const r = 0.25, len = 1, g = capsule(r, len, 8, 16);
    g.computeBoundingBox();
    expect(g.boundingBox.min.y).toBeCloseTo(-(len / 2 + r), 6);
    expect(g.boundingBox.max.y).toBeCloseTo(len / 2 + r, 6);
    expect(g.boundingBox.max.x).toBeCloseTo(r, 6);
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, v = new THREE.Vector3(), w = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(n.getX(i), n.getY(i), n.getZ(i));
      expect(v.length()).toBeCloseTo(1, 5);
      w.set(p.getX(i), 0, p.getZ(i));
      if (w.lengthSq() > 1e-6) expect(v.x * w.x + v.z * w.z).toBeGreaterThan(0);
      // three shifts the pole rows' u by half a quad, so they reach half a segment past [0, 1]
      expect(uv.getX(i)).toBeGreaterThanOrEqual(-0.5 / 16); expect(uv.getX(i)).toBeLessThanOrEqual(1 + 0.5 / 16);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0); expect(uv.getY(i)).toBeLessThanOrEqual(1);
    }
  });

  it('faces outwards (counter-clockwise seen from outside)', () => {
    const g = capsule(0.5, 1, 4, 12), p = g.attributes.position, idx = g.index;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), centre = new THREE.Vector3();
    let out = 0, total = 0;
    for (let k = 0; k < idx.count; k += 3) {
      a.fromBufferAttribute(p, idx.getX(k)); b.fromBufferAttribute(p, idx.getX(k + 1)); c.fromBufferAttribute(p, idx.getX(k + 2));
      const face = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (face.lengthSq() < 1e-12) continue; // the degenerate pole triangles, as in three
      centre.copy(a).add(b).add(c).divideScalar(3);
      total++; if (face.dot(centre) > 0) out++;
    }
    expect(out).toBe(total);
  });
});

/** A small pilot-like rig: nested groups, shared and distinct materials, a mirrored part, a kept head, odds and ends. */
function rig() {
  const paint = new THREE.MeshStandardMaterial({ name: 'paint', color: 0x1f3a93 });
  const skin = new THREE.MeshStandardMaterial({ name: 'skin', color: 0xf5d6c6 });
  const dark = new THREE.MeshStandardMaterial({ name: 'dark', color: 0x222222 });
  const glow = new THREE.MeshBasicMaterial({ name: 'glow', color: 0xff8800 });
  const root = new THREE.Group(); root.position.set(5, 0, -2); root.rotation.y = 0.4; root.scale.setScalar(1.45);
  const kart = new THREE.Group(); kart.name = 'kart'; kart.position.y = 0.2; root.add(kart);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 2), paint); kart.add(body);
  const podL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.6), paint); podL.position.set(-0.6, 0.1, 0); kart.add(podL);
  const podR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.6), paint); podR.position.set(0.6, 0.1, 0); podR.scale.x = -1; kart.add(podR); // mirrored
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0.2, 0.4)]), { depth: 0.2, bevelEnabled: false }), paint); // non-indexed
  hull.position.z = 0.8; kart.add(hull);
  const bare = new THREE.BufferGeometry(); bare.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0], 3)); // no normal, no uv
  kart.add(new THREE.Mesh(bare, dark));
  kart.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 12), dark));
  const pilot = new THREE.Group(); pilot.name = 'pilot'; pilot.position.set(0, 0.5, -0.2); pilot.rotation.x = -0.1; kart.add(pilot);
  pilot.add(new THREE.Mesh(capsule(0.3, 0.5, 4, 10), paint));
  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.7, 0); head.rotation.z = 0.2; pilot.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), skin));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), dark); eye.position.set(0.1, 0.05, 0.38); head.add(eye);
  const eye2 = eye.clone(); eye2.position.x = -0.1; head.add(eye2);
  const exhaust = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), glow); exhaust.name = 'exhaust-glow'; exhaust.position.z = -1.1; kart.add(exhaust);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), skin); hidden.visible = false; kart.add(hidden);
  const light = new THREE.PointLight(0xff0000, 1); light.position.y = 1; kart.add(light);
  return { root, head, exhaust, hidden, light, paint, skin, dark, glow };
}
const materialsOf = o => { const s = new Set(); o.traverse(m => { if (m.isMesh) s.add(m.material); }); return s; };
/** The exact world-space extent of every vertex (Box3.setFromObject transforms local boxes, which is loose under rotation). */
const worldBox = o => {
  o.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  o.traverse(m => { if (!m.isMesh) return; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld)); });
  return box;
};

describe('mergeByMaterial', () => {
  it('keeps the triangle count, the material set and the world-space extent', () => {
    const { root } = rig();
    const tris = countTriangles(root), mats = materialsOf(root), box = worldBox(root);
    mergeByMaterial(root, ['head']);
    expect(countTriangles(root)).toBe(tris);
    expect(materialsOf(root)).toEqual(mats);
    const after = worldBox(root);
    expect(after.min.distanceTo(box.min)).toBeLessThan(1e-5);
    expect(after.max.distanceTo(box.max)).toBeLessThan(1e-5);
  });

  it('leaves one mesh per material outside the kept groups, and merges inside them', () => {
    const { root, head, paint, dark, skin } = rig();
    const before = countMeshes(root);
    mergeByMaterial(root, ['head', 'exhaust-glow']);
    const meshes = root.children.filter(o => o.isMesh && o.visible && o.name !== 'exhaust-glow');
    expect(meshes.map(m => m.material).sort((a, b) => a.name.localeCompare(b.name))).toEqual([dark, paint]);
    expect(head.parent).toBe(root);
    expect(head.children.map(m => m.material).sort((a, b) => a.name.localeCompare(b.name))).toEqual([dark, skin]);
    expect(countMeshes(root)).toBeLessThan(before);
  });

  it('keeps the excluded groups as the same objects, animatable, at the same place', () => {
    const { root, head, exhaust } = rig();
    root.updateMatrixWorld(true);
    const headWorld = head.matrixWorld.clone(), exWorld = exhaust.matrixWorld.clone();
    mergeByMaterial(root, [head, o => o.name === 'exhaust-glow']);
    root.updateMatrixWorld(true);
    expect(head.matrixWorld.equals(headWorld) || head.matrixWorld.elements.every((e, i) => Math.abs(e - headWorld.elements[i]) < 1e-6)).toBe(true);
    expect(exhaust.parent).toBe(root);
    expect(exhaust.matrixWorld.elements.every((e, i) => Math.abs(e - exWorld.elements[i]) < 1e-6)).toBe(true);
    // the head still turns about its own pivot, carrying its merged eyes
    const eyes = head.children.find(m => m.material.name === 'dark');
    const p0 = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    head.rotation.y += 1; root.updateMatrixWorld(true);
    expect(new THREE.Vector3().setFromMatrixPosition(head.matrixWorld).distanceTo(p0)).toBeLessThan(1e-6);
    expect(eyes.parent).toBe(head);
  });

  it('keeps hidden parts, lights and unlit glows as they are', () => {
    const { root, hidden, light } = rig();
    mergeByMaterial(root, ['head']);
    expect(hidden.parent).toBe(root);
    expect(hidden.visible).toBe(false);
    expect(light.parent).toBe(root);
  });

  it('keeps mirrored parts facing out (winding follows the vertex normals)', () => {
    const m = new THREE.MeshStandardMaterial(), root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m); a.scale.set(-1, 1, 1); a.position.x = 2; root.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m); b.scale.set(1, -2, 1); root.add(b);
    mergeByMaterial(root);
    expect(root.children).toHaveLength(1);
    const g = root.children[0].geometry, p = g.attributes.position, n = g.attributes.normal, idx = g.index;
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), nv = new THREE.Vector3();
    for (let k = 0; k < idx.count; k += 3) {
      va.fromBufferAttribute(p, idx.getX(k)); vb.fromBufferAttribute(p, idx.getX(k + 1)); vc.fromBufferAttribute(p, idx.getX(k + 2));
      const face = vb.sub(va).cross(vc.sub(va));
      nv.fromBufferAttribute(n, idx.getX(k));
      expect(face.dot(nv)).toBeGreaterThan(0);
    }
  });

  it('fills attributes a part lacks', () => {
    const m = new THREE.MeshStandardMaterial(), root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m));
    const bare = new THREE.BufferGeometry(); bare.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    root.add(new THREE.Mesh(bare, m));
    mergeByMaterial(root);
    const g = root.children[0].geometry;
    expect(Object.keys(g.attributes).sort()).toEqual(['normal', 'position', 'uv']);
    expect(g.attributes.position.count).toBe(7);
    expect(geometryTriangles(g)).toBe(3);
  });

  it('honours a draw range', () => {
    const m = new THREE.MeshStandardMaterial(), root = new THREE.Group(), g = new THREE.BoxGeometry(1, 1, 1);
    g.setDrawRange(0, 12); root.add(new THREE.Mesh(g, m)); root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m));
    const tris = countTriangles(root);
    mergeByMaterial(root);
    expect(tris).toBe(4 + 12);
    expect(countTriangles(root)).toBe(tris);
  });
});

describe('bakeVertexColours', () => {
  it('folds material colours into vertex colours on one shared material, which then merges to one draw', () => {
    const { root, head, paint, glow } = rig();
    const target = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
    const tris = countTriangles(root);
    bakeVertexColours(root, target);
    root.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      if (o.material === glow) return; // unlit glows stay as they are
      expect(o.material).toBe(target);
      expect(o.geometry.attributes.color).toBeDefined();
    });
    const body = root.children[0].children[0];
    expect(body.geometry.attributes.color.getX(0)).toBeCloseTo(paint.color.r, 6);
    mergeByMaterial(root, ['head', 'exhaust-glow']);
    expect(root.children.filter(o => o.isMesh && o.visible && o.material === target)).toHaveLength(1);
    expect(head.children).toHaveLength(1);
    expect(countTriangles(root)).toBe(tris);
  });

  it('leaves mapped materials (the jacket fabric) unless told otherwise, and never mutates a shared geometry', () => {
    const map = new THREE.Texture(), jacket = new THREE.MeshStandardMaterial({ map }), root = new THREE.Group(), geo = new THREE.BoxGeometry();
    const a = new THREE.Mesh(geo, jacket), b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xff0000 }));
    root.add(a, b);
    const target = new THREE.MeshStandardMaterial({ vertexColors: true });
    bakeVertexColours(root, target);
    expect(a.material).toBe(jacket);
    expect(b.material).toBe(target);
    expect(geo.attributes.color).toBeUndefined();
    bakeVertexColours(root, target, { keepMapped: false });
    expect(a.material).toBe(target);
  });

  it('needs a vertex-coloured target', () => {
    expect(() => bakeVertexColours(new THREE.Group(), new THREE.MeshStandardMaterial())).toThrow(/vertexColors/);
  });

  it('picks a target per mesh with finishOf: one per finish, nothing for what is not a plain lit material', () => {
    const root = new THREE.Group(), geo = new THREE.BoxGeometry();
    const red = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.85, metalness: 0.05 }), blue = new THREE.MeshStandardMaterial({ color: 0x0000ff, roughness: 0.85, metalness: 0.05 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.2, metalness: 0.4 }), map = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const glow = new THREE.MeshStandardMaterial({ emissive: 0x331100 }), see = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 }), lamp = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const parts = [red, blue, glass, map, glow, see, lamp].map(m => { const o = new THREE.Mesh(geo, m); root.add(o); return o; });
    bakeVertexColours(root, finishOf);
    const [a, b, c, ...rest] = parts;
    expect(a.material).toBe(b.material);                                   // the same finish: one material
    expect(a.material).toMatchObject({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
    expect(a.material.color.getHex()).toBe(0xffffff);
    expect(c.material).not.toBe(a.material); expect(c.material).toMatchObject({ roughness: 0.2, metalness: 0.4 });
    expect(rest.map(o => o.material)).toEqual([map, glow, see, lamp]);   // a map, a glow, transparency, an unlit light: left alone
    expect(b.geometry.attributes.color.getZ(0)).toBe(1);
    expect(finishOf(red)).toBe(a.material);                                 // shared across calls
    mergeByMaterial(root);
    expect(countMeshes(root)).toBe(6);
  });
});

describe('mergeInWorld', () => {
  it('merges meshes where they stand, under any parent, non-uniform scales included', () => {
    const world = new THREE.Group(), decor = new THREE.Group(); decor.scale.set(3, 1, 3); world.add(decor);
    const m = new THREE.MeshStandardMaterial(), a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m), b = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), m);
    a.position.set(2, 0, 0); a.rotation.x = 0.4; decor.add(a); b.position.set(-5, 1, 2); world.add(b);
    world.updateMatrixWorld(true);
    const corners = o => { const p = o.geometry.attributes.position, out = []; for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).toArray().map(v => v.toFixed(5)).join()); return out; };
    const before = [...corners(a), ...corners(b)];
    const merged = mergeInWorld([a, b]); world.add(merged); world.updateMatrixWorld(true);
    expect(merged.material).toBe(m);
    expect(corners(merged)).toEqual(before);
    expect(countTriangles(merged)).toBe(24);
  });
});
