// The Politibox opening: a gold ballot urn that drops, spins, rattles and
// bursts open on the shared canvas, then shows what it held (DEC-037).
//
// Like preview.js, this is a small scene of its own drawn with the one
// renderer and the one camera of render.js (whose fov and position it sets
// every frame, as every user of that shared camera must). Browser-only in
// practice: the game server never imports it. It still imports nothing that
// touches the DOM at load, so its timeline runs headless in lootbox.test.js.
//
// The opening is a timed phase machine over one clock:
//
//   drop   0.6 s  the urn falls onto the pedestal (easeOutBounce)
//   spin   1.2 s  it turns faster and faster while the camera dollies in
//   shake  1.6 s  four rattles of growing amplitude; light in the prize's
//                 grade colour leaks through the slot, brighter each time
//   burst  0.5 s  the lid flies off and tumbles away; 120 sparks in the grade
//                 colour and 40 confetti ribbons explode out under gravity
//   reveal        the urn sinks and the prize rises on the pedestal, turning
//   hold          until the player leaves
//
// makeTimeline() is that table, pure. playOpening() starts a run and reports
// each phase it enters to `onPhase`, in order, so the DOM half (the
// library's RevealStage) can flash on `burst` and show the result card on
// `reveal`. A tap calls skipOpening(): before the burst it jumps to the
// burst, after it to the reveal, so nobody -- the E2E suite included -- ever
// has to wait for the animation.
//
// The sparks and confetti are allocated once with the scene and recoloured
// per opening; renderLootbox() allocates nothing per frame. The prize is
// built when an opening starts and disposed when the next one does.
import * as THREE from 'three';

import { parsePartKey } from './catalog.js';
import { CHARACTERS } from './data.js';
import { buildKart } from './kart.js';
import { builtinStyle, mergeStyle } from './kartstyle.js';
import { canvasTexture, mat } from './primitives.js';
import { camera, getRenderer } from './render.js';
import { buildTrail } from './trail.js';
import { clamp, easeInOutCubic, easeOutBack, easeOutBounce, lerp } from './util.js';

/** The phases of an opening, in the order they play. */
export const PHASES = Object.freeze(['drop', 'spin', 'shake', 'burst', 'reveal', 'hold']);
/** How long each timed phase lasts, in seconds; `reveal` depends on the prize (REVEAL_TIME). */
export const PHASE_TIME = Object.freeze({ drop: 0.6, spin: 1.2, shake: 1.6, burst: 0.5 });
/** How long the prize takes to come out, by drop kind: a kart circling with its trail needs a lap. */
export const REVEAL_TIME = Object.freeze({ char: 1.4, part: 1.2, trail: 1.6, coins: 1.0 });

// The grade colours and dropGrade live in boxgate.js, the module that loads this one on demand
// (DEC-055): the Politibox screen reads them without pulling the opening in. Re-exported, so this
// stays the Politibox's API.
import { dropGrade, GRADE_COLOUR } from './boxgate.js';
export { dropGrade, GRADE_COLOUR };

/**
 * The opening's timeline for `drop`: `phase(t)` names the phase at `t`
 * seconds with its local time and progress `k` in [0, 1] (`hold` from
 * `duration` on), and `skip(t)` is where a tap at `t` jumps to.
 */
export function makeTimeline(drop) {
  const durations = { ...PHASE_TIME, reveal: REVEAL_TIME[drop?.kind] ?? REVEAL_TIME.part };
  const starts = {}; let at = 0;
  for (const name of PHASES.slice(0, -1)) { starts[name] = at; at = Math.round((at + durations[name]) * 1e6) / 1e6; }   // 0.6 + 1.2 is 1.8, not 1.7999…
  const duration = at;
  return {
    duration, starts, durations,
    phase(t) {
      if (t >= duration) return { name: 'hold', t: t - duration, k: 1 };
      for (let i = PHASES.length - 2; i >= 0; i--) {
        const name = PHASES[i];
        if (t >= starts[name] || i === 0) return { name, t: Math.max(0, t - starts[name]), k: clamp((t - starts[name]) / durations[name], 0, 1) };
      }
      return { name: 'drop', t: 0, k: 0 };   // unreachable: i === 0 answers
    },
    skip(t) {
      if (t < starts.burst) return starts.burst;
      if (t < starts.reveal) return starts.reveal;
      return t;
    },
  };
}

