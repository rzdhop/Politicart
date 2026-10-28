// The 3D select stage's look on the shared r128 renderer (DEC-043).
//
// The race keeps the game's legacy look: linear output, no tone mapping,
// legacy light units, materials from primitives.mat(). The stage is lit like
// the design (ACES filmic, sRGB output, physically based lights, an image-
// based environment, a rim light tinted per candidate). Two rules keep the two
// looks apart on one renderer:
//
// 1. The stage pass runs inside withLook(), which sets the renderer's four
//    look fields and restores them afterwards, even if the pass throws.
// 2. The stage never draws a material the race draws. r128 bakes
//    toneMapping and physicallyCorrectLights into a program at its first
//    compile and never re-checks them (only outputEncoding is), so a shared
//    material would keep whichever look compiled first. The factory below
//    has its own cache, separate from primitives.mat(), and everything the
//    stage draws comes from it (or is built by the stage itself).
//
// It also carries what r128 lacks next to r184 (PLAN 2.1): colour
// management (authored hex is sRGB, converted to linear here, never globally),
// scene.environmentIntensity (set per material as envMapIntensity), the r184
// sheen parameters (r128's sheen is one Color that replaces the specular
// lobe), and the `opaque_fragment` chunk the template's rim injection hooks
// (r128 writes gl_FragColor inline).
//
// Browser-only in practice (it needs a renderer for withLook and the
// environment), but importing it is headless-safe: it touches no DOM.
import * as THREE from 'three';

/** The renderer settings the stage renders with: the template's, in r128 terms. */
export const STAGE_LOOK = Object.freeze({
  toneMapping: THREE.ACESFilmicToneMapping, // r128 and r184 share the fitted curve (exposure / 0.6)
  toneMappingExposure: 1.08,
  outputEncoding: THREE.sRGBEncoding, // r152+ outputColorSpace = SRGBColorSpace
  physicallyCorrectLights: true, // r155+ default; the template's intensities assume it
});

/** The four renderer fields a look sets, and withLook() restores. */
export const LOOK_FIELDS = Object.freeze(['toneMapping', 'toneMappingExposure', 'outputEncoding', 'physicallyCorrectLights']);

/**
 * Run `fn` with the renderer in `look` and return what it returns. All four
 * fields are restored afterwards, whatever `fn` does: the race and the
 * Politibox never see the stage's settings. A field `look` leaves out keeps
 * its current value for the pass.
 */
export function withLook(renderer, look, fn) {
  const saved = LOOK_FIELDS.map(k => renderer[k]);
  try {
    for (const k of LOOK_FIELDS) if (look[k] !== undefined) renderer[k] = look[k];
    return fn();
  } finally {
    LOOK_FIELDS.forEach((k, i) => { renderer[k] = saved[i]; });
  }
}

/** An authored colour (hex number, CSS string or Color, all sRGB) as a linear Color. */
export function linear(c) {
  return new THREE.Color(c).convertSRGBToLinear();
}

/** The design's gold: the tint of a candidate whose kart has no hue to lend. */
export const GOLD = 0xf2c14e;

/**
 * The stage tint of a candidate (rim light, sky glow, LED strips): the kart
 * colour's hue, brightened to lightness >= 0.55 and saturation >= 0.6, as an
 * sRGB hex number. `override` (LOOK3D[id].tint, stage 2) wins when set. A
 * grey or black kart has no hue to keep, so it falls back to gold. Admin
 * kart recolours (DEC-027) therefore retint the stage on their own.
 */
export function tintOf(def, override = null) {
  if (override != null) return new THREE.Color(override).getHex();
  if (!def || def.kart == null) return GOLD;
  const c = new THREE.Color(def.kart), hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.s < 0.08 || hsl.l < 0.02) return GOLD;
  if (hsl.s >= 0.6 && hsl.l >= 0.55) return c.getHex(); // already a stage tint: no HSL round trip
  return c.setHSL(hsl.h, Math.max(hsl.s, 0.6), Math.max(hsl.l, 0.55)).getHex();
}

// ---------- The rim light ----------

/**
 * The rim term's uniforms, one object shared by every rim material's
 * program: retinting writes RIM.color.value and never recompiles. The value
 * is linear (use setRimTint, or lerp it towards a linear() colour).
 */
