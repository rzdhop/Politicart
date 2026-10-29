// The race pre-build: the chosen circuit built while the player is still
// choosing, so the countdown starts at once (DEC-055).
//
// A race used to build its whole scene inside startField, 4 to 8 s in the
// end-to-end browsers (DEC-020). Now, from the moment the circuits screen
// opens (solo) or the lobby shows a track (team), and again on the results
// screen for "Rejouer", the circuit is built in the background, a slice per
// frame: buildTrack's phases (track.js buildTrackPhases: textures, road,
// strips, furniture, features, cyclists, decor, fold) one or a few per frame
// within BUDGET_MS, then, with a renderer, the scene's shader programs
// compiled a few per frame and each kind of object drawn once through a
// one-pixel scissor (the priming of preview.js, so the first race frame
// finds its programs, pipelines and textures ready). startField takes the
// result when its key -- the circuit, the detail level, the layout seed --
// matches, finishing synchronously whatever the frames did not get to, and
// otherwise drops it and builds as before.
//
// buildTrack writes into G as it goes (samples, crowd, hazards...), so a
// slice runs with the job's own copies of those fields swapped into G and
// swapped back out after: whatever race the screen still shows (the results)
// keeps its state between two slices.
//
// Seed: the key carries the race's layout seed. Today every race is seed 0;
// once the seeded layouts land (PLAN stage 1), the seed-independent phases
// (road, strips, decor) belong here and the layout (features, obstacles,
// cyclists) is applied at start -- a team race learns its seed with
// {t:'race'}, after the lobby. Until that split exists the whole scene is
// keyed on the seed and a mismatch simply falls back to the synchronous build.
//
// The grid is not known ahead (solo draws its AI at start, a team race's
// roster comes with {t:'race'}), but a program is keyed on a material's
// features, not its instance, so one sample kart -- the player's candidate
// in their Garage style, its pilot and its trail, hidden in the pre-built
// scene -- compiles nearly every program the six karts will need, and is
// freed when the scene is handed over.
//
// The countdown's own priming (primeCountdown): the hazards and projectiles
// the items make are not in the scene at start, so their materials would
// compile at the first throw; during the 3.6 s countdown one of each is
// primed through the scissor, a few per frame, then freed.
//
// Headless-safe: without a renderer the build phases run and the priming is
// skipped; nothing here touches the DOM.
import * as THREE from 'three';

import { CHARACTERS, TRACKS } from './data.js';
import { myStyle } from './garage.js';
import { buildHazard, buildProjectileMesh } from './items.js';
import { buildKart } from './kart.js';
import { onTransition } from './machine.js';
import { disposePilot } from './pilot.js';
import { setCast } from './primitives.js';
import { camera } from './render.js';
import { G, getPoly, SHADOWS } from './state.js';
import { buildTrackPhases, TRACK_PHASES } from './track.js';
import { buildTrail } from './trail.js';

/** How long a frame's slice may take, in ms: a phase that overruns it ends the slice. */
export const BUDGET_MS = 8;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** The fields of G a circuit build fills (track.js, cyclists.js, the decor builders): swapped in for a slice, captured after it. */
export const FIELDS = Object.freeze(['track', 'samples', 'N', 'trackLength', 'animated', 'crowd', 'hazards', 'projectiles', 'itemBoxes', 'ramps', 'pits', 'pads', 'crossings', 'cyclists']);
const freshState = track => ({ track, samples: [], N: 0, trackLength: 0, animated: [], crowd: [], hazards: [], projectiles: [], itemBoxes: [], ramps: [], pits: [], pads: [], crossings: [], cyclists: [] });

/** The one job: the circuit being built ahead, or null. */
let job = null;

/** The key a pre-built circuit is good for: the circuit, the detail level and the layout seed. */
export const prebuildKey = ({ trackIdx, poly = getPoly(), seed = 0 }) => trackIdx + '|' + poly + '|' + seed;

