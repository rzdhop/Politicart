// Marseille's Vieux-Port, the pieces only it has (stage 7): the moored fleet
// that rolls at its pontoons, the sardine stalls, the mooring posts and
// their gulls, the boules, and three landmarks built in world units -- the
// Ombrière's mirror canopy on the quai, the MuCEM's dark lattice cube with
// its footbridge to the fort, the striped cathedral of La Major.
//
// The landmarks are each one merged mesh (geo.js, vertex colours on the
// shared finishes), named 'marseille:<name>' for the tests. The fleet, the
// stalls, the posts and the boules are instanced batches (decor/life.js).
import * as THREE from 'three';

import { bakeVertexColours, finishOf, mergeByMaterial } from '../geo.js';
import { box, cone, cyl, plane, sph, textPlane } from '../primitives.js';
import { G, getPoly } from '../state.js';
import { pick, rand } from '../util.js';
import { yAt } from './context.js';
import { batch, moving, perBuild, place } from './life.js';
import { crowd } from './crowd.js';

/** Bake a built group to vertex colours, merge it by material and name it: a landmark in one or two draws. */
export function landmark(g, name) { bakeVertexColours(g, finishOf); mergeByMaterial(g); g.name = name; return g; }

// ---------- The fleet ----------
const HULLS = [0xc8102e, 0x1f3a93, 0xf6f1e4, 0x2e8b57, 0xe0a030, 0x2a7fd4, 0xffffff, 0x8a2b2b];
const fleet = () => perBuild('marseille:fleet', () => {
  const hull = batch(() => { const g = new THREE.Group(); g.add(box(7, 1.2, 2.6, 0xffffff, 0, 0.6, 0)); g.add(cone(0.9, 1.2, 0xffffff, 3.9, 0.7, 0, 4).rotateZ(-Math.PI / 2)); return g; }, { tint: true });
  const sail = batch(() => { const g = new THREE.Group(); g.add(box(6.6, 0.2, 2.3, 0xf6f1e4, 0, 1.25, 0)); g.add(box(2.2, 1.1, 1.8, 0xffffff, -1.4, 1.9, 0)); g.add(cyl(0.06, 0.09, 7.5, 0xdddddd, 1.0, 4.8, 0, 6)); g.add(box(2.4, 4.2, 0.06, 0xfffaf0, -0.3, 5.0, 0)); return g; });
  // the pointu, Marseille's fishing boat: a striped gunwale, a little wheelhouse, a short mast
  const pointu = batch(() => { const g = new THREE.Group(); g.add(box(6.6, 0.2, 2.3, 0x8b5a2b, 0, 1.25, 0)); g.add(box(7.1, 0.18, 2.66, 0xf6f1e4, 0, 1.05, 0)); g.add(box(1.4, 1.0, 1.3, 0x2a7fd4, 0.6, 1.85, 0)); g.add(cyl(0.05, 0.07, 3, 0x8b5a2b, -1.8, 2.7, 0, 5)); return g; });
  const set = { hull, sail, pointu, boats: [] };
  let clock = 0, turn = 0;
  G.animated.push(dt => {
    if (!moving()) return;
    clock += dt; turn ^= 1;
    for (let i = turn; i < set.boats.length; i += 2) { const b = set.boats[i], pose = { y: b.y + Math.sin(clock * 1.3 + i) * 0.18, tiltX: Math.sin(clock * 0.9 + i * 1.7) * 0.03, tiltZ: Math.cos(clock * 1.1 + i) * 0.05 }; b.hull.move(b.i, pose); b.top.move(b.j, pose); }
  });
  return set;
});
/** A boat moored at (x, z), scale-1 decor coordinates, its bow at local +x turned `rotY`: a sailing boat or a pointu, rolling on the swell. */
export function mooredBoat(x, z, rotY, kind = Math.random() < 0.45 ? 'pointu' : 'sail') {
  const set = fleet(), p = place(x, z), scale = kind === 'pointu' ? rand(0.7, 0.85) : rand(0.9, 1.1), top = kind === 'pointu' ? set.pointu : set.sail;
  const pose = { y: p.y, rotY: rotY + rand(-0.08, 0.08), scale };
  set.boats.push({ hull: set.hull, top, i: set.hull.add(p.x, p.z, { ...pose, color: pick(HULLS) }), j: top.add(p.x, p.z, pose), y: p.y });
}