// ---------- The scene ----------
const SPARKS = 120, CONFETTI = 40, GRAVITY = 14;
const PEDESTAL_TOP = 0.6;      // where the urn and the prize stand
const URN = { w: 2.4, h: 1.9, d: 1.8 };

let S = null;   // everything built once: scene, urn, lid, pools

/** A soft radial vignette: lighter navy in the middle, the scene colour at the edges. */
function vignette(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, '#24306e'); g.addColorStop(0.55, '#141c48'); g.addColorStop(1, '#090e26');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

/** The urn's front plate: "RF" in white on the republic's blue. */
function rfPlate(ctx, w, h) {
  ctx.fillStyle = '#1f3a93'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 10; ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 84px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('RF', w / 2, h / 2 + 4);
}

/** The Politibox: a gold ballot urn with a tricolore band, a slot in its lid, a knob and an RF plate. Body bottom at y 0. */
function buildUrn() {
  const urn = new THREE.Group();
  const gold = mat(0xd4af37, 0.3);
  const body = new THREE.Mesh(new THREE.BoxGeometry(URN.w, URN.h, URN.d), gold); body.position.y = URN.h / 2; urn.add(body);
  // the tricolore band round the middle: blue, white, red across the front
  [[0x1f3a93, -URN.w / 3], [0xf6f1e4, 0], [0xc8102e, URN.w / 3]].forEach(([c, x]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(URN.w / 3, 0.36, URN.d + 0.04), mat(c, 0.6)); b.position.set(x, URN.h * 0.42, 0); urn.add(b);
  });
  // a darker plinth and cornice, so the gold reads as a box and not a slab
  const trim = mat(0xa8801c, 0.35);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(URN.w + 0.16, 0.16, URN.d + 0.16), trim); plinth.position.y = 0.08; urn.add(plinth);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.44), new THREE.MeshBasicMaterial({ map: canvasTexture(256, 140, rfPlate) }));
  plate.position.set(0, URN.h * 0.74, URN.d / 2 + 0.01); urn.add(plate);
  // the lid: its own group so it can fly off; the slot glows with the prize's grade
  const lid = new THREE.Group(); lid.position.y = URN.h;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(URN.w + 0.12, 0.22, URN.d + 0.12), trim); slab.position.y = 0.11; lid.add(slab);
  const top = new THREE.Mesh(new THREE.BoxGeometry(URN.w - 0.3, 0.12, URN.d - 0.3), gold); top.position.y = 0.28; lid.add(top);
  const slotMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const slot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.16), slotMat); slot.position.set(0, 0.35, 0.35); lid.add(slot);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.18, 10), trim); stem.position.set(0, 0.43, -0.35); lid.add(stem);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), gold); knob.position.set(0, 0.6, -0.35); lid.add(knob);
  urn.add(lid);
  const glow = new THREE.PointLight(0xffffff, 0, 9, 2); glow.position.set(0, URN.h + 0.6, 0.35); urn.add(glow);
  return { urn, lid, slotMat, glow };
}

function ensureBoxScene() {
  if (S) return S;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x090e26);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223066, 0.8)); scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const key = new THREE.DirectionalLight(0xfff4d6, 1.15); key.position.set(4, 10, 7); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffe7b0, 0.4); fill.position.set(-3, 3, 10); scene.add(fill);    // the front of the urn, where its plate is
  const rim = new THREE.DirectionalLight(0x7c9cff, 0.45); rim.position.set(-6, 4, -6); scene.add(rim);
  // the backdrop: a vignetted wall far behind, which the camera never leaves
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(90, 56), new THREE.MeshBasicMaterial({ map: canvasTexture(512, 512, vignette) }));
  wall.position.set(0, 6, -24); scene.add(wall);
  // the round pedestal, with a gold rim like the turntable's
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 3.0, PEDESTAL_TOP, 48), mat(0x1f2a5e, 0.8)); pedestal.position.y = PEDESTAL_TOP / 2; scene.add(pedestal);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.72, 0.07, 8, 64), new THREE.MeshBasicMaterial({ color: 0xf2c14e })); ring.rotation.x = Math.PI / 2; ring.position.y = PEDESTAL_TOP; scene.add(ring);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), mat(0x0c1230, 0.95)); floor.rotation.x = -Math.PI / 2; scene.add(floor);

  const { urn, lid, slotMat, glow } = buildUrn(); scene.add(urn);
  const prize = new THREE.Group(); scene.add(prize);

  // the burst's pools: one geometry and one material per pool, recoloured per opening
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sparkGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  const sparks = []; for (let i = 0; i < SPARKS; i++) { const m = new THREE.Mesh(sparkGeo, sparkMat); m.visible = false; scene.add(m); sparks.push(m); }
  const confettiGeo = new THREE.PlaneGeometry(0.09, 0.36);
  const confettiMats = [0x1f3a93, 0xf6f1e4, 0xc8102e, 0xf2c14e].map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  const confetti = []; for (let i = 0; i < CONFETTI; i++) { const m = new THREE.Mesh(confettiGeo, confettiMats[i % 4]); m.visible = false; scene.add(m); confetti.push(m); }
  const n = SPARKS + CONFETTI;
  S = {
    scene, urn, lid, slotMat, glow, prize, sparks, sparkMat, confetti,
    vel: new Float32Array(n * 3), spin: new Float32Array(n * 3),
    lidVel: new THREE.Vector3(), lidSpin: new THREE.Vector3(),
    gradeColour: new THREE.Color(), dark: new THREE.Color(0x111111),
    animate: null,   // the prize's own motion, (dt, time) => void
  };
  return S;
}

