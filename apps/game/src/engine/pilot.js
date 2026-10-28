// The caricature pilots: one builder, four levels of detail (DEC-044).
//
// buildPilot(def, lod) turns a candidate's look spec (looks.js LOOK3D, by id)
// and their admin-editable colours (def.look, def.kart) into the pilot who
// sits in their kart. It replaces kart.js's box-built driver: the same
// candidate on the podium, in the portraits and in the race, much better made.
//
// The design template's techniques, ported to three r128: a lathe torso with
// the cut's lapels, collars and trims laid on its surface; capsule limbs posed
// from POSES' hand and elbow targets; the face rig (head and jaw spheres, eyes,
// lids, brows, nose, ears, the mouths, glasses and facial hair); hair from
// partial sphere shells and seeded locks; every prop (props.js). Materials
// come from stage 1's factory (stagelook.js stageMat with fabric.js
// surfaceSpec), so the stage never draws a race material.
//
// Units. Everything is built in the template's units (head radius 0.42,
// shoulders at y 1.1, the steering wheel at y 0.88, z 0.2; +z forward) inside
// a `seat` group scaled PILOT_SCALE (1.45, A-037) and placed on the body's seat
// (SEATS). The returned group is itself the kart's `driver`: it is placed at
// MOUNT, the driver's rest position in kart.js (0, 0.75, -0.35), on every
// body, so physics' stun bob (`driver.position.y = 0.75 + bob`) and the
// lootbox's `driver.visible = false` work unchanged, and the tractor's pilot
// keeps its height when bobbed. Add it to the kart as it is: do not set its
// position or scale. Kart-slot props (the kitten on the dash, the barbecue on
// the deck) ride in it too, at KART_MOUNTS, so a pilot is one object.
//
// Levels of detail (PLAN 3.3):
//   stage      ×0.5 of the template's segments, Physical materials with sheen,
//              clearcoat and fabric normal maps, merged by material except the
//              head, the right arm, the hand and the live props; on "légers"
//              (opts.tier 'low') ×0.25, Standard materials, no normal maps.
//   race-high  ×0.25 for the face, ×0.12 for the rest, every colour baked into
//              vertex colours on one shared material: the body, the head and
//              (for the weathervane and the gyrophare) one moving prop.
//   race-low   ×0.12, flat-shaded, small details dropped, one draw (two with
//              a moving prop).
//   headless   an empty group with the same userData, no geometry, for the
//              game server (DEC-014).
//
// userData (the same keys at every level; USERDATA_KEYS):
//   driver  this group: what physics bobs and the lootbox hides
//   head    the head's pivot (its centre): face rig, hair, head props
//   arm     the right shoulder's pivot (the pose's upper arm, forearm, hand)
//   hand    the right hand's pivot, holding the hand prop
//   live    { prop name: group } of the props that animate (and the ponytail)
//   anim    [(dt, t) => void]: the idle animation (head sway, the wave, the
//           live props); call them every frame with the stage clock, or push
//           them into the kart's own userData.anim
//   rest    { head, arm, hand }: their rest rotations [x, y, z], for anyone
//           animating them from outside (add to rest, never overwrite)
//   id, lod, tier, body
// On race-low the head, the arm and the hand are merged into the body, and on
// race LODs the static props are too: their userData entries are then empty
// locator groups at the same place, so code that moves them stays harmless.
//
// Lifecycle: disposePilot() frees every geometry and the few per-pilot
// materials (the gyrophare's and the barbecue's glows). Shared materials and
// textures are cached by stagelook.js and fabric.js and are never freed.
import * as THREE from 'three';

import { surfaceSpec, textureTier } from './fabric.js';
import { bakeVertexColours, capsule, mergeByMaterial } from './geo.js';
import { LOOK3D, PROPS } from './looks.js';
import { buildProps, KART_MOUNTS, PROP_BUILDERS } from './props.js';
import { stageMat } from './stagelook.js';

const TAU = Math.PI * 2, FRONT = Math.PI / 2;
const V3 = THREE.Vector3;

// ---------- Contracts ----------

/** The levels of detail buildPilot builds. */
export const LODS = Object.freeze(['stage', 'race-high', 'race-low', 'headless']);
/** Template units to game units (A-037). */
export const PILOT_SCALE = 1.45;
/** The driver's rest position in kart coordinates, the same on every body (kart.js, physics.js). */
export const MOUNT = Object.freeze([0, 0.75, -0.35]);
/** Where the template's origin lands on each body, in kart coordinates: the torso's base on the seat cushion, its back on the seat back. */
export const SEATS = Object.freeze({
  standard: Object.freeze([0, 0.24, 0.115]),
  tractor: Object.freeze([0, 0.6, -0.2]),
  cargo: Object.freeze([0, 0.14, 0.08]),
});
/** The userData keys every pilot carries, at every level. */
export const USERDATA_KEYS = Object.freeze(['anim', 'arm', 'body', 'driver', 'hand', 'head', 'id', 'live', 'lod', 'rest', 'tier']);
/** Which of kart.js's bodies a candidate drives. */
export const bodyOf = def => (def.tractor ? 'tractor' : def.cargo ? 'cargo' : 'standard');

/** Segment scale (of the template's counts), and how much small detail is built (2 all, 1 no tiny parts, 0 the bare caricature). */
const LEVELS = {
  stage: { high: { k: 0.5, face: 0.5, fine: 2 }, low: { k: 0.25, face: 0.25, fine: 2 } },
  'race-high': { k: 0.12, face: 0.25, fine: 1 },
  'race-low': { k: 0.12, face: 0.12, fine: 0 },
};

/** Hair shine per style: the template's slick is glossy (roughness 0.28, clearcoat 0.8), a mane is matte. */
export const HAIR_SHINE = Object.freeze({
  slick: { roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2 },
  quiff: { roughness: 0.24, clearcoat: 0.9, clearcoatRoughness: 0.15 },
  tousled: { roughness: 0.55 },
  bob: { roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4 },
  wild: { roughness: 0.7 },
  sides: { roughness: 0.6 },
  combover: { roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 },
  white: { roughness: 0.66 },
  sidepart: { roughness: 0.36, clearcoat: 0.45, clearcoatRoughness: 0.3 },
  bun: { roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.3 },
  ponytail: { roughness: 0.45, clearcoat: 0.15, clearcoatRoughness: 0.4 },
  cap: { roughness: 0.6 },
  strawhat: { roughness: 0.45 },
  kepi: { roughness: 0.5 },
  bikehelmet: { roughness: 0.5 },
});

/** The right hand and elbow of each pose (POSES' descriptions, in numbers). */
export const POSE_AT = Object.freeze({
  drive: { hand: [0.16, 0.9, 0.17], elbow: [0.4, 0.8, -0.08] },
  hold: { hand: [0.3, 1.13, 0.22], elbow: [0.45, 0.86, -0.02] },
  raise: { hand: [0.5, 1.62, -0.05], elbow: [0.53, 1.16, -0.2] },
  finger: { hand: [0.42, 1.55, 0.02], elbow: [0.5, 1.12, -0.15] },
  fist: { hand: [0.46, 1.72, -0.1], elbow: [0.52, 1.22, -0.2] },
  point: { hand: [0.26, 1.18, 0.55], elbow: [0.4, 1.02, 0.15] },
  wave: { hand: [0.55, 1.6, -0.02], elbow: [0.55, 1.15, -0.2] },
  selfie: { hand: [0.55, 1.45, 0.35], elbow: [0.55, 1.05, 0.05] },
  speak: { hand: [0.06, 1.36, 0.16], elbow: [0.38, 0.98, -0.02] },
});

// ---------- Colours ----------

const hsl = c => { const o = { h: 0, s: 0, l: 0 }; new THREE.Color(c).getHSL(o); return o; };
/** An sRGB hex darkened by k (0..1) in lightness. */
export const darken = (c, k) => { const h = hsl(c); return new THREE.Color().setHSL(h.h, h.s, h.l * (1 - k)).getHex(); };
/** An sRGB hex blended towards white by k. */
export const lighten = (c, k) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();
/** The complement: hue + 180 degrees, same saturation and lightness. */
export const complement = c => { const h = hsl(c); return new THREE.Color().setHSL((h.h + 0.5) % 1, h.s, h.l).getHex(); };

// ---------- Shared materials (module singletons, never disposed) ----------

/** The race LODs' one material: vertex colours, the race's legacy look (kart.js's mat() family). */
const RACE_MAT = {
  'race-high': Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 }), { name: 'pilot-race-high' }),
  'race-low': Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, flatShading: true }), { name: 'pilot-race-low' }),
};
/** Race-level carriers: one per colour, never drawn (bakeVertexColours reads their colour, authored hex as the race reads it). */
const CARRIERS = new Map();
function carrier(c) {
  const hex = new THREE.Color(c).getHex();
  let m = CARRIERS.get(hex);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: hex }); m.name = 'carrier'; CARRIERS.set(hex, m); }
  return m;
}

/** Stage trims: colour carriers (linear, as the stage reads them) baked into the stage's trim material before the merge. */
const TRIMS = new Map();
function trimCarrier(c) {
  const hex = new THREE.Color(c).getHex();
  let m = TRIMS.get(hex);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).convertSRGBToLinear() }); m.name = 'trim'; m.userData.trim = true; TRIMS.set(hex, m); }
  return m;
}

/** The animated phone screen (the template's shader), shared by every phone; SCREEN_TIME is the clock pilots' anim advance. */
const SCREEN_TIME = { value: 0 };
let screenMat = null;
function screen() {
  if (screenMat) return screenMat;
  screenMat = new THREE.ShaderMaterial({
    name: 'phone-screen', uniforms: { uTime: SCREEN_TIME },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform float uTime;varying vec2 vUv;void main(){vec2 u=vUv;float w=sin(u.y*9.-uTime*3.)*.5+.5;vec3 a=vec3(.02,.85,.82),b=vec3(1.,.03,.1);vec3 c=mix(a,b,w);'
      + 'float ring=smoothstep(.02,.0,abs(length((u-vec2(.5,fract(uTime*.35)))*vec2(1.,1.8))-.18));c+=ring*.8;c*=.8+.2*sin(u.y*120.);gl_FragColor=vec4(c*1.6,1.);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}',
  });
  return screenMat;
}

/** Per-pilot materials (the glows that change colour), freed by disposePilot. */
const OWNED = new WeakMap();

// ---------- Geometry helpers ----------

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * A surface of revolution like three's LatheGeometry (x = r sin phi,
 * z = r cos phi, so phi 0 faces +z, the front), whose angular span may change
 * from row to row: `range(y)` gives [phiStart, phiLength] (default the full
 * turn, seam at the back). Analytic normals, so a full turn has no seam crease.
 */
