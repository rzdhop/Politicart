// The kart's stage profile: its materials and the shapes it borrows from the
// design's character-select template (PLAN 3.4, DEC-043).
//
// kart.js builds both profiles of one kart; this module holds what only the
// stage profile needs, so the race path never imports a shape it does not
// draw. Two halves:
//
// - stagePalette(): every material the stage kart is drawn with, from
//   stagelook.js's own factory (never a primitives.mat() instance): clearcoat
//   car paint, chrome, gold, dark metal, a leather seat, tread rubber, lamps
//   that glow under the stage's tone mapping, decals. The palette answers the
//   same role names the race palette does (kart.js), so the tractor and the
//   cargo bike are built by one code path in both profiles.
// - the template's shapes, ported to r128 and fitted to the game kart (which
//   is about 1.45 times the template's): the bevelled extruded hull, capsule
//   side pods, the chrome tube bumper, lathed tyres with their tread, spoked
//   rims, rounded blades for spoilers and the tricolore wing, the steering
//   wheel and seat a stage-5 pilot drops into.
//
// Headless-safe like the rest of the engine: no DOM, every texture goes
// through primitives.canvasTexture or fabric.js, which are blank on the
// server, and the raycasts that seat decals on the hull are pure geometry.
import * as THREE from 'three';

import { fabric, roundel, surfaceSpec } from './fabric.js';
import { capsule } from './geo.js';
import { canvasTexture } from './primitives.js';
import { stageMat } from './stagelook.js';

// ---------- Detail per tier ----------

/** Segment counts of the stage shapes on "détaillés" and "légers" (PLAN 4.3). */
export const STAGE_DETAIL = Object.freeze({
  high: Object.freeze({ curve: 14, bevel: 5, tyre: 40, rim: 32, tube: 48, tubeR: 12, cap: 6, capR: 16, round: 16, blade: 4 }),
  low: Object.freeze({ curve: 6, bevel: 2, tyre: 20, rim: 14, tube: 20, tubeR: 6, cap: 3, capR: 8, round: 8, blade: 2 }),
});
const detail = tier => STAGE_DETAIL[tier === 'low' ? 'low' : 'high'];

/**
 * The stage shapes are cached by their parameters and shared by every stage
 * kart, like the race's material cache: a Garage edit rebuilds the kart, not
 * the hull. The merge (geo.js) copies them, so nothing a kart owns aliases
 * them but its wheels, which keep their tyre; disposing a kart's geometries
 * only frees GPU buffers that three uploads again on the next draw.
 */
const shapes = new Map();
const cached = (key, make) => { let g = shapes.get(key); if (!g) { g = make(); shapes.set(key, g); } return g; };

// ---------- Textures ----------

const textures = new Map();
/**
 * A canvas texture made once per key and kept, in sRGB (an authored canvas
 * is sRGB; r128 reads a texture as linear unless told). The race builds its
 * plate, stickers and skins afresh per kart; the stage caches them, because
 * the stage material cache is keyed by texture and never cleared, and a
 * fresh texture per Garage edit would grow it for nothing.
 */
export function stageTexture(key, make) {
  let t = textures.get(key);
  if (!t) { t = make(); t.encoding = THREE.sRGBEncoding; textures.set(key, t); }
  return t;
}

/** A soft round spot: white, alpha 1 at the centre to 0 at the rim (the underglow and the contact shadow). */
const softSpot = () => stageTexture('spot', () => canvasTexture(128, 128, (c, w) => {
  const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, w);
}));

// ---------- Materials ----------

/** The design's tricolore (the wing, the mast flag's stage colours): brighter than the game's sticker inks. */
export const TRICOLORE = Object.freeze([0x2f55c7, 0xfffaf0, 0xe63946]);

/**
 * The stage palette of one kart. `body` is the body material's spec extras
 * (a skin `map`, or none), `accent` the accent colour; `tier` the detail
 * tier ('high' | 'low'), `tex` the texture tier (fabric.textureTier).
 * Every method returns a stagelook material, cached by its spec, except
 * `glow` for the rainbow underglow, whose colour animates per kart.
 */
