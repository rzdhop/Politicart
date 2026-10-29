// Repeated decor props as InstancedMesh batches (DEC-056).
//
// A batch holds the copies of one prop: the prop is built once by the
// function the batch is given (at the origin, the way street.js builds it),
// its parts are baked to the shared vertex-coloured finishes and merged by
// material (geo.js), and every copy is one instance of each merged part. A
// part draws once per CELL-metre square of the circuit that holds copies,
// not once per copy: r128 culls an InstancedMesh by its geometry's bounding
// sphere around its own origin, so each cell gets a geometry of its own
// (sharing the part's attributes) whose sphere covers that cell's copies.
//
// Builders add copies while the decor is built; track.js flushes every
// batch into the scene after spreading the decor (flushInstanced), so a
// copy placed in the decor's scale-1 coordinates lands where a small piece
// of decor would: moved to the circuit's scale and set on the ground there
// (yAt). A batch opened with `world: true` takes world units and absolute
// heights, as for pieces placed from G.samples.
//
// Instanced meshes are never marked still: the "légers" fold leaves them as
// they are (geo.js mergeable), and they already cost one draw per cell.
import * as THREE from 'three';

import { bakeVertexColours, finishOf, mergeByMaterial } from '../geo.js';
import { G } from '../state.js';
import { DS, STILL, yAt } from './context.js';

/** The side of the square cells copies are grouped by, in world metres. */
export const CELL = 200;
/**
 * The tinted copies' materials, by the material their prop baked to: r128
 * keeps one shader program per material and does not look again at whether
 * the next mesh drawn with it has per-copy colours, so a material shared by a
 * tinted and an untinted batch draws one of them wrong. Tinted batches get a
 * copy that only they use.
 */
const TINTED = new WeakMap();
const tintedOf = m => { if (!TINTED.has(m)) TINTED.set(m, m.clone()); return TINTED.get(m); };

/** The batches of the circuit being built, in the order they were opened; flushInstanced empties it. */
const BATCHES = [];

const ORIGIN = new THREE.Vector3();

/** The world matrix of a copy: at (x, y, z), turned `rotY` about the vertical, tilted `tiltX`/`tiltZ`, scaled `scale`. */
function copyMatrix(m, { x, y, z, rotY = 0, tiltX = 0, tiltZ = 0, scale = 1 }) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, rotY, tiltZ, 'YXZ'));
  return m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
}

/** The prop's merged parts: { geometry, material, matrix, cast, receive, radius } relative to the prop's origin. */
function partsOf(prop) {
  bakeVertexColours(prop, finishOf);
  if (!prop.isMesh) mergeByMaterial(prop);
  prop.position.copy(ORIGIN); prop.quaternion.identity(); prop.scale.set(1, 1, 1);
  prop.updateMatrixWorld(true);
  const parts = [];
  prop.traverse(o => {
    if (!o.isMesh || !o.visible || !o.geometry) return;
    const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    const centre = g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
    parts.push({ geometry: g, material: o.material, matrix: o.matrixWorld.clone(), cast: o.castShadow, receive: o.receiveShadow, radius: centre.length() + g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() });
  });
  return parts;
}

/**
 * Open a batch of copies of the prop `build()` makes. Options: `world`
 * (copies in world units with absolute heights, default false: the decor's
 * scale-1 coordinates, set on the ground), `tint` (each copy may take a
 * colour that multiplies the prop's own; off by default, as it adds a shader
 * variant), `pad` (metres of room in each cell's bounds for copies that
 * move(), default 2), `cell` (default CELL).
 *
 * The batch's `add(x, z, { y, rotY, tiltX, tiltZ, scale, color })` returns the
 * copy's index; after the flush, `move(i, pose)` sets a copy's pose again
 * (the same fields, in world units) for decor that sways or takes off, and
 * `meshes` lists the instanced meshes made. `count` is the number of copies.
 */
