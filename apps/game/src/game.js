// Kart Republique -- the game.
//
// This is the original single-file script, moved out of index.html unchanged.
// Only two things differ: Three.js is imported here instead of arriving as a
// global from a CDN script tag, and the file is a module rather than an inline
// block.
//
// Three.js is pinned to 0.128.0 to match the r128 build the CDN served (see
// .claude/DECISIONS.md DEC-007). It is not an upgrade: THREE.sRGBEncoding,
// used below, was removed in three >= 0.152, and moving versions is its own
// task with its own test pass rather than a side effect of repackaging.
//
// The order of everything below is load-bearing and must not be rearranged:
// textures() has to run before any builder reads TEX.*, buildTrack has to set
// G.samples and G.N before buildFeatures, crowdZone and grandstand read them,
// and the physics step inside frame() runs in a fixed sequence. The module is
// deliberately left as one file here; splitting it into modules is stage 9.
import * as THREE from 'three';

// Engine modules, pulled out of this file in stage 9. The rest of the game
// still lives here and is moved out in the stages that follow.
import { initAudio, isMuted, sfx, toggleMute, updateEngine } from './engine/audio.js';
import { getCustom, loadCustom, resetCustom, saveCustom, applyCustom } from './engine/custom.js';
import { BASE, CHARACTERS, ITEMS, ITEM_ODDS, TRACKS, rollItem } from './engine/data.js';
import { buildKart } from './engine/kart.js';
import { box, cone, cyl, mat, setCast, sph, textPlane } from './engine/primitives.js';
import { camera, renderer, resize } from './engine/render.js';
import { CFG, G, SHADOWS, getPoly, togglePoly } from './engine/state.js';
import { buildTrack } from './engine/track.js';
import { $, clamp, fmtTime, hex, lerp, ordinal, rand, wrapAngle } from './engine/util.js';

'use strict';
/* =====================================================================================
   KART RÉPUBLIQUE v2 — satirical kart racer with a fictional French political cast.
   Single-file Three.js game: spline tracks, kart physics with drift/mini-turbo,
   political items + one special power per candidate, AI opponents with rubber-banding,
   procedural textures, shadow mapping, WebAudio sound.
   ===================================================================================== */




// ---------- Kart entities ----------
function makeKart(def, isAI) {
  const mesh = buildKart(def);
  return {
    def, stats: def.stats, isAI, mesh, pos: { x: 0, z: 0 }, heading: 0, speed: 0,
    drift: { active: false, dir: 0, charge: 0 }, boost: 0, boostPower: 1.4, stun: 0, invincible: 0, slowed: 0, fly: 0, relance: 0, relanceTimer: 0,
    item: null, itemRolling: 0, pendingItem: null, itemTimer: 0, powerCd: 8 + rand(0, 6), powerUses: 0,
    y: 0, vy: 0, air: false, trick: false, rampPrev: null, slip: 0, confused: 0, pitGrace: 0, padGrace: 0, steer: 0, phantom: 0,
    idx: 0, lap: 0, progress: 0, rank: 0, finished: false, finishTime: 0,
    lane: isAI ? rand(-3.5, 3.5) : 0, laneTimer: rand(2, 6), aiSpeedMul: 1, skill: rand(-0.03, 0.03), hazardGrace: 0, lapStart: 0, bestLap: Infinity, maxLap: 0,
  };
}

function startRace() {
  if (G.scene) disposeScene(G.scene);
  const track = TRACKS[G.trackIdx]; G.track = track;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(track.fog); scene.fog = new THREE.Fog(track.fog, 220, 700);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x55663a, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.15); sun.position.set(120, 200, 80); scene.add(sun); scene.add(sun.target);
  sun.castShadow = SHADOWS(); sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 500; sun.shadow.bias = -0.0006;
  G.sun = sun; G.scene = scene; G.animated = []; G.hazards = []; G.projectiles = []; G.crowd = [];
  setCast(true); buildTrack(scene, track);

  const others = CHARACTERS.filter((c, i) => i !== G.charIdx).sort(() => Math.random() - 0.5).slice(0, CFG.numAI);
  const player = makeKart(CHARACTERS[G.charIdx], false);
  G.karts = [...others.map(d => makeKart(d, true)), player]; G.player = player;
  G.karts.forEach((k, i) => {
    const s = G.samples[6 + i * 4]; const lane = (i % 2 === 0 ? 1 : -1) * 3.5;
    k.pos.x = s.x + s.sx * lane; k.pos.z = s.z + s.sz * lane; k.heading = Math.atan2(s.tx, s.tz); k.idx = 6 + i * 4;
    k.mesh.position.set(k.pos.x, 0, k.pos.z); k.mesh.rotation.y = k.heading; scene.add(k.mesh);
  });
  G.time = 0; G.countdown = 3.6; G.resultsAt = Infinity; G.state = 'countdown';
  showScreen(null); $('hud').hidden = false; $('note').hidden = true;
  const s = G.samples[0]; camera.position.set(s.x - s.tx * 14, 7, s.z - s.tz * 14); camera.fov = 65;
  drawMinimapBase(); setHint('Ramassez une urne dorée pour obtenir un objet.');
  $('h-pname').textContent = player.def.power.name;
}
function disposeScene(scene) { scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }

// ---------- Progress & ranking ----------
function updateProgress(k) {
  const N = G.N; let best = k.idx, bestD = Infinity;
  for (let o = -16; o <= 16; o++) { const i = (k.idx + o + N) % N; const s = G.samples[i]; const d = (k.pos.x - s.x) ** 2 + (k.pos.z - s.z) ** 2; if (d < bestD) { bestD = d; best = i; } }
  const prev = k.idx; k.idx = best;
  if (prev > N * 0.8 && best < N * 0.2) {
    k.lap++;
    if (k.lap > k.maxLap) {
      k.maxLap = k.lap;
      const lapTime = G.time - k.lapStart; k.lapStart = G.time; if (lapTime < k.bestLap) k.bestLap = lapTime;
      if (k.lap >= CFG.laps && !k.finished) { k.finished = true; k.finishTime = G.time; if (k === G.player) onPlayerFinish(); }
      else if (k === G.player) { toast(k.lap === CFG.laps - 1 ? 'DERNIER TOUR !' : 'TOUR ' + (k.lap + 1) + ' — ' + fmtTime(lapTime)); sfx('lap'); }
    }
  } else if (prev < N * 0.2 && best > N * 0.8) k.lap--;
  k.progress = k.lap + best / N;
}
function updateRanks() {
  const sorted = [...G.karts].sort((a, b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : (a.finished ? -1 : b.finished ? 1 : b.progress - a.progress));
  sorted.forEach((k, i) => { k.rank = i; });
  const p = G.player;
  for (const k of G.karts) if (k.isAI) { const gap = p.progress - k.progress; k.aiSpeedMul = clamp(1 + gap * 0.55, 0.84, 1.14) + k.skill; }
}

// ---------- AI ----------
function aiInput(k, dt, lateral) {
  const N = G.N; const hw = CFG.roadHalfWidth; const look = 8 + Math.floor(Math.abs(k.speed) / 5);
  const t = G.samples[(k.idx + look) % N];
  const lane = Math.abs(lateral) > hw - 2.5 ? 0 : k.lane;
  const tx = t.x + t.sx * lane, tz = t.z + t.sz * lane;
  const desired = Math.atan2(tx - k.pos.x, tz - k.pos.z);
  const diff = wrapAngle(desired - k.heading);
  let steer = clamp(-diff * 3.2, -1, 1); if (k.confused > 0) steer = clamp(steer + Math.sin(G.time * 9 + k.skill * 100) * 1.1, -1, 1);
  const far = G.samples[(k.idx + look * 3) % N];
  const curve = Math.abs(wrapAngle(Math.atan2(far.x - k.pos.x, far.z - k.pos.z) - k.heading));
  let throttle = 1; if (curve > 1.05 && Math.abs(k.speed) > 26 * k.stats.speed) throttle = 0;
  const drift = curve > 1.15 && Math.abs(k.speed) > 28 && Math.abs(lateral) < hw - 3;
  k.laneTimer -= dt; if (k.laneTimer <= 0) { k.lane = rand(-3.5, 3.5); k.laneTimer = rand(3, 8); }
  for (const h of G.hazards) { const dx = h.x - k.pos.x, dz = h.z - k.pos.z; const ahead = dx * Math.sin(k.heading) + dz * Math.cos(k.heading); const side = dx * (-Math.cos(k.heading)) + dz * Math.sin(k.heading); if (ahead > 0 && ahead < 30 && Math.abs(side) < (h.r || 2) + 1.5) k.lane = side > 0 ? -4 : 4; }
  if (k.item && k.itemRolling <= 0) { k.itemTimer -= dt; if (k.itemTimer <= 0) useItem(k); }
  if (k.powerCd <= 0 && G.state === 'race' && Math.random() < dt * 0.25 && (k.def.power.id !== 'rattrapage' || k.rank >= 3)) usePower(k);
  return { throttle, brake: 0, steer, drift };
}

// ---------- Kart physics ----------
function updateKart(k, dt) {
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
  else { const i = inputState(); inp = { throttle: i.throttle ? 1 : 0, brake: i.brake ? 1 : 0, steer: (i.right ? 1 : 0) - (i.left ? 1 : 0), drift: i.drift }; }
  if (G.state === 'countdown') { inp.throttle = 0; inp.brake = 0; inp.drift = false; }
  if (k.fly > 0) inp.throttle = 1;
  if (k.confused > 0 && !k.isAI) inp.steer = -inp.steer;                           // éléments de langage: inverted controls
  // ramps: ground height follows the plank; leaving its end launches the kart
  let groundY = 0, onRamp = null;
  for (const r of G.ramps) { const rel = (k.idx - r.i0 + G.N) % G.N; if (rel < r.len && Math.abs(lateral) < hw) { onRamp = r; groundY = r.h * clamp((rel + 0.5) / r.len, 0, 1); } }
  if (k.rampPrev && !onRamp && !k.air) { const r = k.rampPrev; const rel = (k.idx - r.i0 + G.N) % G.N; if (rel >= r.len && rel < r.len + 8 && k.speed > 6) { k.air = true; k.y = r.h; k.vy = k.speed * (r.h / r.L) * 1.35 + 2.5; k.trick = false; if (!k.isAI) sfx('jump'); } }
  k.rampPrev = onRamp;
  if (k.air) { if (inp.drift && !k.trick) { k.trick = true; if (!k.isAI) toast('FIGURE !'); } if (k.isAI && !k.trick && Math.random() < dt * 2) k.trick = true; inp.drift = false; }

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
      if (c > 2.0) { k.boost = Math.max(k.boost, 1.1); k.boostPower = 1.45; sfx('boost'); if (!k.isAI) toast('SUPER MINI-TURBO'); }
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
    if (k.speed > 8 && k.fly <= 0) { k.speed *= 1 - loss * 0.6; if (!k.isAI && loss > 0.3) sfx('bump'); }
    k.heading += wrapAngle(th - k.heading) * (0.2 + loss * 0.45);
    if (k.drift.active && loss > 0.4) { k.drift.active = false; k.drift.charge = 0; }
  }

  // vertical motion
  if (!k.air) k.y = groundY;
  else { k.vy -= 32 * dt; k.y += k.vy * dt; if (k.y <= groundY) { k.y = groundY; k.air = false; if (k.trick) { k.boost = Math.max(k.boost, 0.7); k.boostPower = 1.35; sfx('boost'); } else k.speed *= 0.94; k.trick = false; } }
  // pits, dash pads
  if (!k.air && k.y <= 0.1 && k.fly <= 0) {
    if (k.pitGrace <= 0) for (const p of G.pits) { const rel = (k.idx - p.i0 + G.N) % G.N; if (rel < p.len && Math.abs(lateral) < hw) { k.pitGrace = 2;
      if (p.kind === 'water') { k.speed *= 0.3; if (stunKart(k, 0.8) && !k.isAI) toast('PLOUF !'); }
      else if (p.kind === 'works') { k.slowed = Math.max(k.slowed, 2.2); k.speed *= 0.6; if (!k.isAI) { toast('ZONE DE TRAVAUX !'); sfx('bump'); } }
      else if (p.kind === 'manif') { if (stunKart(k, 1.0) && !k.isAI) toast('PRIS DANS LA MANIF !'); } break; } }
    if (k.padGrace <= 0) for (const p of G.pads) { const rel = (k.idx - p.i0 + G.N) % G.N; if (rel < p.len && Math.abs(lateral) < hw) { k.padGrace = 2; k.boost = Math.max(k.boost, 0.9); k.boostPower = 1.5; if (!k.isAI) sfx('boost'); break; } }
  }
  // timers
  k.slip = Math.max(0, k.slip - dt); k.confused = Math.max(0, k.confused - dt); k.pitGrace = Math.max(0, k.pitGrace - dt); k.padGrace = Math.max(0, k.padGrace - dt); k.phantom = Math.max(0, k.phantom - dt);
  k.boost = Math.max(0, k.boost - dt); k.stun = Math.max(0, k.stun - dt); k.invincible = Math.max(0, k.invincible - dt); k.hazardGrace = Math.max(0, k.hazardGrace - dt);
  k.slowed = Math.max(0, k.slowed - dt); k.fly = Math.max(0, k.fly - dt); k.powerCd = Math.max(0, k.powerCd - dt);
  if (k.relance > 0) { k.relanceTimer -= dt; if (k.relanceTimer <= 0) { k.relance--; k.relanceTimer = 1.1; k.boost = 0.7; k.boostPower = 1.45; sfx('boost'); } }
  if (k.itemRolling > 0) { k.itemRolling -= dt; if (k.itemRolling <= 0) { k.item = k.pendingItem; k.pendingItem = null; if (!k.isAI) { sfx('pick'); setHint(ITEMS[k.item].hint); } else k.itemTimer = rand(0.8, 4); } }

  // visuals
  const m = k.mesh; const flyY = k.fly > 0 ? Math.min(5, k.fly > 3.5 ? (4 - k.fly) * 10 : k.fly < 0.5 ? k.fly * 10 : 5) : 0;
  m.position.set(k.pos.x, k.y + flyY, k.pos.z); m.rotation.y = k.heading; m.rotation.z = k.steer * 0.06 * sf + (k.air && k.trick ? Math.sin(G.time * 12) * 0.5 : 0);
  m.rotation.x = onRamp ? -onRamp.slope : k.air ? -clamp(k.vy * 0.035, -0.45, 0.45) : k.fly > 0 ? -0.12 : 0;
  const u = m.userData; u.wheels.forEach((w, i) => { w.rotation.x += k.speed * dt / 0.45; if (i < 2) w.rotation.y = -k.steer * 0.45; });
  const sparkOn = k.drift.active && k.drift.charge > 0.35;
  u.sparks.forEach(sp => { sp.visible = sparkOn; sp.material.color.setHex(k.drift.charge > 2 ? 0xff7a1a : k.drift.charge > 1 ? 0xffd34d : 0x7cc4ff); sp.scale.setScalar(0.7 + Math.random() * 0.8); });
  u.ring.visible = k.invincible > 0; if (u.ring.visible) u.ring.rotation.z += dt * 4;
  u.rotor.visible = k.fly > 0; if (u.rotor.visible) u.blades.forEach(b => { b.rotation.y += dt * 40; });
  u.driver.position.y = 0.75 + (k.stun > 0 ? Math.abs(Math.sin(G.time * 20)) * 0.3 : 0);
  m.visible = k.phantom > 0 ? (Math.floor(G.time * 14) % 2 === 0) : true;
}