function lathe(points, segments, range = () => [Math.PI, TAU]) {
  const n = points.length, pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j < n; j++) {
    const [r, y] = points[j], a = points[Math.max(0, j - 1)], b = points[Math.min(n - 1, j + 1)];
    let nr = b[1] - a[1], ny = -(b[0] - a[0]); const l = Math.hypot(nr, ny) || 1; nr /= l; ny /= l;
    const [p0, pl] = range(y);
    for (let i = 0; i <= segments; i++) {
      const phi = p0 + pl * i / segments, s = Math.sin(phi), c = Math.cos(phi);
      pos.push(r * s, y, r * c); nrm.push(nr * s, ny, nr * c); uv.push(i / segments, j / (n - 1));
    }
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * (segments + 1) + i, b = a + 1, c = a + segments + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/**
 * A flat strip along a path: points[i] its centre line, normals[i] the side it
 * faces, widths[i] its half-width. Faces `normals`, single-sided (laid on a
 * surface, it is only seen from outside). `thick` adds a back and two edges.
 */
function ribbonGeo(points, normals, widths) {
  const pos = [], nrm = [], uv = [], idx = [], n = points.length;
  const P = points.map(p => new V3(...p)), N = normals.map(q => new V3(...q).normalize());
  for (let i = 0; i < n; i++) {
    const t = P[Math.min(n - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize();
    const side = new V3().crossVectors(t, N[i]).normalize().multiplyScalar(widths[i]);
    const L = P[i].clone().sub(side), R = P[i].clone().add(side);
    pos.push(L.x, L.y, L.z, R.x, R.y, R.z); nrm.push(N[i].x, N[i].y, N[i].z, N[i].x, N[i].y, N[i].z); uv.push(0, i / (n - 1), 1, i / (n - 1));
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// ---------- The torso ----------

/** The template torso's lathe profile [r, y]. */
const TORSO = [[0, 0.45], [0.26, 0.46], [0.33, 0.6], [0.345, 0.85], [0.335, 1.02], [0.3, 1.12], [0.2, 1.2], [0.1, 1.24], [0, 1.25]];
/** The judge's robe: the same torso, run down past the cushion and flared 1.2 at the hem. */
const ROBE = [[0, 0.3], [0.38, 0.3], [0.414, 0.36], [0.38, 0.5], [0.345, 0.7], ...TORSO.slice(3)];
const profileR = (prof, y) => {
  if (y <= prof[0][1]) return prof[0][0];
  for (let j = 1; j < prof.length; j++) if (y <= prof[j][1]) { const [r0, y0] = prof[j - 1], [r1, y1] = prof[j]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); }
  return 0;
};
const TORSO_Z = -0.3, DEPTH = 0.78;

/** Pure layout of the key points (seat units): used by the build and by headless. */
export function pilotLayout(spec, body = 'standard') {
  const tall = spec.build.tall, ty = y => 0.45 + (y - 0.45) * tall;
  const sx = spec.build.shoulders * (spec.outfit.cut === 'tailleur' ? 0.92 : 1), dx = 0.3 * (sx - 1);
  const grips = body === 'cargo' ? { L: [-0.27, 0.97, 0.15], R: [0.27, 0.97, 0.15] } : { L: [-0.16, 0.9, 0.17], R: [0.16, 0.9, 0.17] };
  const at = POSE_AT[spec.pose];
  const drive = spec.pose === 'drive';
  const handR = drive ? grips.R : [at.hand[0] + dx, ty(at.hand[1]), at.hand[2]];
  const elbowR = drive ? (body === 'cargo' ? [0.44, 0.84, -0.06] : [0.4 + dx, 0.8, -0.08]) : [at.elbow[0] + dx, ty(at.elbow[1]), at.elbow[2]];
  return {
    tall, ty, sx,
    head: [0, ty(1.72), -0.27],
    shoulderL: [-0.3 * sx, ty(1.1), -0.3], shoulderR: [0.3 * sx, ty(1.1), -0.3],
    elbowL: body === 'cargo' ? [-0.44, 0.84, -0.06] : [-0.4 - dx, 0.8, -0.08], handL: grips.L,
    elbowR, handR,
    headRest: spec.pose === 'selfie' ? [0.04, 0.25, -0.12] : spec.pose === 'speak' ? [0.08, 0.05, 0] : [0, 0, 0],
  };
}

// ---------- The build context ----------

function context(def, spec, lod, opts, body) {
  const race = lod !== 'stage', tier = opts.tier === 'low' ? 'low' : 'high';
  const lv = race ? LEVELS[lod] : LEVELS.stage[tier];
  const texTier = opts.texTier || textureTier(tier, !!opts.coarse);
  const L = def.look, lay = pilotLayout(spec, body);
  const c = {
    def, spec, L, lod, race, tier, texTier, body, lay, ty: lay.ty,
    k: lv.k, kBody: lv.k, kFace: lv.face, fine: lv.fine, cast: lod !== 'race-low',
    geos: [], owned: [], lives: [], hosts: {}, slots: {},
    roofMast: KART_MOUNTS[body].roofMast / PILOT_SCALE,
  };
  // race-low lowers every floor by a third: far away and flat-shaded, a 4-sided capsule reads as a limb
  c.S = c.fine === 0 ? (n, min = 3) => Math.max(Math.max(3, Math.round(min * 0.67)), Math.round(n * c.k)) : (n, min = 3) => Math.max(min, Math.round(n * c.k));

  // ---- materials
  const sm = spec2 => stageMat(spec2, tier);
  const jacketColour = spec.outfit.cut === 'shirt' ? L.shirt : L.suit;
  const hairStyle = spec.hair, hc = L.hairColor;
  const cloth = (fabric, color) => {
    if (race) return carrier(fabric === 'hivis' ? 0xff8c00 : color);
    if (fabric === 'hivis') return sm({ ...surfaceSpec('hivis', 0xffffff, texTier), color: 0xff6a00, emissive: 0xff8c00, emissiveIntensity: 0.08, roughness: 0.6 });   // #ff8c00 drifts to yellow through ACES on the yellow knit; a deeper orange lands on it
    if (fabric === 'ripstop') return sm({ ...surfaceSpec('ripstop', color, texTier), clearcoat: 0.3, clearcoatRoughness: 0.4 });
    return sm(surfaceSpec(fabric, color, texTier));
  };
  /** A small coloured trim (tricolore bands, cockades, pins): baked into one vertex-coloured material per merge group on the stage. */
  const trim = color => (race ? carrier(color) : trimCarrier(color));
  c.trim = trim;
  c.trimMat = race ? null : sm({ name: 'trim', color: 0xffffff, vertexColors: true, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const named = {
    skin: () => sm(surfaceSpec('skin', L.skin, texTier)),
    jacket: () => cloth(spec.outfit.fabric, jacketColour),
    shirt: () => sm(surfaceSpec('cotton', L.shirt, texTier)),
    lining: () => cloth('satin', complement(L.suit)),
    trouser: () => sm({ ...surfaceSpec('wool', L.suit, texTier), name: 'trousers' }),
    hair: () => sm({ ...surfaceSpec('hair', hc, texTier), side: THREE.DoubleSide, ...HAIR_SHINE[hairStyle] }),
    beard: () => sm({ ...surfaceSpec('hair', hc, texTier), roughness: 0.75, normalScale: 1.2, side: THREE.DoubleSide }),
    eyeW: () => sm({ name: 'eye-white', color: 0xf7f4ee, roughness: 0.12, clearcoat: 1 }),
    iris: () => sm({ name: 'iris', color: 0x3b2a1e, roughness: 0.1, clearcoat: 1 }),
    lips: () => sm({ name: 'lips', color: 0x8a3a36, roughness: 0.35, clearcoat: 0.4 }),
    mouth: () => sm({ name: 'mouth-dark', color: 0x2a0d10, roughness: 0.6 }),
    teeth: () => sm({ name: 'teeth', color: 0xfbf8f0, roughness: 0.15, clearcoat: 0.8 }),
    dark: () => sm({ name: 'dark-metal', color: 0x1a1c24, roughness: 0.45, metalness: 0.7 }),
    shoe: () => sm({ name: 'shoe-leather', color: 0x15110f, roughness: 0.35, clearcoat: 0.6 }),
    rubber: () => sm({ name: 'rubber', color: 0x1b1b1f, roughness: 0.9 }),
    gold: () => sm(surfaceSpec('gold', null, texTier)),
    chrome: () => sm(surfaceSpec('chrome', null, texTier)),
    blue: () => trim(0x2f55c7),
    white: () => trim(0xfffaf0),
    red: () => trim(0xe63946),
    screen: () => screen(),
  };
  const raceColour = {
    skin: L.skin, jacket: spec.outfit.fabric === 'hivis' ? 0xff8c00 : jacketColour, shirt: L.shirt, lining: complement(L.suit), trouser: L.suit,
    hair: hc, beard: hc, eyeW: 0xf7f4ee, iris: 0x2a1e16, lips: 0x8a3a36, mouth: 0x2a0d10, teeth: 0xfbf8f0,
    dark: 0x1a1c24, shoe: 0x15110f, rubber: 0x1b1b1f, gold: 0xf2c14e, chrome: 0xdde0e6, blue: 0x2f55c7, white: 0xfffaf0, red: 0xe63946, screen: 0x25f4ee,
  };
  if (L.tie != null) { named.tie = () => sm({ name: 'tie-silk', color: L.tie, roughness: 0.3, sheen: 1, sheenColor: lighten(L.tie, 0.6) }); raceColour.tie = L.tie; }
  const mats = {};
  c.mat = name => {
    if (!(name in raceColour)) throw new Error('pilot: no material "' + name + '"');
    return mats[name] || (mats[name] = race ? carrier(raceColour[name]) : named[name]());
  };
  c.cloth = cloth;
  /** A plain material from a stage spec (sRGB colour); on race levels its colour's carrier. */
  c.solid = (color, o = {}) => (race ? carrier(color) : sm({ name: 'prop', roughness: 0.5, ...o, color }));
  /** Something that glows: emissive, never a light. */
  c.glow = (color, k = 2) => (race ? carrier(color) : sm({ name: 'glow', color: 0x101010, roughness: 0.4, emissive: color, emissiveIntensity: k, rim: false }));
  /** A see-through part (lenses, glass); none on race levels. */
  c.clear = (color, opacity) => (race ? null : sm({ name: 'glass', color, transparent: true, opacity, depthWrite: false, roughness: 0, clearcoat: 1, rim: false }));
  /** A glow this pilot animates: its own material ({ material, anim(k) }); on race levels a fixed carrier. */
  c.ownGlow = (color, k) => {
    if (race) return { material: carrier(color), anim: null };
    const base = new THREE.Color(color).convertSRGBToLinear(), m = new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(k) });
    m.name = 'own-glow'; c.owned.push(m);
    return { material: m, anim: kk => m.color.copy(base).multiplyScalar(kk) };
  };
  /** A woven look for straw and wicker: the wool twill map, as its albedo (stage only). */
  c.weave = () => (race ? {} : { map: surfaceSpec('wool', 0xffffff, texTier).map });

  // ---- geometry
  c.geo = g => { c.geos.push(g); return g; };
  c.grp = (name, parent, pos, rot) => { const g = new THREE.Group(); g.name = name; if (pos) g.position.set(pos[0], pos[1], pos[2]); if (rot) g.rotation.set(rot[0], rot[1], rot[2]); if (parent) parent.add(g); return g; };
  /** A mesh, the template's mk(): null material builds nothing (a race level's lens). */
  c.mk = (geo, mat, name, parent, pos, rot, scl) => {
    if (!mat) { geo.dispose(); return null; }
    const m = new THREE.Mesh(c.geo(geo), mat); m.name = name;
    m.castShadow = c.cast && !mat.transparent; m.receiveShadow = true;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scl != null) { if (typeof scl === 'number') m.scale.setScalar(scl); else m.scale.set(scl[0], scl[1], scl[2]); }
    parent.add(m); return m;
  };
  c.capsuleGeo = (r, len, cap = 12, radial = 32) => capsule(r, len, c.S(cap, 2), c.S(radial, 5));
  /** A capsule from a to b (the template's limb()). */
  c.limb = (a, b, r, mat, name, parent, radial = 32, cap = 12) => {
    const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), len = d.length();
    const m = c.mk(capsule(r, len, c.S(cap, 2), c.S(radial, 5)), mat, name, parent);
    if (m) { m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); }
    return m;
  };
  /** A tube through points (a CatmullRom curve). */
  c.tube = (points, r, mat, name, parent, seg = 16, radial = 12) => c.mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new V3(...p))), c.S(seg * 2, 3), r, c.S(radial, 4), false), mat, name, parent);
  c.ribbon = (points, normals, widths, mat, name, parent) => c.mk(ribbonGeo(points, normals, widths), mat, name, parent);
  /** Point a group's +z along a direction given in its parent's frame. */
  c.aim = (obj, dir) => { obj.quaternion.setFromUnitVectors(new V3(0, 0, 1), new V3(...dir).normalize()); return obj; };
  /** A partial sphere shell (the template's shell()), its segments in proportion to the span it covers. */
  c.shell = (r, thS, thL, phS, phL, mat, name, parent, scl = [1, 1.05, 0.95], w = 96, h = 48) => {
    const f = c.hf || [1, 1, 1];
    return c.mk(new THREE.SphereGeometry(r, c.S(w * phL / TAU, 4), c.S(h * thL / Math.PI, 2), phS, phL, thS, thL), mat, name, parent, null, null, [scl[0] * f[0], scl[1] * f[1], scl[2] * f[2]]);
  };

  // ---- the torso's surface (seat units), for everything laid on the jacket
  const prof = spec.outfit.cut === 'robe' ? ROBE : TORSO, sx = lay.sx, tall = lay.tall;
  c.profile = prof;
  const torsoZ = (x, y) => { const r = profileR(prof, 0.45 + (y - 0.45) / tall), xl = Math.abs(x / sx); return xl >= r ? TORSO_Z : TORSO_Z + DEPTH * Math.sqrt(r * r - xl * xl); };
  const bellyZ = (x, y) => { if (!spec.build.belly) return -Infinity; const q = 1 - (x / 0.33) ** 2 - ((y - 0.62) / 0.27) ** 2; return q <= 0 ? -Infinity : -0.08 + 0.24 * Math.sqrt(q); };
  /** z of the jacket's front at (x, y), the belly included. */
  c.front = (x, y) => { const a = torsoZ(x, y), b = bellyZ(x, y); return b === -Infinity ? a : (a + b + Math.sqrt((a - b) ** 2 + 0.0009)) / 2; };
  /** The jacket's outward normal at (x, y) on its front. */
  c.normalAt = (x, y) => {
    const e = 0.01, z = c.front(x, y);
    const dzx = (c.front(x + e, y) - c.front(x - e, y)) / (2 * e), dzy = (c.front(x, y + e) - c.front(x, y - e)) / (2 * e);
    return z > TORSO_Z ? new V3(-dzx, -dzy, 1).normalize() : new V3(Math.sign(x), 0, 0);
  };
  /** n + 1 points from a to b ([x, y] each) on the jacket's front, lifted `off` along its normal; with their normals. */
  c.surfPath = (a, b, n, off = 0.01) => {
    const points = [], normals = [];
    for (let i = 0; i <= n; i++) {
      const x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n, nn = c.normalAt(x, y);
      points.push([x + nn.x * off, y + nn.y * off, c.front(x, y) + nn.z * off]); normals.push(nn.toArray());
    }
    return { points, normals };
  };
  /** A face point scaled by the head's shape, so features stay on any head. */
  c.fp = (x, y, z) => { const f = spec.face.shape; return [x * f[0], y * f[1], z * f[2]]; };

  // ---- live props: the parts that move become separate objects
  c.live = (name, group, movers) => { c.lives.push({ name, group, movers }); return group; };
  c.slot = slot => {
    if (c.slots[slot]) return c.slots[slot];
    const p = KART_MOUNTS[body][slot];
    const g = c.grp('slot-' + slot, c.pilot, sub3(p, MOUNT)); g.scale.setScalar(PILOT_SCALE);
    return (c.slots[slot] = g);
  };
  return c;
}