export function stagePalette({ body, skin = null, accent, tier = 'high', tex = 'high' }) {
  const M = spec => stageMat(spec, tier);
  const tread = fabric('tread', tex);
  const paint = c => M({ ...surfaceSpec('paint', c), name: 'kart-paint' });
  const solidCache = new Map();
  const P = {
    tier, tex,
    /** The body: clearcoat car paint, or the Garage skin painted under the same clearcoat. */
    body: skin ? M({ name: 'kart-skin', color: 0xffffff, map: skin, roughness: 0.34, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 }) : paint(body),
    accent: M({ name: 'kart-accent', color: accent, roughness: 0.32, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
    chrome: M(surfaceSpec('chrome')),
    gold: M(surfaceSpec('gold')),
    dark: M({ name: 'dark-metal', color: 0x1a1c24, roughness: 0.45, metalness: 0.7 }),
    steel: M({ name: 'steel', color: 0xa9adb5, roughness: 0.3, metalness: 0.85 }),
    leather: M({ name: 'seat-leather', color: 0x4a1e1a, roughness: 0.45, sheen: 0.4, sheenColor: 0x9a5a4a, clearcoat: 0.3 }),
    /** Polished alloy for rims: less metallic than chrome, so the key light still reads on a disc facing away from the room's panels. */
    goldAlloy: M({ name: 'rim-gold', color: 0xf2c14e, roughness: 0.22, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.05 }),
    alloy: M({ name: 'rim-alloy', color: 0xe4e8ee, roughness: 0.2, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.05 }),
    strap: M({ name: 'harness', color: 0xc8102e, roughness: 0.6, sheen: 0.5, sheenColor: 0xff8a8a }),
    /** Tyre rubber with the template's tread (its normal map on "détaillés"). */
    rubber: c => M({ name: 'tire-rubber', color: c, roughness: 0.9, ...tread, normalScale: 1.4 }),
    /** Any other part: a satin finish in its authored colour. */
    solid: (c, rough = 0.6) => {
      const k = c + ':' + rough;
      if (!solidCache.has(k)) solidCache.set(k, M({ name: 'kart-part', color: c, roughness: Math.min(rough, 0.7), metalness: 0.05, clearcoat: rough < 0.5 ? 0.5 : 0 }));
      return solidCache.get(k);
    },
    /** A lamp or a light that glows: black under the clearcoat, lit by its emissive colour. */
    lamp: (c, k = 1.6) => M({ name: 'lamp', color: 0x111111, emissive: c, emissiveIntensity: k, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
    /** An unlit glow (exhaust heat, sparks, rings): emissive only, no rim. */
    glowing: (c, k = 2, extra = {}) => M({ name: 'glow', color: 0x000000, emissive: c, emissiveIntensity: k, roughness: 1, metalness: 0, envMapIntensity: 0, rim: false, ...extra }),
    /** A printed decal on the paint: its map under a clearcoat. */
    decal: (map, transparent = false) => M({ name: 'decal', color: 0xffffff, map, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, transparent, alphaTest: transparent ? 0.02 : undefined, side: THREE.DoubleSide }),
    roundel: num => M({ name: 'number-plate', color: 0xffffff, map: roundel(num, body ?? 0x1f3a93, tex), roughness: 0.3, clearcoat: 1 }),
    /** The tricolore's three paints (blue, white, red), glossy like the template's wing. */
    tricolore: TRICOLORE.map(c => M({ name: 'tricolore', color: c, roughness: 0.3, clearcoat: 1 })),
    /** Flag cloth. */
    cloth: c => M({ name: 'flag', color: c, roughness: 0.65, sheen: 0.6, sheenColor: 0xffffff, side: THREE.DoubleSide }),
    /** The soft contact shadow under the kart. */
    shadow: opacity => M({ name: 'kart-shadow', color: 0x000000, map: softSpot(), roughness: 1, metalness: 0, envMapIntensity: 0, rim: false, transparent: true, opacity, depthWrite: false }),
    /** The underglow: a soft spot of light; `live` (the rainbow) gets the kart's own copy, since its colour cycles. */
    glow: (c, live) => {
      const m = M({ name: 'underglow', color: 0x000000, emissive: c, emissiveIntensity: 1.8, map: softSpot(), roughness: 1, metalness: 0, envMapIntensity: 0, rim: false, transparent: true, opacity: 0.85, depthWrite: false });
      if (!live) return m;
      const own = m.clone(); own.userData = { stage: m.userData.stage, key: null, own: true };   // r128 clone keeps no onBeforeCompile; this one has no rim to inject
      return own;
    },
  };
  return P;
}

// ---------- The hull ----------

/**
 * The template's body profile (characters.js buildKart), in template units:
 * x along the kart (nose +), y up. Nose tip, hood, cowl, cockpit lip, the
 * cockpit floor the seat stands on, the rear deck.
 */
function hullShape() {
  const s = new THREE.Shape();
  s.moveTo(-1.0, 0.16); s.lineTo(0.9, 0.16); s.quadraticCurveTo(1.22, 0.16, 1.2, 0.32); s.quadraticCurveTo(1.15, 0.46, 0.85, 0.5);
  s.lineTo(0.42, 0.56); s.quadraticCurveTo(0.3, 0.58, 0.22, 0.44); s.lineTo(-0.62, 0.44); s.quadraticCurveTo(-0.75, 0.44, -0.82, 0.6);
  s.lineTo(-0.98, 0.62); s.quadraticCurveTo(-1.1, 0.6, -1.1, 0.42); s.quadraticCurveTo(-1.1, 0.16, -1.0, 0.16);
  return s;
}

/** Where the template's hull lands on the game kart: along z ×1.45 + 0.25, up ×1.3 + 0.08; 1.6 wide like the race body. */
export const HULL_FIT = Object.freeze({ z: [1.45, 0.25], y: [1.3, 0.08], width: 1.6 });

/**
 * Box-projected uvs, laid out face by face exactly as a BoxGeometry of the
 * hull's bounds lays them, so a Garage skin painted for the race body (u
 * across the kart, v along it on the top; along and up on the flanks) reads
 * the same on the hull: the stripes run nose to tail, the flames lick up the
 * flanks and back from the nose.
 */
function boxUVs(g) {
  g.computeBoundingBox();
  const b = g.boundingBox, W = b.max.x - b.min.x, H = b.max.y - b.min.y, D = b.max.z - b.min.z;
  const pos = g.attributes.position, nor = g.attributes.normal, uv = new Float32Array(pos.count * 2);
  const fx = x => (x - b.min.x) / W, fy = y => (y - b.min.y) / H, fz = z => (z - b.min.z) / D;
  for (let i = 0; i < pos.count; i += 3) {
    // one face direction per triangle (the extrude is non-indexed), from the face's mean normal
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 3; k++) { nx += nor.getX(i + k); ny += nor.getY(i + k); nz += nor.getZ(i + k); }
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    for (let k = i; k < i + 3; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      let u, v;
      if (ay >= ax && ay >= az) { u = fx(x); v = ny > 0 ? 1 - fz(z) : fz(z); }          // top / bottom
      else if (ax >= az) { u = nx > 0 ? 1 - fz(z) : fz(z); v = fy(y); }                  // flanks
      else { u = nz > 0 ? fx(x) : 1 - fx(x); v = fy(y); }                                // nose / tail
      uv[k * 2] = u; uv[k * 2 + 1] = v;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * Smooth the normals of a non-indexed geometry (an extrude) across its
 * curves but not its creases: each corner takes the mean of the face
 * normals at its position that lie within `crease` radians of its own face.
 * r128's computeVertexNormals on a non-indexed geometry leaves every face
 * flat, which shows facets on a clearcoat. (three's mergeVertices lives in
 * examples/jsm, which the game does not use: owner answer Q7.)
 */
export function smoothNormals(g, crease = 0.7) {
  const pos = g.attributes.position, n = pos.count, face = new Float32Array(n), cos = Math.cos(crease);
  const fn = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const f = new THREE.Vector3().subVectors(c, b).cross(a.clone().sub(b)), area = f.length();
    fn.push(area > 1e-12 ? f.divideScalar(area) : f.set(0, 0, 0), area);
  }
  const key = i => Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4);
  const at = new Map();
  for (let i = 0; i < n; i++) { const k = key(i); if (!at.has(k)) at.set(k, []); at.get(k).push(i); face[i] = (i / 3) | 0; }
  const out = new Float32Array(n * 3), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const own = fn[face[i] * 2]; s.set(0, 0, 0);
    for (const j of at.get(key(i))) { const o = fn[face[j] * 2]; if (o.dot(own) >= cos) s.addScaledVector(o, fn[face[j] * 2 + 1]); }
    if (s.lengthSq() === 0) s.copy(own);
    s.normalize(); out[i * 3] = s.x; out[i * 3 + 1] = s.y; out[i * 3 + 2] = s.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

/**
 * The bevelled extruded hull of the standard kart: the template's profile
 * fitted to the game kart (HULL_FIT), with box-projected uvs for the skins.
 * About 3.4k triangles on "détaillés", 0.7k on "légers".
 */
export function hullGeometry(tier = 'high') {
  return cached('hull:' + tier, () => makeHull(tier));
}
function makeHull(tier) {
  const d = detail(tier), [sz, oz] = HULL_FIT.z, [sy, oy] = HULL_FIT.y;
  const bs = 0.1, bt = 0.12;                                     // the template's bevel, before the fit
  const depth = HULL_FIT.width / (sz * 0.92) - 2 * bt;          // width after the x scale below: (depth + 2 bt) × sz × 0.92 = 1.6
  const g = new THREE.ExtrudeGeometry(hullShape(), { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: d.bevel, curveSegments: d.curve });
  g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2);   // template x (along the kart) to world z, extrusion to x
  g.scale(sz * 0.92, sy, sz); g.translate(0, oy, oz);
  smoothNormals(g);
  boxUVs(g);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/**
 * A box with rounded edges (radius `r`, at most a quarter of its smallest
 * side), box-projected uvs: the race's boxes on the stage, same silhouette,
 * edges that catch the light. Cached per size, since karts share them.
 */
export function roundedBoxGeometry(w, h, d, tier = 'high', r = 0.06) {
  const t = detail(tier), rr = Math.min(r, w / 4, h / 4, d / 4);
  return cached(['box', w, h, d, rr, t.blade].join(':'), () => makeRoundedBox(w, h, d, rr, t));
}
function makeRoundedBox(w, h, d, rr, t) {
  // the bevel offsets each outline point along its normal, so a corner rounded by a hair grows into a quarter circle of radius rr
  const s = new THREE.Shape(), hw = w / 2 - rr, hh = h / 2 - rr, e = 1e-3;
  s.moveTo(-hw + e, -hh); s.lineTo(hw - e, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + e); s.lineTo(hw, hh - e); s.quadraticCurveTo(hw, hh, hw - e, hh);
  s.lineTo(-hw + e, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - e); s.lineTo(-hw, -hh + e); s.quadraticCurveTo(-hw, -hh, -hw + e, -hh);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * rr), bevelEnabled: true, bevelThickness: rr, bevelSize: rr, bevelSegments: Math.max(1, t.blade - 1), curveSegments: Math.max(2, t.blade - 1) });
  g.translate(0, 0, -(d - 2 * rr) / 2);
  smoothNormals(g);
  boxUVs(g);
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.parameters = { width: w, height: h, depth: d, radius: rr };
  return g;
}

const ray = new THREE.Raycaster(), rayDir = new THREE.Vector3(), rayFrom = new THREE.Vector3();
/**
 * Where a ray from `from` along `dir` first meets `mesh` (in the mesh's
 * parent space, the mesh being untransformed): { point, normal } or null.
 * Decals, lamps and the plate are seated on the hull this way, so they
 * follow its curves.
 */
export function surfaceHit(mesh, from, dir) {
  mesh.updateMatrixWorld(true);
  ray.set(rayFrom.fromArray(from), rayDir.fromArray(dir).normalize());
  const hit = ray.intersectObject(mesh, false)[0];
  if (!hit) return null;
  const n = hit.face.normal.clone();
  return { point: hit.point.clone(), normal: n };
}

const bx = new THREE.Vector3(), by = new THREE.Vector3(), bm = new THREE.Matrix4();
/**
 * Lay a flat object (a plane facing +z) on a surface hit, `lift` along the
 * normal: its +z on the normal, its +y as near `up` as the surface allows.
 */
export function seat(obj, hit, lift = 0.012, up = [0, 1, 0]) {
  const n = hit.normal;
  by.fromArray(up); by.addScaledVector(n, -by.dot(n)).normalize();
  bx.crossVectors(by, n);
  obj.quaternion.setFromRotationMatrix(bm.makeBasis(bx, by, n));
  obj.position.copy(hit.point).addScaledVector(n, lift);
  return obj;
}

// ---------- Parts ----------

/** A capsule mesh lying along z (side pods, bumpers turned with `axis`), `len` long overall. */
export function capsuleMesh(r, len, material, tier, axis = 'z') {
  const d = detail(tier);
  const m = new THREE.Mesh(cached(['capsule', r, len, tier].join(':'), () => capsule(r, Math.max(0, len - 2 * r), d.cap, d.capR, 1)), material);
  if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2;
  return m;
}

/** A capsule between two points (struts, the steering column), radius r. */
export function strut(a, b, r, material, tier) {
  const A = new THREE.Vector3().fromArray(a), B = new THREE.Vector3().fromArray(b), dir = B.clone().sub(A), len = dir.length();
  const d = detail(tier);
  const m = new THREE.Mesh(capsule(r, len, Math.max(2, d.cap - 2), Math.max(6, d.capR / 2), 1), material);
  m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** The template's chrome tube bumper, as wide as the race bumper and inside the Langue de bois ring (r 2.3). */
export function tubeBumper(material, tier) {
  const d = detail(tier);
  const curve = new THREE.CatmullRomCurve3([[-1.02, 0.34, 1.72], [-0.62, 0.32, 2.12], [0.62, 0.32, 2.12], [1.02, 0.34, 1.72]].map(p => new THREE.Vector3(...p)));
  return new THREE.Mesh(cached('bumper:' + tier, () => new THREE.TubeGeometry(curve, d.tube, 0.06, d.tubeR, false)), material);
}

/**
 * A rounded blade: a rounded-rectangle section (chord along z, thickness
 * along y) extruded across x, its ends bevelled. Spoiler blades, the wing's
 * three tricolore panels and end plates (turned upright).
 */
export function blade(width, thick, chord, material, tier) {
  return new THREE.Mesh(cached(['blade', width, thick, chord, tier].join(':'), () => bladeGeometry(width, thick, chord, tier)), material);
}
function bladeGeometry(width, thick, chord, tier) {
  const d = detail(tier), r = Math.min(thick, chord) * 0.48, hw = chord / 2 - r, hh = thick / 2 - r;
  const s = new THREE.Shape();
  s.moveTo(-hw, -thick / 2); s.lineTo(hw, -thick / 2); s.quadraticCurveTo(chord / 2, -thick / 2, chord / 2, -hh);
  s.lineTo(chord / 2, hh); s.quadraticCurveTo(chord / 2, thick / 2, hw, thick / 2); s.lineTo(-hw, thick / 2);
  s.quadraticCurveTo(-chord / 2, thick / 2, -chord / 2, hh); s.lineTo(-chord / 2, -hh); s.quadraticCurveTo(-chord / 2, -thick / 2, -hw, -thick / 2);
  const e = Math.min(0.02, width * 0.1);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, width - 2 * e), bevelEnabled: true, bevelThickness: e, bevelSize: e * 0.6, bevelSegments: d.blade, curveSegments: d.blade });
  g.translate(0, 0, -(width - 2 * e) / 2); g.rotateY(Math.PI / 2);   // section in the z-y plane, extruded along x
  smoothNormals(g); boxUVs(g);   // a skin maps on a blade as on the race's box
  return g;
}

