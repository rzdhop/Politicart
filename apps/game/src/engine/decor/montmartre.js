// Montmartre — La Butte: the themed decor of this circuit (stage 7).
//
// `scene` is the scale-1 decor group that track.js spreads to the circuit's scale,
// `world` the real scene for pieces placed from G.samples or built in world units
// (landmarks whose domes and wheels must stay round).
//
// The road climbs 22 m up the right-hand side and comes down the left (data.js
// profile, DEC-050); the decor sits on that relief: what is placed from the
// samples takes their height, what stands off the road takes yAt, and the far
// butte is a mesh of its own whose foot is the terrain (montmartre-props.js
// butteY). Its landmarks (each a group named 'montmartre:<name>'): the butte
// and the Sacré-Cœur on top, the funicular and the rue Foyatier's steps up its
// flank, the place du Tertre with its painters under red parasols, the Moulin
// de la Galette, the Lapin Agile among the vines of the Clos Montmartre, the
// Mur des je t'aime. Street life: tourists in groups behind their guide,
// painters, mimes, Citroën 2CVs parked along the streets, café terraces,
// pigeons, terraced houses stepping up beside the climb, lamps lit at dusk.
import * as THREE from 'three';

import { G, getPoly, isClear } from '../state.js';
import { pick, rand } from '../util.js';
import { DS, clearAt, nOf, yAt } from './context.js';
import { fromBuilder, instanced } from './instanced.js';
import { box, cyl } from '../primitives.js';
import { building, carousel, funicular, house, lamp, metroEntrance, sacreCoeur, windmill } from './street.js';
import { merged, mergeGroup } from './versailles-props.js';
import {
  BUTTE, bistroSet, butteMesh, butteTree, butteY, cobbleSquare, deuxCV, easelProp, foyatier, grassMat, lapinAgile, murJeTaime, onButte, parasolProp, pigeonProp,
  plasterMat, station, terraceFront, villageHouse, vineStock, walker,
} from './montmartre-props.js';

/** The surface kinds (textures.js) this decor bakes, beyond the road's and the ground's: the pre-build bakes them ahead, a slice at a time. */
export const SURFACES = Object.freeze(['asphalt', 'facade', 'plaster', 'grass', 'cobble']);

/** The stretches where terraced houses step up beside the road, on its outer side: the climb, and the way down (data.js profile). */
const TERRACED = [[0.12, 0.31], [0.66, 0.86]];
/** The instanced batches the last build opened (tests). */
const OPENED = [];
export const openedBatches = () => OPENED;
// Each colour is a batch of its own: instanced() can tint copies, but r128 keeps a program compiled for tinted
// instances when the same shared finish then draws untinted ones, and fails on the missing colours.
const WALLS = [0xffffff, 0xf2d9b8], CV_COLOURS = [0xd0d4d8, 0xb33a3a, 0xf2c14e, 0x6f8fb8];