// ---------- Body ----------

/** One band of the torso's surface of revolution, `grow` times larger round the axis, rows between y0 and y1 (seat units). */
function torsoBand(c, y0, y1, grow, range, mat, name, parent, rows = 6) {
  const prof = c.profile, tall = c.lay.tall, pts = [];
  for (let j = 0; j <= rows; j++) { const y = y0 + (y1 - y0) * j / rows, yp = 0.45 + (y - 0.45) / tall; pts.push([profileR(prof, yp), y]); }
  const m = c.mk(lathe(pts, c.S(72, 8), range), mat, name, parent);
  if (m) { m.position.z = TORSO_Z; m.scale.set(c.lay.sx * grow[0], 1, DEPTH * grow[1]); }
  return m;
}

/** The main garment: torso, its cut's neckline and trims, the belly, the neck. */
function buildBody(c) {
  const { seat, spec, lay, ty } = c, cut = spec.outfit.cut, J = c.mat('jacket'), fine = c.fine;
  const tall = lay.tall;
  // the lathe torso (in seat units, y mapped through ty)
  const prof = c.profile.map(([r, y]) => [r, ty(y)]);
  if (cut === 'turncoat') {
    // the suit worn inside out: the left half in the suit, the right half its satin lining
    const half = (from, mat, name) => { const m = c.mk(lathe(prof, c.S(36, 4), () => [from, Math.PI]), mat, name, seat); m.position.z = TORSO_Z; m.scale.set(lay.sx, 1, DEPTH); };
    half(Math.PI, J, 'torso'); half(0, c.mat('lining'), 'torso-lining');
  } else {
    const m = c.mk(lathe(prof, c.S(72, 8)), J, 'torso', seat); m.position.z = TORSO_Z; m.scale.set(lay.sx, 1, DEPTH);
  }
  if (spec.build.belly) c.mk(new THREE.SphereGeometry(0.3, c.S(48, 8), c.S(32, 6)), J, 'belly', seat, [0, 0.62, -0.08], null, [1.1, 0.9, 0.8]);
  c.mk(new THREE.CylinderGeometry(0.095, 0.1, 0.16, c.S(32, 6)), c.mat('skin'), 'neck', seat, [0, ty(1.3), -0.29]);

  const shirt = c.mat('shirt'), dark = c.mat('dark');
  const vee = (mat, top = 1.15, bottom = 0.89, w = 0.1) => {
    const p = c.surfPath([0, ty(top)], [0, ty(bottom)], 4, 0.004);
    c.ribbon(p.points, p.normals, [w, w * 0.75, w * 0.5, w * 0.25, 0.004], mat, 'shirt-v', seat);
  };
  const lapels = (mats = [J, J]) => {
    for (const s of [-1, 1]) {
      const pts = [], nrm = [], wid = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5, ix = s * (0.105 * (1 - t) + 0.006 * t), iy = ty(1.17 - 0.29 * t), w = 0.05 * (1 - t) + 0.012 * t;
        const x = ix + s * w * 0.95, n = c.normalAt(x, iy);
        pts.push([x + n.x * 0.01, iy + n.y * 0.01, c.front(x, iy) + n.z * 0.01]); nrm.push(n.toArray()); wid.push(w);
      }
      c.ribbon(pts, nrm, wid, mats[s < 0 ? 0 : 1], 'lapel', seat);
    }
  };
  const buttons = (ys, mat = dark, r = 0.02, x = 0) => { if (fine > 0) for (const y of ys) c.mk(new THREE.SphereGeometry(r, c.S(16, 5), c.S(12, 4)), mat, 'button', seat, [x, ty(y), c.front(x, ty(y)) + r * 0.3]); };
  const collarRing = (mat, r = 0.11, tube = 0.03, y = 1.22) => c.mk(new THREE.TorusGeometry(r, tube, c.S(12, 4), c.S(40, 8)), mat, 'collar', seat, [0, ty(y), -0.29], [Math.PI / 2, 0, 0]);
  /** A band round the torso (belt, waistband), `grow` larger than the jacket. */
  const band = (y0, y1, grow, mat, name) => torsoBand(c, ty(y0), ty(y1), [grow, grow], undefined, mat, name, seat, 2);

  if (cut === 'suit' || cut === 'suithood' || cut === 'turncoat') {
    vee(shirt); lapels(cut === 'turncoat' ? [J, c.mat('lining')] : [J, J]);
    if (cut !== 'suithood') collarRing(shirt);
    buttons([0.8, 0.68]);
    if (cut === 'suithood') {
      // the hood bunched behind the neck over the collar, two drawstrings down the front
      c.mk(new THREE.TorusGeometry(0.17, 0.075, c.S(14, 4), c.S(36, 8), Math.PI), shirt, 'hood', seat, [0, ty(1.2), -0.33], [-Math.PI / 2 - 0.3, 0, 0], [1.1, 1.15, 1.4]);
      if (fine > 0) for (const s of [-1, 1]) c.limb([s * 0.035, ty(1.15), c.front(s * 0.035, ty(1.15)) + 0.012], [s * 0.04, ty(1.0), c.front(s * 0.04, ty(1.0)) + 0.012], 0.007, c.solid(0xffffff, { name: 'drawstring', roughness: 0.7 }), 'drawstring', seat, 6, 2);
    }
    if (cut === 'turncoat' && fine > 0) c.mk(new THREE.BoxGeometry(0.05, 0.035, 0.004), c.solid(0xffffff, { name: 'care-label', roughness: 0.8 }), 'care-label', seat, [0.17, ty(0.55), c.front(0.17, ty(0.55)) + 0.004], [0, 0.4, 0]);
  } else if (cut === 'mao') {
    c.mk(new THREE.CylinderGeometry(0.13, 0.14, 0.085, c.S(40, 8), 1, true), J, 'band-collar', seat, [0, ty(1.24), -0.29]);
    buttons([1.12, 1.0, 0.88, 0.76, 0.64], dark, 0.015);
  } else if (cut === 'tailleur') {
    // collarless: a round neckline on the shirt colour, braid trim round it and down the front, gold buttons
    const p = c.surfPath([0, ty(1.18)], [0, ty(1.07)], 2, 0.003);
    c.ribbon(p.points, p.normals, [0.1, 0.09, 0.06], shirt, 'neckline', seat);
    const trim = [], tn = [];
    for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI, x = Math.sin(a) * 0.105, y = ty(1.13 - Math.cos(a) * 0.07 + 0.05); const n = c.normalAt(x, y); trim.push([x + n.x * 0.01, y, c.front(x, y) + n.z * 0.01]); tn.push(n.toArray()); }
    c.ribbon(trim, tn, trim.map(() => 0.01), shirt, 'braid', seat);
    const fp = c.surfPath([0, ty(1.06)], [0, ty(0.5)], 6, 0.01);
    c.ribbon(fp.points, fp.normals, fp.points.map(() => 0.009), shirt, 'braid', seat);
    buttons([0.85, 0.7], c.mat('gold'), 0.022, 0.04);
  } else if (cut === 'uniform') {
    c.mk(new THREE.CylinderGeometry(0.13, 0.14, 0.09, c.S(40, 8), 1, true), J, 'stand-collar', seat, [0, ty(1.245), -0.29]);
    if (fine > 0) { const p = c.surfPath([0, ty(1.25)], [0, ty(1.19)], 2, 0.012); c.ribbon(p.points, p.normals, [0.03, 0.026, 0.018], c.solid(0xffffff, { name: 'collar-tab', roughness: 0.6 }), 'collar-tab', seat); }
    for (const s of [-1, 1]) {
      c.mk(new THREE.BoxGeometry(0.15, 0.022, 0.11), J, 'epaulette', seat, [s * 0.24 * lay.sx, ty(1.17), -0.3], [0, 0, -s * 0.42]);
      if (fine > 0) c.mk(new THREE.BoxGeometry(0.15, 0.008, 0.02), c.mat('gold'), 'epaulette-braid', seat, [s * 0.24 * lay.sx, ty(1.183), -0.25], [0, 0, -s * 0.42]);
      // flapped breast pockets with a gold button
      const x = s * 0.14, pk = c.surfPath([x, ty(1.0)], [x, ty(0.88)], 2, 0.008);
      c.ribbon(pk.points, pk.normals, [0.05, 0.05, 0.048], J, 'pocket', seat);
      const fl = c.surfPath([x, ty(1.01)], [x, ty(0.97)], 1, 0.014);
      c.ribbon(fl.points, fl.normals, [0.054, 0.05], J, 'pocket-flap', seat);
      buttons([0.975], c.mat('gold'), 0.012, x);
    }
    buttons([1.13, 1.0, 0.87, 0.74], c.mat('gold'), 0.018);
    band(0.6, 0.66, 1.035, c.solid(0x111111, { name: 'belt-leather', roughness: 0.35, clearcoat: 0.6 }), 'belt');
    c.mk(new THREE.BoxGeometry(0.07, 0.055, 0.015), c.mat('gold'), 'buckle', seat, [0, ty(0.63), c.front(0, ty(0.63)) + 0.018]);
  } else if (cut === 'blouson') {
    const z = c.surfPath([0, ty(1.2)], [0, ty(0.5)], 8, 0.006);
    c.ribbon(z.points, z.normals, z.points.map(() => 0.011), dark, 'zip', seat);
    if (fine > 0) c.mk(new THREE.BoxGeometry(0.022, 0.04, 0.008), c.mat('chrome'), 'zip-pull', seat, [0, ty(1.12), c.front(0, ty(1.12)) + 0.012]);
    collarRing(J, 0.125, 0.035, 1.215);
    for (const s of [-1, 1]) {
      const k = c.grp('collar-point', seat, [s * 0.075, ty(1.18), c.front(s * 0.075, ty(1.18)) + 0.022]); k.rotation.set(-0.35, 0, s * 0.5);
      const tri = new THREE.Shape(); tri.moveTo(-0.05, 0.02); tri.lineTo(0.05, 0.02); tri.lineTo(s * 0.015, -0.08); tri.closePath();
      c.mk(new THREE.ExtrudeGeometry(tri, { depth: 0.012, bevelEnabled: false, curveSegments: 1 }), J, 'collar-point', k);
    }
    band(0.45, 0.53, 1.04, J, 'waistband');
  } else if (cut === 'pullover') {
    c.mk(new THREE.CylinderGeometry(0.125, 0.14, 0.13, c.S(40, 8), 1, true), J, 'stand-collar', seat, [0, ty(1.27), -0.29]);
    // the short zip at the throat, left open on the shirt colour
    const p = c.surfPath([0, ty(1.3)], [0, ty(1.13)], 3, 0.02);
    c.ribbon(p.points, p.normals, [0.05, 0.04, 0.025, 0.008], shirt, 'open-zip', seat);
    if (fine > 0) c.mk(new THREE.BoxGeometry(0.02, 0.035, 0.008), c.mat('gold'), 'zip-pull', seat, [0.012, ty(1.13), c.front(0, ty(1.13)) + 0.024]);
    band(0.45, 0.52, 1.03, J, 'waistband');
  } else if (cut === 'robe') {
    collarRing(J, 0.12, 0.032, 1.225);
    buttons([1.15, 1.06, 0.97, 0.88, 0.79, 0.7, 0.61], J, 0.016);
  } else if (cut === 'shirt') {
    // shirt sleeves: a point collar open at the neck on the skin, one breast pocket
    const p = c.surfPath([0, ty(1.2)], [0, ty(1.1)], 2, 0.003);
    c.ribbon(p.points, p.normals, [0.06, 0.04, 0.005], c.mat('skin'), 'open-neck', seat);
    collarRing(J, 0.115, 0.028, 1.215);
    for (const s of [-1, 1]) {
      const k = c.grp('collar-point', seat, [s * 0.07, ty(1.18), c.front(s * 0.07, ty(1.18)) + 0.02]); k.rotation.set(-0.3, 0, s * 0.45);
      const tri = new THREE.Shape(); tri.moveTo(-0.045, 0.02); tri.lineTo(0.045, 0.02); tri.lineTo(s * 0.012, -0.075); tri.closePath();
      c.mk(new THREE.ExtrudeGeometry(tri, { depth: 0.008, bevelEnabled: false, curveSegments: 1 }), J, 'collar-point', k);
    }
    const pk = c.surfPath([-0.14, ty(1.0)], [-0.14, ty(0.9)], 2, 0.006);
    c.ribbon(pk.points, pk.normals, [0.045, 0.045, 0.043], J, 'pocket', seat);
    buttons([1.05, 0.93, 0.81, 0.69], c.solid(0xf4f1ea, { name: 'shirt-button', roughness: 0.3 }), 0.012);
  }

  // layers over the cut, from the inside out
  spec.outfit.layers.forEach((layer, i) => buildLayer(c, layer, i));
}

