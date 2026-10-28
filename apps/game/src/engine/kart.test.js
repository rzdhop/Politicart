// The kart mesh renders a kart style (kartstyle.js), headless as the server
// builds it (DEC-014). The userData parts are a contract with physics, which
// spins every wheel and steers wheels 0 and 1, so every variant must keep them.
import { createHash } from 'node:crypto';

import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { countMeshes, countTriangles, geometryTriangles } from './geo.js';
import { buildKart, PILOT_SCALE, RACE_LODS, raceLod, seatPilot, TEMPLATE_HIP } from './kart.js';
import { builtinStyle, defaultStyle, EXHAUSTS, MASTS, mergeStyle, NOSES, SKINS, SPOILERS, STICKERS, TRAILS, UNDERGLOWS, WHEELS } from './kartstyle.js';
import { resetMachine } from './machine.js';
import { framePayload } from './payload.js';
import { buildPilot, disposePilot, MOUNT, USERDATA_KEYS } from './pilot.js';
import { mat } from './primitives.js';
import { startField } from './race.js';
import { CFG, G, getPoly, togglePoly } from './state.js';

const victor = CHARACTERS.find(c => c.id === 'victor');
const style = partial => mergeStyle(builtinStyle(victor), partial);
const meshes = k => { const out = []; k.traverse(o => { if (o.isMesh) out.push(o); }); return out; };
const colours = k => new Set(meshes(k).map(m => m.material.color?.getHex()));
const named = (k, name) => k.children.filter(o => o.name === name);
/** What a kart is made of: one line per mesh (geometry, size, colour), sorted, so two karts compare by look alone. */
const signature = k => meshes(k).map(m => m.geometry.type + JSON.stringify(m.geometry.parameters) + (m.material.color?.getHex() ?? '') + (m.material.map ? 'map:' + m.material.map.name : '')).sort().join('|');
const tractor = CHARACTERS.find(c => c.tractor), cargo = CHARACTERS.find(c => c.cargo);

