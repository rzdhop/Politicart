// The race: setting it up, stepping it, and ending it.
//
// This is the orchestration that used to be the top half of frame() plus
// startRace() in game.js. The engine side of a frame is one call, stepRace,
// which runs the countdown, the physics contract (updateKart for every kart,
// then kartCollisions, pickupItems, updateProjectiles, updateRanks -- in that
// order and no other), the animated props, the crossings, the crowd, the
// camera and the wrong-way timer, draws the minimap on the canvas the UI
// handed over (engine/minimap.js), and returns the frame payload. It never
// touches the DOM: text goes out through engine/events.js, the state through
// engine/machine.js, the readouts through the returned payload.
//
// The UI owns the clock. It calls stepRace(dt) only while the race is live
// (countdown or race), drains the events, renders the payload and then asks
// renderRace() to draw the scene. While paused or on the results it still
// calls renderRace() so the scene stays on screen, but not stepRace.
import * as THREE from 'three';

import { sfx } from './audio.js';
import { applyClimate, headlightCone } from './climate.js';
import { CHARACTERS, TRACKS } from './data.js';
import { updateCyclists } from './cyclists.js';
import { hintFor, say, setHint } from './events.js';
import { line } from './lines.js';
import { pickupItems, stunKart, updateProjectiles } from './items.js';
import { buildKart } from './kart.js';
import { myStyle } from './garage.js';
import { defaultStyle } from './kartstyle.js';
import { transition } from './machine.js';
import { buildMinimapBase, drawMinimap } from './minimap.js';
import { framePayload } from './payload.js';
import { kartCollisions, updateKart, updateRanks } from './physics.js';
import { applyPrebuilt, prebuiltSeed, takePrebuilt } from './prebuild.js';
import { setCast } from './primitives.js';
import { camera, getRenderer } from './render.js';
import { newSeed } from './seed.js';
import { CFG, G } from './state.js';
import { buildTrack } from './track.js';
import { buildTrail } from './trail.js';
import { initVfx, updateVfx } from './vfx.js';
import { clamp, lerp, rand } from './util.js';

// ---------- Kart entities ----------
function makeKart(def, isAI, style) {
  style = style ?? defaultStyle(def);
  const mesh = buildKart(def, style);
  // The trail lives in world space, so it goes into the scene beside the kart, not under it.
  // G.scene exists by now: startField builds it before the grid, joinField runs mid-race.
  const trail = buildTrail(style.trail);
  if (trail) { mesh.userData.trail = trail; G.scene.add(trail.group); }
  // At night (climate.js) the kart's headlights throw a cone on the road: an unlit quad beside the kart, like the
  // trail, that follows the kart's mesh each sim step. Never a part of the kart (its hashes are pinned, kart.test.js).
  if (G.climate?.lampsOn) {
    const cone = headlightCone(); mesh.userData.headlights = cone; G.scene.add(cone);
    G.animated.push(() => { cone.position.copy(mesh.position); cone.rotation.y = mesh.rotation.y; cone.visible = mesh.visible; });
  }
  return {
    def, style, stats: def.stats, isAI, mesh, pos: { x: 0, z: 0 }, heading: 0, speed: 0,
    drift: { active: false, dir: 0, charge: 0 }, boost: 0, boostPower: 1.4, stun: 0, invincible: 0, slowed: 0, fly: 0, relance: 0, relanceTimer: 0,
    item: null, itemRolling: 0, pendingItem: null, itemTimer: 0, powerCd: 8 + rand(0, 6), powerUses: 0,
    y: 0, vy: 0, air: false, trick: false, rampPrev: null, slip: 0, confused: 0, pitGrace: 0, padGrace: 0, steer: 0, phantom: 0,
    kx: 0, kz: 0, bump: 0, bumpCd: 0, bumpPower: 1, bumpSide: 1, shield: 0, rabot: 0, capped: 0,
    idx: 0, lap: 0, progress: 0, rank: 0, finished: false, finishTime: 0,
    team: null, god: false, lane: isAI ? rand(-6, 6) : 0, laneTimer: rand(2, 6), aiSpeedMul: 1, skill: rand(-0.03, 0.03), hazardGrace: 0, lapStart: 0, bestLap: Infinity, maxLap: 0,
  };
}

