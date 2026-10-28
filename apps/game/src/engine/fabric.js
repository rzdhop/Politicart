// Procedural fabrics for the 3D select stage and the new pilots (PLAN 5.1).
//
// The design template's tileable textures, ported to r128 and extended: each
// kind is a height field from periodic value noise, from which an albedo and
// a normal map are baked, so wool shows its twill, corduroy its wales and a
// puffer its quilting under a moving light. The albedo is grey (it multiplies
// the material colour), except hi-vis, whose yellow and silver are the point.
// Pilots therefore share every texture: only the material colour differs.
//
// Rules this module keeps:
//
// - Everything is drawn through primitives.canvasTexture, so on the game
//   server and in Node tests (no document) each texture is a blank Texture
//   and no pixel is ever computed. The pixels themselves come from the pure
//   fabricPixels(), which tests can call directly.
// - Deterministic: hashed noise from a per-kind seed, never Math.random, so
//   the same kind, size and seed always give the same bytes.
// - Cached by (kind, size), never cleared, like primitives.mat(): pilots,
//   portraits and the hemicycle share one copy. Never clone a cached texture
//   to change its repeat: in r128 a clone is a second GPU upload.
// - Sized by texture tier (PLAN 4.2): 'high' bakes 512 px weaves with normal
//   maps and a 1024 floor; 'phone' ("détaillés" on a coarse pointer) halves
//   the fabrics; 'low' ("légers") halves them and drops the normal maps.
//   Kinds without fine structure (skin, tread, satin, hi-vis, fleece) are
//   authored at 256 for 'high', as the template's skin and tread already
//   were; that keeps every kind resident inside the 24 MB budget.
// - Fine weaves keep their size on screen at any resolution: below its
//   reference size a `fit` kind halves its frequencies and doubles its
//   repeat instead of aliasing into moiré.
import * as THREE from 'three';

import { canvasTexture } from './primitives.js';

const TAU = Math.PI * 2;

// ---------- Periodic value noise (the template's, unchanged) ----------

