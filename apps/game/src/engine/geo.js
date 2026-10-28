// Geometry helpers for the 3D select stage and the new pilots (PLAN 5.1).
//
// Three things three r128 does not give us without `examples/jsm`, which the
// game does not use (owner answer Q7):
//
// - capsule(): r128 has no CapsuleGeometry (it arrived in r139). This is the
//   construction three settled on later (r17x+, the one the design's r184
//   template runs on): one row per cap segment, `heightSegments` rows for the
//   cylinder, so a template call `CapsuleGeometry(r, len, 12, 32)` costs the
//   same triangles here as there: 2 * radial * (2 * cap + height).
// - mergeByMaterial(): one mesh per material for a built pilot or kart, so a
//   ~100-mesh caricature costs ~20 draws on the stage and 2 or 3 in a race
//   (DEC-044). Groups that animate (the head, the hand prop, the wheels) are
//   kept as separate objects and merged inside themselves.
// - bakeVertexColours(): folds each mesh's material colour into a vertex
//   colour so a whole pilot can share one material (race-low, then merged).
//
// All three are pure geometry work: no DOM, no renderer, so they run headless
// on the game server and in Node tests like the rest of the engine.
import * as THREE from 'three';

/** Triangles a capsule() with these segments has: 2 * radial * (2 * cap + height). */
export const capsuleTriangles = (capSegments = 4, radialSegments = 8, heightSegments = 1) =>
  2 * Math.max(3, Math.floor(radialSegments)) * (2 * Math.max(1, Math.floor(capSegments)) + Math.max(1, Math.floor(heightSegments)));

/**
 * A capsule along +Y: a cylinder of `length` capped by two hemispheres of
 * `radius`, total height length + 2 * radius. Same parameters, vertex order,
 * normals and uvs as three's later CapsuleGeometry (rows from the bottom pole
 * up, `radialSegments + 1` vertices per row with a seam column, uv.v by arc
 * length so a fabric map does not stretch on the caps).
 */