/**
 * Build the scene for the chosen circuit, place the field and start the
 * countdown. Ends with the transition into 'countdown', which is what tells
 * the UI to show the HUD and redraw the minimap base. Solo play draws the
 * race's seed here (DEC-049), or takes the one the pre-build drew for this
 * circuit (prebuild.js, DEC-055); tests pass one.
 */
export function startRace({ seed = prebuiltSeed(G.trackIdx) ?? newSeed() } = {}) {
  const others = CHARACTERS.filter((c, i) => i !== G.charIdx).sort(() => Math.random() - 0.5).slice(0, CFG.numAI);
  startField([...others.map(def => ({ def, isAI: true })), { def: CHARACTERS[G.charIdx], isAI: false, local: true, style: myStyle(CHARACTERS[G.charIdx]) }], { seed });
}

/**
 * Start a race on circuit G.trackIdx with a given grid, in grid order. Each
 * slot is `{ def, isAI, team?, local?, style?, god? }`, `style` being a full kart
 * style (the character's default when absent), `god` the admin's creative-mode
 * kart (DEC-030: neutral, untouchable, no cooldown); the `local` slot becomes G.player,
 * the kart this screen follows. Solo play passes five AI and the player
 * last; the game server and its clients pass the lobby's roster (DEC-014).
 * `seed` is the race's (DEC-049): it picks the layout and every draw that
 * shapes the race, so every side passes the same one; 0 by default. It is
 * also part of the key a circuit built ahead must match (prebuild.js,
 * DEC-055): solo play takes the pre-build's own seed (startRace).
 */
export function startField(slots, { seed = 0 } = {}) {
  if (G.scene) disposeScene(G.scene);
  const track = TRACKS[G.trackIdx]; G.track = track;
  // DEC-055: the circuit built ahead while the player chose (prebuild.js), when it is this one at this detail and seed; else built below as before.
  const pre = takePrebuilt({ trackIdx: G.trackIdx, seed });
  const scene = pre ? pre.scene : new THREE.Scene();
  G.scene = scene; G.animated = []; G.hazards = []; G.projectiles = []; G.crowd = []; G.lamps = []; G.disposables = [];
  G.entitySeq = 0;   // before the track: its static obstacles take the first ids, the same on every side
  if (pre) applyPrebuilt(pre); else { setCast(true); buildTrack(scene, track, { seed }); }
  // the lights, the sky and the air, after the track so the climate finds the lamps the decor registered (DEC-051)
  applyClimate(scene, track, G.layout?.climate ?? track.climates?.[0] ?? 'noon');
  buildMinimapBase();
  initVfx(scene);   // the effects' pools for this race, at this detail level (a no-op headless)

  G.karts = slots.map(sl => { const k = makeKart(sl.def, sl.isAI, sl.style); k.team = sl.team ?? null; k.god = sl.god === true; return k; });
  const local = slots.findIndex(sl => sl.local);
  G.player = G.karts[local] ?? G.karts.find(k => !k.isAI) ?? G.karts[G.karts.length - 1];
  G.karts.forEach((k, i) => {
    const s = G.samples[6 + i * 4]; const lane = (i % 2 === 0 ? 1 : -1) * 4.5;
    k.pos.x = s.x + s.sx * lane; k.pos.z = s.z + s.sz * lane; k.heading = Math.atan2(s.tx, s.tz); k.idx = 6 + i * 4; k.y = s.y;
    k.mesh.position.set(k.pos.x, k.y, k.pos.z); k.mesh.rotation.y = k.heading; scene.add(k.mesh);
  });
  G.time = 0; G.countdown = 3.6; G.resultsAt = Infinity; G.wrongTimer = 0; G.laps = CFG.laps;
  const s = G.samples[0]; camera.position.set(s.x - s.tx * 14, s.y + 7, s.z - s.tz * 14); camera.fov = 65;
  setHint('Ramassez une urne dorée pour obtenir un objet.');
  // The god's hint only: a banner here would reach the god twice in a team race, once from this client and once from the server's copy of the engine.
  if (G.player.god) hintFor(G.player, 'Mode dieu : pouvoir sans recharge, objets à volonté, intouchable. Vous ne marquez pas de points.');
  transition('countdown');
}

