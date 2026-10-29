// The race's visual effects: one pooled module for every burst, ring, puff
// and status aura (DEC-053).
//
// Two ways in:
//
// - spawnVfx(type, { x, z, y, kart, color, dir, r }) is called by the
//   simulation at the points that already route a sound: an item used, a
//   projectile landing, a power hitting, a shield parrying. It builds one
//   plain event `{ ty, x, y, z, k, c, d, r }` (k the kart's grid slot). In
//   the browser the event plays at once; on the game server, which runs this
//   same engine in a worker thread (DEC-014), a sink is installed
//   (setVfxSink) and the event is only recorded, to travel in the snapshot
//   message beside the sounds (netstate.js encodeVfx) and play on every
//   client (receiveVfx / replayVfx, netrace.js). Headless and without a
//   sink it does nothing at all: the worker never builds a single effect.
//
// - updateVfx(dt), once per view frame (race.js viewStep, solo and team
//   races alike), draws everything that follows from a kart's state rather
//   than from a moment: the statuses (slowed, confused, capped, rabot, slip,
//   relance, the loophole's sparkle, the stun's stars), boost flames at the
//   exhaust mouths, the drift's tier-coloured sparks, offroad and gravel
//   dust, landings, the helicopter's downwash, pits and pads entered, ballot
//   boxes taken and back, laps and finishes. Snapshots carry the state
//   (status fields included), so every client derives the same effects
//   without a single extra event on the wire.
//
// The pools: eight InstancedMesh layers (debris, flakes, puffs, glows,
// streaks, rings, flames, coins), each one draw call however many of its
// particles live, nothing at all while it has none. Their capacities are
// sized per detail level at the start of each race (POOLS); a full layer
// recycles its oldest particle, like trail.js. Everything is allocated in
// initVfx: a frame writes into typed arrays and never creates an object.
// No lights: the race's shader programs stay the ones they are (A.4).
// Normal-blended layers fade by shrinking; additive ones by darkening, which
// under additive blending is the same as fading out.
//
// It also keeps G.fxHud for the HUD and the camera: the local kart's hit
// flash, the camera shake and landing dip, the boost kick, the lap flash and
// a counter bumped each time the player's item goes (payload.js).
import * as THREE from 'three';

import { fxAnchorsOf } from './kart.js';
import { G, disposable, getPoly } from './state.js';

/** Every kind spawnVfx knows, the network's vocabulary (netstate.js encodeVfx). */
export const VFX_KINDS = Object.freeze(['impact', 'shockwave', 'puff', 'stars', 'aura', 'confetti', 'streak', 'flame', 'splash', 'dust', 'swath', 'gas', 'flash', 'papers', 'coins', 'windup', 'pop']);

/** Instances per layer, per detail level. Each layer is one draw call while anything in it lives. */
export const POOLS = Object.freeze({
  high: Object.freeze({ debris: 220, flake: 300, puff: 160, glow: 320, streak: 80, ring: 40, flame: 32, coin: 80 }),
  low: Object.freeze({ debris: 96, flake: 128, puff: 64, glow: 128, streak: 32, ring: 16, flame: 16, coin: 32 }),
});
/** The layers, in draw order. */
export const LAYERS = Object.freeze(Object.keys(POOLS.high));
/** Effects are only derived for karts this close to the camera (m): far away they would be a few pixels. */
export const NEAR = 150;

const TRICOLORE = [0x1f3a93, 0xf6f1e4, 0xc8102e, 0xf2c14e];
/** The drift's three tiers, the colours the kart's own sparks and the HUD's gauge use (physics.js, game.js). */
export const DRIFT_TIERS = Object.freeze([0x7cc4ff, 0xffd34d, 0xff7a1a]);
/** Each status's colour on the road: its ring and its motif (StatusBadges shows the same statuses). */
export const STATUS_COLOR = Object.freeze({ slowed: 0x6b8fb5, confused: 0xb14cff, capped: 0x1f3a93, rabot: 0xff8a1a, slip: 0x7a5230, relance: 0xf2c14e, phantom: 0xf2c14e });

let headless = typeof document === 'undefined';
let sink = null;
let V = null;   // the race's pools and memory, built by initVfx

/** Force the browser path on (false) or off (true): tests and the frame measurement build the pools in node. */
export function setVfxHeadless(on) { headless = !!on; }
/** Route every effect event to `fn(event)` instead of playing it (the game server's worker). Pass null to restore. */
export function setVfxSink(fn) { sink = typeof fn === 'function' ? fn : null; }
/** Whether effects are drawn here: a browser with no sink installed. */
export const vfxLive = () => !headless && !sink;

// ---------- Events ----------
const r2 = v => Math.round(v * 100) / 100;
/**
 * The plain event spawnVfx builds: where (the kart's place when only a kart
 * is given), which kart by grid slot, and the optional colour, direction and
 * radius. JSON-safe.
 */
