// Kart physics, lap progress and ranking.
//
// updateKart is the per-kart step: input (the player's through the input
// seam, the AI's through aiInput), drift and mini-turbo, ramps and tricks,
// pits, dash pads, hazards and the item roll timer. updateProgress tracks the
// spline index and laps, updateRanks sorts the field, kartCollisions resolves
// kart-on-kart contact.
//
// This code used to write to the HUD from inside the physics step. It now
// emits through engine/events.js instead -- the toast() and setHint() it
// calls are the queue's emitters, not DOM writers -- and the UI drains that
// queue once per frame after the step. Sound stays a direct call: audio is
// already engine-side and a one-frame delay on a bump would be audible.
//
// **The step order inside frame() -- updateKart for every kart, then
// kartCollisions, pickupItems, updateProjectiles, updateRanks -- is a
// contract.** Each function assumes what the previous one left in G.
import { sfx, sfxFor } from './audio.js';
import { aiInput } from './ai.js';
import { ITEMS } from './data.js';
import { hintFor, say } from './events.js';
import { readInput } from './input.js';
import { stunKart } from './items.js';
import { CFG, G } from './state.js';
import { isFoe } from './teams.js';
import { clamp, fmtTime, lerp, ordinal, rand, wrapAngle } from './util.js';

// ---------- Progress & ranking ----------
export function updateProgress(k) {
  const N = G.N; let best = k.idx, bestD = Infinity;
  for (let o = -16; o <= 16; o++) { const i = (k.idx + o + N) % N; const s = G.samples[i]; const d = (k.pos.x - s.x) ** 2 + (k.pos.z - s.z) ** 2; if (d < bestD) { bestD = d; best = i; } }
  const prev = k.idx; k.idx = best;
  if (prev > N * 0.8 && best < N * 0.2) {
    k.lap++;
    if (k.lap > k.maxLap) {
      k.maxLap = k.lap;
      const lapTime = G.time - k.lapStart; k.lapStart = G.time; if (lapTime < k.bestLap) k.bestLap = lapTime;
      if (k.lap >= CFG.laps && !k.finished) { k.finished = true; k.finishTime = G.time; if (!k.isAI) onHumanFinish(k); }
      else if (!k.isAI) { say(k, k.lap === CFG.laps - 1 ? 'DERNIER TOUR !' : 'TOUR ' + (k.lap + 1) + ' — ' + fmtTime(lapTime)); sfxFor(k, 'lap'); }
    }
  } else if (prev < N * 0.2 && best > N * 0.8) k.lap--;
  k.progress = k.lap + best / N;
}
export function updateRanks() {
  const sorted = [...G.karts].sort((a, b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : (a.finished ? -1 : b.finished ? 1 : b.progress - a.progress));
  sorted.forEach((k, i) => { k.rank = i; });
  // Rubber-banding is measured against the leading human: the only one in solo play.
  const lead = G.karts.reduce((m, o) => (o.isAI ? m : Math.max(m, o.progress)), -Infinity);
  for (const k of G.karts) if (k.isAI) { const gap = lead === -Infinity ? 0 : lead - k.progress; k.aiSpeedMul = clamp(1 + gap * 0.55, 0.84, 1.14) + k.skill; }
}

// ---------- A human finishes ----------
// The arrival toast goes to that driver. The results timer is armed once
// every human has finished -- in solo play, the moment the player does.
function onHumanFinish(k) { if (G.karts.every(o => o.isAI || o.finished)) G.resultsAt = G.time + 5; say(k, 'ARRIVÉE ! ' + ordinal(k.rank + 1)); sfxFor(k, 'finish'); }

// ---------- Kart physics ----------
export function updateKart(k, dt) {
  const S = k.stats; const baseMax = 42 * S.speed; let maxSpeed = baseMax;
  if (k.boost > 0) maxSpeed *= k.boostPower;
  if (k.invincible > 0) maxSpeed *= 1.2;
  if (k.fly > 0) maxSpeed *= 1.5;
  if (k.slowed > 0) maxSpeed *= 0.55;
  if (k.isAI || k.finished) maxSpeed *= k.aiSpeedMul;
  updateProgress(k);
  const s = G.samples[k.idx]; const hw = CFG.roadHalfWidth;
  let lateral = (k.pos.x - s.x) * s.sx + (k.pos.z - s.z) * s.sz;
  k.offroad = Math.abs(lateral) > hw;
  if (k.offroad && k.invincible <= 0 && k.boost <= 0 && k.fly <= 0 && !k.air) maxSpeed *= 0.65;

  let inp;
  if (k.stun > 0) inp = { throttle: 0, brake: 0, steer: 0, drift: false };
  else if (k.isAI || k.finished) inp = aiInput(k, dt, lateral);
  else { const i = k.ctrl ? k.ctrl() : readInput(); inp = { throttle: i.throttle ? 1 : 0, brake: i.brake ? 1 : 0, steer: (i.right ? 1 : 0) - (i.left ? 1 : 0), drift: i.drift }; }
  if (G.state === 'countdown') { inp.throttle = 0; inp.brake = 0; inp.drift = false; }
  if (k.fly > 0) inp.throttle = 1;
  if (k.confused > 0 && !k.isAI) inp.steer = -inp.steer;                           // éléments de langage: inverted controls
  // ramps: ground height follows the plank; leaving its end launches the kart
  let groundY = 0, onRamp = null;
  for (const r of G.ramps) { const rel = (k.idx - r.i0 + G.N) % G.N; if (rel < r.len && Math.abs(lateral) < hw) { onRamp = r; groundY = r.h * clamp((rel + 0.5) / r.len, 0, 1); } }
  if (k.rampPrev && !onRamp && !k.air) { const r = k.rampPrev; const rel = (k.idx - r.i0 + G.N) % G.N; if (rel >= r.len && rel < r.len + 8 && k.speed > 6) { k.air = true; k.y = r.h; k.vy = k.speed * (r.h / r.L) * 1.35 + 2.5; k.trick = false; sfxFor(k, 'jump'); } }
  k.rampPrev = onRamp;
  if (k.air) { if (inp.drift && !k.trick) { k.trick = true; say(k, 'FIGURE !'); } if (k.isAI && !k.trick && Math.random() < dt * 2) k.trick = true; inp.drift = false; }

  const sfA = clamp(Math.abs(k.speed) / baseMax, 0, 1);
  const accel = 26 * S.accel * (1.45 - 0.6 * sfA);   // punchy launch, tapering near top speed
  if (inp.throttle > 0) { if (k.speed < maxSpeed) k.speed = Math.min(maxSpeed, k.speed + accel * dt); }
  else if (inp.brake > 0) { if (k.speed > 0) k.speed = Math.max(0, k.speed - 45 * dt); else k.speed = Math.max(k.speed - 14 * dt, -baseMax * 0.35); }
  else k.speed *= Math.exp(-dt * 0.9);
  if (k.speed > maxSpeed) k.speed = lerp(k.speed, maxSpeed, 1 - Math.exp(-dt * 2.5));
  if (k.stun > 0) k.speed *= Math.exp(-dt * 3);

  const sf = clamp(Math.abs(k.speed) / baseMax, 0, 1);
  k.steer = lerp(k.steer || 0, inp.steer, 1 - Math.exp(-dt * 11));   // smoothed steering input
  let turnRate = 2.4 * S.handling * k.steer * (0.3 + 0.7 * Math.min(1, sf * 1.6)) * (k.speed < 0 ? -1 : 1);
  if (inp.drift && !k.drift.active && inp.steer !== 0 && k.speed > baseMax * 0.45 && k.stun <= 0 && k.fly <= 0) { k.drift.active = true; k.drift.dir = inp.steer; k.drift.charge = 0; }
  if (k.drift.active) {
    if (!inp.drift || k.speed < baseMax * 0.25 || k.stun > 0) {
      const c = k.drift.charge;
      if (c > 2.0) { k.boost = Math.max(k.boost, 1.1); k.boostPower = 1.45; sfx('boost'); say(k, 'SUPER MINI-TURBO'); }
      else if (c > 1.0) { k.boost = Math.max(k.boost, 0.55); k.boostPower = 1.3; sfx('boost'); }
      k.drift.active = false; k.drift.charge = 0;
    } else { k.drift.charge += dt; turnRate = 2.4 * S.handling * (k.drift.dir * 1.15 + k.steer * 0.55) * (0.5 + 0.5 * sf); k.speed *= Math.exp(-dt * 0.12); }
  }
  if (k.stun > 0) turnRate = 11;
  if (k.air) turnRate *= 0.45;
  if (k.slip > 0 && k.stun <= 0) { turnRate *= 0.3; k.heading += Math.sin(G.time * 13) * 0.7 * dt; k.speed *= Math.exp(-dt * 0.6); }
  k.heading -= turnRate * dt;

  let moveDir = k.heading; if (k.drift.active) moveDir += k.drift.dir * 0.35;
  k.pos.x += Math.sin(moveDir) * k.speed * dt; k.pos.z += Math.cos(moveDir) * k.speed * dt;

  lateral = (k.pos.x - s.x) * s.sx + (k.pos.z - s.z) * s.sz;
  const limit = hw + 0.1;
  if (Math.abs(lateral) > limit) {
    const over = Math.abs(lateral) - limit; const sg = Math.sign(lateral);
    k.pos.x -= sg * over * s.sx; k.pos.z -= sg * over * s.sz;
    const th = Math.atan2(s.tx, s.tz);
    const ang = Math.min(Math.abs(wrapAngle(moveDir - th)), Math.PI / 2);          // approach angle against the wall
    const loss = clamp(Math.sin(ang) * 0.9, 0.04, 0.9);                             // scraping along keeps speed, head-on costs it
    if (k.speed > 8 && k.fly <= 0) { k.speed *= 1 - loss * 0.6; if (loss > 0.3) sfxFor(k, 'bump'); }
    k.heading += wrapAngle(th - k.heading) * (0.2 + loss * 0.45);
    if (k.drift.active && loss > 0.4) { k.drift.active = false; k.drift.charge = 0; }
  }

  // vertical motion
  if (!k.air) k.y = groundY;
  else { k.vy -= 32 * dt; k.y += k.vy * dt; if (k.y <= groundY) { k.y = groundY; k.air = false; if (k.trick) { k.boost = Math.max(k.boost, 0.7); k.boostPower = 1.35; sfx('boost'); } else k.speed *= 0.94; k.trick = false; } }
  // pits, dash pads
  if (!k.air && k.y <= 0.1 && k.fly <= 0) {
    if (k.pitGrace <= 0) for (const p of G.pits) { const rel = (k.idx - p.i0 + G.N) % G.N; if (rel < p.len && Math.abs(lateral) < hw) { k.pitGrace = 2;
      if (p.kind === 'water') { k.speed *= 0.3; if (stunKart(k, 0.8)) say(k, 'PLOUF !'); }
      else if (p.kind === 'works') { k.slowed = Math.max(k.slowed, 2.2); k.speed *= 0.6; { say(k, 'ZONE DE TRAVAUX !'); sfxFor(k, 'bump'); } }
      else if (p.kind === 'manif') { if (stunKart(k, 1.0)) say(k, 'PRIS DANS LA MANIF !'); } break; } }
    if (k.padGrace <= 0) for (const p of G.pads) { const rel = (k.idx - p.i0 + G.N) % G.N; if (rel < p.len && Math.abs(lateral) < hw) { k.padGrace = 2; k.boost = Math.max(k.boost, 0.9); k.boostPower = 1.5; sfxFor(k, 'boost'); break; } }
  }
  // timers
  k.slip = Math.max(0, k.slip - dt); k.confused = Math.max(0, k.confused - dt); k.pitGrace = Math.max(0, k.pitGrace - dt); k.padGrace = Math.max(0, k.padGrace - dt); k.phantom = Math.max(0, k.phantom - dt);
  k.boost = Math.max(0, k.boost - dt); k.stun = Math.max(0, k.stun - dt); k.invincible = Math.max(0, k.invincible - dt); k.hazardGrace = Math.max(0, k.hazardGrace - dt);
  k.slowed = Math.max(0, k.slowed - dt); k.fly = Math.max(0, k.fly - dt); k.powerCd = Math.max(0, k.powerCd - dt);
  if (k.relance > 0) { k.relanceTimer -= dt; if (k.relanceTimer <= 0) { k.relance--; k.relanceTimer = 1.1; k.boost = 0.7; k.boostPower = 1.45; sfx('boost'); } }
  if (k.itemRolling > 0) { k.itemRolling -= dt; if (k.itemRolling <= 0) { k.item = k.pendingItem; k.pendingItem = null; if (!k.isAI) { sfxFor(k, 'pick'); hintFor(k, ITEMS[k.item].hint); } else k.itemTimer = rand(0.8, 4); } }

  k.rampSlope = onRamp ? onRamp.slope : 0;
  updateKartVisual(k, dt, sf);
}

/**
 * Pose kart k's mesh from its state: position, lean, wheels, drift sparks,
 * shield ring, rotor, the stunned driver's bob and the phantom blink. `sf` is
 * the speed factor the physics step computed. Split out of updateKart so a
 * networked client, which receives the state instead of simulating it, can
 * draw karts exactly the way the simulation does (DEC-014).
 */
export function updateKartVisual(k, dt, sf) {
  const m = k.mesh; const flyY = k.fly > 0 ? Math.min(5, k.fly > 3.5 ? (4 - k.fly) * 10 : k.fly < 0.5 ? k.fly * 10 : 5) : 0;
  m.position.set(k.pos.x, k.y + flyY, k.pos.z); m.rotation.y = k.heading; m.rotation.z = k.steer * 0.06 * sf + (k.air && k.trick ? Math.sin(G.time * 12) * 0.5 : 0);
  m.rotation.x = k.rampSlope ? -k.rampSlope : k.air ? -clamp(k.vy * 0.035, -0.45, 0.45) : k.fly > 0 ? -0.12 : 0;
  const u = m.userData; u.wheels.forEach((w, i) => { w.rotation.x += k.speed * dt / 0.45; if (i < 2) w.rotation.y = -k.steer * 0.45; });
  const sparkOn = k.drift.active && k.drift.charge > 0.35;
  u.sparks.forEach(sp => { sp.visible = sparkOn; sp.material.color.setHex(k.drift.charge > 2 ? 0xff7a1a : k.drift.charge > 1 ? 0xffd34d : 0x7cc4ff); sp.scale.setScalar(0.7 + Math.random() * 0.8); });
  u.ring.visible = k.invincible > 0; if (u.ring.visible) u.ring.rotation.z += dt * 4;
  u.rotor.visible = k.fly > 0; if (u.rotor.visible) u.blades.forEach(b => { b.rotation.y += dt * 40; });
  u.driver.position.y = 0.75 + (k.stun > 0 ? Math.abs(Math.sin(G.time * 20)) * 0.3 : 0);
  m.visible = k.phantom > 0 ? (Math.floor(G.time * 14) % 2 === 0) : true;
}

// ---------- Kart-on-kart contact ----------
export function kartCollisions() {
  for (let i = 0; i < G.karts.length; i++) for (let j = i + 1; j < G.karts.length; j++) {
    const a = G.karts[i], b = G.karts[j]; if (a.fly > 0 || b.fly > 0) continue; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z; const d = Math.hypot(dx, dz);
    if (d < 2.6 && d > 0.001) {
      const push = (2.6 - d) / 2; const nx = dx / d, nz = dz / d; const wa = a.stats.weight, wb = b.stats.weight; const ta = wb / (wa + wb), tb = wa / (wa + wb);
      a.pos.x -= nx * push * 2 * ta; a.pos.z -= nz * push * 2 * ta; b.pos.x += nx * push * 2 * tb; b.pos.z += nz * push * 2 * tb;
      a.speed *= 0.97; b.speed *= 0.97;
      if (isFoe(a, b)) { if (a.invincible > 0 && b.invincible <= 0) stunKart(b, 1.2); if (b.invincible > 0 && a.invincible <= 0) stunKart(a, 1.2); }
      sfxFor(a, 'bump'); sfxFor(b, 'bump');
    }
  }
}