// ---------- Items ----------
function pickupItems() {
  for (const b of G.itemBoxes) {
    b.mesh.rotation.y += 0.03; b.mesh.rotation.x += 0.01;
    if (!b.active) { b.timer -= 1 / 60; if (b.timer <= 0) { b.active = true; b.mesh.visible = true; } continue; }
    for (const k of G.karts) { if (k.item || k.itemRolling > 0 || k.finished || k.fly > 0) continue; const d = (k.pos.x - b.x) ** 2 + (k.pos.z - b.z) ** 2; if (d < 7) { b.active = false; b.timer = 3; b.mesh.visible = false; k.pendingItem = rollItem(k.rank); k.itemRolling = 1.1; if (!k.isAI) sfx('box'); break; } }
  }
}
function useItem(k) {
  if (!k.item || k.itemRolling > 0) return; const it = k.item; k.item = null;
  const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  if (it === 'turbo') { k.boost = 1.6; k.boostPower = 1.55; sfx('boost'); if (!k.isAI) toast('49.3 ! PASSAGE EN FORCE'); }
  else if (it === 'greve') { spawnHazard('barricade', k.pos.x - fx * 3.5, k.pos.z - fz * 3.5); k.hazardGrace = 1.0; sfx('drop'); }
  else if (it === 'sondage') { spawnHazard('fakebox', k.pos.x - fx * 3.5, k.pos.z - fz * 3.5); k.hazardGrace = 1.0; sfx('drop'); }
  else if (it === 'immunite') { k.invincible = 6; k.stun = 0; sfx('shield'); if (!k.isAI) toast('IMMUNITÉ PARLEMENTAIRE'); }
  else if (it === 'helico') { k.fly = 4; k.stun = 0; k.drift.active = false; sfx('helico'); if (!k.isAI) toast('HÉLICO PRÉSIDENTIEL'); }
  else if (it === 'relance') { k.relance = 3; k.relanceTimer = 0; if (!k.isAI) toast('PLAN DE RELANCE : 3 BOOSTS'); }
  else if (it === 'remaniement') { let n = 0; for (const o of G.karts) if (o !== k && o.rank < k.rank) { if (o.item) o.item = null; if (stunKart(o, 0.7)) n++; } sfx('motion'); toast(k.isAI ? 'REMANIEMENT SURPRISE !' : 'REMANIEMENT : ' + n + ' MINISTRES LIMOGÉS'); }
  else if (it === 'dossier') { const target = G.karts.find(o => o.rank === k.rank - 1 && !o.finished) || null; spawnProjectile('dossier', k, target); sfx('throw'); if (!k.isAI) toast('FUITE : MEDIAPART EST SUR LE COUP'); }
  else if (it === 'motion') { let target = G.karts.find(o => o.rank === 0); if (target === k) target = G.karts.find(o => o.rank === 1); spawnProjectile('motion', k, target); sfx('motion'); toast(k.isAI ? 'MOTION DE CENSURE DÉPOSÉE !' : 'MOTION DE CENSURE !'); }
  else if (it === 'bravm') { const ahead = G.karts.filter(o => o !== k && !o.finished && o.rank < k.rank).sort((a, b) => b.rank - a.rank).slice(0, 2); if (ahead.length) ahead.forEach(t => spawnProjectile('bravm', k, t)); else { spawnProjectile('bravm', k, null); spawnProjectile('bravm', k, null); } sfx('motion'); toast(k.isAI ? 'LA BRAV-M INTERVIENT !' : 'BRAV-M DÉPLOYÉE !'); }
  else if (it === 'lacrymo') { spawnHazard('lacrymo', k.pos.x - fx * 4, k.pos.z - fz * 4, k); k.hazardGrace = 1.2; sfx('drop'); if (!k.isAI) toast('NUAGE LACRYMOGÈNE LÂCHÉ'); }
  else if (it === 'casserolade') { let n = 0; for (const o of G.karts) if (o !== k) { const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z; if (Math.hypot(dx, dz) < 20) { o.speed *= 0.5; if (stunKart(o, 0.8)) n++; } } sfx('motion'); toast(k.isAI ? 'CASSEROLADE !' : 'CASSEROLADE : ' + n + ' SONNÉ' + (n > 1 ? 'S' : '')); }
  else if (it === 'dissolution') { let n = 0; for (const o of G.karts) if (o !== k && !o.finished) { if (stunKart(o, 0.9)) n++; } sfx('motion'); toast(k.isAI ? 'DISSOLUTION DE L’ASSEMBLÉE !' : 'DISSOLUTION : ' + n + ' KART' + (n > 1 ? 'S' : '') + ' SONNÉ' + (n > 1 ? 'S' : '')); }
  else if (it === 'niche') { k.invincible = 5; k.phantom = 5; k.boost = Math.max(k.boost, 0.6); k.boostPower = 1.3; k.stun = 0; sfx('shield'); if (!k.isAI) toast('NICHE FISCALE : INTOUCHABLE'); }
  if (!k.isAI) setHint('Ramassez une urne dorée pour obtenir un objet.');
}
function spawnHazard(type, x, z, extra) {
  const g = new THREE.Group(); let r = 2.2, life = 45, stun = 1.3;
  setCast(true);
  if (type === 'barricade') {
    g.add(box(2.6, 0.5, 0.25, 0xc8102e, 0, 1.0, 0)); [-0.9, 0, 0.9].forEach(o => g.add(box(0.5, 0.5, 0.27, 0xffffff, o, 1.0, 0)));
    [-1.0, 1.0].forEach(o => { g.add(box(0.15, 1.3, 0.15, 0x333333, o, 0.65, 0.25)); g.add(box(0.15, 1.3, 0.15, 0x333333, o, 0.65, -0.25)); });
    g.add(box(0.8, 0.5, 0.05, 0xc8102e, 0.9, 1.8, 0)); g.add(cyl(0.04, 0.04, 2.2, 0x333333, 0.5, 1.1, 0, 5)); g.rotation.y = rand(0, 6.28);
  } else if (type === 'fakebox') {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0x6a4a00, transparent: true, opacity: 0.9, roughness: 0.3, metalness: 0.4 })); m.position.y = 1.4; g.add(m); G.animated.push(dt => { m.rotation.y -= dt * 1.8; m.rotation.x -= dt * 0.6; }); r = 2.4; life = 40; stun = 1.4;
  } else if (type === 'lisier') {
    const pl = new THREE.Mesh(new THREE.CircleGeometry(4.2, 18), new THREE.MeshStandardMaterial({ color: 0x5a3b1e, roughness: 1 })); pl.rotation.x = -Math.PI / 2; pl.position.y = 0.1; pl.scale.set(1.3, 1, 1); g.add(pl);
    for (let i = 0; i < 7; i++) { const sp = new THREE.Mesh(new THREE.CircleGeometry(rand(0.5, 1.2), 10), mat(0x3f2a14)); sp.rotation.x = -Math.PI / 2; sp.position.set(rand(-4, 4), 0.11, rand(-3, 3)); g.add(sp); }
    r = 4.4; life = 30; stun = 0;
  } else if (type === 'lacrymo') {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd4dcb2, transparent: true, opacity: 0.55, roughness: 1 })); cloud.position.y = 1.5; cloud.scale.y = 0.65; g.add(cloud);
    for (let i = 0; i < 4; i++) { const pf = new THREE.Mesh(new THREE.SphereGeometry(rand(1.3, 2.1), 8, 6), new THREE.MeshStandardMaterial({ color: 0xe2e6c8, transparent: true, opacity: 0.4, roughness: 1 })); pf.position.set(rand(-2, 2), 1.3 + rand(-0.3, 0.8), rand(-2, 2)); g.add(pf); }
    r = 4.2; life = 7; stun = 0;
  } else if (type === 'rondpoint') {
    g.add(cyl(4.2, 4.4, 0.7, 0x8a8a84, 0, 0.35, 0, 24)); g.add(cyl(3.2, 3.2, 0.4, 0x5f9a48, 0, 0.9, 0, 24)); g.add(cyl(0.4, 0.4, 5, 0xc0c0c0, 0, 3.2, 0, 8)); [-0.8, 0, 0.8].forEach(o => g.add(box(0.4, 2.4, 0.4, 0xc0c0c0, o, 6.5, 0)));
    const sign = textPlane(2.4, 1.0, 'CÉDEZ', '#fff', '#c8102e', 80); sign.position.set(0, 2.2, 4.3); g.add(sign); g.add(cyl(0.05, 0.05, 2.2, 0x555555, 0, 1.1, 4.3, 5));
    r = 5.2; life = 18; stun = 1.0;
  }
  g.position.set(x, 0, z); G.scene.add(g); G.hazards.push({ type, x, z, mesh: g, life, r, stun, owner: extra || null });
}
function spawnProjectile(type, owner, target) {
  const g = new THREE.Group();
  if (type === 'dossier') { g.add(box(0.9, 0.12, 1.1, 0xb98b4e, 0, 0, 0)); g.add(box(0.7, 0.14, 0.9, 0xfff5dd, 0, 0.02, 0)); g.add(box(0.3, 0.16, 0.12, 0xc8102e, 0.2, 0.02, 0.5)); }
  else if (type === 'bravm') {
    g.add(box(0.55, 0.45, 1.8, 0x14141e, 0, 0.75, 0)); g.add(box(0.6, 0.35, 0.6, 0x20202c, 0, 1.0, -0.4));
    const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.22, 12); wg.rotateZ(Math.PI / 2); [0.85, -0.85].forEach(zz => { const w = new THREE.Mesh(wg, mat(0x111111)); w.position.set(0, 0.5, zz); g.add(w); });
    g.add(cyl(0.18, 0.2, 0.9, 0x2b2b38, 0, 1.4, -0.35, 8)); g.add(sph(0.28, 0x3a3a46, 0, 1.95, -0.35, 10));           // rider torso + helmet
    g.add(box(0.5, 0.2, 0.2, 0x111118, 0, 1.3, 0.75)); const bl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: 0x3a6bff })); bl.position.set(0, 1.6, 0.1); g.add(bl);
    g.userData.blink = bl;
  }
  else { g.add(box(1.0, 0.8, 1.0, 0xc8102e, 0, 0, 0)); g.add(box(1.1, 0.2, 1.1, 0xfff5dd, 0, 0.5, 0)); g.add(cone(0.5, 0.8, 0xf2c14e, 0, 1.0, 0, 6)); }
  const fx = Math.sin(owner.heading), fz = Math.cos(owner.heading); const sidespawn = type === 'bravm' ? (Math.random() < 0.5 ? 2 : -2) : 0;
  const p = { type, x: owner.pos.x + fx * 3 + (-fz) * sidespawn, z: owner.pos.z + fz * 3 + fx * sidespawn, y: type === 'motion' ? 1.5 : type === 'bravm' ? 0 : 1.0, dx: fx, dz: fz, owner, target, speed: type === 'motion' ? 85 : type === 'bravm' ? 74 : 62, life: type === 'motion' ? 12 : type === 'bravm' ? 8 : 5, mesh: g, idx: owner.idx };
  g.position.set(p.x, p.y, p.z); G.scene.add(g); G.projectiles.push(p);
}
function stunKart(k, dur) { if (k.invincible > 0 || k.fly > 0) return false; k.stun = Math.max(k.stun, dur); k.drift.active = false; k.drift.charge = 0; k.boost = 0; if (k === G.player) sfx('hit'); return true; }

