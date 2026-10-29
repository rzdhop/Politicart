// Versailles — Jardins du Congrès: the themed decor of this circuit (stage 7).
//
// `scene` is the scale-1 decor group that track.js spreads to the circuit's scale,
// `world` the real scene for pieces placed from G.samples or built in world units
// (landmarks whose basins and colonnades must stay round).
//
// Its landmarks (each a group named 'versailles:<name>'): the château and its
// water terrace, Latona's tiered fountain, the Apollo basin and its chariot,
// the Colonnade, the orangery, the terraces where the allées drop a level
// (walls rising beside the road, balustrades on top), and the hedge maze
// round the hedge chicanes, whose gates take the side the race's seed drew
// (read back from G.hazards: the decor never draws from the seeded streams).
// Street life: courtiers and visitors (under umbrellas in the rain), guards,
// gardeners, swans and gondolas on the Grand Canal, the petit train along the
// tapis vert. The trees, statues, vases, benches, balustrades and jets are
// instanced (decor/instanced.js); the big still pieces are merged
// (versailles-props.js merged()).
import * as THREE from 'three';

import { box, cyl, plane } from '../primitives.js';
import { G, getPoly, isClear } from '../state.js';
import { TEX } from '../textures.js';
import { pick, rand } from '../util.js';
import { DS, clearAt, nOf, yAt } from './context.js';
import { fromBuilder, instanced } from './instanced.js';
import { orangery, palace, swan } from './street.js';
import {
  GOLD, PALETTES, STONE, apollon, balustrade, benchProp, bosquet, broderie, colonnade, disc, footing, gardenTree, gardenerProp, gatePost, gondola, guardProp,
  hedgeBox, hedgeMat, jetBasin, jetMat, latone, merged, mergeGroup, puddle, rowboat, statueProp, trainCar, vaseProp, visitor, waterMat,
} from './versailles-props.js';

/** The surface kinds (textures.js) this decor bakes, beyond the road's and the ground's: the pre-build bakes them ahead, a slice at a time. */
export const SURFACES = Object.freeze(['water', 'asphalt', 'palace', 'hedge']);

/** The stretches of the lap where the allées drop a level (data.js profile: 0 to -4 m over 0.28-0.32, -4 to -8 m over 0.58-0.62). */
const TERRACES = [[0.27, 0.335], [0.57, 0.635]];
/** The instanced batches the last build opened, with a label for the ones tests look for. */
const OPENED = [];
export const openedBatches = () => OPENED;
/** The vases' blooms. */
const BLOOMS = [0xe36f8a, 0xf2c14e, 0xd95f5f, 0xf0f0f0, 0x8a5fc8];