// ---------- The quai's furniture ----------
const stallBatch = () => perBuild('marseille:stall', () => batch(() => {
  const g = new THREE.Group(); g.add(box(3, 0.1, 1.4, 0x8b5a2b, 0, 0.9, 0)); [-1.3, 1.3].forEach(px => g.add(box(0.1, 0.9, 1.2, 0x8b5a2b, px, 0.45, 0))); g.add(box(2.8, 0.25, 1.2, 0xeaf6ff, 0, 1.07, 0));
  for (let i = 0; i < 6; i++) { const f = sph(0.16, 0xb0bcc8, -1.1 + i * 0.44, 1.22, (i % 2 ? 0.25 : -0.2), 5); f.scale.set(1, 0.45, 2.4); g.add(f); }
  g.add(cyl(0.04, 0.04, 2.6, 0x555555, 0, 1.3, -0.6, 5)); g.add(cone(2.4, 0.8, 0x2a7fd4, 0, 2.95, -0.6, 4)); const sg = textPlane(2.6, 0.6, 'SARDINES', '#1f3a93', '#fff', 64); sg.position.set(0, 2.2, 0.75); g.add(sg);
  return g;
}));
/** A sardine stall on the quai, its fishmonger behind it calling out, scale-1 coordinates, facing local +z. */
export function sardineStall(scene, x, z, rotY) {
  const p = place(x, z); stallBatch().add(p.x, p.z, { y: p.y, rotY });
  crowd(scene, p.x - Math.sin(rotY) * 1.3, p.z - Math.cos(rotY) * 1.3, { world: true, y: p.y, rotY, kind: pick(['plain', 'coat', 'beret']), jacket: 0x3b4a6b, amp: 0.08 });
}
/** A mooring post (a bitte) on the quai's edge, scale-1 coordinates; returns where a gull would sit on it, in world units. */
export function mooringPost(x, z) {
  const p = place(x, z); perBuild('marseille:post', () => batch(() => { const g = new THREE.Group(); g.add(cyl(0.22, 0.28, 0.7, 0x2a2f33, 0, 0.35, 0, 7)); g.add(cyl(0.34, 0.3, 0.12, 0x2a2f33, 0, 0.76, 0, 7)); return g; })).add(p.x, p.z, { y: p.y });
  return { x: p.x, y: p.y + 0.82, z: p.z };
}
/** A game of boules on a patch of sand: the boules and the jack instanced, five players round them, one of them pointing (jumping). Scale-1 coordinates. */
export function boules(scene, x, z) {
  const p = place(x, z), ball = perBuild('marseille:boule', () => batch(() => { const g = new THREE.Group(); g.add(sph(0.13, 0x9a9a9a, 0, 0.13, 0, 6)); return g; }, { tint: true }));
  scene.add(plane(9, 7, 0xcdbc8e, x, z));
  for (let i = 0; i < 7; i++) ball.add(p.x + rand(-1.5, 1.5), p.z + rand(-1, 1), { y: p.y, scale: i ? 1 : 0.45, color: i ? 0xffffff : 0xe0a030 });
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.4; crowd(scene, p.x + Math.cos(a) * 2.6, p.z + Math.sin(a) * 2.2, { world: true, y: p.y, rotY: Math.atan2(-Math.cos(a), -Math.sin(a)), kind: pick(['beret', 'elder', 'cap', 'plain']), amp: i === 0 ? 0.3 : 0.05 }); }
}

