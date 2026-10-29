// The Politibox opening on the hemicycle stage (DEC-037, DEC-054).
//
// A gold ballot urn drops onto the select stage's podium (hemicycle.js
// buildStageScene, drawn in the stage's look through stagelook.js withLook,
// with a camera of its own: the race's shared camera is never touched),
// spins, teases its prize's rarity, bursts open in confetti and sparks, and
// the prize comes up through the podium: a candidate's kart with their
// pilot aboard, a part fitted on a bare kart, a kart circling with its
// trail, or a fountain of coins. Browser-only in practice (the game server
// never imports it), but it touches no DOM at load: the timeline and every
// pose run headless in lootbox.test.js.
//
// The opening is a timed phase machine over one clock. One opening:
//
//   drop   0.6 s  the urn falls onto the podium (easeOutBounce)
//   spin   1.0 s  the podium turns it twice, faster and faster, the camera dollies in
//   tease  1.4 s  the rarity build-up: four rattles of growing amplitude, the
//                 tiers' LED strips and the sky's glow going to the grade's
//                 colour and pulsing at the grade's rate (TEASE_RATE), light
//                 leaking through the slot; an incredible prize adds a
//                 BLACKOUT beat (0.3 s of dark) before the burst
//   burst  0.5 s  the lid flies off and tumbles; the stage's confetti is
//                 thrown up and the urn's own sparks explode out in the grade colour
//   reveal        the urn sinks into the podium, the prize rises (REVEAL_TIME by kind)
//   hold          until the player leaves
//
// A bundle (x5) chains five openings; between two of them a `next` phase
// (0.8 s) sinks the prize away before the next urn drops. makeTimeline()
// is that table, pure. playOpening() starts a run and reports each phase it
// enters to `onPhase(name, index)`, in order, so the DOM half (the
// library's RevealStage) can pulse on `tease`, flash on `burst` and show
// the result card on `reveal`. A tap calls skipOpening(): before the burst
// it jumps to the burst, from the burst to the reveal, and from a reveal
// that is not the last on to the next urn; nobody -- the E2E suite
// included -- ever waits on the animation.
//
// Where the stage does not move by itself (prefers-reduced-motion, or a GPU
// the governor found too slow: preview.js moving()), every opening cuts
// straight to its reveal, and the scene is drawn only when its picture
// changes, as the select stage does.
//
// Sounds (audio.js, synthesized) play from the timeline through sfx(): the
// box is a solo screen, so there is no kart to route them by.
//
// The scene is built on the first opening and kept across "Encore une !";
// stopOpening() (the player left) disposes all of it: the stage, the urn,
// the sparks, the prize. The urn is built from stage materials (stagelook
// stageMat), so the race never draws what the box draws (DEC-043).
import * as THREE from 'three';

import { sfx } from './audio.js';
import { parsePartKey } from './catalog.js';
import { CHARACTERS } from './data.js';
import { textureTier } from './fabric.js';
import { countMeshes, countTriangles } from './geo.js';
import { buildStageScene, PODIUM, SKY_RADIUS } from './hemicycle.js';
import { buildKart } from './kart.js';
import { MOUNT } from './pilot.js';
import { builtinStyle, defaultStyle, mergeStyle } from './kartstyle.js';
import { buildRig, disposeKart, disposeRig, drewFrame, govern, moving, stageTier } from './preview.js';
import { canvasTexture } from './primitives.js';
import { getRenderer } from './render.js';
import { GOLD, linear, STAGE_LOOK, stageMat, withLook } from './stagelook.js';
import { buildTrail } from './trail.js';
import { clamp, easeInOutCubic, easeOutBack, easeOutBounce, lerp } from './util.js';

/** Every phase an opening can report, in the order they play; `next` only between two openings of a bundle. */
export const PHASES = Object.freeze(['drop', 'spin', 'tease', 'burst', 'reveal', 'next', 'hold']);
/** The phases of one opening, in order (what a single box plays before `hold`). */
export const OPENING = Object.freeze(['drop', 'spin', 'tease', 'burst', 'reveal']);
/** How long each timed phase lasts, in seconds; `reveal` depends on the prize (REVEAL_TIME), `tease` on its grade (BLACKOUT). */
export const PHASE_TIME = Object.freeze({ drop: 0.6, spin: 1.0, tease: 1.4, burst: 0.5, next: 0.8 });
/** The beat of dark an incredible prize adds at the end of its tease, in seconds. */
export const BLACKOUT = 0.3;
/** How long the prize takes to come out, by drop kind: a kart circling with its trail needs a lap. */
export const REVEAL_TIME = Object.freeze({ char: 1.4, part: 1.2, trail: 1.6, coins: 1.0 });
/** The tease's pulse rate by grade, in pulses per second: the rarer, the faster. */
export const TEASE_RATE = Object.freeze({ common: 2, rare: 3, mythic: 4.5, incredible: 6 });

/** The grade colours, as the library's `--grade-<g>` tokens (packages/ui tokens.css). */
export const GRADE_COLOUR = Object.freeze({ common: 0xb9b3d8, rare: 0x4fa3ff, mythic: 0xb14cff, incredible: 0xffb400 });

