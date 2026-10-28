// The character showcase: the 3D select stage and the roster portraits.
//
// The facade over the stage (PLAN 5, DEC-043..045): the select screen and the
// Garage show the chosen candidate's kart, pilot seated, on the hemicycle's
// podium (hemicycle.js), lit in the stage's own look (stagelook.js), and the
// roster tiles carry a portrait of each candidate. The UI talks to it through
// the same calls as the old turntable (setPreview, hasPreview, showsTurntable,
// setPreviewFrame, renderPreview, makeThumbs, frameKart), plus stageDrag()
// for the band's pointer handlers (stageinput.js), stageInfo() for the
// test hook, warmStage() for the title screen and a launch() stub that stage
// 9 fills.
//
// One stage scene per detail tier ('high', 'phone' -- "détaillés" on a
// coarse pointer: half-size fabrics, a 1024 shadow -- and 'low'), built on
// first use and kept resident; changing the tier disposes it and builds the
// next. Its camera is its own (the race's shared camera is never touched),
// and every stage pass runs inside withLook(), so neither the race nor the
// Politibox ever sees the stage's tone mapping or light units.
//
// The rig on the podium is one Group: the kart's stage profile, built
// without its driver or steering, and stage 5's pilot seated in it as the
// driver (kart.js seatPilot: one steering wheel, the pilot's, with the hands
// on it; scaled once, inside the pilot). Only the chosen candidate and,
// for a moment, the one leaving exist (PLAN 1.2 A.3).
//
// Framing (DEC-042). The UI registers a frame (setPreviewFrame): the rect of
// the visible screen's ShowcaseStage band, above the candidate's name. The
// podium's foot and a reference rig as tall as the tractor's pilot are fitted
// into it (frameKart) through an off-centre frustum over the whole canvas, so
// the hemicycle fills the window behind the UI and the podium lands in the
// band, the same size for every candidate; a taller one (thierry's
// weathervane) shrinks the fit for themselves alone, so no head ever reaches
// the text. A band taller than the window (the Garage's column) keeps the
// podium in its visible part; one that scrolls off the top takes it along.
//
// Interaction. The band is the drag surface (stageinput.js): the podium turns
// with the drag, keeps its momentum after it (decaying to 4 % a second, the
// template's), and starts a slow spin of its own once left alone for 2.5 s.
// A mouse moves the camera a little (parallax); a finger never does.
//
// Swaps (the template's): the outgoing rig spins out and shrinks in 0.2 s,
// the incoming one pops in with an ease-back and a twist, the podium gets a
// spin impulse, the tint eases, and on 'high' a little confetti puffs up.
// Under prefers-reduced-motion it cuts, still. The light rig is fixed,
// every stage material comes from one cache and every program the stage
// has used stays pinned while it lives, so a swap never compiles a program
// once the portraits have shown every candidate, nor a Garage edit once the
// warm-up has compiled the parts (stageInfo reports renderer.info.programs).
//
// Garage edits and swaps are applied on the stage's next frame (setPreview):
// edits between two frames cost one rebuild, and an edit rebuilds the kart
// alone, the pilot, its outline and the trail moved over.
//
// The governor (below): a GPU that cannot draw a stage frame in a tenth of a
// second (measured; a software rasteriser is assumed so until measured)
// gets a still stage that draws only when its picture changes, after the
// UI's answer to the press, as under prefers-reduced-motion.
//
// Portraits (DEC-045). makeThumbs() returns at once: each candidate's last
// portrait, or a placeholder (their kart colour and initials). The real
// portraits are rendered one per frame in the quiet moments (none under the
// player's hand, nor in a frame the stage draws), head and shoulders (the template's
// fov 24 camera from the front right, in the candidate's tint), into a
// render target, and handed to the UI every few. They are keyed by what they
// show (name, colours, kart, tier), so an admin rename or recolour renders
// just that candidate again; nothing is kept across sessions (Q10).
//
// Time (PLAN 1.2 A.1): the stage's own clock clamps its step to
// [0, MAX_DT], whatever the caller passes.
import * as THREE from 'three';

import { CHARACTERS } from './data.js';
import { textureTier } from './fabric.js';
import { myStyle } from './garage.js';
import { buildStageScene, MAX_DT, PODIUM, SKY_RADIUS, STAGE_SCALE } from './hemicycle.js';
import { buildKart, seatPilot } from './kart.js';
import { defaultStyle, EXHAUSTS, MASTS, NOSES, SKINS, SPOILERS, STICKERS, TRAILS, UNDERGLOWS, WHEELS } from './kartstyle.js';
import { LOOK3D } from './looks.js';
import { getState, onTransition } from './machine.js';
import { bodyOf, buildPilot, disposePilot, MOUNT } from './pilot.js';
import { clearCanvas, getRenderer } from './render.js';
import { stageDrag, stageInput, takeDrag, watchMouse } from './stageinput.js';
import { RIM, STAGE_LOOK, tintOf, withLook } from './stagelook.js';
import { G, getPoly } from './state.js';
import { buildTrail } from './trail.js';

export { stageDrag };

// the player's presses and the mouse are watched from the start, so the first "Jouer" already counts as one
watchMouse();

// ---------- Environment probes (browser only; false headless) ----------

const media = q => typeof matchMedia === 'function' && matchMedia(q).matches;
/** A phone or a tablet: the 'phone' texture tier on "détaillés", and no parallax. */
const coarse = () => media('(hover: none) and (pointer: coarse)');
/** The player asked for less motion: swaps cut, no confetti, no idle spin, no parallax. */
const calm = () => media('(prefers-reduced-motion: reduce)');

/** The stage tier for the game's detail level on this device: 'high' | 'phone' | 'low'. */
export const stageTier = () => textureTier(getPoly(), coarse());
/** The geometry tier the kart and the pilot are built at ("légers" or not). */
const buildTier = tier => (tier === 'low' ? 'low' : 'high');

/** Whether menu `state` shows the stage: the roster and the Garage do; the other menus show the plain background. */
export const showsTurntable = state => state === 'select' || state === 'garage';

// ---------- The camera and the framing ----------

/**
 * Where the stage is watched from: the template's camera (aim 1.15 up, a
 * direction 0.24 up for 1 back) in game units, at the distance a fit into
 * the 1440x900 band found (stage 4). It stands still; the framing only
 * changes its projection, so the hemicycle keeps its perspective on every
 * layout.
 */
export const AIM = Object.freeze([0, 1.15 * STAGE_SCALE, 0]);
const DIR = new THREE.Vector3(0, 0.24, 1).normalize();
export const DISTANCE = 15.7;
const EYE = new THREE.Vector3(...AIM).addScaledVector(DIR, DISTANCE);
/** The parallax, the template's ±0.9 across and ±0.5 down, in game units. */
const PARALLAX = [0.9 * STAGE_SCALE, 0.5 * STAGE_SCALE];
/**
 * The reference rig every candidate is framed for, in kart coordinates
 * above the podium's top: a head 1 across as high as the tractor pilot's
 * (3.75; the standard kart's are about 3.45). Any rig that reaches higher or
 * wider is fitted too (its own profile), at a smaller scale for itself.
 */
