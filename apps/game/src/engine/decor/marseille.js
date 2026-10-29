// Marseille — Vieux-Port: the themed decor of this circuit (stage 0 split of
// track.js; stage 7's dense decor).
//
// `scene` is the scale-1 decor group that track.js spreads to the circuit's scale,
// `world` the real scene for pieces placed from G.samples or built in world units
// (landmarks whose domes and wheels must stay round).
//
// The lap runs along the quai du Port (the harbour south of it, the Rive
// Neuve across the water, Notre-Dame de la Garde on her hill behind), up the
// east side, along the north and climbs to the Corniche on the west side,
// high over the sea, banked and in the mistral, then drops back to the port.
// Only here: the harbour's moored fleet rolling at its pontoons, the ferry-
// boat, the big wheel, Fort Saint-Jean with the MuCEM and its footbridge, La
// Major, the Ombrière, the Bonne Mère, the Château d'If and the Frioul out
// at sea, sardine stalls, boules, gulls on the mooring posts and wheeling
// over the water, umbrella pines and limestone down the Corniche's cliffs.
// What repeats is instanced (decor/life.js and the street life of street.js).
import * as THREE from 'three';

import { box, plane } from '../primitives.js';
import { G, disposable, getPoly, isClear } from '../state.js';
import { TEX, surface } from '../textures.js';
import { pick, rand } from '../util.js';
import { DS, clearAt, nOf, still } from './context.js';
import { chateauIf, corniche, cornicheSea, frioul, sea, seaMaterial, waterSheet } from './marseille-corniche.js';
import { boules, landmark, major, mooredBoat, mooringPost, mucem, ombriere, sardineStall } from './marseille-port.js';
import { bonneMere, building, cafe, circling, crane, crowd, ferrisWheel, ferry, flock, fort, house, tram, treeAt } from './street.js';

/** The surface kinds (textures.js) this decor bakes, beyond the road's and the ground's: the pre-build bakes them ahead, a slice at a time. */
export const SURFACES = Object.freeze(['water', 'facade']);

/** The quai's ochre and pink, for the jackets of a Marseille crowd as well as its walls. */
const OCHRES = [0xf2b88a, 0xf5d0b0, 0xf0c8a0, 0xf4a5a5, 0xf7dcb4];
const SUMMER = [0xf6f1e4, 0x2a7fd4, 0x9fd0e8, 0xe0a030, 0xe36f8a, 0x2e8b57, 0xc8102e, 0xffffff, 0x3b4a6b, 0xf2c14e];

