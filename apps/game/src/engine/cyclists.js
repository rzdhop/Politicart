// Cyclists: the bike lane's users, and why nobody trusts them.
//
// buildCyclists spreads the layout's riders along the bike lane that
// track.js paints down the right-hand edge of the road (bikeLaneOf): their
// count is the layout's and their spawns and base speeds come from the race
// seed's cyclists stream (DEC-049), so the server and every client start the
// same riders in the same places -- snapshots match them by index. Their
// looks stay on Math.random. updateCyclists moves them every simulation
// step. Most of the time they ride their lane; every few seconds each one
// picks a new whim: swerve into the karts' lanes, cut across the whole road,
// hop the kerb onto the pavement, ride the wrong way, stop dead, form a
// peloton with the riders around (who swerve together), race off like a
// delivery rider cutting across, or trundle along wide and slow like a cargo
// bike. A kart that hits one knocks the rider over and is shaken for a
// moment. They ride six kinds of machine (BIKE_KINDS: a road bike, a cargo
// bike, an electric scooter, a delivery rider's, a tandem, a Vélib'), drawn
// on Math.random like the rest of their looks.
//
// Like the crossings, they are simulation state: the game server steps them
// and sends their positions in each snapshot (netstate.js); a networked
// client only places the meshes (applyCyclists).
import * as THREE from 'three';

import { sfxFor } from './audio.js';
import { say } from './events.js';
import { stunKart } from './items.js';
import { box, cyl, mat, sph } from './primitives.js';
import { G, bikeLaneOf } from './state.js';
import { clamp, lerp, pick, rand, wrapAngle } from './util.js';

const HIT_R = 2.3;                // contact radius with a kart; a cargo bike is wider
const JERSEYS = [0xe63946, 0xf2c14e, 0x2a9d8f, 0x1f3a93, 0xffffff, 0xff7f11, 0x7b2cbf, 0x9ad04f];
const SKINS = [0xf1c27d, 0xe8b48a, 0xc68642, 0x8d5524, 0xf5d6c6];
const OUCH = ['CYCLISTE PERCUTÉ !', 'ATTENTION AU VÉLO !', 'LE CYCLISTE N’AVAIT PAS LA PRIORITÉ', 'PISTE CYCLABLE : PRIORITÉ AUX VÉLOS !'];
/** How many riders a layout may ask for: the count is clamped to this range. */
export const RIDERS = { min: 12, max: 28 };

/** The bikes' kinds (cosmetic only: their count, spawns and speeds are the seeded stream's, their looks Math.random's). */
export const BIKE_KINDS = Object.freeze(['course', 'cargo', 'trottinette', 'livreur', 'tandem', 'velib']);
/** How often each kind turns up. */
const BIKE_MIX = [['course', 3], ['cargo', 1.5], ['trottinette', 2], ['livreur', 2], ['tandem', 0.8], ['velib', 3]];
const pickBike = () => { let r = Math.random() * BIKE_MIX.reduce((t, [, w]) => t + w, 0); for (const [k, w] of BIKE_MIX) { r -= w; if (r <= 0) return k; } return 'velib'; };