export const REF_TOP = 3.75, REF_HEAD = 1;
/** The share of the frame left clear on each side. */
const MARGIN = 0.04;
/** How far down a frame taller than the podium puts it: a little below the middle, nearer the name it presents. */
const SINK = 0.6;
/** Below this many CSS pixels a frame has no room for the podium (the backdrop is drawn alone). */
const MIN_W = 40, MIN_H = 60;

/** The podium's outline as rings [radius, height], world units: its foot at the floor and at its top edge. */
const PODIUM_RINGS = [[PODIUM.foot, 0], [PODIUM.foot, PODIUM.top]];
const REF_RINGS = [...PODIUM_RINGS, [REF_HEAD, PODIUM.top + REF_TOP]];

/** A camera standing where the stage is watched from (no parallax), for frameKart's default and the tests. */
export function stillCamera(cam = new THREE.PerspectiveCamera(30, 1, 0.3, SKY_RADIUS + 80)) {
  cam.position.copy(EYE); cam.lookAt(AIM[0], AIM[1], AIM[2]); cam.updateMatrixWorld(true);
  return cam;
}

const RING_STEPS = 48;
/**
 * The bounds of `rings` as `cam` sees them, in tangent space (a point's x
 * and y over its depth): every ring turned all the way round, so the box
 * holds whichever way the podium faces.
 */
function tangentBox(cam, rings) {
  const p = new THREE.Vector3(), inv = cam.matrixWorldInverse;
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (let i = 0; i < RING_STEPS; i++) {
    const a = i / RING_STEPS * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (const [r, y] of rings) {
      p.set(c * r, y, s * r).applyMatrix4(inv);
      const tx = p.x / -p.z, ty = p.y / -p.z;
      if (tx < box.x0) box.x0 = tx; if (tx > box.x1) box.x1 = tx; if (ty < box.y0) box.y0 = ty; if (ty > box.y1) box.y1 = ty;
    }
  }
  return box;
}

/**
 * Fit the stage into `frame` (CSS pixels, top left origin) on a W x H
 * canvas, seen from `camera` (default: the still camera). The reference box
 * (the podium and REF_TOP's head) takes the frame's width or the height of
 * the part a window can show, whichever binds, less MARGIN on each side;
 * `profile` (rings [radius, height] above the podium top: a rig's actual
 * outline, rigProfile) is fitted too, by shrinking only if it would not fit
 * at that scale. Across, the box is centred; down, the reference sits a
 * little below the middle (SINK) of the frame's visible part with the rig's
 * box on the same footing, but never leaves the frame, so it scrolls off
 * with a frame that does.
 *
 * Returns the box in pixels (x, y, w, h: everything drawn, podium and rig)
 * and the camera's frustum over the whole canvas in tangent space (left,
 * right, top, bottom; times the near distance, makePerspective's planes).
 */
export function frameKart(frame, W, H, { camera = null, profile = null } = {}) {
  const cam = camera || stillCamera();
  const ref = tangentBox(cam, REF_RINGS);
  const all = profile ? union(ref, tangentBox(cam, [...PODIUM_RINGS, ...profile.map(([r, y]) => [r, y + PODIUM.top])])) : ref;
  const fh = Math.min(frame.h, H), k = 1 - 2 * MARGIN;
  const s = Math.max((ref.x1 - ref.x0) / (frame.w * k), (ref.y1 - ref.y0) / (fh * k), (all.x1 - all.x0) / (frame.w * k), (all.y1 - all.y0) / (fh * k));   // tangent units per pixel
  const w = (all.x1 - all.x0) / s, h = (all.y1 - all.y0) / s, x = frame.x + (frame.w - w) / 2;
  const top0 = Math.max(frame.y, 0), seen = Math.min(frame.y + frame.h, H) - top0;
  const refH = (ref.y1 - ref.y0) / s, refTop = top0 + (seen - refH) * SINK;
  const y = Math.min(Math.max(refTop - (all.y1 - ref.y1) / s, frame.y), frame.y + frame.h - h);
  const left = all.x0 - x * s, top = all.y1 + y * s;
  return { x, y, w, h, left, right: left + W * s, top, bottom: top - H * s };
}

const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) });

/**
 * Give `cam` (already placed) the frustum that draws the stage into `frame`
 * on a W x H canvas (frameKart). Returns frameKart's box.
 */