/**
 * The grade a drop shows in: the catalogue's for an item, and for coins one
 * by the amount (a big win deserves a colour too).
 */
export function dropGrade(drop) {
  if (!drop) return 'common';
  if (drop.kind !== 'coins') return GRADE_COLOUR[drop.grade] === undefined ? 'common' : drop.grade;
  return drop.amount >= 500 ? 'mythic' : drop.amount >= 50 ? 'rare' : 'common';
}

/** The phase durations of one opening of `drop`. */
function durationsOf(drop) {
  return {
    drop: PHASE_TIME.drop, spin: PHASE_TIME.spin,
    tease: PHASE_TIME.tease + (dropGrade(drop) === 'incredible' ? BLACKOUT : 0),
    burst: PHASE_TIME.burst,
    reveal: REVEAL_TIME[drop?.kind] ?? REVEAL_TIME.part,
  };
}
const r6 = x => Math.round(x * 1e6) / 1e6;   // 0.6 + 1.0 is 1.6, not 1.5999…

/**
 * The timeline of `drops` (one drop, or a bundle's list): `phase(t)` names
 * the phase at `t` seconds with the index of the opening it belongs to, its
 * local time and progress `k` in [0, 1] (`hold` from `duration` on), and
 * `skip(t)` is where a tap at `t` jumps to. `segments` lists every phase
 * with its start; `starts` and `durations` are the first opening's, by name.
 */
export function makeTimeline(drops) {
  const list = Array.isArray(drops) ? (drops.length ? drops : [null]) : [drops];
  const segments = []; let at = 0;
  list.forEach((drop, index) => {
    const d = durationsOf(drop);
    for (const name of OPENING) { segments.push({ name, index, start: at, duration: d[name] }); at = r6(at + d[name]); }
    if (index < list.length - 1) { segments.push({ name: 'next', index, start: at, duration: PHASE_TIME.next }); at = r6(at + PHASE_TIME.next); }
  });
  const duration = at;
  segments.push({ name: 'hold', index: list.length - 1, start: duration, duration: Infinity });
  const starts = {}, durations = {};
  for (const s of segments) if (s.index === 0 && OPENING.includes(s.name)) { starts[s.name] = s.start; durations[s.name] = s.duration; }
  const indexAt = t => { let i = segments.length - 1; while (i > 0 && t < segments[i].start) i--; return i; };
  const startOf = (index, name) => segments.find(s => s.index === index && s.name === name)?.start ?? duration;
  return {
    duration, count: list.length, segments, starts, durations,
    phase(t) {
      const s = segments[indexAt(t)];
      return { name: s.name, index: s.index, t: Math.max(0, t - s.start), k: s.name === 'hold' ? 1 : clamp((t - s.start) / s.duration, 0, 1) };
    },
    skip(t) {
      const s = segments[indexAt(t)];
      if (s.name === 'drop' || s.name === 'spin' || s.name === 'tease') return startOf(s.index, 'burst');
      if (s.name === 'burst') return startOf(s.index, 'reveal');
      if ((s.name === 'reveal' || s.name === 'next') && s.index < list.length - 1) return startOf(s.index + 1, 'drop');
      return t;
    },
    /** Where opening `index` reveals its prize. */
    revealAt: index => startOf(index, 'reveal'),
  };
}

// ---------- The scene ----------
const SPARKS = 120, GRAVITY = 14, STAGE_SEED = 7;
const URN = { w: 2.4, h: 1.9, d: 1.8 };
/** How fast the podium turns the prize, in radians a second (the select stage's idle spin, a little quicker). */
const IDLE_SPIN = 0.35;

let S = null;   // everything built for the box: the stage, the urn, the sparks, the prize on the podium

/** The urn's front plate: "RF" in white on the republic's blue. Drawn once; the plate's material is cached with the stage's. */
function rfPlate(ctx, w, h) {
  ctx.fillStyle = '#1f3a93'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 10; ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 84px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('RF', w / 2, h / 2 + 4);
}
let plateTexture = null;
const plateMap = () => (plateTexture ||= canvasTexture(256, 140, rfPlate));