// ---------- Special powers ----------
function usePower(k) {
  if (k.powerCd > 0 || k.stun > 0 || G.state !== 'race' || k.finished) return;
  const id = k.def.power.id; const fx = Math.sin(k.heading), fz = Math.cos(k.heading); const me = !k.isAI;
  if (id === 'rattrapage' && k.rank < 3) { if (me) toast('TEMPS DE PAROLE : SEULEMENT À PARTIR DE LA 4e PLACE'); return; }
  k.powerCd = k.def.power.cd || CFG.powerCooldown; k.powerUses++;
  if (id === 'elements') { let n = 0; for (const o of G.karts) if (o !== k && (o.pos.x - k.pos.x) ** 2 + (o.pos.z - k.pos.z) ** 2 < 2500) { o.confused = 3; n++; } sfx('shield'); toast(me ? 'ÉLÉMENTS DE LANGAGE : ' + n + ' ADVERSAIRE' + (n > 1 ? 'S' : '') + ' RECADRÉ' + (n > 1 ? 'S' : '') : (G.player.confused > 0 ? 'ÉLÉMENTS DE LANGAGE : COMMANDES INVERSÉES !' : 'CONFÉRENCE DE PRESSE DE BERNADETTE')); return; }
  if (id === 'audience') { const t = G.karts.find(o => o.rank === k.rank - 1); if (t && t.item && t.itemRolling <= 0) { k.item = t.item; t.item = null; if (t === G.player) toast('VOTRE OBJET A ÉTÉ VOLÉ !'); } else { k.item = rollItem(k.rank); } k.itemRolling = 0; sfx('pick'); if (me) { toast('VOL D’AUDIENCE : ' + ITEMS[k.item].name.toUpperCase()); setHint(ITEMS[k.item].hint); } return; }
  if (id === 'examen') { const t = G.karts.find(o => o.rank === k.rank - 1 && !o.finished); if (t) { t.item = null; stunKart(t, 1.8); sfx('motion'); toast(me ? 'MISE EN EXAMEN DE ' + t.def.name.toUpperCase() : (t === G.player ? 'VOUS ÊTES MIS·E EN EXAMEN !' : 'MISE EN EXAMEN SUR LE CIRCUIT')); } else { k.boost = 1.4; k.boostPower = 1.4; sfx('boost'); if (me) toast('NON-LIEU : PERSONNE DEVANT, BOOST'); } return; }
  if (id === 'epandage') { for (let i = 1; i <= 2; i++) { const s = G.samples[(k.idx - i * 5 + G.N) % G.N]; spawnHazard('lisier', s.x + s.sx * (i % 2 ? 2.5 : -2.5), s.z + s.sz * (i % 2 ? 2.5 : -2.5), k); } sfx('drop'); toast(me ? 'ÉPANDAGE EN COURS' : 'ÉPANDAGE DE PATRICK !'); return; }
  if (id === 'rattrapage') { k.boost = 2.6; k.boostPower = 1.7; k.stun = 0; sfx('boost'); toast(me ? 'TEMPS DE PAROLE : RATTRAPAGE !' : 'LUCIE REVIENT DANS LA COURSE'); return; }
  if (id === 'debat') { for (const o of G.karts) if (o !== k) o.slowed = 3; sfx('shield'); toast(me ? 'GRAND DÉBAT : TOUT LE MONDE ÉCOUTE' : k.def.name + ' LANCE UN GRAND DÉBAT'); }
  else if (id === 'blocage') { for (let i = 1; i <= 4; i++) { const lat = (i % 2 ? 1 : -1) * 3.2; const s = G.samples[(k.idx - i * 4 + G.N) % G.N]; spawnHazard('barricade', s.x + s.sx * lat, s.z + s.sz * lat); } k.hazardGrace = 1.5; sfx('drop'); toast(me ? 'GRÈVE GÉNÉRALE !' : 'GRÈVE GÉNÉRALE DÉCLARÉE'); }
  else if (id === 'rondpoint') { const s = G.samples[(k.idx + 18) % G.N]; spawnHazard('rondpoint', s.x, s.z, k); sfx('drop'); toast(me ? 'ROND-POINT INAUGURÉ' : 'UN ROND-POINT APPARAÎT'); }
  else if (id === 'zfe') { let n = 0; for (const o of G.karts) if (o !== k && (o.pos.x - k.pos.x) ** 2 + (o.pos.z - k.pos.z) ** 2 < 1600) { if (stunKart(o, 1.3)) n++; } k.boost = 1.2; k.boostPower = 1.4; sfx('boost'); toast(me ? 'ZFE : ' + n + ' VIGNETTE' + (n > 1 ? 'S' : '') + ' REFUSÉE' + (n > 1 ? 'S' : '') : 'ZONE À FAIBLES ÉMISSIONS !'); }
  else if (id === 'amendement') {
    const t = G.karts.find(o => o.rank === k.rank - 1 && !o.finished);
    if (t) { const p = { ...k.pos }, h = k.heading, i = k.idx, l = k.lap, sp = k.speed; k.pos.x = t.pos.x; k.pos.z = t.pos.z; k.heading = t.heading; k.idx = t.idx; k.lap = t.lap; t.pos.x = p.x; t.pos.z = p.z; t.heading = h; t.idx = i; t.lap = l; k.speed = Math.max(sp, t.speed); t.speed *= 0.6; k.maxLap = Math.max(k.maxLap, k.lap); k.hazardGrace = 1; t.hazardGrace = 1; sfx('shield'); toast(me ? 'AMENDEMENT ADOPTÉ : PLACE ÉCHANGÉE' : 'AMENDEMENT DE DERNIÈRE MINUTE !'); }
    else { k.boost = 1.4; k.boostPower = 1.4; sfx('boost'); toast(me ? 'AMENDEMENT : PERSONNE DEVANT, BOOST' : ''); }
  }
  else if (id === 'megaphone') {
    let n = 0; for (const o of G.karts) if (o !== k) { const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z; const d = Math.hypot(dx, dz); if (d < 22) { const push = (22 - d) * 0.45; o.pos.x += dx / d * push; o.pos.z += dz / d * push; o.speed *= 0.3; if (stunKart(o, 0.9)) n++; } }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 6, 32), new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.8 })); ring.rotation.x = Math.PI / 2; ring.position.set(k.pos.x, 1, k.pos.z); G.scene.add(ring); let life = 0.7; const fn = dt => { life -= dt; ring.scale.setScalar(1 + (0.7 - life) * 30); ring.material.opacity = Math.max(0, life); if (life <= 0) { G.scene.remove(ring); G.animated.splice(G.animated.indexOf(fn), 1); } }; G.animated.push(fn);
    sfx('motion'); toast(me ? 'MÉGAPHONE : ' + n + ' KART' + (n > 1 ? 'S' : '') + ' REPOUSSÉ' + (n > 1 ? 'S' : '') : 'LE MÉGAPHONE DE LULU !');
  }
}