/**
 * Build circuit `trackIdx` ahead (seed `seed`), a slice per prebuildFrame
 * call. The same key already queued or built is kept; another is dropped
 * first. Returns the job's status, or null for an unknown circuit.
 */
export function requestPrebuild(trackIdx, { seed = 0 } = {}) {
  const key = prebuildKey({ trackIdx, seed });
  if (job && job.key === key) return prebuildStatus();
  dropPrebuild();
  const track = TRACKS[trackIdx]; if (!track) return null;
  job = { key, trackIdx, seed, scene: new THREE.Scene(), gen: null, phase: null, ms: {}, state: freshState(track), saved: null, built: false, lights: null, sample: null, compile: null, prime: null, primed: false, sliced: 0 };
  return prebuildStatus();
}

/** What is built ahead: `{ key, trackIdx, phase, built, primed, ms, scene }`, or null. The phase names are TRACK_PHASES, then 'compile', 'prime'. */
export function prebuildStatus() {
  return job ? { key: job.key, trackIdx: job.trackIdx, seed: job.seed, phase: job.phase, built: job.built, primed: job.primed, ms: { ...job.ms }, scene: job.scene, slices: job.sliced } : null;
}

/** Forget the circuit built ahead, freeing its geometries. */
export function dropPrebuild() {
  if (!job) return;
  unlight(job); unsample(job);
  job.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  job = null;
}

// ---- G in and out of a slice
function enter(j) { j.saved = {}; for (const f of FIELDS) { j.saved[f] = G[f]; G[f] = j.state[f]; } setCast(true); }
function leave(j) { for (const f of FIELDS) { j.state[f] = G[f]; G[f] = j.saved[f]; } j.saved = null; }

/** Run the build's next phases until the budget is spent (at least one). True once the build is complete. */
function buildSome(j, budget) {
  if (j.built) return true;
  const t0 = now();
  enter(j);
  try {
    if (!j.gen) j.gen = buildTrackPhases(j.scene, TRACKS[j.trackIdx]);
    do {
      const t1 = now(), r = j.gen.next();
      if (r.done) { j.built = true; j.phase = 'built'; break; }
      j.phase = r.value; j.ms[r.value] = (j.ms[r.value] || 0) + (now() - t1);
    } while (now() - t0 < budget);
  } finally { leave(j); }
  return j.built;
}

// ---- lights for the priming
/**
 * The race lights, as startField makes them (a hemisphere, an ambient, the
 * sun with its shadow), put on the scene for the priming only: a program is
 * compiled for a given set of light types and shadows, so what the pre-build
 * compiles has to see the same ones the race will. Taken off again before
 * the scene is handed over; startField adds its own.
 */
function light(j) {
  if (j.lights) return;
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.15); sun.position.set(120, 200, 80); sun.castShadow = SHADOWS(); sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 500;
  j.lights = [new THREE.HemisphereLight(0xdfefff, 0x55663a, 0.55), new THREE.AmbientLight(0xffffff, 0.15), sun, sun.target];
  for (const l of j.lights) j.scene.add(l);
  j.scene.fog = new THREE.Fog(0x000000, 220, 700);
}
function unlight(j) {
  if (!j.lights) return;
  for (const l of j.lights) j.scene.remove(l);
  const sun = j.lights[2]; if (sun.shadow.map) sun.shadow.map.dispose();
  j.lights = null; j.scene.fog = null;
}

// ---- the sample kart for the priming
function sample(j) {
  if (j.sample) return;
  const def = CHARACTERS[G.charIdx] ?? CHARACTERS[0], style = myStyle(def);
  const t0 = now();
  const kart = buildKart(def, style); kart.visible = false; j.scene.add(kart);
  const trail = buildTrail(style.trail); if (trail) { trail.group.visible = false; j.scene.add(trail.group); }
  j.sample = { kart, trail }; j.ms.sample = now() - t0;
}
/** Free the sample: its pilot (pilot.js), the kart's own geometries and materials (the shared ones stay cached), the trail. */
function unsample(j) {
  if (!j.sample) return;
  const { kart, trail } = j.sample;
  if (kart.userData.driver && kart.userData.driver.userData.lod) disposePilot(kart.userData.driver);
  kart.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.userData && o.material.userData.own) o.material.dispose(); } });
  j.scene.remove(kart);
  if (trail) { trail.dispose(); j.scene.remove(trail.group); }
  j.sample = null;
}

