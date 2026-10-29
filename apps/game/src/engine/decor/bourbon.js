// Palais Bourbon — Quais de Seine: the themed decor of this circuit (stage 7).
//
// `scene` is the scale-1 decor group that track.js spreads to the circuit's
// scale, `world` the real scene. Like the Élysée, this circuit is laid out in
// world units (elysee-props.js): the Assemblée nationale's colonnade faces
// the quai on the axis of the Pont de la Concorde, the obélisque and its two
// fountains stand across the Seine, and the river runs the whole width of
// the map below the parapet of the quai, where the bouquinistes' green boxes
// line the wall, Paris Plages lays out its sand, parasols and deckchairs,
// and péniches lie moored at random spots. A bateau-mouche and a Batobus
// cross the river with their wakes. On the road, the two humps of the
// profile are dressed as bridges (balustrades, lamps that light at dusk,
// pylons with gilded statues), the quai's straight dives into a short
// tunnel under the upper promenade with a band of haze inside, and
// Haussmann blocks line both sides wherever the river is not.
import * as THREE from 'three';

import { cone, cyl, mat, textPlane } from '../primitives.js';
import { finishOf } from '../geo.js';
import { G, disposable } from '../state.js';
import { TEX, surface } from '../textures.js';
import { pick, rand } from '../util.js';
import { nOf, still } from './context.js';
import { Merger, batch, blockClear, clear, compact, groundY, haussmann, high, lineWithBlocks, litWindows, paris, slab, statueInto } from './elysee-props.js';
import { JACKETS, SKINS, cafe, figure, kiosk, person } from './street.js';

/** The surface kinds (textures.js) this decor bakes, beyond the road's and the ground's: the pre-build bakes them ahead, a slice at a time. */
export const SURFACES = Object.freeze(['water', 'facade', 'palace', 'zinc', 'awning', 'cobble']);

/** The quai's parapet, the far bank's, and the river between them (world z). */
const QZ = -369, FZ = -557;
/** The Assemblée's and the Concorde's axis, and the Pont Alexandre-III's (world x). */
const AX = 180, PX = -450;

/** A bouquiniste's box against the parapet: green, its lid open on the books (or shut). Faces local +z. */
const bouquinisteProp = open => () => {
  const g = new THREE.Group(); g.add(slab(2.2, 0.9, 0.9, 0x2f5f32, 0, 1.55, 0)); g.add(slab(2.3, 0.08, 1.0, 0x244a28, 0, 2.02, 0));
  if (open) { const lid = slab(2.2, 0.07, 0.9, 0x2f5f32, 0, 2.42, -0.62); lid.rotation.x = -1.1; g.add(lid); for (let i = 0; i < 6; i += high() ? 1 : 2) g.add(slab(high() ? 0.3 : 0.64, 0.42, 0.7, pick([0xc8102e, 0xf2c14e, 0x1f3a93, 0xf6f1e4, 0x6b4a2b, 0x2e8b57]), -0.85 + i * 0.34 + (high() ? 0 : 0.17), 2.27, 0)); }
  else g.add(slab(2.2, 0.32, 0.9, 0x2f5f32, 0, 2.2, 0));
  return g;
};
/** A parasol of Paris Plages: a pole and a striped cone. */
const parasolProp = color => () => { const g = new THREE.Group(); g.add(cyl(0.04, 0.04, 2.6, 0xdddddd, 0, 1.3, 0, 5)); g.add(cone(1.7, 0.7, color, 0, 2.6, 0, high() ? 10 : 6)); return g; };
/** A deckchair: a wooden frame and its striped cloth, tilted back. Faces local +z. */
const transatProp = color => () => { const g = new THREE.Group(); [-0.3, 0.3].forEach(x => { g.add(slab(0.05, 0.05, 1.5, 0x8b5a2b, x, 0.3, 0)); }); const c = slab(0.6, 0.03, 1.4, color, 0, 0.45, -0.1); c.rotation.x = -0.5; g.add(c); return g; };

/** A péniche moored at world (x, z), bow on local +x: hull, wheelhouse, a tarp, flower pots, a lifebuoy, a bicycle on deck. */
function peniche(x, z, rotY, y) {
  const c = pick([0x2f5f32, 0x8a2b2b, 0x1f3a93, 0x3a3a3a, 0x6b4a2b]), M = new Merger().at(x, y, z, rotY);
  M.box(28, 1.8, 6.2, c, 0, 0.6, 0); M.box(28.2, 0.3, 6.4, 0xf6f1e4, 0, 1.55, 0); M.shape(BOW(), c, 15.6, 0.6, 0);
  M.box(6, 2.6, 5, 0xf6f1e4, -9, 2.9, 0); M.box(6.4, 0.3, 5.4, pick([0x8a2b2b, 0x2f5f32, 0x1f3a93]), -9, 4.3, 0); M.box(6.02, 0.8, 5.02, 0x223344, -9, 3.4, 0);
  M.box(14, 0.8, 5.6, pick([0x444444, 0x5a6a4a, 0x7a5a3a]), 3, 2.0, 0);
  for (let i = 0; i < 5; i++) { M.box(0.5, 0.4, 0.5, 0xb5795c, -4 + i * 2.4, 1.9, 2.6); M.box(0.6, 0.5, 0.6, pick([0xe63946, 0xf2c14e, 0x5d9a4a, 0xe36f8a]), -4 + i * 2.4, 2.35, 2.6); }
  M.shape(RING(), 0xffffff, -12.5, 2.6, 2.7);
  M.box(1.6, 0.05, 0.05, 0x1f3a93, 10, 2.2, -2.4); for (const wx of [9.3, 10.7]) M.shape(WHEEL(), 0x222222, wx, 2.05, -2.4);
  const g = M.into(new THREE.Group()); g.name = 'bourbon:peniche';
  return still(g);
}
let bow = null, ring = null, wheel = null;
const BOW = () => bow || (bow = new THREE.ConeGeometry(3.1, 3.4, 4).rotateZ(-Math.PI / 2));
const RING = () => ring || (ring = new THREE.CylinderGeometry(0.45, 0.45, 0.08, 10).rotateX(Math.PI / 2));
const WHEEL = () => wheel || (wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.04, 10).rotateX(Math.PI / 2));

