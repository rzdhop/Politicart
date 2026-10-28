// The 3D select stage's scene: the hemicycle, the podium, the light rig (PLAN stage 4).
//
// The design template's stage (stage3d.js), ported to r128 and rebuilt to a
// budget. What it draws, back to front:
//
// - A sky dome: a ShaderMaterial with a two-stop night gradient, the
//   candidate's tint glowing on the horizon behind the benches, 16 slow light
//   rays and twinkling stars. On "légers" it has a quarter of the segments
//   and no rays (a define, so the shader itself is cheaper). Its 6 tiers
//   end lower, leaving the horizon glow in view right above the back row
//   as a hard band, so there the glow is dimmed and faded in from above
//   the horizon (SKY_LOW_GLOW): the top edge reads as on 'high'.
// - The ground and the hemicycle: 10 tiers (6 on "légers"), each a wooden
//   riser, a carpet tread and a gold LED strip on its nosing, carrying rows
//   of velvet seats. All the risers are one mesh, all the treads one, all
//   the strips one (a line mesh on "légers"), and every seat, cushion and
//   back, is one instance of one InstancedMesh: 6 draws for some 430 seats.
// - The podium: a navy lacquered drum topped by the hemicycle floor texture
//   (gold arcs, a tricolore rim), a gold ring, and a strip of LED in the
//   candidate's tint at its foot. Its top surface is the origin of
//   `turntable`, which is what the caller spins and puts the kart on.
// - An additive pool of light on the floor around it and a faint additive
//   cone of light above it (dropped on "légers": a big overdraw surface).
//   (The template's risers are open cylinders seen from inside, so they
//   are back-face culled and its renders show the floor and the sky
//   through the tiers, hence the light-blue dashes in the top rows of
//   01-cs3. Here they face the podium: solid lacquered wood.)
// - Confetti drifting down all the time, and thrown up from the podium by
//   burst() when the player launches.
//
// The light rig is fixed (PLAN 1.2 A.4): a hemisphere, the key spot (the
// one shadow caster, 2048 on 'high', 1024 on 'phone', none on 'low'), a top
// spot, a rim and a fill directional. Nothing here adds or removes a light
// after the build, so swapping candidates never recompiles a program; pilot
// props must glow with emissive materials, never with lights of their own.
//
// Retinting (setTint) eases the rim light, the rim term every pilot
// material carries (stagelook RIM), the sky's glow, the podium strip and the
// pool towards the candidate's tint; all are uniforms or light colours, so
// it never recompiles either. The rim light itself takes the tint only half
// way (RIM_LIGHT_WHITE): at 2.6 a fully saturated tint (patrick's green)
// drew a hard coloured line round every face that no material could
// soften; the floor, the strips and the sky keep the full tint.
//
// Scale. The template is built for its own kart (2.6 long); the game's is
// about 4.1. The whole stage is authored in the template's units and scaled
// by STAGE_SCALE, so the podium's top is 2.8 across in game units (A-037)
// and the hemicycle keeps the design's proportions around it. Only the
// turntable is at scale 1, so a kart added to it keeps its own size.
//
// Time (PLAN 1.2 A.1): update() clamps its step to [0, MAX_DT]. The
// template's first step was negative (its clock started before a 20 s
// portrait pass), which extrapolated the tint lerp to 1e66 and blanked the
// whole stage; here a negative, NaN or huge step is a still frame.
//
// Materials: the lit ones come from stagelook's factory (stageMat), so they
// are shared and cached, never disposed here; the unlit ones (sky, LEDs,
// pool, cone) and two gradient textures are this module's own, and
// dispose() frees them with every geometry. Everything is built through
// primitives.canvasTexture (via fabric.js), so building it headless (Node
// tests) works and draws nothing.
import * as THREE from 'three';

import { fabric, hemicycleFloor } from './fabric.js';
import { countTriangles } from './geo.js';
import { canvasTexture } from './primitives.js';
import { GOLD, linear, RIM, stageEnvironment, stageMat } from './stagelook.js';