/** A soft round glow for the light leaking through the slot. */
function glowDisc(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

/**
 * The Politibox: a gold ballot urn with a tricolore band, a slot in its lid,
 * a knob and an RF plate, in stage materials. Body bottom at y 0. `own`
 * collects what the box must dispose (geometries, its unlit materials).
 */
function buildUrn(T, own) {
  const geo = g => (own.geometries.push(g), g), mine = m => (own.materials.push(m), m);
  const urn = new THREE.Group(); urn.name = 'urn';
  const gold = stageMat({ name: 'box-gold', color: 0xd4af37, metalness: 1, roughness: 0.28, clearcoat: 0.4, rim: false }, T);
  const trim = stageMat({ name: 'box-trim', color: 0x8a6914, metalness: 0.9, roughness: 0.42, rim: false }, T);
  const body = new THREE.Mesh(geo(new THREE.BoxGeometry(URN.w, URN.h, URN.d)), gold); body.position.y = URN.h / 2; body.castShadow = body.receiveShadow = true; urn.add(body);
  // the tricolore band round the middle: blue, white, red across the front
  [[0x2f55c7, -URN.w / 3], [0xfffaf0, 0], [0xe63946, URN.w / 3]].forEach(([c, x]) => {
    const b = new THREE.Mesh(geo(new THREE.BoxGeometry(URN.w / 3, 0.36, URN.d + 0.04)), stageMat({ color: c, roughness: 0.55, metalness: 0.1, rim: false }, T));
    b.position.set(x, URN.h * 0.42, 0); urn.add(b);
  });
  // a darker plinth, so the gold reads as a box and not a slab
  const plinth = new THREE.Mesh(geo(new THREE.BoxGeometry(URN.w + 0.16, 0.16, URN.d + 0.16)), trim); plinth.position.y = 0.08; urn.add(plinth);
  const plate = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.8, 0.44)), stageMat({ name: 'box-plate', map: plateMap(), roughness: 0.5, metalness: 0, rim: false }, T));
  plate.position.set(0, URN.h * 0.74, URN.d / 2 + 0.01); urn.add(plate);
  // the lid: its own group so it can fly off; the slot glows with the prize's grade
  const lid = new THREE.Group(); lid.name = 'lid'; lid.position.y = URN.h;
  const slab = new THREE.Mesh(geo(new THREE.BoxGeometry(URN.w + 0.12, 0.22, URN.d + 0.12)), trim); slab.position.y = 0.11; slab.castShadow = true; lid.add(slab);
  const top = new THREE.Mesh(geo(new THREE.BoxGeometry(URN.w - 0.3, 0.12, URN.d - 0.3)), gold); top.position.y = 0.28; lid.add(top);
  const slotMat = mine(new THREE.MeshBasicMaterial({ name: 'box-slot', color: 0x111111 }));
  const slot = new THREE.Mesh(geo(new THREE.BoxGeometry(1.0, 0.04, 0.16)), slotMat); slot.position.set(0, 0.35, 0.35); lid.add(slot);
  const stem = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.07, 0.09, 0.18, 10)), trim); stem.position.set(0, 0.43, -0.35); lid.add(stem);
  const knob = new THREE.Mesh(geo(new THREE.SphereGeometry(0.17, 14, 12)), gold); knob.position.set(0, 0.6, -0.35); lid.add(knob);
  urn.add(lid);
  // the light leaking through the slot: an additive glow above it, in the grade colour
  const glowMat = mine(new THREE.SpriteMaterial({ name: 'box-glow', map: (own.textures.push(canvasTexture(128, 128, glowDisc)), own.textures.at(-1)), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const glow = new THREE.Sprite(glowMat); glow.name = 'glow'; glow.position.set(0, URN.h + 0.45, 0.35); glow.scale.setScalar(2.4); urn.add(glow);
  return { urn, lid, slotMat, glowMat, glow };
}

/** The camera the box is drawn with: its own, framed by phase (frameBoxCamera); its far plane reaches past the sky dome. */
const camera = new THREE.PerspectiveCamera(42, 1, 0.3, SKY_RADIUS + 80);

function ensureBoxScene() {
  const tier = stageTier();
  if (S && S.tier === tier) return S;
  disposeBoxScene();
  const T = tier === 'low' ? 'low' : 'high';
  const own = { geometries: [], materials: [], textures: [] };
  const renderer = typeof document === 'undefined' ? null : getRenderer();
  const stage = buildStageScene(tier, { renderer, tint: GOLD, seed: STAGE_SEED });
  const { urn, lid, slotMat, glowMat, glow } = buildUrn(T, own);
  stage.turntable.add(urn);
  const prize = new THREE.Group(); prize.name = 'prize'; stage.turntable.add(prize);
  // the sparks: one instanced mesh, recoloured per opening, placed in world space over the podium
  const sparkMat = new THREE.MeshBasicMaterial({ name: 'box-spark', color: 0xffffff }); own.materials.push(sparkMat);
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), sparkMat, SPARKS); own.geometries.push(sparks.geometry);
  sparks.name = 'sparks'; sparks.frustumCulled = false; sparks.count = 0; stage.scene.add(sparks);
  S = {
    tier, T, own, stage, urn, lid, slotMat, glowMat, glow, prize, sparks, sparkMat,
    pos: new Float32Array(SPARKS * 3), vel: new Float32Array(SPARKS * 3), rot: new Float32Array(SPARKS * 3), spin: new Float32Array(SPARKS * 3), size: new Float32Array(SPARKS),
    lidVel: new THREE.Vector3(), lidSpin: new THREE.Vector3(),
    grade: 'common', gradeColour: new THREE.Color(), dark: new THREE.Color(0x111111), ledGold: new THREE.Color(GOLD),
    animate: null,   // the prize's own motion, (dt, t) => void
    rig: null, kart: null, trail: null, extra: [],   // what the prize is made of, for disposal
    clock: 0, drawn: false, drawnKey: null, compiled: false,
  };
  return S;
}

/** Forget the box scene: the stage, the urn, the sparks, every geometry, material and texture of the box's own. */
function disposeBoxScene() {
  if (!S) return;
  disposePrize();
  S.stage.dispose();
  for (const g of S.own.geometries) g.dispose();
  for (const m of S.own.materials) m.dispose();
  for (const t of S.own.textures) t.dispose();
  S.sparks.dispose();
  S = null;
}