// ---- programs and pipelines, a share per frame (the pattern of preview.js, on the race scene with the race camera)
const renders = o => (o.isMesh || o.isPoints || o.isLine || o.isSprite) && !!o.material;
/** The objects of `root` with a material, for compileSome. */
export function compileJob(root) {
  const list = []; root.traverse(o => { if (o.material) list.push(o); });
  return { list, i: 0 };
}
/**
 * Compile the programs of the job's next objects: renderer.compile walks
 * scene.traverse for the materials, so the scene's walk is swapped for the
 * job's for that call, and stops once `budget` ms have gone by and at least
 * one program was compiled. True once the job is done.
 */
export function compileSome(r, scene, cam, j, budget = BUDGET_MS) {
  const n0 = r.info.programs.length, t0 = now(), { list } = j;
  scene.traverse = cb => {
    while (j.i < list.length) {
      cb(list[j.i++]);
      if (r.info.programs.length > n0 && now() - t0 > budget) return;
    }
  };
  try { r.compile(scene, cam); } finally { delete scene.traverse; }
  return j.i >= list.length;
}
/** One object per material, vertex layout and shadow role among what `root` holds (visible or not), for primeSome. */
export function primeJob(root) {
  const seen = new Set(), list = [];
  root.traverse(o => {
    if (!renders(o)) return;
    const g = o.geometry, mats = Array.isArray(o.material) ? o.material : [o.material];
    const key = mats.map(m => m.uuid).join() + '|' + (g ? Object.keys(g.attributes).join() + (g.index ? '+i' : '') : '') + (o.isInstancedMesh ? '+n' : '') + (o.castShadow ? '+c' : '');
    if (!seen.has(key)) { seen.add(key); list.push(o); }
  });
  return { list, i: 0 };
}
/**
 * Draw the job's next objects alone, each through a one-pixel scissor into
 * the canvas (every other renderable hidden for the call, the drawn one not
 * culled, its ancestors shown), until `budget` ms have gone by (at least
 * one). The driver builds the pipelines and uploads the textures the first
 * real frame would otherwise wait for. The caller clears or draws over the
 * pixel afterwards. True once the job is done.
 */
export function primeSome(r, scene, cam, j, budget = BUDGET_MS) {
  const t0 = now();
  const hidden = [];
  scene.traverse(o => { if (renders(o) && o.visible) { o.visible = false; hidden.push(o); } });
  try {
    do {
      const o = j.list[j.i++]; if (!o) break;
      const shown = [];
      for (let p = o; p && p !== scene; p = p.parent) if (!p.visible || p === o) { shown.push([p, p.visible]); p.visible = true; }
      const culled = o.frustumCulled; o.frustumCulled = false;
      try {
        r.setRenderTarget(null);
        r.setScissor(0, 0, 1, 1); r.setScissorTest(true);
        r.render(scene, cam);
      } finally {
        o.frustumCulled = culled;
        for (const [p, v] of shown) p.visible = v;
      }
    } while (j.i < j.list.length && now() - t0 < budget);
  } finally {
    r.setScissorTest(false);
    for (const o of hidden) o.visible = true;
  }
  return j.i >= j.list.length;
}

/**
 * A frame's share of the pre-build: the next build phases within the
 * budget, then, given a renderer, the programs and the priming. Called by
 * game.js on the circuits screen, in the lobby and on the results screen.
 * `budget` 0 does nothing (the stage's launch has the frame). Returns
 * whether there is work left.
 */
