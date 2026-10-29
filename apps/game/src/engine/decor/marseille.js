// Marseille — Vieux-Port: the themed decor of this circuit (stage 0 split of track.js).
//
// `scene` is the scale-1 decor group that track.js spreads to the circuit's scale,
// `world` the real scene for pieces placed from G.samples or built in world units
// (landmarks whose domes and wheels must stay round).
import * as THREE from 'three';

import { box, plane } from '../primitives.js';
import { G, isClear } from '../state.js';
import { TEX, surface } from '../textures.js';
import { pick, rand } from '../util.js';
import { DS, clearAt, nOf } from './context.js';
import { boat, bonneMere, building, cafe, crane, ferrisWheel, ferry, fishStall, fort, house, person, petanque, pigeon, seagull, tram, tree } from './street.js';

/** The surface kinds (textures.js) this decor bakes, beyond the road's and the ground's: the pre-build bakes them ahead, a slice at a time. */
export const SURFACES = Object.freeze(['water', 'facade']);

export function* buildMarseille(scene, world) {
  const hw = G.hw, S = DS;
  // the harbour south of the quai des Belges, the rive neuve across it, the mouth and its fort to the west
  const water = new THREE.Mesh(new THREE.PlaneGeometry(520, 34), new THREE.MeshStandardMaterial({ map: TEX.water.clone(), normalMap: surface('water').normalMap, roughness: 0.12, metalness: 0.3 })); water.material.map.needsUpdate = true; water.material.map.repeat.set(40, 3); water.rotation.x = -Math.PI / 2; water.position.set(-50, 0.03, -212); scene.add(water);
  const mouth = water.clone(); mouth.geometry = new THREE.PlaneGeometry(120, 150); mouth.material = water.material; mouth.position.set(-370, 0.03, -200); scene.add(mouth);
  G.animated.push(dt => { water.material.map.offset.x += dt * 0.015; water.material.map.offset.y += dt * 0.004; });
  scene.add(box(520, 1.6, 2, 0xbfb398, -50, 0.8, -194)); scene.add(box(520, 1.6, 2, 0xbfb398, -50, 0.8, -230)); scene.add(box(2, 1.6, 36, 0xbfb398, 211, 0.8, -212));
  fort(world, -300 * S, -245 * S, 0); crane(world, 225 * S, -175 * S, -0.6); crane(world, 232 * S, -140 * S, 0.4); crane(world, 60 * S, -238 * S, 2.6);
  bonneMere(world, 40 * S, -268 * S);
  for (let x = -290; x <= 190; x += 34) building(scene, x, -252, 28, 16, rand(12, 18), 0, pick([0xf2b88a, 0xf5d0b0, 0xf0c8a0, 0xf4a5a5, 0xf7dcb4]), pick([0xa0523d, 0xb0623f]));
  for (let x = -280; x <= 190; x += 30) tree(scene, x, -236, 'palm');
  yield;
  // pontoons with the boats moored along them, bobbing; the ferry-boat crossing to the other quay
  const boats = []; let slot = 0;
  for (let px = -200; px <= 160; px += 60) { scene.add(box(2, 0.5, 30, 0xbfb398, px, 0.1, -210)); for (const sx of [-3.6, 3.6]) for (const bz of [-202, -214]) if (slot++ % 2 === 0 && boats.length < nOf(14)) boats.push(boat(scene, px + sx, bz, Math.PI / 2, pick([0xc8102e, 0x1f3a93, 0xf6f1e4, 0x2e8b57, 0xe0a030, 0x2a7fd4]))); }
  G.animated.push(dt => { boats.forEach((b, i) => { b.position.y = Math.sin(G.time * 1.3 + i) * 0.18; b.rotation.x = Math.sin(G.time * 0.9 + i * 1.7) * 0.05; b.rotation.z = Math.cos(G.time * 1.1 + i) * 0.03; }); });
  ferry(scene, -190, 170, -222);
  ferrisWheel(world, 218 * S, -208 * S, 18);
  yield;
  // the quai: pastis terraces, fish stalls, the tram, pétanque, seagulls on the posts, palms
  cafe(scene, -120, -186, Math.PI, 'BAR DE LA MARINE', 0xf2c14e, 4); cafe(scene, 40, -186, Math.PI, 'LA SAMARITAINE', 0xf2c14e, 4); cafe(scene, -70, 40, 0, 'CHEZ ÉTIENNE', 0xf2c14e, 3);
  [-60, 10, 80].forEach(x => fishStall(scene, x, -187, Math.PI));
  tram(scene, -150, 150, -181);
  petanque(scene, -165, -186); petanque(scene, 140, -186);
  for (let x = -200; x <= 180; x += 38) seagull(scene, x + rand(-4, 4), -192.5, rand(1.2, 2.2));
  for (let x = -190; x <= 180; x += 36) if (Math.abs(x + 120) > 10 && Math.abs(x - 40) > 10) tree(scene, x, -190, 'palm');
  for (let i = 0; i < nOf(20); i++) person(scene, rand(-200, 180), rand(-191, -183), rand(0, 6.28), i % 4 === 0 ? 'press' : null, 0.06);
  for (let i = 0; i < 18; i++) pigeon(scene, rand(-100, 100), rand(-191, -182));
  yield;
  // Le Panier inside the loop: ochre and pink houses round a little square, a few palms; the ochre ring round the outside
  const sq = plane(50, 40, 0xcdbc8e, -70, 10); scene.add(sq);
  [[-110, 40], [-110, -10], [-30, -10], [-70, 72], [-40, 50]].forEach(([x, z]) => { if (clearAt(x, z, 10)) house(scene, x, z, 14, 12, rand(9, 13), 0); });
  [[-100, 20], [-45, 25], [-95, -25]].forEach(([x, z]) => tree(scene, x, z, 'palm'));
  for (let i = 0; i < nOf(8); i++) person(scene, rand(-90, -50), rand(-8, 28), rand(0, 6.28), null, 0.05);
  for (let a = 0.05; a < Math.PI + 0.3; a += 0.16) { const r = 207; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (clearAt(x, z, 11)) house(scene, x, z, rand(12, 16), rand(9, 12), rand(8, 12), -a + Math.PI / 2); }
  for (let a = 0.1; a < Math.PI - 0.1; a += 0.18) { const r = 246; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (clearAt(x, z, 18)) building(scene, x, z, rand(22, 30), rand(16, 22), rand(14, 22), -a + Math.PI / 2, pick([0xf2b88a, 0xf5d0b0, 0xf4a5a5, 0xffffff, 0xf7dcb4]), pick([0xa0523d, 0x59606b])); }
  for (let i = 0; i < 36; i++) { const x = rand(-270, 270), z = rand(-150, 270); if (clearAt(x, z, 9)) tree(scene, x, z, Math.random() < 0.5 ? 'palm' : 'round'); }
  for (let i = 0; i < G.N; i += 72) { const s = G.samples[i]; const sg = (i / 72) % 2 ? 1 : -1; if (isClear(s.x + s.sx * sg * (hw + 9), s.z + s.sz * sg * (hw + 9), 7)) tree(world, s.x + s.sx * sg * (hw + 9), s.z + s.sz * sg * (hw + 9), 'palm', s.y); }
}