/**
 * Add a kart to the race in progress (DEC-031: the admin joins any game at
 * any moment). `sl` is a slot as startField takes them. The kart starts a
 * little behind the last kart still racing, on its lap, and takes the next
 * grid slot: its index in G.karts is G.karts.length before the call.
 */
export function joinField(sl) {
  const k = makeKart(sl.def, sl.isAI, sl.style); k.team = sl.team ?? null; k.god = sl.god === true;
  const racing = G.karts.filter(o => !o.finished);
  const last = racing.length ? racing.reduce((m, o) => (o.progress < m.progress ? o : m)) : null;
  let idx = last ? last.idx - 8 : 6, lap = last ? last.lap : 0;
  if (idx < 0) { idx += G.N; lap--; }
  const s = G.samples[idx];
  k.pos.x = s.x; k.pos.z = s.z; k.heading = Math.atan2(s.tx, s.tz); k.idx = idx; k.lap = lap; k.maxLap = Math.max(0, lap); k.progress = lap + idx / G.N;
  k.lapStart = G.time; k.rank = G.karts.length; k.powerCd = k.god ? 0 : k.powerCd; k.y = s.y;
  k.mesh.position.set(k.pos.x, k.y, k.pos.z); k.mesh.rotation.y = k.heading; G.scene.add(k.mesh);
  G.karts.push(k);
  return k;
}

/** Free the geometry of a scene (or any object tree) that is being replaced, and what the race registered as disposable (textures, materials). */
export function disposeScene(scene) {
  scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  for (const d of G.disposables) if (d && typeof d.dispose === 'function') d.dispose();
  G.disposables = [];
}

// ---------- Camera & sun ----------
function updateCamera(dt) {
  const k = G.player; const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  // A screen held upright sees a narrow slice of the road: widen the lens and
  // pull back and up as the aspect drops below 1, so a phone in portrait
  // still shows the road ahead and the karts beside it.
  const narrow = clamp(1 - camera.aspect, 0, 0.6);
  // Closer and lower than it used to be (A-033), so the kart's parts and its
  // trail read on screen; the portrait terms are unchanged.
  const back = (k.speed < -2 ? -11 : 10.5 - Math.min(2, k.boost * 2)) + narrow * 9;
  const ty = k.y + 5.6 + (k.fly > 0 ? 3 : 0) + narrow * 5;                          // k.y is the kart's absolute height (DEC-050)
  const tx = k.pos.x - fx * back, tz = k.pos.z - fz * back;
  const a = 1 - Math.exp(-dt * (G.state === 'countdown' ? 1.6 : 6));
  camera.position.x = lerp(camera.position.x, tx, a); camera.position.z = lerp(camera.position.z, tz, a); camera.position.y = lerp(camera.position.y, ty, a);
  camera.lookAt(k.pos.x + fx * 5, k.y + 1.0 + (k.mesh.position.y - k.y) * 0.5, k.pos.z + fz * 5);
  // a short camera shake when the followed kart is bumped
  if (k.bump > 0) { const e = k.bump * (k.bumpPower || 1) * 0.5; camera.position.x += Math.sin(G.time * 71) * e; camera.position.y += Math.sin(G.time * 53) * e * 0.6; }
  // the effects' share (vfx.js): a hit's shake, a landing's dip, a boost's kick of the lens
  const hud = G.fxHud;
  if (hud) { const e = hud.shake * 0.35; camera.position.x += Math.sin(G.time * 67 + 1) * e; camera.position.y += Math.sin(G.time * 47) * e * 0.6 - hud.dip * 0.8; }
  camera.fov = lerp(camera.fov, (k.boost > 0 ? 76 : 65) + narrow * 30 + (hud ? hud.kick * 6 : 0), 1 - Math.exp(-dt * 5)); camera.updateProjectionMatrix();
  if (G.sun) { const o = G.sunOffset || { x: 120, y: 200, z: 80 }; G.sun.position.set(k.pos.x + o.x, k.y + o.y, k.pos.z + o.z); G.sun.target.position.set(k.pos.x, k.y, k.pos.z); G.sun.target.updateMatrixWorld(); }
}