// ---------- Prizes ----------
// Where each part category sits on a kart, so the glowing ring circles it.
const PART_SPOT = {
  wheels: [0.98, 0.42, 1.0, 0.55], spoiler: [0, 1.35, -1.55, 1.0], sticker: [0, 0.78, 1.7, 0.5], exhaust: [0, 0.45, -1.85, 0.55],
  underglow: [0, 0.12, 0.2, 1.4], mast: [0.45, 1.7, -1.0, 0.5], nose: [0, 0.5, 2.25, 0.6], skin: [0, 0.75, 0.3, 1.5],
};
// The trail prize: the kart's scale on the podium, the circle it drives (inside the podium's rim), how fast it goes round,
// and the speed its trail is told (a race speed, so the trail streams as it does on the circuit).
const TRAIL_SCALE = 0.62, TRAIL_RADIUS = 1.75, TRAIL_RATE = 1.6, TRAIL_SPEED = 20;
/** The coin fountain: how many coins at least and at most, the pile under it, and how hard they are thrown. */
const COINS = { min: 14, max: 56, pile: 6, up: [4.2, 6.5], side: 1.6, spin: 9 };

const charDef = id => CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];

/** An additive, unlit material of the box's own for one prize (its rings and halos), disposed with it. */
function additive(colour, opacity) {
  const m = new THREE.MeshBasicMaterial({ color: linear(colour), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  S.extra.push(m); return m;
}

/** The pose a rig keeps on the podium: the engine's buzz, the pilot's breath, then its own animations (the select stage's idle life). */
function idleRig(rig, dt, t) {
  const u = rig.userData;
  u.kart.position.y = Math.abs(Math.sin(t * 22)) * 0.01;
  u.pilot.position.y = MOUNT[1] + Math.sin(t * 2.2) * 0.02;
  for (const f of u.kart.userData.anim) f(dt, t, null);
  for (const f of u.pilot.userData.anim) f(dt, t);
}

/** A candidate: their kart in their default style, stage profile, their stage pilot aboard, alive as on the select stage. */
function charPrize(drop) {
  const def = charDef(drop.id);
  S.rig = buildRig(def, defaultStyle(def), S.tier, { trail: false });
  S.prize.add(S.rig);
  return (dt, t) => idleRig(S.rig, dt, t);
}

/**
 * A part: a bare kart in the built-in look, stage profile, with that option
 * fitted, and a glowing ring orbiting the part. No driver: the kart is built
 * without its pilot and steering, and the empty seat anchor stays hidden.
 */
function partPrize(drop, colour) {
  const p = parsePartKey(drop.id) ?? { category: 'wheels', value: 'gold' };
  const def = CHARACTERS[0];
  S.kart = buildKart(def, mergeStyle(builtinStyle(def), { [p.category]: p.value }), { profile: 'stage', pilot: false, steering: false, tier: S.T, tex: textureTier(S.T, S.tier === 'phone') });
  S.kart.userData.driver.visible = false;
  const [x, y, z, r] = PART_SPOT[p.category] ?? PART_SPOT.skin;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 40), additive(colour, 0.9)); ring.position.set(x, y, z); S.kart.add(ring);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 16, 12), additive(colour, 0.22)); halo.position.set(x, y, z); S.kart.add(halo);
  S.prize.add(S.kart);
  return (dt, t) => { ring.rotation.x = t * 2.1; ring.rotation.y = t * 1.3; halo.scale.setScalar(1 + 0.15 * Math.sin(t * 5)); for (const f of S.kart.userData.anim) f(dt, t, null); };
}

/**
 * A trail: a kart (the first candidate's, their pilot aboard) circling the
 * podium with the real trail (trail.js, the stage variant) streaming behind
 * it. The trail lives in the prize group, scaled like the kart, and is fed a
 * fake kart driving the circle at race speed. An unknown trail id circles bare.
 */
function trailPrize(drop) {
  const def = CHARACTERS[0];
  const holder = new THREE.Group(); S.prize.add(holder);
  S.rig = buildRig(def, builtinStyle(def), S.tier, { trail: false }); S.rig.scale.setScalar(TRAIL_SCALE); holder.add(S.rig);
  S.trail = buildTrail(drop.id, { stage: true });
  if (S.trail) { S.trail.group.scale.setScalar(TRAIL_SCALE); holder.add(S.trail.group); }
  // The fake kart the trail follows, in the trail's (scaled) space: its nose is where it is going.
  const fake = { pos: { x: 0, z: 0 }, y: 0, heading: 0, speed: TRAIL_SPEED, boost: 0 };
  let a = 0;
  return (dt, t) => {
    a += dt * TRAIL_RATE;
    // On the circle (cos a, sin a) the velocity is (-sin a, cos a): the heading whose forward (sin h, cos h) that is, is -a.
    S.rig.position.set(Math.cos(a) * TRAIL_RADIUS, 0, Math.sin(a) * TRAIL_RADIUS); S.rig.rotation.y = -a;
    fake.pos.x = S.rig.position.x / TRAIL_SCALE; fake.pos.z = S.rig.position.z / TRAIL_SCALE; fake.heading = -a;
    S.trail?.update(fake, dt);
    idleRig(S.rig, dt, t);
  };
}