export function vfxEvent(type, o = {}) {
  const k = o.kart ?? null;
  const e = { ty: type, x: r2(o.x ?? k?.pos.x ?? 0), y: r2(o.y ?? k?.y ?? 0), z: r2(o.z ?? k?.pos.z ?? 0) };
  const slot = k ? G.karts.indexOf(k) : -1;
  if (slot >= 0) e.k = slot;
  if (o.color != null) e.c = o.color;
  if (o.dir != null) e.d = r2(o.dir);
  if (o.r != null) e.r = r2(o.r);
  return e;
}

/**
 * One effect of kind `type`. Played here in the browser, recorded by the
 * sink on the server, nothing at all headless; never while the netcode
 * re-simulates a kart (G.replaying), whose effects the server already sent.
 */
export function spawnVfx(type, o) {
  if (G.replaying) return;
  if (sink) { sink(vfxEvent(type, o)); return; }
  if (headless || !V) return;
  playVfx(vfxEvent(type, o));
}

/** Play an event, from spawnVfx or off the wire. Unknown kinds and missing karts are skipped. */
export function playVfx(e) {
  if (!V || headless) return;
  const play = KINDS[e.ty]; if (!play) return;
  const k = e.k != null && e.k >= 0 ? G.karts[e.k] ?? null : null;
  play(e, k);
}

// ---------- Team races: effects off the wire, played at the render tick ----------
/** Queue the effects a snapshot brought (decoded events), to play when the render clock reaches tick `tk`. */
export function receiveVfx(list, tk) {
  if (!V || !list || !list.length) return;
  for (const e of list) { if (V.net.length >= 256) V.net.shift(); V.net.push({ tk, e }); }
}
/** Play every queued effect whose tick the render clock has reached. */
export function replayVfx(renderTick) {
  if (!V) return;
  while (V.net.length && V.net[0].tk <= renderTick) playVfx(V.net.shift().e);
}

// ---------- The pools ----------
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color(), tmpV = new THREE.Vector3();

function layerGeometry(name, tier) {
  const lo = tier === 'low';
  switch (name) {
    case 'debris': return new THREE.BoxGeometry(0.26, 0.26, 0.26);
    case 'flake': return new THREE.PlaneGeometry(0.5, 0.36);
    case 'puff': return new THREE.IcosahedronGeometry(0.5, 0);
    case 'glow': return new THREE.OctahedronGeometry(0.2, 0);
    case 'streak': return new THREE.BoxGeometry(0.07, 0.07, 1).translate(0, 0, -0.5);
    case 'ring': return new THREE.RingGeometry(0.84, 1, lo ? 16 : 32).rotateX(-Math.PI / 2);
    case 'flame': return new THREE.ConeGeometry(0.2, 1, lo ? 6 : 8).translate(0, 0.5, 0).rotateX(-Math.PI / 2);   // the base at the mouth, the tip one metre behind (-z)
    case 'coin': return new THREE.CylinderGeometry(0.3, 0.3, 0.07, lo ? 8 : 12).rotateX(Math.PI / 2);
  }
  return null;
}
const ADDITIVE = new Set(['glow', 'streak', 'ring', 'flame']);
function layerMaterial(name) {
  if (ADDITIVE.has(name)) return new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: name === 'ring' ? THREE.DoubleSide : THREE.FrontSide });
  if (name === 'puff') return new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  return new THREE.MeshBasicMaterial({ color: 0xffffff, side: name === 'flake' ? THREE.DoubleSide : THREE.FrontSide });
}
function particle() {
  return { live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, age: 0, life: 1, delay: 0, s0: 1, s1: 1, ax: 1, ay: 1, az: 1, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, r: 1, g: 1, b: 1, flutter: 0, ring: false, stretch: 0, rise: false, kart: null, ox: 0, oy: 0, oz: 0 };
}
function buildLayer(name, cap, tier) {
  const mesh = new THREE.InstancedMesh(layerGeometry(name, tier), disposable(layerMaterial(name)), cap);
  mesh.name = 'vfx:' + name; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // the colour attribute exists from the start, so the layer's program never changes mid-race; r128 sizes it by
  // `count` when the first colour is set, so this comes before the count drops to nothing
  tmpC.set(0xffffff); for (let i = 0; i < cap; i++) mesh.setColorAt(i, tmpC);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0; mesh.visible = false;
  const pool = []; for (let i = 0; i < cap; i++) pool.push(particle());
  return { name, mesh, cap, n: 0, pool, next: 0, additive: ADDITIVE.has(name) };
}

/**
 * Build the race's pools into `scene` at the current detail level, forgetting
 * the previous race's. Headless it builds nothing (G.fxHud stays null).
 * Called by race.js startField once the circuit is in place.
 */
export function initVfx(scene, { tier = getPoly() } = {}) {
  V = null; G.fxHud = null;
  if (headless || !scene) return null;
  const caps = POOLS[tier] ?? POOLS.high;
  const root = new THREE.Group(); root.name = 'vfx';
  const layers = {};
  for (const name of LAYERS) { layers[name] = buildLayer(name, caps[name], tier); root.add(layers[name].mesh); }
  scene.add(root);
  G.fxHud = { hit: 0, shake: 0, dip: 0, kick: 0, lap: 0, used: 0 };
  V = { root, layers, tier, t: 0, memo: new WeakMap(), net: [], boxes: [], pads: [] };
  return root;
}
/** The race's effects group (the countdown primes its materials), or null. */
export const vfxRoot = () => V?.root ?? null;
/** What the pools hold now, per layer: { live, drawn, cap } (tests and the frame measurement). */
export function vfxStats() {
  if (!V) return null;
  const out = {};
  for (const name of LAYERS) { const L = V.layers[name]; out[name] = { live: L.pool.reduce((n, p) => n + (p.live ? 1 : 0), 0), drawn: L.mesh.visible ? L.mesh.count : 0, cap: L.cap }; }
  return out;
}