export function instanced(build, { world = false, tint = false, pad = 2, cell = CELL } = {}) {
  const copies = [];
  const batch = {
    meshes: [], count: 0,
    add(x, z, { y = 0, rotY = 0, tiltX = 0, tiltZ = 0, scale = 1, color = null } = {}) {
      copies.push({ x, z, y, rotY, tiltX, tiltZ, scale, color: color === null ? null : new THREE.Color(color) });
      return batch.count++;
    },
    move(i, pose) {
      const c = copies[i]; if (!c || !c.slot) return;
      Object.assign(c.pose, pose);
      const m = copyMatrix(new THREE.Matrix4(), c.pose), out = new THREE.Matrix4();
      c.slot.meshes.forEach((mesh, p) => { mesh.setMatrixAt(c.slot.index, out.multiplyMatrices(m, c.slot.parts[p].matrix)); mesh.instanceMatrix.needsUpdate = true; });
    },
    /** Make the instanced meshes into `scene` (track.js, through flushInstanced). */
    flush(scene) {
      if (!copies.length) return;
      const parts = partsOf(build());
      if (!parts.length) return;
      // resolve every copy's world pose, then group the copies by cell
      const cells = new Map();
      for (const c of copies) {
        const x = world ? c.x : c.x * DS, z = world ? c.z : c.z * DS, y = world ? c.y : yAt(x, z) + c.y;
        c.pose = { x, y, z, rotY: c.rotY, tiltX: c.tiltX, tiltZ: c.tiltZ, scale: c.scale };
        const key = Math.floor(x / cell) + ',' + Math.floor(z / cell);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(c);
      }
      const m = new THREE.Matrix4(), out = new THREE.Matrix4(), white = new THREE.Color(1, 1, 1);
      for (const group of cells.values()) {
        const meshes = parts.map(part => {
          const g = new THREE.BufferGeometry();
          for (const [name, attr] of Object.entries(part.geometry.attributes)) g.setAttribute(name, attr);
          if (part.geometry.index) g.setIndex(part.geometry.index);
          // the cell's bounds: every copy's position, widened by the part's reach at the copy's scale and by `pad`
          const box = new THREE.Box3();
          for (const c of group) box.expandByPoint(new THREE.Vector3(c.pose.x, c.pose.y, c.pose.z));
          const sphere = box.getBoundingSphere(new THREE.Sphere());
          sphere.radius += part.radius * Math.max(...group.map(c => c.scale)) + pad;
          g.boundingSphere = sphere;
          const mesh = new THREE.InstancedMesh(g, tint ? tintedOf(part.material) : part.material, group.length);
          mesh.castShadow = part.cast; mesh.receiveShadow = part.receive;
          mesh.frustumCulled = true;   // r128 turns it off for instanced meshes; the cell's own bounds make it right
          mesh.name = 'instanced:' + (part.material.name || part.material.type);
          return mesh;
        });
        group.forEach((c, index) => {
          copyMatrix(m, c.pose);
          meshes.forEach((mesh, p) => {
            mesh.setMatrixAt(index, out.multiplyMatrices(m, parts[p].matrix));
            if (tint) mesh.setColorAt(index, c.color || white);
          });
          c.slot = { meshes, index, parts };
        });
        for (const mesh of meshes) { mesh.instanceMatrix.needsUpdate = true; scene.add(mesh); batch.meshes.push(mesh); }
      }
    },
  };
  BATCHES.push(batch);
  return batch;
}

/**
 * A prop maker for instanced() out of a builder that adds to a scene, such
 * as street.js tree(scene, 0, 0, 'plane'): `fn(group)` builds into a fresh
 * group, and whatever it registered meanwhile (still() marks, G.crowd,
 * G.animated, G.lamps entries) is taken back, since the prop itself is never
 * shown -- only its instances are.
 */
export function fromBuilder(fn) {
  return () => {
    const g = new THREE.Group(), lists = [STILL, G.crowd, G.animated, G.lamps].filter(Array.isArray), lengths = lists.map(l => l.length);
    fn(g);
    lists.forEach((l, i) => { l.length = lengths[i]; });
    return g;
  };
}

/** Make every open batch's meshes into `scene` and close them (track.js, after the decor is spread); a generator that yields after each batch, for the pre-build's slices. */
export function* flushInstanced(scene) {
  while (BATCHES.length) { BATCHES.shift().flush(scene); yield; }
}

/** Forget the open batches without making them (track.js, when a build starts). */
export function resetInstanced() { BATCHES.length = 0; }

/** The batches still open (for tests). */
export const openBatches = () => BATCHES.length;
