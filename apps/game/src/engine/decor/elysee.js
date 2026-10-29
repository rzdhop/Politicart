// L'Élysée — Faubourg Saint-Honoré: the themed decor of this circuit (stage 7).
//
// `scene` is the scale-1 decor group that track.js spreads to the circuit's
// scale, `world` the real scene. This circuit is laid out in world units
// (metres, the road's own frame) so the palace, the blocks and the gates keep
// their proportions instead of stretching with the circuit; small street.js
// props still go through `scene` at world / DS. Inside the loop: the palace
// and its cour d'honneur on cobbles, the gate where the press waits and the
// garde républicaine stands, the garden with the presidential helicopter, the
// rue du Faubourg Saint-Honoré with its luxury shops, Place Beauvau and a
// Haussmann grid of blocks at right angles. Along the road: Haussmann blocks
// on both sides, plane trees, Wallace fountains, Morris columns, Métro
// Guimard, flower kiosks, café terraces; the banked turn is a cour pavée
// between gilded gates, the pad by the palace a red carpet, and the crossing's
// berline rides between two horsemen. At night the shop windows and some
// flats are lit (elysee-props.js kit, litWindows).
import * as THREE from 'three';

import { cone, cyl, mat, tag, textPlane } from '../primitives.js';
import { G, disposable } from '../state.js';
import { surface } from '../textures.js';
import { pick, rand } from '../util.js';
import { DS, nOf, still } from './context.js';
import { fromBuilder } from './instanced.js';
import { Merger, batch, blockClear, compact, fleuriste, groundY, haussmann, high, horseman, lineWithBlocks, litWindows, mansardGeo, paris, signMat, slab, stanchionProp, uvBox } from './elysee-props.js';
import { JACKETS, SKINS, busStop, cafe, figure, fountain, gate, hedgeWall, kiosk, metroEntrance, person, sedan } from './street.js';

/** The surface kinds (textures.js) this decor bakes, beyond the road's and the ground's: the pre-build bakes them ahead, a slice at a time. */
export const SURFACES = Object.freeze(['palace', 'cobble', 'facade', 'water', 'zinc', 'awning', 'asphalt']);