// ---------- Prizes ----------
// Where each part category sits on a kart, so the glowing ring circles it.
const PART_SPOT = {
  wheels: [0.98, 0.42, 1.0, 0.55], spoiler: [0, 1.35, -1.55, 1.0], sticker: [0, 0.78, 1.7, 0.5], exhaust: [0, 0.45, -1.85, 0.55],
  underglow: [0, 0.12, 0.2, 1.4], mast: [0.45, 1.7, -1.0, 0.5], nose: [0, 0.5, 2.25, 0.6], skin: [0, 0.75, 0.3, 1.5],
};
// The trail prize: the kart's scale on the pedestal, the circle it drives, how fast it goes round,
// and the speed its trail is told (a race speed, so the trail streams as it does on the circuit).
const TRAIL_SCALE = 0.62, TRAIL_RADIUS = 1.75, TRAIL_RATE = 1.6, TRAIL_SPEED = 20;
const extraMats = [];   // materials made for one prize, disposed with it
let prizeTrail = null;  // the trail prize's real trail (trail.js), disposed with the prize

const charDef = id => CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];

function additive(colour, opacity) {
  const m = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  extraMats.push(m); return m;
}

/** A candidate: their kart, their race pilot aboard, its live props (a gyrophare, a weathervane) and the kart's moving parts turning. */
function charPrize(drop) {
  const k = buildKart(charDef(drop.id)); S.prize.add(k);
  let a = 0;
  return dt => { a += dt; k.rotation.y += dt * 0.9; for (const f of k.userData.anim) f(dt, a); };
}

/**
 * A part: a bare kart in the built-in look with that option fitted, and a
 * glowing ring orbiting it. No driver, as ever: the kart is built without
 * its pilot (whose kart-slot props and steering wheel would go with it),
 * and the empty seat anchor stays hidden like the driver always was.
 */
function partPrize(drop, colour) {
  const p = parsePartKey(drop.id) ?? { category: 'wheels', value: 'gold' };
  const def = CHARACTERS[0];
  const k = buildKart(def, mergeStyle(builtinStyle(def), { [p.category]: p.value }), { pilot: false, steering: false });
  k.userData.driver.visible = false;
  const [x, y, z, r] = PART_SPOT[p.category] ?? PART_SPOT.skin;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 40), additive(colour, 0.9)); ring.position.set(x, y, z); k.add(ring);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 16, 12), additive(colour, 0.22)); halo.position.set(x, y, z); k.add(halo);
  S.prize.add(k);
  let a = 0;
  return dt => { a += dt; k.rotation.y += dt * 0.7; ring.rotation.x = a * 2.1; ring.rotation.y = a * 1.3; halo.scale.setScalar(1 + 0.15 * Math.sin(a * 5)); };
}

/**
 * A trail: a kart circling the pedestal with the real trail (trail.js, the
 * one the races draw) streaming behind it. The trail lives in the prize
 * group, scaled like the kart, and is fed a fake kart driving the circle at
 * race speed, so it needs no race scene. An unknown trail id circles bare.
 */
