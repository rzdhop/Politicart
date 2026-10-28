// What a kart leaves behind it: the trail (kartstyle.js TRAILS, DEC-036).
//
// A trail is a pool of POOL particle objects in world space, living in one
// Group the race adds to the scene next to the kart (race.js makeKart). Every
// frame updateKartVisual calls update(k, dt): while the kart moves faster
// than MIN_SPEED a particle is spawned at the kart's rear every few
// hundredths of a second, faster the faster it goes, and each live particle
// ages, moves the way its kind does and fades, then goes back to the pool.
// The oldest particle is recycled when the pool runs dry.
//
// Everything is allocated in buildTrail: update never creates an object, so
// seven karts trailing confetti cost the garbage collector nothing. The
// geometries are shared per kind and never disposed, like primitives.js'
// material cache; the materials are per particle, since each fades on its own.
//
// DOM-free: the game server runs it headless (DEC-014), and a mesh needs no
// renderer to exist.
//
// The stage variant (`{ stage: true }`, the Garage's podium, A-032) is the
// same trail for the select stage's look (stagelook.js, DEC-043): the race
// draws in linear output with no tone mapping, so an authored hex shows as
// itself; under the stage's ACES and sRGB output the same basic materials
// read washed out (the laser came out white-pink). There every colour is
// converted to linear and the materials skip tone mapping, so each one
// shows on the podium as it does on the track. It also keeps a smaller pool
// (STAGE_POOL), spawned just often enough to fill it over a particle's
// life, and a shorter laser (STAGE_REACH): a trail on a podium is a few
// draw calls, not a race's worth, and stays on the podium.
import * as THREE from 'three';

import { clamp } from './util.js';

/** Particles per trail: enough for a dense ribbon at race distance (stage 7 raised it from 24). */
export const POOL = 36;
/** Particles per stage trail (the podium's), which spawns one every life / STAGE_POOL seconds. */
export const STAGE_POOL = 10;
/** How far a stage particle may stretch (the laser's beam, 1.6 long, to 2.4): the podium is 2.8 across its radius. */
const STAGE_REACH = 1.5;
/** No trail below this speed (a kart idling on the grid leaves nothing). */
export const MIN_SPEED = 4;
/** Seconds between two spawns, at MIN_SPEED and at top speed. */
export const SPAWN_SLOW = 0.027, SPAWN_FAST = 0.017;
/** The speed at which spawning is fastest (a stock kart's top speed, physics.js). */
const TOP_SPEED = 42;
/** Where a particle is born, in kart space: behind the rear bumper, at axle height. */
const REAR_Z = -1.5, REAR_Y = 0.4;

const TRICOLORE = [0x1f3a93, 0xf6f1e4, 0xc8102e];
const CONFETTI = [0x1f3a93, 0xf6f1e4, 0xc8102e, 0xf2c14e];

/**
 * The world-space point behind kart k where its trail starts, written into
 * `out` (a Vector3) and returned. Pure: the kart's local +z is its nose and
 * rotation.y its heading, so forward is (sin h, 0, cos h).
 */
export function rearOf(k, out) {
  return out.set(k.pos.x + Math.sin(k.heading) * REAR_Z, (k.y || 0) + REAR_Y, k.pos.z + Math.cos(k.heading) * REAR_Z);
}

// ---------- The kinds ----------
// Each kind: `life` in seconds, `build()` one particle object (its materials
// are its own), `spawn(p, k)` sets it up at birth and `move(p, dt, f)` poses
// it at age fraction f (0 at birth, 1 at death). `p.vel` and `p.spin` are the
// per-particle Vector3s the kinds may use; `p.obj` is the Object3D.
let GEO = null;
function geo() {
  if (GEO) return GEO;
  GEO = {
    ribbon: new THREE.BoxGeometry(0.22, 0.1, 0.5),
    smoke: new THREE.SphereGeometry(0.3, 6, 5),
    sparkle: new THREE.OctahedronGeometry(0.16, 0),
    confetti: new THREE.PlaneGeometry(0.44, 0.3),
    // the beams start at the spawn point and run backwards, so scaling z stretches them away from the kart
    beam: new THREE.BoxGeometry(0.1, 0.1, 1.6).translate(0, 0, -0.8),
    core: new THREE.BoxGeometry(0.04, 0.04, 1.6).translate(0, 0, -0.8),
  };
  return GEO;
}
const basic = (color, extra) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, ...extra });
/** The stage's: the colour converted to linear and no tone mapping, so it shows as authored under the stage look. */
const stageBasic = (color, extra) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), transparent: true, depthWrite: false, toneMapped: false, ...extra });
const fade = (p, f) => { for (const m of p.mats) m.opacity = p.alpha * (1 - f); };
const pick = list => list[Math.floor(Math.random() * list.length)];

