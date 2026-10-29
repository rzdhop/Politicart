// Palais Bourbon — Quais de Seine: the themed decor of this circuit (stage 0 split of track.js).
//
// `scene` is the scale-1 decor group that track.js spreads to the circuit's scale,
// `world` the real scene for pieces placed from G.samples or built in world units
// (landmarks whose domes and wheels must stay round).
import * as THREE from 'three';

import { box, plane } from '../primitives.js';
import { G } from '../state.js';
import { TEX, surface } from '../textures.js';
import { pick, rand } from '../util.js';
import { DS, clearAt, nOf } from './context.js';
import { JACKETS, SKINS, bateau, bouquiniste, bridge, building, cafe, figure, flagPole, hedgeWall, kiosk, obelisk, palace, peniche, person, pigeon, sedan, statue, tree } from './street.js';

export function buildBourbon(scene, world) {
  const hw = G.hw;
  // the Seine, embankment, bridge, obelisk on the far bank
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 90), new THREE.MeshStandardMaterial({ map: TEX.water.clone(), normalMap: surface('water').normalMap, roughness: 0.15, metalness: 0.3 })); water.material.map.needsUpdate = true; water.material.map.repeat.set(60, 4); water.rotation.x = -Math.PI / 2; water.position.set(0, 0.03, -170); scene.add(water);   // just above the ground plane, which would otherwise hide it
  G.animated.push(dt => { water.material.map.offset.x += dt * 0.02; });
  scene.add(box(1600, 1.6, 3, 0xbfb398, 0, 0.8, -123)); scene.add(box(1600, 2, 4, 0xbfb398, 0, 1, -217));
  bridge(scene, 60, -122, -216); obelisk(scene, 60, -245);
  for (let a = -300; a <= 300; a += 40) if (Math.abs(a - 60) > 25) building(scene, a, -250, 32, 18, rand(18, 24), 0);
  bateau(scene);
  // Palais Bourbon facing the river, lawn with statues behind
  const pb = palace(scene, 0, -58, 56, 14, 22, Math.PI, 0x6d6d6d);
  [-24, 24].forEach(x => flagPole(scene, x, -75, [0x2f55c7, 0xffffff, 0xe63946]));
  [-10, 10].forEach(x => { const gd = figure(0x1f2a5e, pick(SKINS), 'guard'); gd.position.set(x, 0, -72); gd.rotation.y = Math.PI; scene.add(gd); });
  scene.add(plane(90, 50, 0x5f9a48, 0, -10)); [-30, -10, 10, 30].forEach(x => statue(scene, x, -40, Math.PI)); hedgeWall(scene, 0, 16, 90, 1.2, 2.2);
  // bouquinistes along the quai, between road and river
  for (let x = -92; x <= 92; x += 9) bouquiniste(scene, x, -117.5, 0);
  for (let i = 0; i < 18; i++) { const f = figure(pick(JACKETS), pick(SKINS), null); f.position.set(rand(-90, 90), 0, rand(-116, -113)); f.rotation.y = Math.PI; scene.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: 0, base: 0 }); }
  [[-60, -113, 1.5], [75, -114, 1.6]].forEach(p => sedan(scene, p[0], p[1], p[2], 0x111111));
  kiosk(scene, 120, -116, 0x2e8b57, 'JOURNAUX', 0);
  // Haussmann ring on the land side, plane trees
  for (let a = 0.15; a < Math.PI - 0.15; a += 0.19) { const r = 236; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (clearAt(x, z, 18)) building(scene, x, z, rand(22, 30), rand(16, 22), rand(16, 24), -a + Math.PI / 2); }
  for (let i = 0; i < 60; i++) { const x = rand(-270, 270), z = rand(-110, 270); if (clearAt(x, z, 9)) tree(scene, x, z, 'plane'); }
  for (let x = -100; x <= 100; x += 25) tree(scene, x, -112, 'plane');
  for (let i = 0; i < 16; i++) pigeon(scene, rand(-40, 40), rand(-45, -20));
  // more of the quai: bouquinistes to both ends, péniches on the far bank, a second bridge, a terrace by the kiosk, joggers
  for (let x = -164; x <= 164; x += 9) if (Math.abs(x) > 96 && Math.abs(x - 120) > 6) bouquiniste(scene, x, -117.5, 0);
  [[-150, 0x2f5f32], [-30, 0x8a2b2b], [175, 0x1f3a93]].forEach(([x, c]) => peniche(scene, x, -206, 0, c));
  bridge(scene, -150, -122, -216);
  cafe(scene, 138, -113, Math.PI, 'CAFÉ DU QUAI', 0x2e8b57, 3);
  const joggers = []; for (let i = 0; i < nOf(8); i++) { const f = person(scene, rand(-150, 150), rand(-115, -113), Math.PI / 2, null, 0.2); f.userData.v = rand(3, 4.5) * (i % 2 ? 1 : -1); f.rotation.y = f.userData.v > 0 ? Math.PI / 2 : -Math.PI / 2; joggers.push(f); }
  G.animated.push(dt => { for (const j of joggers) { j.position.x += j.userData.v * dt; if (j.position.x > 160 * DS) j.position.x = -160 * DS; if (j.position.x < -160 * DS) j.position.x = 160 * DS; } });
  for (let i = 0; i < nOf(10); i++) person(scene, rand(-160, 160), rand(-116, -113), Math.PI, null, 0);
  for (let i = 0; i < 14; i++) pigeon(scene, rand(-160, 160), rand(-119, -113));
}