export function aimStage(cam, frame, W, H, profile = null) {
  cam.updateMatrixWorld(true);
  const k = frameKart(frame, W, H, { camera: cam, profile }), n = cam.near;
  cam.projectionMatrix.makePerspective(k.left * n, k.right * n, k.top * n, k.bottom * n, n, cam.far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  return k;
}

// ---------- The rig: kart, pilot, trail ----------

/** The outline's height step, for rigProfile. */
const BIN = 0.25;

/**
 * A rig's outline for the framing: for each BIN-high slice of it, the
 * farthest any visible vertex reaches from the turning axis, as rings
 * [radius, height] in kart coordinates (the slice's top). Measured once per
 * build from the real vertices, so a quiff, a weathervane or a mast is
 * framed as it is.
 */
export function rigProfile(rig) {
  const o = outline(rig, rig);
  return rings(o.bins, o.top);
}

/**
 * The outline of `root`'s visible vertices in `rig`'s coordinates (the
 * farthest reach per BIN slice, and the top), leaving out `skip`'s subtree:
 * rigProfile's walk, by part, so a kept pilot's share is measured once.
 */
function outline(rig, root, skip = null, into = { bins: [], top: 0 }) {
  rig.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(rig.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  const { bins } = into;
  const walk = o => {
    if (o === skip || !o.visible || o.userData.noFrame) return;
    if (o.isMesh && o.geometry && o.geometry.attributes.position) {
      m.multiplyMatrices(inv, o.matrixWorld);
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        const r = Math.hypot(v.x, v.z), b = Math.max(0, Math.floor(v.y / BIN));
        if (!(bins[b] >= r)) bins[b] = r;
        if (v.y > into.top) into.top = v.y;
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return into;
}

/** Outline bins to rings [radius, height] (each slice's top, capped at the outline's top). */
function rings(bins, top) {
  const out = [];
  bins.forEach((r, b) => { if (r !== undefined) out.push([r, Math.min((b + 1) * BIN, top)]); });
  return out;
}

/**
 * Each stage pilot's own outline, measured when first seated: a Garage edit
 * keeps the pilot (the same candidate, the same body, so the same seat), and
 * only the new kart's vertices are walked.
 */
const PILOT_OUTLINES = new WeakMap();

/** What a candidate's pilot is built from: rebuilt when any of it changes (an admin edit, the tier). */
const pilotKey = (def, tier) => JSON.stringify([def.id, def.look, def.kart, tier]);
/** What their kart is built from: the style, and the name and livery the plate and the decals show. */
const kartKey = (def, style, tier) => JSON.stringify([def.id, def.name, def.livery || null, style, tier]);

/**
 * One candidate's rig for the stage: their kart in `style`, stage profile,
 * built without its driver and steering, and their stage pilot seated in it
 * as the driver (or `pilot`, an existing one, moved over). `trail`: true for
 * the style's trail, false for none, or a rig's trail (userData.trail) to
 * move over as it is. `tier` is the stage tier ('high' | 'phone' | 'low').
 * userData: { id, kart, pilot, profile, pilotKey, kartKey, trail,
 * trailKind, ms } (ms: what the build took, by part).
 */
export function buildRig(def, style, tier = 'high', { pilot = null, trail = true } = {}) {
  const t0 = now(), t = buildTier(tier), tex = textureTier(t, tier === 'phone');
  const kart = buildKart(def, style, { profile: 'stage', pilot: false, steering: false, tier: t, tex });
  const t1 = now(), p = pilot || buildPilot(def, 'stage', { tier: t, texTier: tex });
  const t2 = now();
  seatPilot(kart, p);
  // the phone caps (PLAN 4.2: 80k triangles a frame on "détaillés" with a coarse pointer): the pilot casts no
  // shadow there, which takes it out of the shadow pass, the frame's second copy of every caster
  if (tier === 'phone') p.traverse(o => { if (o.isMesh) o.castShadow = false; });
  const rig = new THREE.Group(); rig.name = 'rig:' + def.id; rig.add(kart);
  rig.userData = { id: def.id, kart, pilot: p, profile: null, pilotKey: pilotKey(def, tier), kartKey: kartKey(def, style, tier), trail: null, trailKind: style.trail, age: 0, out: false, ms: null };
  // the outline: the pilot's own share once, then the kart's around it
  if (!PILOT_OUTLINES.has(p)) PILOT_OUTLINES.set(p, outline(rig, p));
  const po = PILOT_OUTLINES.get(p), o = outline(rig, rig, p, { bins: po.bins.slice(), top: po.top });
  rig.userData.profile = rings(o.bins, o.top);
  const t3 = now();
  if (trail && typeof trail === 'object') { rig.add(trail.trail.group); rig.userData.trail = trail; }
  else if (trail) attachTrail(rig, style.trail);
  rig.userData.ms = { kart: Math.round(t1 - t0), pilot: Math.round(t2 - t1), outline: Math.round(t3 - t2), trail: Math.round(now() - t3) };
  return rig;
}

/**
 * The style's trail on the podium (the stage variant, trail.js), streaming
 * back from the kart as if it drove (A-032): it starts as if the kart had
 * been driving for a while (TRAIL_PREROLL), so a trail picked in the Garage
 * shows its full length on the very next frame.
 */
function attachTrail(rig, kind) {
  const t = buildTrail(kind, { stage: true });
  if (!t) return;
  t.group.visible = false;
  rig.add(t.group);
  t.group.userData.noFrame = true;
  const tr = rig.userData.trail = { trail: t, run: 0, k: { pos: { x: 0, z: 0 }, y: 0, heading: 0, speed: TRAIL_GATE } };
  for (let s = 0; s < TRAIL_PREROLL; s += MAX_DT) runTrail(tr, MAX_DT);
}
/** The speed the stage trail is told the kart drives at (above trail.js MIN_SPEED, so it spawns), and how fast it streams back off the kart: slow enough to stay over the podium. */
const TRAIL_GATE = 10, TRAIL_RUN = 2.4;
/** Seconds of driving a new stage trail starts with. */
const TRAIL_PREROLL = 1.5;
/** Stream the stage trail back by dt: the kart "drives" forward and the trail's group goes back by as much. */
function runTrail(tr, dt) { tr.run += TRAIL_RUN * dt; tr.k.pos.z = tr.run; tr.trail.group.position.z = -tr.run; tr.trail.update(tr.k, dt); }

/** Free a kart's own geometries and materials (the shared stage materials and textures stay cached). */
function disposeKart(kart) {
  kart.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.userData && o.material.userData.own) o.material.dispose(); } });
  if (kart.parent) kart.parent.remove(kart);
}

/** Free a whole rig: pilot, kart, trail. */
export function disposeRig(rig) {
  const u = rig.userData;
  if (u.pilot) disposePilot(u.pilot);
  if (u.kart) disposeKart(u.kart);
  if (u.trail) u.trail.trail.dispose();
  if (rig.parent) rig.parent.remove(rig);
}

// ---------- The stage ----------

/**
 * Everything the facade holds: the stage (buildStageScene's object), its
 * tier, its camera, the rig on show and the ones leaving, the podium's yaw
 * and spin, the stage clock and the last frame's measures.
 */
const ST = {
  stage: null, tier: null, camera: null, rig: null, outgoing: [], tint: null, want: null, uiFirst: false, job: null, prime: null,
  yaw: 0.35, vel: 0, idle: 0, touched: -1, clock: 0, px: 0, py: 0,
  drawn: false, view: null, drawnYaw: null, info: { calls: 0, triangles: 0 }, box: null, frame: null, warm: null, ms: null, msSet: null,
};

/** Build the stage for the current tier, disposing the one before if the tier changed. */
function ensureStage() {
  const tier = stageTier();
  if (ST.stage && ST.tier === tier) return ST.stage;
  const renderer = getRenderer();
  const keepId = ST.rig ? ST.rig.userData.id : null;
  teardown();
  ST.tier = tier;
  ST.tint = null;
  ST.stage = buildStageScene(tier, { renderer });
  ST.camera = stillCamera(new THREE.PerspectiveCamera(30, 1, 0.3, SKY_RADIUS + 80));
  G.previewScene = ST.stage.scene;
  ST.job = null; needs(ST.stage.scene);   // every program its first frame needs, compiled ahead (compileSome)
  if (keepId) { const i = CHARACTERS.findIndex(c => c.id === keepId); if (i >= 0) showRig(i, { animate: false }); }
  planParts();
  replanPortraits();
  return ST.stage;
}

/** Dispose the stage and its rigs (a tier change), and let go of its programs. */
function teardown() {
  if (!ST.stage) return;
  for (const r of ST.outgoing) disposeRig(r);
  ST.outgoing = [];
  if (ST.rig) disposeRig(ST.rig);
  ST.rig = null; G.previewKart = null;
  dropBackground();
  ST.stage.dispose();
  unpinPrograms(getRenderer());
  ST.stage = null; G.previewScene = null; ST.drawn = false; ST.warm = null; ST.job = null; ST.prime = null; PT.primed = null;
}

/** Whether the stage exists yet, so that a roster or style change knows to rebuild what it shows. */
export const hasPreview = () => !!ST.stage;

/**
 * Put candidate `i` on the podium, their kart as the player styled it.
 * A different candidate swaps in (animated); the same one rebuilds only
 * what changed: the kart alone after a Garage edit, the pilot and the trail
 * kept (the pilot is rebuilt only when their look changed, so `keepPilot`
 * is what happens anyway; it is accepted for callers that say so), or
 * nothing at all.
 *
 * The work is done on the stage's next frame, not in the caller's event
 * (the stage itself is built then too, the first time): several edits
 * between two frames (a reset, a key held down) cost one rebuild, the last
 * one's, and the press is answered on screen first.
 */
export function setPreview(i, { keepPilot = true } = {}) {   // keepPilot: what happens anyway (above)
  void keepPilot;
  ST.want = i; ST.uiFirst = true;
}

/** Do what setPreview asked for, if anything is waiting; measured for stageInfo. */
function applyWant() {
  if (ST.want === null) return;
  const i = ST.want, t0 = now();
  ST.want = null;
  const before = ST.rig;
  showRig(i, { animate: true });
  ST.msSet = { rig: Math.round(now() - t0), ...(ST.rig !== before && ST.rig.userData.ms) };
}