function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i]; p.life -= dt;
    if (p.target && (p.target.finished || p.target.fly > 0)) p.target = null;
    if (p.target) { const dx = p.target.pos.x - p.x, dz = p.target.pos.z - p.z; const d = Math.hypot(dx, dz) || 1; const want = Math.atan2(dx, dz), cur = Math.atan2(p.dx, p.dz); const a = cur + clamp(wrapAngle(want - cur), -3.5 * dt, 3.5 * dt); p.dx = Math.sin(a); p.dz = Math.cos(a); if (p.type === 'motion') p.y = d > 20 ? 5 : lerp(5, 1, 1 - d / 20); }
    else if (p.type === 'dossier') {
      const N = G.N; let best = p.idx, bd = Infinity; for (let o = 0; o <= 14; o++) { const j = (p.idx + o) % N; const s = G.samples[j]; const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2; if (d < bd) { bd = d; best = j; } } p.idx = best;
      const t = G.samples[(best + 8) % N]; const a = Math.atan2(t.x - p.x, t.z - p.z); p.dx = Math.sin(a); p.dz = Math.cos(a);
    }
    p.x += p.dx * p.speed * dt; p.z += p.dz * p.speed * dt;
    p.mesh.position.set(p.x, p.y, p.z); p.mesh.rotation.y += dt * 9;
    let hit = false;
    if (p.mesh.userData.blink) p.mesh.userData.blink.material.color.setHex(Math.floor(G.time * 10) % 2 ? 0x3a6bff : 0xff3a4a);
    for (const k of G.karts) { if (k === p.owner && p.life > (p.type === 'motion' ? 11.5 : p.type === 'bravm' ? 7.4 : 4.6)) continue; if (p.type === 'motion' && k !== p.target) continue; if (k.fly > 0 || k.y > 1.5) continue; const d = (k.pos.x - p.x) ** 2 + (k.pos.z - p.z) ** 2; if (d < 6.5) { stunKart(k, p.type === 'motion' ? 2.6 : p.type === 'bravm' ? 1.7 : 1.5); if (k === G.player) toast(p.type === 'motion' ? 'GOUVERNEMENT RENVERSÉ !' : p.type === 'bravm' ? 'INTERPELLÉ PAR LA BRAV-M !' : 'MEDIAPART ENQUÊTE SUR VOUS !'); hit = true; break; } }
    if (hit || p.life <= 0) { G.scene.remove(p.mesh); G.projectiles.splice(i, 1); }
  }
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i]; h.life -= dt; let hit = false;
    for (const k of G.karts) { if ((k.hazardGrace > 0 && h.type !== 'obstacle' && h.type !== 'lacrymo') || k.fly > 0 || k === h.owner || k.y > 1.2) continue; const d = (k.pos.x - h.x) ** 2 + (k.pos.z - h.z) ** 2; if (d < h.r * h.r) {
      if (h.type === 'lacrymo') { if (k.slowed <= 0 && k === G.player) toast('GAZ LACRYMOGÈNE !'); k.slowed = Math.max(k.slowed, 1.3); k.confused = Math.max(k.confused, 1.0); }
      else if (h.type === 'lisier') { if (k.slip <= 0 && k === G.player) toast('LISIER : ÇA GLISSE !'); k.slip = Math.max(k.slip, 0.4); }
      else if (h.type === 'obstacle') { const dx = k.pos.x - h.x, dz = k.pos.z - h.z, dd = Math.hypot(dx, dz) || 1; k.pos.x = h.x + dx / dd * h.r; k.pos.z = h.z + dz / dd * h.r; if (k.speed > 12) { k.speed *= 0.55; if (k === G.player) sfx('bump'); } }
      else if (h.type === 'rondpoint') { const dx = k.pos.x - h.x, dz = k.pos.z - h.z, dd = Math.hypot(dx, dz) || 1; k.pos.x = h.x + dx / dd * h.r; k.pos.z = h.z + dz / dd * h.r; if (k.speed > 10) { k.speed *= 0.4; if (stunKart(k, h.stun) && k === G.player) toast('PRIORITÉ AU ROND-POINT !'); k.hazardGrace = 0.8; } }
      else { if (stunKart(k, h.stun) && k === G.player) toast(h.type === 'fakebox' ? 'SONDAGE TRUQUÉ !' : 'BLOQUÉ PAR LA GRÈVE !'); hit = true; break; } } }
    if (hit || h.life <= 0) { G.scene.remove(h.mesh); G.hazards.splice(i, 1); }
  }
}
function kartCollisions() {
  for (let i = 0; i < G.karts.length; i++) for (let j = i + 1; j < G.karts.length; j++) {
    const a = G.karts[i], b = G.karts[j]; if (a.fly > 0 || b.fly > 0) continue; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z; const d = Math.hypot(dx, dz);
    if (d < 2.6 && d > 0.001) {
      const push = (2.6 - d) / 2; const nx = dx / d, nz = dz / d; const wa = a.stats.weight, wb = b.stats.weight; const ta = wb / (wa + wb), tb = wa / (wa + wb);
      a.pos.x -= nx * push * 2 * ta; a.pos.z -= nz * push * 2 * ta; b.pos.x += nx * push * 2 * tb; b.pos.z += nz * push * 2 * tb;
      a.speed *= 0.97; b.speed *= 0.97;
      if (a.invincible > 0 && b.invincible <= 0) stunKart(b, 1.2); if (b.invincible > 0 && a.invincible <= 0) stunKart(a, 1.2);
      if (a === G.player || b === G.player) sfx('bump');
    }
  }
}