/** A river boat: the long glazed bateau-mouche or the Batobus, its wake trailing on the water. Bow on local +x; returns the group (it moves as a whole). */
function riverBoat(kind) {
  const L = kind === 'batobus' ? 20 : 32, hull = kind === 'batobus' ? 0x1f3a5f : 0xf6f1e4, M = new Merger().at(0, 0, 0);
  M.box(L, 1.6, 6.6, hull, 0, 0.6, 0); M.box(L + 0.2, 0.4, 6.7, kind === 'batobus' ? 0xf2c14e : 0x1f2a5e, 0, 0.9, 0); M.geo(new THREE.ConeGeometry(3.3, 4.5, 4).rotateZ(-Math.PI / 2), finishOf(mat(hull)), new THREE.Matrix4().makeTranslation(L / 2 + 2.2, 0.6, 0), hull);
  M.shape(new THREE.BoxGeometry(L - 6, 2.2, 6), 0, -1, 2.5, 0, 0, 1, new THREE.MeshStandardMaterial({ color: 0x9fd0e8, roughness: 0.1, metalness: 0.3 }));
  M.box(L - 5, 0.25, 6.3, 0xffffff, -1, 3.7, 0);
  for (let x = -L / 2 + 4; x < L / 2 - 4; x += 2.4) M.box(0.12, 2.2, 6.05, 0xffffff, x, 2.5, 0);
  if (kind !== 'batobus') {
    for (let x = -L / 2 + 5; x < L / 2 - 6; x += high() ? 1.2 : 2.4) for (const z of [-2, -0.7, 0.7, 2]) { if (Math.random() < 0.3) continue; M.box(0.45, 0.6, 0.4, pick(JACKETS), x, 4.15, z); M.box(0.3, 0.3, 0.3, pick(SKINS), x, 4.62, z); }
    for (const sz of [-1, 1]) M.box(L - 6, 0.06, 0.06, 0xdddddd, -1, 4.6, sz * 3.1);
    [0x2f55c7, 0xffffff, 0xe63946].forEach((c, i) => M.box(0.05, 0.6, 0.4, c, -L / 2 + 0.3, 2.6, -0.4 + i * 0.4));
  }
  const g = M.into(new THREE.Group()); g.name = 'bourbon:' + kind; still(g);
  // the wake: two pale strips spreading behind the stern, foam at the bow (unlit, translucent)
  const foam = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }), p = [], ix = [];
  for (const s of [1, -1]) { const n = p.length / 3; p.push(-L / 2, 0.12, s * 2.6, -L / 2, 0.12, s * 3.6, -L / 2 - 46, 0.12, s * 13, -L / 2 - 46, 0.12, s * 9.5); ix.push(...(s > 0 ? [n, n + 2, n + 1, n, n + 3, n + 2] : [n, n + 1, n + 2, n, n + 2, n + 3])); }
  for (const s of [1, -1]) { const n = p.length / 3; p.push(L / 2 + 4.3, 0.12, 0, L / 2 - 2, 0.12, s * 4.4, L / 2 - 8, 0.12, s * 5.6); ix.push(...(s > 0 ? [n, n + 2, n + 1] : [n, n + 1, n + 2])); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); wg.setIndex(ix); wg.computeVertexNormals();
  const wake = new THREE.Mesh(wg, foam); wake.name = 'wake'; g.add(wake);
  return g;
}