/** Template units to game units: the template's podium (r 1.75) becomes the game kart's (r 2.8). */
export const STAGE_SCALE = 1.6;

/** How far the rim light's colour is blended from the tint towards white (the rest of the stage takes the full tint). */
export const RIM_LIGHT_WHITE = 0.5;

/** The longest step update() takes, in seconds; anything above is a hitch, not time to catch up on. */
export const MAX_DT = 0.05;

/**
 * The podium in game units, for framing and placing the kart: the radius of
 * its top (and of its foot, wider), and the height of the top surface, which
 * is where `turntable` sits (so the kart's wheels go at turntable y = 0).
 */
export const PODIUM = Object.freeze({ radius: 1.75 * STAGE_SCALE, foot: 1.88 * STAGE_SCALE, top: 0.22 * STAGE_SCALE });

/** The camera's far plane must reach past the sky dome, from wherever it stands: 90 template units, scaled. */
export const SKY_RADIUS = 90 * STAGE_SCALE;

/**
 * What each detail tier builds (PLAN 4.2 and 4.3). The tier names are
 * fabric.js's texture tiers: 'high' (desktop "détaillés"), 'phone'
 * ("détaillés" on a coarse pointer: the 'high' scene with half-size fabrics
 * and a 1024 shadow) and 'low' ("légers").
 */
export const STAGE_TIERS = Object.freeze({
  high: Object.freeze({ rows: 10, sky: [48, 24], rays: true, arc: 96, ledLines: false, shadow: 2048, cone: true, confetti: 240, drum: 96, ring: [10, 128], ground: 64, pool: 64, grad: 256 }),
  phone: Object.freeze({ rows: 10, sky: [48, 24], rays: true, arc: 96, ledLines: false, shadow: 1024, cone: true, confetti: 240, drum: 96, ring: [10, 128], ground: 64, pool: 64, grad: 256 }),
  low: Object.freeze({ rows: 6, sky: [32, 16], rays: false, arc: 64, ledLines: true, shadow: 0, cone: false, confetti: 80, drum: 64, ring: [6, 96], ground: 48, pool: 48, grad: 128 }),
});

// The hemicycle's layout, in template units (stage3d.js): the benches span
// SPAN radians behind the podium (centred on -z, the camera is on +z), tier
// k sits RISE higher and DEPTH further out than tier k - 1, from R0.
const SPAN = 2.5, R0 = 7.4, DEPTH = 0.95, RISE = 0.42, NOSE = 0.5, BACK = 0.45, SEAT_PITCH = 0.68;
/** The drifting confetti's depth range (template units): from the template's back (-5) to the podium's front edge, never nearer the camera. */
const CONFETTI_Z = [-5, 1.88];
/** The design's colours (sRGB), converted where they are used. */
const COL = {
  fog: 0x0c1230, ground: 0x0b1030, wood: 0x2e1d13, carpet: 0x171c40, led: GOLD, drum: 0x121a45, warm: 0xffd9a0,
  coneLight: 0xffe6c0, key: 0xfff0dc, top: 0xffe2b0, fill: 0x8095ff, sky: 0x7f8cff, earth: 0x1a0d10,
  confetti: [0x2f55c7, 0xfffaf0, 0xe63946, GOLD],
};
/**
 * The seats' velvet, tuned against 01-cs3 (stage 4 sheet). The template's
 * own (#8e1426 under a #ff6a78 sheen) comes out darker and flatter on r128,
 * whose sheen is one colour replacing the specular lobe (no sheenRoughness
 * spreading it): a slightly brighter base and a stronger, warmer sheen bring
 * the benches back to the design's crimson once fog and distance dim them.
 * Not stage 1's close-up swatch velvet (fabric.surfaceSpec), which is meant
 * for a jacket a metre from the camera and reads hot at bench distance.
 */
const VELVET = { color: 0x9c1b30, sheen: 1.15, sheenColor: 0xff7f8c, roughness: 0.8 };