/** A layer over the cut: the hi-vis vest, the dungaree bib, the gilet. */
function buildLayer(c, layer, i) {
  const { seat, ty, spec, lay } = c, fine = c.fine;
  if (layer.kind === 'hivis') {
    // sleeveless, from the shoulders to the waist, open in a V at the front
    const vest = c.cloth('hivis'), gap = y => 0.12 + 0.75 * Math.max(0, (y - ty(0.75)) / (ty(1.12) - ty(0.75)));
    const range = y => [gap(y), TAU - 2 * gap(y)];
    torsoBand(c, ty(0.5), ty(1.13), [1.045, 1.045], range, vest, 'hivis-vest', seat, 8);
    if (spec.build.belly) c.mk(new THREE.SphereGeometry(0.3, c.S(48, 8), c.S(32, 6), FRONT + 0.25, TAU - 0.5, 0.35, Math.PI - 0.7), vest, 'hivis-belly', seat, [0, 0.62, -0.08], null, [1.15, 0.95, 0.85]);
    const silver = c.solid(0xdfe3e8, { name: 'retro-band', roughness: 0.28, metalness: 0.55, clearcoat: 0.5 });
    for (const [y0, y1] of [[0.68, 0.73], [0.88, 0.93]]) torsoBand(c, ty(y0), ty(y1), [1.055, 1.055], range, silver, 'hivis-band', seat, 1);
    if (spec.build.belly && fine > 0) c.mk(new THREE.SphereGeometry(0.3, c.S(48, 8), c.S(6, 2), FRONT + 0.25, TAU - 0.5, Math.PI / 2 - 0.1, 0.2), silver, 'hivis-band', seat, [0, 0.62, -0.08], null, [1.17, 0.97, 0.87]);
  } else if (layer.kind === 'bib') {
    const bib = c.cloth(layer.fabric, c.L.suit), s0 = 0.75;
    torsoBand(c, ty(0.5), ty(0.98), [1.025, 1.025], () => [-s0, 2 * s0], bib, 'bib', seat, 5);
    const pk = c.surfPath([0, ty(0.93)], [0, ty(0.84)], 2, 0.03);
    c.ribbon(pk.points, pk.normals, [0.07, 0.07, 0.068], bib, 'bib-pocket', seat);
    for (const s of [-1, 1]) {
      const x = s * 0.12, y = ty(0.97), z = c.front(x, y) + 0.02;
      const pts = [[x, y, z], [s * 0.15, ty(1.1), c.front(s * 0.15, ty(1.1)) + 0.02], [s * 0.19 * lay.sx, ty(1.17), -0.26], [s * 0.19 * lay.sx, ty(1.16), -0.42], [s * 0.15, ty(0.95), -0.58]];
      const nrm = pts.map(p => [p[0] * 0.3, 0.4, p[2] + 0.3]);
      c.ribbon(pts.map((p, k) => (k === 2 || k === 3 ? [p[0], p[1] + 0.012, p[2]] : p)), nrm, pts.map(() => 0.03), bib, 'bib-strap', seat);
      if (fine > 0) c.mk(new THREE.CylinderGeometry(0.018, 0.018, 0.012, c.S(14, 5)), c.solid(0xb8913a, { name: 'brass', metalness: 1, roughness: 0.35 }), 'bib-button', seat, [x, y - 0.01, z + 0.006], [Math.PI / 2, 0, 0]);
    }
  } else if (layer.kind === 'gilet') {
    // a body warmer worn open, in the kart colour; puffer quilting swells it wider
    const gilet = c.cloth(layer.fabric, c.def.kart), wide = layer.fabric === 'puffer' ? 1.12 : 1.08, gap = 0.42;
    torsoBand(c, ty(0.48), ty(1.13), [wide, 1.08], () => [gap, TAU - 2 * gap], gilet, 'gilet', seat, 8);
    c.mk(new THREE.CylinderGeometry(0.17, 0.2, 0.1, c.S(40, 8), 1, true, gap * 0.5, TAU - gap), gilet, 'gilet-collar', seat, [0, ty(1.2), -0.3]);
  }
  return i;
}