/** The Assemblée nationale: the stone body, the portico of twelve columns under its pediment, the wide steps, the statues, the flag. World units; faces local +z. */
function assemblee(k) {
  const g = new THREE.Group(); g.name = 'bourbon:assemblee';
  const ps = surface('palace'), pm = disposable(new THREE.MeshStandardMaterial({ map: ps.map, normalMap: ps.normalMap, roughness: 0.9 })), M = new Merger().at(0, 0, 0);
  M.texBox(100, 20, 44, pm, 10, 10, 0, 10, 0); M.texBox(40, 16, 30, pm, 10, 10, -62, 8, -4); M.texBox(40, 16, 30, pm, 10, 10, 62, 8, -4);                // the body and its wings
  M.box(101, 1.2, 45, 0xd9cfb8, 0, 20.6, 0); M.box(96, 1.6, 40, 0x6b6f78, 0, 21.8, 0);
  M.box(72, 3, 16, 0xd9cfb8, 0, 1.5, 30);                                                                              // the stylobate
  const col = new THREE.CylinderGeometry(1.0, 1.15, 17, high() ? 16 : 8);
  for (let i = 0; i < 12; i++) M.shape(col, 0xf3ead6, -30.25 + i * 5.5, 3 + 8.5, 33);
  M.box(68, 2.6, 8, 0xe8dcc0, 0, 21.3, 32); M.box(70, 0.6, 9, 0xd9cfb8, 0, 22.9, 32);                                // the entablature
  const ped = new THREE.CylinderGeometry(1, 1, 6, 3).rotateX(-Math.PI / 2).scale(35 / 0.866, 9 / 1.5, 1);
  M.shape(ped, 0xe8dcc0, 0, 23.2 + 3, 33);                                                                               // the pediment
  M.box(40, 5, 0.6, 0xd2c6ac, 0, 25.4, 35.6);                                                                            // its tympanum
  for (let t = 0; t < 5; t++) { const h = 2.5 - t * 0.5; M.box(64 - t * 1.5, h, 1.6, 0xd9cfb8, 0, h / 2, 38.8 + t * 1.6); }   // the steps down to the quai
  M.plane(30, 1.4, textPlane(30, 1.4, 'ASSEMBLÉE NATIONALE', '#e8dcc0', '#3a3a3a', 64).material, 0, 21.3, 36.05);
  for (const x of [-40, -24, 24, 40]) { M.box(3.4, 3.4, 3.4, 0xcfc6b5, x, 1.7, 52); }                                  // the pedestals of the four statesmen
  for (const x of [-38, 38]) M.box(4, 6, 4, 0xcfc6b5, x, 3, 40);                                                         // Athena's and Themis's
  for (let x = -60; x <= 60; x += 1.4) if (Math.abs(x) > 8) { M.box(0.08, 2.6, 0.08, 0x1a1a1a, x, 1.3, 60); M.box(0.14, 0.3, 0.14, 0xd4af37, x, 2.7, 60); }   // the gilded railing
  M.box(120, 0.12, 0.12, 0x1a1a1a, 0, 2.2, 60); M.box(120, 0.12, 0.12, 0x1a1a1a, 0, 0.5, 60);
  M.box(0.2, 12, 0.2, 0xdddddd, 0, 29, 0); [0x2f55c7, 0xffffff, 0xe63946].forEach((c, i) => M.box(1.5, 2.8, 0.06, c, 0.8 + i * 1.5, 33.4, 0));
  for (const x of [-40, -24, 24, 40]) statueInto(M, x, 3.4, 52, 1.5);
  for (const x of [-38, 38]) statueInto(M, x, 6, 40, 2.2);
  M.into(g);
  return still(g);
}