// ---------- Wrong way ----------
// Used to be computed inside updateHUD, per frame at a nominal 1/60 s; kept
// identical so the banner appears after the same 1.2 s it always did.
function updateWrongWay() {
  const k = G.player; const s = G.samples[k.idx]; const dot = Math.sin(k.heading) * s.tx + Math.cos(k.heading) * s.tz;
  G.wrongTimer = (dot < -0.2 && k.speed > 3 && !k.finished) ? G.wrongTimer + 1 / 60 : 0;
}

/**
 * One engine frame of a live race. Returns the frame payload. May end the
 * race, in which case the transition to 'results' happens before it returns
 * and the UI's listener has already rendered the results.
 */
export function stepRace(dt) {
  simStep(dt);
  const payload = viewStep(dt);
  if (raceOver()) endRace();
  return payload;
}

/**
 * The view half of a frame, for the local kart G.player: the chase camera,
 * the wrong-way timer, the HUD payload and the minimap. Shared by solo play
 * and the networked race, whose karts come from snapshots (netrace.js).
 */
export function viewStep(dt) {
  updateVfx(dt);   // before the camera, which reads the shake and the dip it leaves in G.fxHud
  updateCamera(dt);
  updateWrongWay();
  const payload = framePayload(G, CFG);
  drawMinimap(payload.kartPositions);
  return payload;
}

/** Put a crossing's vehicle where its clock `c.t` says it is. */
export function placeCrossing(c) {
  const p = (c.t * c.speed) % (4 * c.range); const lat = p < 2 * c.range ? p - c.range : 3 * c.range - p; const dir = p < 2 * c.range ? 1 : -1;
  c.mesh.position.set(c.s.x + c.s.sx * lat, c.s.y + lat * c.s.bank, c.s.z + c.s.sz * lat); c.mesh.rotation.y = Math.atan2(c.s.sx * dir, c.s.sz * dir);
}

/** Bob the crowd to the race clock. */
export function animateCrowd() {
  const ct = G.time * 5; for (const c of G.crowd) if (c.amp) c.g.position.y = Math.abs(Math.sin(ct + c.ph)) * c.amp + (c.base || 0);
}

/**
 * The simulation half of a frame: the countdown, the physics contract, the
 * animated props, the crossings, the cyclists and the crowd. No camera, no payload, no
 * minimap. This is what the game server steps headless (DEC-014); stepRace
 * wraps it with the view half for the browser.
 */
export function simStep(dt) {
  if (G.state === 'countdown') {
    const before = Math.ceil(G.countdown); G.countdown -= dt; const after = Math.ceil(G.countdown);
    if (G.countdown <= 0) { transition('race'); sfx('go'); G.karts.forEach(k => { k.lapStart = 0; }); }
    else if (before !== after) sfx('count');
  } else G.time += dt;

  for (const k of G.karts) updateKart(k, dt);
  kartCollisions(); pickupItems(); updateProjectiles(dt); updateRanks();
  for (const f of [...G.animated]) f(dt);
  for (const c of G.crossings) { c.t += dt; placeCrossing(c);
    for (const k of G.karts) { if (k.hazardGrace > 0 || k.fly > 0 || k.y - c.s.y > 1.2) continue; const d = (k.pos.x - c.mesh.position.x) ** 2 + (k.pos.z - c.mesh.position.z) ** 2; if (d < 10) { k.hazardGrace = 1.5; k.speed *= 0.3; if (stunKart(k, 1.3)) say(k, line('hazard.cortege.hit')); } } }
  updateCyclists(dt);
  animateCrowd();
}

/** Draw the race scene with the race camera. Safe to call while paused. */
export function renderRace() {
  if (G.scene) getRenderer().render(G.scene, camera);
}

/** Whether the race is over: the results timer ran out, or every kart has finished. */
export function raceOver() { return G.time >= G.resultsAt || G.karts.every(k => k.finished); }

/** End the race now: the results screen follows from the transition. */
export function endRace() {
  transition('results');
}