/** A particle from `layer`'s pool (its oldest when every one is live), reset and live. */
function emit(layer, x, y, z, life, color) {
  const L = V.layers[layer]; const p = L.pool[L.next]; L.next = (L.next + 1) % L.cap;
  p.live = true; p.x = x; p.y = y; p.z = z; p.vx = 0; p.vy = 0; p.vz = 0; p.grav = 0; p.drag = 0; p.age = 0; p.life = life; p.delay = 0;
  p.s0 = 1; p.s1 = 1; p.ax = 1; p.ay = 1; p.az = 1; p.rx = 0; p.ry = 0; p.rz = 0; p.wx = 0; p.wy = 0; p.wz = 0; p.flutter = 0; p.ring = false; p.stretch = 0; p.rise = false; p.kart = null; p.ox = 0; p.oy = 0; p.oz = 0;
  tmpC.set(color ?? 0xffffff); p.r = tmpC.r; p.g = tmpC.g; p.b = tmpC.b;
  return p;
}
/** Write one instance into a layer for this frame. False when the layer is full. */
function put(L, x, y, z, rx, ry, rz, sx, sy, sz, r, g, b) {
  if (L.n >= L.cap) return false;
  tmpE.set(rx, ry, rz, 'YXZ'); tmpQ.setFromEuler(tmpE); tmpP.set(x, y, z); tmpS.set(sx, sy, sz);
  tmpM.compose(tmpP, tmpQ, tmpS); L.mesh.setMatrixAt(L.n, tmpM);
  tmpC.setRGB(r, g, b); L.mesh.setColorAt(L.n, tmpC);
  L.n++; return true;
}
/** `put` with a hex colour scaled by `f` (an additive layer fades by its colour). */
function putHex(layer, x, y, z, ry, s, hex, f = 1, sy = s, sz = s) {
  tmpC.set(hex); return put(V.layers[layer], x, y, z, 0, ry, 0, s, sy, sz, tmpC.r * f, tmpC.g * f, tmpC.b * f);
}

/** Age, move and draw every live particle of a layer. */
function stepLayer(L, dt) {
  for (const p of L.pool) {
    if (!p.live) continue;
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.age += dt; if (p.age >= p.life) { p.live = false; continue; }
    const f = p.age / p.life;
    if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d; }
    p.vy -= p.grav * dt;
    if (p.flutter) { p.vx += Math.sin(p.age * 9 + p.ry * 7) * p.flutter * dt; p.vz += Math.cos(p.age * 7 + p.rx * 5) * p.flutter * dt; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
    let px = p.x, py = p.y, pz = p.z, ry = p.ry;
    if (p.kart) { const m = p.kart.mesh; tmpV.set(p.ox, p.oy, p.oz).applyMatrix4(m.matrix); px += tmpV.x; py += tmpV.y; pz += tmpV.z; ry += m.rotation.y; }
    let s = p.s0 + (p.s1 - p.s0) * f, fade = 1;
    if (p.rise) fade = 0.35 + 0.65 * f; else if (L.additive) fade = 1 - f; else if (f > 0.7) s *= (1 - f) / 0.3;
    const az = p.stretch ? p.az + (p.stretch - p.az) * f : p.az;
    if (p.ring) put(L, px, py, pz, 0, ry, 0, s, 1, s, p.r * fade, p.g * fade, p.b * fade);
    else put(L, px, py, pz, p.rx, ry, p.rz, s * p.ax, s * p.ay, s * az, p.r * fade, p.g * fade, p.b * fade);
  }
}

// ---------- The kinds ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];
/** Throw `n` particles of `layer` from (x, y, z) outward: speed `v`, upward `up`, gravity, life, colours, sizes. */
function spray(layer, n, x, y, z, { v = 6, up = 4, grav = 12, life = 0.7, colors, color, s0 = 1, s1 = 1, drag = 0, spin = 8, flutter = 0, ax = 1, ay = 1, az = 1, spread = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = v * rnd(0.5, 1);
    const p = emit(layer, x + Math.sin(a) * spread * Math.random(), y, z + Math.cos(a) * spread * Math.random(), life * rnd(0.75, 1.2), colors ? pick(colors) : color);
    p.vx = Math.sin(a) * sp; p.vz = Math.cos(a) * sp; p.vy = up * rnd(0.6, 1.3); p.grav = grav; p.drag = drag; p.s0 = s0; p.s1 = s1; p.flutter = flutter;
    p.ax = ax; p.ay = ay; p.az = az; p.rx = Math.random() * 6; p.ry = Math.random() * 6; p.wx = rnd(-spin, spin); p.wy = rnd(-spin, spin); p.wz = rnd(-spin, spin);
  }
}
/** A flat ring on the ground at (x, y, z) growing from r0 to r1 metres over `life`, delayed by `delay`. */
function ring(x, y, z, r0, r1, life, color, delay = 0) {
  const p = emit('ring', x, y + 0.15, z, life, color); p.ring = true; p.s0 = r0; p.s1 = r1; p.delay = delay; return p;
}
/** A particle that rides kart k at (ox, oy, oz) in its own frame. */
function riding(layer, k, ox, oy, oz, life, color) {
  const p = emit(layer, 0, 0, 0, life, color); p.kart = k; p.ox = ox; p.oy = oy; p.oz = oz; return p;
}
const heightOf = k => (k ? fxAnchorsOf(k.mesh).top : 2.4);