export function prebuildFrame({ renderer = null, budget = BUDGET_MS } = {}) {
  if (!job || budget <= 0) return !!job && !(job.built && (job.primed || !renderer));
  job.sliced++;
  if (!buildSome(job, budget)) return true;
  if (!renderer || job.primed) return false;
  light(job); sample(job);
  if (!job.compile) job.compile = compileJob(job.scene);
  if (!compileSome(renderer, job.scene, camera, job.compile, budget)) { job.phase = 'compile'; return true; }
  if (!job.prime) job.prime = primeJob(job.scene);
  job.phase = 'prime';
  if (!primeSome(renderer, job.scene, camera, job.prime, budget)) return true;
  job.primed = true; job.phase = 'ready';
  unlight(job); unsample(job);
  return false;
}

/**
 * The circuit built ahead for `{ trackIdx, seed }` at the current detail
 * level, or null: a key mismatch drops what was built. Whatever the frames
 * did not get to is built here and now (the priming is left to the first
 * frame). The result is `{ scene, state, ms, primed }`, for applyPrebuilt.
 */
export function takePrebuilt({ trackIdx, seed = 0 }) {
  if (!job) return null;
  if (job.key !== prebuildKey({ trackIdx, seed })) { dropPrebuild(); return null; }
  while (!buildSome(job, Infinity)) { /* the remaining phases */ }
  unlight(job); unsample(job);
  const out = { scene: job.scene, state: job.state, ms: job.ms, primed: job.primed, slices: job.sliced };
  job = null;
  return out;
}

/** Put a taken pre-build's registrations into G (startField's counterpart of buildTrack's side effects). */
export function applyPrebuilt(pre) {
  for (const f of FIELDS) G[f] = pre.state[f];
}

// ---- the countdown's priming
/** The hazards and projectiles items make (items.js buildHazard / buildProjectileMesh), primed during the countdown. */
export const HAZARD_TYPES = Object.freeze(['barricade', 'fakebox', 'lisier', 'lacrymo', 'chatons', 'rondpoint']);
export const PROJECTILE_TYPES = Object.freeze(['dossier', 'bravm', 'factcheck', 'motion']);
let cd = null;   // { scene, group, prime, done }

/** One of each hazard and projectile, hidden, in a group to prime from; buildHazard's animation hooks are taken back out of G.animated. */
export function buildExtras() {
  const group = new THREE.Group(); group.name = 'countdown-extras'; group.visible = false;
  const n = G.animated.length;
  for (const t of HAZARD_TYPES) group.add(buildHazard(t).g);
  for (const t of PROJECTILE_TYPES) group.add(buildProjectileMesh(t));
  G.animated.length = n;
  return group;
}
/**
 * A countdown frame's share: prime the item meshes' materials in the race
 * scene, a few per frame, then free them. Called by game.js before the
 * countdown frame is drawn. Returns whether there is work left.
 */
export function primeCountdown({ renderer, budget = BUDGET_MS } = {}) {
  if (!renderer || !G.scene) return false;
  if (!cd || cd.scene !== G.scene) { cd = { scene: G.scene, group: null, prime: null, done: false }; }
  if (cd.done) return false;
  if (!cd.group) { cd.group = buildExtras(); G.scene.add(cd.group); cd.prime = primeJob(cd.group); }
  if (!primeSome(renderer, G.scene, camera, cd.prime, budget)) return true;
  G.scene.remove(cd.group);
  cd.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  cd.done = true; cd.group = null;
  return false;
}
/** Forget the countdown's priming (tests, and a scene that is gone). */
export function resetCountdownPrime() { cd = null; }

// The screens that wait on a circuit: the circuits screen builds G.trackIdx ahead, the results screen builds it again for
// "Rejouer" (a team race's lobby asks through the store, which knows the room's circuit); the title has nothing to wait for.
onTransition(to => {
  if (to === 'tracks' || to === 'results') requestPrebuild(G.trackIdx);
  else if (to === 'title') dropPrebuild();
});