export function* buildVersailles(scene, world) {
  const N = G.N, S = DS, dense = getPoly() === 'high', wet = G.layout?.climate === 'overcast';
  const water = waterMat(), jets = jetMat(), hedges = hedgeMat(), sprays = [];
  // the repeated props: in the decor's scale-1 coordinates, and in world units for pieces placed from the samples
  OPENED.length = 0;
  const batch = (make, opts, label = '') => { const b = instanced(fromBuilder(g => g.add(make())), opts); OPENED.push({ label, batch: b }); return b; };
  const T = { cypress: batch(() => gardenTree('cypress')), cone: batch(() => gardenTree('cone')), ball: batch(() => gardenTree('ball')), orange: batch(() => gardenTree('orange')), round: batch(() => gardenTree('round')) };
  const W = { cone: batch(() => gardenTree('cone'), { world: true }), ball: batch(() => gardenTree('ball'), { world: true }), round: batch(() => gardenTree('round'), { world: true }) };
  const statues = batch(statueProp), wstatues = batch(statueProp, { world: true }), vases = batch(() => vaseProp(pick(BLOOMS))), wvases = batch(() => vaseProp(pick(BLOOMS)), { world: true });
  const guards = batch(guardProp), gardeners = batch(gardenerProp), benches = batch(benchProp, { world: true }), basins = batch(() => jetBasin(water, jets), { world: true });
  const rails = batch(() => balustrade(3.6), { world: true }), posts = batch(gatePost, { world: true }, 'gate posts');
  const at = (x, z) => yAt(x * S, z * S);   // the ground under a scale-1 point

  // the château, turned to face the gardens, its wings and gilded roof line, the water terrace and its basins, the parterres
  const chateau = merged(g => {
    palace(g, 0, 0, 200, 18, 30, Math.PI, 0x6b6f78);
    [-70, 70].forEach(x => { g.add(box(50, 14, 26, 0xeadfc8, x, 7, 18)); g.add(box(48, 3, 24, 0x6b6f78, x, 15.5, 18)); });
    for (let x = -90; x <= 90; x += 10) g.add(box(0.8, 1.4, 0.8, GOLD, x, 23.8, -12));
    g.add(box(202, 3, 48, STONE, 0, -1.5, 8));   // the plinth: the ground under it is not quite level
  });
  chateau.name = 'versailles:chateau'; chateau.position.z = 182; scene.add(chateau);
  [-45, 45].forEach(x => {
    const b = merged(g => { g.add(cyl(18, 18, 0.6, STONE, 0, 0.3, 0, 36)); g.add(disc(17, water, 0.62, 36)); }); b.position.set(x, 0, 141); scene.add(b);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; (i % 2 ? vases : statues).add(x + Math.cos(a) * 20, 141 + Math.sin(a) * 20, { rotY: -a }); }
  });
  for (let x = -100; x <= 100; x += 8) T.orange.add(x, 163, { scale: rand(0.9, 1.1) });
  yield;
  const p0 = Math.floor(rand(0, 8)); let pn = 0;
  const parterre = (x, z, w, d) => {
    if (!clearAt(x, z, Math.max(w, d) / 2 + 4)) return; const f = footing(x * S, z * S, w * S, d * S); if (f.spread > 1.5) return;
    const p = broderie(w, d, PALETTES[(p0 + pn++) % PALETTES.length]); p.position.set(x, f.y - at(x, z), z); scene.add(p);   // the spread adds the ground at its middle
  };
  [-110, -80, 80, 110].forEach(x => parterre(x, 128, 22, 12));
  yield;
  [-10, 10].forEach(x => parterre(x, 128, 14, 10));
  for (let i = 0; i < 10; i++) guards.add(-50 + i * 11, 166, { rotY: Math.PI });
  yield;

  // inside the loop: Latona, the tapis vert between its statues and vases, Apollo, the Colonnade and the bosquets
  const LZ = 100 / S, lat = latone(water, jets); lat.g.position.set(0, footing(0, LZ * S, 56, 56).y, LZ * S); world.add(lat.g); sprays.push(lat.spray);
  for (let i = 0; i < 8; i += dense ? 1 : 2) { const a = i / 8 * Math.PI * 2; statues.add(Math.cos(a) * 12.5, LZ + Math.sin(a) * 12.5, { rotY: -a + Math.PI / 2 }); }
  scene.add(plane(26, 100, 0x4f8f3f, 0, -20));
  for (let z = -64; z <= 24; z += dense ? 8 : 16) { (z % 16 ? vases : statues).add(-18, z, { rotY: Math.PI / 2 }); (z % 16 ? vases : statues).add(18, z, { rotY: -Math.PI / 2 }); T[z % 16 ? 'ball' : 'cone'].add(-24, z + 4); T[z % 16 ? 'ball' : 'cone'].add(24, z + 4); }
  yield;
  const apo = apollon(water, jets); apo.g.position.set(0, at(0, -95), -95 * S); world.add(apo.g); sprays.push(apo.spray);
  G.animated.push(() => { const k = 1 + Math.sin(G.time * 3) * 0.05; for (const s of sprays) s.scale.y = k; });
  yield;
  { const f = footing(62 * S, -25 * S, 80, 80); if (clearAt(62, -25, 20) && f.spread < 2) { const c = colonnade(water, hedges); c.position.set(62 * S, f.y, -25 * S); world.add(c); } }
  yield;
  let bosquets = 0;
  for (const [x, z] of [[-62, -25], [62, 45], [-62, 45], [-45, -105], [45, -105], [62, -60]]) {
    const f = footing(x * S, z * S, 92, 80); if (bosquets >= 3 || f.spread > 2 || !clearAt(x, z, 20)) continue;
    const b = bosquet(90, 78, water, hedges); b.position.set(x * S, f.y, z * S); world.add(b); bosquets++;
    for (let gx = -33; gx <= 33; gx += dense ? 11 : 22) for (let gz = -27; gz <= 27; gz += dense ? 9 : 18) if (Math.hypot(gx, gz) > 14) W.round.add(x * S + gx + rand(-1.5, 1.5), z * S + gz + rand(-1.5, 1.5), { y: f.y, scale: rand(0.9, 1.2), rotY: rand(0, 6.28) });   // the grove the hedges enclose
  }
  yield;
  for (let z = -70; z <= 30; z += dense ? 10 : 20) for (const x of [-31, 31]) if (clearAt(x, z, 8)) T.round.add(x, z, { scale: rand(1.0, 1.25), rotY: rand(0, 6.28) });   // the tall trees along the tapis vert
  [[-42, 86], [42, 86], [-42, -132], [42, -132]].forEach(([x, z]) => parterre(x, z, 20, 12));
  yield;
  [[-40, -60], [40, -60], [-40, 12], [40, 12]].forEach(([x, z]) => parterre(x, z, 16, 12));
  yield;

  // the Grand Canal south of the loop: its arms, the cypress allées, swans and gondolas on it, boats moored at its head
  const canal = new THREE.Mesh(new THREE.PlaneGeometry(44, 240), new THREE.MeshStandardMaterial({ map: TEX.water.clone(), normalMap: water.normalMap, roughness: 0.15, metalness: 0.3 })); canal.material.map.needsUpdate = true; canal.material.map.repeat.set(2, 12); canal.rotation.x = -Math.PI / 2; canal.position.set(0, 0.03, -305); scene.add(canal);
  const cross = canal.clone(); cross.geometry = new THREE.PlaneGeometry(240, 36); cross.position.set(0, 0.03, -330); scene.add(cross);
  for (let z = -200; z >= -420; z -= 12) { T.cypress.add(-34, z, { scale: rand(0.9, 1.2) }); T.cypress.add(34, z, { scale: rand(0.9, 1.2) }); if (dense) { T.round.add(-41, z + 6); T.round.add(41, z + 6); } }
  for (let i = 0; i < nOf(220); i++) { const x = rand(-330, 330), z = rand(-330, 100); if (Math.abs(x) > 110 && clearAt(x, z, 9)) T[Math.random() < 0.5 ? 'cypress' : 'round'].add(x, z, { scale: rand(0.85, 1.25), rotY: rand(0, 6.28) }); }
  const swans = []; for (let i = 0; i < nOf(10); i++) { const s = merged(g => { swan(g, 0, 0).rotation.y = 0; }); s.position.set(rand(-14, 14), 0, rand(-215, -400)); s.rotation.y = rand(0, 6.28); scene.add(s); swans.push(s); }
  G.animated.push(dt => { for (const s of swans) { s.position.z += Math.cos(s.rotation.y) * dt * 0.6; s.position.x += Math.sin(s.rotation.y) * dt * 0.6; if (Math.abs(s.position.x) > 16 * DS || s.position.z > -200 * DS || s.position.z < -420 * DS) s.rotation.y += Math.PI; } });
  const canalY = yAt(0, -305 * S) + 0.03, boats = [];
  for (let i = 0; i < nOf(3); i++) { const b = gondola(); b.position.set((i - 1) * 30, canalY, rand(-1200, -640)); b.userData.dir = i % 2 ? 1 : -1; world.add(b); boats.push(b); }
  G.animated.push(dt => { for (const b of boats) { b.position.z += b.userData.dir * dt * 2.2; if (b.position.z > -600 || b.position.z < -1230) b.userData.dir *= -1; b.rotation.y = b.userData.dir > 0 ? 0 : Math.PI; } });
  const rowing = batch(rowboat); for (let i = 0; i < 6; i++) rowing.add((i - 2.5) * 5.5, -192 - (i % 2) * 3, { rotY: Math.PI / 2 + rand(-0.2, 0.2) });
  yield;

  // all along the allées: clipped cones and balls in turn on both sides, vases, benches facing the road, jets in their basins
  const step = dense ? 8 : 12;
  for (let i = 0; i < N; i += step) {
    const s = G.samples[i];
    for (const sg of dense ? [1, -1] : [(i / step) % 2 ? 1 : -1]) {
      if (sg > 0 && (i < 16 || i > N - 16)) continue;   // the grandstand by the line
      const l = s.hw + 8, x = s.x + s.sx * sg * l, z = s.z + s.sz * sg * l;
      if (isClear(x, z, 6.5)) W[(i / step) % 2 ? 'cone' : 'ball'].add(x, z, { y: yAt(x, z), scale: rand(0.9, 1.15), rotY: rand(0, 6.28) });
    }
  }
  yield;
  for (let i = 12; i < N; i += dense ? 24 : 48) { const s = G.samples[i], sg = (i / 24) % 2 ? 1 : -1, l = s.hw + 11, x = s.x + s.sx * sg * l, z = s.z + s.sz * sg * l; if (isClear(x, z, 9)) wvases.add(x, z, { y: yAt(x, z) }); }
  for (let i = 18; i < N; i += 30) { const s = G.samples[i], sg = (i / 30) % 2 ? -1 : 1, l = s.hw + 10, x = s.x + s.sx * sg * l, z = s.z + s.sz * sg * l; if (isClear(x, z, 8.5)) benches.add(x, z, { y: yAt(x, z), rotY: Math.atan2(-s.sx * sg, -s.sz * sg) }); }
  for (let i = 40; i < N; i += 100) { const s = G.samples[i], sg = (i / 100) % 2 ? 1 : -1, l = s.hw + 18, x = s.x + s.sx * sg * l, z = s.z + s.sz * sg * l; if (isClear(x, z, 12)) basins.add(x, z, { y: yAt(x, z) }); }
  yield;

  // the terraces: where the allée drops a level, a wall rises beside it on both sides, the upper terrace's balustrade on top, a vase every few metres, statues at the foot
  const terraces = new THREE.Group();
  for (const [fa, fb] of TERRACES) {
    const ia = Math.floor(fa * N), ib = Math.floor(fb * N), top = Math.max(G.samples[ia].y, G.samples[ib].y);
    for (let i = ia; i < ib; i += 2) {
      const s = G.samples[i], n = G.samples[i + 2];
      for (const sg of [1, -1]) {
        const l = s.hw + 6.8, ln = n.hw + 6.8, x = s.x + s.sx * sg * l, z = s.z + s.sz * sg * l, xn = n.x + n.sx * sg * ln, zn = n.z + n.sz * sg * ln;
        if (!isClear((x + xn) / 2, (z + zn) / 2, 5.5)) continue;
        const len = Math.hypot(xn - x, zn - z), rot = Math.atan2(xn - x, zn - z), lo = Math.min(s.y, n.y) - 0.6, hi = Math.max(top, (s.y + n.y) / 2 + 0.6) + 0.3;
        const w = box(1.3, hi - lo, len + 0.05, STONE, 0, 0, 0); w.position.set((x + xn) / 2, (lo + hi) / 2, (z + zn) / 2); w.rotation.y = rot; terraces.add(w);
        rails.add((x + xn) / 2, (z + zn) / 2, { y: hi, rotY: rot });
        if ((i - ia) % (dense ? 8 : 16) === 0) wvases.add(x, z, { y: hi, rotY: rot });
      }
    }
    for (const sg of [1, -1]) for (const d of [-3, 3]) { const s = G.samples[ib + 4], l = s.hw + 9, x = s.x + s.sx * sg * l + s.tx * d, z = s.z + s.sz * sg * l + s.tz * d; if (isClear(x, z, 7)) wstatues.add(x, z, { y: yAt(x, z), rotY: Math.atan2(-s.sx * sg, -s.sz * sg) }); }
    yield;
  }
  mergeGroup(terraces); terraces.name = 'versailles:terrasses'; world.add(terraces);
  yield;

  // the hedge maze round the hedge chicanes: corridors of hedge inside the loop, a tall charmille opposite, and gilded gate piers on the open side of each gate
  const chicanes = (G.layout?.features || []).filter(f => f.t === 'chicane' && f.kind === 'hedge');
  if (chicanes.length) {
    const spans = [];
    for (const f of chicanes) { const i0 = Math.floor(f.f * N); spans.push([i0 - 24, i0 + ((f.n || 3) - 1) * 9 + 24]); }
    spans.sort((a, b) => a[0] - b[0]); const runs = [spans[0].slice()]; for (const sp of spans.slice(1)) { const r = runs[runs.length - 1]; if (sp[0] <= r[1]) r[1] = Math.max(r[1], sp[1]); else runs.push(sp.slice()); }
    const point = (i, l) => { const s = G.samples[((i % N) + N) % N]; return { x: s.x + s.sx * l, z: s.z + s.sz * l, s }; };
    const wall = (g, a, b, h) => { const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2; if (!isClear(x, z, 6)) return; const y = yAt(x, z), len = Math.hypot(b.x - a.x, b.z - a.z) + 1.1; const m = hedgeBox(len, h + 0.6, 1.2, hedges); m.position.set(x, y + (h + 0.6) / 2 - 0.6, z); m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2; g.add(m); };
    const maze = new THREE.Group();
    for (const [i0, i1] of runs) {
      const hw = G.samples[((i0 % N) + N) % N].hw, L = [hw + 8, hw + 16, hw + 24, hw + 32];
      L.forEach((l, k) => { for (let i = i0; i < i1; i += 3) if (k === 3 || Math.random() > 0.2) wall(maze, point(i, l), point(i + 3, l), 3.2); });
      for (let k = 0; k < 3; k++) for (let i = i0 + Math.floor(rand(3, 9)); i < i1; i += Math.floor(rand(8, 14))) wall(maze, point(i, L[k]), point(i, L[k + 1]), 3.2);
      wall(maze, point(i0, L[0]), point(i0, L[3]), 3.2); wall(maze, point(i1, L[0]), point(i1, L[3]), 3.2);
      const mid = point((i0 + i1) >> 1, (L[1] + L[2]) / 2); if (isClear(mid.x, mid.z, 10)) wstatues.add(mid.x, mid.z, { y: yAt(mid.x, mid.z), rotY: rand(0, 6.28) });
      for (let i = i0; i < i1; i += 3) wall(maze, point(i, -(hw + 9)), point(i + 3, -(hw + 9)), 4.5);   // the charmille across the allée
      yield;
    }
    mergeGroup(maze); maze.name = 'versailles:labyrinthe'; world.add(maze);
    // each gate's blocks stand on the side the seed drew; the piers mark the gap left open
    for (const f of chicanes) {
      const i0 = Math.floor(f.f * N);
      for (let j = 0; j < (f.n || 3); j++) {
        const s = G.samples[(i0 + j * 9) % N];
        const block = G.hazards.find(h => h.kind === 'hedge' && Math.hypot(h.x - s.x, h.z - s.z) < s.hw + 1);
        const side = block ? Math.sign((block.x - s.x) * s.sx + (block.z - s.z) * s.sz) || 1 : 1;
        for (const d of [-2, 2]) { const p = point(i0 + j * 9 + d, -side * (s.hw + 1.6)); posts.add(p.x, p.z, { y: p.s.y + 0.35, rotY: Math.atan2(s.tx, s.tz) }); }
      }
    }
  }
  yield;

  // the orangery, facing the gardens, its orange trees in their caisses in rows before it and a round basin; a line of topiary along the terrace
  // (in world units, on the level ground the west allées come down to: stretched with the circuit it would be 300 m long)
  const OX = -430, OZ = 335, or = merged(g => { orangery(g, 0, 0, 100, Math.PI); g.add(box(104, 2, 16, STONE, 0, -0.9, 0)); }); or.name = 'versailles:orangerie'; or.position.set(OX, footing(OX, OZ, 104, 16).y, OZ); world.add(or);
  const oranges = batch(() => gardenTree('orange'), { world: true });
  for (const z of [OZ - 18, OZ - 26]) for (let x = OX - 46; x <= OX + 46; x += dense ? 8 : 11.5) if (isClear(x, z, 6)) oranges.add(x, z, { y: yAt(x, z), scale: rand(0.9, 1.1) });
  if (isClear(OX, OZ - 44, 14)) { const b = merged(g => { g.add(cyl(8, 8.4, 0.6, STONE, 0, 0.3, 0, 28)); g.add(disc(7.6, water, 0.62, 28)); }); b.position.set(OX, footing(OX, OZ - 44, 17, 17).y, OZ - 44); world.add(b); }
  for (let x = -120; x <= 120; x += 8) if (clearAt(x, 118, 4)) T.cone.add(x, 118);
  yield;

  // the visitors: courtiers and tourists on the tapis vert, along the water terrace and before the orangery; guards, gardeners at work
  const stroll = (x, z) => visitor(scene, x, z, null, { wet, base: at(x, z) });
  for (let i = 0; i < nOf(14); i++) stroll(rand(-11, 11), rand(-60, 24));
  for (let i = 0; i < nOf(10); i++) stroll(rand(-90, 90), rand(150, 158));
  for (let i = 0; i < nOf(6); i++) { const x = OX + rand(-40, 40), z = OZ - rand(32, 38); visitor(world, x, z, null, { wet, base: yAt(x, z), world: true }); }
  for (let i = 0; i < 6; i++) guards.add(-30 + i * 12, 74, { rotY: Math.PI });
  for (let i = 0; i < nOf(10); i++) { const x = rand(-100, 100), z = rand(-130, 100); if (clearAt(x, z, 6) && Math.abs(x) > 30) gardeners.add(x, z, { rotY: rand(0, 6.28) }); }
  yield;
  // the petit train, up and down the allée beside the tapis vert, between Latona and Apollo
  const route = []; for (let k = 0; k <= 40; k++) { const z = 110 - k * 340 / 40; route.push(yAt(46, z)); }
  const yOn = z => { const u = Math.max(0, Math.min(40, (110 - z) / (340 / 40))), k = Math.floor(u), t = u - k; return route[k] + ((route[Math.min(40, k + 1)] ?? route[k]) - route[k]) * t; };
  const train = [trainCar(true), trainCar(false), trainCar(false)]; train.forEach(c => world.add(c)); let tz = 0, tdir = -1;
  const placeTrain = () => train.forEach((c, k) => { const z = tz - tdir * k * 5.4; c.position.set(46, yOn(z), z); c.rotation.y = tdir > 0 ? 0 : Math.PI; });
  placeTrain(); G.animated.push(dt => { tz += tdir * dt * 4; if (tz < -215 || tz > 95) { tz = Math.max(-215, Math.min(95, tz)); tdir *= -1; } placeTrain(); });
  // in the rain, puddles on the gravel by the road
  if (wet) { const pools = batch(() => puddle(water), { world: true }); for (let i = 0; i < nOf(40); i++) { const s = G.samples[Math.floor(rand(0, N))], sg = Math.random() < 0.5 ? 1 : -1, l = s.hw + rand(2, 5); pools.add(s.x + s.sx * sg * l, s.z + s.sz * sg * l, { y: s.y, rotY: rand(0, 6.28), scale: rand(0.7, 1.4) }); } }
}