const KINDS = {
  // a hit: debris, sparks and a small shock ring
  impact(e) {
    const c = e.c ?? 0xffe08a;
    spray('debris', 10, e.x, e.y + 1, e.z, { v: 9, up: 6, grav: 22, life: 0.6, colors: [c, 0xffffff, 0x333333], s0: 1, s1: 0.6 });
    spray('glow', 8, e.x, e.y + 1, e.z, { v: 12, up: 5, grav: 10, life: 0.35, color: 0xfff1b0 });
    ring(e.x, e.y, e.z, 0.6, 3.4, 0.3, c);
  },
  // the sound wave: two rings out to the radius and rays along the ground (the Mégaphone's, a casserolade, a dissolution)
  shockwave(e) {
    const c = e.c ?? 0xf2c14e, r = e.r ?? 22;
    ring(e.x, e.y, e.z, 1, r, 0.7, c); ring(e.x, e.y, e.z, 1, r * 0.7, 0.55, 0xffffff, 0.08);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const p = emit('streak', e.x + Math.sin(a) * 2, e.y + 0.6, e.z + Math.cos(a) * 2, 0.45, c); p.ry = a; p.vx = Math.sin(a) * r * 1.6; p.vz = Math.cos(a) * r * 1.6; p.az = 3; }
  },
  // a vanishing act: a cloud and a twinkle (pantouflage, amendement, a power that conjures something)
  puff(e) {
    const c = e.c ?? 0xe8e8f0;
    spray('puff', 10, e.x, e.y + 1, e.z, { v: 3, up: 2, grav: -1, life: 0.8, color: c, s0: 1.2, s1: 3.2, drag: 2.5, spin: 1 });
    spray('glow', 8, e.x, e.y + 1.4, e.z, { v: 4, up: 3, grav: 0, life: 0.6, color: 0xffffff, drag: 2 });
  },
  // a stun: stars thrown off the driver's head
  stars(e, k) {
    const y = (k ? k.y : e.y) + heightOf(k);
    spray('glow', 9, k ? k.pos.x : e.x, y, k ? k.pos.z : e.z, { v: 4, up: 3, grav: 6, life: 0.7, colors: [0xffe14d, 0xffffff, 0xffb31a], s0: 1.4, s1: 0.8 });
  },
  // a status taking hold: a ring that settles under the kart
  aura(e, k) {
    const x = k ? k.pos.x : e.x, z = k ? k.pos.z : e.z, y = k ? k.y : e.y, c = e.c ?? 0x7cc4ff;
    ring(x, y, z, 3.6, 1.9, 0.45, c);
    spray('glow', 6, x, y + 0.4, z, { v: 1.5, up: 3, grav: -1, life: 0.6, color: c, spread: 1.6 });
  },
  confetti(e) {
    spray('flake', Math.round(e.r ?? 28), e.x, e.y + 1.4, e.z, { v: 6, up: 9, grav: 7, life: 1.8, colors: TRICOLORE, drag: 1.2, spin: 9, flutter: 6 });
  },
  // speed lines along the kart's flanks
  streak(e, k) {
    const h = k ? k.heading : e.d ?? 0, fx = Math.sin(h), fz = Math.cos(h);
    for (let i = 0; i < 8; i++) {
      const side = (i % 2 ? 1 : -1) * rnd(1.2, 2.6), up = rnd(0.3, 1.8), ahead = rnd(-1, 3);
      const x = (k ? k.pos.x : e.x) + fz * side + fx * ahead, z = (k ? k.pos.z : e.z) - fx * side + fz * ahead;
      const p = emit('streak', x, (k ? k.y : e.y) + up, z, 0.3, e.c ?? 0xbfe6ff); p.ry = h; p.az = rnd(2.5, 4.5); p.vx = -fx * 22; p.vz = -fz * 22;
    }
  },
  // a burst of fire at the exhausts (the boost's own flames are drawn from its state, see updateVfx)
  flame(e, k) {
    if (!k) { spray('glow', 10, e.x, e.y + 0.6, e.z, { v: 3, up: 2, grav: -2, life: 0.4, colors: [0xff7a1a, 0xffd34d] }); return; }
    for (const [x, y, z] of fxAnchorsOf(k.mesh).exhaust) for (let i = 0; i < 4; i++) { const p = riding('glow', k, x, y, z, rnd(0.25, 0.45), pick([0xff7a1a, 0xffd34d, 0xff3a1a])); p.vx = rnd(-1, 1); p.vy = rnd(0.5, 2); p.vz = 0; p.s0 = 1.4; p.s1 = 0.4; p.oz = z - rnd(0, 0.6); }
  },
  splash(e) {
    spray('puff', 14, e.x, e.y + 0.3, e.z, { v: 5, up: 7, grav: 20, life: 0.7, colors: [0xa9d8ff, 0xe8f6ff], s0: 0.5, s1: 0.9, spread: 1.5 });
    ring(e.x, e.y, e.z, 0.8, 4.5, 0.5, 0x7cc4ff); ring(e.x, e.y, e.z, 0.5, 3, 0.5, 0xffffff, 0.12);
  },
  dust(e) {
    spray('puff', 8, e.x, e.y + 0.4, e.z, { v: 2.5, up: 1.2, grav: -0.5, life: 0.9, color: e.c ?? 0xc9b48a, s0: 0.9, s1: 2.6, drag: 2, spread: 1.2, spin: 1 });
  },
  // the mowing: the swath ahead of the tractor, blades and earth thrown up along it (e.d heading, e.r length)
  swath(e) {
    const h = e.d ?? 0, fx = Math.sin(h), fz = Math.cos(h), len = e.r ?? 60, hw = G.hw || 13;
    for (let i = 0; i < 36; i++) {
      const a = rnd(0, len), lat = rnd(-hw, hw), x = e.x + fx * a + fz * lat, z = e.z + fz * a - fx * lat;
      const p = emit('flake', x, e.y + 0.3, z, rnd(0.8, 1.3), pick([0x5f9a48, 0x7fbf4f, 0x3f7a2e, 0xc9b48a])); p.vx = rnd(-2, 2); p.vz = rnd(-2, 2); p.vy = rnd(4, 8); p.grav = 14; p.ax = 0.25; p.ay = 1.6; p.wx = rnd(-9, 9); p.wy = rnd(-9, 9); p.wz = rnd(-9, 9);
      if (i % 4 === 0) { const d = emit('puff', x, e.y + 0.4, z, 0.9, 0x9a8a62); d.s0 = 1; d.s1 = 2.4; d.vy = 0.8; d.drag = 2; d.delay = a / len * 0.25; }
      p.delay = a / len * 0.25;
    }
  },
  // tear gas: a slow pale cloud (and on a kart caught in it, a smaller one)
  gas(e, k) {
    const big = !k;
    spray('puff', big ? 14 : 6, e.x, e.y + 1, e.z, { v: big ? 2.5 : 1.5, up: 0.8, grav: -0.3, life: big ? 1.8 : 1, colors: [0xd4dcb2, 0xe2e6c8, 0xbfcf8f], s0: big ? 2 : 1, s1: big ? 4.4 : 2.2, drag: 1.5, spread: big ? 2.5 : 1, spin: 0.5 });
  },
  // a flash of light at a kart; with `r`, a hit, and on the local kart the HUD flashes too (HitVignette)
  flash(e, k) {
    const x = k ? k.pos.x : e.x, z = k ? k.pos.z : e.z, y = (k ? k.y : e.y) + 1.2, c = e.c ?? 0xffffff;
    const p = emit('glow', x, y, z, 0.25, c); p.s0 = 14; p.s1 = 22;
    spray('glow', 10, x, y, z, { v: 10, up: 2, grav: 0, life: 0.3, color: c, drag: 3 });
    ring(x, y - 1.1, z, 1, 6, 0.3, c);
    if (e.r && k && k === G.player && G.fxHud) G.fxHud.hit = Math.max(G.fxHud.hit, Math.min(1, e.r));   // r: how hard the HUD flashes, for a flash that is a hit
  },
  // sheets in the air: a file's contents, a motion's text, tracts
  papers(e) {
    spray('flake', 16, e.x, e.y + 1.6, e.z, { v: 4, up: 6, grav: 4, life: 2, colors: [0xfff5dd, 0xffffff, 0xf0e6c8], drag: 1.6, spin: 5, flutter: 5, ax: 1, ay: 1.35 });
  },
  coins(e) {
    spray('coin', 12, e.x, e.y + 1, e.z, { v: 4, up: 8, grav: 18, life: 1, color: 0xf2c14e, spin: 12 });
    spray('glow', 5, e.x, e.y + 1.2, e.z, { v: 3, up: 3, grav: 0, life: 0.5, color: 0xffe9a0 });
  },
  // the AI's tell (ai.js): a line of light reaching out ahead of the kart for the 0.3 s before it fires
  windup(e, k) {
    if (!k) return;
    const c = e.c ?? 0xf2c14e;
    const p = riding('streak', k, 0, 1.1, 1.8, 0.3, c); p.ry = Math.PI; p.ax = 2.5; p.ay = 2.5; p.az = 0.5; p.stretch = 9; p.rise = true;
    const r = ring(0, 0, 0, 2.8, 1.4, 0.3, c); r.kart = k; r.oy = 0.15; r.y = 0; r.rise = true;
  },
  // a ballot box coming back: a ring and a twinkle
  pop(e) {
    ring(e.x, e.y - 1.2, e.z, 0.5, 2.6, 0.35, 0xffd34d);
    spray('glow', 6, e.x, e.y, e.z, { v: 3, up: 2, grav: 0, life: 0.4, color: 0xfff1b0, drag: 2 });
  },
};