const KINDS = {
  ribbon: {
    life: 0.9, alpha: 0.9,
    build: mk => { const g = new THREE.Group(); const mats = TRICOLORE.map((c, i) => { const m = mk(c); const b = new THREE.Mesh(geo().ribbon, m); b.position.x = (i - 1) * 0.24; g.add(b); return m; }); return { obj: g, mats }; },
    spawn: (p, k) => { p.obj.rotation.set(0, k.heading, 0); p.obj.scale.setScalar(1); },
    move: (p, dt, f) => { fade(p, f); },
  },
  smoke: {
    life: 1.0, alpha: 0.45,
    build: mk => { const m = mk(0x9a9a9a); return { obj: new THREE.Mesh(geo().smoke, m), mats: [m] }; },
    spawn: (p, k) => { p.vel.set((Math.random() - 0.5) * 0.6, 0.9 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6); p.obj.rotation.set(0, 0, 0); },
    move: (p, dt, f) => { p.obj.position.addScaledVector(p.vel, dt); p.obj.scale.setScalar(0.5 + f * 2.4); fade(p, f); },
  },
  sparkles: {
    life: 0.7, alpha: 1,
    build: mk => { const m = mk(0xf2c14e); return { obj: new THREE.Mesh(geo().sparkle, m), mats: [m] }; },
    spawn: (p, k) => { p.vel.set((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4); p.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10); p.obj.scale.setScalar(1); },
    move: (p, dt, f) => { p.vel.y -= 9 * dt; p.obj.position.addScaledVector(p.vel, dt); p.obj.rotation.x += p.spin.x * dt; p.obj.rotation.y += p.spin.y * dt; p.obj.rotation.z += p.spin.z * dt; fade(p, f); },
  },
  confetti: {
    life: 1.1, alpha: 1,
    build: mk => { const m = mk(0xffffff, { side: THREE.DoubleSide }); return { obj: new THREE.Mesh(geo().confetti, m), mats: [m] }; },
    spawn: (p, k) => { p.paint(p.mats[0], pick(CONFETTI)); p.vel.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3); p.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8); p.obj.scale.setScalar(1); },
    move: (p, dt, f) => { p.vel.y -= 3 * dt; p.vel.x += Math.sin(p.age * 9) * 2 * dt; p.obj.position.addScaledVector(p.vel, dt); p.obj.rotation.x += p.spin.x * dt; p.obj.rotation.y += p.spin.y * dt; p.obj.rotation.z += p.spin.z * dt; fade(p, f); },
  },
  laser: {
    life: 0.45, alpha: 0.85,
    build: mk => {
      const g = new THREE.Group(); const mats = [];
      for (const x of [-0.35, 0.35]) {
        const beam = mk(0xff2a2a, { blending: THREE.AdditiveBlending }); const core = mk(0xffffff, { blending: THREE.AdditiveBlending });
        const b = new THREE.Mesh(geo().beam, beam); b.position.x = x; g.add(b); const c = new THREE.Mesh(geo().core, core); c.position.x = x; g.add(c); mats.push(beam, core);
      }
      return { obj: g, mats };
    },
    spawn: (p, k) => { p.obj.rotation.set(0, k.heading, 0); p.obj.scale.set(1, 1, 0.6); },
    move: (p, dt, f) => { p.obj.scale.z = 0.6 + f * 3.4; p.obj.position.y = Math.max(0.1, p.obj.position.y); fade(p, f); },
  },
};

/**
 * Build the trail of one kart: `{ group, update(k, dt), dispose() }`, or
 * null for 'none' and anything unknown. `group` holds the POOL particle
 * objects (STAGE_POOL with `stage`), all hidden until spawned; each
 * carries `userData.age` and `userData.life` for anyone who wants to look.
 * `stage: true` builds the variant for the select stage's look (see the
 * header).
 */
export function buildTrail(kind, { stage = false } = {}) {
  const K = KINDS[kind]; if (!K) return null;
  const group = new THREE.Group(); group.name = 'trail:' + kind;
  const parts = [], n = stage ? STAGE_POOL : POOL, mk = stage ? stageBasic : basic;
  const paint = stage ? (m, hex) => m.color.setHex(hex).convertSRGBToLinear() : (m, hex) => m.color.setHex(hex);
  for (let i = 0; i < n; i++) {
    const built = K.build(mk); const obj = built.obj; obj.visible = false; obj.userData.age = 0; obj.userData.life = K.life;
    group.add(obj); parts.push({ obj, mats: built.mats, vel: new THREE.Vector3(), spin: new THREE.Vector3(), age: 0, live: false, alpha: K.alpha, paint });
  }
  let next = 0, acc = 0; const at = new THREE.Vector3();
  const spawn = k => {
    const p = parts[next]; next = (next + 1) % n;             // the oldest, when every slot is taken
    rearOf(k, at); p.obj.position.copy(at); p.obj.visible = true; p.age = 0; p.live = true; p.obj.userData.age = 0;
    K.spawn(p, k); K.move(p, 0, 0);
  };
  return {
    group,
    update(k, dt) {
      for (const p of parts) {
        if (!p.live) continue;
        p.age += dt; p.obj.userData.age = p.age;
        if (p.age >= K.life) { p.live = false; p.obj.visible = false; continue; }
        K.move(p, dt, p.age / K.life);
        if (stage && p.obj.scale.z > STAGE_REACH) p.obj.scale.z = STAGE_REACH;   // a laser on a podium stays on it
      }
      if (!(k.speed > MIN_SPEED)) { acc = 0; return; }
      const every = stage ? K.life / n : SPAWN_SLOW + (SPAWN_FAST - SPAWN_SLOW) * clamp((k.speed - MIN_SPEED) / (TOP_SPEED - MIN_SPEED), 0, 1);
      acc = Math.min(acc + dt, 0.2);           // a long frame spawns a burst, never a whole pool
      while (acc >= every) { acc -= every; spawn(k); }
    },
    dispose() {
      for (const p of parts) { for (const m of p.mats) m.dispose(); group.remove(p.obj); }
      parts.length = 0;
    },
  };
}