/** Two wheels of radius r at z = front and back, into g. */
function wheels(g, r, front, back, t = 0.06) { const wg = new THREE.TorusGeometry(r, t, 6, 16); wg.rotateY(Math.PI / 2); [front, back].forEach(z => { const w = new THREE.Mesh(wg, mat(0x1a1a1a)); w.position.set(0, r + 0.06, z); g.add(w); }); }
/** A rider sitting on a saddle at (0, sy, sz), leaning forward by `lean` radians, hands at z = hz; `helmet` a colour or null. */
function rider(g, jersey, sy, sz, lean, hz, helmet) {
  g.add(box(0.36, 0.55, 0.2, 0x2b2b35, 0, sy + 0.23, sz + 0.07));                                          // legs
  const torso = cyl(0.2, 0.24, 0.7, jersey, 0, sy + 0.63, sz + 0.24, 8); torso.rotation.x = lean; g.add(torso);
  const hy = sy + 0.63 + Math.cos(lean) * 0.43, hzz = sz + 0.24 + Math.sin(lean) * 0.43;
  g.add(sph(0.18, pick(SKINS), 0, hy, hzz, 10));                                                            // head
  if (helmet !== null) { const h = sph(0.21, helmet, 0, hy + 0.08, hzz - 0.02, 10); h.scale.y = 0.7; g.add(h); }
  [0.18, -0.18].forEach(x => { const arm = box(0.08, 0.08, Math.max(0.3, hz - sz - 0.1), jersey, x, sy + 0.5, (sz + hz) / 2 + 0.1); arm.rotation.x = 0.35; g.add(arm); });
}
/** A bicycle (or an electric scooter) of `kind` and its rider(s), facing +z. */
function buildBike(kind = pickBike()) {
  const g = new THREE.Group(); const jersey = pick(JERSEYS), helmet = jersey === 0xffffff ? 0xe63946 : 0xffffff;
  g.userData.bike = kind;
  if (kind === 'trottinette') {
    // standing on the deck of an electric scooter, small wheels, a tall stem
    wheels(g, 0.2, 0.5, -0.45, 0.05);
    g.add(box(0.16, 0.06, 1.0, 0x2b2b35, 0, 0.32, 0)); g.add(box(0.05, 1.0, 0.05, 0x9a9a9a, 0, 0.82, 0.48)); g.add(box(0.5, 0.05, 0.05, 0x333333, 0, 1.3, 0.48));
    g.add(box(0.3, 0.8, 0.2, 0x3a5488, 0, 0.76, -0.05));
    const torso = cyl(0.2, 0.24, 0.7, jersey, 0, 1.52, 0.05, 8); torso.rotation.x = 0.12; g.add(torso);
    g.add(sph(0.18, pick(SKINS), 0, 2.0, 0.1, 10));
    [0.18, -0.18].forEach(x => { const arm = box(0.08, 0.08, 0.5, jersey, x, 1.45, 0.28); arm.rotation.x = 0.45; g.add(arm); });
    return g;
  }
  if (kind === 'tandem') {
    // one long frame, two saddles, two riders in the same jersey
    wheels(g, 0.42, 0.95, -0.95);
    g.add(box(0.07, 0.07, 1.9, 0xc8102e, 0, 0.78, 0)); g.add(box(0.07, 0.07, 1.6, 0xc8102e, 0, 0.55, -0.1));
    for (const z of [0.15, -0.75]) { g.add(box(0.07, 0.5, 0.07, 0xc8102e, 0, 0.6, z)); g.add(box(0.2, 0.08, 0.3, 0x222222, 0, 0.92, z - 0.02)); }
    g.add(box(0.07, 0.6, 0.07, 0xc8102e, 0, 0.75, 0.88)); g.add(box(0.6, 0.06, 0.06, 0x333333, 0, 1.08, 0.85));
    rider(g, jersey, 0.92, 0.13, 0.4, 0.85, helmet); rider(g, jersey, 0.92, -0.77, 0.25, 0.0, helmet);
    return g;
  }
  if (kind === 'cargo') {
    // a bakfiets: a wooden box between the rider and the front wheel, a child in it
    wheels(g, 0.3, 1.45, -0.62); g.add(box(0.07, 0.07, 2.0, 0x2a2f33, 0, 0.42, 0.4));
    g.add(box(0.8, 0.5, 0.9, 0x8b5a2b, 0, 0.75, 0.85)); g.add(box(0.07, 0.6, 0.07, 0x2a2f33, 0, 0.72, -0.2)); g.add(box(0.07, 0.7, 0.07, 0x2a2f33, 0, 0.9, 0.35)); g.add(box(0.6, 0.06, 0.06, 0x333333, 0, 1.25, 0.32));
    g.add(box(0.2, 0.08, 0.3, 0x222222, 0, 1.02, -0.22)); g.add(sph(0.14, pick(SKINS), 0, 1.15, 0.85, 8));
    rider(g, jersey, 1.02, -0.22, 0.12, 0.32, null);
    return g;
  }
  // the two-wheelers on a diamond or step-through frame
  const frame = kind === 'velib' ? pick([0x7bc043, 0x2a8fd6]) : kind === 'livreur' ? 0x2a2f33 : kind === 'course' ? pick([0xe63946, 0xf2c14e, 0x1f3a93, 0xffffff]) : 0xb0b4bb;
  wheels(g, kind === 'velib' ? 0.38 : 0.42, 0.62, -0.62, kind === 'course' ? 0.04 : 0.06);
  if (kind === 'velib') { g.add(box(0.07, 0.07, 0.9, frame, 0, 0.5, 0.1)); const dn = box(0.07, 0.07, 0.6, frame, 0, 0.75, 0.42); dn.rotation.x = -0.9; g.add(dn); g.add(box(0.5, 0.3, 0.35, 0x2a2f33, 0, 1.0, 0.72)); g.add(box(0.14, 0.04, 0.9, frame, 0, 0.88, -0.55)); }
  else g.add(box(0.07, 0.07, 1.0, frame, 0, 0.78, 0.05));                                                   // top tube
  g.add(box(0.07, 0.5, 0.07, frame, 0, 0.6, -0.2));                                                          // seat tube
  g.add(box(0.07, 0.6, 0.07, frame, 0, 0.75, 0.55));                                                         // fork
  g.add(box(kind === 'course' ? 0.42 : 0.6, 0.06, 0.06, 0x333333, 0, kind === 'velib' ? 1.15 : 1.08, 0.5));   // handlebar
  g.add(box(0.2, 0.08, 0.3, 0x222222, 0, 0.92, -0.22));                                                      // saddle
  if (kind === 'course') rider(g, jersey, 0.92, -0.22, 0.95, 0.5, helmet);
  else if (kind === 'livreur') { const bag = pick([0x00b8a9, 0xff7f11, 0xe63946]); rider(g, bag, 0.92, -0.22, 0.45, 0.5, 0x222222); g.add(box(0.55, 0.55, 0.5, bag, 0, 1.75, -0.45)); }
  else if (kind === 'velib') rider(g, jersey, 0.92, -0.22, 0.12, 0.5, null);
  else rider(g, jersey, 0.92, -0.22, 0.45, 0.5, helmet);
  return g;
}