// ---------- What follows from a kart's state ----------
function memoOf(k) {
  let m = V.memo.get(k);
  if (!m) {
    m = { stun: k.stun, boost: k.boost, air: k.air, fin: k.finished, lap: k.lap, best: k.lap, item: k.item, rolling: k.itemRolling > 0, relance: k.relance || 0, slowed: k.slowed || 0, pit: null, pad: null, fly: k.fly, acc: { drift: 0, dust: 0, fly: 0 } };
    V.memo.set(k, m);
  }
  return m;
}
/** The pit or pad of `list` the kart is in, by sample range and lateral offset, or null. */
function zoneOf(list, k, lateral, hw) {
  for (const p of list) { const rel = (k.idx - p.i0 + G.N) % G.N; if (rel < p.len && Math.abs(lateral) < hw) return p; }
  return null;
}
/** `rate` particles a second out of an accumulator: how many to emit this frame. */
function due(acc, key, rate, dt) { acc[key] = Math.min(acc[key] + dt * rate, 4); const n = Math.floor(acc[key]); acc[key] -= n; return n; }

/** The statuses' marks on the road and around the kart, drawn this frame only. */
function drawStatuses(k, t) {
  const x = k.pos.x, y = k.y, z = k.pos.z, top = y + heightOf(k);
  const breathe = 1 + Math.sin(t * 5 + k.idx) * 0.06;
  if (k.stun > 0) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.094; putHex('glow', x + Math.sin(a) * 0.9, top + Math.sin(t * 9 + i) * 0.1, z + Math.cos(a) * 0.9, a, 1.3, 0xffe14d); }
  if (k.slowed > 0) { putHex('ring', x, y + 0.12, z, 0, 2.0 * breathe, STATUS_COLOR.slowed, 0.9); for (let i = 0; i < 3; i++) { const a = t * 1.2 + i * 2.094; putHex('puff', x + Math.sin(a) * 1.6, y + 0.35, z + Math.cos(a) * 1.6, 0, 0.9, 0x8aa0b8); } }
  if (k.confused > 0) for (let i = 0; i < 4; i++) { const a = t * (i % 2 ? 7 : -7) + i * 1.57; putHex('glow', x + Math.sin(a) * 1.1, top - 0.3 + (i % 2) * 0.3, z + Math.cos(a) * 1.1, a, 1.1, STATUS_COLOR.confused); }
  if (k.capped > 0) { putHex('ring', x, y + 0.12, z, 0, 2.2, STATUS_COLOR.capped); for (let i = 0; i < 12; i++) { const a = t * 0.8 + i / 12 * Math.PI * 2; putHex('glow', x + Math.sin(a) * 1.25, top + 0.15, z + Math.cos(a) * 1.25, a, 0.7, 0xffd700); } }   // the twelve stars
  if (k.rabot > 0) { putHex('ring', x, y + 0.12, z, 0, 2.1 * breathe, STATUS_COLOR.rabot, 0.85); for (let i = 0; i < 3; i++) { const a = -t * 3 + i * 2.094; putHex('debris', x + Math.sin(a) * 1.4, y + 1.1 + Math.sin(t * 4 + i) * 0.2, z + Math.cos(a) * 1.4, a, 0.9, 0xd9a35a, 1, 0.25, 1.8); } }
  if (k.slip > 0) { putHex('ring', x, y + 0.12, z, 0, 1.9, STATUS_COLOR.slip, 0.8); for (let i = 0; i < 2; i++) putHex('puff', x + Math.sin(t * 13 + i * 3) * 1.2, y + 0.25, z + Math.cos(t * 11 + i * 3) * 1.2, 0, 0.6, 0x5a3b1e); }
  if (k.relance > 0) for (let i = 0; i < k.relance; i++) { const a = t * 2.4 + i * 2.094; putHex('coin', x + Math.sin(a) * 1.3, top - 0.2, z + Math.cos(a) * 1.3, a + t * 4, 1.1, 0xf2c14e); }
  if (k.phantom > 0) for (let i = 0; i < 2; i++) { const a = t * 5 + i * Math.PI; putHex('glow', x + Math.sin(a) * 1.5, y + 0.8 + Math.sin(t * 7 + i) * 0.4, z + Math.cos(a) * 1.5, a, 0.9, STATUS_COLOR.phantom); }
}