function showRig(i, { animate = true } = {}) {
  const st = ST.stage, def = CHARACTERS[i] || CHARACTERS[0], style = myStyle(def), cur = ST.rig;
  const pk = pilotKey(def, ST.tier), kk = kartKey(def, style, ST.tier);
  const tint = tintOf(def, LOOK3D[def.id] ? LOOK3D[def.id].tint : null);
  if (cur && cur.userData.id === def.id) {
    const u = cur.userData;
    if (u.pilotKey === pk && u.kartKey === kk) return;
    // the same candidate: the kart rebuilt in place, no swap; the pilot and a trail of the same kind move over
    const keep = u.pilotKey === pk ? u.pilot : null;
    const trail = u.trail && u.trailKind === style.trail ? u.trail : null;
    if (keep) { keep.parent.remove(keep); u.pilot = null; }
    if (trail) { trail.trail.group.parent.remove(trail.trail.group); u.trail = null; }
    const rig = buildRig(def, style, ST.tier, { pilot: keep, trail: trail || true });
    rig.rotation.copy(cur.rotation); rig.scale.copy(cur.scale); rig.userData.age = cur.userData.age;
    disposeRig(cur);
    place(rig);
    st.setTint(tint, true); ST.tint = tint;
    ST.drawn = false;
    return;
  }
  const rig = buildRig(def, style, ST.tier);
  const anim = animate && moving();
  if (cur) {
    if (anim) { cur.userData.out = true; cur.userData.age = 0; ST.outgoing.push(cur); }
    else disposeRig(cur);
  }
  rig.userData.age = anim ? 0 : 1;
  place(rig);
  if (cur && anim) {
    ST.vel += 2.2;
    if (ST.tier === 'high') st.burst({ share: 0.12, lift: 0.6 });   // a short puff (PLAN 4.3: none on "légers")
  }
  st.setTint(tint, !ST.tint || !anim); ST.tint = tint;
  ST.drawn = false;
}

function place(rig) {
  ST.rig = rig; G.previewKart = rig.userData.kart;
  if (rig.userData.age < 1) rig.scale.setScalar(0.001);
  ST.stage.turntable.add(rig);
  needs(rig);
}

/**
 * The template's ease-back, softened: it overshoots by about 4 % (the
 * template's 1.9 overshoots by 12 %, which would carry a head out of the
 * band, over the heading, for a few frames) and settles at 1.
 */