/** The luxury shops of the Faubourg: name, sign colours, awning colour; three awning styles make the twelve fronts differ. */
const LUXE = [
  ['MAISON VERNEUIL', '#111111', '#d4af37', 0x111111], ['JOAILLIER', '#1f3a5f', '#f6f1e4', 0x1f3a5f], ['HAUTE COUTURE', '#f6f1e4', '#111111', 0xe8e0d0], ['PARFUMERIE', '#5c1a33', '#f2d7a0', 0x5c1a33],
  ['MAROQUINIER', '#6b4a2b', '#f6f1e4', 0x6b4a2b], ['HORLOGER', '#0f3b2e', '#d4af37', 0x0f3b2e], ['GALERIE D’ART', '#f6f1e4', '#5c1a33', 0x9a8f7a], ['CHAPELIER', '#222222', '#f6f1e4', 0x7a1f2a],
  ['PÂTISSIER', '#e36f8a', '#fffaf0', 0xe36f8a], ['CAVISTE', '#4a1020', '#f2c14e', 0x4a1020], ['TAILLEUR', '#2f3a4a', '#f6f1e4', 0x2f3a4a], ['GANTIER', '#c8a96a', '#111111', 0xc8a96a],
];
/** A luxury shopfront into merger `M` (its frame on the block), on the block's front at local z `fz`: window, door, sign and an awning of style `n % 3`. */
function luxeFront(M, k, n, x, fz) {
  const [name, bg, fg, c] = LUXE[n % LUXE.length], style = Math.floor(n / 4) % 3;
  M.plane(8, 3.2, k.window, x - 1, 1.9, fz + 0.03);
  M.box(8.4, 0.25, 0.2, 0xd4af37, x - 1, 3.6, fz + 0.1); M.box(1.6, 3.4, 0.12, 0x2a2a2a, x + 4.4, 1.7, fz + 0.06);   // the gilt lintel, the door
  M.plane(7, 0.9, signMat(7, 0.9, name, bg, fg, 64), x, 4.5, fz + 0.12);
  if (style === 0) M.texBox(9.5, 0.1, 2.2, k.awning(c), 9.5, 2.2, x, 3.95, fz + 1.05, 0, 0.32);
  else if (style === 1) { L.makeRotationZ(Math.PI / 2).setPosition(x, 3.8, fz + 0.05); M.geo(DOME(), k.awning(c), L); }   // a domed marquise
  else { M.box(9.6, 0.18, 1.6, 0x1a1a1a, x, 4.0, fz + 0.8); M.box(9.6, 0.1, 0.1, 0xd4af37, x, 3.9, fz + 1.6); }       // a glass-and-iron canopy
  if (high()) for (const dx of [-5.2, 3.2]) { M.box(0.7, 0.7, 0.7, 0x3a3a3a, x + dx, 0.35, fz + 0.6); M.shape(CONE(), 0x2f6b3a, x + dx, 1.35, fz + 0.6); }   // potted topiaries by the door
}
const L = new THREE.Matrix4();
let dome = null, topiary = null;
const DOME = () => dome || (dome = new THREE.CylinderGeometry(1.1, 1.1, 9.4, 12, 1, true, 0, Math.PI));
const CONE = () => topiary || (topiary = new THREE.ConeGeometry(0.45, 1.3, 6));
/** The presidential helicopter on its pad: its rotor turns slowly. */
function helicopter(world, x, z) {
  const g = new THREE.Group(); g.name = 'elysee:helicoptere';
  g.add(cyl(9, 9, 0.12, 0x2f4a35, 0, 0.06, 0, high() ? 24 : 12)); g.add(slab(1.2, 0.04, 7, 0xf6f1e4, -2, 0.14, 0)); g.add(slab(1.2, 0.04, 7, 0xf6f1e4, 2, 0.14, 0)); g.add(slab(3, 0.04, 1.2, 0xf6f1e4, 0, 0.14, 0));
  const h = new THREE.Group(); h.position.set(0, 0.2, 0); g.add(h);
  h.add(slab(2.4, 2.2, 5.6, 0x1f2a5e, 0, 1.6, 0)); h.add(slab(2.2, 1.2, 1.6, 0x223344, 0, 1.9, 3.2)); h.add(slab(2.42, 0.25, 5.62, 0xf6f1e4, 0, 1.1, 0));
  const boom = cyl(0.3, 0.5, 7, 0x1f2a5e, 0, 2.1, -5.8, 8); boom.rotation.x = Math.PI / 2; h.add(boom); h.add(slab(0.15, 1.8, 1.2, 0x1f2a5e, 0, 2.8, -9.2));
  [-1.1, 1.1].forEach(sx => h.add(slab(0.12, 0.12, 5.4, 0x333333, sx, 0.1, 0.2)));
  h.add(cyl(0.2, 0.2, 0.6, 0x333333, 0, 3.0, 0, 6));
  g.position.set(x, groundY(x, z), z); g.rotation.y = 0.6; world.add(g); compact(g);
  const rotor = new THREE.Group(); rotor.name = 'elysee:rotor'; rotor.position.set(x, g.position.y + 3.55, z); rotor.add(slab(0.4, 0.06, 12, 0x2a2a2a, 0, 0, 0)); rotor.add(slab(12, 0.06, 0.4, 0x2a2a2a, 0, 0, 0)); world.add(rotor);   // turns: never folded
  G.animated.push(dt => { rotor.rotation.y += dt * 0.8; });
}