/** The bike lane's middle at sample s, as a lateral offset. */
const laneMid = s => { const { inner, outer } = bikeLaneOf(s.hw); return (inner + outer) / 2; };

/**
 * Spread `n` riders along the bike lane of the circuit just built: evenly,
 * each jittered by the seeded stream `rng`, which also draws their base
 * speeds and first whim timers. The count is clamped to RIDERS.
 */
export function buildCyclists(scene, rng, n = RIDERS.min) {
  G.cyclists = [];
  const count = clamp(Math.round(n), RIDERS.min, RIDERS.max), gap = (G.N - 60) / count;
  for (let i = 0; i < count; i++) {
    const d = (30 + i * gap + rng.rand(-0.3, 0.3) * gap + G.N) % G.N;
    const mesh = buildBike(); scene.add(mesh);
    const base = rng.rand(6, 9), mid = laneMid(G.samples[Math.floor(d) % G.N]);
    const c = { d, lat: mid + rng.rand(-0.8, 0.8), target: mid, speed: base, want: base, base, dir: 1, timer: rng.rand(1, 6), fallen: 0, wob: rng.rand(0, 6.28), x: 0, z: 0, h: 0, y: 0, r: HIT_R, whim: 'lane', mesh };
    placeCyclist(c); G.cyclists.push(c);
  }
}

/** A new whim for rider c: ride, swerve, cross, hop off the road, stop, ride the wrong way, form a peloton, deliver, or haul cargo. */
function whim(c) {
  const s = G.samples[Math.floor(c.d) % G.N], hw = s.hw, { inner } = bikeLaneOf(hw), mid = laneMid(s);
  const r = Math.random();
  c.dir = 1; c.want = c.base; c.r = HIT_R; c.whim = 'lane';
  if (r < 0.34) { c.target = mid + rand(-1, 1); c.timer = rand(3, 7); }                 // rides the lane, more or less
  else if (r < 0.50) { c.whim = 'swerve'; c.target = rand(-4, inner - 1.5); c.timer = rand(2, 4); }   // swerves into the karts' lanes
  else if (r < 0.58) { c.whim = 'cross'; c.target = -(hw - 2); c.timer = rand(4, 6); }                // cuts across the whole road
  else if (r < 0.66) { c.whim = 'kerb'; c.target = hw + 2.6; c.timer = rand(3, 5); }                  // hops the kerb onto the pavement
  else if (r < 0.73) { c.whim = 'stop'; c.want = 0; c.timer = rand(1, 2.5); }                         // stops dead
  else if (r < 0.80) { c.whim = 'wrongWay'; c.dir = -1; c.want = c.base * 0.7; c.timer = rand(2, 4); }   // rides against the traffic
  else if (r < 0.88) {
    // a peloton: the riders within 40 samples fall in line behind c and swerve with it, for as long as it does
    c.whim = 'peloton'; c.target = rand(-3, inner - 1.5); c.timer = rand(3, 6); c.want = c.base * 1.1;
    for (const o of G.cyclists) { if (o === c || o.fallen > 0) continue; const gap = (c.d - o.d + G.N) % G.N; if (gap > 0 && gap < 40) { o.whim = 'peloton'; o.dir = 1; o.target = c.target; o.timer = c.timer; o.want = c.want; o.r = HIT_R; } }
  }
  else if (r < 0.95) { c.whim = 'delivery'; c.want = c.base * 1.9; c.target = -(hw - 3); c.timer = rand(2, 3.5); }   // a delivery rider: fast, cuts across
  else { c.whim = 'cargo'; c.want = c.base * 0.55; c.target = mid - 1.5; c.r = 3.2; c.timer = rand(4, 7); }         // a cargo bike: slow and wide
}