// ---------- Arms, hands, legs, the wheel ----------

/** The sleeve material for a side: the cut's own (shirt sleeves, the turncoat's lining on the right). */
function sleeve(c, side) {
  const cut = c.spec.outfit.cut;
  if (cut === 'turncoat' && side > 0) return c.mat('lining');
  return c.mat('jacket');
}

/** One arm from shoulder to hand, built in `parent`'s frame with every point relative to `origin`. */
function armChain(c, side, sh, el, h, parent, origin) {
  const rel = p => sub3(p, origin), cut = c.spec.outfit.cut, ar = 0.085;
  const sl = sleeve(c, side);
  c.mk(new THREE.SphereGeometry(ar * 1.55, c.S(32, 6), c.S(24, 4)), sl, 'shoulder', parent, rel(sh));
  if (cut === 'shirt') {
    c.limb(rel(sh), rel(el), ar, sl, 'upper-arm', parent);
    c.mk(new THREE.TorusGeometry(0.085, 0.03, c.S(10, 4), c.S(32, 6)), sl, 'rolled-sleeve', parent, rel(el)).quaternion.setFromUnitVectors(new V3(0, 0, 1), new V3(...sub3(h, el)).normalize());
    c.limb(rel(el), rel(h), ar * 0.78, c.mat('skin'), 'forearm', parent);
  } else if (cut === 'robe') {
    c.limb(rel(sh), rel(el), ar * 1.05, sl, 'upper-arm', parent);
    // a bell sleeve widening to 1.6 times the forearm at the cuff
    const A = new V3(...rel(el)), B = new V3(...lerp3(el, h, 0.86)).sub(new V3(...origin)), d = B.clone().sub(A);
    const m = c.mk(new THREE.CylinderGeometry(ar * 1.6, ar * 0.95, d.length(), c.S(32, 6)), sl, 'bell-sleeve', parent);
    m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize());
  } else {
    c.limb(rel(sh), rel(el), ar, sl, 'upper-arm', parent);
    c.limb(rel(el), rel(h), ar * 0.9, sl, 'forearm', parent);
    const ribbed = cut === 'pullover' || cut === 'blouson';
    const cuff = c.fine === 0 ? null : c.mk(new THREE.TorusGeometry(ribbed ? 0.074 : 0.07, ribbed ? 0.026 : 0.022, c.S(10, 4), c.S(32, 6)), ribbed ? sl : c.mat('shirt'), 'cuff', parent, lerp3(rel(el), rel(h), 0.82));
    if (cuff) cuff.quaternion.setFromUnitVectors(new V3(0, 0, 1), new V3(...sub3(h, el)).normalize());
  }
}

function buildArms(c) {
  const { seat, lay } = c;
  // the left arm drives, always: built straight on the seat
  armChain(c, -1, lay.shoulderL, lay.elbowL, lay.handL, seat, [0, 0, 0]);
  c.mk(new THREE.SphereGeometry(0.082, c.S(32, 6), c.S(24, 4)), c.mat('skin'), 'hand', seat, lay.handL, null, [1, 0.9, 1.1]);
  // the right arm is a pivot chain: shoulder, then the hand at its end
  const arm = c.grp('arm', seat, lay.shoulderR);
  armChain(c, 1, lay.shoulderR, lay.elbowR, lay.handR, arm, lay.shoulderR);
  const hand = c.grp('hand', arm, sub3(lay.handR, lay.shoulderR));
  c.arm = arm; c.hand = hand;
  buildHand(c, hand);
}

/** The right hand in the pose's grip. */
function buildHand(c, hand) {
  const skin = c.mat('skin'), pose = c.spec.pose, S = c.S;
  const palm = (scl = [1, 0.9, 1.1]) => c.mk(new THREE.SphereGeometry(0.082, S(32, 6), S(24, 4)), skin, 'hand', hand, null, null, scl);
  if (pose === 'finger') {
    palm([1, 0.9, 1.05]);
    c.limb([-0.03, 0.06, 0.01], [-0.035, 0.2, 0.02], 0.024, skin, 'index-finger', hand, 16);
    // the other three curled into the palm: it reads as an index, never anything ruder
    c.limb([-0.005, 0.07, 0.045], [0.055, 0.06, 0.045], 0.024, skin, 'curled-fingers', hand, 12);
    c.limb([-0.06, 0.02, 0.03], [-0.1, 0.07, 0.05], 0.021, skin, 'thumb', hand, 12);
  } else if (pose === 'fist') {
    palm([1, 0.85, 1.05]);
    c.limb([-0.05, 0.065, 0.03], [0.05, 0.065, 0.03], 0.028, skin, 'knuckles', hand, 12);
  } else if (pose === 'point') {
    palm();
    c.limb([0, 0.0, 0.06], [0, 0.01, 0.2], 0.026, skin, 'index-finger', hand, 16);
    c.limb([-0.04, 0.03, 0.03], [-0.06, 0.07, 0.07], 0.022, skin, 'thumb', hand, 12);
  } else if (pose === 'wave') {
    palm([1.1, 1.2, 0.45]);
    if (c.fine > 0) for (let i = 0; i < 4; i++) { const x = -0.045 + i * 0.03; c.limb([x, 0.07, 0], [x * 1.25, 0.15 + (i === 1 || i === 2 ? 0.015 : 0), 0], 0.017, skin, 'finger', hand, 10, 6); }
    else c.mk(new THREE.SphereGeometry(0.06, S(16, 5), S(12, 4)), skin, 'fingers', hand, [0, 0.1, 0], null, [1, 1, 0.4]);
    c.limb([-0.07, 0.0, 0], [-0.12, 0.06, 0.01], 0.019, skin, 'thumb', hand, 10, 6);
  } else palm();
}

function buildLegs(c) {
  if (c.fine === 0) return;
  const { seat } = c, tr = c.spec.outfit.cut === 'robe' ? c.mat('jacket') : c.mat('trouser'), shoe = c.mat('shoe');
  for (const s of [-1, 1]) {
    const hip = [s * 0.13, 0.53, -0.24], knee = [s * 0.15, 0.6, 0.3], ankle = [s * 0.16, 0.34, 0.5];
    c.limb(hip, knee, 0.095, tr, 'thigh', seat, 20, 6);
    if (c.fine > 1) {
      c.limb(knee, ankle, 0.075, tr, 'shin', seat, 16, 6);
      c.mk(new THREE.SphereGeometry(0.075, c.S(20, 6), c.S(14, 4)), shoe, 'shoe', seat, [s * 0.16, 0.3, 0.58], null, [1, 0.7, 1.6]);
    }
  }
}

/** The steering wheel (standard, tractor) or the cargo bike's handlebar, part of the driver as in kart.js. */
function buildWheel(c) {
  const { seat, body } = c, dark = c.mat('dark');
  if (body === 'cargo') {
    c.limb([-0.3, 0.97, 0.15], [0.3, 0.97, 0.15], 0.02, dark, 'handlebar', seat, 12, 3);
    for (const s of [-1, 1]) c.limb([s * 0.22, 0.97, 0.15], [s * 0.33, 0.97, 0.15], 0.032, c.mat('rubber'), 'grip', seat, 12, 3);
    c.limb([0, 0.97, 0.15], [0, 0.9, 0.17], 0.024, dark, 'stem', seat, 10, 2);
    return;
  }
  const base = body === 'tractor' ? [0, (1.6 - SEATS.tractor[1]) / PILOT_SCALE, (0.2 - SEATS.tractor[2]) / PILOT_SCALE] : [0, (0.87 - SEATS.standard[1]) / PILOT_SCALE, (0.76 - SEATS.standard[2]) / PILOT_SCALE];
  c.limb(base, [0, 0.87, 0.22], 0.025, dark, 'steering-column', seat, 12, 3);
  c.mk(new THREE.TorusGeometry(0.16, 0.028, c.S(20, 4), c.S(64, 10)), dark, 'steering-wheel', seat, [0, 0.88, 0.2], [-0.6, 0, 0]);
  if (c.fine > 0) c.mk(new THREE.CylinderGeometry(0.045, 0.045, 0.04, c.S(24, 6)), c.mat('gold'), 'steering-hub', seat, [0, 0.88, 0.2], [Math.PI / 2 - 0.6, 0, 0]);
}

// ---------- Head: the face rig and the hair ----------

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const back = a => [FRONT + a, TAU - 2 * a];

function buildHead(c) {
  const { lay, spec } = c, F = spec.face, f = F.shape;
  const head = c.grp('head', c.seat, lay.head, lay.headRest);
  c.head = head; c.hf = f;
  const saved = c.k; c.k = c.kFace;
  const skin = c.mat('skin');
  c.mk(new THREE.SphereGeometry(0.42, c.S(128, 10), c.S(96, 8)), skin, 'skull', head, null, null, [f[0], 1.05 * f[1], 0.95 * f[2]]);
  const jz = 1 + (F.jaw - 1) * 0.6;
  c.mk(new THREE.SphereGeometry(0.3, c.S(64, 8), c.S(48, 6)), skin, 'jaw', head, [0, -0.2 * f[1], 0.04 * f[2]], null, [1.1 * f[0] * F.jaw, 0.72 * (1 + (F.jaw - 1) * 0.5), jz * f[2]]);
  buildFace(c, head);
  buildHair(c, head);
  c.k = saved;
}