/** Integer hash to [0, 1). */
function h2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise on a px x py lattice that wraps, so it tiles. */
function vn(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const mx = a => ((a % px) + px) % px, my = a => ((a % py) + py) % py;
  const a = h2(mx(xi), my(yi), s), b = h2(mx(xi + 1), my(yi), s), c = h2(mx(xi), my(yi + 1), s), d = h2(mx(xi + 1), my(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Fractal noise in [0, 1], periodic in u and v with period 1 (px, py cells per tile at the base octave). */
export function fbm(u, v, px, py, oct = 4, s = 1) {
  let t = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += amp * vn(u * px * f, v * py * f, px * f, py * f, s + i); n += amp; f *= 2; amp *= 0.5; }
  return t / n;
}
/** A soft round bump (1 at the centre, 0 at radius r) at the centre of each cell of a grid, for knit holes and fleece pills. */
function cellBump(u, v, cu, cv, r, stagger, s, keep) {
  let x = u * cu, y = v * cv;
  const row = Math.floor(y);
  if (stagger && row % 2) x += 0.5;
  const ix = Math.floor(x), fx = x - ix - 0.5, fy = y - row - 0.5;
  if (keep < 1 && h2(((ix % cu) + cu) % cu, ((row % cv) + cv) % cv, s) > keep) return 0;
  const d = Math.hypot(fx, fy) / r;
  return d >= 1 ? 0 : 1 - d * d * (3 - 2 * d);
}
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------- The kinds ----------
//
// Each kind: `ref` its size on the 'high' tier, `repeat` per tile there,
// `strength` the normal-map slope at `ref`, `fit` whether it rescales below
// `ref` (see the header), and two functions of (u, v) in [0, 1): `height`
// in [0, 1] and `albedo` of (height, u, v), a grey level or [r, g, b] (sRGB,
// 0..1). Both get N, the noise context: N.f(n) is the frequency n rescaled
// to the baked size, N.s(n) the noise seed n offset by the bake's seed.

/** The two silver bands of a hi-vis tile, 0..1 across v. */
const hivisBand = v => smooth(0.28, 0.295, v) * (1 - smooth(0.385, 0.4, v)) + smooth(0.6, 0.615, v) * (1 - smooth(0.705, 0.72, v));

const KINDS = {
  // Worsted suiting: a 2/2 twill (diagonal ribs) whose yarns cross the ribs,
  // over a fibre fuzz. The template's wool, with the yarn crossing added.
  wool: { ref: 512, repeat: [5, 5], strength: 3.6, fit: true,
    height: (u, v, N) => {
      const rib = Math.sin((u * N.f(48) + v * N.f(48)) * TAU) * 0.5 + 0.5;
      const yarn = Math.sin((u * N.f(48) - v * N.f(48)) * TAU * 2) * 0.5 + 0.5;
      return rib * 0.5 + rib * yarn * 0.15 + fbm(u, v, N.f(32), N.f(32), 3, N.s(3)) * 0.35;
    },
    albedo: h => 0.82 + 0.18 * h },
  // Wide-wale corduroy: rounded ribs along v, a little pile noise.
  corduroy: { ref: 512, repeat: [3, 2], strength: 9, fit: true,
    height: (u, v, N) => Math.pow(Math.abs(Math.sin(u * Math.PI * N.f(30))), 0.6) * 0.85 + fbm(u, v, N.f(16), N.f(64), 3, N.s(7)) * 0.15,
    albedo: h => 0.6 + 0.4 * h },
  // A quilted down jacket: 8 baffles per tile, each a soft pillow pinched to
  // a stitched seam, with faint ripstop grain.
  puffer: { ref: 512, repeat: [1, 1], strength: 6, fit: false,
    height: (u, v, N) => {
      const b = Math.abs(Math.sin(v * Math.PI * 8));
      const rip = (Math.sin(u * TAU * 128) * Math.sin(v * TAU * 128) * 0.5 + 0.5) * 0.02;
      return Math.pow(b, 0.45) * (0.96 + 0.04 * fbm(u, v, 8, 8, 2, N.s(12))) + fbm(u, v, 64, 64, 2, N.s(11)) * 0.04 + rip;
    },
    albedo: h => 0.5 + 0.5 * h },
  // Satin (the judge's robe, ties, linings): long floats along u, almost
  // flat, the look is mostly the material's sheen; a faint drape mottle.
  satin: { ref: 256, repeat: [2, 2], strength: 1.2, fit: true,
    height: (u, v, N) => {
      const floats = Math.sin(u * TAU * N.f(128)) * 0.5 + 0.5;
      return fbm(u, v, 4, 4, 3, N.s(41)) * 0.6 + floats * (0.75 + 0.25 * fbm(u, v, N.f(8), N.f(64), 2, N.s(43))) * 0.4;
    },
    albedo: h => 0.9 + 0.1 * h },
  // A hi-vis vest: fluorescent yellow warp-knit mesh (staggered holes) with
  // two silver retro-reflective bands per tile. Coloured: use it with a
  // white material colour.
  hivis: { ref: 256, repeat: [4, 1], strength: 2.5, fit: false,
    height: (u, v, N) => {
      const b = hivisBand(v), knit = 1 - cellBump(u, v, 32, 32, 0.32, true, N.s(52), 1) * 0.6;
      return knit * 0.85 * (1 - b) + b * (0.7 + fbm(u, v, 96, 96, 1, N.s(53)) * 0.1) + fbm(u, v, 32, 32, 2, N.s(51)) * 0.1;
    },
    albedo: (h, u, v) => {
      const b = hivisBand(v), k = 0.8 + 0.2 * h, s = 0.74 + 0.12 * h;
      return [0.8 * k * (1 - b) + s * b, 0.97 * k * (1 - b) + s * b, 0.04 * k * (1 - b) + (s + 0.01) * b];
    } },
  // Ripstop nylon (capucine's jacket): a plain weave crossed every few
  // millimetres by thicker reinforcement threads, a square grid of 24 per
  // tile (about 5 mm at jacket scale, a little coarser so it reads on the
  // podium). The grid threads are slightly lighter, as on the real cloth.
  ripstop: { ref: 256, repeat: [4, 4], strength: 3, fit: true,
    height: (u, v, N) => {
      const g = N.f(24), d = (x) => { const f = x * g - Math.floor(x * g); return Math.min(f, 1 - f); }; // distance to the nearest grid thread, in cells
      const line = Math.max(1 - smooth(0.02, 0.075, d(u)), 1 - smooth(0.02, 0.075, d(v)));
      const weave = Math.sin(u * TAU * N.f(64)) * Math.sin(v * TAU * N.f(64)) * 0.5 + 0.5;
      return 0.3 + weave * 0.12 + line * 0.48 + fbm(u, v, N.f(16), N.f(16), 2, N.s(71)) * 0.1;
    },
    albedo: h => 0.84 + 0.16 * h },
  // Polar fleece: a soft fibre fuzz with scattered pills.
  fleece: { ref: 256, repeat: [3, 3], strength: 2.8, fit: true,
    height: (u, v, N) => fbm(u, v, N.f(24), N.f(24), 4, N.s(61)) * 0.6 + cellBump(u, v, N.f(40), N.f(40), 0.45, true, N.s(62), 0.55) * 0.3 + fbm(u, v, N.f(96), N.f(96), 1, N.s(63)) * 0.1,
    albedo: h => 0.84 + 0.16 * h },
  // Skin: pores and a slight warm/cool mottle (the template's).
  skin: { ref: 256, repeat: [2, 2], strength: 1.4, fit: false,
    height: (u, v, N) => 0.5 + (fbm(u, v, 40, 40, 4, N.s(17)) - 0.5) * 0.7,
    albedo: (h, u, v) => [0.95 + 0.05 * fbm(u, v, 6, 6, 3, 23), 0.9 + 0.07 * h, 0.9 + 0.06 * h] },
  // Hair: strands along v (the template's).
  hair: { ref: 512, repeat: [3, 1], strength: 3.5, fit: true,
    height: (u, v, N) => fbm(u, v, N.f(160), N.f(5), 3, N.s(31)),
    albedo: h => 0.5 + 0.5 * h },
  // Tyre tread: the template's chevron blocks, with softened edges so the
  // 128 px "légers" bake does not stair-step; no noise, so the seed changes nothing.
  tread: { ref: 256, repeat: [1, 1], strength: 9, fit: false,
    height: (u, v) => { const w = (u * 22 + Math.abs(v - 0.5) * 1.4) % 1; return smooth(0, 0.06, w) * (1 - smooth(0.47, 0.53, w)); },
    albedo: h => 0.75 + 0.25 * h },
};

/** The tileable fabric kinds fabric() knows. */
export const FABRICS = Object.freeze(Object.keys(KINDS));

/** The texture tiers (PLAN 4.2): the fabric scale against `ref`, the floor size, normal maps, anisotropy. */
export const TEX_TIERS = Object.freeze({
  high: Object.freeze({ scale: 1, floor: 1024, normals: true, anisotropy: 8, roundel: 128 }),
  phone: Object.freeze({ scale: 0.5, floor: 1024, normals: true, anisotropy: 4, roundel: 128 }),
  low: Object.freeze({ scale: 0.5, floor: 512, normals: false, anisotropy: 4, roundel: 64 }),
});

/** The texture tier for a detail level ('high' | 'low') and whether the pointer is coarse (a phone on "détaillés"). */
export const textureTier = (tier, coarse = false) => (tier === 'low' ? 'low' : coarse ? 'phone' : 'high');

const tierOf = t => TEX_TIERS[t] || TEX_TIERS.high;

/** The pixel size and repeat a kind bakes at on a texture tier. */
export function fabricSize(kind, tier = 'high') {
  const k = KINDS[kind];
  if (!k) throw new Error('fabric: unknown kind "' + kind + '"');
  const size = Math.max(32, Math.round(k.ref * tierOf(tier).scale));
  const f = k.fit ? size / k.ref : 1;
  return { size, repeat: [k.repeat[0] / f, k.repeat[1] / f] };
}

/**
 * The pixels of one fabric, pure: { albedo, normal } RGBA bytes (size x size,
 * row-major, top row first), or albedo only with `normals: false`. Same
 * kind, size and seed, same bytes. The normal map is the height field's
 * central-difference gradient, wrapped at the edges so it tiles, its slope
 * scaled to the kind's reference size so the relief reads the same at every
 * tier.
 */
export function fabricPixels(kind, size, { seed = 0, normals = true } = {}) {
  const k = KINDS[kind];
  if (!k) throw new Error('fabric: unknown kind "' + kind + '"');
  const f = k.fit ? size / k.ref : 1, shift = (seed | 0) * 1013;
  const N = { f: n => Math.max(1, Math.round(n * f)), s: n => n + shift };
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = k.height(x / size, y / size, N);
  const albedo = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    let a = k.albedo(H[i], x / size, y / size);
    if (typeof a === 'number') a = [a, a, a];
    albedo[i * 4] = a[0] * 255; albedo[i * 4 + 1] = a[1] * 255; albedo[i * 4 + 2] = a[2] * 255; albedo[i * 4 + 3] = 255;
  }
  if (!normals) return { albedo, normal: null };
  // a `fit` kind keeps its per-pixel relief when it rescales; any other kind
  // sampled coarser has steeper per-pixel steps, so its slope is scaled back
  const normal = new Uint8ClampedArray(size * size * 4), st = k.strength * (k.fit ? 1 : size / k.ref);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const dx = H[y * size + (x + 1) % size] - H[y * size + (x - 1 + size) % size];
    const dy = H[((y - 1 + size) % size) * size + x] - H[((y + 1) % size) * size + x];
    let nx = -dx * st, ny = -dy * st, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    normal[i * 4] = (nx * 0.5 + 0.5) * 255; normal[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; normal[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; normal[i * 4 + 3] = 255;
  }
  return { albedo, normal };
}

// ---------- Textures ----------

const cache = new Map();

/** Paint RGBA bytes into a canvas texture (blank headless: the bytes are never computed there). */
function pixelTexture(size, bytes) {
  return canvasTexture(size, size, c => { const img = c.createImageData(size, size); img.data.set(bytes()); c.putImageData(img, 0, 0); });
}
function dress(t, name, srgb, repeat, anisotropy) {
  t.name = name;
  t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
  t.anisotropy = anisotropy;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/**
 * One fabric's textures on a texture tier ('high' | 'phone' | 'low', see
 * textureTier): { map, normalMap }, normalMap null on 'low'. The map is
 * sRGB, the normal map linear; both tile with the kind's repeat. Cached by
 * (kind, size): two tiers with the same size share, and a normal map asked
 * for later is baked then.
 */
export function fabric(kind, tier = 'high') {
  const { size, repeat } = fabricSize(kind, tier), t = tierOf(tier), key = kind + ':' + size;
  let e = cache.get(key);
  if (!e) {
    let px = null;
    const pixels = () => px || (px = fabricPixels(kind, size, { normals: t.normals }));
    e = { map: dress(pixelTexture(size, () => pixels().albedo), 'fabric:' + key, true, repeat, t.anisotropy), normalMap: null };
    if (t.normals) e.normalMap = dress(pixelTexture(size, () => pixels().normal), 'fabric:' + key + ':normal', false, repeat, t.anisotropy);
    cache.set(key, e);
  } else if (t.normals && !e.normalMap) {
    e.normalMap = dress(pixelTexture(size, () => fabricPixels(kind, size).normal), 'fabric:' + key + ':normal', false, repeat, t.anisotropy);
  }
  return { map: e.map, normalMap: t.normals ? e.normalMap : null };
}

/** Horizontal stripes, `n` bands alternating a and b (the barrier arm, a scarf): 32 x 256, sRGB, cached. */
export function stripes(a = '#c8102e', b = '#f6f1e4', n = 12) {
  const key = 'stripes:' + a + ':' + b + ':' + n;
  if (!cache.has(key)) {
    cache.set(key, dress(canvasTexture(32, 256, (c, w, h) => { for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? b : a; c.fillRect(0, i * h / n, w, Math.ceil(h / n)); } }), key, true, null, 1));
  }
  return cache.get(key);
}

const css = c => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : String(c));

/**
 * The kart's number roundel: a cream disc, a ring and the number in the
 * kart colour, in the display font. Cached by (number, colour, size); 128 px
 * reads crisp at the stage's distance. Bake it after document.fonts has
 * loaded Lilita One, or the fallback face is what sticks.
 */
export function roundel(num, color, tier = 'high') {
  const S = tierOf(tier).roundel, col = css(color), key = 'roundel:' + num + ':' + col + ':' + S;
  if (!cache.has(key)) {
    cache.set(key, dress(canvasTexture(S, S, (c, w) => {
      const m = w / 2;
      c.fillStyle = '#f6f1e4'; c.beginPath(); c.arc(m, m, m * 0.97, 0, TAU); c.fill();
      c.lineWidth = w * 0.055; c.strokeStyle = col; c.beginPath(); c.arc(m, m, m * 0.84, 0, TAU); c.stroke();
      c.fillStyle = col; c.font = Math.round(w * 0.59) + 'px "Lilita One", "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(num), m, m * 1.09);
    }), key, true, null, tierOf(tier).anisotropy));
  }
  return cache.get(key);
}

/**
 * The podium top: the hemicycle's floor seen from above (a navy radial
 * gradient, gold arcs and spokes, a tricolore rim, a gold centre ring).
 * `contact` ([rx, rz], fractions of the radius) also bakes a soft contact
 * shadow under the kart, for "légers", which has no shadow map; its long
 * axis is the texture's v, which a CircleGeometry laid flat maps to world z,
 * the kart's length. Cached by (size, contact).
 */
export function hemicycleFloor(tier = 'high', { contact = null } = {}) {
  const S = tierOf(tier).floor, key = 'floor:' + S + (contact ? ':' + contact.join(',') : '');
  if (!cache.has(key)) {
    cache.set(key, dress(canvasTexture(S, S, c => {
      const m = S / 2, k = S / 1024;
      const g = c.createRadialGradient(m, m, 0, m, m, m);
      g.addColorStop(0, '#24317a'); g.addColorStop(0.7, '#121a45'); g.addColorStop(1, '#0a0f2a');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
      c.strokeStyle = 'rgba(242,193,78,.35)'; c.lineWidth = 3 * k;
      for (let r = 120 * k; r < m - 30 * k; r += 46 * k) {
        c.beginPath(); c.arc(m, m, r, Math.PI * 0.1, Math.PI * 0.9); c.stroke();
        c.beginPath(); c.arc(m, m, r, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
      }
      c.strokeStyle = 'rgba(242,193,78,.18)'; c.lineWidth = 2 * k;
      for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; c.beginPath(); c.moveTo(m + Math.cos(a) * 110 * k, m + Math.sin(a) * 110 * k); c.lineTo(m + Math.cos(a) * (m - 40 * k), m + Math.sin(a) * (m - 40 * k)); c.stroke(); }
      ['#2f55c7', '#fffaf0', '#e63946'].forEach((col, i) => { c.strokeStyle = col; c.lineWidth = 14 * k; c.beginPath(); c.arc(m, m, m - 22 * k, Math.PI * (0.5 + i * 0.6667), Math.PI * (0.5 + (i + 1) * 0.6667)); c.stroke(); });
      c.fillStyle = 'rgba(242,193,78,.9)'; c.beginPath(); c.arc(m, m, 96 * k, 0, TAU); c.fill();
      c.fillStyle = '#121a45'; c.beginPath(); c.arc(m, m, 84 * k, 0, TAU); c.fill();
      if (contact) {
        c.save(); c.translate(m, m); c.scale(contact[0], contact[1]);
        const sh = c.createRadialGradient(0, 0, 0, 0, 0, m);
        sh.addColorStop(0, 'rgba(2,3,12,.72)'); sh.addColorStop(0.55, 'rgba(2,3,12,.45)'); sh.addColorStop(1, 'rgba(2,3,12,0)');
        c.fillStyle = sh; c.beginPath(); c.arc(0, 0, m, 0, TAU); c.fill(); c.restore();
      }
    }), key, true, null, tierOf(tier).anisotropy));
  }
  return cache.get(key);
}

// ---------- Surfaces: the look-spec vocabulary as material specs ----------

/** The jacket fabrics LOOK3D may name (stage 2's vocabulary). */
export const CLOTHS = Object.freeze(['wool', 'corduroy', 'puffer', 'satin', 'hivis', 'fleece', 'cotton', 'velvet', 'ripstop']);
/** Every surface surfaceSpec() knows: the cloths, plus the pilot's and the kart's other materials. */
export const SURFACES = Object.freeze([...CLOTHS, 'skin', 'hair', 'paint', 'chrome', 'gold']);

/** An sRGB colour blended towards white by k, as an sRGB hex (the template's sheen colours). */
const lighter = (c, k) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();
/** The same hue, lifted in lightness: velvet's pile catches a brighter, still saturated sheen. */
const glow = (c, dl) => { const col = new THREE.Color(c), h = { h: 0, s: 0, l: 0 }; col.getHSL(h); return col.setHSL(h.h, h.s, Math.min(0.85, h.l + dl)).getHex(); };

/**
 * A material spec for stagelook's stageMat() (or phys()/std()), tuned on the
 * stage 1 swatch sheet: the surface's textures on the texture tier, its
 * roughness, sheen and clearcoat, and the authored colour. `tier` is a
 * texture tier ('high' | 'phone' | 'low'); give stageMat the detail tier.
 * Two notes: hi-vis carries its own colours, so its colour is white
 * whatever is passed; cotton is map-less (a shirt is smooth at this scale,
 * the template's shirt too), and velvet reuses the wool maps under a
 * strong sheen, as the template's seats do.
 */
export function surfaceSpec(surface, color, tier = 'high') {
  const tex = kind => fabric(kind, tier);
  switch (surface) {
    case 'wool': return { name: 'jacket-wool', color, ...tex('wool'), normalScale: 0.75, roughness: 0.86, sheen: 1, sheenColor: lighter(color, 0.45) };
    case 'corduroy': return { name: 'jacket-corduroy', color, ...tex('corduroy'), normalScale: 0.75, roughness: 0.86, sheen: 1, sheenColor: lighter(color, 0.45) };
    case 'puffer': return { name: 'jacket-puffer', color, ...tex('puffer'), normalScale: 1.1, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, sheen: 1, sheenColor: lighter(color, 0.45) };
    case 'satin': return { name: 'satin', color, ...tex('satin'), normalScale: 0.6, roughness: 0.3, sheen: 0.7, sheenColor: lighter(color, 0.5), clearcoat: 0.25, clearcoatRoughness: 0.35 };
    case 'hivis': return { name: 'hivis', color: 0xffffff, ...tex('hivis'), normalScale: 0.8, roughness: 0.55, sheen: 0.3, sheenColor: 0xffffff };
    case 'fleece': return { name: 'fleece', color, ...tex('fleece'), normalScale: 0.9, roughness: 0.95, sheen: 1, sheenColor: lighter(color, 0.5) };
    case 'cotton': return { name: 'cotton', color, roughness: 0.7, sheen: 0.6, sheenColor: 0xffffff };
    case 'velvet': return { name: 'velvet', color, ...tex('wool'), roughness: 0.8, sheen: 1, sheenColor: glow(color, 0.35) };
    case 'ripstop': return { name: 'ripstop', color, ...tex('ripstop'), normalScale: 0.8, roughness: 0.5, sheen: 0.5, sheenColor: lighter(color, 0.4), clearcoat: 0.15, clearcoatRoughness: 0.4 };
    case 'skin': return { name: 'skin', color, ...tex('skin'), normalScale: 0.35, roughness: 0.5, sheen: 0.5, sheenColor: 0xff8f70 };
    case 'hair': return { name: 'hair', color, ...tex('hair'), normalScale: 0.8, roughness: 0.5, sheen: 1, sheenColor: lighter(color, 0.5) };
    case 'paint': return { name: 'kart-paint', color, roughness: 0.3, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05 };
    case 'chrome': return { name: 'chrome', color: color == null ? 0xeceef2 : color, metalness: 1, roughness: 0.14 };
    case 'gold': return { name: 'gold', color: color == null ? 0xf2c14e : color, metalness: 1, roughness: 0.26 };
    default: throw new Error('fabric: unknown surface "' + surface + '"');
  }
}

// ---------- Memory ----------

const isPow2 = n => (n & (n - 1)) === 0;
/** GPU bytes one texture takes once uploaded: RGBA8, plus a third for its mip chain (power-of-two sizes). */
export function textureBytes(t) {
  const img = t && t.image;
  if (!img || !img.width || !img.height) return 0;
  const base = img.width * img.height * 4;
  return t.generateMipmaps && isPow2(img.width) && isPow2(img.height) && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter ? Math.round(base * 4 / 3) : base;
}

/** Every texture this module has made, and what they weigh on the GPU (0 headless: nothing is drawn there). */
export function fabricTextures() {
  const out = [];
  for (const e of cache.values()) {
    if (e.isTexture) out.push(e);
    else { out.push(e.map); if (e.normalMap) out.push(e.normalMap); }
  }
  return { textures: out, bytes: out.reduce((n, t) => n + textureBytes(t), 0) };
}