// ---------- Camera & sun ----------
function updateCamera(dt) {
  const k = G.player; const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  const back = k.speed < -2 ? -11 : 12 - Math.min(2, k.boost * 2);
  const ty = 6.2 + (k.fly > 0 ? 3 : 0) + k.y * 0.6;
  const tx = k.pos.x - fx * back, tz = k.pos.z - fz * back;
  const a = 1 - Math.exp(-dt * (G.state === 'countdown' ? 1.6 : 6));
  camera.position.x = lerp(camera.position.x, tx, a); camera.position.z = lerp(camera.position.z, tz, a); camera.position.y = lerp(camera.position.y, ty, a);
  camera.lookAt(k.pos.x + fx * 5, 1.2 + k.mesh.position.y * 0.5, k.pos.z + fz * 5);
  camera.fov = lerp(camera.fov, k.boost > 0 ? 76 : 65, 1 - Math.exp(-dt * 5)); camera.updateProjectionMatrix();
  if (G.sun) { G.sun.position.set(k.pos.x + 120, 200, k.pos.z + 80); G.sun.target.position.set(k.pos.x, 0, k.pos.z); G.sun.target.updateMatrixWorld(); }
}

// ---------- HUD ----------
const hud = { pos: $('h-pos'), lap: $('h-lap'), time: $('h-time'), item: $('h-item'), hint: $('h-hint'), speed: $('h-speed'), drift: $('h-drift'), center: $('h-center'), toast: $('h-toast'), wrong: $('h-wrong'), power: $('h-power'), pbar: $('h-pbar'), pkey: $('h-pkey') };
const mm = $('minimap').getContext('2d'); let mmScale = 1, mmOffX = 0, mmOffZ = 0; let mmBase = null;
function drawMinimapBase() {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of G.samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
  const W = 300, pad = 26; mmScale = Math.min((W - pad * 2) / (maxX - minX), (W - pad * 2) / (maxZ - minZ)); mmOffX = (W - (maxX - minX) * mmScale) / 2 - minX * mmScale; mmOffZ = (W - (maxZ - minZ) * mmScale) / 2 - minZ * mmScale;
  const cv = document.createElement('canvas'); cv.width = cv.height = W; const c = cv.getContext('2d');
  c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); G.samples.forEach((s, i) => { const x = s.x * mmScale + mmOffX, y = W - (s.z * mmScale + mmOffZ); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath();
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 10; c.stroke(); c.strokeStyle = '#3a3b40'; c.lineWidth = 6; c.stroke();
  const s0 = G.samples[0]; c.fillStyle = '#f2c14e'; c.beginPath(); c.arc(s0.x * mmScale + mmOffX, W - (s0.z * mmScale + mmOffZ), 6, 0, 7); c.fill();
  mmBase = cv;
}
function drawMinimap() {
  const W = 300; mm.clearRect(0, 0, W, W); mm.drawImage(mmBase, 0, 0);
  for (const k of G.karts) { const x = k.pos.x * mmScale + mmOffX, y = W - (k.pos.z * mmScale + mmOffZ); mm.beginPath(); mm.arc(x, y, k === G.player ? 9 : 6, 0, 7); mm.fillStyle = hex(k.def.kart); mm.fill(); mm.lineWidth = k === G.player ? 3 : 1.5; mm.strokeStyle = k === G.player ? '#fff' : 'rgba(0,0,0,.6)'; mm.stroke(); }
}
let lastItemShown = '', lastPowerReady = null;
function updateHUD() {
  const k = G.player;
  hud.pos.innerHTML = (k.rank + 1) + '<small>' + (k.rank === 0 ? 'er' : 'e') + '</small>';
  hud.lap.textContent = k.finished ? 'ARRIVÉE' : 'TOUR ' + Math.min(k.lap + 1, CFG.laps) + '/' + CFG.laps;
  hud.time.textContent = fmtTime(k.finished ? k.finishTime : G.time) + (k.bestLap < Infinity ? '  ·  meilleur tour ' + fmtTime(k.bestLap) : '');
  hud.speed.textContent = Math.round(Math.abs(k.speed) * 3.2);
  hud.drift.style.width = (clamp(k.drift.charge / 2, 0, 1) * 100) + '%'; hud.drift.style.background = k.drift.charge > 2 ? '#ff7a1a' : k.drift.charge > 1 ? '#ffd34d' : '#7cc4ff';
  let shown;
  if (k.itemRolling > 0) { const keys = Object.keys(ITEMS); const it = ITEMS[keys[Math.floor(G.time * 12) % keys.length]]; shown = it.icon + '|…'; }
  else if (k.item) shown = ITEMS[k.item].icon + '|' + ITEMS[k.item].name; else shown = '·|aucun objet';
  if (shown !== lastItemShown) { lastItemShown = shown; const [ico, nm] = shown.split('|'); hud.item.querySelector('.ico').textContent = ico; hud.item.querySelector('.nm').textContent = nm; hud.item.classList.toggle('has', !!k.item); }
  const ready = k.powerCd <= 0; hud.pbar.style.width = ((1 - k.powerCd / (k.def.power.cd || CFG.powerCooldown)) * 100) + '%';
  if (ready !== lastPowerReady) { lastPowerReady = ready; hud.power.classList.toggle('ready', ready); hud.pkey.textContent = ready ? 'F · PRÊT !' : 'F · recharge'; }
  const s = G.samples[k.idx]; const dot = Math.sin(k.heading) * s.tx + Math.cos(k.heading) * s.tz;
  G.wrongTimer = (dot < -0.2 && k.speed > 3 && !k.finished) ? G.wrongTimer + 1 / 60 : 0; hud.wrong.hidden = G.wrongTimer < 1.2;
  drawMinimap();
}
function setHint(t) { hud.hint.textContent = t; }
function toast(t) { if (!t) return; hud.toast.textContent = t; hud.toast.classList.add('on'); G.toastTimer = 2.2; }

// ---------- Results ----------
function onPlayerFinish() { G.resultsAt = G.time + 5; toast('ARRIVÉE ! ' + ordinal(G.player.rank + 1)); sfx('finish'); }
function showResults() {
  G.state = 'results'; $('hud').hidden = true;
  const order = [...G.karts].sort((a, b) => a.rank - b.rank);
  const p = G.player; const msgs = ['Majorité absolue ! Vous gouvernez seul·e.', 'Second tour obligatoire, mais c’est bien parti.', 'Sur le podium : un poste de ministre vous attend.', 'Coalition nécessaire. Négociations en cours.', 'Score en demi-teinte. Les sondages pardonnent peu.', 'Dernière place : retour à la base, pour écouter le pays.'];
  $('r-sub').textContent = ordinal(p.rank + 1) + ' sur ' + G.karts.length + ' — ' + msgs[p.rank] + (p.bestLap < Infinity ? '  ·  Meilleur tour : ' + fmtTime(p.bestLap) : '') + '  ·  Pouvoir utilisé ' + p.powerUses + '×';
  $('r-body').innerHTML = order.map(k => '<tr class="' + (k === p ? 'you' : '') + '"><td class="r">' + ordinal(k.rank + 1) + '</td><td><b>' + k.def.name + '</b><br><span style="font-size:12px;color:var(--muted)">' + k.def.title + '</span></td><td class="t">' + (k.finished ? fmtTime(k.finishTime) : 'en course…') + '</td></tr>').join('');
  showScreen('s-results');
}

// ---------- Input ----------
const keys = {};
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (keys[e.code]) return; keys[e.code] = true;
  if (G.state === 'race' && ['ControlLeft', 'ControlRight', 'KeyE', 'Enter'].includes(e.code)) useItem(G.player);
  if (G.state === 'race' && ['KeyF', 'ShiftLeft', 'ShiftRight'].includes(e.code)) usePower(G.player);
  if (e.code === 'Escape') { if (G.state === 'race' || G.state === 'countdown') pause(); else if (G.state === 'paused') resume(); }
  if (e.code === 'KeyM') { toggleMute(); syncMuteButton(); }
  if (e.code === 'Enter' && G.state === 'title') $('b-play').click();
  if (e.code === 'Enter' && G.state === 'results') $('b-again').click();
  if (G.state === 'select' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) selectChar((G.charIdx + (e.code === 'ArrowRight' ? 1 : CHARACTERS.length - 1)) % CHARACTERS.length);
  if (G.state === 'select' && e.code === 'Enter') $('b-next1').click();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function inputState() { return { throttle: keys.ArrowUp || keys.KeyW, brake: keys.ArrowDown || keys.KeyS, left: keys.ArrowLeft || keys.KeyA, right: keys.ArrowRight || keys.KeyD, drift: !!keys.Space }; }

// ---------- Screens ----------
const SCREENS = ['s-title', 's-select', 's-tracks', 's-pause', 's-results', 's-admin'];
function showScreen(id) { SCREENS.forEach(s => { $(s).hidden = s !== id; }); }
function pause() { G.state = 'paused'; showScreen('s-pause'); }
function resume() { G.state = G.countdown > 0 ? 'countdown' : 'race'; showScreen(null); lastFrame = performance.now(); }

// ---------- Select screen: rendered portraits + 3D showcase ----------
function ensurePreviewScene() {
  if (G.previewScene) return;
  const s = new THREE.Scene(); s.background = new THREE.Color(0x0c1230);
  s.add(new THREE.HemisphereLight(0xffffff, 0x334466, 0.9)); s.add(new THREE.AmbientLight(0xffffff, 0.2));
  const d = new THREE.DirectionalLight(0xfff4d6, 1.1); d.position.set(5, 10, 6); d.castShadow = true; d.shadow.mapSize.set(1024, 1024); const sc = d.shadow.camera; sc.left = sc.bottom = -8; sc.right = sc.top = 8; s.add(d);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshStandardMaterial({ color: 0x1f2a5e, roughness: 0.9 })); disc.rotation.x = -Math.PI / 2; disc.receiveShadow = true; s.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: 0xf2c14e })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; s.add(ring);
  G.previewScene = s; G.previewHolder = new THREE.Group(); s.add(G.previewHolder);
}
function setPreview(i) {
  ensurePreviewScene();
  while (G.previewHolder.children.length) { const c = G.previewHolder.children[0]; G.previewHolder.remove(c); disposeScene(c); }
  setCast(true); G.previewKart = buildKart(CHARACTERS[i]); G.previewHolder.add(G.previewKart);
}
function renderPreview(dt) {
  if (!G.previewKart) setPreview(G.charIdx);
  G.previewKart.rotation.y += dt * 0.7;
  const wide = window.innerWidth > 760 && G.state === 'select'; const sx = wide ? -2.9 : 0, sy = wide ? 0 : 0.6;
  camera.position.set(sx, 3.6, 10.5); camera.lookAt(sx, 1.4 + sy, 0); camera.fov = 38; camera.updateProjectionMatrix(); renderer.render(G.previewScene, camera);
}
function makeThumbs() {
  // Render each character once into a small square and keep the data URL for the roster tiles.
  const poly = getPoly();
  if (G.thumbPoly === poly) return; G.thumbPoly = poly; G.thumbs = {};
  ensurePreviewScene(); const keep = G.previewKart; const prevChildren = [...G.previewHolder.children]; prevChildren.forEach(c => G.previewHolder.remove(c));
  renderer.setSize(220, 220, false); camera.aspect = 1; camera.fov = 34; camera.updateProjectionMatrix(); camera.position.set(0.8, 3.2, 7.5); camera.lookAt(0, 1.7, 0);
  CHARACTERS.forEach(c => { const k = buildKart(c); k.rotation.y = -0.5; G.previewHolder.add(k); renderer.render(G.previewScene, camera); G.thumbs[c.id] = renderer.domElement.toDataURL('image/png'); G.previewHolder.remove(k); disposeScene(k); });
  prevChildren.forEach(c => G.previewHolder.add(c)); G.previewKart = keep; resize();
}
function selectChar(i) {
  G.charIdx = i; [...$('roster').children].forEach((e, j) => e.classList.toggle('sel', j === i)); setPreview(i);
  const c = CHARACTERS[i]; const lbl = { speed: 'Vitesse', accel: 'Accélération', handling: 'Tenue de route' };
  $('showcase').innerHTML = '<div class="big">' + c.name + '</div><div class="title">' + c.title + '</div><div class="quote">' + c.quote + '</div>' +
    '<div class="stats">' + ['speed', 'accel', 'handling'].map(s => '<div class="stat"><span>' + lbl[s] + '</span><div class="bar"><i style="width:' + Math.round((c.stats[s] - 0.6) / 0.6 * 100) + '%"></i></div></div>').join('') + '</div>' +
    '<div class="powerbox"><b>Pouvoir : ' + c.power.name + '</b><p>' + c.power.desc + ' <span style="color:var(--muted)">(touche F)</span></p></div>';
}
function buildRoster() {
  makeThumbs(); const wrap = $('roster'); wrap.innerHTML = '';
  CHARACTERS.forEach((c, i) => { const el = document.createElement('button'); el.className = 'tile' + (i === G.charIdx ? ' sel' : ''); el.type = 'button'; el.innerHTML = '<img alt="' + c.name + '" src="' + G.thumbs[c.id] + '"><div class="tname">' + c.name + '</div>'; el.addEventListener('click', () => { initAudio(); selectChar(i); }); wrap.appendChild(el); });
  selectChar(G.charIdx);
}
function buildTrackCards() {
  const wrap = $('trackcards'); wrap.innerHTML = '';
  TRACKS.forEach((t, i) => {
    const el = document.createElement('button'); el.className = 'card' + (i === G.trackIdx ? ' sel' : ''); el.type = 'button';
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 150; const c = cv.getContext('2d');
    const pts = t.points; let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity; pts.forEach(p => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); });
    const sc = Math.min(200 / (maxX - minX), 110 / (maxZ - minZ)); const ox = 120 - (minX + maxX) / 2 * sc, oz = 75 + (minZ + maxZ) / 2 * sc;
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], 0, p[1])), true, 'catmullrom', 0.5); const sp = curve.getPoints(200);
    c.beginPath(); sp.forEach((p, j) => { const x = p.x * sc + ox, y = oz - p.z * sc; j ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.lineJoin = 'round'; c.strokeStyle = '#f6f1e4'; c.lineWidth = 9; c.stroke(); c.strokeStyle = '#3a3b40'; c.lineWidth = 5; c.stroke();
    c.fillStyle = '#f2c14e'; c.beginPath(); c.arc(pts[0][0] * sc + ox, oz - pts[0][1] * sc, 5, 0, 7); c.fill();
    el.innerHTML = '<div class="name">' + t.name + '</div>'; el.appendChild(cv); const d = document.createElement('div'); d.className = 'desc'; d.textContent = t.desc; el.appendChild(d);
    el.addEventListener('click', () => { G.trackIdx = i; [...wrap.children].forEach((e, j) => e.classList.toggle('sel', j === i)); });
    wrap.appendChild(el);
  });
}