function buildFace(c, head) {
  const F = c.spec.face, fp = c.fp, br = F.brow, S = c.S, fine = c.fine;
  const jawZ = (F.jaw - 1) * 0.18;
  for (const s of [-1, 1]) {
    const eye = fp(s * 0.15, 0.04, 0.34);
    c.mk(new THREE.SphereGeometry(0.085, S(40, 8), S(24, 6)), c.mat('eyeW'), 'eye-white', head, eye, null, [1, 1.05, 0.6]);
    c.mk(new THREE.SphereGeometry(0.05, S(32, 6), S(16, 4)), c.mat('iris'), 'iris', head, fp(s * 0.145, 0.035, 0.388), null, [1, 1, 0.4]);
    if (fine > 1) c.mk(new THREE.SphereGeometry(0.014, S(12, 4), S(8, 3)), c.mat('eyeW'), 'eye-glint', head, fp(s * 0.13, 0.062, 0.408));
    if (F.lid > 0) c.mk(new THREE.SphereGeometry(0.09, S(32, 6), S(16, 4), 0, TAU, 0, F.lid), c.mat('skin'), 'eyelid', head, eye, [0.9, 0, 0], [1, 1.05, 0.65]);
    c.limb(fp(s * 0.07, 0.15 - br, 0.372), fp(s * 0.22, 0.16 + br, 0.318), 0.022 * F.browSize, c.mat('hair'), 'eyebrow', head, 12, 6);
    c.mk(new THREE.SphereGeometry(0.1, S(32, 6), S(16, 4)), c.mat('skin'), 'ear', head, fp(s * 0.41, 0, -0.02), null, [0.42 * F.ears, F.ears, 0.7 * F.ears]);
  }
  const n = F.nose;
  c.mk(new THREE.SphereGeometry(0.07, S(40, 8), S(24, 6)), c.mat('skin'), 'nose', head, [0, -0.04 * c.spec.face.shape[1], 0.39 * c.spec.face.shape[2] + 0.035 * (n[2] - 1)], [-0.2, 0, 0], [n[0], n[1] * 1.15, n[2]]);
  // the mouth
  const m = F.mouth, lips = c.mat('lips'), at = (x, y, z) => { const p = fp(x, y, z); p[2] += jawZ; return p; };
  if (m === 'smile' || m === 'smirk' || m === 'grin') {
    c.mk(new THREE.TorusGeometry(0.085, 0.016, S(12, 4), S(40, 8), Math.PI), lips, 'mouth', head, at(m === 'smirk' ? 0.02 : 0, -0.18, 0.35), [0, 0, Math.PI + (m === 'smirk' ? 0.25 : 0)], [1, m === 'grin' ? 0.9 : 0.55, 1]);
    if (m === 'grin') c.mk(new THREE.CircleGeometry(0.08, S(40, 8), Math.PI, Math.PI), c.mat('teeth'), 'teeth', head, at(0, -0.18, 0.356), [-0.15, 0, 0], [1, 0.8, 1]);
  } else if (m === 'flat') {
    c.limb(at(-0.07, -0.19, 0.352), at(0.07, -0.19, 0.352), 0.014, lips, 'mouth', head, 12, 4);
  } else if (m === 'shout') {
    c.mk(new THREE.SphereGeometry(0.085, S(32, 6), S(20, 4)), c.mat('mouth'), 'mouth-open', head, at(0, -0.2, 0.335), null, [1, 0.75, 0.45]);
    c.mk(new THREE.BoxGeometry(0.1, 0.02, 0.02), c.mat('teeth'), 'teeth', head, at(0, -0.155, 0.368));
  } else if (m === 'pursed') {
    c.mk(new THREE.TorusGeometry(0.035, 0.014, S(10, 4), S(24, 8)), lips, 'mouth', head, at(0, -0.19, 0.355), [0.25, 0, 0]);
    c.mk(new THREE.CircleGeometry(0.022, S(16, 6)), c.mat('mouth'), 'mouth-hole', head, at(0, -0.19, 0.356), [0.25, 0, 0]);
  } else if (m === 'rant') {
    c.mk(new THREE.SphereGeometry(0.085, S(32, 6), S(20, 4)), c.mat('mouth'), 'mouth-open', head, at(0.03, -0.2, 0.335), [0, 0, -0.12], [1.2, 0.5, 0.45]);
    c.mk(new THREE.BoxGeometry(0.11, 0.018, 0.02), c.mat('teeth'), 'teeth', head, at(0.035, -0.18, 0.367), [0, 0, -0.12]);
  }
  if (F.glasses) buildGlasses(c, head, F.glasses);
  if (F.facial) buildFacialHair(c, head, F.facial);
}

/** A rim ring (outer w x h, wall t, depth d) as an extruded rounded rectangle. */
function rimGeo(c, w, h, r, t, d) {
  const sh = roundRectShape(w, h, r); sh.holes.push(roundRectPath(w - 2 * t, h - 2 * t, Math.max(0.005, r - t)));
  return new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: c.S(8, 2) });
}
const roundRectShape = (w, h, r) => roundRectInto(new THREE.Shape(), w, h, r);
const roundRectPath = (w, h, r) => roundRectInto(new THREE.Path(), w, h, r);
function roundRectInto(p, w, h, r) {
  const x = -w / 2, y = -h / 2;
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r); p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r); p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

function buildGlasses(c, head, kind) {
  const fp = c.fp, S = c.S, fine = c.fine;
  const temples = (mat, y = 0.05, r = 0.009) => { if (fine > 0) for (const s of [-1, 1]) c.limb(fp(s * 0.235, y, 0.42), fp(s * 0.405, y + 0.01, 0.05), r, mat, 'glasses-temple', head, 8, 2); };
  if (kind === 'round') {
    const fr = c.solid(0x141418, { name: 'glasses-frame', roughness: 0.2, metalness: 0.8 }), lens = c.clear(0xcfe0ff, 0.14);
    for (const s of [-1, 1]) { c.mk(new THREE.TorusGeometry(0.085, 0.011, S(12, 4), S(48, 10)), fr, 'glasses-rim', head, fp(s * 0.15, 0.04, 0.43)); c.mk(new THREE.CircleGeometry(0.08, S(32, 8)), lens, 'glasses-lens', head, fp(s * 0.15, 0.04, 0.43)); }
    temples(fr); c.limb(fp(-0.066, 0.055, 0.44), fp(0.066, 0.055, 0.44), 0.01, fr, 'glasses-bridge', head, 8, 2);
  } else if (kind === 'rect') {
    const fr = c.solid(0x8a9099, { name: 'steel-frame', roughness: 0.22, metalness: 0.9 }), lens = c.clear(0xd8e6ff, 0.12);
    for (const s of [-1, 1]) {
      c.mk(rimGeo(c, 0.17, 0.09, 0.025, 0.011, 0.008), fr, 'glasses-rim', head, fp(s * 0.15, 0.035, 0.425));
      c.mk(new THREE.ShapeGeometry(roundRectShape(0.15, 0.07, 0.02), c.S(6, 2)), lens, 'glasses-lens', head, fp(s * 0.15, 0.035, 0.428));
    }
    temples(fr, 0.045, 0.007); c.limb(fp(-0.065, 0.045, 0.44), fp(0.065, 0.045, 0.44), 0.008, fr, 'glasses-bridge', head, 8, 2);
  } else if (kind === 'peer') {
    const red = c.solid(0xd62828, { name: 'red-frame', roughness: 0.25, clearcoat: 0.9 }), lens = c.clear(0xe8f0ff, 0.1);
    for (const s of [-1, 1]) {
      c.mk(rimGeo(c, 0.19, 0.15, 0.05, 0.03, 0.03), red, 'glasses-rim', head, fp(s * 0.152, -0.01, 0.415));
      c.mk(new THREE.ShapeGeometry(roundRectShape(0.13, 0.09, 0.025), c.S(6, 2)), lens, 'glasses-lens', head, fp(s * 0.152, -0.01, 0.43));
    }
    temples(red, 0.0, 0.013); c.limb(fp(-0.06, 0.0, 0.445), fp(0.06, 0.0, 0.445), 0.014, red, 'glasses-bridge', head, 8, 2);
  } else if (kind === 'shades') {
    const black = c.solid(0x060608, { name: 'shades', roughness: 0.06, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.03 });
    for (const s of [-1, 1]) c.mk(new THREE.SphereGeometry(0.1, S(32, 8), S(16, 4), 0, TAU, 0, 1.1), black, 'shades-lens', head, fp(s * 0.15, 0.035, 0.405), [Math.PI / 2, s * 0.22, 0], [1.12, 0.32, 0.86]);
    c.mk(new THREE.BoxGeometry(0.4, 0.014, 0.016), black, 'shades-bar', head, fp(0, 0.095, 0.43));
    temples(black, 0.08, 0.012);
  } else if (kind === 'aviator') {
    const gold = c.mat('gold'), mirror = c.solid(0xb8c8e0, { name: 'mirror-lens', metalness: 0.85, roughness: 0.12, clearcoat: 1 });
    for (const s of [-1, 1]) {
      const p = fp(s * 0.152, 0.025, 0.425);
      c.mk(new THREE.TorusGeometry(0.085, 0.007, S(8, 3), S(40, 10)), gold, 'aviator-rim', head, p, [0, 0, s * 0.3], [1.05, 0.95, 1]);
      c.mk(new THREE.CircleGeometry(0.08, S(28, 8)), mirror, 'aviator-lens', head, [p[0], p[1], p[2] - 0.004], [0, 0, s * 0.3], [1.05, 0.95, 1]);
    }
    for (const y of [0.075, 0.035]) c.limb(fp(-0.07, y, 0.44), fp(0.07, y, 0.44), 0.006, gold, 'aviator-bridge', head, 6, 2);
    temples(gold, 0.07, 0.006);
  } else if (kind === 'monocle') {
    const gold = c.mat('gold'), p = fp(0.15, 0.04, 0.43);
    c.mk(new THREE.TorusGeometry(0.088, 0.013, S(10, 4), S(40, 10)), gold, 'monocle-rim', head, p);
    c.mk(new THREE.CircleGeometry(0.084, S(32, 8)), c.clear(0xe8f0ff, 0.18), 'monocle-lens', head, p);
    if (fine > 0) c.tube([[p[0] + 0.07, p[1] - 0.06, p[2] - 0.01], [0.3, -0.25, 0.3], [0.24, -0.45, 0.32], [0.17, -0.6, 0.36]], 0.006, gold, 'monocle-chain', head, 10, 5);
  }
}

