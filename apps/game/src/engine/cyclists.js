// Cyclists: the bike lane's users, and why nobody trusts them.
//
// buildCyclists spreads a dozen-odd riders along the bike lane that
// track.js paints down the right-hand edge of the road (CFG.bikeLane).
// updateCyclists moves them every simulation step. Most of the time they
// ride their lane; every few seconds each one picks a new whim: swerve into
// the karts' lanes, cut across the whole road, hop the kerb onto the
// pavement, ride the wrong way, or simply stop dead. A kart that hits one
// knocks the rider over and is shaken for a moment.
//
// Like the crossings, they are simulation state: the game server steps them
// and sends their positions in each snapshot (netstate.js); a networked
// client only places the meshes (applyCyclists).
import * as THREE from 'three';

import { sfxFor } from './audio.js';
import { say } from './events.js';
import { stunKart } from './items.js';
import { box, cyl, mat, sph } from './primitives.js';
import { CFG, G } from './state.js';
import { clamp, lerp, pick, rand, wrapAngle } from './util.js';

const SPACING = 120;              // one rider every 120 samples (about 200 m of road)
const HIT_R2 = 2.3 * 2.3;         // contact radius with a kart, squared
const JERSEYS = [0xe63946, 0xf2c14e, 0x2a9d8f, 0x1f3a93, 0xffffff, 0xff7f11, 0x7b2cbf, 0x9ad04f];
const SKINS = [0xf1c27d, 0xe8b48a, 0xc68642, 0x8d5524, 0xf5d6c6];
const OUCH = ['CYCLISTE PERCUTÉ !', 'ATTENTION AU VÉLO !', 'LE CYCLISTE N’AVAIT PAS LA PRIORITÉ', 'PISTE CYCLABLE : PRIORITÉ AUX VÉLOS !'];

/** A bicycle and its rider, facing +z. */
function buildBike() {
  const g = new THREE.Group(); const jersey = pick(JERSEYS);
  const wg = new THREE.TorusGeometry(0.42, 0.06, 6, 16); wg.rotateY(Math.PI / 2);
  [0.62, -0.62].forEach(z => { const w = new THREE.Mesh(wg, mat(0x1a1a1a)); w.position.set(0, 0.48, z); g.add(w); });
  g.add(box(0.07, 0.07, 1.0, 0xb0b4bb, 0, 0.78, 0.05));                         // top tube
  g.add(box(0.07, 0.5, 0.07, 0xb0b4bb, 0, 0.6, -0.2));                          // seat tube
  g.add(box(0.07, 0.6, 0.07, 0xb0b4bb, 0, 0.75, 0.55));                         // fork
  g.add(box(0.6, 0.06, 0.06, 0x333333, 0, 1.08, 0.5));                          // handlebar
  g.add(box(0.2, 0.08, 0.3, 0x222222, 0, 0.92, -0.22));                         // saddle
  g.add(box(0.36, 0.55, 0.2, 0x2b2b35, 0, 1.15, -0.15));                        // legs
  const torso = cyl(0.2, 0.24, 0.7, jersey, 0, 1.55, 0.02, 8); torso.rotation.x = 0.45; g.add(torso);
  g.add(sph(0.18, pick(SKINS), 0, 1.98, 0.22, 10));                             // head
  const helmet = sph(0.21, jersey === 0xffffff ? 0xe63946 : 0xffffff, 0, 2.06, 0.2, 10); helmet.scale.y = 0.7; g.add(helmet);
  [0.18, -0.18].forEach(x => { const arm = box(0.08, 0.08, 0.55, jersey, x, 1.45, 0.32); arm.rotation.x = 0.35; g.add(arm); });
  return g;
}

/** Spread the riders along the bike lane of the circuit just built. */
export function buildCyclists(scene) {
  G.cyclists = [];
  const { inner, outer } = CFG.bikeLane; const mid = (inner + outer) / 2;
  for (let d = rand(30, 60); d < G.N - 20; d += SPACING * rand(0.8, 1.2)) {
    const mesh = buildBike(); scene.add(mesh);
    const base = rand(6, 9);
    const c = { d, lat: mid + rand(-0.8, 0.8), target: mid, speed: base, want: base, base, dir: 1, timer: rand(1, 6), fallen: 0, wob: rand(0, 6.28), x: 0, z: 0, h: 0, y: 0, mesh };
    placeCyclist(c); G.cyclists.push(c);
  }
}

/** A new whim for rider c: ride, swerve, cross, hop off the road, stop, or ride the wrong way. */
function whim(c) {
  const { inner, outer } = CFG.bikeLane; const hw = CFG.roadHalfWidth; const mid = (inner + outer) / 2;
  const r = Math.random();
  c.dir = 1; c.want = c.base;
  if (r < 0.42) { c.target = mid + rand(-1, 1); c.timer = rand(3, 7); }                 // rides the lane, more or less
  else if (r < 0.62) { c.target = rand(-4, inner - 1.5); c.timer = rand(2, 4); }        // swerves into the karts' lanes
  else if (r < 0.72) { c.target = -(hw - 2); c.timer = rand(4, 6); }                    // cuts across the whole road
  else if (r < 0.82) { c.target = hw + 2.6; c.timer = rand(3, 5); }                     // hops the kerb onto the pavement
  else if (r < 0.91) { c.want = 0; c.timer = rand(1, 2.5); }                            // stops dead
  else { c.dir = -1; c.want = c.base * 0.7; c.timer = rand(2, 4); }                    // rides against the traffic
}

/** Where rider c is, from its distance along the lane `d` and its lateral offset `lat`. */
export function placeCyclist(c) {
  const N = G.N; const i = Math.floor(c.d) % N, f = c.d - Math.floor(c.d);
  const a = G.samples[i], b = G.samples[(i + 1) % N];
  const sx = lerp(a.sx, b.sx, f), sz = lerp(a.sz, b.sz, f), tx = lerp(a.tx, b.tx, f), tz = lerp(a.tz, b.tz, f);
  c.x = lerp(a.x, b.x, f) + sx * c.lat; c.z = lerp(a.z, b.z, f) + sz * c.lat;
  // the ramps lift riders too; the kerb is a small hop
  const hw = CFG.roadHalfWidth; let y = 0;
  for (const r of G.ramps || []) { const rel = (i - r.i0 + N) % N; if (rel < r.len && Math.abs(c.lat) < hw) y = r.h * clamp((rel + 0.5) / r.len, 0, 1); }
  const kerb = Math.abs(c.lat) - hw; if (kerb > 0 && kerb < 1.4) y = Math.max(y, Math.sin(kerb / 1.4 * Math.PI) * 0.7);
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
    for (const k of G.karts) {
      if (k.fly > 0 || k.y > 1.2 || k.hazardGrace > 0) continue;
      if ((k.pos.x - c.x) ** 2 + (k.pos.z - c.z) ** 2 > HIT_R2) continue;
      c.fallen = 2.5; c.want = c.speed = 0; c.target = CFG.bikeLane.inner + 1.8;
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