describe('buildKart', () => {
  it.each(CHARACTERS.map(c => [c.id, c]))('%s keeps the userData contract with its default style', (_id, c) => {
    const k = buildKart(c);
    expect(Object.keys(k.userData).sort()).toEqual(['anim', 'blades', 'bumpSparks', 'driver', 'ring', 'rotor', 'shield', 'sparks', 'trail', 'wheels']);
    expect(k.userData.wheels).toHaveLength(c.cargo ? 3 : 4);
    expect(named(k, 'plate')).toHaveLength(1);
    expect(k.userData.trail).toBeNull();
    expect(Array.isArray(k.userData.anim)).toBe(true);
  });

  it('defaults to the character default style', () => {
    expect(meshes(buildKart(victor)).length).toBe(meshes(buildKart(victor, defaultStyle(victor))).length);
    expect(colours(buildKart(victor)).has(victor.kart)).toBe(true);
  });

  it('paints the body and accent colours', () => {
    const c = colours(buildKart(victor, style({ body: '#ff0000', accent: '#00ff00' })));
    expect(c.has(0xff0000)).toBe(true);
    expect(c.has(0x00ff00)).toBe(true);
    expect(c.has(victor.kart)).toBe(false);
  });

  it.each(WHEELS)('keeps four wheels, front pair first, with %s wheels', wheels => {
    const w = buildKart(victor, style({ wheels })).userData.wheels;
    expect(w).toHaveLength(4);
    expect(w[0].position.z).toBeGreaterThan(0);
    expect(w[1].position.z).toBeGreaterThan(0);
    expect(w[2].position.z).toBeLessThan(0);
    expect(w[0].position.x).toBeLessThan(0);
    expect(w[1].position.x).toBeGreaterThan(0);
    for (const wheel of w) expect(wheel.position.y).toBeCloseTo(wheel.geometry.parameters.radiusTop);
  });

  it('builds a different look for each wheel style', () => {
    const hubs = WHEELS.map(wheels => buildKart(victor, style({ wheels })).userData.wheels[0].children[0].material.color.getHex());
    expect(new Set(hubs).size).toBe(WHEELS.length);
  });

  it('removes, keeps or enlarges the spoiler', () => {
    const count = Object.fromEntries(SPOILERS.map(spoiler => [spoiler, meshes(buildKart(victor, style({ spoiler }))).length]));
    expect(count.none).toBeLessThan(count.standard);
    expect(count.standard).toBeLessThan(count.wing);
  });

  it('drops the side pods when asked', () => {
    expect(meshes(buildKart(victor, style({ pods: false }))).length).toBe(meshes(buildKart(victor, style({ pods: true }))).length - 2);
  });

  it.each(CHARACTERS.filter(c => c.id === 'victor' || c.tractor || c.cargo).map(c => [c.id, c]))('puts one sticker on %s, none for "none"', (_id, c) => {
    const base = mergeStyle(builtinStyle(c));
    expect(named(buildKart(c, base), 'sticker')).toHaveLength(0);
    for (const sticker of STICKERS.filter(s => s !== 'none')) {
      expect(named(buildKart(c, { ...base, sticker }), 'sticker')).toHaveLength(1);
    }
  });

  it('keeps the big wing inside the Langue de bois shield ring', () => {
    const k = buildKart(victor, style({ spoiler: 'wing' }));
    const ring = k.userData.shield.geometry.parameters.radius;
    let reach = 0;
    k.traverse(o => { if (o.isMesh && o.geometry.parameters?.width === 2.3) reach = Math.hypot(o.geometry.parameters.width / 2, o.position.z); });
    expect(reach).toBeGreaterThan(0);
    expect(reach).toBeLessThan(ring);
  });

  it('builds with a race number without breaking the plate', () => {
    for (const number of [0, 7, 99]) expect(named(buildKart(victor, style({ number })), 'plate')).toHaveLength(1);
  });

  describe('the parts', () => {
    const options = { exhaust: EXHAUSTS, underglow: UNDERGLOWS, mast: MASTS, nose: NOSES, skin: SKINS };

    it.each(Object.keys(options))('every %s option builds a different kart', field => {
      const looks = options[field].map(v => signature(buildKart(victor, style({ [field]: v }))));
      expect(new Set(looks).size).toBe(options[field].length);
    });

    it.each(['exhaust', 'underglow', 'mast', 'skin'])('%s options reach the tractor and the cargo bike too', field => {
      for (const c of [tractor, cargo]) {
        const looks = options[field].map(v => signature(buildKart(c, mergeStyle(builtinStyle(c), { [field]: v }))));
        expect(new Set(looks).size).toBe(options[field].length);
      }
    });

    it('the nose is the standard kart\'s alone', () => {
      for (const c of [tractor, cargo]) {
        const looks = NOSES.map(v => signature(buildKart(c, mergeStyle(builtinStyle(c), { nose: v }))));
        expect(new Set(looks).size).toBe(1);
      }
    });

    it('animates the turbine, the rainbow and the flags, and nothing on a stock kart', () => {
      expect(buildKart(victor, style({}))).toHaveProperty('userData.anim', []);
      expect(buildKart(victor, style({ exhaust: 'turbine' })).userData.anim).toHaveLength(1);
      expect(buildKart(victor, style({ underglow: 'rainbow' })).userData.anim).toHaveLength(1);
      expect(buildKart(victor, style({ underglow: 'blue', mast: 'antenna' })).userData.anim).toHaveLength(0);
      for (const mast of ['tricolore', 'europe', 'pirate']) expect(buildKart(victor, style({ mast })).userData.anim).toHaveLength(1);
      const k = buildKart(victor, style({ exhaust: 'turbine', underglow: 'rainbow', mast: 'pirate' }));
      expect(k.userData.anim).toHaveLength(3);
      for (const f of k.userData.anim) { f(1 / 60, 1.5); f(1 / 60, 1.6, { boost: 1 }); }   // with and without a kart, as the turntable and the race call them
    });

    it('cycles the rainbow underglow', () => {
      const k = buildKart(victor, style({ underglow: 'rainbow' }));
      const glow = named(k, 'underglow')[0];
      const before = glow.material.color.getHex(); k.userData.anim[0](0.016, 1.0);
      expect(glow.material.color.getHex()).not.toBe(before);
      expect(glow.material.transparent).toBe(true);
      expect(named(buildKart(victor, style({ underglow: 'none' })), 'underglow')).toHaveLength(0);
    });

    const every = { exhaust: EXHAUSTS, underglow: UNDERGLOWS, mast: MASTS, nose: NOSES, skin: SKINS };
    it.each(Object.entries(every).flatMap(([f, vs]) => vs.map(v => [f, v])))('keeps four wheels, front pair first, with %s %s', (field, v) => {
      const w = buildKart(victor, style({ [field]: v })).userData.wheels;
      expect(w).toHaveLength(4);
      expect(w[0].position.z).toBeGreaterThan(0); expect(w[1].position.z).toBeGreaterThan(0);
      expect(w[2].position.z).toBeLessThan(0); expect(w[3].position.z).toBeLessThan(0);
      expect(w[0].position.x).toBeLessThan(0); expect(w[1].position.x).toBeGreaterThan(0);
    });

    it('keeps the ram spike inside the Langue de bois shield ring', () => {
      const k = buildKart(victor, style({ nose: 'ram' }));
      const ring = k.userData.shield.geometry.parameters.radius;
      const spike = meshes(k).find(m => m.geometry.type === 'ConeGeometry' && m.position.z > 1);
      expect(spike).toBeDefined();
      const tip = spike.position.z + spike.geometry.parameters.height / 2;
      expect(tip).toBeGreaterThan(2);
      expect(tip).toBeLessThan(ring);
    });

    it('paints a skin on the body boxes with one textured material, and leaves flat alone', () => {
      const bodyOf = k => meshes(k).filter(m => m.geometry.parameters?.width === 1.6 && m.geometry.parameters?.depth === 2.8)[0];
      expect(bodyOf(buildKart(victor, style({ skin: 'flat' }))).material.map).toBeFalsy();
      for (const skin of SKINS.filter(s => s !== 'flat')) {
        const k = buildKart(victor, style({ skin, spoiler: 'wing', pods: true }));
        const body = bodyOf(k);
        expect(body.material.map).toBeTruthy();
        const sharing = meshes(k).filter(m => m.material === body.material);
        expect(sharing.length).toBeGreaterThanOrEqual(5);     // body, nose, cowl, two pods, the wing blade
        expect(named(k, 'sticker')).toHaveLength(0);
      }
      expect(named(buildKart(victor, style({ skin: 'flames', sticker: 'rosette' })), 'sticker')).toHaveLength(1);   // the sticker stays on top
    });

    it('keeps the detail budget: at most 40 more meshes than the stock kart had, on either detail level', () => {
      const stock = meshes(buildKart(victor, style({}))).length;
      const max = meshes(buildKart(victor, style({ exhaust: 'quad', underglow: 'rainbow', mast: 'pirate', nose: 'bull', skin: 'camo', spoiler: 'wing' }))).length;
      expect(stock).toBeLessThanOrEqual(78 + 26);
      expect(max).toBeLessThanOrEqual(78 + 45);
    });
  });
});