/** The palace: its body on the palace stone, the avant-corps with its columns and pediment, the zinc roof, the perron, the flags. World units; faces local +z. */
function palais(world, k, x, z, rotY) {
  const g = new THREE.Group(); g.name = 'elysee:palais';
  const ps = surface('palace'), pm = disposable(new THREE.MeshStandardMaterial({ map: ps.map, normalMap: ps.normalMap, roughness: 0.9 }));
  const W = 112, H = 17, D = 26, add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  add(uvBox(W, H, D, 10, 8.5), pm, 0, H / 2, 0); add(uvBox(28, H + 3, D + 4, 10, 10), pm, 0, (H + 3) / 2, 2);
  g.add(slab(W + 1, 1.0, D + 1, 0xd9cfb8, 0, H + 0.5, 0)); g.add(slab(29, 1.0, D + 5, 0xd9cfb8, 0, H + 3.5, 2));
  const roof = new THREE.Mesh(mansardGeo(W - 1, D - 1, 5, 2.4), k.zinc); roof.position.y = H + 1; roof.castShadow = true; g.add(roof);
  for (let i = -3; i <= 3; i++) g.add(cyl(0.7, 0.8, 12, 0xf3ead6, i * 3.6, 6 + 1.6, D / 2 + 5, high() ? 14 : 8));
  g.add(slab(28, 1.4, 4, 0xe8dcc0, 0, 14.3, D / 2 + 5)); g.add(slab(30, 1.6, 9, 0xd9cfb8, 0, 0.8, D / 2 + 5));                // the entablature and the perron
  [1.2, 0.8, 0.4].forEach((h, t) => g.add(slab(26 - t * 2, h, 1.4, 0xd9cfb8, 0, h / 2, D / 2 + 10.2 + t * 1.3)));                    // the steps down to the court
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4, 3).rotateX(-Math.PI / 2).scale(14 / 0.866, 5 / 1.5, 1), mat(0xe8dcc0)); ped.position.set(0, 15 + 5 / 3, D / 2 + 5); tag(ped); g.add(ped);   // the pediment
  g.add(cyl(0.1, 0.12, 9, 0xdddddd, 0, H + 8, 0, 6)); [0x2f55c7, 0xffffff, 0xe63946].forEach((c, i) => g.add(slab(1.3, 2.4, 0.06, c, 0.7 + i * 1.3, H + 11, 0)));
  g.add(cyl(0.1, 0.12, 8, 0xdddddd, 8, H + 7, 0, 6)); g.add(slab(3.6, 2.4, 0.06, 0x1f3a93, 9.9, H + 9.6, 0));                // the European flag beside the tricolore
  for (let i = -5; i <= 5; i++) if (Math.abs(i) > 1) g.add(slab(1.3, 2.4, 0.9, 0xb5795c, i * 9, H + 6, -2));                    // chimney stacks
  g.position.set(x, groundY(x, z), z); g.rotation.y = rotY; world.add(g); compact(g);
  return g;
}