/**
 * Coins: a fountain. As many coins as the win is big (COINS), one instanced
 * mesh in the stage's gold: a pile lying on the podium, and the rest thrown
 * up from its middle again and again, spinning, falling back through it.
 */
function coinsPrize(drop) {
  const n = clamp(Math.round(COINS.min + Math.log2(Math.max(2, drop.amount)) * 4.5), COINS.min, COINS.max);
  const gold = stageMat({ name: 'box-coin', color: 0xf2c14e, metalness: 1, roughness: 0.25, rim: false }, S.T);
  const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, S.T === 'low' ? 14 : 24);
  const coins = new THREE.InstancedMesh(geo, gold, n); coins.name = 'coins'; coins.frustumCulled = false; coins.castShadow = S.tier !== 'phone';
  S.prize.add(coins); S.extra.push({ dispose: () => { geo.dispose(); coins.dispose(); } });
  const dummy = new THREE.Object3D();
  const p = new Float32Array(n * 3), v = new Float32Array(n * 3), r = new Float32Array(n * 3), w = new Float32Array(n * 3);
  const throwUp = i => {
    const th = Math.random() * Math.PI * 2, side = Math.random() * COINS.side;
    p[i * 3] = (Math.random() - 0.5) * 0.3; p[i * 3 + 1] = 0.2; p[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    v[i * 3] = Math.cos(th) * side; v[i * 3 + 1] = lerp(COINS.up[0], COINS.up[1], Math.random()); v[i * 3 + 2] = Math.sin(th) * side;
    w[i * 3] = (Math.random() - 0.5) * COINS.spin; w[i * 3 + 1] = (Math.random() - 0.5) * COINS.spin; w[i * 3 + 2] = (Math.random() - 0.5) * COINS.spin;
  };
  for (let i = 0; i < n; i++) {
    if (i < COINS.pile) { const th = i * 2.4, d = 0.25 + (i % 3) * 0.3; p[i * 3] = Math.cos(th) * d; p[i * 3 + 1] = 0.05 + (i % 2) * 0.09; p[i * 3 + 2] = Math.sin(th) * d; r[i * 3 + 1] = th; }
    else { throwUp(i); p[i * 3 + 1] = -3; v[i * 3 + 1] *= Math.random(); }   // staggered: the first ones are already on their way
  }
  let a = 0;
  return dt => {
    a += dt;
    for (let i = COINS.pile; i < n; i++) {
      const j = i * 3;
      v[j + 1] -= GRAVITY * dt;
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      r[j] += w[j] * dt; r[j + 1] += w[j + 1] * dt; r[j + 2] += w[j + 2] * dt;
      if (p[j + 1] < -0.6 && v[j + 1] < 0) throwUp(i);
    }
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      dummy.position.set(p[j], p[j + 1], p[j + 2]); dummy.rotation.set(r[j], r[j + 1], r[j + 2]); dummy.updateMatrix(); coins.setMatrixAt(i, dummy.matrix);
    }
    coins.instanceMatrix.needsUpdate = true;
  };
}

/** Forget the prize on the podium: the rig or kart, the trail, the box's own one-off materials and meshes. */
function disposePrize() {
  if (!S) return;
  if (S.trail) { S.trail.group.parent?.remove(S.trail.group); S.trail.dispose(); S.trail = null; }
  if (S.rig) { disposeRig(S.rig); S.rig = null; }
  if (S.kart) { disposeKart(S.kart); S.kart = null; }
  for (const m of S.extra.splice(0)) m.dispose();
  while (S.prize.children.length) {
    const c = S.prize.children[0]; S.prize.remove(c);
    c.traverse(o => { if (o.geometry && o !== S.sparks) o.geometry.dispose(); });
  }
  S.animate = null;
}

/** Build the prize of `drop` under the podium, hidden until the reveal. */
function buildPrize(drop) {
  disposePrize();
  const colour = GRADE_COLOUR[dropGrade(drop)];
  S.animate = drop.kind === 'char' ? charPrize(drop) : drop.kind === 'trail' ? trailPrize(drop) : drop.kind === 'coins' ? coinsPrize(drop) : partPrize(drop, colour);
  S.prize.visible = false; S.prize.position.y = -2.2; S.prize.scale.setScalar(1);
}

/** Put the urn back whole on the podium for opening `drop`: lid on, slot dark, nothing in the air, the stage gold. */
function resetUrn(drop) {
  S.grade = dropGrade(drop);
  S.gradeColour.setHex(GRADE_COLOUR[S.grade]);
  S.sparkMat.color.copy(linear(GRADE_COLOUR[S.grade])).multiplyScalar(2.2);
  S.glowMat.color.copy(linear(GRADE_COLOUR[S.grade]));
  S.urn.visible = true; S.urn.position.set(0, 8, 0); S.urn.rotation.set(0, 0, 0);
  S.lid.position.set(0, URN.h, 0); S.lid.rotation.set(0, 0, 0); S.lid.visible = true;
  S.slotMat.color.copy(S.dark); S.glowMat.opacity = 0;
  S.sparks.count = 0; S.burstDone = false;
  S.stage.turntable.rotation.y = 0;
  S.stage.setTint(GOLD); S.stage.setLeds(GOLD, 1);
  S.pulse = -1; S.rattle = -1;
}