/** Where rider c is, from its distance along the lane `d` and its lateral offset `lat`. */
export function placeCyclist(c) {
  const N = G.N; const i = Math.floor(c.d) % N, f = c.d - Math.floor(c.d);
  const a = G.samples[i], b = G.samples[(i + 1) % N];
  const sx = lerp(a.sx, b.sx, f), sz = lerp(a.sz, b.sz, f), tx = lerp(a.tx, b.tx, f), tz = lerp(a.tz, b.tz, f);
  c.x = lerp(a.x, b.x, f) + sx * c.lat; c.z = lerp(a.z, b.z, f) + sz * c.lat;
  // the road's height and camber under the rider; the ramps lift riders too; the kerb is a small hop
  const hw = a.hw; let y = lerp(a.y, b.y, f) + c.lat * a.bank;
  for (const r of G.ramps || []) { const rel = (i - r.i0 + N) % N; if (rel < r.len && Math.abs(c.lat) < hw) y = r.y0 + r.h * clamp((rel + 0.5) / r.len, 0, 1); }
  const kerb = Math.abs(c.lat) - hw; if (kerb > 0 && kerb < 1.4) y += Math.sin(kerb / 1.4 * Math.PI) * 0.7;
  c.y = y;
  c.h = Math.atan2(tx, tz) + (c.dir < 0 ? Math.PI : 0) + clamp((c.target - c.lat) * 0.08, -0.5, 0.5) * c.dir;
  poseCyclist(c);
}

function poseCyclist(c) {
  c.mesh.position.set(c.x, c.y, c.z); c.mesh.rotation.y = c.h;
  c.mesh.rotation.z = c.fallen > 0 ? 1.35 : Math.sin(c.wob) * 0.06;
}

/** Move every rider one step and settle their run-ins with the karts. */
export function updateCyclists(dt) {
  if (!G.cyclists) return;
  const N = G.N; const step = G.trackLength / N;
  for (const c of G.cyclists) {
    if (c.fallen > 0) { c.fallen -= dt; if (c.fallen <= 0) { c.timer = 0; } poseCyclist(c); continue; }
    c.timer -= dt; if (c.timer <= 0) whim(c);
    c.wob += dt * (2 + c.speed * 0.4);
    c.speed = lerp(c.speed, c.want, 1 - Math.exp(-dt * 2.5));
    const latStep = (3.2 + Math.sin(c.wob * 0.7)) * dt;
    c.lat += clamp(c.target - c.lat, -latStep, latStep) + Math.sin(c.wob) * 0.6 * dt;
    c.d = (c.d + c.dir * c.speed * dt / step + N) % N;
    placeCyclist(c);
    const r2 = (c.r || HIT_R) ** 2;
    for (const k of G.karts) {
      if (k.fly > 0 || k.y - c.y > 1.2 || k.hazardGrace > 0) continue;
      if ((k.pos.x - c.x) ** 2 + (k.pos.z - c.z) ** 2 > r2) continue;
      c.fallen = 2.5; c.want = c.speed = 0; c.target = bikeLaneOf(G.samples[Math.floor(c.d) % N].hw).inner + 1.8;
      k.speed *= 0.45; k.hazardGrace = 1;
      if (stunKart(k, 0.8)) say(k, pick(OUCH)); else sfxFor(k, 'bump');
      poseCyclist(c);
      break;
    }
  }
}

/** Place the riders between two snapshots' encodings (netstate.js), `f` in [0, 1] (networked clients). */
export function applyCyclists(a, b, f) {
  if (!G.cyclists || !b) return;
  G.cyclists.forEach((c, i) => {
    const B = b[i]; if (!B) return; const A = (a && a[i]) || B;
    c.x = lerp(A[0], B[0], f); c.z = lerp(A[1], B[1], f); c.h = A[2] + wrapAngle(B[2] - A[2]) * f; c.y = lerp(A[3], B[3], f); c.fallen = B[4] ? 1 : 0;
    poseCyclist(c);
  });
}