/** Flames at the exhaust mouths while the kart boosts, flickering. */
function drawFlames(k, t) {
  const m = k.mesh, len = 0.6 + Math.min(1, k.boost) * 0.9;
  for (const [x, y, z, r] of fxAnchorsOf(m).exhaust) {
    tmpV.set(x, y, z).applyMatrix4(m.matrix);
    const fl = len * (0.85 + Math.sin(t * 41 + x * 9) * 0.15), w = (r / 0.1) * 0.9;
    const L = V.layers.flame; tmpC.set(0xff7a1a);
    put(L, tmpV.x, tmpV.y, tmpV.z, m.rotation.x, m.rotation.y, m.rotation.z, w, w, fl, tmpC.r, tmpC.g, tmpC.b);
    tmpC.set(0xffe9a0); put(L, tmpV.x, tmpV.y, tmpV.z, m.rotation.x, m.rotation.y, m.rotation.z, w * 0.5, w * 0.5, fl * 0.55, tmpC.r, tmpC.g, tmpC.b);
  }
}

function deriveKart(k, dt, t, cam) {
  const m = memoOf(k), hud = G.fxHud, me = k === G.player;
  const near = me || (k.pos.x - cam.x) ** 2 + (k.pos.z - cam.z) ** 2 < NEAR * NEAR;
  k.mesh.updateMatrix();   // its parent is the scene: the local matrix is the world one, for anything riding the kart
  const s = G.samples[k.idx];
  const lateral = s ? (k.pos.x - s.x) * s.sx + (k.pos.z - s.z) * s.sz : 0, hw = s?.hw ?? G.hw;
  const grounded = !k.air && !(k.fly > 0);
  if (near) {
    // a stun lands: stars off the head; on the local kart the screen flashes and the camera shakes
    if (k.stun > 0 && !(m.stun > 0)) { KINDS.stars({}, k); if (me) { hud.hit = 1; hud.shake = Math.max(hud.shake, 0.9); } }
    else if (me && k.slowed > 0 && !(m.slowed > 0)) hud.hit = Math.max(hud.hit, 0.45);
    drawStatuses(k, t);
    // a boost starts (pad, mini-turbo, an item): speed lines and a burst of fire; the local camera kicks
    if (k.boost > 0 && k.boost > m.boost + 0.25) { KINDS.streak({}, k); KINDS.flame({}, k); if (me) hud.kick = 1; }
    if (k.boost > 0) drawFlames(k, t);
    // the drift: sparks off the rear wheels in the tier's colour, more of them the longer it charges
    if (k.drift.active && k.drift.charge > 0.35) {
      const c = DRIFT_TIERS[k.drift.charge > 2 ? 2 : k.drift.charge > 1 ? 1 : 0], ws = k.mesh.userData.wheels;
      for (let n = due(m.acc, 'drift', 24 + k.drift.charge * 12, dt); n > 0; n--) for (const w of [ws[2], ws[3]]) {
        if (!w) continue; tmpV.set(w.position.x, 0.15, w.position.z - 0.3).applyMatrix4(k.mesh.matrix);
        const p = emit('glow', tmpV.x, tmpV.y, tmpV.z, rnd(0.25, 0.4), c); p.vx = rnd(-3, 3) - Math.sin(k.heading) * 4; p.vz = rnd(-3, 3) - Math.cos(k.heading) * 4; p.vy = rnd(2, 5); p.grav = 16; p.s0 = 1.1; p.s1 = 0.4;
      }
    }
    // dust: off the road, and on a gravel circuit's allées at speed
    const off = Math.abs(lateral) > hw, speed = Math.abs(k.speed);
    if (grounded && speed > 10 && (off || (G.track?.gravel && speed > 22))) {
      for (let n = due(m.acc, 'dust', off ? 14 : 6, dt); n > 0; n--) {
        tmpV.set(rnd(-1, 1), 0.3, -1.4).applyMatrix4(k.mesh.matrix);
        const p = emit('puff', tmpV.x, tmpV.y, tmpV.z, 0.8, off ? 0xb59a6a : 0xd8c9a0); p.s0 = 0.7; p.s1 = 2.2; p.vy = 0.9; p.drag = 2; p.vx = rnd(-1, 1); p.vz = rnd(-1, 1);
      }
    }
    // the helicopter's downwash
    if (k.fly > 0) for (let n = due(m.acc, 'fly', 12, dt); n > 0; n--) { const a = Math.random() * 6.28; const p = emit('puff', k.pos.x + Math.sin(a), (s?.y ?? 0) + 0.3, k.pos.z + Math.cos(a), 0.7, 0xd8d0c0); p.vx = Math.sin(a) * 7; p.vz = Math.cos(a) * 7; p.drag = 3; p.s0 = 0.8; p.s1 = 2; }
    // a landing: dust thrown out from under the kart; on the local kart, the camera dips
    if (m.air && !k.air) { KINDS.dust({ x: k.pos.x, y: k.y, z: k.pos.z }); ring(k.pos.x, k.y, k.pos.z, 1, 3.2, 0.35, 0xd8c9a0); if (me) hud.dip = Math.max(hud.dip, 0.45); }
    // the relance's next boost: coins
    if ((k.relance || 0) < m.relance) KINDS.coins({ x: k.pos.x, y: k.y, z: k.pos.z });
    // pits and pads, on the way in
    const pit = grounded ? zoneOf(G.pits, k, lateral, hw) : null;
    if (pit && pit !== m.pit) {
      const at = { x: k.pos.x, y: k.y, z: k.pos.z };
      if (pit.kind === 'water') KINDS.splash(at); else if (pit.kind === 'works') { KINDS.dust({ ...at, c: 0x8a6a3a }); KINDS.impact({ ...at, c: 0xff6a00 }); } else KINDS.papers(at);
    }
    m.pit = pit;
    const pad = grounded ? zoneOf(G.pads, k, lateral, hw) : null;
    if (pad && pad !== m.pad) { pad.flash = 1; KINDS.streak({ c: 0xf2c14e }, k); }
    m.pad = pad;
  }
  // the finish line: confetti from both posts of the gantry, a fistful for the winner's kart
  if (k.finished && !m.fin) {
    const s0 = G.samples[0];
    if (s0) for (const side of [-1, 1]) KINDS.confetti({ x: s0.x + s0.sx * side * (s0.hw ?? G.hw), y: s0.y + 4, z: s0.z + s0.sz * side * (s0.hw ?? G.hw), r: me ? 46 : 14 });
    if (me) KINDS.confetti({ x: k.pos.x, y: k.y, z: k.pos.z, r: 30 });
  }
  if (me) {
    // a lap completed: a gold ring at the kart and the HUD's gold flash
    if (k.lap > m.best && !k.finished) { m.best = k.lap; hud.lap = 1; ring(k.pos.x, k.y, k.pos.z, 1, 7, 0.6, 0xf2c14e); spray('glow', 10, k.pos.x, k.y + 1.5, k.pos.z, { v: 5, up: 4, grav: 2, life: 0.6, color: 0xffe9a0 }); }
    // the item goes (used, stolen or knocked out of the slot): the slot flashes
    if (m.item && !k.item && !(k.itemRolling > 0)) hud.used++;
  }
  m.stun = k.stun; m.boost = k.boost; m.air = k.air; m.fin = k.finished; m.lap = k.lap; m.item = k.item; m.rolling = k.itemRolling > 0; m.relance = k.relance || 0; m.slowed = k.slowed || 0; m.fly = k.fly;
}