function trailPrize(drop) {
  const holder = new THREE.Group(); S.prize.add(holder);
  const k = buildKart(CHARACTERS[0]); k.scale.setScalar(TRAIL_SCALE); holder.add(k);
  prizeTrail = buildTrail(drop.id);
  if (prizeTrail) { prizeTrail.group.scale.setScalar(TRAIL_SCALE); holder.add(prizeTrail.group); }
  // The fake kart the trail follows, in the trail's (scaled) space: its nose is where it is going.
  const fake = { pos: { x: 0, z: 0 }, y: 0, heading: 0, speed: TRAIL_SPEED, boost: 0 };
  let a = 0;
  return dt => {
    a += dt * TRAIL_RATE;
    // On the circle (cos a, sin a) the velocity is (-sin a, cos a): the heading whose forward (sin h, cos h) that is, is -a.
    k.position.set(Math.cos(a) * TRAIL_RADIUS, 0, Math.sin(a) * TRAIL_RADIUS); k.rotation.y = -a;
    fake.pos.x = k.position.x / TRAIL_SCALE; fake.pos.z = k.position.z / TRAIL_SCALE; fake.heading = -a;
    prizeTrail?.update(fake, dt);
  };
}

/** Coins: a spinning stack, as tall as the win, with a few loose coins bouncing round it. */
function coinsPrize(drop) {
  const gold = mat(0xf2c14e, 0.3), rim = mat(0xa8801c, 0.4);
  const n = clamp(Math.round(Math.log2(Math.max(2, drop.amount)) * 1.4), 3, 14);
  const stack = new THREE.Group(); S.prize.add(stack);
  const coinGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.13, 28), edgeGeo = new THREE.TorusGeometry(0.6, 0.025, 6, 28);
  for (let i = 0; i < n; i++) {
    const c = new THREE.Mesh(coinGeo, gold); c.position.set(Math.sin(i * 2.3) * 0.05, 0.07 + i * 0.14, Math.cos(i * 1.7) * 0.05); stack.add(c);
    const e = new THREE.Mesh(edgeGeo, rim); e.rotation.x = Math.PI / 2; e.position.copy(c.position); stack.add(e);
  }
  const loose = [];
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(coinGeo, gold); c.rotation.z = Math.PI / 2; S.prize.add(c); loose.push(c); }
  let a = 0;
  return dt => {
    a += dt; stack.rotation.y += dt * 1.4;
    loose.forEach((c, i) => { const th = a * 0.8 + i * Math.PI / 2; c.position.set(Math.cos(th) * 1.9, 0.6 + Math.abs(Math.sin(a * 4 + i)) * 1.1, Math.sin(th) * 1.9); c.rotation.y = a * 6 + i; });
  };
}

