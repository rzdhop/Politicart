// Versailles — Jardins du Congrès: the themed decor of this circuit (stage 0 split of track.js).
//
// `scene` is the scale-1 decor group that track.js spreads to the circuit's scale,
// `world` the real scene for pieces placed from G.samples or built in world units
// (landmarks whose domes and wheels must stay round).
import * as THREE from 'three';

import { box, cyl, plane } from '../primitives.js';
import { CFG, G, isClear } from '../state.js';
import { TEX, surface } from '../textures.js';
import { pick, rand } from '../util.js';
import { DS, clearAt, nOf } from './context.js';
import { SKINS, figure, fountain, hedgeWall, orangery, palace, parterre, person, statue, swan, tree } from './street.js';

export function buildVersailles(scene, world) {
  // château along the north edge, parterres and water terrace in front
  palace(scene, 0, 182, 200, 18, 30, 0, 0x6b6f78);
  [-70, 70].forEach(x => { scene.add(box(50, 14, 26, 0xeadfc8, x, 7, 200)); scene.add(box(48, 3, 24, 0x6b6f78, x, 15.5, 200)); });
  for (let x = -90; x <= 90; x += 10) scene.add(box(0.8, 1.4, 0.8, 0xd4af37, x, 23.8, 170));
  [-45, 45].forEach(x => { scene.add(cyl(18, 18, 0.6, 0xd9cfb8, x, 0.3, 141, 36)); const w = new THREE.Mesh(new THREE.CircleGeometry(17, 36), new THREE.MeshStandardMaterial({ map: TEX.water, normalMap: surface('water').normalMap, roughness: 0.15, metalness: 0.3 })); w.rotation.x = -Math.PI / 2; w.position.set(x, 0.62, 141); scene.add(w); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; statue(scene, x + Math.cos(a) * 20, 141 + Math.sin(a) * 20, -a); } });
  for (let x = -96; x <= 96; x += 16) tree(scene, x, 163, 'orange');
  [-110, -80, 80, 110].forEach(x => parterre(scene, x, 128, 22, 12));
  [[-10, 128], [10, 128]].forEach(p => parterre(scene, p[0], p[1], 14, 10));
  // inside the loop: Latone, the tapis vert, Apollo, bosquets
  fountain(scene, 0, 50, 14, 3, true);
  scene.add(plane(26, 100, 0x4f8f3f, 0, -20));
  for (let z = -60; z <= 20; z += 16) { statue(scene, -18, z, Math.PI / 2); statue(scene, 18, z, -Math.PI / 2); tree(scene, -24, z + 8, 'topiary'); tree(scene, 24, z + 8, 'topiary'); }
  fountain(scene, 0, -95, 18, 2, true);
  [[-62, -25], [62, -25], [-62, 45], [62, 45]].forEach(p => { if (clearAt(p[0], p[1], 20)) { hedgeWall(scene, p[0], p[1] - 14, 30, 1.6, 4); hedgeWall(scene, p[0], p[1] + 14, 30, 1.6, 4); hedgeWall(scene, p[0] - 14, p[1], 1.6, 26, 4); hedgeWall(scene, p[0] + 14, p[1], 1.6, 26, 4); fountain(scene, p[0], p[1], 5, 1, false); } });
  // Grand Canal and its tree lines south of the loop
  const canal = new THREE.Mesh(new THREE.PlaneGeometry(44, 240), new THREE.MeshStandardMaterial({ map: TEX.water.clone(), normalMap: surface('water').normalMap, roughness: 0.15, metalness: 0.3 })); canal.material.map.needsUpdate = true; canal.material.map.repeat.set(2, 12); canal.rotation.x = -Math.PI / 2; canal.position.set(0, 0.03, -305); scene.add(canal);
  const cross = canal.clone(); cross.geometry = new THREE.PlaneGeometry(240, 36); cross.position.set(0, 0.03, -330); scene.add(cross);
  for (let z = -200; z >= -420; z -= 18) { tree(scene, -34, z, 'cypress'); tree(scene, 34, z, 'cypress'); }
  for (let i = 0; i < 160; i++) { const x = rand(-330, 330), z = rand(-330, 100); if (clearAt(x, z, 9) && Math.abs(x) > 110) tree(scene, x, z, Math.random() < 0.5 ? 'cypress' : 'round'); }
  // topiary and gravel edges all along the circuit
  for (let i = 0; i < G.N; i += 12) { const s = G.samples[i]; const sg = (i / 12) % 2 ? 1 : -1; const x = s.x + s.sx * sg * (CFG.roadHalfWidth + 8), z = s.z + s.sz * sg * (CFG.roadHalfWidth + 8); if (isClear(x, z, 6.5)) tree(world, x, z, 'topiary'); }
  for (let i = 0; i < 10; i++) { const f = figure(0x1f2a5e, pick(SKINS), 'guard'); f.position.set(-50 + i * 11, 0, 164); f.rotation.y = Math.PI; scene.add(f); }
  // more of the gardens: a ring of statues round Latone, topiary lines, extra parterres, the orangery, swans, strollers, guards
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; statue(scene, Math.cos(a) * 24, 50 + Math.sin(a) * 24, -a + Math.PI / 2); }
  for (let x = -120; x <= 120; x += 12) if (clearAt(x, 118, 4)) tree(scene, x, 118, 'topiary');
  [[-42, 86], [42, 86], [-42, -132], [42, -132]].forEach(([x, z]) => { if (clearAt(x, z, 16)) parterre(scene, x, z, 20, 12); });
  orangery(scene, -190, 150, 100, 0); for (let x = -236; x <= -144; x += 14) tree(scene, x, 164, 'orange');
  const swans = []; for (let i = 0; i < nOf(10); i++) swans.push(swan(scene, rand(-14, 14), rand(-215, -400)));
  G.animated.push(dt => { for (const s of swans) { s.position.z += Math.cos(s.rotation.y) * dt * 0.6; s.position.x += Math.sin(s.rotation.y) * dt * 0.6; if (Math.abs(s.position.x) > 16 * DS || s.position.z > -200 * DS || s.position.z < -420 * DS) s.rotation.y += Math.PI; } });
  for (let i = 0; i < nOf(12); i++) person(scene, rand(-10, 10), rand(-60, 24), rand(0, 6.28), i % 4 === 0 ? 'press' : null, 0.05);
  for (let i = 0; i < 6; i++) { const f = figure(0x1f2a5e, pick(SKINS), 'guard'); f.position.set(-30 + i * 12, 0, 74); f.rotation.y = Math.PI; scene.add(f); }
}