/** The ballot boxes: a burst where one is taken, a pop and a scale-in where one comes back. */
function deriveBoxes(dt) {
  const boxes = G.itemBoxes;
  if (V.boxes.length !== boxes.length) V.boxes = boxes.map(b => ({ vis: b.mesh.visible, pop: 0 }));
  boxes.forEach((b, i) => {
    const m = V.boxes[i], vis = b.mesh.visible;
    if (m.vis && !vis) { spray('flake', 12, b.x, b.mesh.position.y, b.z, { v: 5, up: 6, grav: 9, life: 0.9, colors: [0xffd34d, 0xfff1b0, 0xf6f1e4], drag: 1, spin: 9, flutter: 3 }); spray('glow', 8, b.x, b.mesh.position.y, b.z, { v: 7, up: 3, grav: 4, life: 0.35, color: 0xffe9a0 }); }
    if (!m.vis && vis) { m.pop = 0.35; KINDS.pop({ x: b.x, y: b.mesh.position.y, z: b.z }); }
    if (m.pop > 0) { m.pop = Math.max(0, m.pop - dt); const f = 1 - m.pop / 0.35; b.mesh.scale.setScalar(Math.max(0.05, 1 + 0.25 * Math.sin(f * Math.PI) - (1 - f) * 0.6)); if (m.pop === 0) b.mesh.scale.setScalar(1); }
    m.vis = vis;
  });
}

