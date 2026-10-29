// L'Élysée — Faubourg Saint-Honoré: the themed decor of this circuit (stage 0 split of track.js).
//
// `scene` is the scale-1 decor group that track.js spreads to the circuit's scale,
// `world` the real scene for pieces placed from G.samples or built in world units
// (landmarks whose domes and wheels must stay round).
import * as THREE from 'three';

import { box, cyl, plane } from '../primitives.js';
import { CFG, G, isClear } from '../state.js';
import { TEX } from '../textures.js';
import { pick, rand } from '../util.js';
import { clearAt, nOf, still } from './context.js';
import { JACKETS, SKINS, building, busStop, cafe, figure, flagPole, fountain, gate, hedgeWall, kiosk, lamp, metroEntrance, palace, person, pigeon, sedan, shopRow, tree, wallace } from './street.js';

export function buildElysee(scene, world) {
  const hw = CFG.roadHalfWidth;
  // palace, cour d'honneur, gate on the Faubourg
  palace(scene, 0, 72, 76, 15, 24, 0, 0x4a4f5a);
  const court = new THREE.Mesh(new THREE.PlaneGeometry(80, 52), new THREE.MeshStandardMaterial({ map: TEX.cobble.clone(), roughness: 1 })); court.material.map.needsUpdate = true; court.material.map.repeat.set(10, 6); court.rotation.x = -Math.PI / 2; court.position.set(0, 0.03, 34); court.receiveShadow = true; scene.add(court);
  [-40, 40].forEach(x => scene.add(still(box(2, 14, 52, 0xeadfc8, x, 7, 34))));                // wings around the courtyard
  gate(scene, 0, 8, 0, 26);
  [-18, 18].forEach(x => { const gd = figure(0x1f2a5e, pick(SKINS), 'guard'); gd.position.set(x, 0, 10); gd.rotation.y = Math.PI; scene.add(gd); });
  [[-22, 30, 0.3], [-12, 42, 0.1], [20, 32, -0.2], [12, 46, 0.4]].forEach(p => sedan(scene, p[0], p[1], p[2], 0x111111));
  flagPole(scene, 0, 86, [0x2f55c7, 0xffffff, 0xe63946], 26);
  // press scrum on the street in front of the gate, behind a rail
  for (let i = 0; i < 14; i++) { const f = figure(pick([0x222222, 0x3b4a6b, 0x5a5a5a]), pick(SKINS), 'press'); f.position.set(rand(-20, 20), 0, rand(-8, -2)); f.rotation.y = 0; scene.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: 0.1, base: 0 }); }
  scene.add(still(box(44, 0.06, 0.06, 0x9a9a9a, 0, 1.0, -1))); for (let x = -22; x <= 22; x += 4) scene.add(still(cyl(0.05, 0.05, 1.1, 0x9a9a9a, x, 0.55, -1, 5)));
  // rue du Faubourg with shops facing the palace
  const street = new THREE.Mesh(new THREE.PlaneGeometry(260, 14), new THREE.MeshStandardMaterial({ map: TEX.asphalt.clone(), roughness: 1 })); street.material.map.needsUpdate = true; street.material.map.repeat.set(14, 1); street.rotation.x = -Math.PI / 2; street.rotation.z = Math.PI / 2; street.position.set(0, 0.03, -2); street.receiveShadow = true; scene.add(street);
  shopRow(scene, -120, 120, -24, 1);
  for (let x = -110; x <= 110; x += 22) { tree(scene, x, -10, 'plane'); lamp(scene, x + 11, -9, 'paris'); }
  // garden behind the palace
  scene.add(plane(120, 40, 0x5f9a48, 0, 100)); fountain(scene, 0, 102, 7, 1, false); [-30, 30].forEach(x => { hedgeWall(scene, x, 96, 24, 1.2, 2); tree(scene, x, 106, 'cypress'); tree(scene, x + 8, 106, 'cypress'); tree(scene, x - 8, 106, 'cypress'); });
  // Haussmann ring outside the loop, plane trees, pigeons
  for (let a = 0; a < Math.PI * 2; a += 0.2) { const r = 242; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (clearAt(x, z, 18)) building(scene, x, z, rand(22, 30), rand(16, 22), rand(16, 24), -a + Math.PI / 2); }
  for (let i = 0; i < 70; i++) { const x = rand(-270, 270), z = rand(-230, 270); if (clearAt(x, z, 9) && !(Math.abs(z) < 120 && Math.abs(x) < 140)) tree(scene, x, z, 'plane'); }
  for (let i = 0; i < 24; i++) { const x = rand(-60, 60), z = rand(12, 55); pigeon(scene, x, z); }
  for (let i = 0; i < G.N; i += 60) { const s = G.samples[i]; if (isClear(s.x + s.sx * (hw + 9), s.z + s.sz * (hw + 9), 7)) tree(world, s.x + s.sx * (hw + 9), s.z + s.sz * (hw + 9), 'plane'); }
  // the Faubourg's street life: bus stops, Métro entrances, café terraces, a kiosk, Wallace fountains, parked cars
  [-55, 66].forEach(x => busStop(scene, x, -12.5, 0)); [-82, 92].forEach(x => metroEntrance(scene, x, -12.5, Math.PI));
  cafe(scene, -36, -12.5, Math.PI, 'CAFÉ DU FAUBOURG', 0xc8102e, 3); cafe(scene, 40, -12.5, Math.PI, 'LE MARIGNY', 0x1f3a93, 3);
  kiosk(scene, -62, 13, 0x2e8b57, 'PRESSE', Math.PI); [[-96, 14], [96, 14], [0, 118]].forEach(([x, z]) => wallace(scene, x, z));
  [[-100, 3.5, 0], [-72, 3.5, 0], [72, 3.5, 0], [102, 3.5, 0], [-46, -7.5, Math.PI], [52, -7.5, Math.PI]].forEach(p => sedan(scene, p[0], p[1], p[2], pick([0x111111, 0x2b2b35, 0x4a4a52])));
  for (let i = 0; i < nOf(24); i++) person(scene, rand(-110, 110), rand(-14, -10), rand(0, 6.28), null, 0.05);
  for (let i = 0; i < 20; i++) pigeon(scene, rand(-110, 110), rand(-14, -8));
  // pedestrians waiting at the crossing, on both pavements
  const cr = (G.track?.features || []).find(f => f.t === 'crossing'); if (cr) { const s = G.samples[Math.floor(cr.f * G.N)]; for (let i = 0; i < nOf(8); i++) { const sg = i % 2 ? 1 : -1; const f = figure(pick(JACKETS), pick(SKINS), null); f.position.set(s.x + s.sx * sg * (hw + 2.5 + rand(0, 2)) + s.tx * rand(-3, 3), 0, s.z + s.sz * sg * (hw + 2.5 + rand(0, 2)) + s.tz * rand(-3, 3)); f.rotation.y = Math.atan2(-s.sx * sg, -s.sz * sg); world.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: 0.08, base: 0 }); } }
}