// ---------- A seeded random stream (confetti), so a seed replays exactly ----------

/** mulberry32: a tiny, good-enough PRNG; returns a function giving [0, 1). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Geometry builders (template units) ----------
//
// The benches are arcs of radius r over [-SPAN/2, SPAN/2], the point at
// angle f being (r sin f, y, -r cos f). Each builder appends to a shared
// set of arrays, so all ten tiers of one part come out as one geometry.

const arcPoint = (r, f, y) => [r * Math.sin(f), y, -r * Math.cos(f)];

function parts() { return { pos: [], nrm: [], uv: [], idx: [] }; }
function geometryOf(p, uv = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nrm, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
  g.setIndex(p.idx);
  g.computeBoundingSphere();
  return g;
}

/** A vertical band of the arc at radius r, from y0 to y1, facing the centre (a riser's front, an LED strip). */
function arcWall(p, r, y0, y1, seg) {
  const base = p.pos.length / 3;
  for (let i = 0; i <= seg; i++) {
    const f = -SPAN / 2 + SPAN * i / seg, nx = -Math.sin(f), nz = Math.cos(f);
    for (const y of [y0, y1]) { p.pos.push(...arcPoint(r, f, y)); p.nrm.push(nx, 0, nz); p.uv.push(i / seg, y === y0 ? 0 : 1); }
  }
  for (let i = 0; i < seg; i++) { const a = base + i * 2; p.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
}

/** A flat annular sector from r0 to r1 at height y, facing up (a tread). */
function arcFloor(p, r0, r1, y, seg) {
  const base = p.pos.length / 3;
  for (let i = 0; i <= seg; i++) {
    const f = -SPAN / 2 + SPAN * i / seg;
    for (const r of [r0, r1]) { p.pos.push(...arcPoint(r, f, y)); p.nrm.push(0, 1, 0); p.uv.push(i / seg, r === r0 ? 0 : 1); }
  }
  for (let i = 0; i < seg; i++) { const a = base + i * 2; p.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
}

/** One quad: corner o, edges a and b, facing n (the winding follows n), uvs 0..1. */
function quad(p, o, a, b, n) {
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  if (cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0) [a, b] = [b, a];
  const base = p.pos.length / 3, at = (s, t) => [o[0] + a[0] * s + b[0] * t, o[1] + a[1] * s + b[1] * t, o[2] + a[2] * s + b[2] * t];
  for (const [s, t] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { p.pos.push(...at(s, t)); p.nrm.push(...n); p.uv.push(s, t); }
  p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** A box of size w x h x d at (cx, cy, cz) with only the faces listed ('+x', '-x', '+y', '-y', '+z', '-z'). */
function boxFaces(p, w, h, d, cx, cy, cz, faces) {
  const x = w / 2, y = h / 2, z = d / 2;
  const F = {
    '+x': [[cx + x, cy - y, cz - z], [0, 0, d], [0, h, 0], [1, 0, 0]],
    '-x': [[cx - x, cy - y, cz - z], [0, 0, d], [0, h, 0], [-1, 0, 0]],
    '+y': [[cx - x, cy + y, cz - z], [w, 0, 0], [0, 0, d], [0, 1, 0]],
    '-y': [[cx - x, cy - y, cz - z], [w, 0, 0], [0, 0, d], [0, -1, 0]],
    '+z': [[cx - x, cy - y, cz + z], [w, 0, 0], [0, h, 0], [0, 0, 1]],
    '-z': [[cx - x, cy - y, cz - z], [w, 0, 0], [0, h, 0], [0, 0, -1]],
  };
  for (const f of faces) quad(p, ...F[f]);
}

/**
 * One seat, cushion and back, as one geometry: the template's two boxes
 * (cushion 0.5 x 0.12 x 0.46 at 0.26 up; back 0.5 x 0.5 x 0.1 at 0.52 up,
 * 0.2 behind), local +z towards the podium. The faces nobody inside the
 * hemicycle can see (undersides, the rear of the cushion behind the back,
 * the rear of the back) are left out: 16 triangles a seat instead of 24.
 */
function seatGeometry() {
  const p = parts();
  boxFaces(p, 0.5, 0.12, 0.46, 0, 0.26, 0, ['+x', '-x', '+y', '+z']);
  boxFaces(p, 0.5, 0.5, 0.1, 0, 0.52, -0.2, ['+x', '-x', '+y', '+z']);
  return geometryOf(p, true);
}

/** The LED nosings of all tiers as line segments ("légers": no triangles at all). */
function arcLines(radii, seg) {
  const pos = [];
  for (const [r, y] of radii) for (let i = 0; i < seg; i++) {
    const f0 = -SPAN / 2 + SPAN * i / seg, f1 = -SPAN / 2 + SPAN * (i + 1) / seg;
    pos.push(...arcPoint(r, f0, y), ...arcPoint(r, f1, y));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  return g;
}

/** Where every seat of `rows` tiers stands: [x, y, z] on its tread, template units (the template's spacing). */
export function seatPositions(rows) {
  const out = [];
  for (let k = 0; k < rows; k++) {
    const R = R0 + k * DEPTH, y = k * RISE + RISE, n = Math.floor(R * SPAN / SEAT_PITCH);
    for (let i = 0; i < n; i++) { const f = -SPAN / 2 + 0.04 + (i + 0.5) / n * (SPAN - 0.08); out.push(arcPoint(R, f, y)); }
  }
  return out;
}

// ---------- Shaders and textures ----------

const SKY_VERTEX = 'varying vec3 vDir;\nvoid main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }';
// The template's sky, unchanged but for r128's chunk names (encodings_fragment
// is r152+'s colorspace_fragment), the rays behind a define, and the dimmed
// horizon glow of "légers" behind another.
const SKY_FRAGMENT = `uniform float uTime;
uniform vec3 uTint;
varying vec3 vDir;
float hash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
void main() {
	vec3 d = normalize( vDir ); float h = d.y;
	vec3 col = mix( vec3( 0.03, 0.045, 0.14 ), vec3( 0.008, 0.012, 0.045 ), smoothstep( 0.0, 0.75, h ) );
	col = mix( col, vec3( 0.006, 0.008, 0.03 ), smoothstep( 0.0, -0.3, h ) );
	float g = pow( max( dot( d, normalize( vec3( 0.0, 0.12, -1.0 ) ) ), 0.0 ), 5.0 );
#ifdef SKY_LOW_GLOW
	// "légers": the horizon right above the 6 tiers fades into the fog colour (linear #0c1230), like distant seats
	float lift = smoothstep( 0.04, 0.45, h );
	col = mix( vec3( 0.0037, 0.0060, 0.0296 ), col, lift );
	g *= SKY_LOW_GLOW * lift;
#endif
	col += uTint * g * 0.5;
#ifdef SKY_RAYS
	float a = atan( d.x, d.y );
	float rays = pow( 0.5 + 0.5 * sin( a * 16.0 + uTime * 0.12 ), 14.0 ) * pow( max( dot( d, normalize( vec3( 0.0, 0.25, -1.0 ) ) ), 0.0 ), 2.5 );
	col += mix( vec3( 1.0, 0.85, 0.55 ), uTint, 0.4 ) * rays * 0.16;
#endif
	vec3 q = floor( d * 220.0 ); float s = hash( q );
	col += step( 0.9975, s ) * 0.7 * ( 0.5 + 0.5 * sin( uTime * 1.7 + s * 80.0 ) ) * smoothstep( 0.1, 0.6, h );
	gl_FragColor = vec4( col, 1.0 );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
}`;

/** The template's white gradients: radial (the pool) or rising (the cone), sRGB, `size` px; blank headless. */
function gradient(radial, size) {
  const t = canvasTexture(size, size, (c, w, h) => {
    const g = radial ? c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2) : c.createLinearGradient(0, h, 0, 0);
    if (radial) { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
    else { g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,.35)'); g.addColorStop(0.97, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  t.name = radial ? 'stage:pool' : 'stage:cone';
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/**
 * The baked contact shadow under the kart on "légers" (no shadow map), as
 * fractions of the podium's radius across (x) and along (z, the kart's
 * length): the game kart is about 2.6 wide and 4.1 long.
 */
const CONTACT = [0.5, 0.78];

// ---------- The scene ----------

/**
 * Build the stage for a detail tier: 'high' | 'phone' | 'low' (fabric.js's
 * texture tiers; anything else is 'high'). Options: `renderer` (gives the
 * scene stagelook's image-based environment; leave it out headless),
 * `tint` (the starting tint, sRGB; gold by default) and `seed` (the
 * confetti's random stream: the same seed and the same updates give the
 * same confetti).
 *
 * Returns:
 * - `scene`: render it inside withLook(renderer, STAGE_LOOK, ...), with a
 *   camera whose far plane reaches past SKY_RADIUS.
 * - `turntable`: a Group whose origin is the podium's top surface. Add the
 *   kart to it and spin its rotation.y; the podium's top, foot and ring
 *   turn with it.
 * - `setTint(color, instant = false)`: ease the stage's tint towards an
 *   sRGB colour (or jump to it, for a portrait).
 * - `update(dt, t)`: advance by dt seconds (clamped to [0, MAX_DT]); t is
 *   the caller's stage clock for the periodic effects (sky rays, stars,
 *   confetti flutter), the module's own clamped clock when left out.
 * - `burst({ share = 0.5, lift = 1 })`: throw `share` of the confetti up
 *   from the podium, `lift` times as hard (the defaults: the "go" launch; a
 *   swap puffs a little of it).
 * - `dispose()`: free every geometry, material and texture built here (not
 *   the shared stagelook materials or fabric textures) and the key light's
 *   shadow map. The scene is unusable afterwards.
 * - `info()`: what the stage costs, counted headlessly (draws and
 *   triangles per frame, shadow pass included; lights; seats; confetti).
 */
export function buildStageScene(tier = 'high', { renderer = null, tint = GOLD, seed = 1 } = {}) {
  const T = STAGE_TIERS[tier] ? tier : 'high', C = STAGE_TIERS[T], S = STAGE_SCALE;
  const own = { geometries: [], materials: [], textures: [] };
  const geo = g => (own.geometries.push(g), g), mine = m => (own.materials.push(m), m), tex = t => (own.textures.push(t), t);
  const lit = spec => stageMat({ rim: false, ...spec }, T); // the hemicycle's own surfaces carry no rim term
  const mesh = (g, m, parent) => { const o = new THREE.Mesh(geo(g), m); parent.add(o); return o; };

  const scene = new THREE.Scene();
  scene.name = 'stage';
  scene.fog = new THREE.Fog(linear(COL.fog), 13 * S, 34 * S);
  if (renderer) scene.environment = stageEnvironment(renderer);
  /** Everything but the turntable, in template units. */
  const backdrop = new THREE.Group();
  backdrop.name = 'backdrop'; backdrop.scale.setScalar(S); scene.add(backdrop);

  // the tint, linear, eased towards `target` by update(); the rim term's uniform is RIM.color
  const target = linear(tint), cur = target.clone(), warm = linear(COL.warm), white = new THREE.Color(1, 1, 1);

  // sky
  const skyU = { uTime: { value: 0 }, uTint: { value: cur.clone() } };
  const skyMat = mine(new THREE.ShaderMaterial({ name: 'stage-sky', uniforms: skyU, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false, defines: C.rays ? { SKY_RAYS: 1 } : { SKY_LOW_GLOW: '0.6' } }));
  const sky = mesh(new THREE.SphereGeometry(90, C.sky[0], C.sky[1]), skyMat, backdrop);
  sky.name = 'sky'; sky.renderOrder = -1; sky.frustumCulled = false;

  // ground
  const ground = mesh(new THREE.CircleGeometry(60, C.ground), lit({ name: 'stage-ground', color: COL.ground, roughness: 0.62, metalness: 0.15 }), backdrop);
  ground.name = 'ground'; ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;

  // the hemicycle: every tier's riser, tread and strip merged per part
  const risers = parts(), treads = parts(), strips = parts(), noses = [];
  for (let k = 0; k < C.rows; k++) {
    const R = R0 + k * DEPTH, y = k * RISE;
    arcWall(risers, R - NOSE, y, y + RISE, C.arc);
    arcFloor(treads, R - NOSE, R + BACK, y + RISE, C.arc);
    // the template's strip is a 0.018 tube on the nosing: the same band, facing the podium, a hair in front of the riser
    if (!C.ledLines) arcWall(strips, R - NOSE - 0.012, y + RISE - 0.024, y + RISE + 0.012, C.arc);
    noses.push([R - NOSE - 0.012, y + RISE - 0.004]);
  }
  mesh(geometryOf(risers), lit({ name: 'stage-wood', color: COL.wood, roughness: 0.55, clearcoat: 0.3 }), backdrop).name = 'risers';
  mesh(geometryOf(treads), lit({ name: 'stage-carpet', color: COL.carpet, roughness: 0.95 }), backdrop).name = 'treads';
  const ledMat = mine(C.ledLines
    ? new THREE.LineBasicMaterial({ name: 'stage-led', color: linear(COL.led).multiplyScalar(1.6) })
    : new THREE.MeshBasicMaterial({ name: 'stage-led', color: linear(COL.led).multiplyScalar(1.6) }));
  const leds = C.ledLines ? new THREE.LineSegments(geo(arcLines(noses, C.arc)), ledMat) : new THREE.Mesh(geo(geometryOf(strips)), ledMat);
  leds.name = 'leds'; backdrop.add(leds);

  // the seats: one instance per seat, cushion and back in one geometry
  const seatsAt = seatPositions(C.rows);
  const velvet = lit({ name: 'stage-velvet', ...surfaceVelvet(T) });
  const seats = new THREE.InstancedMesh(geo(seatGeometry()), velvet, seatsAt.length);
  seats.name = 'seats'; seats.frustumCulled = false; // the instances span the hemicycle; the base geometry's bounds do not
  const dummy = new THREE.Object3D();
  seatsAt.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.lookAt(0, p[1], 0); dummy.updateMatrix(); seats.setMatrixAt(i, dummy.matrix); });
  seats.instanceMatrix.needsUpdate = true;
  backdrop.add(seats);

  // the podium: the turntable carries its top, drum and ring; the tint strip stays put at its foot
  const turntable = new THREE.Group();
  turntable.name = 'turntable'; turntable.position.y = PODIUM.top; scene.add(turntable);
  const drum = mesh(new THREE.CylinderGeometry(1.75 * S, 1.88 * S, 0.22 * S, C.drum, 1, true), lit({ name: 'stage-drum', color: COL.drum, metalness: 0.6, roughness: 0.35, clearcoat: 0.8 }), turntable);
  drum.name = 'drum'; drum.position.y = -0.11 * S; drum.castShadow = drum.receiveShadow = true;
  const floorMap = hemicycleFloor(T, T === 'low' ? { contact: CONTACT } : {});
  const top = mesh(new THREE.CircleGeometry(1.75 * S, C.drum), lit({ name: 'stage-podium-top', map: floorMap, roughness: 0.32, metalness: 0.2, clearcoat: 0.6 }), turntable);
  top.name = 'podium-top'; top.rotation.x = -Math.PI / 2; top.position.y = 0.001; top.receiveShadow = true;
  const ring = mesh(new THREE.TorusGeometry(1.74 * S, 0.035 * S, C.ring[0], C.ring[1]), lit({ name: 'stage-ring', color: GOLD, metalness: 1, roughness: 0.25 }), turntable);
  ring.name = 'ring'; ring.rotation.x = Math.PI / 2; ring.position.y = -0.005 * S;
  const stripMat = mine(new THREE.MeshBasicMaterial({ name: 'stage-strip', color: cur.clone().multiplyScalar(2.2) }));
  const strip = mesh(new THREE.CylinderGeometry(1.875, 1.875, 0.032, C.drum, 1, true), stripMat, backdrop);
  strip.name = 'strip'; strip.position.y = 0.04;

  // the light pool on the floor, and the cone of light above the podium
  const poolMat = mine(new THREE.MeshBasicMaterial({ name: 'stage-pool', map: tex(gradient(true, C.grad)), color: cur.clone().lerp(warm, 0.6), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
  const pool = mesh(new THREE.CircleGeometry(4.2, C.pool), poolMat, backdrop);
  pool.name = 'pool'; pool.rotation.x = -Math.PI / 2; pool.position.y = 0.006;
  if (C.cone) {
    const coneMat = mine(new THREE.MeshBasicMaterial({ name: 'stage-cone', map: tex(gradient(false, C.grad)), color: linear(COL.coneLight), transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    const cone = mesh(new THREE.ConeGeometry(2.3, 8, C.pool, 1, true), coneMat, backdrop);
    cone.name = 'cone'; cone.position.y = 4.1;
  }

  // the light rig: fixed for the life of the scene (see the header)
  const hemi = new THREE.HemisphereLight(linear(COL.sky), linear(COL.earth), 0.35);
  const key = new THREE.SpotLight(linear(COL.key), 3.4, 0, 0.48, 0.65, 0);
  key.name = 'key'; key.position.set(3.6, 7.5, 5.2); key.target.position.set(0, 1, 0);
  key.castShadow = C.shadow > 0;
  if (key.castShadow) {
    key.shadow.mapSize.set(C.shadow, C.shadow);
    key.shadow.camera.near = 3 * S; key.shadow.camera.far = 20 * S; // world units: the shadow camera ignores the group's scale
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  }
  const topSpot = new THREE.SpotLight(linear(COL.top), 2.2, 0, 0.42, 0.8, 0);
  topSpot.name = 'top'; topSpot.position.set(0, 9, 0.5); topSpot.target.position.set(0, 0, 0);
  const rim = new THREE.DirectionalLight(cur.clone(), 2.6);
  rim.name = 'rim'; rim.position.set(-4, 3.5, -5);
  const fill = new THREE.DirectionalLight(linear(COL.fill), 0.55);
  fill.name = 'fill'; fill.position.set(-5, 2, 4);
  backdrop.add(hemi, key, key.target, topSpot, topSpot.target, rim, rim.target, fill, fill.target);

  // confetti: the template's drift and burst, on a seeded stream. The template's drift fills a box
  // reaching 3 in front of the podium's centre; here it stops at the podium's front edge (1.88): a
  // piece falling between the podium and the camera is drawn largest, right where the showcase's
  // name and text sit over the canvas, and on a still stage it stays there, reading as a stray
  // glyph beside the name (stage 7's Garage shot). The burst still throws pieces forward.
  const N = C.confetti, rand = rng(seed);
  const driftZ = () => CONFETTI_Z[0] + rand() * (CONFETTI_Z[1] - CONFETTI_Z[0]);
  const confettiMat = lit({ name: 'stage-confetti', roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide });
  const confetti = new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(0.055, 0.1)), confettiMat, N);
  confetti.name = 'confetti'; confetti.frustumCulled = false;
  const cols = COL.confetti.map(linear);
  const bits = Array.from({ length: N }, (_, i) => {
    confetti.setColorAt(i, cols[i % cols.length]);
    return {
      p: new THREE.Vector3((rand() - 0.5) * 12, rand() * 9, driftZ()),
      v: new THREE.Vector3(0, -0.3 - rand() * 0.5, 0),
      r: new THREE.Euler(rand() * 6, rand() * 6, 0),
      s: 1 + rand() * 3,
    };
  });
  const respawn = b => { b.p.set((rand() - 0.5) * 12, 9, driftZ()); b.v.set(0, -0.3 - rand() * 0.5, 0); };
  const placeConfetti = () => {
    bits.forEach((b, i) => { dummy.position.copy(b.p); dummy.rotation.copy(b.r); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); confetti.setMatrixAt(i, dummy.matrix); });
    confetti.instanceMatrix.needsUpdate = true;
  };
  placeConfetti();
  backdrop.add(confetti);

  // ---------- behaviour ----------

  let clock = 0, disposed = false;

  /** Write the current tint everywhere it shows. */
  const applyTint = () => {
    RIM.color.value.copy(cur); // stagelook's rim term: every pilot material reads this uniform
    rim.color.copy(cur).lerp(white, RIM_LIGHT_WHITE);
    skyU.uTint.value.copy(cur);
    stripMat.color.copy(cur).multiplyScalar(2.2);
    poolMat.color.copy(cur).lerp(warm, 0.6);
  };
  applyTint();

  function setTint(color, instant = false) {
    target.copy(linear(color));
    if (instant) { cur.copy(target); applyTint(); }
  }

  function update(dt, t) {
    if (disposed) return;
    dt = dt > 0 ? Math.min(dt, MAX_DT) : 0; // NaN and negative steps are still frames (A.1)
    clock += dt;
    const time = Number.isFinite(t) ? t : clock;
    if (dt > 0) { cur.lerp(target, 1 - Math.pow(0.02, dt)); applyTint(); }
    skyU.uTime.value = time;
    const damp = Math.pow(0.985, dt * 60); // the template's 0.985 a frame, at 60 frames a second
    bits.forEach((b, i) => {
      if (b.v.y > -0.6) b.v.y -= dt * 3.2;
      b.v.x *= damp; b.v.z *= damp;
      b.p.addScaledVector(b.v, dt);
      b.p.x += Math.sin(time * b.s + i) * dt * 0.2;
      b.r.x += dt * b.s; b.r.y += dt * b.s * 0.7;
      if (b.p.y < 0) respawn(b);
    });
    placeConfetti();
  }

  function burst({ share = 0.5, lift = 1 } = {}) {
    const every = Math.max(1, Math.round(1 / Math.min(1, Math.max(share, 1e-3))));
    bits.forEach((b, i) => {
      if (i % every) return;
      b.p.set((rand() - 0.5) * 1.5, 1.2, (rand() - 0.5) * 1.5);
      b.v.set((rand() - 0.5) * 5 * lift, (3 + rand() * 4) * lift, (rand() - 0.5) * 5 * lift);
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const g of own.geometries) g.dispose();
    for (const m of own.materials) m.dispose();
    for (const t of own.textures) t.dispose();
    seats.dispose(); confetti.dispose();
    key.shadow.dispose();
    scene.environment = null;
    scene.clear();
  }

  function info() {
    let draws = 0, casters = 0, casterTris = 0, lights = 0;
    const visible = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    scene.traverse(o => {
      if (o.isLight) lights++;
      if (!(o.isMesh || o.isLine || o.isPoints) || !visible(o)) return;
      draws++;
      if (key.castShadow && o.castShadow) { casters++; casterTris += countTriangles(o); }
    });
    return {
      tier: T, rows: C.rows, seats: seatsAt.length, confetti: N, lights, shadow: key.castShadow ? C.shadow : 0,
      draws: draws + casters, casters, triangles: countTriangles(scene, true) + casterTris,
      ownGeometries: own.geometries.length, ownMaterials: own.materials.length, ownTextures: own.textures.length,
    };
  }

  return { scene, turntable, setTint, update, burst, dispose, info };
}

/** The seats' velvet spec on a tier: the wool maps (with normals on 'high' and 'phone') under VELVET's colour and sheen. */
function surfaceVelvet(tier) {
  const f = fabric('wool', tier);
  return f.normalMap ? { ...VELVET, map: f.map, normalMap: f.normalMap } : { ...VELVET, map: f.map };
}
