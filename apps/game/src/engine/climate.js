// The circuits' climates: what the sky, the light and the air look like on
// a race (DEC-051). Six presets -- dawn, noon, golden, dusk, night,
// overcast -- each a sky gradient, a sun (colour, strength, where it stands),
// hemisphere and ambient light, fog, clouds, whether the street lamps are
// lit, and for overcast a cosmetic rain. applyClimate builds all of it into
// a race scene: the lights, the sky dome, the sun or moon disc, the drifting
// clouds (which used to be track.js's cloudsAndSky), the lamps' glow and
// the karts' headlights at night.
//
// Rules this module keeps:
//
// - The race keeps its legacy pipeline (DEC-043): no tone mapping, no sRGB
//   output, legacy light units. `noon` is the race exactly as it was lit
//   before climates existed.
// - Every climate builds the same lights, in number and in type (one
//   hemisphere, one ambient, one directional sun): three's programs are
//   compiled against the light count, so a climate that added a light
//   would recompile every material of the race (PLAN A.4). Nothing here
//   adds a point light, ever: the lamps and the headlights glow with
//   additive, unlit quads.
// - Headless-safe (DEC-014): every texture goes through canvasTexture, no
//   DOM is touched, and the glows are plain meshes the server never sees.
// - What it allocates per race is registered with disposable(), so
//   race.js disposeScene frees it with the scene.
import * as THREE from 'three';

import { mergeByMaterial } from './geo.js';
import { canvasTexture } from './primitives.js';
import { G, SHADOWS, disposable } from './state.js';
import { hex, rand } from './util.js';

/** The sun's distance from the followed kart, the legacy (120, 200, 80) offset's length. */
const SUN_RANGE = 246.6;

/**
 * The presets. `sky` is the dome's gradient, top to horizon (three stops);
 * `sun` its colour, intensity, elevation and azimuth in degrees (azimuth
 * from +z towards +x, as the legacy offset); `hemi` [sky, ground,
 * intensity]; `ambient` [colour, intensity]; `fog` colour and distances;
 * `clouds` how many, their tint, opacity and height band; `disc` the sun's
 * (or moon's) colour and radius, null for none; `lampsOn` whether the
 * street lamps glow and the karts light their headlights; `rain` a cosmetic
 * streak cylinder around the player; `stars` on the dome.
 */
export const CLIMATES = Object.freeze({
  dawn: Object.freeze({ name: 'Aube', sky: [0x6e86c4, 0xd9a9a0, 0xf5d7b8], sun: { color: 0xffc89a, intensity: 0.95, elevation: 16, azimuth: 100 }, hemi: [0xe6d8e8, 0x4f5a3c, 0.5], ambient: [0xffffff, 0.18], fog: { color: 0xe8d2c4, near: 120, far: 520 }, clouds: { count: 12, tint: 0xffd9cc, opacity: 0.9, y: [110, 170] }, disc: { color: 0xffd9a0, r: 30 }, lampsOn: false, rain: false, stars: false }),
  noon: Object.freeze({ name: 'Midi', sky: [0x3f7fd0, 0x8fb8e6, 0xc9dff2], sun: { color: 0xfff4d6, intensity: 1.15, elevation: 54.2, azimuth: 56.3 }, hemi: [0xdfefff, 0x55663a, 0.55], ambient: [0xffffff, 0.15], fog: { color: 0xc9dff2, near: 220, far: 700 }, clouds: { count: 16, tint: 0xffffff, opacity: 0.92, y: [120, 190] }, disc: { color: 0xfff7d0, r: 28 }, lampsOn: false, rain: false, stars: false }),
  golden: Object.freeze({ name: 'Heure dorée', sky: [0x4c6fb5, 0xe8a872, 0xf7cf9a], sun: { color: 0xffb866, intensity: 1.1, elevation: 20, azimuth: 250 }, hemi: [0xf2d7b0, 0x5a4e34, 0.5], ambient: [0xffe2c0, 0.16], fog: { color: 0xf1cfa6, near: 200, far: 650 }, clouds: { count: 12, tint: 0xffd8b0, opacity: 0.9, y: [110, 180] }, disc: { color: 0xffd27a, r: 34 }, lampsOn: false, rain: false, stars: false }),
  dusk: Object.freeze({ name: 'Crépuscule', sky: [0x2a2f6e, 0xb35d7a, 0xf2a070], sun: { color: 0xff9a66, intensity: 0.75, elevation: 12, azimuth: 265 }, hemi: [0xc9a0c8, 0x3a3348, 0.5], ambient: [0xd0b0e0, 0.2], fog: { color: 0xd9a0a0, near: 160, far: 600 }, clouds: { count: 10, tint: 0xe9a8b8, opacity: 0.85, y: [110, 170] }, disc: { color: 0xffb070, r: 36 }, lampsOn: true, rain: false, stars: false }),
  night: Object.freeze({ name: 'Nuit', sky: [0x05081a, 0x0e1a3e, 0x263a66], sun: { color: 0x9fb4e8, intensity: 0.35, elevation: 50, azimuth: 200 }, hemi: [0x3a4a7a, 0x101420, 0.35], ambient: [0x7080b0, 0.22], fog: { color: 0x121a33, near: 90, far: 420 }, clouds: { count: 6, tint: 0x3a4766, opacity: 0.7, y: [130, 190] }, disc: { color: 0xe8eefc, r: 14 }, lampsOn: true, rain: false, stars: true }),
  overcast: Object.freeze({ name: 'Ciel couvert', sky: [0x7d8792, 0xa9b1ba, 0xc5cad0], sun: { color: 0xdfe5ec, intensity: 0.55, elevation: 48, azimuth: 56.3 }, hemi: [0xcdd3da, 0x55605a, 0.6], ambient: [0xffffff, 0.3], fog: { color: 0xbfc6cc, near: 140, far: 520 }, clouds: { count: 26, tint: 0x9aa3ad, opacity: 0.95, y: [95, 150] }, disc: null, lampsOn: false, rain: true, stars: false }),
});