export function* buildBourbon(scene, world) {
  const P = paris(scene, world), { k, fp, s1, tree, spot, photographer, plain, flat, lamps, benches, pigeons } = P, N = G.N;
  const T0 = Math.floor(0.068 * N), T1 = Math.floor(0.104 * N);   // the tunnel under the upper quai
  const inTunnel = (i, pad = 4) => i > T0 - pad && i < T1 + pad;

  // ---- the Seine: the water following the ground under it, the parapets of both quais ----
  const river = new THREE.Group(); river.name = 'bourbon:seine';
  const wt = TEX.water.clone(); wt.needsUpdate = true;
  const wm = disposable(new THREE.MeshStandardMaterial({ map: wt, normalMap: surface('water').normalMap, roughness: 0.15, metalness: 0.3 }));
  { const X0 = -2000, X1 = 2000, DX = 50, rows = [QZ - 1, (QZ + FZ) / 2, FZ + 1], p = [], uv = [], ix = [], cols = (X1 - X0) / DX + 1;
    for (const z of rows) for (let c = 0; c < cols; c++) { const x = X0 + c * DX; p.push(x, groundY(x, z) + 0.3, z); uv.push(x / 24, z / 24); }
    for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c; ix.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals();
    const w = new THREE.Mesh(g, wm); w.receiveShadow = true; river.add(w); }
  G.animated.push(dt => { wt.offset.x += dt * 0.01; });
  const QM = new Merger().at(0, 0, 0);
  for (const z of [QZ, FZ]) for (let x = -1980; x < 1980; x += 40) if (Math.abs(x + 20 - AX) > 37 && Math.abs(x + 20 - PX) > 37) QM.box(40.2, 1.1, 0.8, 0xbfb398, x + 20, groundY(x + 20, z) + 0.75, z);
  world.add(still(QM.into(river)));
  const waterY = (x, z) => groundY(x, z) + 0.3;
  yield;

  // ---- the two bridges over the river: arches, a cambered deck, balustrades, lamps that light at dusk; the Alexandre-III's gilded pylons ----
  for (const [bx, name] of [[AX, 'concorde'], [PX, 'alexandre-iii']]) {
    const b = new THREE.Group(), M = new Merger().at(0, 0, 0); b.name = 'bourbon:pont-' + name;
    const len = QZ - FZ, W = 34, n = 12;
    for (let j = 0; j < n; j++) {
      const t0 = j / n, t1 = (j + 1) / n, z0 = QZ - t0 * len, z1 = QZ - t1 * len, y0 = groundY(bx, z0) + 1.2 + 3.2 * Math.sin(Math.PI * t0), y1 = groundY(bx, z1) + 1.2 + 3.2 * Math.sin(Math.PI * t1), seg = Math.hypot(z1 - z0, y1 - y0), rx = Math.atan2(y1 - y0, z0 - z1);
      M.box(W, 1.4, seg + 0.2, 0xd3c7ad, bx, (y0 + y1) / 2, (z0 + z1) / 2, 0, rx);
      for (const s of [-1, 1]) { M.box(0.8, 1.1, seg + 0.2, 0xbfb398, bx + s * (W / 2 - 0.4), (y0 + y1) / 2 + 1.2, (z0 + z1) / 2, 0, rx); }
    }
    for (let j = 1; j < 5; j++) { const z = QZ - j / 5 * len, y = groundY(bx, z), top = 1.2 + 3.2 * Math.sin(Math.PI * j / 5) - 0.5; M.box(W + 2, top + 0.8, 5, 0xbfb398, bx, y + (top - 0.8) / 2, z); M.box(W + 3, 0.5, 6, 0xd3c7ad, bx, y + 0.35, z); }   // the piers and their cutwaters
    M.into(b); world.add(b); compact(b);
    for (let j = 0; j <= 8; j += high() ? 1 : 2) { const t = j / 8, z = QZ - t * len, y = groundY(bx, z) + 1.2 + 3.2 * Math.sin(Math.PI * t) + 1.7; for (const s of [-1, 1]) lamps.add(bx + s * (W / 2 - 0.4), z, { y }); }
    if (name === 'alexandre-iii') {
      const py = new THREE.Group(); py.name = 'bourbon:pylones';
      const PM = new Merger().at(0, 0, 0);
      for (const z of [QZ + 8, FZ - 8]) for (const s of [-1, 1]) { const x = bx + s * (W / 2 + 3), y = groundY(x, z); PM.box(4, 17, 4, 0xd9cfb8, x, y + 8.5, z); PM.box(4.8, 1, 4.8, 0xcfc3a6, x, y + 17.5, z); statueInto(PM, x, y + 18, z, 2.2, 0xd4af37, 0, true); }
      world.add(still(PM.into(py)));
    }
    yield;
  }

  // ---- the Concorde across the river: paving, the obélisque, the two fountains, rostral lamps, the colonnades of the Hôtel de la Marine ----
  const cz = -650, conc = new THREE.Group(); conc.name = 'bourbon:concorde';
  flat(conc, 260, 150, AX, cz, plain(0xcfc5b4), groundY(AX, cz) + 0.04);
  const ob = new THREE.Group(), OM = new Merger().at(AX, groundY(AX, cz), cz); ob.name = 'bourbon:obelisque';
  OM.box(9, 2, 9, 0x9a8f7a, 0, 1, 0); OM.box(6.4, 7, 6.4, 0xb0a48c, 0, 5.5, 0); OM.box(7, 0.8, 7, 0x9a8f7a, 0, 9.4, 0);
  OM.shape(new THREE.CylinderGeometry(1.15, 1.95, 30, 4).rotateY(Math.PI / 4), 0xc9a56a, 0, 24.8, 0);
  OM.shape(new THREE.ConeGeometry(1.62, 3.2, 4).rotateY(Math.PI / 4), 0xf2c14e, 0, 41.4, 0);
  for (let y = 12; y < 38; y += 2.6) OM.box(2.6 - (y - 12) * 0.03, 0.9, 0.06, 0x8a7350, 0, y, 1.2 + 0.79 * (1 - (y - 9.8) / 30));   // hieroglyphs
  OM.into(ob); world.add(ob); still(ob);
  for (let a = 0; a < 8; a += high() ? 1 : 2) { const x = AX + Math.cos(a / 8 * Math.PI * 2 + 0.2) * 82, z = cz + Math.sin(a / 8 * Math.PI * 2 + 0.2) * 52; lamps.add(x, z, { y: groundY(x, z) }); }
  { const CM = new Merger(), S = high() ? 24 : 12, wmat = disposable(new THREE.MeshStandardMaterial({ map: TEX.water, normalMap: surface('water').normalMap, roughness: 0.2, metalness: 0.2 }));
    for (const x of [AX - 50, AX + 50]) {   // the two fountains: basin, water, two gilded tiers
      const y = groundY(x, cz); CM.at(x, y, cz); CM.shape(new THREE.CylinderGeometry(11, 11.4, 1.1, S), 0xd9cfb8, 0, 0.55, 0); CM.geo(new THREE.CircleGeometry(10.3, S).rotateX(-Math.PI / 2), wmat, new THREE.Matrix4().makeTranslation(0, 1.12, 0));
      CM.shape(new THREE.CylinderGeometry(1.2, 1.8, 5, S / 2), 0xd9cfb8, 0, 3, 0); CM.shape(new THREE.CylinderGeometry(4.6, 3.6, 0.7, S), 0xd4af37, 0, 5.3, 0); CM.shape(new THREE.CylinderGeometry(0.6, 0.9, 3, S / 2), 0xd9cfb8, 0, 7, 0); CM.shape(new THREE.CylinderGeometry(2.4, 1.8, 0.5, S), 0xd4af37, 0, 8.6, 0);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; CM.box(1.2, 1.6, 1.2, 0xd4af37, Math.cos(a) * 6.5, 1.9, Math.sin(a) * 6.5); }
    }
    for (const x of [AX - 72, AX + 72]) { CM.at(x, groundY(x, -745), -745); CM.texBox(118, 24, 30, k.stone(1), 12, 9.6, 0, 12, 0); CM.box(119, 1.2, 31, 0xd9cfb8, 0, 24.6, 0); CM.box(84, 6, 3, 0xcdbf9f, 0, 3, 16); const c = new THREE.CylinderGeometry(0.85, 0.95, 13, high() ? 12 : 6); for (let i = 0; i < 12; i++) CM.shape(c, 0xf3ead6, -38 + i * 6.9, 12.5, 16.5); CM.box(86, 2, 4, 0xe8dcc0, 0, 20, 16.5); } CM.into(conc); }
  world.add(conc); compact(conc);
  fp.add({ x: AX, z: cz - 30, w: 300, d: 230, rotY: 0 });
  yield;

  // ---- the right bank: plane trees, lamps and a row of blocks along the quai ----
  { const RM = new Merger(), rb = new THREE.Group(); rb.name = 'bourbon:rive-droite';
    for (let x = high() ? -1500 : -900; x < (high() ? 1500 : 900); x += rand(46, 62)) { if (Math.abs(x - AX) < 160 || Math.abs(x - PX) < 34) continue; const w = rand(40, 56); haussmann(RM, k, x, groundY(x, -603), -603, w, 24, rand(19, 24), 0, { detail: high() && Math.abs(x) < 700, shops: high() }); }
    RM.into(rb); world.add(rb); still(rb);
    for (let x = -1100; x < 1100; x += high() ? 18 : 72) if (Math.abs(x - AX) > 150 && Math.abs(x - PX) > 24) tree('curtain', x, -575);
    for (let x = -1080; x < 1100; x += high() ? 40 : 120) if (Math.abs(x - AX) > 40 && Math.abs(x - PX) > 40) lamps.add(x, FZ - 3, { y: groundY(x, FZ - 3) }); }
  yield;

  // ---- the quai: the bouquinistes against the parapet, Paris Plages, lamps, trees, benches, fishermen, joggers ----
  const box = [batch(bouquinisteProp(true), { world: true }), batch(bouquinisteProp(true), { world: true }), batch(bouquinisteProp(false), { world: true })];
  const plage = x => (x > 420 && x < 820) || (x > -1000 && x < -620);
  const quai = (x, z, m) => clear(x, z, m) && Math.abs(x - AX) > 22 && Math.abs(x - PX) > 22;
  for (let x = -1100; x < 1100; x += high() ? 2.5 : 10) { if (plage(x) || !quai(x, QZ + 1.5, 4)) continue; if (Math.random() < 0.12) { x += rand(6, 16); continue; } box[Math.floor(rand(0, 3))].add(x, QZ + 1.4, { y: groundY(x, QZ + 1.4), rotY: 0 }); }
  yield;
  for (let x = -1080; x < 1100; x += high() ? 30 : 60) if (quai(x, QZ + 4, 3)) lamps.add(x, QZ + 4, { y: groundY(x, QZ + 4) });
  for (let x = -1090; x < 1100; x += high() ? 16 : 48) if (!plage(x) && quai(x, QZ + 20, 7)) tree('curtain', x, QZ + 20);
  for (let x = -1070; x < 1100; x += high() ? 34 : 68) if (!plage(x) && quai(x, QZ + 9, 4)) benches.add(x, QZ + 9, { y: groundY(x, QZ + 9), rotY: Math.PI });
  yield;
  const pa = [0xe63946, 0x1f8ac0, 0xf2c14e].map(c => batch(parasolProp(c), { world: true })), tr = [0xe63946, 0x1f8ac0, 0xf6f1e4].map(c => batch(transatProp(c), { world: true })), planters = batch(() => slab(1.4, 1, 1.4, 0xb5795c, 0, 0.5, 0), { world: true });
  for (const [a, b] of [[420, 820], [-1000, -620]]) {
    const sand = new THREE.Group(); sand.name = 'bourbon:paris-plages';
    flat(sand, b - a, 26, (a + b) / 2, QZ + 14, plain(0xe8d6a8, 1), groundY((a + b) / 2, QZ + 14) + 0.05);
    const sg = textPlane(8, 1.4, 'PARIS PLAGES', '#1f8ac0', '#fffaf0', 72); sg.position.set(a + 12, groundY(a + 12, QZ + 27) + 3, QZ + 27); sg.rotation.y = Math.PI; sand.add(sg); sand.add(cyl(0.08, 0.08, 3, 0xdddddd, a + 8, groundY(a + 8, QZ + 27) + 1.5, QZ + 27, 6)); sand.add(cyl(0.08, 0.08, 3, 0xdddddd, a + 16, groundY(a + 16, QZ + 27) + 1.5, QZ + 27, 6));
    world.add(sand); compact(sand);
    for (let x = a + 14; x < b - 8; x += high() ? 9 : 27) { const z = QZ + rand(8, 22), y = groundY(x, z); pa[Math.floor(rand(0, 3))].add(x, z, { y }); tr[Math.floor(rand(0, 3))].add(x + 1.8, z - 0.5, { y, rotY: rand(2.8, 3.5) }); if (high() && Math.random() < 0.6) tr[Math.floor(rand(0, 3))].add(x - 1.6, z - 0.4, { y, rotY: rand(2.8, 3.5) }); }
    for (let x = a + 30; x < b; x += 60) { const y = groundY(x, QZ + 25); planters.add(x, QZ + 25, { y }); tree('plane', x, QZ + 25, y + 1); }
    for (let n = 0; n < nOf(8); n++) { const x = rand(a + 10, b - 10), z = QZ + rand(10, 20); const f = person(scene, s1(x), s1(z), rand(2.5, 3.8), null, 0); f.rotation.x = -1.2; f.position.y = 0.4; }   // sunbathers
  }
  yield;
  const fish = new THREE.Group(); fish.name = 'bourbon:pecheurs';
  for (let n = 0; n < 6; n++) { const x = rand(-1300, 1300); if (!quai(x, QZ + 1.8, 4) || plage(x)) continue; const y = groundY(x, QZ + 1.8), f = figure(pick(JACKETS), pick(SKINS), null); f.position.set(x, y, QZ + 1.8); f.rotation.y = Math.PI; fish.add(f); G.crowd.push({ g: f, ph: rand(0, 6), amp: 0.03, base: y }); const rod = cyl(0.02, 0.03, 4.5, 0x3a2a1a, x + 0.3, y + 2.6, QZ - 0.6, 4); rod.rotation.x = -1.0; fish.add(rod); }
  world.add(fish); compact(fish);
  const runners = [];
  for (let n = 0; n < nOf(10); n++) { const f = figure(pick(JACKETS), pick(SKINS), null), x = rand(-1200, 1200), z = QZ + rand(5, 12); f.userData.v = rand(3, 4.5) * (n % 2 ? 1 : -1); f.rotation.y = f.userData.v > 0 ? Math.PI / 2 : -Math.PI / 2; f.position.set(x, groundY(x, z), z); world.add(f); runners.push(f); }
  G.animated.push(dt => { for (const j of runners) { j.position.x += j.userData.v * dt; if (j.position.x > 1250) j.position.x = -1250; if (j.position.x < -1250) j.position.x = 1250; } });
  for (let n = 0; n < nOf(30); n++) { const x = rand(-1200, 1200), z = QZ + rand(3, 14); if (quai(x, z, 2)) pigeons.add(x, z, { y: groundY(x, z), rotY: rand(0, 6.28) }); }
  for (let n = 0; n < nOf(16); n++) { const x = rand(-1000, 1000), z = QZ + rand(2.6, 4.5); if (quai(x, z, 3) && !plage(x)) person(scene, s1(x), s1(z), Math.PI + rand(-0.5, 0.5), null, 0.04); }
  kiosk(scene, s1(380), s1(QZ + 12), 0x2e8b57, 'JOURNAUX', Math.PI); cafe(scene, s1(-300), s1(QZ + 12), Math.PI, 'CAFÉ DU QUAI', 0x2e8b57, 3);
  yield;

  // ---- péniches moored at random spots along both banks; the bateau-mouche and the Batobus on the river ----
  const moored = [];
  for (let n = 0, tries = 0; n < nOf(7) && tries < 40; tries++) {
    const near = n % 2 === 0, x = rand(-1300, 1300), z = near ? QZ - 6 : FZ + 6;
    if (Math.abs(x - AX) < 50 || Math.abs(x - PX) < 50 || moored.some(m => Math.abs(m - x) < 40)) continue;
    moored.push(x); world.add(peniche(x, z, Math.random() < 0.5 ? 0 : Math.PI, waterY(x, z) - 0.6)); n++;
  }
  for (const [kind, z, v] of [['bateau-mouche', -440, 6.5], ['batobus', -500, -5]]) {
    const b = riverBoat(kind), x0 = rand(-900, 900); b.position.set(x0, waterY(x0, z), z); b.rotation.y = v > 0 ? 0 : Math.PI; world.add(b);
    const ys = []; for (let x = -1600; x <= 1600; x += 40) ys.push(waterY(x, z));
    G.animated.push(dt => { const p = b.position; p.x += v * dt; if (p.x > 1500) p.x = -1500; if (p.x < -1500) p.x = 1500; const f = (p.x + 1600) / 40, i = Math.floor(f); p.y = ys[i] + (ys[i + 1] - ys[i]) * (f - i) - 0.2 + Math.sin(G.time * 1.3 + z) * 0.06; });
  }
  yield;

  // ---- the Assemblée nationale on the axis of the bridge, its lawn behind, the press on its steps ----
  const as = assemblee(k); as.position.set(AX, groundY(AX, -193), -193); as.rotation.y = Math.PI; world.add(as);
  const press = new THREE.Group(); press.name = 'bourbon:presse';
  for (const x of [-9, 9]) { const gd = figure(0x1f2a5e, pick(SKINS), 'guard'); gd.position.set(AX + x, groundY(AX + x, -251), -251); press.add(gd); }
  for (let n = 0; n < 10; n++) { const x = AX + rand(-14, 14), z = -193 - rand(56, 60); photographer(press, x, z, rand(-0.3, 0.3), groundY(x, z)); }
  world.add(press); compact(press);
  yield;
  fp.add({ x: AX, z: -130, w: 300, d: 210, rotY: 0 }); fp.add({ x: AX, z: -268, w: 150, d: 40, rotY: 0 });   // the Assemblée, its lawn, its forecourt to the quai
  const lawn = new THREE.Group(); lawn.name = 'bourbon:pelouse';
  flat(lawn, 240, 110, AX, -100, plain(0x5f9a48), groundY(AX, -100) + 0.03);
  const LM = new Merger().at(0, 0, 0);
  for (const x of [-80, -40, 40, 80]) { LM.box(1.6, 2.2, 1.6, 0xcfc6b5, AX + x, 1.1, -120); statueInto(LM, AX + x, 2.2, -120, 1.15, 0xe8e2d6, Math.PI); }
  LM.box(220, 2.2, 1.2, 0x2f6b3a, AX, 1.1, -48); LM.box(220.2, 0.3, 1.4, 0x3a7f45, AX, 2.3, -48);
  world.add(still(LM.into(lawn)));
  for (let x = -100; x <= 100; x += high() ? 25 : 50) { tree('chestnut', AX + x, -60); tree('chestnut', AX + x, -142); }
  yield;

  // ---- the quai's tunnel: walls, the slab of the upper promenade with its trees, sodium lights, portals and a band of haze ----
  {
    const t = new THREE.Group(), TM = new Merger().at(0, 0, 0), sodium = new THREE.MeshBasicMaterial({ color: 0xffa64a }); t.name = 'bourbon:tunnel';
    for (let i = T0; i < T1; i += 3) {
      const a = G.samples[i], b = G.samples[Math.min(i + 3, T1)], len = Math.hypot(b.x - a.x, b.z - a.z) + 0.3, yaw = Math.atan2(b.x - a.x, b.z - a.z), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, y = (a.y + b.y) / 2, hw = a.hw + 7;
      for (const sg of [1, -1]) { TM.box(1.4, 12.8, len, 0xa89c84, mx + a.sx * sg * hw, y + 6.4, mz + a.sz * sg * hw, yaw); if (i % 9 === 0) TM.box(0.3, 0.3, 1.6, 0x222222, mx + a.sx * sg * (hw - 0.8), y + 11, mz + a.sz * sg * (hw - 0.8), yaw); }
      TM.box(2 * hw + 4, 1.6, len, 0x9a8f7a, mx, y + 13.6, mz, yaw);
      if (i % 9 === 0) for (const sg of [1, -1]) TM.geo(SODIUM, sodium, new THREE.Matrix4().makeRotationY(yaw).setPosition(mx + a.sx * sg * (hw - 0.8), y + 10.6, mz + a.sz * sg * (hw - 0.8)));
    }
    for (const [i, out] of [[T0, -1], [T1, 1]]) {
      const s = G.samples[i], yaw = Math.atan2(s.tx, s.tz), hw = s.hw + 7;
      TM.box(2 * hw + 6, 4.4, 1.6, 0xb8ab90, s.x, s.y + 14.2, s.z, yaw);
      for (const sg of [1, -1]) TM.box(2.4, 16.4, 2.4, 0xb8ab90, s.x + s.sx * sg * (hw + 0.4), s.y + 8.2, s.z + s.sz * sg * (hw + 0.4), yaw);
      const sg = textPlane(14, 1.2, 'VOIE GEORGES-POMPIDOU', '#1f3a93', '#fff', 64); sg.position.set(s.x + s.tx * out * 0.85, s.y + 13.6, s.z + s.tz * out * 0.85); sg.rotation.y = yaw + (out < 0 ? Math.PI : 0); t.add(sg);
    }
    TM.into(t); world.add(t); still(t);
    // the band of haze: three veils across the road inside, thicker at dawn
    const veil = new THREE.MeshBasicMaterial({ color: 0xdfe4ea, transparent: true, opacity: G.layout?.climate === 'dawn' ? 0.22 : 0.12, depthWrite: false, side: THREE.DoubleSide });
    for (const f of [0.3, 0.5, 0.7]) { const s = G.samples[Math.floor(T0 + (T1 - T0) * f)], v = new THREE.Mesh(new THREE.PlaneGeometry(2 * (s.hw + 6.5), 12.4), veil); v.name = 'bourbon:tunnel:haze'; v.position.set(s.x, s.y + 6.2, s.z); v.rotation.y = Math.atan2(s.tx, s.tz); world.add(v); }
    // the upper promenade on the slab: trees, lamps, strollers
    for (let i = T0 + 4; i < T1 - 2; i += high() ? 6 : 12) for (const sg of [1, -1]) { const s = G.samples[i], l = sg * (s.hw + 3); tree('curtain', s.x + s.sx * l, s.z + s.sz * l, s.y + 14.4); }
    for (let i = T0 + 6; i < T1; i += high() ? 16 : 32) { const s = G.samples[i]; lamps.add(s.x, s.z, { y: s.y + 14.4 }); }
  }
  yield;

  // ---- the humps of the road as bridges: balustrades on both kerbs, lamps lit at dusk, pylons with gilded statues and the bridges' names ----
  for (const [a, b, name] of [[0.14, 0.26, 'PONT DE L’ALMA'], [0.84, 0.96, 'PONT ALEXANDRE-III']]) {
    const span = []; for (let i = Math.floor(a * N); i <= Math.floor(b * N); i++) if (G.samples[i].y > 1.5) span.push(i);
    if (span.length < 4) continue;
    const pont = new THREE.Group(), BM = new Merger().at(0, 0, 0); pont.name = 'bourbon:pont-route';
    const st = high() ? 2 : 4;
    for (let j = 0; j < span.length - st; j += st) for (const sg of [1, -1]) {
      const p = spot(span[j], sg, 1.3), q = spot(span[j + st], sg, 1.3), len = Math.hypot(q.x - p.x, q.z - p.z), yaw = Math.atan2(q.x - p.x, q.z - p.z), rx = Math.atan2(q.s.y - p.s.y, len), mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, y = (p.s.y + q.s.y) / 2 + 0.35;
      BM.box(0.4, 0.8, len + 0.05, 0xe2d8c2, mx, y + 0.55, mz, yaw, -rx); if (high()) BM.box(0.55, 0.16, len + 0.1, 0xd3c7ad, mx, y + 1.02, mz, yaw, -rx);
      if (j % 8 === 0) BM.box(0.6, 1.3, 0.6, 0xd3c7ad, p.x, p.s.y + 0.35 + 0.65, p.z, yaw);
      if (j % (high() ? 12 : 24) === 0) lamps.add(p.x, p.z, { y: p.s.y + 0.35 });
    }
    for (const i of [span[0], span[span.length - 1]]) for (const sg of [1, -1]) {
      const p = spot(i, sg, 3.4), y = p.s.y + 0.35; BM.box(3, 14, 3, 0xd9cfb8, p.x, y + 7, p.z, p.face); BM.box(3.6, 0.9, 3.6, 0xcfc3a6, p.x, y + 14.4, p.z, p.face);
      BM.plane(2.8, 0.9, textPlane(2.8, 0.9, name, '#2a2a2a', '#d4af37', 54).material, p.x + Math.sin(p.face) * 1.52, y + 5, p.z + Math.cos(p.face) * 1.52, p.face);
      statueInto(BM, p.x, y + 14.85, p.z, 1.8, 0xd4af37, p.face, true);
    }
    world.add(still(BM.into(pont)));
  }
  yield;

  // ---- the bouquinistes' stalls the layout puts on the road: green boxes on trestles instead of a market stall ----
  for (const h of G.hazards) {
    if (h.kind !== 'stall' || !h.mesh) continue;
    const g = h.mesh; g.clear();
    for (const x of [-1.15, 1.15]) { g.add(slab(2.1, 0.9, 0.9, 0x2f5f32, x, 1.25, 0)); const lid = slab(2.1, 0.07, 0.9, 0x2f5f32, x, 2.1, -0.62); lid.rotation.x = -1.1; g.add(lid); for (let i = 0; i < 5; i++) g.add(slab(0.3, 0.4, 0.7, pick([0xc8102e, 0xf2c14e, 0x1f3a93, 0xf6f1e4]), x - 0.7 + i * 0.35, 1.9, 0)); [-0.9, 0.9].forEach(lx => g.add(slab(0.08, 0.8, 0.7, 0x5a4a3a, x + lx, 0.4, 0))); }
  }

  // ---- Haussmann blocks on both sides of the road, but for the river's side of the quai; a plainer grid of blocks inside the loop ----
  const along = yield* lineWithBlocks(world, k, fp, 'bourbon:haussmann', { sectors: 8, skip: (i, sg) => sg < 0 && G.samples[i].z < -170 });
  const grid = [], quads = [0, 1, 2, 3].map(() => new Merger()), AM = new Merger().at(0, 0, 0);
  let tried = 0;
  for (let gx = -460; gx <= 460; gx += 82) for (let gz = -260; gz <= 480; gz += 74) {
    const w = 64, d = 56, f = { x: gx, z: gz, w, d, rotY: 0 };
    if (++tried % 12 === 0) yield;
    if (!fp.free(f, 6) || !blockClear(gx, gz, w + 10, d + 10, 0, 14)) continue;
    fp.add(f); grid.push(f);
    const y = groundY(gx, gz);
    if (Math.random() < 0.15) { AM.box(w + 4, 0.04, d + 4, 0x6f9a55, gx, y + 0.02, gz); for (const [dx, dz] of high() ? [[-20, -16], [20, -16], [-20, 16], [20, 16]] : [[-20, -16], [20, 16]]) tree(pick(['plane', 'chestnut']), gx + dx, gz + dz); continue; }   // a square
    AM.box(w + 18, 0.04, d + 18, 0x8a877f, gx, y + 0.01, gz);
    haussmann(quads[(gx > 0 ? 1 : 0) + (gz > 100 ? 2 : 0)], k, gx, y, gz, w, d, rand(20, 25), Math.random() < 0.5 ? 0 : Math.PI, { detail: false, shops: Math.random() < 0.4 });
  }
  const streets = new THREE.Group(); streets.name = 'bourbon:rues'; world.add(still(AM.into(streets)));
  for (const [i, M] of quads.entries()) { if (!M.buckets.size) continue; const g = new THREE.Group(); g.name = 'bourbon:ilots:' + i; world.add(still(M.into(g))); yield; }
  litWindows(along);
  yield;

  // ---- the road's own street life, the tunnel left bare ----
  yield* P.roadside({ cafes: [[0.33, 'LE PALAIS BOURBON', 0x5c1a33], [0.6, 'CAFÉ DES DÉPUTÉS', 0x1f3a93]], metro: [0.3, 0.68], fleurs: [0.45], skip: i => inTunnel(i) });
  P.finish();
}

/** A sodium lamp of the tunnel: a small glowing box. */
const SODIUM = new THREE.BoxGeometry(0.3, 0.25, 1.4);