// ---------- The race profile is the pre-change kart (stage 6), with the pilot (stage 8) ----------
// A fingerprint of everything a race kart is made of, in build order: every
// object (type, name, visibility, shadow flags, transform, parent), every
// mesh's geometry (type, parameters, triangle count, a checksum of its
// positions, shared instances), its material (type, colour, roughness,
// metalness, blending, opacity, side, map, shared instances, and whether it is
// the very primitives.mat() instance for its colour and roughness) and what
// each userData key points at. `apart(o)` leaves an object and its subtree
// out (a reference to it reads 'apart'). `vertices: false` leaves out what
// only built vertices hold (triangle count, position checksum), for the
// server's kart, whose meshes carry a geometry stub: type and parameters.
//
// RACE_GOLDEN holds the hashes of the race kart without its driver, taken
// from kart.js before the race pilot (stage 7's tip, 5167505), per candidate
// over a set of Garage styles and both detail levels: the driver subtree and
// the legacy driver's two harness straps are left out, everything else must
// come out the same. The straps are gone on purpose (they would sit inside
// the new pilot's chest). PILOT_GOLDEN pins the race pilot itself, per
// candidate and level of detail. The "légers" kart (race-low) is then folded
// into fewer draws (kart.js foldRaceLow, PLAN 4.2): its hashes were retaken
// then, every 'détaillés' (race-high) fingerprint staying the 5167505 one,
// and the race profile test below proves the folded kart paints the same.
const r5 = v => Math.round(v * 1e5) / 1e5;
function fingerprint(k, apart = () => false, ownAnim = () => true, { vertices = true } = {}) {
  const index = new Map(), geos = new Map(), mats = new Map(), lines = [];
  let tris = 0, count = 0;
  const walk = o => {
    if (apart(o)) return;
    index.set(o, index.size);
    const t = [o.type, o.name, o.visible ? 1 : 0, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0, o.renderOrder, o.rotation.order,
      ...o.position.toArray().map(r5), ...o.quaternion.toArray().map(r5), ...o.scale.toArray().map(r5), o.parent ? index.get(o.parent) ?? 'root' : -1];
    if (o.isMesh) {
      count++;
      const g = o.geometry;
      if (!geos.has(g)) geos.set(g, geos.size);
      let sum = 0, n = 0;
      if (vertices) {
        const p = g.attributes.position.array;
        for (let i = 0; i < p.length; i++) sum += p[i] * ((i % 3) * 2 + 1);
        n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n;
      }
      const m = o.material;
      if (!mats.has(m)) mats.set(m, mats.size);
      const isMat = m.type === 'MeshStandardMaterial' && !m.map && m === mat(m.color.getHex(), m.roughness);
      t.push('geo', geos.get(g), g.type, JSON.stringify(g.parameters ?? null), n, r5(sum),
        'mat', mats.get(m), m.type, m.color ? m.color.getHex() : '', r5(m.roughness ?? -1), r5(m.metalness ?? -1), m.transparent ? 1 : 0, r5(m.opacity),
        m.blending, m.side, m.depthWrite ? 1 : 0, m.map ? 'map:' + m.map.name : '', isMat ? 'mat()' : '', m.vertexColors ? 'vc' : '', m.flatShading ? 'flat' : '');
    }
    lines.push(t.join(','));
    o.children.forEach(walk);
  };
  walk(k);
  const ref = x => (x && x.isObject3D ? index.get(x) ?? 'apart' : typeof x === 'function' ? 'fn' : x === null ? 'null' : typeof x);
  lines.push('userData:' + Object.keys(k.userData).sort().map(key => { const v = k.userData[key]; return key + '=' + (Array.isArray(v) ? '[' + (key === 'anim' ? v.filter(ownAnim) : v).map(ref).join(' ') + ']' : ref(v)); }).join(';'));
  return { meshes: count, tris, text: lines.join('\n') };
}
const sha = s => createHash('sha1').update(s).digest('hex').slice(0, 16);
/** The legacy driver's harness straps (kart.js addDetail): the race kart dropped them with the legacy driver. */
const isStrap = o => o.isMesh && o.geometry.type === 'BoxGeometry' && o.material.color?.getHex() === 0xc8102e
  && JSON.stringify(o.geometry.parameters) === JSON.stringify({ width: 0.1, height: 0.5, depth: 0.04, widthSegments: 1, heightSegments: 1, depthSegments: 1 });
/** Everything but the driver (and the legacy straps): the kart's own anim functions, the ones the pilot brought apart. */
const kartPart = (k, opts) => fingerprint(k, o => o === k.userData.driver || isStrap(o), f => !k.userData.driver.userData.anim?.includes(f), opts);
/**
 * What a kart draws, whatever it is cut into: its visible triangles (the
 * driver's aside) in world space, grouped by what paints them (material
 * type, finish, blending, map, and the colour, the material's times the
 * vertex colour). Per group: the triangle count, the area, its first and
 * second moments (where the triangles are and how they spread), and how
 * well each triangle's winding agrees with its vertex normals (which side
 * it faces, and how it is lit). Two karts with the same look paint the
 * same picture; compared with a tolerance, since a merge bakes transforms.
 */
function look(k) {
  k.updateMatrixWorld(true);
  const out = new Map(), nm = new THREE.Matrix3(), col = new THREE.Color(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const walk = o => {
    if (!o.visible || o === k.userData.driver) return;
    if (o.isMesh) {
      const m = o.material, g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, vc = m.vertexColors ? g.attributes.color : null;
      nm.getNormalMatrix(o.matrixWorld);
      const total = g.index ? g.index.count : pos.count, at = g.index ? i => g.index.getX(i) : i => i;
      for (let t = g.drawRange.start; t + 2 < Math.min(total, g.drawRange.start + g.drawRange.count); t += 3) {
        const [i0, i1, i2] = [at(t), at(t + 1), at(t + 2)];
        col.copy(m.color); if (vc) col.multiply(new THREE.Color(vc.getX(i0), vc.getY(i0), vc.getZ(i0)));
        const key = [m.type, r5(m.roughness ?? -1), r5(m.metalness ?? -1), m.side, m.transparent ? 1 : 0, r5(m.opacity), m.blending, m.depthWrite ? 1 : 0, m.map ? 'map:' + m.map.name : '', col.getHexString()].join(',');
        a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
        const face = e1.subVectors(b, a).cross(e2.subVectors(c, a)), area = face.length() / 2;
        n.set(0, 0, 0); for (const i of [i0, i1, i2]) n.add(e2.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize());
        const s = out.get(key) ?? out.set(key, [0, 0, 0, 0, 0, 0, 0, 0, 0]).get(key), cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
        s[0]++; s[1] += area; s[2] += area * cx; s[3] += area * cy; s[4] += area * cz; s[5] += area * cx * cx; s[6] += area * cy * cy; s[7] += area * cz * cz; s[8] += face.dot(n) / 6;
      }
    }
    o.children.forEach(walk);
  };
  walk(k);
  return out;
}
/** Two looks are the same: the same groups, the same counts, the same areas and moments (to 1e-6, relatively). */
function sameLook(x, y, name) {
  expect([...x.keys()].sort(), name).toEqual([...y.keys()].sort());
  for (const [key, s] of x) { const t = y.get(key); expect(t[0], name + ' ' + key).toBe(s[0]); s.slice(1).forEach((v, i) => expect(Math.abs(v - t[i + 1]), name + ' ' + key + ' #' + (i + 1)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(v)))); }
}
/** Every BufferGeometry under an object, each counted once. */
const geometries = o => { const out = new Set(); o.traverse(m => { if (m.geometry?.isBufferGeometry) out.add(m.geometry); }); return out.size; };