// ---------- The run ----------
let run = null;   // { drops, tl, clock, at (index of the segment entered), onPhase, cut }

/** The phase on screen: one of PHASES, or 'idle' when no opening is playing. */
export const boxPhase = () => (run && run.at >= 0 ? run.tl.segments[run.at].name : 'idle');
/** Which opening of the bundle is on screen (0 for a single box), or -1 when none plays. */
export const boxIndex = () => (run && run.at >= 0 ? run.tl.segments[run.at].index : -1);

/** The Politibox scene once one exists (the tests look at what an opening put on the podium), else null. */
export const boxScene = () => (S ? S.stage.scene : null);

/**
 * Start opening `drops` (the server's rollBox result, or a bundle's list of
 * them): build the stage if need be, the first prize, colour the lights
 * and the sparks with its grade, and play from the drop. `onPhase(name,
 * index)` hears every phase as it is entered, 'drop' of opening 0 at once.
 * `cut` forces every opening straight to its reveal (what a still stage or
 * prefers-reduced-motion does by themselves; the tests pass it).
 *
 * @param {object | object[]} drops  { kind, id?, amount?, grade?, duplicate?, refund? }, one or several
 * @param {{ onPhase?: ((name: string, index: number) => void) | null, cut?: boolean | null }} [options]
 */
export function playOpening(drops, { onPhase = null, cut = null } = {}) {
  ensureBoxScene();
  const list = Array.isArray(drops) ? drops.slice() : [drops];
  if (!list.length) list.push({ kind: 'coins', amount: 0 });
  run = { drops: list, tl: makeTimeline(list), clock: 0, at: -1, onPhase, cut: cut === null ? !moving() : !!cut };
  resetUrn(list[0]);
  buildPrize(list[0]);
  stepOpening(0);
}

/** Stop and forget the opening (the player left), and the whole box scene with it. */
export function stopOpening() { run = null; disposeBoxScene(); }

/** A tap on the stage: jump to the burst, from the burst to the reveal, from a reveal on to the next urn. */
export function skipOpening() {
  if (!run) return;
  run.clock = run.tl.skip(run.clock);
  stepOpening(0);
}

/** Launch the lid, the stage's confetti and every spark from the slot. */
function burst() {
  S.burstDone = true;
  S.lidVel.set((Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 1.5), 9.5, -2.5 - Math.random());   // up, aside and away, never over the prize
  S.lidSpin.set(4 + Math.random() * 3, (Math.random() - 0.5) * 4, 2 + Math.random() * 2);
  S.lid.position.set(0, URN.h, 0); S.lid.rotation.set(0, 0, 0);
  S.stage.burst({ share: 1, lift: 1.5 });
  const oy = PODIUM.top + URN.h + 0.3;      // the slot of the urn at rest, in world space, wherever a skip caught it
  for (let i = 0; i < SPARKS; i++) {
    const j = i * 3, th = Math.random() * Math.PI * 2, up = 0.35 + Math.random() * 0.65, sp = 5 + Math.random() * 5;
    S.pos[j] = (Math.random() - 0.5) * 0.8; S.pos[j + 1] = oy; S.pos[j + 2] = 0.2 + (Math.random() - 0.5) * 0.4;
    S.vel[j] = Math.cos(th) * sp * (1 - up * 0.5); S.vel[j + 1] = up * sp * 1.4; S.vel[j + 2] = Math.sin(th) * sp * (1 - up * 0.5);
    S.rot[j] = S.rot[j + 1] = S.rot[j + 2] = 0;
    S.spin[j] = (Math.random() - 0.5) * 14; S.spin[j + 1] = (Math.random() - 0.5) * 14; S.spin[j + 2] = (Math.random() - 0.5) * 14;
    S.size[i] = 1;
  }
  S.sparks.count = SPARKS;
  placeSparks();
}

const dummy = new THREE.Object3D();
/** Write the sparks' matrices; a spark that landed is scaled away. */
function placeSparks() {
  for (let i = 0; i < S.sparks.count; i++) {
    const j = i * 3;
    dummy.position.set(S.pos[j], S.pos[j + 1], S.pos[j + 2]); dummy.rotation.set(S.rot[j], S.rot[j + 1], S.rot[j + 2]); dummy.scale.setScalar(S.size[i]); dummy.updateMatrix();
    S.sparks.setMatrixAt(i, dummy.matrix);
  }
  S.sparks.instanceMatrix.needsUpdate = true;
}