export function capsule(radius = 1, length = 1, capSegments = 4, radialSegments = 8, heightSegments = 1) {
  const g = new THREE.BufferGeometry();
  g.type = 'CapsuleGeometry';
  g.parameters = { radius, height: length, capSegments, radialSegments, heightSegments };
  const h = Math.max(0, length), caps = Math.max(1, Math.floor(capSegments)), rad = Math.max(3, Math.floor(radialSegments)), hs = Math.max(1, Math.floor(heightSegments));
  const half = h / 2, capArc = Math.PI / 2 * radius, total = 2 * capArc + h, rows = 2 * caps + hs, perRow = rad + 1;
  const pos = [], nrm = [], uv = [], idx = [], n = new THREE.Vector3();
  for (let iy = 0; iy <= rows; iy++) {
    let y, r, ny, arc;
    if (iy <= caps) { const a = iy / caps * Math.PI / 2; y = -half - radius * Math.cos(a); r = radius * Math.sin(a); ny = -radius * Math.cos(a); arc = iy / caps * capArc; } // bottom cap
    else if (iy <= caps + hs) { const p = (iy - caps) / hs; y = -half + p * h; r = radius; ny = 0; arc = capArc + p * h; } // cylinder
    else { const a = (iy - caps - hs) / caps * Math.PI / 2; y = half + radius * Math.sin(a); r = radius * Math.cos(a); ny = radius * Math.sin(a); arc = capArc + h + (iy - caps - hs) / caps * capArc; } // top cap
    const v = total > 0 ? Math.min(1, Math.max(0, arc / total)) : 0;
    const du = iy === 0 ? 0.5 / rad : iy === rows ? -0.5 / rad : 0; // the poles' uvs sit mid-quad, as three does
    for (let ix = 0; ix <= rad; ix++) {
      const u = ix / rad, t = u * Math.PI * 2, x = -r * Math.cos(t), z = r * Math.sin(t);
      pos.push(x, y, z);
      n.set(x, ny, z).normalize(); nrm.push(n.x, n.y, n.z);
      uv.push(u + du, v);
    }
    if (iy > 0) for (let ix = 0; ix < rad; ix++) {
      const a = (iy - 1) * perRow + ix, b = a + 1, c = iy * perRow + ix, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Triangles one geometry draws, honouring its draw range (what renderer.info would count). */
export function geometryTriangles(g) {
  const n = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
  const start = Math.max(0, g.drawRange.start), end = Math.min(n, g.drawRange.start + g.drawRange.count);
  return Math.max(0, Math.floor((end - start) / 3));
}

/** Triangles under an object (meshes only, InstancedMesh counted per instance); `visibleOnly` skips hidden subtrees. */
export function countTriangles(obj, visibleOnly = false) {
  let t = 0;
  const walk = o => {
    if (visibleOnly && !o.visible) return;
    if (o.isMesh && o.geometry) t += geometryTriangles(o.geometry) * (o.isInstancedMesh ? o.count : 1);
    for (const c of o.children) walk(c);
  };
  walk(obj);
  return t;
}

/** Meshes under an object (handy for draw-call budgets: one mesh, one draw per pass). */
export function countMeshes(obj, visibleOnly = false) {
  let n = 0;
  const walk = o => { if (visibleOnly && !o.visible) return; if (o.isMesh) n++; for (const c of o.children) walk(c); };
  walk(obj);
  return n;
}

/** keep may be a name, an object, a predicate, or a list of any of them; normalise it to one predicate. */
function keeper(keep) {
  if (typeof keep === 'function') return keep;
  const list = keep == null ? [] : Array.isArray(keep) || keep instanceof Set ? [...keep] : [keep];
  const names = new Set(list.filter(k => typeof k === 'string')), objs = new Set(list.filter(k => k && typeof k === 'object'));
  const tests = list.filter(k => typeof k === 'function');
  return o => objs.has(o) || (o.name !== '' && names.has(o.name)) || tests.some(t => t(o));
}

/** A mesh the merge can fold: one material, plain Mesh, no morphs or skin, a position attribute. */
const mergeable = o => o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && o.material
  && o.geometry && o.geometry.isBufferGeometry && o.geometry.attributes.position && Object.keys(o.geometry.morphAttributes).length === 0;

/** Read one component the way the shader sees it (r128's getX does not undo `normalized`). */
function reader(attr) {
  if (!attr.normalized) return (i, c) => getComp(attr, i, c);
  const a = attr.isInterleavedBufferAttribute ? attr.data.array : attr.array;
  const max = a instanceof Int8Array ? 127 : a instanceof Uint8Array || a instanceof Uint8ClampedArray ? 255 : a instanceof Int16Array ? 32767 : a instanceof Uint16Array ? 65535 : a instanceof Int32Array ? 2147483647 : a instanceof Uint32Array ? 4294967295 : 1;
  return (i, c) => Math.max(-1, getComp(attr, i, c) / max);
}
function getComp(attr, i, c) {
  return c === 0 ? attr.getX(i) : c === 1 ? attr.getY(i) : c === 2 ? attr.getZ(i) : attr.getW(i);
}
/** What a part lacking an attribute the others have gets: white for colours, a +X tangent, zero otherwise. */
const fillOf = (name, c) => (name === 'color' ? 1 : name === 'tangent' ? (c === 0 || c === 3 ? 1 : 0) : 0);

/**
 * Merge a list of meshes, all drawn with the same material, into one
 * geometry in the frame of `inv` (the inverse of the merge root's world
 * matrix). Every triangle is kept, degenerate ones included, so the count
 * renderer.info reports is unchanged; mirrored parts (negative determinant)
 * get their winding reversed so their front faces stay front.
 */
function mergeGeometries(meshes, inv) {
  // the attribute set: the union of the parts', with consistent item sizes
  const sizes = new Map();
  for (const m of meshes) for (const [name, a] of Object.entries(m.geometry.attributes)) {
    if (sizes.has(name) && sizes.get(name) !== a.itemSize) throw new Error('mergeByMaterial: attribute ' + name + ' has item size ' + a.itemSize + ' and ' + sizes.get(name));
    sizes.set(name, a.itemSize);
  }
  let verts = 0, tris = 0;
  for (const m of meshes) { verts += m.geometry.attributes.position.count; tris += geometryTriangles(m.geometry); }
  const out = new THREE.BufferGeometry(), arrays = {};
  for (const [name, size] of sizes) arrays[name] = new Float32Array(verts * size);
  const index = verts > 65535 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);
  const mat = new THREE.Matrix4(), nmat = new THREE.Matrix3(), v = new THREE.Vector3();
  let vo = 0, io = 0;
  for (const m of meshes) {
    let g = m.geometry;
    if (!g.attributes.normal && sizes.has('normal')) { g = g.clone(); g.computeVertexNormals(); }
    mat.multiplyMatrices(inv, m.matrixWorld); nmat.getNormalMatrix(mat);
    const flip = mat.determinant() < 0, count = g.attributes.position.count;
    for (const [name, size] of sizes) {
      const a = g.attributes[name], dst = arrays[name];
      if (!a) { for (let i = 0; i < count; i++) for (let c = 0; c < size; c++) dst[(vo + i) * size + c] = fillOf(name, c); continue; }
      const rd = reader(a);
      for (let i = 0; i < count; i++) {
        const o = (vo + i) * size;
        if (name === 'position') { v.set(rd(i, 0), rd(i, 1), rd(i, 2)).applyMatrix4(mat); dst[o] = v.x; dst[o + 1] = v.y; dst[o + 2] = v.z; }
        else if (name === 'normal') { v.set(rd(i, 0), rd(i, 1), rd(i, 2)).applyMatrix3(nmat).normalize(); dst[o] = v.x; dst[o + 1] = v.y; dst[o + 2] = v.z; }
        else if (name === 'tangent') { v.set(rd(i, 0), rd(i, 1), rd(i, 2)).transformDirection(mat); dst[o] = v.x; dst[o + 1] = v.y; dst[o + 2] = v.z; if (size > 3) dst[o + 3] = rd(i, 3) * (flip ? -1 : 1); }
        else for (let c = 0; c < size; c++) dst[o + c] = rd(i, c);
      }
    }
    // the triangles the part draws: its index (or 0..n) inside its draw range
    const n = g.index ? g.index.count : count, start = Math.max(0, g.drawRange.start), end = Math.min(n, g.drawRange.start + g.drawRange.count);
    const at = g.index ? k => g.index.getX(k) : k => k;
    for (let k = start; k + 2 < end; k += 3) {
      const a = at(k), b = at(k + 1), c = at(k + 2);
      index[io++] = vo + a; index[io++] = vo + (flip ? c : b); index[io++] = vo + (flip ? b : c);
    }
    vo += count;
  }
  for (const [name, size] of sizes) out.setAttribute(name, new THREE.BufferAttribute(arrays[name], size));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}

/** Re-express `o`'s transform relative to `root` (whose world matrix inverse is `inv`) and hang it on root. */
function reparent(o, root, inv) {
  const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
  rel.decompose(o.position, o.quaternion, o.scale);
  root.add(o);
}

/**
 * Merge every mesh under `root` into one mesh per material (and shadow
 * flags), in place, and return `root`.
 *
 * - `keep` (names, objects, or a predicate) marks objects that must stay
 *   separate because they move on their own: the head, a hand prop, wheels,
 *   an exhaust glow that flickers. Each kept object is lifted out with its
 *   transform re-expressed relative to its nearest kept ancestor (or root),
 *   so animating it still works, and its own subtree is merged the same way.
 *   Anything that points at a merged-away intermediate group (a userData
 *   reference) must be listed in `keep`.
 * - Hidden subtrees, lights, cameras, sprites, lines, points, instanced and
 *   skinned meshes, morph-target meshes and multi-material meshes are kept
 *   as they are (lifted out the same way), so the merge never changes what
 *   is drawn: the triangle count and the set of materials are preserved.
 * - Parts lacking an attribute the others have are filled (white colours,
 *   zero uvs, computed normals). Source geometries are not disposed: they
 *   may be shared by other pilots.
 */
export function mergeByMaterial(root, keep = []) {
  const isKept = keeper(keep);
  root.updateMatrixWorld(true);
  mergeInto(root, isKept);
  return root;
}

function mergeInto(root, isKept) {
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), lifted = [], recurse = [];
  const walk = o => {
    for (const c of o.children) {
      if (isKept(c)) { lifted.push(c); recurse.push(c); continue; }
      if (!c.visible || (!c.isMesh && !c.isGroup && c.type !== 'Object3D') || (c.isMesh && !mergeable(c))) { lifted.push(c); continue; }
      if (c.isMesh) {
        const key = c.material.uuid + '|' + c.castShadow + '|' + c.receiveShadow + '|' + c.renderOrder;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(c);
      }
      walk(c);
    }
  };
  walk(root);
  for (const c of [...root.children]) root.remove(c);
  for (const meshes of buckets.values()) {
    const first = meshes[0];
    const m = new THREE.Mesh(mergeGeometries(meshes, inv), first.material);
    m.name = first.material.name || 'merged';
    m.castShadow = first.castShadow; m.receiveShadow = first.receiveShadow; m.renderOrder = first.renderOrder;
    m.userData.merged = meshes.length;
    root.add(m);
  }
  for (const o of lifted) { if (o.parent) o.parent.remove(o); reparent(o, root, inv); }
  root.updateMatrixWorld(true);
  for (const o of recurse) mergeInto(o, isKept);
}

/**
 * Give every mesh under `root` a vertex colour equal to its material's colour
 * (times its own vertex colours, if it had any) and draw it with `material`,
 * one shared vertex-coloured material, so mergeByMaterial() then folds the
 * whole subtree into one draw. Returns `root`.
 *
 * Skipped, by default: meshes whose material carries a map (the jacket
 * fabric keeps its own material on race-high; pass `keepMapped: false` to
 * bake them too), unlit MeshBasicMaterials (glows: baking them into a lit
 * material would darken them), transparent materials, multi-material meshes,
 * and anything `skip` (names, objects or a predicate) matches. Geometries
 * are cloned before a colour is added, since they may be shared.
 */
export function bakeVertexColours(root, material, { skip = [], keepMapped = true } = {}) {
  if (!material || !material.vertexColors) throw new Error('bakeVertexColours: the target material must have vertexColors');
  const isSkipped = keeper(skip), col = new THREE.Color();
  const walk = o => {
    if (isSkipped(o)) return;
    if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material) && o.material && o.material !== material) {
      const m = o.material;
      const bake = m.color && !m.isMeshBasicMaterial && !m.transparent && !(keepMapped && m.map) && o.geometry.attributes.position;
      if (bake) {
        const g = o.geometry.clone(), n = g.attributes.position.count, out = new Float32Array(n * 3), had = m.vertexColors && g.attributes.color;
        col.copy(m.color);
        for (let i = 0; i < n; i++) {
          out[i * 3] = col.r * (had ? had.getX(i) : 1); out[i * 3 + 1] = col.g * (had ? had.getY(i) : 1); out[i * 3 + 2] = col.b * (had ? had.getZ(i) : 1);
        }
        g.setAttribute('color', new THREE.BufferAttribute(out, 3));
        o.geometry = g; o.material = material;
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return root;
}