/** Forget the prize on the pedestal, geometries and one-off materials included (a trail's shared geometries excepted, like a race's). */
function disposePrize() {
  if (prizeTrail) { prizeTrail.group.parent?.remove(prizeTrail.group); prizeTrail.dispose(); prizeTrail = null; }
  while (S.prize.children.length) {
    const c = S.prize.children[0]; S.prize.remove(c);
    c.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  for (const m of extraMats.splice(0)) m.dispose();
  S.animate = null;
}

// ---------- The run ----------
let run = null;   // { drop, tl, clock, at (index of the phase entered), onPhase, burstDone }

/** The phase on screen: one of PHASES, or 'idle' when no opening is playing. */
export const boxPhase = () => (run ? PHASES[run.at] : 'idle');

/** The Politibox scene once one exists (the tests look at what an opening put on the pedestal), else null. */
export const boxScene = () => (S ? S.scene : null);

/**
 * Start opening `drop` (the server's rollBox result): build its prize,
 * colour the light and the sparks with its grade, and play from the drop.
 * `onPhase(name)` hears every phase as it is entered, 'drop' at once.
 *
 * @param {{ kind: string, id?: string, amount?: number, grade?: string, duplicate?: boolean, refund?: number }} drop
 * @param {{ onPhase?: ((name: string) => void) | null }} [options]
 */
export function playOpening(drop, { onPhase = null } = {}) {
  ensureBoxScene();
  disposePrize();
  const colour = GRADE_COLOUR[dropGrade(drop)];
  S.gradeColour.setHex(colour); S.sparkMat.color.setHex(colour); S.glow.color.setHex(colour);
  // the urn whole again: lid on, slot dark, nothing in the air
  S.urn.visible = true; S.urn.position.set(0, 8, 0); S.urn.rotation.set(0, 0, 0); S.urn.scale.setScalar(1);
  S.lid.position.set(0, URN.h, 0); S.lid.rotation.set(0, 0, 0); S.lid.visible = true;
  S.slotMat.color.copy(S.dark); S.glow.intensity = 0;
  for (const m of S.sparks) m.visible = false; for (const m of S.confetti) m.visible = false;
  S.animate = drop.kind === 'char' ? charPrize(drop) : drop.kind === 'trail' ? trailPrize(drop) : drop.kind === 'coins' ? coinsPrize(drop) : partPrize(drop, colour);
  S.prize.visible = false; S.prize.position.y = PEDESTAL_TOP - 2;
  run = { drop, tl: makeTimeline(drop), clock: 0, at: 0, onPhase, burstDone: false };
  onPhase?.('drop');
}

/** Stop and forget the opening (the player left); the scene is kept for the next one. */
export function stopOpening() { run = null; }

/** A tap on the stage: jump to the burst, or from the burst on to the reveal. */
export function skipOpening() {
  if (!run) return;
  run.clock = run.tl.skip(run.clock);
  stepOpening(0);
}

/** Launch the lid and every spark and ribbon from the slot. */
function burst() {
  run.burstDone = true;
  S.lidVel.set((Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 1.5), 9.5, -2.5 - Math.random());   // up, aside and away, never over the prize S.lidSpin.set(4 + Math.random() * 3, (Math.random() - 0.5) * 4, 2 + Math.random() * 2);
  const all = SPARKS + CONFETTI, oy = PEDESTAL_TOP + URN.h + 0.3;      // the slot of the urn at rest, wherever a skip caught it
  S.lid.position.set(0, URN.h, 0); S.lid.rotation.set(0, 0, 0);
  for (let i = 0; i < all; i++) {
    const m = i < SPARKS ? S.sparks[i] : S.confetti[i - SPARKS];
    const th = Math.random() * Math.PI * 2, up = 0.35 + Math.random() * 0.65, sp = (i < SPARKS ? 5 : 3.5) + Math.random() * 5;
    m.position.set((Math.random() - 0.5) * 0.8, oy, 0.2 + (Math.random() - 0.5) * 0.4); m.visible = true; m.scale.setScalar(1);
    S.vel[i * 3] = Math.cos(th) * sp * (1 - up * 0.5); S.vel[i * 3 + 1] = up * sp * 1.4; S.vel[i * 3 + 2] = Math.sin(th) * sp * (1 - up * 0.5);
    S.spin[i * 3] = (Math.random() - 0.5) * 14; S.spin[i * 3 + 1] = (Math.random() - 0.5) * 14; S.spin[i * 3 + 2] = (Math.random() - 0.5) * 14;
  }
}

/** Move what is in the air: the lid, the sparks, the confetti (which flutters down slower). */
function fly(dt) {
  if (!run.burstDone || dt <= 0) return;
  if (S.lid.visible) {
    S.lidVel.y -= GRAVITY * dt;
    S.lid.position.x += S.lidVel.x * dt; S.lid.position.y += S.lidVel.y * dt; S.lid.position.z += S.lidVel.z * dt;
    S.lid.rotation.x += S.lidSpin.x * dt; S.lid.rotation.y += S.lidSpin.y * dt; S.lid.rotation.z += S.lidSpin.z * dt;
    if (S.lid.position.y < -12) S.lid.visible = false;
  }
  const all = SPARKS + CONFETTI;
  for (let i = 0; i < all; i++) {
    const confetto = i >= SPARKS, m = confetto ? S.confetti[i - SPARKS] : S.sparks[i];
    if (!m.visible) continue;
    const j = i * 3;
    if (confetto) { S.vel[j + 1] = Math.max(S.vel[j + 1] - GRAVITY * 0.35 * dt, -2.2); S.vel[j] *= 1 - 0.8 * dt; S.vel[j + 2] *= 1 - 0.8 * dt; }
    else S.vel[j + 1] -= GRAVITY * dt;
    m.position.x += S.vel[j] * dt; m.position.y += S.vel[j + 1] * dt; m.position.z += S.vel[j + 2] * dt;
    m.rotation.x += S.spin[j] * dt; m.rotation.y += S.spin[j + 1] * dt; m.rotation.z += S.spin[j + 2] * dt;
    if (!confetto) m.scale.setScalar(Math.max(0.05, m.scale.x - dt * 0.45));
    if (m.position.y < 0) m.visible = false;
  }
}

/** Pose everything for phase `ph` (from timeline.phase) after `dt` seconds. */
function pose(ph, dt) {
  const u = S.urn, base = PEDESTAL_TOP;
  if (ph.name === 'drop') { u.position.y = lerp(8, base, easeOutBounce(ph.k)); u.rotation.set(0, 0, 0); }
  else if (ph.name === 'spin') { u.position.y = base; u.rotation.set(0, Math.PI * 4 * ph.k * ph.k, 0); }     // two turns, ending face on
  else if (ph.name === 'shake') {
    // four rattles, each one stronger, the slot brighter with each
    const r = Math.min(3, Math.floor(ph.k * 4)), f = ph.k * 4 - r, env = Math.sin(Math.PI * f), amp = (0.25 + 0.75 * (r + 1) / 4) * env;
    u.position.set(Math.sin(ph.t * 61) * 0.06 * amp, base + Math.abs(Math.sin(ph.t * 47)) * 0.08 * amp, 0);
    u.rotation.set(Math.sin(ph.t * 53) * 0.05 * amp, 0, Math.sin(ph.t * 67) * 0.1 * amp);
    S.lid.position.y = URN.h + 0.1 * amp; S.lid.rotation.z = Math.sin(ph.t * 71) * 0.06 * amp;
    const light = (r + 1) / 4 * (0.35 + 0.65 * env);
    S.glow.intensity = 4.5 * light; S.slotMat.color.copy(S.dark).lerp(S.gradeColour, Math.min(1, light * 1.2));
  } else if (ph.name === 'burst') {
    u.position.set(0, base, 0); u.rotation.set(0, 0, 0);
    S.glow.intensity = 9 * (1 - ph.k) + 1; S.slotMat.color.copy(S.gradeColour);
  } else {
    // reveal and hold: the urn sinks away, the prize rises and turns
    const k = ph.name === 'hold' ? 1 : ph.k;
    const sink = easeInOutCubic(Math.min(1, k * 1.6)), rise = easeOutBack(clamp((k - 0.25) / 0.7, 0, 1));
    u.position.set(0, base - 3.2 * sink, 0); u.rotation.set(0, 0, 0); u.visible = sink < 1;
    S.glow.intensity = 1.2 * (1 - sink);
    if (k > 0.6) S.lid.visible = false;
    S.prize.visible = true; S.prize.position.y = lerp(base - 2.2, base, rise);
    S.animate?.(dt);
  }
}

/** Where the camera stands for phase `ph`: back for the drop, dollied in for the rattles, framing the prize after. */
function frameCamera(ph) {
  const W = window.innerWidth, H = window.innerHeight;
  camera.aspect = W / H; camera.fov = 42 * Math.max(1, 0.8 / camera.aspect);
  let z = 11.5, y = 4.4, look = 1.7;
  if (ph.name === 'spin') { const e = easeInOutCubic(ph.k); z = lerp(11.5, 8.6, e); y = lerp(4.4, 3.6, e); look = lerp(1.7, 1.9, e); }
  else if (ph.name === 'shake' || ph.name === 'burst') { z = 8.6; y = 3.6; look = 1.9; }
  else if (ph.name === 'reveal' || ph.name === 'hold') {
    // the result card covers the bottom of the screen: look below the prize so it turns in the upper part
    const e = easeInOutCubic(ph.name === 'hold' ? 1 : ph.k), portrait = camera.aspect < 1;
    z = lerp(8.6, portrait ? 11.5 : 12, e); y = lerp(3.6, 5.2, e); look = lerp(1.9, portrait ? -1.4 : -0.7, e);
  }
  camera.position.set(0, y, z); camera.lookAt(0, look, 0); camera.updateProjectionMatrix();
}

/**
 * Advance the opening by `dt` seconds without drawing: enter (and report)
 * every phase the clock has reached, in order, then pose the scene. What
 * renderLootbox() does before it draws; the tests call it directly.
 */
export function stepOpening(dt) {
  if (!run) return null;
  run.clock += dt;
  const ph = run.tl.phase(run.clock);
  const target = PHASES.indexOf(ph.name);
  while (run.at < target) {
    run.at++;
    const name = PHASES[run.at];
    if (name === 'burst' || (name === 'reveal' && !run.burstDone)) burst();
    run.onPhase?.(name);
  }
  fly(dt);
  pose(ph, dt);
  return ph;
}

/** Advance the opening and draw it on the shared canvas. */
export function renderLootbox(dt) {
  ensureBoxScene();
  const ph = stepOpening(dt) ?? { name: 'hold', t: 0, k: 1 };
  const r = getRenderer();
  r.setScissorTest(false); r.setViewport(0, 0, window.innerWidth, window.innerHeight);
  frameCamera(ph);
  r.render(S.scene, camera);
}