/** The climate ids, in the presets' order. */
export const CLIMATE_IDS = Object.freeze(Object.keys(CLIMATES));

/** The climate a race on `track` gets: the layout's pick (stage 1), else the track's first allowed, else noon. */
export function pickClimate(track) { return G.layout?.climate ?? track?.climates?.[0] ?? 'noon'; }

/** The sun's offset from the followed kart for a preset's elevation and azimuth (degrees). */
export function sunOffset(sun) {
  const el = sun.elevation * Math.PI / 180, az = sun.azimuth * Math.PI / 180;
  return { x: SUN_RANGE * Math.cos(el) * Math.sin(az), y: SUN_RANGE * Math.sin(el), z: SUN_RANGE * Math.cos(el) * Math.cos(az) };
}

/**
 * Light `scene` for a climate and hang its sky on it: the three lights
 * (the sun with the race's shadow setup), the dome, the disc, the clouds,
 * at night the lamps' glow (from the heads the decor registered in G.lamps,
 * so call it after buildTrack), under an overcast sky the rain. Sets G.sun,
 * G.sunOffset (updateCamera keeps the sun that far from the kart) and
 * G.climate. Returns { sun, id, preset }. An unknown id is noon.
 */
export function applyClimate(scene, track, climateId = pickClimate(track)) {
  const id = CLIMATES[climateId] ? climateId : 'noon', c = CLIMATES[id];
  scene.background = new THREE.Color(c.fog.color); scene.fog = new THREE.Fog(c.fog.color, c.fog.near, c.fog.far);
  scene.add(new THREE.HemisphereLight(c.hemi[0], c.hemi[1], c.hemi[2]));
  scene.add(new THREE.AmbientLight(c.ambient[0], c.ambient[1]));
  const sun = new THREE.DirectionalLight(c.sun.color, c.sun.intensity), off = sunOffset(c.sun);
  sun.position.set(off.x, off.y, off.z); scene.add(sun); scene.add(sun.target);
  sun.castShadow = SHADOWS(); sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 500; sun.shadow.bias = -0.0006;
  G.sun = sun; G.sunOffset = off; G.climate = { id, ...c };
  skyDome(scene, c);
  if (c.disc) { const d = new THREE.Mesh(new THREE.SphereGeometry(c.disc.r, 16, 16), disposable(new THREE.MeshBasicMaterial({ color: c.disc.color, fog: false }))); d.position.set(off.x, off.y, off.z).multiplyScalar(700 / SUN_RANGE); d.name = 'disc'; scene.add(d); }
  clouds(scene, c.clouds);
  if (c.lampsOn) lightLamps(scene);
  if (c.rain) rain(scene);
  return { sun, id, preset: c };
}

// ---------- The sky ----------
function skyDome(scene, c) {
  const [top, mid, horizon] = c.sky.map(hex);
  const t = disposable(canvasTexture(c.stars ? 512 : 16, 256, (ctx, w, h) => {
    const gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(0.45, mid); gr.addColorStop(0.8, horizon); gr.addColorStop(1, horizon);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    if (c.stars) { let s = 7; const nx = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; for (let i = 0; i < 320; i++) { const a = 0.35 + nx() * 0.65; ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'; ctx.fillRect(nx() * w, nx() * h * 0.55, nx() < 0.15 ? 2 : 1, 1); } }
  }));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 24, 12), disposable(new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })));
  sky.name = 'sky'; scene.add(sky);
}