function buildFacialHair(c, head, kind) {
  const fp = c.fp, beard = c.mat('beard'), jawZ = (c.spec.face.jaw - 1) * 0.18, at = (x, y, z) => { const p = fp(x, y, z); p[2] += jawZ; return p; };
  if (kind === 'brush') {
    const m = c.limb(at(-0.1, -0.115, 0.37), at(0.1, -0.115, 0.37), 0.045, beard, 'moustache', head, 16, 6);
    if (m) m.scale.set(0.8, 1, 0.65);
  } else if (kind === 'walrus') {
    c.mk(new THREE.SphereGeometry(0.08, c.S(24, 6), c.S(16, 4)), beard, 'moustache', head, at(0, -0.125, 0.365), null, [1.65, 0.7, 0.65]);
    for (const s of [-1, 1]) c.limb(at(s * 0.1, -0.13, 0.355), at(s * 0.135, -0.25, 0.315), 0.036, beard, 'moustache-end', head, 12, 6);
  } else if (kind === 'sideburns') {
    for (const p of [-0.15, Math.PI - 0.15]) c.shell(0.452, 1.25, 0.85, p, 0.3, beard, 'sideburn', head, [1.02, 1.05, 0.97]);
  }
}

/** Short hair: a cap shell and a back shell (the template's short()). */
function short(c, head, H, r = 0.445, cap = 0.95, bk = 2.05, a = 1.25) {
  c.shell(r, 0, cap, 0, TAU, H, 'hair-cap', head);
  c.shell(r, 0, bk, ...back(a), H, 'hair-back', head);
}

/** Locks scattered on the scalp (the template's tousled and curly technique), seeded; skips the face. */
function locks(c, head, H, { seed, n, rad, th = [0, 1.05], skipFace = 0.8, faceArc = 0.55, scl = [1.2, 0.8, 1], out = 0.42 }) {
  const R = rng(seed), f = c.hf, fine = c.fine;
  let placed = 0, tries = 0;
  const count = fine > 0 ? n : Math.ceil(n * 0.6);
  while (placed < count && tries++ < n * 8) {
    const t = th[0] + R() * (th[1] - th[0]), ph = R() * TAU;
    if (Math.abs(((ph - FRONT + Math.PI * 3) % TAU) - Math.PI) < faceArc && t > skipFace) continue;
    const d = new V3(-Math.cos(ph) * Math.sin(t), Math.cos(t), Math.sin(ph) * Math.sin(t));
    const r = rad[0] + R() * (rad[1] - rad[0]);
    c.mk(new THREE.SphereGeometry(r, c.S(24, 5), c.S(16, 4)), H, 'hair-lock', head, [d.x * out * f[0], d.y * (out + 0.02) * f[1], d.z * (out - 0.02) * f[2]], [R() * 3, R() * 3, 0], scl);
    placed++;
  }
}

/** A point on the scalp, `lift` above the head's surface, at polar angle th from the crown and azimuth az (0 = front, +x right). */
function scalp(c, th, az, lift = 0.005) {
  const f = c.hf, r = 0.42 + lift;
  return [Math.sin(th) * Math.sin(az) * r * f[0], Math.cos(th) * r * 1.05 * f[1], Math.sin(th) * Math.cos(az) * r * 0.95 * f[2]];
}

function buildHair(c, head) {
  const st = c.spec.hair, L = c.L, f = c.hf, S = c.S, fine = c.fine;
  const H = c.mat('hair');
  const P = (x, y, z) => [x * f[0], y * f[1], z * f[2]];
  if (st === 'slick' || st === 'quiff') {
    short(c, head, H, 0.444, 0.86, 2.0, 1.3);
    if (st === 'slick') c.mk(new THREE.SphereGeometry(0.2, S(48, 8), S(32, 6)), H, 'hair-quiff', head, P(0.04, 0.37, 0.14), [-0.4, 0, -0.15], [1.55, 0.45, 1]);
    else c.mk(new THREE.SphereGeometry(0.2, S(48, 8), S(32, 6)), H, 'hair-quiff', head, P(0, 0.42, 0.25), [-0.5, 0, -0.06], [1.85, 1.0, 1.25]);
  } else if (st === 'tousled') {
    short(c, head, H, 0.445, 0.98, 1.85, 1.25);
    locks(c, head, H, { seed: 3, n: 8, rad: [0.13, 0.17], scl: [1.35, 0.55, 1.1], out: 0.4 });
    // two locks tumble forward over the brow, one each side of a loose parting
    for (const s of [-1, 1]) c.mk(new THREE.SphereGeometry(0.15, S(24, 5), S(16, 4)), H, 'hair-lock', head, P(s * 0.12, 0.33, 0.25), [0.75, s * 0.5, s * 0.35], [1.4, 0.55, 1]);
  } else if (st === 'bob') {
    c.shell(0.47, 0, 1.08, 0, TAU, H, 'hair-cap', head, [1.07, 1.05, 1]);
    c.shell(0.47, 0, 2.3, ...back(0.92), H, 'hair-bob', head, [1.08, 1.05, 1]);
    c.shell(0.465, 0.3, 0.9, FRONT - 0.9, 1.8, H, 'hair-fringe', head, [1.06, 1.06, 1.02]);
  } else if (st === 'wild') {
    c.shell(0.445, 0, 0.95, 0, TAU, H, 'hair-cap', head);
    locks(c, head, H, { seed: 11, n: 14, rad: [0.15, 0.22], th: [0.15, 1.45], skipFace: 0.55, scl: [1.15, 0.9, 1.05], out: 0.43 });
    for (const s of [-1, 1]) c.mk(new THREE.SphereGeometry(0.14, S(24, 5), S(16, 4)), H, 'hair-tuft', head, P(s * 0.44, 0.1, -0.06), [0.3, 0, s * 0.5], [0.8, 1.1, 1.2]);
  } else if (st === 'sides' || st === 'combover') {
    c.shell(0.445, 0.95, 0.95, ...back(1.45), H, 'hair-fringe-ring', head);
    for (const s of [-1, 1]) c.mk(new THREE.SphereGeometry(0.12, S(24, 5), S(16, 4)), H, 'hair-side', head, P(s * 0.41, 0.06, -0.1), null, [0.55, 1.1, 1.3]);
    if (st === 'combover') {
      // four long strands from a parting low above the right ear, laid across the crown to the left
      [0.32, 0.1, -0.12, -0.32].forEach((z, i) => {
        const pts = [];
        for (let k = 0; k <= 6; k++) { const az = Math.PI / 2 - k / 6 * Math.PI, th = 1.2 - Math.sin(k / 6 * Math.PI) * (1.05 - i * 0.04); const p = scalp(c, th, az + z * (1 - Math.abs(k / 3 - 1)) * 0.6, 0.012); pts.push([p[0], p[1], p[2] + z * 0.55 * f[2]]); }
        c.tube(pts, 0.022, H, 'combover-strand', head, 12, 6);
      });
    }
  } else if (st === 'white') {
    c.shell(0.448, 0, 0.95, 0, TAU, H, 'hair-cap', head);
    c.shell(0.448, 0, 1.9, ...back(1.2), H, 'hair-back', head);
    c.mk(new THREE.SphereGeometry(0.2, S(48, 8), S(24, 6)), H, 'hair-ridge', head, P(0, 0.34, 0.12), [0.35, 0, 0], [1.75, 0.42, 1.0]);
  } else if (st === 'sidepart') {
    short(c, head, H, 0.444, 0.72, 1.85, 1.2);
    // a ruler-straight parting on the left, from the front to the crown
    if (fine > 0) c.limb(scalp(c, 0.68, -0.32, 0.03), scalp(c, 0.3, -0.75, 0.03), 0.012, c.mat('skin'), 'parting', head, 6, 2);
    c.mk(new THREE.SphereGeometry(0.16, S(40, 8), S(24, 6)), H, 'hair-sweep', head, P(0.08, 0.36, 0.12), [-0.3, 0, -0.25], [1.5, 0.35, 1.1]);
  } else if (st === 'bun') {
    short(c, head, H, 0.445, 0.9, 1.85, 1.25);
    c.mk(new THREE.SphereGeometry(0.17, S(40, 8), S(28, 6)), H, 'hair-bun', head, P(0, 0.3, -0.38));
    c.mk(new THREE.TorusGeometry(0.11, 0.022, S(10, 4), S(32, 8)), c.solid(0x1a1410, { name: 'hair-band', roughness: 0.5 }), 'bun-band', head, P(0, 0.26, -0.3), [0.9, 0, 0]);
  } else if (st === 'ponytail') {
    short(c, head, H, 0.445, 0.95, 1.85, 1.25);
    const pt = c.grp('ponytail', head, P(0, 0.36, -0.32));
    const chain = [[0, 0, 0], [0, -0.08, -0.17], [0, -0.26, -0.24], [0, -0.45, -0.22], [0, -0.6, -0.16]];
    for (let i = 0; i < 4; i++) c.limb(chain[i], chain[i + 1], 0.07 - i * 0.01, H, 'ponytail-lock', pt, 16, 6);
    c.mk(new THREE.TorusGeometry(0.065, 0.022, S(10, 4), S(24, 8)), c.solid(0xe0203c, { name: 'scrunchie', roughness: 0.7, sheen: 0.6, sheenColor: 0xff9aa8 }), 'scrunchie', pt, [0, 0, 0], [0.5, 0, 0]);
    c.live('ponytail', pt, [{ obj: pt, stage: (o, r, t) => { o.rotation.set(r.rotation.x + 0.06 * Math.sin(t * 2.3), r.rotation.y, r.rotation.z + 0.22 * Math.sin(t * 1.6)); } }]);
  } else if (st === 'cap') {
    const capM = c.solid(darken(L.suit, 0.4), { name: 'cap-cloth', roughness: 0.8, ...(c.race ? {} : { map: surfaceSpec('corduroy', 0xffffff, c.texTier).map, sheen: 0.6, sheenColor: lighten(darken(L.suit, 0.4), 0.4) }) });
    c.shell(0.468, 0, 1.22, 0, TAU, capM, 'cap-crown', head, [1.04, 1.02, 1.08]);
    c.mk(new THREE.CylinderGeometry(0.3, 0.3, 0.025, S(32, 8), 1, false, -Math.PI / 2, Math.PI), capM, 'cap-peak', head, P(0, 0.2, 0.33), [0.28, 0, 0], [1.2, 1, 0.8]);
    c.mk(new THREE.SphereGeometry(0.035, S(12, 5), S(8, 4)), capM, 'cap-button', head, P(0, 0.485, 0));
    locks(c, head, H, { seed: 7, n: 12, rad: [0.07, 0.09], th: [1.3, 1.75], skipFace: 1.0, faceArc: 1.75, scl: [1.2, 0.8, 1], out: 0.44 });
  } else if (st === 'strawhat') {
    const straw = c.solid(0xe0c060, { name: 'straw', roughness: 0.75, ...c.weave() });
    c.shell(0.445, 1.0, 0.85, ...back(1.2), H, 'hair-back', head);
    c.mk(new THREE.CylinderGeometry(0.85, 0.85, 0.025, S(64, 10)), straw, 'hat-brim', head, P(0, 0.27, -0.02), [-0.06, 0, 0]);
    c.mk(new THREE.CylinderGeometry(0.42, 0.45, 0.3, S(48, 8)), straw, 'hat-crown', head, P(0, 0.43, -0.03), [-0.06, 0, 0]);
    c.mk(new THREE.CylinderGeometry(0.455, 0.455, 0.07, S(48, 8), 1, true), c.solid(0x8a2a22, { name: 'hat-band', roughness: 0.6 }), 'hat-band', head, P(0, 0.33, -0.025), [-0.06, 0, 0]);
    c.mk(new THREE.SphereGeometry(0.2, S(48, 8), S(32, 6)), H, 'hair-meche', head, P(-0.07, 0.22, 0.27), [-0.5, 0.2, 0.35], [1.5, 0.42, 0.85]);
  } else if (st === 'kepi') {
    const cloth = c.cloth('wool', L.suit);
    c.shell(0.445, 1.0, 0.9, ...back(1.2), H, 'hair-back', head);
    c.mk(new THREE.CylinderGeometry(0.4, 0.44, 0.32, S(48, 8)), cloth, 'kepi-crown', head, P(0, 0.42, -0.02), [-0.08, 0, 0]);
    c.mk(new THREE.CylinderGeometry(0.3, 0.3, 0.02, S(32, 8), 1, false, -Math.PI / 2, Math.PI), c.solid(0x0a0a0c, { name: 'kepi-peak', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }), 'kepi-peak', head, P(0, 0.27, 0.3), [0.35, 0, 0], [1.25, 1, 0.65]);
    c.mk(new THREE.TorusGeometry(0.44, 0.022, S(8, 3), S(48, 10)), c.mat('gold'), 'kepi-braid', head, P(0, 0.29, -0.01), [Math.PI / 2 - 0.08, 0, 0]);
    c.mk(new THREE.SphereGeometry(0.05, S(16, 6), S(12, 4)), c.mat('gold'), 'kepi-badge', head, P(0, 0.42, 0.42), null, [1, 1.15, 0.35]);
  } else if (st === 'bikehelmet') {
    const shellM = c.solid(lighten(c.def.kart, 0.3), { name: 'helmet-shell', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, metalness: 0.1 });
    c.shell(0.5, 0, 1.3, 0, TAU, shellM, 'helmet-shell', head, [0.98, 1.0, 1.14]);
    const dark = c.mat('dark');
    for (const x of [-0.17, 0, 0.17]) {
      const pts = [];
      for (let k = 0; k <= 6; k++) { const th = -0.8 + k / 6 * 1.6; pts.push([x * f[0], (0.5 * Math.cos(th) + 0.012) * f[1] * (1 - Math.abs(x) * 0.5), 0.5 * Math.sin(th) * 1.14 * f[2]]); }
      c.tube(pts, 0.022, dark, 'helmet-vent', head, 10, 5);
    }
    for (const s of [-1, 1]) c.tube([[s * 0.41 * f[0], -0.04, 0.08], [s * 0.31 * f[0], -0.28, 0.2], [s * 0.1, -0.395 * f[1], 0.27], [0, -0.4 * f[1], 0.28]], 0.012, dark, 'chin-strap', head, 8, 4);
    c.limb(P(0, -0.08, -0.42), P(0, -0.24, -0.4), 0.07, H, 'hair-tail', head, 14, 6);
  }
}