/** The four Garage presets of the visual sheet (over the built-in style). */
const PRESETS = {
  stock: {},
  podium: { wheels: 'chrome', spoiler: 'wing', sticker: 'tricolore', number: 7 },
  rare: { wheels: 'gold', exhaust: 'quad', nose: 'bull', skin: 'stripes', sticker: 'marianne', mast: 'europe', underglow: 'blue', number: 12, accent: '#f2c14e' },
  incredible: { wheels: 'offroad', spoiler: 'wing', sticker: 'etoile', exhaust: 'turbine', underglow: 'rainbow', mast: 'pirate', nose: 'ram', skin: 'flames', trail: 'laser', number: 99 },
};
/** Every option of every Garage field (colours aside). */
const OPTIONS = { wheels: WHEELS, spoiler: SPOILERS, sticker: STICKERS, exhaust: EXHAUSTS, underglow: UNDERGLOWS, mast: MASTS, nose: NOSES, skin: SKINS, trail: TRAILS, pods: [true, false], number: [null, 0, 7, 99] };
/** The styles a candidate is fingerprinted with: the default, the presets, a recolour, and on the three bodies every option of every field. */
function stylesOf(c) {
  const base = mergeStyle(builtinStyle(c));
  const out = [['default', defaultStyle(c)], ...Object.entries(PRESETS).map(([n, p]) => [n, { ...base, ...p }]), ['colours', { ...base, body: '#abcdef', accent: '#123456' }]];
  if (c.id === 'victor' || c.tractor || c.cargo) for (const [f, vs] of Object.entries(OPTIONS)) for (const v of vs) out.push([f + ':' + v, { ...base, [f]: v }]);
  return out;
}
const withPoly = (level, fn) => { if (getPoly() !== level) togglePoly(); try { return fn(); } finally { if (getPoly() !== 'high') togglePoly(); } };
/** One hash per candidate (its styles and a livery, on both detail levels), with the default kart's size on 'high' in the clear. */
function raceFingerprints(build, print = kartPart) {
  const out = {};
  for (const c of CHARACTERS) {
    const parts = []; let size = '';
    for (const level of ['high', 'low']) withPoly(level, () => {
      for (const [name, s] of stylesOf(c)) {
        const f = print(build(c, s)); parts.push(level + '/' + name + '\n' + f.text);
        if (level === 'high' && name === 'default') size = f.meshes + ' meshes ' + f.tris + ' tris';
      }
      parts.push(level + '/livery\n' + print(build({ ...c, livery: 'data:image/png;base64,AAAA' }, { ...mergeStyle(builtinStyle(c)), spoiler: 'wing' })).text);
    });
    out[c.id] = size + ' #' + sha(parts.join('\n\n'));
  }
  return out;
}
const RACE_GOLDEN = {
  aymeric: '62 meshes 3810 tris #046a267e6c0674e1',
  bernadette: '62 meshes 3810 tris #957f1b14811ce57b',
  capucine: '41 meshes 4594 tris #7ed2ddcf18eb4b85',
  gaspard: '62 meshes 3810 tris #6de45f9e263f4a37',
  gege: '62 meshes 3810 tris #5e37976e51092d0b',
  hubert: '62 meshes 3810 tris #af5284e3794367ea',
  jeanmi: '62 meshes 3810 tris #a1c4b42b4fcc8f73',
  kevin: '62 meshes 3810 tris #68468219715e5b01',
  lucie: '62 meshes 3810 tris #39f12552959bc087',
  lulu: '62 meshes 3810 tris #55782eef4d37f8f5',
  martine: '62 meshes 3810 tris #bfc674c927383009',
  maurice: '62 meshes 3810 tris #4346ab12eb69e731',
  odile: '62 meshes 3810 tris #c762b287e5e5728f',
  patrick: '50 meshes 2078 tris #6ad362a4e7c55ae6',
  thierry: '62 meshes 3810 tris #4e83de8a3cc04410',
  victor: '62 meshes 3810 tris #5da2a91b8afa7ebb',
};
/** Per candidate: each race level's meshes/triangles, and one hash of both pilots' fingerprints. */
const PILOT_GOLDEN = {
  aymeric: 'race-high 2/4968 race-low 1/1655 #dc7f883d155948cf',
  bernadette: 'race-high 2/5549 race-low 1/1698 #c4d09b88863af222',
  capucine: 'race-high 2/4378 race-low 1/1779 #8af2c18ee3a49135',
  gaspard: 'race-high 2/4818 race-low 1/1874 #0e31506be2133781',
  gege: 'race-high 2/4952 race-low 1/2046 #6bec43996a4f9d49',
  hubert: 'race-high 2/4570 race-low 1/1745 #9d73c45bcae78b1f',
  jeanmi: 'race-high 2/4348 race-low 1/1601 #30d9a0b95edb97a3',
  kevin: 'race-high 2/4850 race-low 1/1760 #882aff372b4ee0e6',
  lucie: 'race-high 2/4496 race-low 1/1755 #0c8f3cfb4590a96e',
  lulu: 'race-high 2/4496 race-low 1/1582 #1977ad5b9781ddcf',
  martine: 'race-high 3/4466 race-low 2/1844 #0d6e39783ce51bec',
  maurice: 'race-high 2/5084 race-low 1/1975 #19db5ed62e47611a',
  odile: 'race-high 2/4694 race-low 1/1911 #260f57eb8ee5a59c',
  patrick: 'race-high 2/4700 race-low 1/2088 #10de9f2d199a36b0',
  thierry: 'race-high 3/4448 race-low 2/1687 #15706804c767e268',
  victor: 'race-high 2/4350 race-low 1/1623 #e99cac7caa8ed73d',
};
const LOD_OF = { high: 'race-high', low: 'race-low' };
/** The race kart as a browser builds it on the current detail level. */
const raceKart = (c, s, opts = {}) => buildKart(c, s, { lod: LOD_OF[getPoly()], ...opts });

