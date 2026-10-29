// Montmartre — La Butte: the themed decor of this circuit (stage 0 split of track.js).
//
// `scene` is the scale-1 decor group that track.js spreads to the circuit's scale,
// `world` the real scene for pieces placed from G.samples or built in world units
// (landmarks whose domes and wheels must stay round).
import * as THREE from 'three';

import { G, isClear } from '../state.js';
import { TEX } from '../textures.js';
import { pick, rand } from '../util.js';
import { DS, clearAt, nOf } from './context.js';
import { building, cafe, carousel, easel, figure, funicular, house, lamp, metroEntrance, person, pigeon, sacreCoeur, sedan, stairs, tree, vines, windmill } from './street.js';

/** The surface kinds (textures.js) this decor bakes, beyond the road's and the ground's: the pre-build bakes them ahead, a slice at a time. */
export const SURFACES = Object.freeze(['asphalt', 'facade']);

export function* buildMontmartre(scene, world) {
  const hw = G.hw, S = DS;
  // the Sacré-Cœur on its mound beyond the top of the loop, the funicular climbing to it
  sacreCoeur(world, 0, 712 * S / 3); funicular(world, -135 * S / 3, 548 * S / 3, 664 * S / 3, 10);
  yield;
  // place du Tertre inside the top of the loop: cobbles, easels and their painters, tourists, mimes, pigeons, the terraces
  const sq = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), new THREE.MeshStandardMaterial({ map: TEX.cobble.clone(), roughness: 1 })); sq.material.map.needsUpdate = true; sq.material.map.repeat.set(9, 6); sq.rotation.x = -Math.PI / 2; sq.position.set(0, 0.03, 108); sq.receiveShadow = true; scene.add(sq);
  for (let i = 0; i < nOf(12); i++) { const a = i / 12 * Math.PI * 2; easel(scene, Math.cos(a) * 24, 108 + Math.sin(a) * 14, -a + Math.PI / 2); }
  for (let i = 0; i < nOf(24); i++) person(scene, rand(-30, 30), rand(90, 126), rand(0, 6.28), i % 3 === 0 ? 'press' : null, 0.08);
  for (let i = 0; i < 4; i++) { const m = figure(0x222222, 0xffffff, null); m.position.set(-12 + i * 8, 0, 84); m.rotation.y = Math.PI; scene.add(m); G.crowd.push({ g: m, ph: rand(0, 6), amp: 0.35, base: 0 }); }
  for (let i = 0; i < 30; i++) pigeon(scene, rand(-34, 34), rand(86, 130)); for (let i = 0; i < 14; i++) pigeon(scene, rand(-30, 30), rand(-150, -135));
  cafe(scene, -28, 134, Math.PI, 'LA MÈRE CATHERINE', 0xc8102e, 4); cafe(scene, 28, 134, Math.PI, 'LE CONSULAT', 0x2f6b3a, 4);
  cafe(scene, -120, 75, Math.PI / 2, 'AU LAPIN AGILE', 0xe36f8a, 3); cafe(scene, 60, -128, 0, 'CAFÉ DES DEUX MOULINS', 0xd4af37, 3);
  [[-70, 146], [-88, 143], [-106, 140], [70, 146], [88, 143], [106, 140], [-62, 108], [62, 108], [-62, 86], [62, 86]].forEach(([x, z]) => { if (clearAt(x, z, 10)) house(scene, x, z, 12, 10, rand(8, 11), 0); });
  yield;
  // the foot of the butte, by the start: the carousel, the Métro, lamps
  carousel(scene, -45, -125); metroEntrance(scene, 22, -132, Math.PI); metroEntrance(scene, -140, -118, Math.PI / 2);
  yield;
  // the Moulin de la Galette and its vines on the west side
  windmill(scene, -110, 20, Math.PI / 2); vines(scene, -112, -2, 0); vines(scene, -92, 8, 0.2); vines(scene, -125, 42, -0.1);
  yield;
  // stairs and lamp posts climbing beside the long straight, one flight per ramp
  [-128, -78, -28].forEach(z => { stairs(scene, 193, z, 0, 12); lamp(scene, 190, z + 18, 'paris'); lamp(scene, 196, z - 2, 'paris'); });
  [-120, -70, -20, 30].forEach(z => { lamp(scene, -192, z, 'paris'); stairs(scene, -193, z, Math.PI, 8); });
  yield;
  // Haussmann blocks and village houses ring the butte; the view up to the basilica stays open
  for (let a = 0; a < Math.PI * 2; a += 0.19) { const r = 248; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (z > 190 && Math.abs(x) < 110) continue; if (!clearAt(x, z, 18)) continue; if (Math.floor(a / 0.19) % 2) house(scene, x, z, rand(16, 22), rand(12, 16), rand(9, 13), -a + Math.PI / 2); else building(scene, x, z, rand(22, 30), rand(16, 22), rand(16, 22), -a + Math.PI / 2); }
  for (let a = 0.05; a < Math.PI * 2; a += 0.17) { const r = 207; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (z > 150 || !clearAt(x, z, 11)) continue; house(scene, x, z, rand(12, 16), rand(9, 12), rand(8, 12), -a + Math.PI / 2); }
  for (let i = 0; i < 40; i++) { const x = rand(-270, 270), z = rand(-240, 240); if (clearAt(x, z, 9) && !(Math.abs(x) < 60 && z > 70 && z < 145)) tree(scene, x, z, Math.random() < 0.6 ? 'round' : 'plane'); }
  yield;
  // street artists and a few sedans in the lanes inside the loop
  for (let i = 0; i < nOf(6); i++) person(scene, rand(-40, 40), rand(-100, -60), rand(0, 6.28), 'sign', 0.1);
  [[-80, -100, 1.2], [90, -60, -0.3], [-20, 30, 1.6]].forEach(p => { if (clearAt(p[0], p[1], 6)) sedan(scene, p[0], p[1], p[2], pick([0x111111, 0xf6f1e4, 0x8a2b2b])); });
  for (let i = 0; i < G.N; i += 54) { const s = G.samples[i]; const sg = (i / 54) % 2 ? 1 : -1; if (isClear(s.x + s.sx * sg * (hw + 9), s.z + s.sz * sg * (hw + 9), 7)) tree(world, s.x + s.sx * sg * (hw + 9), s.z + s.sz * sg * (hw + 9), 'round', s.y); }
}