export const RIM = { color: { value: linear(GOLD) }, strength: { value: 0.55 } };

/** Set the rim tint from an authored (sRGB) colour, and optionally its strength. */
export function setRimTint(c, strength) {
  RIM.color.value.copy(linear(c));
  if (strength !== undefined) RIM.strength.value = strength;
}

// r128's physical/standard fragment shader ends with this line where r154+
// has #include <opaque_fragment>; the rim is added to outgoingLight before it.
const RIM_ANCHOR = 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );';
const RIM_TERM = 'float rimF = pow( 1.0 - clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 ), 3.0 );\n\toutgoingLight += uRimC * rimF * uRimS;\n\t';
let rimWarned = false;
/** The onBeforeCompile hook every rim material shares (one function, one program key). */
export function injectRim(shader) {
  if (!shader.fragmentShader.includes(RIM_ANCHOR)) {
    if (!rimWarned) { rimWarned = true; console.warn('stagelook: rim anchor not found, the rim light is off (three upgraded?)'); }
    return;
  }
  shader.uniforms.uRimC = RIM.color;
  shader.uniforms.uRimS = RIM.strength;
  shader.fragmentShader = 'uniform vec3 uRimC;\nuniform float uRimS;\n' + shader.fragmentShader.replace(RIM_ANCHOR, RIM_TERM + RIM_ANCHOR);
}
const rimKey = () => 'stage-rim';

// ---------- The material factory ----------

/** envMapIntensity per tier (PLAN 4.2); r128 has no scene.environmentIntensity. */
export const ENV_INTENSITY = Object.freeze({ high: 0.75, low: 0.5 });

/** Every parameter a stage material spec may carry; anything else is a typo and throws. */
const SPEC_KEYS = new Set(['name', 'color', 'map', 'normalMap', 'normalScale', 'roughness', 'metalness', 'clearcoat', 'clearcoatRoughness',
  'sheen', 'sheenColor', 'emissive', 'emissiveIntensity', 'side', 'transparent', 'opacity', 'depthWrite', 'alphaTest', 'flatShading',
  'vertexColors', 'envMapIntensity', 'rim']);
/** What "légers" drops (PLAN 4.3): Standard has no clearcoat or sheen, and fabrics lose their normal maps. */
const HIGH_ONLY = ['clearcoat', 'clearcoatRoughness', 'sheen', 'sheenColor', 'normalMap', 'normalScale'];
const COLOUR_KEYS = new Set(['color', 'sheenColor', 'emissive']);

const cache = new Map();

/** One canonical string per spec: colours by sRGB hex, textures by uuid, the name left out. */
function keyOf(kind, spec) {
  const part = (k, v) => {
    if (v && v.isTexture) return 'tex:' + v.uuid;
    if (COLOUR_KEYS.has(k)) return '#' + new THREE.Color(v).getHexString();
    if (Array.isArray(v)) return v.join(',');
    return String(v);
  };
  return kind + '{' + Object.keys(spec).filter(k => k !== 'name' && spec[k] !== undefined).sort().map(k => k + '=' + part(k, spec[k])).join(';') + '}';
}

function check(spec) {
  for (const k of Object.keys(spec)) if (!SPEC_KEYS.has(k)) throw new Error('stagelook: unknown material parameter "' + k + '"');
}