export function* buildElysee(scene, world) {
  const P = paris(scene, world), { k, fp, s1, tree, spot, photographer, plain, flat, bollards, lamps, benches, wallaces, morris, pigeons, vauban, berlines } = P, hw = G.hw, N = G.N;

  // ---- the palace, its cour d'honneur and its wings (world units, inside the loop) ----
  const PZ = 222, CZ0 = 12, CZ1 = 204;
  fp.add({ x: 0, z: (CZ0 + 352) / 2, w: 300, d: 352 - CZ0 + 12, rotY: 0 });   // the palace, its court and its garden
  palais(world, k, 0, PZ, Math.PI);
  const court = new THREE.Group(); court.name = 'elysee:cour-honneur';
  const pav = flat(court, 104, CZ1 - CZ0, 0, (CZ0 + CZ1) / 2, k.cobble); const uv = pav.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 104 / 5, uv.getY(i) * (CZ1 - CZ0) / 5);
  flat(court, 4.2, CZ1 - CZ0 - 6, 0, (CZ0 + CZ1) / 2 + 3, plain(0xa3121f, 1), 0.06);                                                 // the red carpet to the perron
  const ws = surface('palace'), wm = disposable(new THREE.MeshStandardMaterial({ map: ws.map, normalMap: ws.normalMap, roughness: 0.9 }));
  [-58, 58].forEach(x => { const wing = new THREE.Mesh(uvBox(14, 12, CZ1 - CZ0 - 6, 10, 6), wm); wing.position.set(x, 6, (CZ0 + CZ1) / 2); wing.castShadow = wing.receiveShadow = true; court.add(wing); const r = new THREE.Mesh(mansardGeo(14, CZ1 - CZ0 - 6, 3.6, 1.6), k.zinc); r.position.set(x, 12, (CZ0 + CZ1) / 2); court.add(r); });
  [-36.1, 36.1].forEach(x => { court.add(slab(46, 6, 1.6, 0xe6dcc6, x, 3, 9)); court.add(slab(46.6, 0.5, 2, 0xd9cfb8, x, 6.2, 9)); });   // the wall on the Faubourg
  world.add(court); compact(court);
  gate(world, 0, 9, 0, 24);
  const guards = new THREE.Group(); guards.name = 'elysee:garde';
  [-15, 15].forEach(x => { const gd = figure(0x1f2a5e, pick(SKINS), 'guard'); gd.position.set(x, 0, 7.2); gd.rotation.y = Math.PI; guards.add(gd); });
  [-20, 20].forEach(x => { const h = horseman(x < 0 ? 0x4a2e1a : 0x2a1a10); h.position.set(x, 0, 4.4); h.rotation.y = Math.PI / 2; guards.add(h); });
  [[-6, 120], [6, 120]].forEach(([x, z]) => { const gd = figure(0x1f2a5e, pick(SKINS), 'guard'); gd.position.set(x, 0, z); guards.add(gd); });
  world.add(guards); compact(guards);
  [[-30, 60, 0.3], [-16, 92, 0.1], [26, 70, -0.2], [14, 140, 0.4], [-24, 160, 1.6], [28, 176, 1.5]].forEach(([x, z, r]) => berlines.add(x, z, { y: groundY(x, z), rotY: r }));
  for (let z = 30; z < CZ1 - 10; z += high() ? 16 : 32) [-46, 46].forEach(x => tree('curtain', x, z));
  yield;

  // ---- the garden behind the palace: lawn, fountain, hedges, the helicopter ----
  const garden = new THREE.Group(); garden.name = 'elysee:jardin';
  flat(garden, 300, 104, 0, 300, plain(0x5f9a48), 0.025);
  [-60, 60].forEach(x => { hedgeWall(garden, x, 268, 70, 1.2, 1.6); hedgeWall(garden, x, 330, 70, 1.2, 1.6); });
  flat(garden, 8, 100, 0, 300, plain(0xcbb98a), 0.035); flat(garden, 280, 6, 0, 298, plain(0xcbb98a), 0.035);
  world.add(garden); compact(garden);
  fountain(scene, s1(0), s1(298), 7, 1, false);
  helicopter(world, 90, 315);
  for (let x = -140; x <= 140; x += high() ? 20 : 40) { tree('chestnut', x, 252 + rand(-2, 2)); tree('chestnut', x, 346 + rand(-2, 2)); }
  for (let i = 0; i < 12; i++) benches.add(-120 + i * 22, 262, { y: 0 });
  yield;

  // ---- the rue du Faubourg Saint-Honoré: street, pavements, luxury shops facing the gate, ordinary blocks along the palace ----
  const fb = new THREE.Group(); fb.name = 'elysee:faubourg';
  const am = new THREE.MeshStandardMaterial({ map: surface('asphalt').map, roughness: 1 });
  const st = flat(fb, 780, 16, 0, -6, am, 0.03); const su = st.geometry.attributes.uv; for (let i = 0; i < su.count; i++) su.setXY(i, su.getX(i) * 780 / 20, su.getY(i));
  const FM = new Merger().at(0, 0, 0);
  FM.box(780, 0.16, 5.5, 0x9a9a92, 0, 0.08, -16.75); FM.box(780, 0.16, 5.5, 0x9a9a92, 0, 0.08, 4.75);
  for (let x = -380; x < 380; x += 9) FM.box(3, 0.02, 0.18, 0xf6f1e4, x, 0.045, -6);                                              // the centre line
  fp.add({ x: 0, z: -6, w: 800, d: 34, rotY: 0 });
  let shop = 0;
  for (let x = -342; x < 342; x += 38) {
    if (Math.abs(x + 19) < 40) continue;   // Place Beauvau, opposite the gate
    const d = 22; haussmann(FM, k, x + 19, 0, -19.5 - d / 2, 38, d, rand(19, 23), 0, { shops: false, tint: shop % 3 });
    for (const dx of [-12.5, 0, 12.5]) luxeFront(FM, k, shop++, dx, d / 2);
    fp.add({ x: x + 19, z: -19.5 - d / 2, w: 38, d, rotY: 0 });
  }
  yield;
  for (const x0 of [-342, 68]) for (let x = x0; x < x0 + 274; x += 46) { const d = 22; haussmann(FM, k, x + 23, 0, 7.5 + d / 2, 46, d, rand(19, 23), Math.PI); fp.add({ x: x + 23, z: 7.5 + d / 2, w: 46, d, rotY: Math.PI }); }
  world.add(still(FM.into(fb)));
  yield;
  // its street life: lamps, bollards, Wallace fountains, Morris columns, the Métro, a bus stop, cafés, a kiosk, flower kiosks, the press at the gate
  for (let x = -370; x <= 370; x += high() ? 26 : 52) { lamps.add(x, -18.6); lamps.add(x + 13, 6.6, { rotY: Math.PI }); }
  for (let x = -376; x <= 376; x += high() ? 4 : 8) if (Math.abs(x) > 14) { bollards.add(x, -14.3); bollards.add(x, 2.3); }
  [[-150, -18], [210, -18], [-260, 6]].forEach(([x, z]) => wallaces.add(x, z, { y: 0 }));
  [[-96, -18.3], [170, -18.3], [130, 6.3], [-300, 6.3]].forEach(([x, z]) => morris.add(x, z, { y: 0 }));
  metroEntrance(scene, s1(-230), s1(-17.5), 0); busStop(scene, s1(60), s1(-17.4), Math.PI); kiosk(scene, s1(-60), s1(5.5), 0x2e8b57, 'PRESSE', Math.PI);
  cafe(scene, s1(-120), s1(-17), Math.PI, 'CAFÉ DU FAUBOURG', 0xc8102e, 3); cafe(scene, s1(250), s1(-17), Math.PI, 'LE MARIGNY', 0x1f3a93, 3);
  [[-190, 4.8, Math.PI], [96, -18.2, 0]].forEach(([x, z, r]) => { const f = fleuriste(x, z, r); world.add(f); compact(f); });
  [[-330, -12.2, 0], [-300, -12.2, 0], [300, 0.2, Math.PI], [330, 0.2, Math.PI], [-80, 0.2, Math.PI], [140, -12.2, 0]].forEach(([x, z, r]) => berlines.add(x, z, { y: 0, rotY: r }));
  yield;
  const press = new THREE.Group(); press.name = 'elysee:presse';
  for (let i = 0; i < 16; i++) photographer(press, rand(-13, 13), rand(2.6, 6.0), rand(-0.3, 0.3));
  for (let x = -14; x <= 14; x += 2.4) vauban.add(x, 1.4, { y: 0 });
  press.add(slab(1.1, 0.7, 0.5, 0x222222, -16, 1.6, 4)); [[-0.3, -0.3], [0.3, -0.3], [0, 0.35]].forEach(([dx, dz]) => press.add(cyl(0.03, 0.03, 1.5, 0x333333, -16 + dx, 0.75, 4 + dz, 4)));   // a TV camera on its tripod
  const van = new THREE.Group(); van.add(slab(6, 2.6, 2.4, 0xf6f1e4, 0, 1.7, 0)); van.add(slab(1.6, 1.6, 2.3, 0xf6f1e4, 3.6, 1.2, 0)); van.add(cyl(1.0, 0.3, 0.4, 0xdddddd, -1, 3.4, 0, 10)); van.add(slab(6.02, 0.5, 2.42, 0xc8102e, 0, 1.2, 0)); van.position.set(34, 0, -1.5); press.add(van);
  world.add(press); compact(press);
  yield;
  for (let i = 0; i < nOf(26); i++) { const z = pick([rand(-19, -15), rand(2.5, 7)]); person(scene, s1(rand(-360, 360)), s1(z), rand(0, 6.28), null, 0.05); }
  for (let i = 0; i < nOf(40); i++) pigeons.add(rand(-300, 300), pick([rand(-18, -15), rand(3, 7)]), { y: 0.16, rotY: rand(0, 6.28) });
  yield;

  // ---- Place Beauvau, opposite the gate: the square, the ministry behind its gate, police vans and panels ----
  const beauvau = new THREE.Group(); beauvau.name = 'elysee:beauvau';
  flat(beauvau, 72, 30, 0, -34.5, plain(0x9a958c), 0.035);
  beauvau.add(haussmann(new Merger(), k, 0, 0, -61, 64, 22, 18, 0, { shops: false, tint: 0 }).into(new THREE.Group())); gate(beauvau, 0, -49.6, 0, 18);
  fp.add({ x: 0, z: -50, w: 80, d: 60, rotY: 0 });
  for (let i = 0; i < 3; i++) { const v = new THREE.Group(); v.add(slab(5.6, 2.5, 2.3, 0xf6f1e4, 0, 1.55, 0)); v.add(slab(5.62, 0.6, 2.32, 0x1f3a93, 0, 1.6, 0)); v.add(slab(1.4, 1.3, 2.2, 0xf6f1e4, 3.4, 1.2, 0)); v.add(slab(0.4, 0.2, 1.2, 0x2f55c7, 0, 2.9, 0)); [[-2, 1.15], [2, 1.15], [-2, -1.15], [2, -1.15]].forEach(([wx, wz]) => { const w = cyl(0.42, 0.42, 0.3, 0x1a1a1a, wx, 0.42, wz, 8); w.rotation.x = Math.PI / 2; v.add(w); }); v.position.set(-20 + i * 20, 0, -30 - (i % 2) * 8); v.rotation.y = 0.1 * (i - 1); beauvau.add(v); }
  world.add(beauvau); compact(beauvau);
  for (let x = -30; x <= 30; x += 2.6) vauban.add(x, -21.5, { y: 0 });
  yield;

  // ---- Haussmann blocks along both sides of the road, then the grid of blocks inside the loop ----
  const along = yield* lineWithBlocks(world, k, fp, 'elysee:haussmann', { sectors: 8 });
  yield;
  const grid = [], quads = [0, 1, 2, 3].map(() => new Merger()), AM = new Merger().at(0, 0, 0);
  let tried = 0;
  for (let gx = -440; gx <= 440; gx += 82) for (let gz = -420; gz <= 420; gz += 74) {
    const w = 64, d = 56, f = { x: gx, z: gz, w, d, rotY: 0 };
    if (++tried % 12 === 0) yield;
    if (!fp.free(f, 6) || !blockClear(gx, gz, w + 10, d + 10, 0, 14)) continue;
    fp.add(f); grid.push(f);
    if (Math.random() < 0.12) { AM.box(w + 4, 0.04, d + 4, 0x6f9a55, gx, 0.02, gz); for (const [dx, dz] of [[-20, -16], [20, -16], [-20, 16], [20, 16], [0, 0]]) tree(pick(['plane', 'chestnut']), gx + dx, gz + dz); benches.add(gx, gz - 8, { y: 0 }); continue; }   // a square
    AM.box(w + 18, 0.04, d + 18, 0x8a877f, gx, 0.01, gz);                                                                            // its streets
    haussmann(quads[(gx > 0 ? 1 : 0) + (gz > 0 ? 2 : 0)], k, gx, 0, gz, w, d, rand(20, 25), Math.random() < 0.5 ? 0 : Math.PI, { detail: false, shops: Math.random() < 0.4 });   // behind the blocks on the road: plainer
  }
  const streets = new THREE.Group(); streets.name = 'elysee:rues'; world.add(still(AM.into(streets)));
  for (const [i, M] of quads.entries()) { if (!M.buckets.size) continue; const g = new THREE.Group(); g.name = 'elysee:ilots:' + i; world.add(still(M.into(g))); yield; }
  litWindows([...along, ...grid]);
  yield;

  // ---- the road's own street life: plane trees on both pavements, Wallace fountains, Morris columns, benches, the Métro, cafés, flower kiosks, pigeons ----
  yield* P.roadside({ cafes: [[0.21, 'BRASSERIE DE L’ÉLYSÉE', 0x5c1a33], [0.67, 'AU BON COIN', 0x2e5d3a], [0.92, 'CAFÉ DE LA RÉPUBLIQUE', 0x1f3a93]], metro: [0.15, 0.55, 0.83], fleurs: [0.28, 0.72] });

  // ---- the banked turn as a cour pavée: cobbles on the road and the pavements, gilded gates at both ends, guards, bollards ----
  const bank = (G.layout?.features || []).find(f => f.t === 'bank');
  if (bank) {
    const i0 = Math.floor(bank.f * N), len = bank.len || 60, cour = new THREE.Group(); cour.name = 'elysee:cour-pavee';
    const pavers = new THREE.Mesh(roadRibbon(i0, len, s => -(s.hw - 1.1), s => s.hw - 4.8, 0.06), new THREE.MeshStandardMaterial({ map: surface('cobble').map, normalMap: surface('cobble').normalMap, roughness: 1, color: 0xb8b0a4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    pavers.name = 'elysee:cour-pavee:pavers'; pavers.receiveShadow = true; world.add(pavers);
    for (const sg of [1, -1]) { const apron = new THREE.Mesh(roadRibbon(i0, len, s => sg * (s.hw + 0.9), s => sg * (s.hw + 6), 0.36), k.cobble); apron.receiveShadow = true; cour.add(apron); }
    for (const at of [i0 - 2, i0 + len + 2]) for (const sg of [1, -1]) {
      const p = spot(at, sg, 3.2), y = p.y;
      cour.add(slab(2.4, 8, 2.4, 0xe6dcc6, p.x, y + 4, p.z, p.face)); cour.add(slab(2.8, 0.6, 2.8, 0xd9cfb8, p.x, y + 8.3, p.z, p.face));
      const urn = cyl(0.7, 0.4, 1.4, 0xd4af37, p.x, y + 9.3, p.z, high() ? 12 : 6); cour.add(urn);
    }
    { const a = spot(i0 - 2, 1, 3.2), b = spot(i0 - 2, -1, 3.2), y = groundY(a.x, a.z), L = Math.hypot(a.x - b.x, a.z - b.z), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ry = Math.atan2(b.z - a.z, a.x - b.x);
      cour.add(slab(L, 0.5, 0.4, 0x1a1a1a, mx, y + 12, mz, ry)); cour.add(slab(L, 0.25, 0.5, 0xd4af37, mx, y + 12.4, mz, ry));
      for (let t = -0.45; t <= 0.45; t += 0.05) cour.add(slab(0.08, 1.6, 0.08, 0x1a1a1a, mx + Math.cos(ry) * L * t, y + 11.1, mz - Math.sin(ry) * L * t, ry));
      const sg = textPlane(9, 1.2, 'COUR D’HONNEUR', '#1a1a1a', '#d4af37', 70); sg.position.set(mx, y + 13.4, mz); sg.rotation.y = ry; cour.add(sg); }
    for (let rel = 0; rel < len; rel += 10) for (const sg of [1, -1]) { const p = spot(i0 + rel, sg, 2.6); const gd = figure(0x1f2a5e, pick(SKINS), 'guard'); gd.position.set(p.x, p.y, p.z); gd.rotation.y = p.face; cour.add(gd); }
    for (let rel = -2; rel <= len + 2; rel += 2) for (const sg of [1, -1]) { const p = spot(i0 + rel, sg, 6.4); bollards.add(p.x, p.z, { y: p.y }); }
    world.add(cour); compact(cour);
  }
  yield;

  // ---- the red carpet: the pad nearest the palace, between brass stanchions, ushers and photographers ----
  const pad = G.pads.reduce((best, p) => { const s = G.samples[p.i0]; const d = Math.hypot(s.x, s.z - PZ); return !best || d < best.d ? { p, d } : best; }, null)?.p;
  if (pad) {
    const tapis = new THREE.Group(); tapis.name = 'elysee:tapis-rouge';
    const carpet = new THREE.Mesh(roadRibbon(pad.i0 - 4, 11, s => -(s.hw - 1.6), s => s.hw - 1.6, 0.075), new THREE.MeshStandardMaterial({ color: 0xa3121f, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    carpet.name = 'elysee:tapis-rouge:carpet'; carpet.receiveShadow = true; world.add(carpet);
    const stanchions = batch(stanchionProp, { world: true });
    for (const sg of [1, -1]) {
      for (let rel = -4; rel <= 7; rel += 2) { const p = spot(pad.i0 + rel, sg, 1.8), y = p.y; stanchions.add(p.x, p.z, { y }); if (rel < 7) { const q = spot(pad.i0 + rel + 2, sg, 1.8); tapis.add(slab(Math.hypot(q.x - p.x, q.z - p.z), 0.06, 0.06, 0xa3121f, (p.x + q.x) / 2, y + 0.85, (p.z + q.z) / 2, Math.atan2(-(q.z - p.z), q.x - p.x))); } }
      const u = spot(pad.i0 + 9, sg, 2.6), us = figure(0x111111, pick(SKINS), null); us.position.set(u.x, u.y, u.z); us.rotation.y = u.face; tapis.add(us);
      for (let n = 0; n < 4; n++) { const p = spot(pad.i0 - 3 + n * 3, sg, 3.6 + rand(0, 1.2)); photographer(tapis, p.x, p.z, p.face + rand(-0.4, 0.4), p.y); }
    }
    world.add(tapis); compact(tapis);
  }
  yield;

  // ---- the crossing: the berline rides between two horsemen, the press waits on both pavements ----
  const cr = G.crossings[0];
  if (cr) {
    const escort = new THREE.Group(); escort.name = 'elysee:escorte';
    [1.9, -1.9].forEach((dz, i) => { const h = horseman(i ? 0x2a1a10 : 0x4a2e1a); h.position.set(0, 0, dz); h.rotation.y = -Math.PI / 2; h.scale.setScalar(0.95); escort.add(h); });
    cr.mesh.add(escort); compact(escort);   // inside the car's hit radius: the escort rides where the cortège already strikes
    const s = cr.s, side = new THREE.Group(); side.name = 'elysee:presse-carrefour';
    for (const sg of [1, -1]) for (let n = 0; n < 4; n++) { const lat = sg * (s.hw + 3 + rand(0, 2)), along = rand(-12, -6) * (n % 2 ? 1 : -1); photographer(side, s.x + s.sx * lat + s.tx * along, s.z + s.sz * lat + s.tz * along, Math.atan2(-s.sx * sg, -s.sz * sg) + rand(-0.3, 0.3), s.y + 0.35); }
    for (let i = 0; i < nOf(8); i++) { const sg = i % 2 ? 1 : -1; const f = figure(pick(JACKETS), pick(SKINS), null); f.position.set(s.x + s.sx * sg * (hw + 2.5 + rand(0, 2)) + s.tx * rand(-3, 3), s.y, s.z + s.sz * sg * (hw + 2.5 + rand(0, 2)) + s.tz * rand(-3, 3)); f.rotation.y = Math.atan2(-s.sx * sg, -s.sz * sg); side.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: 0.08, base: s.y }); }
    world.add(side); compact(side);
  }
  // ---- a one-way narrow street where the layout pinches the road: the signs, bollards along the pinched kerb ----
  for (const f of (G.layout?.features || []).filter(x => x.t === 'narrow')) {
    const i0 = Math.floor(f.f * N), sens = new THREE.Group(); sens.name = 'elysee:sens-unique';
    for (const at of [i0, i0 + (f.len || 6)]) for (const sg of [1, -1]) { const p = spot(at, sg, 3), y = p.y; sens.add(cyl(0.05, 0.05, 2.8, 0x555555, p.x, y + 1.4, p.z, 5)); const sg2 = textPlane(1.8, 0.6, 'SENS UNIQUE', '#1f3a93', '#fff', 80); sg2.position.set(p.x, y + 2.9, p.z); sg2.rotation.y = p.face; sens.add(sg2); }
    world.add(sens); compact(sens);
    for (let rel = 0; rel < (f.len || 6); rel += 2) for (const sg of [1, -1]) { const p = spot(i0 + rel, sg, 6.4); bollards.add(p.x, p.z, { y: p.y }); }
  }
  P.finish();
}

/**
 * A ribbon over samples i0..i0+len between the lateral offsets `from(s)` and
 * `to(s)` (metres from the centre line, +1 the left side), `dy` over the
 * road's surface there, camber included; its uvs a texture tile every 3 m.
 * The cobbles of the cour pavée and the red carpet lie on the road with it.
 */
function roadRibbon(i0, len, from, to, dy) {
  const N = G.N, p = [], uv = [], ix = [];
  let dist = 0;
  for (let rel = 0; rel <= len; rel++) {
    const s = G.samples[(i0 + rel + N) % N], prev = G.samples[(i0 + rel - 1 + N) % N];
    if (rel) dist += Math.hypot(s.x - prev.x, s.z - prev.z);
    const a = from(s), b = to(s), l0 = Math.min(a, b), l1 = Math.max(a, b);
    for (const l of [l0, l1]) p.push(s.x + s.sx * l, s.y + l * s.bank + dy, s.z + s.sz * l);
    uv.push(l0 / 3, dist / 3, l1 / 3, dist / 3);
  }
  for (let r = 0; r < len; r++) { const q = r * 2; ix.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals();
  return g;
}