export function* buildMontmartre(scene, world) {
  const N = G.N, S = DS, dense = getPoly() === 'high';
  OPENED.length = 0;
  const batch = (make, opts) => { const b = instanced(fromBuilder(g => g.add(make())), opts); OPENED.push({ label: '', batch: b }); return b; };
  const houses = (dense ? WALLS : WALLS.slice(0, 1)).flatMap(c => { const m = plasterMat(c); return [[10, 9, 10], [14, 10, 13], [8, 8, 8]].map(([w, d, h]) => batch(() => villageHouse(w, d, h, m), { world: true })); });
  const trees = { round: batch(() => butteTree('round')), plane: batch(() => butteTree('plane')) }, wtrees = batch(() => butteTree('round'), { world: true });
  const cars = (dense ? CV_COLOURS : CV_COLOURS.slice(0, 2)).map(c => batch(() => deuxCV(c), { world: true })), sets = batch(bistroSet, { world: true }), parasols = batch(parasolProp, { world: true });
  const easels = batch(easelProp, { world: true }), vines = batch(vineStock, { world: true }), pigeons = batch(pigeonProp, { world: true });
  /** A tour group: the guide's flag up, the group gathered round, all standing at `base`, in world units. */
  const tour = (cx, cz, base, n) => {
    walker(world, cx, cz, { hat: 'flag', base, world: true, amp: 0.12 });
    for (let i = 0; i < n; i++) { const a = rand(0, 6.28), r = rand(1.6, 4.2), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; walker(world, x, z, { rotY: Math.atan2(cx - x, cz - z), hat: i % 4 === 0 ? 'press' : null, base: yAt(x, z), world: true, amp: 0.04 }); }
  };

  // the butte beyond the top of the loop, the Sacré-Cœur on its plateau
  world.add(butteMesh(grassMat()));
  yield;
  const basilica = merged(g => sacreCoeur(g, 0, 0)); basilica.name = 'montmartre:sacre-coeur'; basilica.position.set(BUTTE.x, BUTTE.top - 9.5, BUTTE.z + 10); world.add(basilica);
  yield;
  // the funicular up its south-west flank between its two stations, the rue Foyatier's steps beside it, lamps all the way up
  const fa = 0.34, B = onButte(BUTTE.rim - 3, fa), T = onButte(BUTTE.plateau + 2, fa), yB = butteY(B.x, B.z), down = Math.atan2(-Math.sin(fa), -Math.cos(fa));
  const fun = new THREE.Group(); fun.name = 'montmartre:funiculaire'; fun.position.set(B.x, yB, B.z); fun.rotation.y = Math.atan2(T.x - B.x, T.z - B.z); world.add(fun);
  funicular(fun, 0, 0, Math.hypot(T.x - B.x, T.z - B.z), butteY(T.x, T.z) - yB);
  [[BUTTE.rim + 3, false], [BUTTE.plateau - 3, true]].forEach(([r, top]) => { const p = onButte(r, fa), st = station(top); st.position.set(p.x, butteY(p.x, p.z), p.z); st.rotation.y = down; world.add(st); });
  world.add(foyatier(BUTTE.rim - 2, BUTTE.plateau, 0.2));
  for (let r = BUTTE.plateau + 6; r < BUTTE.rim; r += 18) for (const s of [-1, 1]) { const p = onButte(r, 0.2 + s * 5 / r); lamp(world, p.x, p.z, 'paris', butteY(p.x, p.z)); }
  { const p = onButte(BUTTE.rim + 12, 0.27); tour(p.x, p.z, yAt(p.x, p.z), nOf(8)); }
  yield;

  // the butte's flanks: village houses up the slopes, trees between them; its front stays open, a lawn up to the basilica
  const placed = [];
  for (let i = 0, n = 0; i < 200 && n < nOf(34); i++) {
    const ang = (i % 2 ? 1 : -1) * rand(0.62, 2.8), r = rand(BUTTE.plateau + 8, BUTTE.rim - 14), p = onButte(r, ang);
    if (placed.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 17)) continue;
    placed.push(p); n++;
    pick(houses).add(p.x, p.z, { y: butteY(p.x, p.z) - 0.4, rotY: Math.atan2(-Math.sin(ang), -Math.cos(ang)) + rand(-0.25, 0.25) });
  }
  for (let i = 0; i < nOf(46); i++) { const ang = (i % 2 ? 1 : -1) * rand(0.55, 3.1), r = rand(BUTTE.plateau + 4, BUTTE.rim - 4), p = onButte(r, ang); if (!placed.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 9)) wtrees.add(p.x, p.z, { y: butteY(p.x, p.z) - 0.2, scale: rand(0.9, 1.3), rotY: rand(0, 6.28) }); }
  yield;

  // the place du Tertre inside the top of the loop, on the level ground by the road before the bank down into the loop: its cobbles,
  // the painters' red parasols over their tables, easels round them, tourists, mimes, pigeons, the cafés on its north side
  const TX = 60, TZ = 385; world.add(cobbleSquare(124, 60, TX, TZ));
  const on = (x, z) => yAt(x, z) + 0.06, gap = dense ? 6 : 9;
  for (let x = -36; x <= 36; x += gap) for (let z = -14; z <= 14; z += gap) { const px = TX + x + rand(-1.2, 1.2), pz = TZ + z + rand(-1.2, 1.2); parasols.add(px, pz, { y: on(px, pz) }); sets.add(px, pz, { y: on(px, pz), rotY: rand(0, 6.28) }); }
  for (let i = 0, n = nOf(16); i < n; i++) {
    const a = i / n * Math.PI * 2, x = TX + Math.cos(a) * 46, z = TZ + Math.sin(a) * 22, rot = Math.atan2(TX - x, TZ - z) + Math.PI;
    easels.add(x, z, { y: on(x, z), rotY: rot }); const px = x - Math.sin(rot), pz = z - Math.cos(rot); walker(world, px, pz, { rotY: rot, base: on(px, pz), world: true, amp: 0.04 });
  }
  yield;
  for (let i = 0; i < nOf(26); i++) { const x = TX + rand(-58, 58), z = TZ + rand(-27, 27); walker(world, x, z, { hat: i % 5 === 0 ? 'press' : null, base: on(x, z), world: true }); }
  tour(TX - 50, TZ - 20, on(TX - 50, TZ - 20), nOf(8));
  for (let i = 0; i < 4; i++) { const x = TX - 30 + i * 20, z = TZ - 26; walker(world, x, z, { rotY: Math.PI, coat: 0x222222, base: on(x, z), world: true, amp: 0.35 }); }   // the mimes, in black, white-faced
  for (let i = 0; i < nOf(40); i++) { const x = TX + rand(-60, 60), z = TZ + rand(-28, 28); pigeons.add(x, z, { y: on(x, z), rotY: rand(0, 6.28) }); }
  for (let i = 0; i < nOf(16); i++) { const x = rand(-90, 90), z = rand(-450, -405); pigeons.add(x, z, { y: yAt(x, z), rotY: rand(0, 6.28) }); }
  [['LA MÈRE CATHERINE', 0xc8102e, -34], ['LE CONSULAT', 0x2f6b3a, 34]].forEach(([name, color, x]) => {
    const fx = TX + x, fz = TZ + 34; if (!isClear(fx, fz, 4)) return; const f = terraceFront(name, color, 16); f.position.set(fx, yAt(fx, fz), fz); f.rotation.y = Math.PI; world.add(f);
    for (let k = 0; k < nOf(8); k++) { const px = fx - 6 + (k % 4) * 4, pz = fz - 4 - Math.floor(k / 4) * 3.5; sets.add(px, pz, { y: on(px, pz), rotY: rand(0, 6.28) }); }
  });
  yield;
  [[-70, 146], [-88, 143], [-106, 140], [70, 146], [88, 143], [106, 140], [-12, 126], [-12, 140], [62, 120]].forEach(([x, z]) => { if (!clearAt(x, z, 10)) return; const h = merged(g => house(g, 0, 0, 12, 10, rand(8, 11), 0)); h.position.set(x, 0, z); scene.add(h); });
  yield;

  // the west side: the Lapin Agile among the vines of the Clos Montmartre, the Moulin de la Galette and the Moulin Radet, the guinguette's tables
  const la = lapinAgile(); la.position.set(-360, yAt(-360, 225), 225); la.rotation.y = -Math.PI / 2; if (isClear(-360, 225, 24)) world.add(la);
  [[-336, -6, 0], [-276, 24, 0.2], [-375, 126, -0.1], [-330, 180, 0.1]].forEach(([cx, cz, r]) => { if (!isClear(cx, cz, 20)) return; for (let row = 0; row < 4; row++) for (let c = 0; c < (dense ? 8 : 5); c++) { const lx = (c - 3.5) * 2.2, lz = (row - 1.5) * 2.4, x = cx + lx * Math.cos(r) + lz * Math.sin(r), z = cz - lx * Math.sin(r) + lz * Math.cos(r); vines.add(x, z, { y: yAt(x, z), rotY: rand(0, 6.28) }); } });
  const mill = (x, z, rot, k) => { let sails = null; const m = merged(p => { windmill(p, 0, 0, rot); sails = p.children[0].children.find(c => c.isGroup); }, o => o === sails); m.position.set(x, yAt(x, z), z); m.scale.setScalar(k); world.add(m); return m; };
  mill(-330, 60, Math.PI / 2, 1.15).name = 'montmartre:moulin-galette';
  if (isClear(-405, -30, 16)) mill(-405, -30, Math.PI / 2 + 0.4, 0.85);
  for (let i = 0; i < nOf(10); i++) { const x = -300 + rand(-14, 14), z = 92 + rand(-8, 8); sets.add(x, z, { y: yAt(x, z), rotY: rand(0, 6.28) }); }
  for (let i = 0; i < nOf(8); i++) { const x = -300 + rand(-12, 12), z = 92 + rand(-6, 6); walker(world, x, z, { base: yAt(x, z), world: true, amp: 0.3 }); }   // dancing at the guinguette
  { const x = -330, z = 255; if (isClear(x, z, 12)) tour(x, z, yAt(x, z), nOf(7)); }
  yield;

  // the foot of the butte, by the start: the carousel, the Métro, the Mur des je t'aime, the Deux Moulins' terrace
  carousel(scene, -45, -125); metroEntrance(scene, 22, -132, Math.PI); metroEntrance(scene, -140, -118, Math.PI / 2);
  if (isClear(120, -372, 14)) { const m = murJeTaime(); m.position.set(120, yAt(120, -372), -372); m.rotation.y = Math.PI; world.add(m); }
  if (isClear(180, -384, 14)) { const f = terraceFront('CAFÉ DES DEUX MOULINS', 0xd4af37, 16); f.position.set(180, yAt(180, -384), -384); f.rotation.y = Math.PI; world.add(f); for (let k = 0; k < nOf(8); k++) { const x = 174 + (k % 4) * 4, z = -390 - Math.floor(k / 4) * 3.5; sets.add(x, z, { y: yAt(x, z), rotY: rand(0, 6.28) }); } }
  { const x = 60, z = -360; if (isClear(x, z, 10)) tour(x, z, yAt(x, z), nOf(7)); }
  yield;

  // terraced streets beside the climb and the way down: stone terraces stepping with the road on its outer side, houses on them, steps up their face, lamps along their edge
  const terraces = new THREE.Group(); terraces.name = 'montmartre:terrasses'; world.add(terraces);
  for (const [fa0, fb0] of TERRACED) {
    const part = new THREE.Group();
    const ia = Math.floor(fa0 * N), ib = Math.floor(fb0 * N);
    for (let i = ia; i < ib; i += 4) {
      const s = G.samples[i], n = G.samples[i + 4], l = s.hw + 14, ln = n.hw + 14, x = s.x - s.sx * l, z = s.z - s.sz * l, xn = n.x - n.sx * ln, zn = n.z - n.sz * ln, cx = (x + xn) / 2, cz = (z + zn) / 2;
      if (!isClear(cx, cz, 13)) continue;
      const top = Math.max(s.y, n.y) + 3.5, lo = Math.min(s.y, n.y) - 1.5, rot = Math.atan2(xn - x, zn - z), len = Math.hypot(xn - x, zn - z) + 0.1;
      const b = box(14, top - lo, len, 0xbfb398, 0, 0, 0); b.position.set(cx, (top + lo) / 2, cz); b.rotation.y = rot; part.add(b);
      const rail = box(0.06, 0.06, len, 0x2f3a3a, 0, 0, 0); rail.position.set(s.x - s.sx * (s.hw + 7.3), top + 1, s.z - s.sz * (s.hw + 7.3)); rail.position.x += (xn - x) / 2; rail.position.z += (zn - z) / 2; rail.rotation.y = rot; part.add(rail);
      part.add(cyl(0.04, 0.04, 1, 0x2f3a3a, s.x - s.sx * (s.hw + 7.3), top + 0.5, s.z - s.sz * (s.hw + 7.3), 4));
      if ((i - ia) % 8 === 0) houses[((i - ia) / 8) % 3 + (dense && Math.random() < 0.5 ? 3 : 0)].add(s.x - s.sx * (s.hw + 15.5), s.z - s.sz * (s.hw + 15.5), { y: top, rotY: Math.atan2(s.sx, s.sz) });
      if ((i - ia) % 24 === 12) lamp(world, s.x - s.sx * (s.hw + 8.2), s.z - s.sz * (s.hw + 8.2), 'paris', top);
      if ((i - ia) % 24 === 0) for (let k = 0; k < 12; k++) { const st = box(1.8, (top - s.y - 0.35) * (k + 1) / 12, 0.4, 0xbfb398, 0, 0, 0), d = k * 0.4 + 1; st.position.set(s.x - s.sx * (s.hw + 6.3) + s.tx * d, s.y + 0.35 + st.geometry.parameters.height / 2, s.z - s.sz * (s.hw + 6.3) + s.tz * d); st.rotation.y = Math.atan2(s.tx, s.tz); part.add(st); }
    }
    yield;
    terraces.add(mergeGroup(part));   // merged a stretch at a time: one slice each
    yield;
  }
  yield;

  // Haussmann blocks and village houses ring the butte; the view up to the basilica stays open
  for (let a = 0; a < Math.PI * 2; a += 0.19) {
    const r = 248, x = Math.cos(a) * r, z = Math.sin(a) * r; if (z > 190 && Math.abs(x) < 110) continue; if (!clearAt(x, z, 18)) continue;
    const odd = Math.floor(a / 0.19) % 2, w = odd ? rand(16, 22) : rand(22, 30), d = odd ? rand(12, 16) : rand(16, 22), h = odd ? rand(9, 13) : rand(16, 22);
    const b = merged(g => (odd ? house : building)(g, 0, 0, w, d, h, -a + Math.PI / 2)); b.position.set(x, 0, z); scene.add(b);
  }
  yield;
  for (let a = 0.05; a < Math.PI * 2; a += 0.17) { const r = 207, x = Math.cos(a) * r, z = Math.sin(a) * r; if (z > 150 || !clearAt(x, z, 11)) continue; const w = rand(12, 16), d = rand(9, 12), h = rand(8, 12); const b = merged(g => house(g, 0, 0, w, d, h, -a + Math.PI / 2)); b.position.set(x, 0, z); scene.add(b); }
  // the village down in the hollow of the loop: lanes of houses facing each other, a tree here and there
  for (const lz of dense ? [-240, -120, 0, 120] : [-180, 60]) {
    yield;
    for (let x = -300; x <= 300; x += 15) for (const sg of [1, -1]) {
      const hx = x + rand(-1.5, 1.5), hz = lz + sg * 13; if (Math.abs(hx + 135) < 30 && hz < -330) continue;
      if (!isClear(hx, hz, 20)) continue;
      const y0 = yAt(hx, hz - 7), y1 = yAt(hx, hz + 7); if (Math.abs(y1 - y0) > 0.8) continue;   // level ground only: the hollow's rim is a bank
      if (Math.random() < 0.15) { wtrees.add(hx, hz, { y: (y0 + y1) / 2, scale: rand(0.9, 1.2), rotY: rand(0, 6.28) }); continue; }
      pick(houses).add(hx, hz, { y: Math.min(y0, y1) - 0.3, rotY: sg > 0 ? Math.PI : 0 });
    }
  }
  yield;
  for (let i = 0; i < nOf(70); i++) { const x = rand(-270, 270), z = rand(-240, 240); if (clearAt(x, z, 9) && !(Math.abs(x) < 60 && z > 70 && z < 145)) trees[Math.random() < 0.6 ? 'round' : 'plane'].add(x, z, { scale: rand(0.85, 1.25), rotY: rand(0, 6.28) }); }
  yield;

  // the streets' life: 2CVs parked along the road and in the lanes, street artists, trees along the road
  for (let i = 30; i < N; i += dense ? 70 : 120) { const s = G.samples[i], sg = (i / 10) % 2 ? 1 : -1, l = s.hw + 9, x = s.x + s.sx * sg * l, z = s.z + s.sz * sg * l; if (isClear(x, z, 7.5)) pick(cars).add(x, z, { y: yAt(x, z), rotY: Math.atan2(s.tx, s.tz) - Math.PI / 2 + (sg > 0 ? 0 : Math.PI) }); }
  [[-80, -100, 1.2], [90, -60, -0.3], [-20, 30, 1.6], [40, -90, 0.2], [-60, -40, 2.4]].forEach(([x, z, r]) => { if (clearAt(x, z, 6)) pick(cars).add(x * S, z * S, { y: yAt(x * S, z * S), rotY: r }); });
  for (let i = 0; i < nOf(6); i++) { const x = rand(-40, 40) * S, z = rand(-100, -60) * S; walker(world, x, z, { hat: 'sign', base: yAt(x, z), world: true, amp: 0.1 }); }
  for (let i = 0; i < G.N; i += 54) { const s = G.samples[i]; const sg = (i / 54) % 2 ? 1 : -1, x = s.x + s.sx * sg * (s.hw + 9), z = s.z + s.sz * sg * (s.hw + 9); if (isClear(x, z, 7)) wtrees.add(x, z, { y: yAt(x, z), scale: rand(0.9, 1.2), rotY: rand(0, 6.28) }); }
}