describe('the race profile', () => {
  it('is the pre-change kart but for its driver: same meshes, geometries, mat() instances and userData, for every candidate and Garage style', () => {
    expect(raceFingerprints(raceKart)).toEqual(RACE_GOLDEN);
  }, 120000);

  // The same kart under every race level of detail, cut differently (PLAN 4.2, R6). Before, the three levels built
  // the same kart part for part, vertex for vertex. Now:
  // - The server's kart (lod 'headless', DEC-014) builds no geometry: each of its meshes carries a stub holding its
  //   geometry's type and parameters. Everything else is race-high's: the same objects in the same tree, with the
  //   same transforms, rotation orders, visibility, shadow flags and materials, the same geometry sharing, the wheels
  //   in the same order, every userData key on the same node, the driver (the headless pilot) in the same place.
  // - "Légers" (race-low) folds the kart into fewer draws: it paints the same triangles in the same colours and
  //   finishes as race-high (look()), before and after its parts animate, and every userData target is the same
  //   kind of object at the same place in the world, the wheels in the same order, in at most half the draws.
  // RACE_GOLDEN pins both browser levels' kart as drawn. Every candidate and Garage style, on both detail levels.
  it('is the same kart under every race level of detail: the same look in fewer draws on "légers", without a single geometry on the server', () => {
    const place = (k, o) => [k.children.indexOf(o), ...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray(), o.rotation.order];
    const targets = k => { const u = k.userData; return [...u.wheels, ...u.sparks, u.ring, u.rotor, ...u.blades, u.bumpSparks, u.shield, u.driver]; };
    const world = o => [o.type, o.visible, o.rotation.order, ...o.matrixWorld.elements.map(v => Math.round(v * 1e6) / 1e6)];
    const draws = k => countMeshes(k, true) - countMeshes(k.userData.driver, true);
    const check = (c, s, name, opts = {}) => {
      const [high, low, server] = ['race-high', 'race-low', 'headless'].map(lod => buildKart(c, s, { lod, ...opts }));
      sameLook(look(low), look(high), name);
      expect(Object.keys(low.userData).sort(), name).toEqual(KEYS);
      expect(targets(low).map(world), name).toEqual(targets(high).map(world));
      expect(low.userData.wheels.map(w => w.geometry.parameters), name).toEqual(high.userData.wheels.map(w => w.geometry.parameters));
      expect(low.userData.anim.length, name).toBe(high.userData.anim.length);
      expect(named(low, 'plate'), name).toHaveLength(1);
      expect(named(low, 'sticker').length, name).toBe(named(high, 'sticker').length);
      expect(draws(low), name).toBeLessThanOrEqual(draws(high) / 2);
      expect(kartPart(server, { vertices: false }).text, name).toBe(kartPart(high, { vertices: false }).text);
      for (const k of [high, low]) for (const f of k.userData.anim) { f(1 / 60, 1.3); f(1 / 60, 2.1, { boost: 1 }); }
      sameLook(look(low), look(high), name + ' animated');
      expect(geometries(server), name).toBe(0);
      expect(geometries(high), name).toBeGreaterThan(20);
      expect(place(server, server.userData.driver), name).toEqual(place(high, high.userData.driver));
      expect(server.userData.wheels.map(w => w.geometry.parameters), name).toEqual(high.userData.wheels.map(w => w.geometry.parameters));
      for (const lod of [high, low]) if (lod.userData.driver.userData.lod) disposePilot(lod.userData.driver);
    };
    for (const c of CHARACTERS) for (const level of ['high', 'low']) withPoly(level, () => {
      for (const [name, s] of stylesOf(c)) check(c, s, c.id + ' ' + level + '/' + name);
      check({ ...c, livery: 'data:image/png;base64,AAAA' }, { ...mergeStyle(builtinStyle(c)), spoiler: 'wing' }, c.id + ' ' + level + '/livery');
    });
    // the empty-seat kart (pilot: false), with and without its own steering, the same way
    for (const c of BODIES) for (const steering of [true, false]) check(c, defaultStyle(c), c.id + ' seat ' + steering, { pilot: false, steering });
  }, 120000);

  it('pins the race pilot of every candidate on both levels, whatever the kart style', () => {
    const out = {};
    for (const c of CHARACTERS) {
      const prints = ['race-high', 'race-low'].map(lod => { const d = buildKart(c, defaultStyle(c), { lod }).userData.driver; const f = fingerprint(d); return { lod, f }; });
      out[c.id] = prints.map(({ lod, f }) => lod + ' ' + f.meshes + '/' + f.tris).join(' ') + ' #' + sha(prints.map(p => p.f.text).join('\n\n'));
      // the pilot depends on the candidate alone: a Garage style changes the kart, never who drives it
      for (const p of Object.values(PRESETS)) expect(fingerprint(buildKart(c, mergeStyle(builtinStyle(c), p), { lod: 'race-low' }).userData.driver).text).toBe(prints[1].f.text);
    }
    expect(out).toEqual(PILOT_GOLDEN);
  }, 60000);
});

// ---------- The stage profile (stage 6) ----------
const stageKart = (c, s, opts = {}) => buildKart(c, s, { profile: 'stage', ...opts });
const visibleMeshes = k => { const out = []; const walk = o => { if (!o.visible) return; if (o.isMesh) out.push(o); o.children.forEach(walk); }; walk(k); return out; };
const BODIES = [victor, tractor, cargo];
const KEYS = ['anim', 'blades', 'bumpSparks', 'driver', 'ring', 'rotor', 'shield', 'sparks', 'trail', 'wheels'];
/** Every single-field Garage variant of a body's built-in style, colours and numbers included. */
const variants = c => [['builtin', {}], ['colours', { body: '#abcdef', accent: '#123456' }], ...Object.entries(OPTIONS).flatMap(([f, vs]) => vs.map(v => [f + ':' + v, { [f]: v }])), ...Object.entries(PRESETS)]
  .map(([n, p]) => [n, mergeStyle(builtinStyle(c), p)]);
/** What a merged stage kart looks like, for telling options apart: its materials and every mesh's triangles and place. */
const stageLook = k => visibleMeshes(k).map(m => (m.material.userData.key ?? m.material.uuid) + ':' + geometryTriangles(m.geometry) + '@' + m.getWorldPosition(new THREE.Vector3()).toArray().map(v => v.toFixed(3))).sort().join('|');