/** Move what is in the air: the lid and the sparks (the stage moves its own confetti). */
function fly(dt) {
  if (!S.burstDone || dt <= 0) return;
  if (S.lid.visible) {
    S.lidVel.y -= GRAVITY * dt;
    S.lid.position.x += S.lidVel.x * dt; S.lid.position.y += S.lidVel.y * dt; S.lid.position.z += S.lidVel.z * dt;
    S.lid.rotation.x += S.lidSpin.x * dt; S.lid.rotation.y += S.lidSpin.y * dt; S.lid.rotation.z += S.lidSpin.z * dt;
    if (S.lid.position.y < -12) S.lid.visible = false;
  }
  if (!S.sparks.count) return;
  let alive = 0;
  for (let i = 0; i < SPARKS; i++) {
    const j = i * 3;
    if (S.size[i] <= 0) continue;
    S.vel[j + 1] -= GRAVITY * dt;
    S.pos[j] += S.vel[j] * dt; S.pos[j + 1] += S.vel[j + 1] * dt; S.pos[j + 2] += S.vel[j + 2] * dt;
    S.rot[j] += S.spin[j] * dt; S.rot[j + 1] += S.spin[j + 1] * dt; S.rot[j + 2] += S.spin[j + 2] * dt;
    S.size[i] = S.pos[j + 1] < 0 ? 0 : Math.max(0.05, S.size[i] - dt * 0.45);
    if (S.size[i] > 0) alive++;
  }
  if (!alive) S.sparks.count = 0; else placeSparks();
}

/** The tease's light: the LEDs, the slot and the glow at `p` of the grade's colour (0 dark, 1 full, more for the burst's flare). */
function teaseLight(p) {
  const c = GRADE_COLOUR[S.grade];
  S.stage.setLeds(p <= 0 ? 0x000000 : c, Math.max(0, p) * 1.8);
  S.slotMat.color.copy(S.dark).lerp(S.gradeColour, clamp(p, 0, 1));
  S.glowMat.opacity = clamp(p * 0.9, 0, 1);
  S.glow.scale.setScalar(2.4 + p * 1.2);
}

/** Pose everything for phase `ph` (from timeline.phase) after `dt` seconds; `live` is false on a stage that stands still (final poses only). */
function pose(ph, dt, live) {
  const u = S.urn, tt = S.stage.turntable, k = live ? ph.k : 1;
  if (ph.name === 'drop') { u.position.y = lerp(8, 0, easeOutBounce(k)); u.rotation.set(0, 0, 0); tt.rotation.y = 0; }
  else if (ph.name === 'spin') { u.position.set(0, 0, 0); tt.rotation.y = Math.PI * 4 * k * k; }     // two turns, ending face on
  else if (ph.name === 'tease') {
    tt.rotation.y = 0;
    const dark = S.grade === 'incredible' && ph.t >= PHASE_TIME.tease;   // the blackout beat
    if (dark) { u.position.set(0, 0, 0); u.rotation.set(0, 0, 0); S.lid.position.y = URN.h; S.lid.rotation.z = 0; teaseLight(0); S.stage.setTint(0x000000, true); return; }
    // four rattles over the tease, each one stronger; the light pulses at the grade's rate, brighter as it goes
    const kk = clamp(ph.t / PHASE_TIME.tease, 0, 1);
    const r = Math.min(3, Math.floor(kk * 4)), f = kk * 4 - r, env = Math.sin(Math.PI * f), amp = (0.25 + 0.75 * (r + 1) / 4) * env;
    u.position.set(Math.sin(ph.t * 61) * 0.06 * amp, Math.abs(Math.sin(ph.t * 47)) * 0.08 * amp, 0);
    u.rotation.set(Math.sin(ph.t * 53) * 0.05 * amp, 0, Math.sin(ph.t * 67) * 0.1 * amp);
    S.lid.position.y = URN.h + 0.1 * amp; S.lid.rotation.z = Math.sin(ph.t * 71) * 0.06 * amp;
    const rate = TEASE_RATE[S.grade], pulse = 0.5 + 0.5 * Math.sin(ph.t * rate * Math.PI * 2 - Math.PI / 2);
    teaseLight((0.25 + 0.75 * kk) * (0.35 + 0.65 * pulse));
    if (live) {
      const n = Math.floor(ph.t * rate); if (n !== S.pulse) { S.pulse = n; sfx('box_tease'); }
      if (r !== S.rattle) { S.rattle = r; sfx('box_rattle'); }
    }
  } else if (ph.name === 'burst') {
    u.position.set(0, 0, 0); u.rotation.set(0, 0, 0); tt.rotation.y = 0;
    teaseLight(2.2 * (1 - k) + 1);
  } else if (ph.name === 'next') {
    // the prize sinks away and shrinks; the lights go back to gold for the next urn
    const sink = easeInOutCubic(k);
    S.prize.visible = sink < 1; S.prize.position.y = lerp(0, -2.5, sink); S.prize.scale.setScalar(Math.max(0.001, 1 - sink));
    u.visible = false;
    teaseLight(1 - sink);
    if (live) tt.rotation.y += IDLE_SPIN * dt;
  } else {
    // reveal and hold: the urn sinks away, the prize rises, the podium turns it
    const sink = easeInOutCubic(Math.min(1, k * 1.6)), rise = easeOutBack(clamp((k - 0.25) / 0.7, 0, 1));
    u.position.set(0, -3.2 * sink, 0); u.rotation.set(0, 0, 0); u.visible = sink < 1;
    teaseLight(1.2 * (1 - sink) + 0.6);
    if (k > 0.6) S.lid.visible = false;
    S.prize.visible = true; S.prize.position.y = lerp(-2.2, 0, rise); S.prize.scale.setScalar(lerp(0.6, 1, rise));
    if (live) tt.rotation.y += IDLE_SPIN * dt;
    S.animate?.(dt, S.clock);
  }
}