/** The dash pads breathe, and flash when a kart takes one. */
function derivePads(dt, t) {
  for (let i = 0; i < G.pads.length; i++) {
    const p = G.pads[i]; if (!p.mesh) continue;
    p.flash = Math.max(0, (p.flash || 0) - dt * 2.5);
    p.mesh.material.color.setScalar(0.85 + 0.2 * Math.sin(t * 6 - i * 1.3) + p.flash * 0.9);
  }
}

/**
 * One view frame of effects: what each kart's state calls for, the boxes and
 * pads, every live particle, and G.fxHud's decay. Solo and team races alike
 * (race.js viewStep); a no-op headless.
 */
export function updateVfx(dt) {
  if (!V) return;
  V.t += dt; const t = V.t, hud = G.fxHud;
  for (const name of LAYERS) V.layers[name].n = 0;
  const cam = G.player ? G.player.pos : { x: 0, z: 0 };
  for (const k of G.karts) if (k.mesh) deriveKart(k, dt, t, cam);
  deriveBoxes(dt); derivePads(dt, t);
  for (const name of LAYERS) stepLayer(V.layers[name], dt);
  for (const name of LAYERS) {
    const L = V.layers[name]; L.mesh.count = L.n; L.mesh.visible = L.n > 0;
    if (L.n) { L.mesh.instanceMatrix.updateRange.count = L.n * 16; L.mesh.instanceMatrix.needsUpdate = true; L.mesh.instanceColor.updateRange.count = L.n * 3; L.mesh.instanceColor.needsUpdate = true; }
  }
  const fall = (v, rate) => Math.max(0, v - dt * rate);
  hud.hit = fall(hud.hit, 2.2); hud.shake = fall(hud.shake, 2.5); hud.dip = fall(hud.dip, 1.6); hud.kick = fall(hud.kick, 2.5); hud.lap = fall(hud.lap, 1.6);
}