describe('the stage profile', () => {
  it.each(BODIES.map(c => [c.id, c]))('%s keeps the 10 userData keys, with and without the pilot, on both tiers', (_id, c) => {
    for (const pilot of [true, false]) for (const tier of ['high', 'low']) {
      const k = stageKart(c, defaultStyle(c), { pilot, tier });
      expect(Object.keys(k.userData).sort()).toEqual(KEYS);
      expect(k.userData.trail).toBeNull();
      expect(k.userData.wheels).toHaveLength(c.cargo ? 3 : 4);
      expect(named(k, 'plate')).toHaveLength(1);
      // what userData points at survived the merge, in the kart
      for (const o of [...k.userData.wheels, ...k.userData.sparks, k.userData.ring, k.userData.driver, k.userData.rotor, ...k.userData.blades, k.userData.bumpSparks, k.userData.shield]) {
        let p = o; while (p.parent) p = p.parent;
        expect(p).toBe(k);
      }
    }
  });

  it.each(BODIES.map(c => [c.id, c]))('%s keeps its wheels in order, front pair first, for every Garage variant', (_id, c) => {
    for (const [, s] of variants(c)) {
      const w = stageKart(c, s).userData.wheels;
      expect(w).toHaveLength(c.cargo ? 3 : 4);
      expect(w[0].position.z).toBeGreaterThan(0); expect(w[1].position.z).toBeGreaterThan(0);
      expect(w[0].position.x).toBeLessThan(0); expect(w[1].position.x).toBeGreaterThan(0);
      for (const wheel of w.slice(2)) expect(wheel.position.z).toBeLessThan(0);
      for (const wheel of w) { expect(wheel.rotation.order).toBe('YXZ'); expect(wheel.parent).toBe(w[0].parent); }
      if (!c.tractor && !c.cargo) for (const wheel of w) { wheel.geometry.computeBoundingBox(); expect(wheel.position.y).toBeCloseTo(-wheel.geometry.boundingBox.min.y, 2); }   // tyres on the ground
    }
  }, 60000);

  it('builds every Garage option on every body under both profiles, on both tiers', () => {
    for (const c of BODIES) for (const [n, s] of variants(c)) for (const tier of ['high', 'low']) withPoly(tier, () => {
      expect(() => buildKart(c, s)).not.toThrow();
      // the pilot changes nothing in the kart's parts: the legacy driver is built for the built-in style alone
      for (const pilot of n === 'builtin' ? [true, false] : [false]) expect(visibleMeshes(stageKart(c, s, { pilot, tier })).length).toBeGreaterThan(5);
    });
  }, 60000);

  it.each(['wheels', 'spoiler', 'sticker', 'exhaust', 'underglow', 'mast', 'nose', 'skin', 'pods', 'number'])('every %s option builds a different stage kart', field => {
    const looks = OPTIONS[field].map(v => stageLook(stageKart(victor, style({ [field]: v }))));
    expect(new Set(looks).size).toBe(OPTIONS[field].length);
  });

  it.each(['exhaust', 'underglow', 'mast', 'skin', 'wheels'])('%s options reach the stage tractor and cargo bike too', field => {
    for (const c of [tractor, cargo]) {
      const looks = OPTIONS[field].map(v => stageLook(stageKart(c, mergeStyle(builtinStyle(c), { [field]: v }))));
      // the tractor and the cargo bike have their own wheels, whatever the style says, as in the race
      expect(new Set(looks).size).toBe(field === 'wheels' ? 1 : OPTIONS[field].length);
    }
  });

  it('draws the race profile with mat() instances and the stage profile never with one', () => {
    for (const c of BODIES) for (const [, s] of variants(c)) {
      for (const m of meshes(buildKart(c, s))) {
        const mt = m.material;
        if (mt.type === 'MeshStandardMaterial' && !mt.map) expect(mt).toBe(mat(mt.color.getHex(), mt.roughness));
        else expect(['MeshBasicMaterial', 'MeshStandardMaterial']).toContain(mt.type);   // the race's own basic glows, and the skinned body
        expect(mt.userData.stage).toBeUndefined();
      }
      for (const tier of ['high', 'low']) for (const m of meshes(stageKart(c, s, { tier, pilot: false }))) {
        const mt = m.material;
        expect(mt.userData.stage).toBe(tier === 'low' ? 'std' : 'phys');
        expect(mt.type).toBe(tier === 'low' ? 'MeshStandardMaterial' : 'MeshPhysicalMaterial');
        if (mt.type === 'MeshStandardMaterial') expect(mt).not.toBe(mat(mt.color.getHex(), mt.roughness));
      }
    }
    for (const c of CHARACTERS) for (const tier of ['high', 'low']) for (const m of meshes(stageKart(c, defaultStyle(c), { tier }))) {   // every candidate's restaged driver
      expect(m.material.userData.stage).toBe(tier === 'low' ? 'std' : 'phys');
    }
  }, 60000);

  it('paints the stage kart like the design: clearcoat paint, chrome, leather, tread tyres', () => {
    const k = stageKart(victor, style({ wheels: 'chrome' }), { pilot: false });
    const byName = n => visibleMeshes(k).filter(m => m.material.name === n);
    expect(byName('kart-paint')[0].material.clearcoat).toBe(1);
    expect(byName('chrome').length).toBeGreaterThan(0);
    expect(byName('seat-leather').length).toBe(1);
    for (const w of k.userData.wheels) { expect(w.material.name).toBe('tire-rubber'); expect(w.material.map.name).toMatch(/^fabric:tread/); }
    expect(k.userData.wheels[0].children.map(m => m.material.name)).toEqual(expect.arrayContaining(['rim-alloy', 'dark-metal', 'gold']));   // the spoked chrome rim
  });

  it('borrows the tricolore wing for a wing with the tricolore sticker, and a number roundel for a number', () => {
    const names = k => visibleMeshes(k).map(m => m.material.name);
    expect(names(stageKart(victor, style({ spoiler: 'wing', sticker: 'tricolore' }))).filter(n => n === 'tricolore')).toHaveLength(3);
    expect(names(stageKart(victor, style({ spoiler: 'wing', sticker: 'rosette' })))).not.toContain('tricolore');
    expect(names(stageKart(victor, style({ spoiler: 'standard', sticker: 'tricolore' })))).not.toContain('tricolore');
    expect(names(stageKart(victor, style({ number: 7 })))).toContain('number-plate');
    expect(names(stageKart(victor, style({ number: null })))).not.toContain('number-plate');
    for (const c of [tractor, cargo]) expect(names(stageKart(c, mergeStyle(builtinStyle(c), { number: 3 })))).toContain('number-plate');
  });

  it('maps the Garage skin on the hull and keeps one sticker on top', () => {
    for (const skin of SKINS.filter(s => s !== 'flat')) {
      const k = stageKart(victor, style({ skin, sticker: 'etoile' }));
      const body = visibleMeshes(k).find(m => m.material.name === 'kart-skin');
      expect(body.material.map.name).toBe(skin);
      expect(named(k, 'sticker')).toHaveLength(1);
    }
    expect(visibleMeshes(stageKart(victor, style({ skin: 'flat' }))).some(m => m.material.name === 'kart-skin')).toBe(false);
  });

  it('animates what the race animates, and the stage exhaust glow on "détaillés" alone', () => {
    const glow = s => stageKart(victor, style(s)).userData.anim.length;
    expect(glow({})).toBe(1);                                                // the two stock pipes' glow
    expect(stageKart(victor, style({}), { tier: 'low' }).userData.anim).toHaveLength(0);
    expect(glow({ exhaust: 'turbine', underglow: 'rainbow', mast: 'pirate' })).toBe(3);   // turbine (its heat), rainbow, flags; a turbine has no pipe mouths
    const k = stageKart(victor, style({ underglow: 'rainbow', mast: 'tricolore' }));
    const ug = named(k, 'underglow')[0], before = ug.material.emissive.getHex();
    for (const f of k.userData.anim) { f(1 / 60, 1.5); f(1 / 60, 1.6, { boost: 1 }); }
    expect(ug.material.emissive.getHex()).not.toBe(before);
    expect(ug.material).not.toBe(named(stageKart(victor, style({ underglow: 'rainbow' })), 'underglow')[0].material);   // each rainbow cycles its own copy
  });

  it('keeps every part inside the race kart\'s reach, so the shield and the podium fit it as they fit the race kart', () => {
    const v = new THREE.Vector3();
    const reach = k => { let r = 0; k.updateMatrixWorld(true); for (const m of visibleMeshes(k)) { if (m.material.depthWrite === false) continue; const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i++) r = Math.max(r, Math.hypot(...v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).toArray().filter((_, j) => j !== 1))); } return r; };
    const reaching = /^(spoiler|nose|exhaust|wheels|mast|pods):|^(builtin|stock|podium|rare|incredible)$/;   // the fields that move a part outwards
    for (const c of BODIES) for (const [n, s] of variants(c)) if (reaching.test(n)) expect(reach(stageKart(c, s))).toBeLessThanOrEqual(reach(buildKart(c, s, { lod: 'race-high' })) + 0.01);
  }, 60000);

  it.each([['high', 60], ['low', 60]])('stays within %s budget: at most %i draws for every candidate and preset, pilot or not', (tier, max) => {
    for (const c of CHARACTERS) for (const [, p] of Object.entries(PRESETS)) for (const pilot of [true, false]) {
      expect(countMeshes(stageKart(c, mergeStyle(builtinStyle(c), p), { tier, pilot }), true)).toBeLessThanOrEqual(max);
    }
  }, 60000);

  it('casts no shadow on "légers", where the stage has no shadow map, and none from a glow or a decal', () => {
    expect(visibleMeshes(stageKart(victor, style(PRESETS.incredible), { tier: 'low' })).some(m => m.castShadow)).toBe(false);
    const high = visibleMeshes(stageKart(victor, style(PRESETS.incredible)));
    expect(high.some(m => m.castShadow)).toBe(true);
    for (const m of high) if (m.material.transparent) expect(m.castShadow).toBe(false);
  });
});

