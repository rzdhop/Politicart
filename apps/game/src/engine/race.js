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
import { CHARACTERS, TRACKS } from './data.js';
import { say, setHint } from './events.js';
import { pickupItems, stunKart, updateProjectiles } from './items.js';
import { buildKart } from './kart.js';
import { myStyle } from './garage.js';
import { defaultStyle } from './kartstyle.js';
import { transition } from './machine.js';
import { buildMinimapBase, drawMinimap } from './minimap.js';
import { framePayload } from './payload.js';
import { kartCollisions, updateKart, updateRanks } from './physics.js';
import { setCast } from './primitives.js';
import { camera, getRenderer } from './render.js';
import { CFG, G, SHADOWS } from './state.js';
import { buildTrack } from './track.js';
import { lerp, rand } from './util.js';

// ---------- Kart entities ----------
function makeKart(def, isAI, style) {
  style = style ?? defaultStyle(def);
  const mesh = buildKart(def, style);
  return {
    def, style, stats: def.stats, isAI, mesh, pos: { x: 0, z: 0 }, heading: 0, speed: 0,
    drift: { active: false, dir: 0, charge: 0 }, boost: 0, boostPower: 1.4, stun: 0, invincible: 0, slowed: 0, fly: 0, relance: 0, relanceTimer: 0,
    item: null, itemRolling: 0, pendingItem: null, itemTimer: 0, powerCd: 8 + rand(0, 6), powerUses: 0,
    y: 0, vy: 0, air: false, trick: false, rampPrev: null, slip: 0, confused: 0, pitGrace: 0, padGrace: 0, steer: 0, phantom: 0,
    idx: 0, lap: 0, progress: 0, rank: 0, finished: false, finishTime: 0,
    team: null, lane: isAI ? rand(-3.5, 3.5) : 0, laneTimer: rand(2, 6), aiSpeedMul: 1, skill: rand(-0.03, 0.03), hazardGrace: 0, lapStart: 0, bestLap: Infinity, maxLap: 0,
  };
}

/**
 * Build the scene for the chosen circuit, place the field and start the
 * countdown. Ends with the transition into 'countdown', which is what tells
 * the UI to show the HUD and redraw the minimap base.
 */
export function startRace() {
  const others = CHARACTERS.filter((c, i) => i !== G.charIdx).sort(() => Math.random() - 0.5).slice(0, CFG.numAI);
  startField([...others.map(def => ({ def, isAI: true })), { def: CHARACTERS[G.charIdx], isAI: false, local: true, style: myStyle(CHARACTERS[G.charIdx]) }]);
}

/**
 * Start a race on circuit G.trackIdx with a given grid, in grid order. Each
 * slot is `{ def, isAI, team?, local?, style? }`, `style` being a full kart
 * style (the character's default when absent); the `local` slot becomes G.player,
 * the kart this screen follows. Solo play passes five AI and the player
 * last; the game server and its clients pass the lobby's roster (DEC-014).
 */
export function startField(slots) {
  if (G.scene) disposeScene(G.scene);
  const track = TRACKS[G.trackIdx]; G.track = track;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(track.fog); scene.fog = new THREE.Fog(track.fog, 220, 700);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x55663a, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.15); sun.position.set(120, 200, 80); scene.add(sun); scene.add(sun.target);
  sun.castShadow = SHADOWS(); sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 500; sun.shadow.bias = -0.0006;
  G.sun = sun; G.scene = scene; G.animated = []; G.hazards = []; G.projectiles = []; G.crowd = [];
  setCast(true); buildTrack(scene, track);
  buildMinimapBase();

  G.karts = slots.map(sl => { const k = makeKart(sl.def, sl.isAI, sl.style); k.team = sl.team ?? null; return k; });
  const local = slots.findIndex(sl => sl.local);
  G.player = G.karts[local] ?? G.karts.find(k => !k.isAI) ?? G.karts[G.karts.length - 1];
  G.entitySeq = 0;
  G.karts.forEach((k, i) => {
    const s = G.samples[6 + i * 4]; const lane = (i % 2 === 0 ? 1 : -1) * 3.5;
    k.pos.x = s.x + s.sx * lane; k.pos.z = s.z + s.sz * lane; k.heading = Math.atan2(s.tx, s.tz); k.idx = 6 + i * 4;
    k.mesh.position.set(k.pos.x, 0, k.pos.z); k.mesh.rotation.y = k.heading; scene.add(k.mesh);
  });
  G.time = 0; G.countdown = 3.6; G.resultsAt = Infinity; G.wrongTimer = 0;
  const s = G.samples[0]; camera.position.set(s.x - s.tx * 14, 7, s.z - s.tz * 14); camera.fov = 65;
  setHint('Ramassez une urne dorée pour obtenir un objet.');
  transition('countdown');
}

/** Free the geometry of a scene (or any object tree) that is being replaced. */
export function disposeScene(scene) { scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }

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
  updateCamera(dt);
  updateWrongWay();
  const payload = framePayload(G, CFG);
  drawMinimap(payload.kartPositions);
  return payload;
}

/** Put a crossing's vehicle where its clock `c.t` says it is. */
export function placeCrossing(c) {
  const p = (c.t * c.speed) % (4 * c.range); const lat = p < 2 * c.range ? p - c.range : 3 * c.range - p; const dir = p < 2 * c.range ? 1 : -1;
  c.mesh.position.set(c.s.x + c.s.sx * lat, 0, c.s.z + c.s.sz * lat); c.mesh.rotation.y = Math.atan2(c.s.sx * dir, c.s.sz * dir);
}

/** Bob the crowd to the race clock. */
export function animateCrowd() {
  const ct = G.time * 5; for (const c of G.crowd) if (c.amp) c.g.position.y = Math.abs(Math.sin(ct + c.ph)) * c.amp + (c.base || 0);
}

/**
 * The simulation half of a frame: the countdown, the physics contract, the
 * animated props, the crossings and the crowd. No camera, no payload, no
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
    for (const k of G.karts) { if (k.hazardGrace > 0 || k.fly > 0 || k.y > 1.2) continue; const d = (k.pos.x - c.mesh.position.x) ** 2 + (k.pos.z - c.mesh.position.z) ** 2; if (d < 10) { k.hazardGrace = 1.5; k.speed *= 0.3; if (stunKart(k, 1.3)) say(k, 'RENVERSÉ PAR LE CORTÈGE !'); } } }
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