/** Drifting clouds: each a few flattened puffs folded into one mesh, moving east as a group. */
function clouds(scene, { count, tint, opacity, y }) {
  const cm = disposable(new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity, fog: false }));
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group(); g.name = 'cloud'; const n = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(rand(7, 14), 10, 8), cm); s.position.set(j * 9 - n * 4, rand(-2, 3), rand(-4, 4)); s.scale.y = 0.55; g.add(s); }
    mergeByMaterial(g);
    g.position.set(rand(-700, 700), rand(y[0], y[1]), rand(-700, 700)); scene.add(g);
    G.animated.push(dt => { g.position.x += dt * 2.5; if (g.position.x > 760) g.position.x = -760; });
  }
}

// ---------- Glows: unlit, additive quads ----------
let GLOW = null;
/** A soft white spot, alpha 1 at the centre to 0 at the rim; kept across races. */
const glowTex = () => GLOW || (GLOW = canvasTexture(64, 64, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); }));
const glowMat = (color, opacity, map = glowTex()) => disposable(new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));

/** One quad (a, b, c, d in world space, counter-clockwise) appended to flat position/uv/index arrays. */
function quad(pos, uv, idx, a, b, c, d) {
  const n = pos.length / 3; pos.push(...a, ...b, ...c, ...d); uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
}
const geometryOf = (pos, uv, idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g; };

/**
 * Light the street lamps: a crossed glow at every head the decor registered
 * (G.lamps, street.js lamp()) and a pool of light on the ground under it,
 * all the heads in one draw and all the pools in another. The heads' world
 * positions come from their matrices, so a head folded away on "légers"
 * (foldStill removes it from the scene after merging it) still counts.
 */
function lightLamps(scene) {
  if (!G.lamps.length) return;
  scene.updateMatrixWorld(true);
  const hp = [], hu = [], hi = [], pp = [], pu = [], pi = [], p = new THREE.Vector3(), R = 1.7, S = 7;
  for (const { head, rise } of G.lamps) {
    p.setFromMatrixPosition(head.matrixWorld);
    quad(hp, hu, hi, [p.x - R, p.y - R, p.z], [p.x + R, p.y - R, p.z], [p.x + R, p.y + R, p.z], [p.x - R, p.y + R, p.z]);
    quad(hp, hu, hi, [p.x, p.y - R, p.z - R], [p.x, p.y - R, p.z + R], [p.x, p.y + R, p.z + R], [p.x, p.y + R, p.z - R]);
    const y = p.y - rise + 0.42;
    quad(pp, pu, pi, [p.x - S, y, p.z + S], [p.x + S, y, p.z + S], [p.x + S, y, p.z - S], [p.x - S, y, p.z - S]);
  }
  const heads = new THREE.Mesh(geometryOf(hp, hu, hi), glowMat(0xffe2a0, 0.85)); heads.material.side = THREE.DoubleSide; heads.name = 'lampGlow'; scene.add(heads);
  const pools = new THREE.Mesh(geometryOf(pp, pu, pi), glowMat(0xffd080, 0.35)); pools.name = 'lampPool'; scene.add(pools);
}

let BEAM = null;
/** The headlight beam: bright at the kart, gone at the far end; kept across races. */
const beamTex = () => BEAM || (BEAM = canvasTexture(64, 64, (c, w, h) => { const g = c.createLinearGradient(0, h, 0, 0); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }));

/**
 * A kart's headlight cone for the night: one additive trapezoid lying on
 * the ground ahead of the kart, in the kart's frame (z forward), for the
 * caller to hang in the scene beside the kart and move with it (race.js
 * makeKart). Not a light (PLAN A.4), and not a part of the kart: the kart's
 * tree, and so its golden hashes, are untouched.
 */
export function headlightCone() {
  const pos = [], uv = [], idx = [];
  quad(pos, uv, idx, [-0.75, 0.12, 1.9], [0.75, 0.12, 1.9], [2.6, 0.12, 11], [-2.6, 0.12, 11]);
  const m = new THREE.Mesh(geometryOf(pos, uv, idx), glowMat(0xfff1b0, 0.5, beamTex()));
  m.name = 'headlights'; m.frustumCulled = false;
  return m;
}

// ---------- Rain ----------
/** Streaks on an open cylinder around the player, scrolling down: cosmetic, no physics. */
function rain(scene) {
  const t = disposable(canvasTexture(256, 256, (c, w, h) => { c.clearRect(0, 0, w, h); let s = 3; const nx = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; for (let i = 0; i < 90; i++) { const x = nx() * w, y = nx() * h, l = 20 + nx() * 40; c.fillStyle = 'rgba(220,230,240,' + (0.25 + nx() * 0.4).toFixed(2) + ')'; c.fillRect(x, y, 1, l); if (y + l > h) c.fillRect(x, 0, 1, y + l - h); } }));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 3);
  const g = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 40, 24, 1, true), disposable(new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false })));
  g.name = 'rain'; g.frustumCulled = false; scene.add(g);
  G.animated.push(dt => { t.offset.y -= dt * 1.6; if (G.player) g.position.set(G.player.pos.x, 12, G.player.pos.z); });
}