export function* buildMarseille(scene, world) {
  const S = DS, hi = getPoly() === 'high';
  // the harbour south of the quai du Port, the rive neuve across it; the sea round the mouth and up the Corniche.
  // The water is a sheet over the ground (the road's descent spreads a low rise into the harbour's west end, decor/context.js)
  const waterMat = disposable(new THREE.MeshStandardMaterial({ map: disposable(TEX.water.clone()), normalMap: surface('water').normalMap, roughness: 0.12, metalness: 0.3 })); waterMat.map.needsUpdate = true; waterMat.map.repeat.set(40, 3);
  const rows = []; for (let j = 0; j <= 5; j++) { const row = []; for (let i = 0; i <= 40; i++) row.push([(-310 + i * 13) * S, (-229 + j * 6.8) * S]); rows.push(row); }
  waterSheet(world, waterMat, rows, 'marseille:harbour');
  G.animated.push(dt => { waterMat.map.offset.x += dt * 0.015; waterMat.map.offset.y += dt * 0.004; });
  // the quays' walls, one merged piece stretched with the harbour; the pontoons each on the water where it is
  const quays = new THREE.Group(); quays.add(box(520, 1.6, 2, 0xbfb398, -50, 0.8, -194)); quays.add(box(520, 1.6, 2, 0xbfb398, -50, 0.8, -230)); quays.add(box(2, 1.6, 36, 0xbfb398, 211, 0.8, -212));
  scene.add(landmark(quays, 'marseille:quays'));
  for (let px = -200; px <= 160; px += 60) scene.add(still(box(2, 0.5, 30, 0xbfb398, px, 0.2, -210)));
  // the mouth's landmarks stay within the sky dome's 1,100 m (climate.js): Fort Saint-Jean on the north side of the mouth, its walls west and north
  fort(world, -860, -545, Math.PI); crane(world, 225 * S, -175 * S, -0.6); crane(world, 232 * S, -140 * S, 0.4); crane(world, 60 * S, -238 * S, 2.6);
  bonneMere(world, 40 * S, -268 * S);
  for (let x = -290; x <= 190; x += 34) building(scene, x, -252, 28, 16, rand(12, 18), 0, pick(OCHRES), pick([0xa0523d, 0xb0623f]));
  for (let x = -280; x <= 190; x += hi ? 15 : 30) treeAt(scene, x + rand(-2, 2), -236, 'palm');
  yield;
  // out on the water and on the mouth's quays, in world units: the sea, the islands, the MuCEM and its footbridge to the fort, La Major
  sea(world, waterMat); cornicheSea(world, seaMaterial(waterMat, 10, 14)); chateauIf(world, -960, -150); frioul(world, -920, 250);
  mucem(world, -790, -470, { x: -860, z: -490 }); major(world, -660, -330, 0);
  yield;
  // the fleet moored stern-to along the pontoons, rolling; the ferry-boat crossing to the other quay; the big wheel
  const gap = (hi ? 7.5 : 15) / S;
  for (let px = -200; px <= 160; px += 60) for (const side of [-1, 1]) for (let bz = -223; bz <= -197; bz += gap) if (Math.random() > 0.12) mooredBoat(px + side * 2.3, bz + rand(-0.2, 0.2), side > 0 ? 0 : Math.PI);
  ferry(scene, -190, 170, -222);
  ferrisWheel(world, 218 * S, -208 * S, 18);
  yield;
  // the quai: pastis terraces, the Ombrière, sardine stalls, the tram, boules, gulls on the mooring posts, palms, the promenade's crowd
  cafe(scene, -120, -186, Math.PI, 'BAR DE LA MARINE', 0xf2c14e, 4); cafe(scene, 40, -186, Math.PI, 'LA SAMARITAINE', 0xf2c14e, 4); cafe(scene, -70, 40, 0, 'CHEZ ÉTIENNE', 0xf2c14e, 3);
  ombriere(world, 108 * S, -189 * S);
  [-95, -60, -25, 10, 62, 80].forEach(x => sardineStall(scene, x, -187.5, 0));
  tram(scene, -150, 150, -181);
  boules(scene, -165, -186); boules(scene, 140, -186);
  const posts = []; for (let x = -200; x <= 190; x += hi ? 10 : 20) posts.push(mooringPost(x, -193));
  for (let i = 0; i < posts.length; i += 8) flock(world, posts[i].x, posts[i].z, { world: true, kind: 'seagull', spots: posts.slice(i, i + 8).filter((_, j) => j % 2 === 0) });
  for (let x = -190; x <= 180; x += hi ? 24 : 36) if (Math.abs(x + 120) > 10 && Math.abs(x - 40) > 10 && Math.abs(x - 108) > 12) treeAt(scene, x, -190, 'palm');
  for (let i = 0; i < nOf(70); i++) { const x = rand(-205, 185); if (Math.abs(x + 120) < 4 || Math.abs(x - 40) < 4) continue; crowd(scene, x, rand(-192, -184), { jacket: pick(SUMMER), kind: Math.random() < 0.1 ? 'camera' : undefined, amp: Math.random() < 0.15 ? 0.12 : 0.04 }); }
  [-40, 30, 160].forEach(x => flock(scene, x, -184, { n: nOf(10), radius: 1.4 }));
  for (const x of [-150, 0, 150]) circling(world, x * S, -212 * S, { world: true, y: 0, n: nOf(6), radius: 42, height: 22 });
  yield;
  // Le Panier inside the loop: ochre and pink houses round a little square with its boules, olive trees and oleanders; the ochre ring round the outside
  scene.add(still(plane(50, 40, 0xcdbc8e, -70, 10)));
  [[-110, 40], [-110, -10], [-30, -10], [-70, 72], [-40, 50]].forEach(([x, z]) => { if (clearAt(x, z, 10)) house(scene, x, z, 14, 12, rand(9, 13), 0); });
  [[-100, 20], [-45, 25], [-95, -25], [-50, -5], [-88, 2]].forEach(([x, z], i) => treeAt(scene, x, z, i % 2 ? 'oleander' : 'olive'));
  boules(scene, -72, 14);
  for (let i = 0; i < nOf(16); i++) crowd(scene, rand(-90, -50), rand(-8, 28), { jacket: pick(SUMMER), amp: 0.05 });
  flock(scene, -60, 0, { n: nOf(8), radius: 1.2 });
  for (let a = 0.05; a < Math.PI + 0.3; a += 0.16) { const r = 207; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (clearAt(x, z, 11)) house(scene, x, z, rand(12, 16), rand(9, 12), rand(8, 12), -a + Math.PI / 2); }
  for (let a = 0.1; a < Math.PI - 0.1; a += 0.18) { const r = 246; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (clearAt(x, z, 18)) building(scene, x, z, rand(22, 30), rand(16, 22), rand(14, 22), -a + Math.PI / 2, pick([...OCHRES, 0xffffff]), pick([0xa0523d, 0x59606b])); }
  yield;
  // the town's trees, and palms and oleanders along the road
  for (let i = 0; i < nOf(70); i++) { const x = rand(-270, 270), z = rand(-150, 270); if (clearAt(x, z, 9)) treeAt(scene, x, z, pick(['palm', 'palm', 'round', 'pine', 'plane', 'olive'])); }
  for (let i = 0; i < G.N; i += hi ? 36 : 72) { const s = G.samples[i]; const sg = (i / 36) % 2 ? 1 : -1, l = sg * (s.hw + 9), x = s.x + s.sx * l, z = s.z + s.sz * l; if (isClear(x, z, 7)) treeAt(world, x, z, (i / 36) % 4 === 3 ? 'oleander' : 'palm', { world: true, y: s.y + l * (s.bank || 0) }); }
  yield;
  // the Corniche, over the sea
  yield* corniche(scene, world);
}