const easeBack = t => { const c = 1; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** Advance the podium, the rigs and the stage by dt (already clamped). */
function step(dt) {
  const st = ST.stage, live = moving();
  ST.clock += dt; const t = ST.clock;
  // the podium: dragged, then coasting, then spinning by itself once left alone (when the stage moves on its own)
  const dx = takeDrag();
  if (stageInput.touched !== ST.touched) { ST.touched = stageInput.touched; ST.idle = 0; }
  else ST.idle += dt;
  ST.yaw += dx * 0.01;   // every pixel dragged, the last ones before the release included
  if (stageInput.dragging) {
    if (dt > 0) ST.vel = ST.vel * 0.5 + (dx * 0.01 / dt) * 0.5;
  } else if (!live) ST.vel = 0;
  else {
    ST.yaw += ST.vel * dt; ST.vel *= Math.pow(0.04, dt);
    if (ST.idle > 2.5) ST.yaw += 0.22 * dt;
  }
  st.turntable.rotation.y = ST.yaw;
  // the rigs: the one leaving spins out, the one arriving pops in
  for (const r of [...ST.outgoing]) {
    r.userData.age += dt;
    const k = 1 - r.userData.age * 5;
    if (k <= 0) { ST.outgoing.splice(ST.outgoing.indexOf(r), 1); disposeRig(r); continue; }
    r.scale.setScalar(k); r.rotation.y += dt * 8;
  }
  const rig = ST.rig;
  if (rig) {
    const u = rig.userData;
    if (u.age < 1) {
      u.age = Math.min(1, u.age + dt * 1.9);
      rig.scale.setScalar(Math.max(0.001, easeBack(u.age))); rig.rotation.y = -1.2 * Math.pow(1 - u.age, 3);
    } else { rig.scale.setScalar(1); rig.rotation.y = 0; }
    // the idle life: the engine's buzz, the pilot's breath, then their own animations
    u.kart.position.y = Math.abs(Math.sin(t * 22)) * 0.01;
    u.pilot.position.y = MOUNT[1] + Math.sin(t * 2.2) * 0.02;
    for (const f of u.kart.userData.anim) f(dt, t);
    for (const f of u.pilot.userData.anim) f(dt, t);
    // the Garage shows the trail, as if the kart drove (A-032)
    if (u.trail) {
      const on = getState() === 'garage';
      u.trail.trail.group.visible = on;
      if (on) runTrail(u.trail, dt);
    }
  }
  st.update(dt, t);
}

/** Stand the camera, with the mouse's parallax (eased; none on a phone, for a player who asked for less motion, or on a still stage). */
function standCamera(cam) {
  const off = coarse() || !moving();
  const tx = off ? 0 : stageInput.mx, ty = off ? 0 : stageInput.my;
  if (GOV.still) { ST.px = tx; ST.py = ty; }   // a still stage draws too seldom to ease
  else { ST.px += (tx - ST.px) * 0.08; ST.py += (ty - ST.py) * 0.08; }
  cam.position.copy(EYE); cam.position.x += ST.px * PARALLAX[0]; cam.position.y -= ST.py * PARALLAX[1];
  cam.lookAt(AIM[0], AIM[1], AIM[2]); cam.updateMatrixWorld(true);
}

let framer = null;
/**
 * Register the function that says where the stage goes:
 * `() => ({ x, y, w, h })` in CSS pixels from the top left of the window
 * (the ShowcaseStage band's rect), or null when there is no room (the
 * backdrop is then drawn alone). Pass null to unregister; with no frame
 * function at all the podium is fitted to the window.
 */
export function setPreviewFrame(fn) { framer = typeof fn === 'function' ? fn : null; }

/**
 * Advance the stage and draw it, the podium in the UI's frame: every frame
 * while the GPU keeps up; on a still stage (the governor, below) only when
 * the picture must change, and a frame after the press that changed it.
 */
export function renderPreview(dt) {
  dt = dt > 0 ? Math.min(dt, MAX_DT) : 0;   // the stage's own clamp (A.1)
  const t0 = now(), r = getRenderer();
  govern(t0, r);
  // a still stage answers a press on screen first: this frame paints the UI's change alone, the stage follows
  if (GOV.still && ST.uiFirst && !stageInput.dragging) { ST.uiFirst = false; if (ST.stage) step(dt); return; }
  ST.uiFirst = false;
  const st = ensureStage();
  applyWant();
  if (!ST.rig) showRig(G.charIdx, { animate: true });
  const t1 = now(); step(dt);
  // the stage draws once every program it needs is compiled: until then a few a frame, the page free between
  if (!compileStage(r)) { ST.ms = { build: t1 - t0, step: now() - t1, draw: 0 }; return; }
  // a still stage that the title did not prime primes the canvas first, one object a frame over the plain background
  if (ST.warm !== ST.tier && stillStage(r)) {
    if (!ST.prime) ST.prime = primeJob(st.scene);
    clearCanvas();
    if (!primeSome(r, ST.prime)) { ST.ms = { build: t1 - t0, step: now() - t1, draw: 0 }; return; }
    ST.prime = null; ST.warm = ST.tier;
  }
  const t2 = now();
  const W = window.innerWidth, H = window.innerHeight, f = framer ? framer() : { x: 0, y: 0, w: W, h: H };
  const view = f ? [Math.round(f.x), Math.round(f.y), Math.round(f.w), Math.round(f.h), W, H].join() : String([W, H]);
  const busy = ST.outgoing.length > 0 || (ST.rig && ST.rig.userData.age < 1);
  if (!GOV.still || !ST.drawn || ST.yaw !== ST.drawnYaw || busy || view !== ST.view) draw(r, st, f, W, H, view);
  ST.ms = { build: t1 - t0, step: t2 - t1, draw: now() - t2 };
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---------- The frame governor ----------

/**
 * A stage frame is the whole window in physical materials. A GPU that
 * cannot draw one in a tenth of a second (a weak one, or a software
 * rasteriser: SwiftShader, llvmpipe, Windows' WARP, what browsers fall back
 * to on a blocklisted or missing GPU) cannot animate the stage: it would
 * stutter, and the page would answer every tap a frame late, a frame being
 * most of a second there (with software compositing the browser waits for
 * the frame on the page's own thread). Above SLOW_MS a frame, measured, the
 * stage stands still as under prefers-reduced-motion: no idle spin, no
 * coasting, no parallax, swaps cut; and it draws only when its picture
 * changes (a new screen, a candidate, a Garage edit, a drag, the band moving
 * or the window resizing), a frame after the press that changed it, so the
 * press shows at once. Below FAST_MS it moves again.
 *
 * The cost is the time from a frame that drew the stage to the next frame,
 * the median of the last COSTS such frames, leaving out frames that also
 * compiled a program or rendered a portrait. Until there are a few, a
 * renderer that names itself a software rasteriser starts still.
 */
const GOV = { still: null, costs: [], last: -Infinity, drew: false, clean: true };
const SLOW_MS = 100, FAST_MS = 50, COSTS = 5;

/** Read the last frame's cost and decide whether the stage moves. */
function govern(t, r) {
  if (GOV.drew && GOV.clean && !(typeof document !== 'undefined' && document.hidden)) {
    GOV.costs.push(t - GOV.last); if (GOV.costs.length > COSTS) GOV.costs.shift();
  }
  GOV.last = t; GOV.drew = false; GOV.clean = true;
  stillStage(r);
  if (GOV.costs.length >= 3) {
    const m = [...GOV.costs].sort((a, b) => a - b)[GOV.costs.length >> 1];
    if (m >= SLOW_MS) GOV.still = true; else if (m < FAST_MS) GOV.still = false;
  }
}

/** Whether the stage stands still for the GPU's sake: the governor's verdict, or its first guess before it has one. */
function stillStage(r = getRenderer()) {
  if (GOV.still === null) GOV.still = softwareGpu(r);
  return GOV.still;
}
/** Whether the stage moves on its own: not for a player who asked for less motion, nor on a GPU that cannot keep up. */
const moving = () => !calm() && !stillStage();

/** Whether the renderer names a software rasteriser (the governor's first guess, before it has measured). */
function softwareGpu(r) {
  try {
    const gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return /swiftshader|llvmpipe|softpipe|software|basic render driver/i.test(String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
  } catch { return false; }
}

/**
 * The podium's turn when the Garage opens on a stage that does not spin by
 * itself (a still stage, or a player who asked for less motion): the kart
 * three-quarters from its side, nose to the right, so the trail streaming
 * back, the exhausts and the mast's flag show without a drag. A stage that
 * spins shows every side anyway, and keeps its turn.
 */
const GARAGE_YAW = 1.05;

// a new screen starts with a fresh stage frame (the one before cleared the canvas or drew another scene), after its UI
onTransition(to => {
  ST.drawn = false; ST.uiFirst = true;
  if (to === 'garage' && ST.stage && !moving()) { ST.yaw = GARAGE_YAW; ST.vel = 0; }
});

// ---------- Programs ----------

/**
 * The programs the stage has used, pinned for as long as the stage lives.
 * r128 deletes a program as soon as the last material using it is disposed,
 * and the stage disposes rigs all the time (a Garage edit, a swap, every
 * portrait): the next rig that needs the program compiled it again, a
 * visible hitch on a phone, most of a second on a software rasteriser. So
 * each program a stage frame, a portrait or the warm-up leaves alive gets
 * one extra use (three's own count), handed back when the stage is torn
 * down. The stage's programs are a fixed, budgeted set (PLAN 4.2: at most
 * 40), so this is what the budget already pays for.
 */
const PINNED = new Set();
function pinPrograms(r) {
  for (const p of r.info.programs) if (!PINNED.has(p)) { p.usedTimes++; PINNED.add(p); }
}
/**
 * Compiling, a frame's share at a time. r128 compiles a program the first
 * time a material is drawn, and waits for it (it reads the program's
 * uniforms at once): the stage's first frame would stop the page for every
 * program it needs together, a second or two on a phone, ten on a software
 * rasteriser. Instead the stage compiles them ahead, a few per frame, and
 * draws once they are all there: the page answers between two.
 *
 * A job is a list of objects (`list`, from compileJob) and how far it got
 * (`i`). compileSome runs renderer.compile under the stage's look with the
 * stage scene's lights, environment and fog (what a program is keyed on), on
 * the job's objects alone (compile walks scene.traverse for the materials,
 * so the scene's own walk is swapped for the job's for that call), and stops
 * once COMPILE_MS have gone by and at least one program was compiled: one a
 * frame where each takes long, several where they are quick. An object
 * whose materials are compiled costs a lookup. Returns whether the job is
 * done; what it compiled is pinned.
 */
const COMPILE_MS = 8;
function compileJob(roots) {
  const list = [];
  for (const root of roots) if (root) root.traverse(o => { if (o.material) list.push(o); });
  return { list, i: 0 };
}
function compileSome(r, job) {
  const scene = ST.stage.scene, n0 = r.info.programs.length, t0 = now(), { list } = job;
  scene.traverse = cb => {
    while (job.i < list.length) {
      cb(list[job.i++]);
      if (r.info.programs.length > n0 && now() - t0 > COMPILE_MS) return;
    }
  };
  try { withLook(r, STAGE_LOOK, () => r.compile(scene, ST.camera)); }
  finally { delete scene.traverse; }
  if (r.info.programs.length !== n0) { GOV.clean = false; pinPrograms(r); }
  return job.i >= list.length;
}
/** Queue `root`'s materials for the stage's own job (what the next stage frame needs). */
function needs(root) {
  const job = compileJob([root]);
  if (ST.job) ST.job.list.push(...job.list); else ST.job = job;
}
/** Take a frame's share of the stage's own job; true once nothing is left to compile before it may draw. */
function compileStage(r) {
  if (!ST.job) return true;
  if (!compileSome(r, ST.job)) return false;
  ST.job = null;
  return true;
}

/**
 * Priming. A compiled program is not all a first frame pays for: the
 * driver also builds a pipeline per program, vertex layout, blend state and
 * target, and uploads the textures, the first time each is drawn. A GPU
 * driver does that in a moment; a software rasteriser JIT-compiles each
 * (SwiftShader: several seconds for a whole stage frame, and as much again
 * for the portraits' target), in one block the page waits on. So before its
 * first frame on a target the stage draws each kind of object it holds
 * once, through a one-pixel scissor: all of them in one draw on a GPU that
 * keeps up, one a frame on a still stage (the governor).
 *
 * primeJob lists one object per material, vertex layout and shadow role
 * among what the scene shows; primeSome draws the next share alone (every
 * other renderable hidden for the call, the shown one not culled) into
 * `target` (null: the canvas, which the caller then owns for the frame).
 */
const renders = o => (o.isMesh || o.isPoints || o.isLine || o.isSprite) && !!o.material;
function primeJob(scene) {
  const seen = new Set(), list = [];
  scene.traverseVisible(o => {
    if (!renders(o)) return;
    const g = o.geometry, mats = Array.isArray(o.material) ? o.material : [o.material];
    const key = mats.map(m => m.uuid).join() + '|' + (g ? Object.keys(g.attributes).join() + (g.index ? '+i' : '') : '') + (o.isInstancedMesh ? '+n' : '') + (o.castShadow ? '+c' : '');
    if (!seen.has(key)) { seen.add(key); list.push(o); }
  });
  return { list, i: 0 };
}
function primeSome(r, job, target = null) {
  const scene = ST.stage.scene, n = stillStage(r) ? 1 : job.list.length;
  const shown = new Set(job.list.slice(job.i, job.i + n)), hidden = [], culled = [];
  scene.traverse(o => { if (renders(o) && o.visible && !shown.has(o)) { o.visible = false; hidden.push(o); } });
  for (const o of shown) if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); }
  const programs = r.info.programs.length;
  try {
    withLook(r, STAGE_LOOK, () => {
      r.setRenderTarget(target);
      r.setScissor(0, 0, 1, 1); r.setScissorTest(true);
      r.render(scene, ST.camera);
    });
  } finally {
    r.setScissorTest(false); r.setRenderTarget(null);
    for (const o of hidden) o.visible = true;
    for (const o of culled) o.frustumCulled = true;
  }
  if (r.info.programs.length !== programs) pinPrograms(r);   // the shadow pass's own
  GOV.clean = false;
  job.i += n;
  return job.i >= job.list.length;
}

/** Hand the pins back: three's releaseProgram (WebGLPrograms, r128), for the programs nothing else uses. */
function unpinPrograms(r) {
  const list = r.info.programs;
  for (const p of PINNED) {
    if (--p.usedTimes > 0) continue;
    const i = list.indexOf(p);
    if (i >= 0) { list[i] = list[list.length - 1]; list.pop(); }
    p.destroy();
  }
  PINNED.clear();
}

function draw(r, st, f, W, H, view) {
  const cam = ST.camera, programs = r.info.programs.length;
  const room = !!f && f.w > MIN_W && f.h > MIN_H;
  // no room for the podium: the backdrop alone, framed as if the band were the window's middle
  const frame = room ? f : { x: W * 0.25, y: H * 0.2, w: W * 0.5, h: H * 0.5 };
  st.turntable.visible = room;
  standCamera(cam);
  ST.box = aimStage(cam, frame, W, H, ST.rig ? ST.rig.userData.profile : null);
  ST.frame = room ? { ...f } : null;
  r.setScissorTest(false); r.setViewport(0, 0, W, H);
  // count the whole frame, shadow pass included (r128 resets info after the shadow pass)
  r.info.autoReset = false; r.info.reset();
  try { withLook(r, STAGE_LOOK, () => r.render(st.scene, cam)); }
  finally { ST.info = { calls: r.info.render.calls, triangles: r.info.render.triangles }; r.info.autoReset = true; }
  st.turntable.visible = true;
  ST.drawn = true; ST.view = view; ST.drawnYaw = ST.yaw; ST.warm = ST.tier; ST.prime = null;   // a whole frame primes the canvas
  GOV.drew = true;
  if (r.info.programs.length !== programs) GOV.clean = false;   // a compile is no measure of the frame
  pinPrograms(r);
}

// ---------- Warm-up and launch ----------

/**
 * Get "Jouer" ready while the title screen idles: game.js calls this once a
 * frame while the title sits untouched; each call does a frame's share, and
 * nothing once the stage is ready for this tier.
 *
 * The first calls build the stage and the chosen candidate's rig for the
 * current tier and compile every program they need, a few a frame
 * (compileSome), taken while the player reads the title, never all at once.
 * Then it primes the canvas (primeSome: each kind of object drawn once
 * through a one-pixel scissor, which uploads the textures, compiles the
 * shadow pass's programs, builds the shadow map and the pipelines the first
 * real frame uses), invisibly (the title clears the canvas next frame), and
 * starts the background work: the
 * portraits, then the Garage's parts (planParts), which go on behind the
 * title for as long as it idles (each call allows them for 1.5 s). Returns
 * whether it did anything.
 */
export function warmStage() {
  const tier = stageTier();
  PT.titleUntil = now() + 1500;   // the title is idle: background work may run behind it until the next call or the next press
  if (ST.warm === tier && ST.stage) return false;
  const r = getRenderer(), st = ensureStage();
  applyWant();
  if (!ST.rig) showRig(G.charIdx, { animate: true });
  if (!compileStage(r)) return true;
  if (!ST.prime) ST.prime = primeJob(st.scene);
  if (!primeSome(r, ST.prime)) return true;
  ST.prime = null; ST.warm = tier;
  makeThumbs();
  return true;
}

/** Stage 9's "go" launch (Q3): not built yet; says so. */
export function launch() { return false; }

// ---------- What the stage costs, for the test hook ----------

/**
 * The stage as the last frame drew it: the candidate on show, the podium's
 * yaw, whether it is settled (drawn, no swap running), the tier, the frame
 * measures (draw calls and triangles, shadow pass included, and the
 * programs compiled so far), the rig's and the podium's on-screen box in
 * CSS pixels (from their real vertices) and the band it was framed into,
 * how far the portraits and the Garage's part programs are, whether the
 * stage stands still (the governor) and the stage frame's measured cost (ms,
 * the governor's median), and what the last frame and the last rebuild took.
 */
export function stageInfo() {
  const r = ST.stage ? getRenderer() : null, rig = ST.rig;
  return {
    charId: rig ? rig.userData.id : null,
    yaw: ST.yaw,
    ready: !!(ST.stage && ST.drawn && ST.want === null && rig && rig.userData.age >= 1 && !ST.outgoing.length),
    tier: ST.tier,
    info: { calls: ST.info.calls, triangles: ST.info.triangles, programs: r ? r.info.programs.length : 0, geometries: r ? r.info.memory.geometries : 0, textures: r ? r.info.memory.textures : 0 },
    bbox: ST.drawn && rig && ST.frame ? screenBox() : null,
    frame: ST.frame,
    portraits: { ready: Object.values(PT.ready).filter(Boolean).length, total: CHARACTERS.length, ms: PT.ms },
    parts: PARTS.queue.length,
    still: !!GOV.still, frameMs: GOV.costs.length ? Math.round([...GOV.costs].sort((a, b) => a - b)[GOV.costs.length >> 1]) : null,
    ms: ST.ms, msSet: ST.msSet,
  };
}

/** The rig and the podium on screen: every 3rd vertex of the rig, the podium's foot ring, through the last frame's camera. */
function screenBox() {
  const cam = ST.camera, W = window.innerWidth, H = window.innerHeight, v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const add = () => { v.project(cam); const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  ST.stage.scene.updateMatrixWorld(true);
  ST.rig.traverse(o => {
    for (let p = o; p; p = p.parent) if (!p.visible || p.userData.noFrame) return;
    if (!o.isMesh || !o.geometry.attributes.position) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); add(); }
  });
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; for (const y of [0, PODIUM.top]) { v.set(Math.cos(a) * PODIUM.foot, y, Math.sin(a) * PODIUM.foot); add(); } }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------- Portraits ----------