// ---------- Admin workshop ----------
const esc = t => String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function readImage(file, max, cb) {
  const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const sc = Math.min(1, max / Math.max(im.width, im.height)); const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(im.width * sc)); cv.height = Math.max(1, Math.round(im.height * sc)); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); cb(cv.toDataURL('image/jpeg', 0.82)); }; im.src = r.result; }; r.readAsDataURL(file);
}
function buildAdmin() {
  const wrap = $('admin-chars'); wrap.innerHTML = '';
  CHARACTERS.forEach((c, i) => {
    const custom = getCustom();
    const o = custom.chars[c.id] || (custom.chars[c.id] = {}); const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = '<div class="name">' + esc(BASE[i].name) + ' <span style="font-size:12px;color:var(--muted);font-family:var(--font-body)">· ' + esc(c.power.name) + '</span></div>' +
      '<label>Nom<input type="text" data-k="name" maxlength="28" id="adm-name-' + c.id + '" value="' + esc(c.name) + '"></label>' +
      '<label>Titre<input type="text" data-k="title" maxlength="40" id="adm-title-' + c.id + '" value="' + esc(c.title) + '"></label>' +
      '<label>Réplique<input type="text" data-k="quote" maxlength="64" id="adm-quote-' + c.id + '" value="' + esc(c.quote) + '"></label>' +
      '<div class="colors"><label>Veste<input type="color" data-k="suit" id="adm-suit-' + c.id + '" value="' + hex(c.look.suit) + '"></label><label>Kart<input type="color" data-k="kart" id="adm-kart-' + c.id + '" value="' + hex(c.kart) + '"></label>' +
      '<label>Livrée (image)<input type="file" accept="image/*" data-k="livery" id="adm-livery-' + c.id + '"></label><img class="livery" alt="" id="adm-livimg-' + c.id + '"' + (c.livery ? ' src="' + c.livery + '"' : '') + '></div>';
    el.querySelectorAll('input[type=text],input[type=color]').forEach(inp => inp.addEventListener('input', () => { o[inp.dataset.k] = inp.value; }));
    el.querySelector('input[type=file]').addEventListener('change', ev => { const f = ev.target.files && ev.target.files[0]; if (!f) return; readImage(f, 512, url => { o.livery = url; $('adm-livimg-' + c.id).src = url; }); });
    wrap.appendChild(el);
  });
  renderAdPreview();
}
function renderAdPreview() { $('ad-preview').innerHTML = getCustom().ads.map(u => '<img alt="" src="' + u + '">').join('') || '<span class="disclaimer">Aucune affiche personnalisée : les panneaux du jeu sont utilisés.</span>'; }
$('ad-files').addEventListener('change', ev => { const files = [...(ev.target.files || [])].slice(0, 8); if (!files.length) return; const custom = getCustom(); custom.ads = []; let left = files.length; files.forEach((f, i) => readImage(f, 640, url => { custom.ads[i] = url; if (--left === 0) renderAdPreview(); })); });
$('b-admin').addEventListener('click', () => { buildAdmin(); showScreen('s-admin'); G.state = 'admin'; });
$('b-admin-save').addEventListener('click', () => { applyCustom(); const ok = saveCustom(); if (G.previewHolder) setPreview(G.charIdx); showScreen('s-title'); G.state = 'title'; $('b-admin').textContent = ok ? 'Atelier (admin) · enregistré' : 'Atelier (admin) · non sauvegardé (stockage plein)'; });
$('b-admin-reset').addEventListener('click', () => { resetCustom(); buildAdmin(); if (G.previewHolder) setPreview(G.charIdx); });
loadCustom();