// ---------- Landmarks, world units ----------
/** The Ombrière (quai des Belges): a polished steel canopy on eight slim pillars, the crowd walking under its reflection. */
export function ombriere(world, x, z, rotY = 0) {
  const g = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: 0xe4eaef, metalness: 0.35, roughness: 0.25 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(46, 0.5, 22), steel); roof.position.y = 6.2; roof.castShadow = getPoly() === 'high'; g.add(roof);
  for (const px of [-18, -6, 6, 18]) for (const pz of [-7, 7]) g.add(cyl(0.18, 0.18, 6, 0xc9d1d8, px, 3, pz, 6));
  g.position.set(x, yAt(x, z), z); g.rotation.y = rotY; world.add(landmark(g, 'marseille:ombriere'));
}
/** The MuCEM: a dark cube wrapped in a concrete lattice, a roof terrace, and its footbridge across to the fort `bridgeTo` ({ x, z }, world). */
export function mucem(world, x, z, bridgeTo) {
  const g = new THREE.Group(), L = 0x4a4a4c, S = 54, H = 18;
  g.add(box(S - 4, H - 1, S - 4, 0x223040, 0, (H - 1) / 2, 0)); g.add(box(S, 0.8, S, L, 0, H, 0));
  for (let i = -S / 2; i <= S / 2; i += 3) for (const [dx, dz, rot] of [[i, S / 2, 0], [i, -S / 2, 0], [S / 2, i, 1], [-S / 2, i, 1]]) g.add(box(rot ? 1.2 : 0.5, H, rot ? 0.5 : 1.2, L, dx, H / 2, dz));
  for (let h = 3; h < H; h += 5) for (const [w, d, dz, dx] of [[S, 0.4, S / 2, 0], [S, 0.4, -S / 2, 0], [0.4, S, 0, S / 2], [0.4, S, 0, -S / 2]]) g.add(box(w, 0.35, d, L, dx, h, dz));
  if (bridgeTo) { const dx = bridgeTo.x - x, dz = bridgeTo.z - z, len = Math.hypot(dx, dz); const b = box(3.2, 0.8, len, 0x6a6a6c, dx / 2, 11, dz / 2); b.rotation.y = Math.atan2(dx, dz); g.add(b); }
  g.position.set(x, yAt(x, z), z); world.add(landmark(g, 'marseille:mucem'));
}
/** La Major: a long cathedral in bands of green and white stone, its domes and twin towers facing the sea. */
export function major(world, x, z, rotY = 0) {
  const g = new THREE.Group(), W = 0xe8dcc0, V = 0x5b7a5a, s = getPoly() === 'high' ? 16 : 10;
  for (let i = 0; i < 8; i++) g.add(box(84, 2.4, 24, i % 2 ? V : W, 0, 1.2 + i * 2.4, 0));
  g.add(box(30, 4, 40, W, 6, 2, 0)); for (let i = 0; i < 5; i++) g.add(box(30, 2.4, 40, i % 2 ? V : W, 6, 5.2 + i * 2.4, 0));
  g.add(cyl(10, 10.5, 8, W, 6, 23, 0, s)); const d = sph(10.5, 0x6d8a7a, 6, 27, 0, s); d.scale.y = 1.1; g.add(d); g.add(cyl(2, 2, 4, W, 6, 40, 0, 8)); g.add(cone(1.2, 4, 0x6d8a7a, 6, 44, 0, 8));
  for (const px of [-28, 30]) { g.add(cyl(5, 5.5, 4, W, px, 21, 0, s)); const sd = sph(5.5, 0x6d8a7a, px, 23, 0, s); sd.scale.y = 1.2; g.add(sd); }
  for (const pz of [-9, 9]) { g.add(box(9, 30, 9, W, -40, 15, pz)); for (let i = 0; i < 6; i++) g.add(box(9.2, 1.2, 9.2, V, -40, 4 + i * 4.5, pz)); const td = sph(4.4, 0x6d8a7a, -40, 31.5, pz, s); g.add(td); }
  g.position.set(x, yAt(x, z), z); g.rotation.y = rotY; world.add(landmark(g, 'marseille:major'));
}