/** Portrait sizes per stage tier (PLAN 4.2), rendered at twice that and filtered down. */
const PORTRAIT_PX = { high: 256, phone: 192, low: 192 };
/** The template's portrait: fov 24, the podium turned 0.3, the camera front right of the head (template units x1.45). */
const PORTRAIT_FOV = 24, PORTRAIT_YAW = 0.3;
const PORTRAIT_EYE = [0.95 * 1.45, 0.21 * 1.45, 3.27 * 1.45], PORTRAIT_LOOK = [0, -0.12 * 1.45, 0.07 * 1.45];
/** How many portraits land between two UI patches. */
const PATCH_EVERY = 4;
/** The screens that show the portraits, where they are rendered; on the title only while it idles (warmStage), never in a race or the Politibox. */
const PORTRAIT_STATES = new Set(['select', 'garage', 'shop']);
/**
 * A portrait waits this long after the player's last key or button press:
 * it is a frame's worth of extra work, so it goes in the quiet moments, never
 * under the player's hand (a slow GPU would otherwise answer every tap a
 * portrait late).
 */
const PORTRAIT_QUIET_MS = 1200;

/**
 * The portraits: by candidate id, the image the UI shows (`urls`), whether it
 * is final (`ready`), and what it was made from (`keys`); the queue still to
 * render, the UI's listener and the frame callback.
 */