// buttons
$('b-play').addEventListener('click', () => { initAudio(); buildRoster(); showScreen('s-select'); G.state = 'select'; });
$('b-poly').addEventListener('click', () => { const poly = togglePoly(); $('b-poly').textContent = poly === 'low' ? 'Graphismes : légers (low-poly)' : 'Graphismes : détaillés (ombres)'; if (G.previewHolder) setPreview(G.charIdx); });
$('b-mute').addEventListener('click', () => { initAudio(); toggleMute(); syncMuteButton(); });
$('b-back1').addEventListener('click', () => { showScreen('s-title'); G.state = 'title'; });
$('b-next1').addEventListener('click', () => { buildTrackCards(); showScreen('s-tracks'); G.state = 'tracks'; });
$('b-back2').addEventListener('click', () => { showScreen('s-select'); G.state = 'select'; });
$('b-start').addEventListener('click', () => { initAudio(); startRace(); });
$('b-resume').addEventListener('click', resume);
$('b-quit').addEventListener('click', () => { G.state = 'title'; $('hud').hidden = true; showScreen('s-title'); });
$('b-again').addEventListener('click', () => { initAudio(); startRace(); });
$('b-menu').addEventListener('click', () => { G.state = 'title'; showScreen('s-title'); });

// ---------- Main loop ----------
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  if (G.state === 'select' || G.state === 'tracks' || G.state === 'title' || G.state === 'admin') { if (G.state === 'select' || G.state === 'tracks' || G.previewScene) renderPreview(dt); return; }
  if (G.state === 'paused' || G.state === 'results') { if (G.scene) renderer.render(G.scene, camera); updateEngine(); return; }

  if (G.state === 'countdown') {
    const before = Math.ceil(G.countdown); G.countdown -= dt; const after = Math.ceil(G.countdown);
    if (G.countdown <= 0) { G.state = 'race'; hud.center.textContent = 'PARTEZ !'; setTimeout(() => { if (hud.center.textContent === 'PARTEZ !') hud.center.textContent = ''; }, 900); sfx('go'); G.karts.forEach(k => { k.lapStart = 0; }); }
    else { hud.center.textContent = Math.min(3, after); if (before !== after) sfx('count'); }
  } else G.time += dt;

  for (const k of G.karts) updateKart(k, dt);
  kartCollisions(); pickupItems(); updateProjectiles(dt); updateRanks();
  for (const f of [...G.animated]) f(dt);
  for (const c of G.crossings) { c.t += dt; const p = (c.t * c.speed) % (4 * c.range); const lat = p < 2 * c.range ? p - c.range : 3 * c.range - p; const dir = p < 2 * c.range ? 1 : -1; c.mesh.position.set(c.s.x + c.s.sx * lat, 0, c.s.z + c.s.sz * lat); c.mesh.rotation.y = Math.atan2(c.s.sx * dir, c.s.sz * dir);
    for (const k of G.karts) { if (k.hazardGrace > 0 || k.fly > 0 || k.y > 1.2) continue; const d = (k.pos.x - c.mesh.position.x) ** 2 + (k.pos.z - c.mesh.position.z) ** 2; if (d < 10) { k.hazardGrace = 1.5; k.speed *= 0.3; if (stunKart(k, 1.3) && k === G.player) toast('RENVERSÉ PAR LE CORTÈGE !'); } } }
  const ct = G.time * 5; for (const c of G.crowd) if (c.amp) c.g.position.y = Math.abs(Math.sin(ct + c.ph)) * c.amp + (c.base || 0);
  if (G.toastTimer > 0) { G.toastTimer -= dt; if (G.toastTimer <= 0) hud.toast.classList.remove('on'); }
  updateCamera(dt); updateHUD(); updateEngine();
  renderer.render(G.scene, camera);
  if (G.time >= G.resultsAt || (G.player.finished && G.karts.every(k => k.finished))) showResults();
}
requestAnimationFrame(frame);

/**
 * Keep the title screen's sound button in step with the audio module.
 *
 * toggleMute() returns the new state rather than touching the DOM, so this is
 * the one place that knows the wording.
 */
function syncMuteButton() {
  $('b-mute').textContent = 'Son : ' + (isMuted() ? 'coupé' : 'activé');
}

// --- Test hook -------------------------------------------------------------
// The end-to-end suite needs to reach the results screen, which is otherwise
// unreachable: there is no race time cap, so a race ends only when the player
// completes three laps. Exposing this one function keeps that spec working
// across the repackaging. See DEC-009 and the note in e2e/game.spec.ts; it
// goes away when stage 11 gives the engine a real seam.
window.showResults = showResults;