// ---------- Wheels ----------

/**
 * A lathed tyre of radius r and width w, axle along x: rounded shoulders
 * over a slightly crowned tread. The tread texture maps on the crown alone
 * (22 chevron blocks around, fewer and chunkier with `chunky`); the
 * sidewalls sample one flat spot of it, so they read as smooth rubber
 * without a second material.
 */
export function tyreGeometry(r, w, tier, chunky = false) {
  return cached(['tyre', r, w, tier, chunky].join(':'), () => makeTyre(r, w, tier, chunky));
}
function makeTyre(r, w, tier, chunky) {
  const d = detail(tier), h = w / 2;
  const prof = [[0.6, -h * 0.9], [0.8, -h], [0.93, -h * 0.94], [0.99, -h * 0.72], [1.0, -h * 0.3], [1.0, h * 0.3], [0.99, h * 0.72], [0.93, h * 0.94], [0.8, h], [0.6, h * 0.9]];
  const crown = [3, 6];
  const g = new THREE.LatheGeometry(prof.map(([k, y]) => new THREE.Vector2(r * k, y)), d.tyre);
  const uv = g.attributes.uv, np = prof.length, around = chunky ? 0.6 : 1;
  for (let i = 0; i <= d.tyre; i++) for (let j = 0; j < np; j++) {
    const k = i * np + j;
    if (j >= crown[0] && j <= crown[1]) uv.setXY(k, (i / d.tyre) * around, (j - crown[0]) / (crown[1] - crown[0]));
    else uv.setXY(k, 0.25 / 22, 0.5);   // inside one tread block: flat rubber
  }
  g.rotateZ(Math.PI / 2);
  return g;
}