const PT = { urls: {}, ready: {}, keys: {}, queue: [], listener: null, raf: 0, since: 0, ms: 0, titleUntil: 0, primed: null };

/** What a candidate's portrait shows: rendered again when any of it changes. */
const portraitKey = def => JSON.stringify([def.id, def.name, def.look, def.kart, def.livery || null, def.style || null, stageTier()]);

/** "Jean-Luc Mélèche" → "JM": the first letters of the first and the last word. */
export function initials(name) {
  const words = String(name || '').split(/\s+/).filter(w => /\p{L}/u.test(w));
  if (!words.length) return '?';
  const first = w => (w.match(/\p{L}/u) || ['?'])[0].toUpperCase();
  return words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1]);
}

/** A placeholder tile: the kart's colour, a soft light, the candidate's initials. A data URL; '' headless. */
function placeholder(def) {
  if (typeof document === 'undefined') return '';
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'); if (!c) return '';
  const col = '#' + new THREE.Color(def.kart).getHexString();
  c.fillStyle = col; c.fillRect(0, 0, S, S);
  const g = c.createRadialGradient(S * 0.5, S * 0.32, 4, S * 0.5, S * 0.45, S * 0.75);
  g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(12,18,48,.55)');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  c.fillStyle = '#fffaf0'; c.font = '52px "Lilita One", "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowOffsetY = 3;
  c.fillText(initials(def.name), S / 2, S * 0.42);
  return cv.toDataURL('image/png');
}

/**
 * The roster portraits, by character id, at once: the final portrait where
 * one is up to date, else the last one or a placeholder in the kart's
 * colour with the initials. The final portraits follow, one per frame;
 * `listener(urls, ready)` (the latest one passed is kept) hears of them every
 * PATCH_EVERY and at the end, and once right away. `ready[id]` is true once
 * a candidate's portrait is final.
 */
export function makeThumbs(listener) {
  if (typeof listener === 'function') PT.listener = listener;
  plan();
  notify();
  return { ...PT.urls };
}

/** Queue every candidate whose portrait is missing or out of date, the chosen one first. */
function plan() {
  const order = [...CHARACTERS];
  const chosen = order[G.charIdx]; if (chosen) { order.splice(G.charIdx, 1); order.unshift(chosen); }
  for (const def of order) {
    const key = portraitKey(def);
    if (PT.keys[def.id] === key) continue;
    PT.keys[def.id] = key; PT.ready[def.id] = false;
    if (!PT.urls[def.id]) PT.urls[def.id] = placeholder(def);
    if (!PT.queue.includes(def.id)) PT.queue.push(def.id);
  }
  G.thumbs = PT.urls;
  schedule();
}

/** A tier change: every portrait is redone at the new tier (the old ones stay up meanwhile). */
function replanPortraits() { if (PT.listener || Object.keys(PT.keys).length) { plan(); notify(); } }

function notify() { if (PT.listener) PT.listener({ ...PT.urls }, { ...PT.ready }); }

function schedule() {
  if (PT.raf || (!BG.job && !PT.queue.length && !PARTS.queue.length) || typeof requestAnimationFrame !== 'function') return;
  PT.raf = requestAnimationFrame(backgroundFrame);
}

/**
 * The background work, one job at a time: a portrait, or one of the
 * Garage's sample karts (planParts). A job builds what it needs, compiles
 * its programs a frame's share at a time (compileSome), then renders the
 * portrait or frees the sample. `job`: { kind, root, compile, def?, key?,
 * trail?, prime? } or null; a 'prime' job primes the portraits' target.
 */
const BG = { job: null };

/**
 * One frame's share of the background work, when the game is in a menu that
 * allows it, the player has left the keys and buttons alone for a moment,
 * and the stage has nothing of its own to draw or compile this frame (on a
 * still stage each is most of a second). The Garage takes its parts first,
 * every other menu its portraits.
 */
function backgroundFrame() {
  PT.raf = 0;
  const state = getState(), t = now();
  const quiet = t - stageInput.lastInput > PORTRAIT_QUIET_MS;
  const menu = PORTRAIT_STATES.has(state) || (state === 'title' && ST.stage && t < PT.titleUntil);
  const free = !showsTurntable(state) || !stillStage() || (ST.drawn && ST.want === null && !ST.job && !GOV.drew);
  if (quiet && menu && free && ST.stage) {
    const r = getRenderer();
    if (!BG.job) BG.job = nextJob(state);
    const job = BG.job;
    if (job && job.kind === 'prime') { if (primeSome(r, job.prime, portraitTarget())) { BG.job = null; PT.primed = ST.tier; } }
    else if (job && compileSome(r, job.compile)) { BG.job = null; finish(r, job); }
    GOV.clean = false;
  }
  schedule();
}

/** The next background job: built, its programs still to compile. */
function nextJob(state) {
  if (PARTS.queue.length && (state === 'garage' || !PT.queue.length)) {
    const [def, style] = PARTS.queue.shift();
    const t = buildTier(ST.tier), tex = textureTier(t, ST.tier === 'phone');
    const kart = buildKart(def, style, { profile: 'stage', pilot: false, steering: false, tier: t, tex });
    const trail = buildTrail(style.trail, { stage: true });
    return { kind: 'parts', root: kart, trail, compile: compileJob([kart, trail && trail.group]) };
  }
  // the portraits' target is primed first, as the canvas is (primeSome), once per tier
  if (PT.queue.length && PT.primed !== ST.tier) return { kind: 'prime', prime: primeJob(ST.stage.scene) };
  while (PT.queue.length) {
    const id = PT.queue.shift(), def = CHARACTERS.find(c => c.id === id);
    if (!def) continue;
    const rig = buildRig(def, defaultStyle(def), ST.tier, { trail: false });
    return { kind: 'portrait', root: rig, def, key: portraitKey(def), compile: compileJob([rig]) };
  }
  return null;
}