/** Build one stage material from a spec (no cache). */
function build(kind, spec) {
  const m = kind === 'phys' ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial();
  m.name = spec.name || '';
  if (spec.color != null) m.color.copy(linear(spec.color));
  if (spec.roughness != null) m.roughness = spec.roughness;
  if (spec.metalness != null) m.metalness = spec.metalness;
  if (spec.map) m.map = spec.map;
  if (spec.emissive != null) m.emissive.copy(linear(spec.emissive));
  if (spec.emissiveIntensity != null) m.emissiveIntensity = spec.emissiveIntensity;
  if (spec.side != null) m.side = spec.side;
  if (spec.transparent != null) m.transparent = spec.transparent;
  if (spec.opacity != null) m.opacity = spec.opacity;
  if (spec.depthWrite != null) m.depthWrite = spec.depthWrite;
  if (spec.alphaTest != null) m.alphaTest = spec.alphaTest;
  if (spec.flatShading != null) m.flatShading = spec.flatShading;
  if (spec.vertexColors != null) m.vertexColors = spec.vertexColors;
  if (kind === 'phys') {
    if (spec.normalMap) {
      m.normalMap = spec.normalMap;
      const s = spec.normalScale == null ? 1 : spec.normalScale;
      if (Array.isArray(s)) m.normalScale.set(s[0], s[1]); else m.normalScale.set(s, s);
    }
    if (spec.clearcoat != null) m.clearcoat = spec.clearcoat;
    if (spec.clearcoatRoughness != null) m.clearcoatRoughness = spec.clearcoatRoughness;
    // r184's sheen (a weight) x sheenColor is r128's one sheen Color; r128 has no sheenRoughness
    if (spec.sheen) m.sheen = linear(spec.sheenColor == null ? 0xffffff : spec.sheenColor).multiplyScalar(spec.sheen);
  }
  m.envMapIntensity = spec.envMapIntensity != null ? spec.envMapIntensity : ENV_INTENSITY[kind === 'phys' ? 'high' : 'low'];
  if (spec.rim !== false) { m.onBeforeCompile = injectRim; m.customProgramCacheKey = rimKey; }
  m.userData.stage = kind;
  return m;
}

function make(kind, spec) {
  check(spec);
  const key = keyOf(kind, spec);
  let m = cache.get(key);
  if (!m) { m = build(kind, spec); m.userData.key = key; cache.set(key, m); }
  return m;
}

/**
 * A MeshPhysicalMaterial for "détaillés", cached by its parameters.
 *
 * The spec uses the design's vocabulary: colours as authored sRGB hex
 * (converted to linear here), `sheen` as a weight with `sheenColor`,
 * `normalScale` as a number or [x, y], `rim: false` to leave the rim term out
 * (the hemicycle's own surfaces). envMapIntensity defaults to the tier's.
 * Equal specs return the same instance, so equal parts merge into one draw;
 * the name does not count (the first one wins).
 */
export function phys(spec = {}) {
  return make('phys', spec);
}

/** The "légers" counterpart: a MeshStandardMaterial, the high-only parameters dropped, cached by what is left. */
export function std(spec = {}) {
  check(spec);
  const low = {};
  for (const k of Object.keys(spec)) if (!HIGH_ONLY.includes(k)) low[k] = spec[k];
  return make('std', low);
}

/** The tier switch (PLAN 4.3): Physical with sheen, clearcoat and normal maps on 'high', Standard on 'low'. */
export function stageMat(spec, tier = 'high') {
  return tier === 'low' ? std(spec) : phys(spec);
}

/** How many stage materials exist (each is at most one program per light setup). */
export const stageMaterialCount = () => cache.size;

// ---------- The environment ----------

const envs = new WeakMap();

/**
 * The stage's image-based light: the template's small panel scene (a dark
 * room, a warm key softbox overhead, two side strips, a red and a blue band)
 * pre-filtered once per renderer with PMREM, then cached. Assign it to the
 * stage scene's `environment`; every stage material reads it at its own
 * envMapIntensity. The panel scene and the generator are freed at once.
 */
export function stageEnvironment(renderer) {
  if (envs.has(renderer)) return envs.get(renderer);
  const room = new THREE.Scene(), junk = [];
  const add = (geo, mat, pos) => { const m = new THREE.Mesh(geo, mat); junk.push(geo, mat); if (pos) { m.position.set(pos[0], pos[1], pos[2]); m.lookAt(0, 0, 0); } room.add(m); };
  add(new THREE.BoxGeometry(24, 14, 24), new THREE.MeshBasicMaterial({ color: linear(0x141a3c), side: THREE.BackSide }));
  const panel = (w, h, c, k, pos) => add(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: linear(c).multiplyScalar(k), side: THREE.DoubleSide }), pos);
  panel(9, 3, 0xfff3e0, 5, [0, 6.5, 2]);
  panel(3, 7, 0xffffff, 2.4, [-11, 1, 3]);
  panel(3, 7, 0xffe0b0, 2, [11, 1, -2]);
  panel(14, 2.5, 0xc8102e, 1.4, [0, 0, -11.5]);
  panel(14, 2.5, 0x2f55c7, 0.4, [0, 4, 11.5]);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(room, 0.04).texture;
  pm.dispose();
  for (const j of junk) j.dispose();
  envs.set(renderer, tex);
  return tex;
}