/**
 * The rim of one wheel style, as children of the tyre (axle along x, the
 * outer face towards `side` = ±1): `P` the stage palette. 'chrome' is the
 * template's spoked chrome rim (a chrome disc, five dark spokes crossing
 * it, a gold hub); 'gold' the same in gold with a chrome cap; 'offroad' a
 * bronze beadlock with bolts; 'classic' a pressed steel rim.
 */
export function rimParts(kind, r, w, side, P, tier) {
  const d = detail(tier), out = [], ax = new THREE.Vector3(1, 0, 0);
  const disc = (rad, width, mat, x = 0, seg = d.rim) => { const g = new THREE.CylinderGeometry(rad, rad, width, seg); g.rotateZ(Math.PI / 2); const m = new THREE.Mesh(g, mat); m.position.x = x; out.push(m); return m; };
  const spokes = (n, len, mat, x) => { for (let i = 0; i < n; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.022, len, 0.07), mat); s.position.x = x; s.setRotationFromAxisAngle(ax, i / n * Math.PI); out.push(s); } };
  const face = side * w * 0.47;
  if (kind === 'chrome') {
    disc(r * 0.66, w * 0.92, P.alloy);
    spokes(5, r * 1.22, P.dark, face);
    disc(r * 0.2, w * 1.0, P.gold, 0, Math.max(8, d.rim / 2));
  } else if (kind === 'gold') {
    disc(r * 0.66, w * 0.92, P.goldAlloy);
    disc(r * 0.5, 0.02, P.dark, face);
    spokes(5, r * 1.0, P.goldAlloy, face + side * 0.012);
    disc(r * 0.16, w * 1.0, P.chrome, 0, Math.max(8, d.rim / 2));
  } else if (kind === 'offroad') {
    disc(r * 0.58, w * 0.9, P.solid(0x6b5a3a, 0.45));
    disc(r * 0.24, w * 0.98, P.dark, 0, Math.max(8, d.rim / 2));
    const n = tier === 'low' ? 0 : 8;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6), P.steel); b.rotation.z = Math.PI / 2; b.position.set(face, Math.sin(a) * r * 0.48, Math.cos(a) * r * 0.48); out.push(b); }
  } else {
    disc(r * 0.6, w * 0.9, P.alloy);
    disc(r * 0.42, 0.02, P.steel, face);
    disc(r * 0.18, w * 0.98, P.chrome, 0, Math.max(8, d.rim / 2));
  }
  return out;
}