/** The sound a phase opens with (the tease and the rattles play theirs from the pose). */
function soundOf(name, drop) {
  if (name === 'drop') return 'box_drop';
  if (name === 'spin') return 'box_rattle';
  if (name === 'burst') return 'box_burst';
  if (name === 'reveal') return 'box_reveal_' + dropGrade(drop);
  return null;
}

/**
 * Where the camera stands for phase `ph`, for a W x H window: back for the
 * drop, dollied in for the tease, framing the prize high after (the result
 * card covers the bottom of the screen). Returns the box's camera, posed.
 */
export function frameBoxCamera(ph, W, H) {
  camera.aspect = W / H; camera.fov = 42 * Math.max(1, 0.8 / camera.aspect);
  const portrait = camera.aspect < 1;
  let z = 15.5, y = 5.6, look = 2.3;
  if (ph.name === 'spin') { const e = easeInOutCubic(ph.k); z = lerp(15.5, 12, e); y = lerp(5.6, 4.6, e); look = lerp(2.3, 2.0, e); }
  else if (ph.name === 'tease' || ph.name === 'burst') { z = 12; y = 4.6; look = 2.0; }
  else if (ph.name === 'reveal' || ph.name === 'hold') {
    const e = easeInOutCubic(ph.name === 'hold' ? 1 : ph.k);
    z = lerp(12, portrait ? 16 : 15, e); y = lerp(4.6, 6.4, e); look = lerp(2.0, portrait ? -1.6 : -0.6, e);
  } else if (ph.name === 'next') {
    const e = easeInOutCubic(ph.k);
    z = lerp(portrait ? 16 : 15, 15.5, e); y = lerp(6.4, 5.6, e); look = lerp(portrait ? -1.6 : -0.6, 2.3, e);
  }
  camera.position.set(0, y, z); camera.lookAt(0, look, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Advance the opening by `dt` seconds without drawing: enter (and report)
 * every phase the clock has reached, in order, then pose the scene. What
 * renderLootbox() does before it draws; the tests call it directly.
 */
export function stepOpening(dt) {
  if (!run) return null;
  run.clock += dt; S.clock += dt;
  // a stage that does not move cuts every opening to its reveal
  if (run.cut) { const p = run.tl.phase(run.clock); if (OPENING.includes(p.name) && p.name !== 'reveal') run.clock = run.tl.revealAt(p.index); }
  const ph = run.tl.phase(run.clock);
  const target = run.tl.segments.findIndex(s => s.name === ph.name && s.index === ph.index);
  let last = null;
  while (run.at < target) {
    run.at++;
    const seg = run.tl.segments[run.at], drop = run.drops[seg.index];
    if (seg.name === 'drop' && seg.index > 0) { resetUrn(drop); buildPrize(drop); }
    if (seg.name === 'tease') S.stage.setTint(GRADE_COLOUR[S.grade]);
    if (seg.name === 'burst' || (seg.name === 'reveal' && !S.burstDone)) { burst(); S.stage.setTint(GRADE_COLOUR[S.grade], true); }
    last = seg;
    run.onPhase?.(seg.name, seg.index);
  }
  if (last) {   // one sound a step: the phase that is on screen, not every one a skip jumped over
    const drop = run.drops[last.index], name = soundOf(last.name, drop);
    if (name) sfx(name);
    if (last.name === 'reveal' && drop.kind === 'coins') sfx('coin_rain');
  }
  fly(dt);
  pose(ph, dt, !run.cut);
  S.stage.update(dt, S.clock);   // the tint's easing, the drifting confetti (the stage clamps the step)
  return ph;
}

/** How many times a second the opening's pose is advanced on a still stage between its draws: none; it draws only on a change. */
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Advance the opening and draw it on the shared canvas, in the stage's
 * look. A stage that stands still (the governor) draws only when its
 * picture changes: a phase entered, or the window resized.
 */
export function renderLootbox(dt) {
  const r = getRenderer(), t0 = now();
  govern(t0, r);
  ensureBoxScene();
  if (run && run.cut !== !moving()) run.cut = !moving();   // the governor's verdict may land after the opening started
  const ph = stepOpening(dt) ?? { name: 'hold', t: 0, k: 1, index: 0 };
  const W = window.innerWidth, H = window.innerHeight;
  const key = [ph.name, ph.index, W, H].join();
  if (!moving() && S.drawn && S.drawnKey === key) return;
  frameBoxCamera(ph, W, H);
  const programs = r.info.programs.length;
  r.setScissorTest(false); r.setViewport(0, 0, W, H);
  withLook(r, STAGE_LOOK, () => {
    if (!S.compiled) { r.compile(S.stage.scene, camera); S.compiled = true; }
    r.render(S.stage.scene, camera);
  });
  drewFrame(r, programs);
  S.drawn = true; S.drawnKey = key;
}

/** What the box scene costs, counted headlessly: the stage's own count plus what the box adds (visible meshes and triangles). */
export function boxInfo() {
  if (!S) return null;
  const stage = S.stage.info();
  return { tier: S.tier, stage: { draws: stage.draws, triangles: stage.triangles }, meshes: countMeshes(S.stage.scene, true), triangles: countTriangles(S.stage.scene, true) };
}