// ---------- The build ----------

/** Where a userData entry stays when its object is merged away: an empty group at the same place. */
function locator(obj, root) {
  const g = new THREE.Group(); g.name = obj.name;
  obj.updateMatrixWorld(true); root.updateMatrixWorld(true);
  new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(obj.matrixWorld).decompose(g.position, g.quaternion, g.scale);
  root.add(g); return g;
}

const restOf = o => ({ position: o.position.clone(), rotation: o.rotation.clone(), scale: o.scale.clone() });

/**
 * Build one candidate's pilot. `def` is a CHARACTERS entry (its live colours
 * are read), `lod` one of LODS. Options: `tier` 'high' | 'low' (the stage on
 * "légers"), `coarse` (a phone: the 'phone' texture tier), `texTier` to force
 * one, `look` to build from another look spec, `wheel: false` to leave the
 * steering wheel to the kart, `idle: false` for no head sway, `trace` (an
 * array that receives every geometry and material made, for leak tests),
 * `merge: false` to leave every part a mesh of its own (inspection only).
 */
export function buildPilot(def, lod = 'stage', opts = {}) {
  if (!LODS.includes(lod)) throw new Error('pilot: unknown level of detail "' + lod + '"');
  const spec = opts.look || LOOK3D[def.id];
  if (!spec) throw new Error('pilot: no look spec for "' + def.id + '"');
  const body = bodyOf(def), tier = lod === 'stage' && opts.tier === 'low' ? 'low' : 'high';
  const pilot = new THREE.Group(); pilot.name = 'pilot';
  pilot.position.set(MOUNT[0], MOUNT[1], MOUNT[2]);
  if (lod === 'headless') return headless(pilot, def, spec, body);

  const c = context(def, spec, lod, opts, body);
  c.pilot = pilot;
  const seat = c.grp('seat', pilot, sub3(SEATS[body], MOUNT)); seat.scale.setScalar(PILOT_SCALE);
  c.seat = seat;
  buildBody(c);
  buildLegs(c);
  buildArms(c);
  if (opts.wheel !== false) buildWheel(c);
  buildHead(c);
  buildProps(c, spec.props, PROPS);

  // what moves, per level: the stage keeps every pivot and live part; a race only the head and what spins
  const race = c.race, keepHead = lod !== 'race-low';
  const live = {}, movers = [];
  for (const l of c.lives) {
    const raceMovers = l.movers.filter(m => m.race);
    if (!race) { live[l.name] = l.group; movers.push(...l.movers.map(m => ({ obj: m.obj, fn: m.stage }))); }
    else if (raceMovers.length) { live[l.name] = raceMovers.some(m => m.obj === l.group) ? l.group : locator(l.group, pilot); movers.push(...raceMovers.map(m => ({ obj: m.obj, fn: m.race }))); }
    else live[l.name] = locator(l.group, pilot);
  }
  const ref = { head: c.head, arm: c.arm, hand: c.hand };
  if (race) { ref.arm = locator(c.arm, pilot); ref.hand = locator(c.hand, pilot); if (!keepHead) ref.head = locator(c.head, pilot); }
  const keep = new Set([...Object.values(ref), ...Object.values(live), ...movers.map(m => m.obj)]);

  // bake (race) and merge, then free every source geometry the merge left behind
  if (race && opts.merge !== false) bakeVertexColours(pilot, RACE_MAT[lod], { keepMapped: false });
  if (!race && opts.merge !== false) bakeVertexColours(pilot, c.trimMat, { skip: o => o.isMesh && !o.material.userData.trim });
  const before = new Set(c.geos);
  pilot.traverse(o => { if (o.isMesh) before.add(o.geometry); });
  if (opts.merge !== false) mergeByMaterial(pilot, [...keep]);
  const after = new Set();
  pilot.traverse(o => { if (o.isMesh) after.add(o.geometry); });
  for (const g of before) if (!after.has(g)) g.dispose();
  if (!c.cast) pilot.traverse(o => { if (o.isMesh) o.castShadow = false; });

  // the idle animation, from the rest poses as merged
  const rest = { head: ref.head.rotation.toArray().slice(0, 3), arm: ref.arm.rotation.toArray().slice(0, 3), hand: ref.hand.rotation.toArray().slice(0, 3) };
  const anim = [];
  const phase = [...def.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 7;
  if (spec.props.some(n => n === 'phone' || n === 'selfie')) anim.push((dt, t) => { SCREEN_TIME.value = t; });
  if (opts.idle !== false && keepHead) {
    const h = ref.head, r = rest.head;
    anim.push((dt, t) => h.rotation.set(r[0] + Math.sin(t * 1.3 + phase) * 0.05, r[1] + Math.sin(t * 0.8 + phase) * 0.14, r[2] + Math.sin(t * 1.1) * 0.04));
  }
  if (spec.pose === 'wave' && !race) { const h = ref.hand, r = rest.hand; anim.push((dt, t) => { h.rotation.z = r[2] + Math.sin(t * TAU * 2) * 0.35; }); }
  for (const m of movers) { const r = restOf(m.obj); anim.push((dt, t) => m.fn(m.obj, r, t, dt)); }

  OWNED.set(pilot, c.owned);
  if (opts.trace) { opts.trace.push(...before, ...after, ...c.owned); }
  pilot.userData = { id: def.id, lod, tier, body, driver: pilot, head: ref.head, arm: ref.arm, hand: ref.hand, live, anim, rest };
  return pilot;
}

/** The game server's pilot: the same userData, empty groups where the parts would be, no geometry. */
function headless(pilot, def, spec, body) {
  const lay = pilotLayout(spec, body), s = PILOT_SCALE, o = sub3(SEATS[body], MOUNT);
  const at = (name, p) => { const g = new THREE.Group(); g.name = name; g.position.set(o[0] + p[0] * s, o[1] + p[1] * s, o[2] + p[2] * s); pilot.add(g); return g; };
  const head = at('head', lay.head), arm = at('arm', lay.shoulderR), hand = at('hand', lay.handR);
  head.rotation.set(lay.headRest[0], lay.headRest[1], lay.headRest[2]);
  const live = {};
  for (const name of liveNames(spec)) live[name] = at(name, [0, 0, 0]);
  pilot.userData = { id: def.id, lod: 'headless', tier: 'high', body, driver: pilot, head, arm, hand, live, anim: [], rest: { head: [...lay.headRest], arm: [0, 0, 0], hand: [0, 0, 0] } };
  return pilot;
}

/** The names of a look's live parts: its live props and the ponytail. */
export function liveNames(spec) {
  const out = spec.props.filter(p => PROPS[p].live);
  if (spec.hair === 'ponytail') out.push('ponytail');
  return out;
}

/** Free a pilot's geometries and its own materials (shared materials and textures stay cached). */
export function disposePilot(pilot) {
  pilot.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  for (const m of OWNED.get(pilot) || []) m.dispose();
  OWNED.delete(pilot);
  if (pilot.parent) pilot.parent.remove(pilot);
}

/** Every vocabulary value the builder implements (looks.test cross-checks; pilot.test asserts the match). */
export const IMPLEMENTED = Object.freeze({
  props: Object.keys(PROP_BUILDERS),
  poses: Object.keys(POSE_AT),
  hair: Object.keys(HAIR_SHINE),
});