describe('pilot: false', () => {
  it.each([...BODIES.map(c => [c.id, c, 'race']), ...BODIES.map(c => [c.id, c, 'stage'])])('%s (%s) has no driver mesh, an empty seat anchor where the legacy driver sat, and steering', (_id, c, profile) => {
    const withDriver = buildKart(c, defaultStyle(c), { profile, lod: 'race-high' });
    const k = buildKart(c, defaultStyle(c), { profile, pilot: false, lod: 'race-high' });
    expect(Object.keys(k.userData).sort()).toEqual(KEYS);
    const seatAnchor = k.userData.driver;
    expect(seatAnchor.isGroup).toBe(true);
    expect(seatAnchor.name).toBe('seat');
    expect(countMeshes(seatAnchor)).toBe(0);
    // the legacy driver's hip point (the stage keeps it); the race pilot sits at MOUNT on every body, its seat offset inside it
    expect(seatAnchor.position.toArray()).toEqual([0, c.tractor ? 1.05 : 0.75, -0.35]);
    expect(withDriver.userData.driver.position.toArray()).toEqual(profile === 'stage' ? seatAnchor.position.toArray() : [...MOUNT]);
    expect(seatAnchor.scale.toArray()).toEqual([1, 1, 1]);
    expect(seatAnchor.userData.seat).toEqual({ body: c.tractor ? 'tractor' : c.cargo ? 'cargo' : 'kart', pilotScale: PILOT_SCALE, hip: TEMPLATE_HIP });
    expect(countTriangles(k)).toBeLessThan(countTriangles(withDriver));
  });

  it('seats a template-unit pilot on the anchor: scaled 1.45, its hip on the seat, bobbing with the driver', () => {
    const k = buildKart(victor, defaultStyle(victor), { profile: 'stage', pilot: false });
    const pilot = new THREE.Group(); const hip = new THREE.Object3D(); hip.position.set(...TEMPLATE_HIP); pilot.add(hip);
    const fit = seatPilot(k, pilot);
    k.updateMatrixWorld(true);
    expect(fit.scale.x).toBeCloseTo(PILOT_SCALE);
    const at = hip.getWorldPosition(new THREE.Vector3()), anchor = k.userData.driver.getWorldPosition(new THREE.Vector3());
    expect(at.distanceTo(anchor)).toBeLessThan(1e-9);
    k.userData.driver.position.y = 0.75 + 0.3;   // physics' stun bob writes the anchor's y
    k.updateMatrixWorld(true);
    expect(hip.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(1.05);
    seatPilot(k, new THREE.Group());             // seating again replaces the pilot
    expect(k.userData.driver.children).toHaveLength(1);
  });
});

// ---------- The race pilot (stage 8) ----------
const BUDGET = { 'race-high': { tris: 6000, draws: 3 }, 'race-low': { tris: 2500, draws: 2 } };
const within = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
/** Every driver descendant's local transform, to tell what an animation moved. */
const poses = d => { const out = []; d.traverse(o => out.push(o.position.toArray().concat(o.quaternion.toArray(), o.scale.toArray()).map(v => v.toFixed(6)).join(','))); return out; };

describe('the race pilot', () => {
  it('is headless without a DOM (the game server, and these tests), else the detail level\'s', () => {
    expect(typeof document).toBe('undefined');
    expect(raceLod()).toBe('headless');
    expect(RACE_LODS).toEqual(['race-high', 'race-low', 'headless']);
    expect(buildKart(victor).userData.driver.userData.lod).toBe('headless');
    expect(() => buildKart(victor, defaultStyle(victor), { lod: 'stage' })).toThrow(/race pilot level/);
    expect(() => buildKart(victor, defaultStyle(victor), { lod: 'stage', pilot: false })).not.toThrow();
  });

  it.each(CHARACTERS.map(c => [c.id, c]))('%s drives the kart: the pilot is the driver, at MOUNT, unscaled, within its budget on both levels', (_id, c) => {
    for (const lod of ['race-high', 'race-low', 'headless']) {
      const k = buildKart(c, defaultStyle(c), { lod });
      const d = k.userData.driver;
      expect(Object.keys(k.userData).sort()).toEqual(KEYS);
      expect(d.parent).toBe(k);
      expect(d.userData.driver).toBe(d);
      expect(Object.keys(d.userData).sort()).toEqual([...USERDATA_KEYS]);
      expect(d.userData).toMatchObject({ id: c.id, lod });
      expect(d.position.toArray()).toEqual([...MOUNT]);
      expect(d.scale.toArray()).toEqual([1, 1, 1]);
      expect(k.getObjectByName('seat')).toBe(d.getObjectByName('seat'));   // no empty anchor left in the kart
      if (lod === 'headless') { expect(countMeshes(d)).toBe(0); continue; }
      expect(countTriangles(d)).toBeLessThanOrEqual(BUDGET[lod].tris);
      expect(countMeshes(d)).toBeLessThanOrEqual(BUDGET[lod].draws);
      // the race's legacy look: one vertex-coloured Standard material, never a stage one
      for (const m of meshes(d)) { expect(m.material.type).toBe('MeshStandardMaterial'); expect(m.material.vertexColors).toBe(true); expect(m.material.userData.stage).toBeUndefined(); }
      // in a shadow pass on "détaillés" only, as the race kart's own parts
      for (const m of meshes(d)) expect(m.castShadow).toBe(lod === 'race-high');
      disposePilot(d);
    }
  });

  it.each(BODIES.map(c => [c.id, c]))('%s: one steering wheel, the pilot\'s, the hands on it', (_id, c) => {
    for (const lod of ['race-high', 'race-low']) {
      // the kart brings no steering of its own: without its driver it is the steering-less seat kart
      const k = buildKart(c, defaultStyle(c), { lod });
      expect(kartPart(k).text).toBe(kartPart(buildKart(c, defaultStyle(c), { pilot: false, steering: false, lod })).text);
      // the pilot carries exactly one (seen unmerged), and its left hand is on it
      const p = buildPilot(c, lod, { merge: false, idle: false }); const kart = new THREE.Group(); kart.add(p); kart.updateMatrixWorld(true);
      const named = n => { const out = []; p.traverse(o => { if (o.name === n && o.isMesh) out.push(o); }); return out; };
      const wheel = c.cargo ? named('handlebar') : named('steering-wheel');
      expect(wheel).toHaveLength(1);
      expect(named(c.cargo ? 'steering-wheel' : 'handlebar')).toHaveLength(0);
      const hands = named('hand').map(h => h.getWorldPosition(new THREE.Vector3()));
      const at = (c.cargo ? named('grip')[0] : wheel[0]).getWorldPosition(new THREE.Vector3());
      const reach = Math.min(...hands.map(h => h.distanceTo(at)));
      if (c.cargo) expect(reach).toBeLessThan(0.25);
      else { expect(reach).toBeGreaterThan(0.16 * PILOT_SCALE - 0.1); expect(reach).toBeLessThan(0.16 * PILOT_SCALE + 0.1); }
      disposePilot(p);
    }
  });

  it('turns martine\'s gyrophare and thierry\'s weathervane with the kart\'s anim, and leaves every other pilot still', () => {
    for (const c of CHARACTERS) for (const lod of ['race-high', 'race-low']) {
      const k = buildKart(c, defaultStyle(c), { lod }), d = k.userData.driver;
      const before = poses(d);
      for (const f of k.userData.anim) { f(1 / 60, 0.7, { boost: 0 }); f(1 / 60, 1.9, { boost: 0 }); }
      const moved = poses(d).some((p, i) => p !== before[i]);
      expect(moved, c.id + ' ' + lod).toBe(c.id === 'martine' || c.id === 'thierry');
      if (moved) expect(Object.keys(d.userData.live)).toContain(c.id === 'martine' ? 'gyrophare' : 'weathervane');
      disposePilot(d);
    }
  });

  it('hides with the driver, kart-slot props included, as the Politibox hides it', () => {
    for (const c of CHARACTERS) {
      const k = buildKart(c, defaultStyle(c), { lod: 'race-high' }), d = k.userData.driver;
      const all = visibleMeshes(k).length;
      d.visible = false;
      expect(visibleMeshes(k).length).toBe(all - countMeshes(d));
      for (const g of Object.values(d.userData.live)) expect(within(g, d)).toBe(true);   // a roof or dash prop rides in the driver
      disposePilot(d);
    }
  });

  it('builds 16 karts with their race pilots in a fraction of today\'s legacy drivers\' triangles', () => {
    for (const level of ['high', 'low']) withPoly(level, () => {
      for (const c of CHARACTERS) {
        const k = raceKart(c, defaultStyle(c));
        const kart = kartPart(k).tris, pilot = countTriangles(k.userData.driver);
        expect(pilot).toBeLessThanOrEqual(BUDGET[LOD_OF[level]].tris);
        expect(countMeshes(k)).toBeLessThanOrEqual(kartPart(k).meshes + BUDGET[LOD_OF[level]].draws);
        expect(kart + pilot).toBeLessThan(level === 'high' ? 12000 : 6000);
        disposePilot(k.userData.driver);
      }
    });
  });
});

describe('styled karts in a race', () => {
  beforeEach(() => { resetMachine('tracks'); G.trackIdx = 0; });

  it('a slot style reaches the kart, and the minimap colour follows it', () => {
    const others = CHARACTERS.filter(c => c !== victor).slice(0, 5).map(def => ({ def, isAI: true }));
    const mine = style({ body: '#abcdef', number: 12 });
    startField([...others, { def: victor, isAI: false, local: true, style: mine }]);
    expect(G.player.style).toEqual(mine);
    expect(G.karts[0].style).toEqual(defaultStyle(others[0].def));
    const dots = framePayload(G, CFG).kartPositions;
    expect(dots.find(d => d.isPlayer).color).toBe(0xabcdef);
  });
});