/** A job's programs are compiled: render the portrait and hand it to the UI (every PATCH_EVERY, and the last), or free the sample. */
function finish(r, job) {
  if (job.kind === 'parts') { disposeKart(job.root); if (job.trail) job.trail.dispose(); return; }
  const { def } = job, id = def.id;
  const t0 = now(); PT.urls[id] = renderPortrait(job.root); PT.ms = Math.round(now() - t0);
  disposeRig(job.root);
  // a newer look queued meanwhile (an admin edit) renders again; this one stands in until then
  PT.ready[id] = !PT.queue.includes(id) && portraitKey(def) === job.key;
  PT.since++;
  G.thumbs = PT.urls;
  if (PT.since >= PATCH_EVERY || !PT.queue.length) { PT.since = 0; notify(); }
}

/** A tier change: the job in hand was built for the old tier; a portrait goes back in the queue. */
function dropBackground() {
  const job = BG.job;
  if (!job) return;
  BG.job = null;
  if (job.kind === 'parts') { disposeKart(job.root); if (job.trail) job.trail.dispose(); }
  else if (job.kind === 'portrait') { disposeRig(job.root); if (!PT.queue.includes(job.def.id)) PT.queue.unshift(job.def.id); }
}

// ---------- The Garage's parts, compiled ahead ----------

/**
 * Every program the Garage can ask for, compiled before the player picks
 * the part: a part used for the first time brings a material the stage has
 * not drawn yet (a skin's map, a mast's flag cloth, a trail's glow), whose
 * program would otherwise compile in the frame after the tap. A few sample
 * karts between them carry every option of every category (the k-th option
 * of each, and each trail), built for the chosen candidate's body first,
 * then for the other two bodies (the classic kart alone has wheels, a
 * spoiler and a nose); each is a background job: compiled, then freed, its
 * programs pinned. `queue`: the samples left, as [def, style].
 */
const PARTS = { queue: [] };
const PART_LISTS = { wheels: WHEELS, spoiler: SPOILERS, sticker: STICKERS, exhaust: EXHAUSTS, underglow: UNDERGLOWS, mast: MASTS, nose: NOSES, skin: SKINS, trail: TRAILS };
const SAMPLES = Math.max(...Object.values(PART_LISTS).map(l => l.length));

/** Queue the sample karts for the current tier (a new stage: its programs are its own). */
function planParts() {
  PARTS.queue = [];
  const chosen = CHARACTERS[G.charIdx] || CHARACTERS[0];
  if (!chosen) return;
  const bodies = [chosen, ...['standard', 'tractor', 'cargo'].filter(b => b !== bodyOf(chosen)).map(b => CHARACTERS.find(c => bodyOf(c) === b)).filter(Boolean)];
  for (const def of bodies) {
    for (let k = 0; k < SAMPLES; k++) {
      const style = { ...defaultStyle(def), pods: k % 2 === 0 };
      for (const [cat, list] of Object.entries(PART_LISTS)) style[cat] = list[k % list.length];
      PARTS.queue.push([def, style]);
    }
  }
  schedule();
}

let portraitRT = null, portraitCanvas = null;

/** The portraits' render target for the current tier: twice the portrait's size, sRGB (stage notes). */
function portraitTarget() {
  const big = (PORTRAIT_PX[ST.tier] || 256) * 2;
  if (!portraitRT || portraitRT.width !== big) {
    if (portraitRT) portraitRT.dispose();
    portraitRT = new THREE.WebGLRenderTarget(big, big);
    portraitRT.texture.encoding = THREE.sRGBEncoding;
  }
  return portraitRT;
}

/**
 * Render one candidate's portrait and return it as a JPEG data URL: their
 * rig (default kart style, built by the job, its programs compiled; the
 * caller frees it) alone on the podium, turned PORTRAIT_YAW, the
 * stage jumped to their tint, seen from the template's portrait camera
 * placed on their head, into a render target twice the portrait's size
 * (sRGB, stage notes) read back and filtered down. Whatever was on the
 * podium, the podium's turn and the stage's tint are put back afterwards.
 */
function renderPortrait(rig) {
  const r = getRenderer(), st = ST.stage, size = PORTRAIT_PX[ST.tier] || 256, big = size * 2;
  const def = CHARACTERS.find(c => c.id === rig.userData.id) || CHARACTERS[0];
  const target = portraitTarget();
  const hidden = [...st.turntable.children].filter(o => o.name.startsWith('rig:') && o.visible);
  hidden.forEach(o => { o.visible = false; });
  const yaw = st.turntable.rotation.y, cone = st.scene.getObjectByName('cone');
  st.turntable.rotation.y = PORTRAIT_YAW; st.turntable.add(rig);
  if (cone) cone.visible = false;
  const was = new THREE.Color().copy(RIM.color.value).convertLinearToSRGB().getHex();
  st.setTint(tintOf(def, LOOK3D[def.id] ? LOOK3D[def.id].tint : null), true);
  st.scene.updateMatrixWorld(true);
  const head = rig.userData.pilot.userData.head.getWorldPosition(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(PORTRAIT_FOV, 1, 0.1, SKY_RADIUS + 80);
  cam.position.set(head.x + PORTRAIT_EYE[0], head.y + PORTRAIT_EYE[1], head.z + PORTRAIT_EYE[2]);
  cam.lookAt(head.x + PORTRAIT_LOOK[0], head.y + PORTRAIT_LOOK[1], head.z + PORTRAIT_LOOK[2]);
  const px = new Uint8Array(big * big * 4);
  withLook(r, STAGE_LOOK, () => {
    r.setRenderTarget(target); r.clear(); r.render(st.scene, cam);
    r.readRenderTargetPixels(target, 0, 0, big, big, px);
    r.setRenderTarget(null);
  });
  pinPrograms(r);
  // put the podium back as it was
  st.turntable.remove(rig);
  hidden.forEach(o => { o.visible = true; });
  st.turntable.rotation.y = yaw;
  if (cone) cone.visible = true;
  st.setTint(was, true); if (ST.tint != null) st.setTint(ST.tint);
  return encodePortrait(px, big, size);
}

/** The target's pixels (bottom-up) to a `size` JPEG: flipped, then drawn down by half for a smooth edge. */
function encodePortrait(px, big, size) {
  if (typeof document === 'undefined') return '';
  const src = document.createElement('canvas'); src.width = src.height = big;
  const sc = src.getContext('2d'), img = sc.createImageData(big, big), row = big * 4;
  for (let y = 0; y < big; y++) img.data.set(px.subarray((big - 1 - y) * row, (big - y) * row), y * row);
  sc.putImageData(img, 0, 0);
  if (!portraitCanvas) portraitCanvas = document.createElement('canvas');
  portraitCanvas.width = portraitCanvas.height = size;
  const c = portraitCanvas.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(src, 0, 0, size, size);
  return portraitCanvas.toDataURL('image/jpeg', 0.86);
}
