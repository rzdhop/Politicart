// The kart mesh renders a kart style (kartstyle.js), headless as the server
// builds it (DEC-014). The userData parts are a contract with physics, which
// spins every wheel and steers wheels 0 and 1, so every variant must keep them.
import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { buildKart } from './kart.js';
import { builtinStyle, defaultStyle, EXHAUSTS, MASTS, mergeStyle, NOSES, SKINS, SPOILERS, STICKERS, TRAILS, UNDERGLOWS, WHEELS } from './kartstyle.js';
import { resetMachine } from './machine.js';
import { framePayload } from './payload.js';
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

// ---------- The race profile is the pre-change kart (stage 6) ----------
// A fingerprint of everything a race kart is made of, in build order: every
// object (type, name, visibility, shadow flags, transform, parent), every
// mesh's geometry (type, parameters, triangle count, a checksum of its
// positions, shared instances), its material (type, colour, roughness,
// metalness, blending, opacity, side, map, shared instances, and whether it is
// the very primitives.mat() instance for its colour and roughness) and what
// each userData key points at. RACE_GOLDEN holds the hashes taken from
// kart.js before the stage profile existed, per candidate over a set of
// Garage styles and both detail levels; the race profile must reproduce them.
const r5 = v => Math.round(v * 1e5) / 1e5;
function fingerprint(k) {
  const index = new Map(), geos = new Map(), mats = new Map(), lines = [];
  let tris = 0, count = 0;
  k.traverse(o => {
    index.set(o, index.size);
    const t = [o.type, o.name, o.visible ? 1 : 0, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0, o.renderOrder, o.rotation.order,
      ...o.position.toArray().map(r5), ...o.quaternion.toArray().map(r5), ...o.scale.toArray().map(r5), o.parent ? index.get(o.parent) : -1];
    if (o.isMesh) {
      count++;
      const g = o.geometry, p = g.attributes.position.array;
      if (!geos.has(g)) geos.set(g, geos.size);
      let sum = 0; for (let i = 0; i < p.length; i++) sum += p[i] * ((i % 3) * 2 + 1);
      const n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n;
      const m = o.material;
      if (!mats.has(m)) mats.set(m, mats.size);
      const isMat = m.type === 'MeshStandardMaterial' && !m.map && m === mat(m.color.getHex(), m.roughness);
      t.push('geo', geos.get(g), g.type, JSON.stringify(g.parameters ?? null), n, r5(sum),
        'mat', mats.get(m), m.type, m.color ? m.color.getHex() : '', r5(m.roughness ?? -1), r5(m.metalness ?? -1), m.transparent ? 1 : 0, r5(m.opacity),
        m.blending, m.side, m.depthWrite ? 1 : 0, m.map ? 'map:' + m.map.name : '', isMat ? 'mat()' : '');
    }
    lines.push(t.join(','));
  });
  const ref = x => (x && x.isObject3D ? index.get(x) : typeof x === 'function' ? 'fn' : x === null ? 'null' : typeof x);
  lines.push('userData:' + Object.keys(k.userData).sort().map(key => { const v = k.userData[key]; return key + '=' + (Array.isArray(v) ? '[' + v.map(ref).join(' ') + ']' : ref(v)); }).join(';'));
  return { meshes: count, tris, text: lines.join('\n') };
}
const sha = s => createHash('sha1').update(s).digest('hex').slice(0, 16);

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
function raceFingerprints(build) {
  const out = {};
  for (const c of CHARACTERS) {
    const parts = []; let size = '';
    for (const level of ['high', 'low']) withPoly(level, () => {
      for (const [name, s] of stylesOf(c)) {
        const f = fingerprint(build(c, s)); parts.push(level + '/' + name + '\n' + f.text);
        if (level === 'high' && name === 'default') size = f.meshes + ' meshes ' + f.tris + ' tris';
      }
      parts.push(level + '/livery\n' + fingerprint(build({ ...c, livery: 'data:image/png;base64,AAAA' }, { ...mergeStyle(builtinStyle(c)), spoiler: 'wing' })).text);
    });
    out[c.id] = size + ' #' + sha(parts.join('\n\n'));
  }
  return out;
}
const RACE_GOLDEN = {
  aymeric: '110 meshes 24186 tris #022841dcb8b6c55a',
  bernadette: '102 meshes 27110 tris #bcf066e9aa9fdc37',
  capucine: '83 meshes 26462 tris #25a199b17d98d6dd',
  gaspard: '114 meshes 27310 tris #ef709feb8d1fe2be',
  gege: '104 meshes 25726 tris #2401a46c98214a73',
  hubert: '103 meshes 25630 tris #f6fbd536b0251c3b',
  jeanmi: '105 meshes 25710 tris #38aaaaea1f126d62',
  kevin: '103 meshes 27130 tris #a75e5bbe6a044a93',
  lucie: '101 meshes 24198 tris #ff59baca525135b7',
  lulu: '110 meshes 40790 tris #003a26a17f5f0956',
  martine: '105 meshes 25794 tris #284a57cfeced7867',
  maurice: '107 meshes 28774 tris #e99876ec3a41699e',
  odile: '105 meshes 28702 tris #48073ff55aad7638',
  patrick: '94 meshes 22674 tris #017a2984e0a5c022',
  thierry: '111 meshes 24510 tris #662bf30fa14f98aa',
  victor: '101 meshes 24042 tris #9cbebc558cc404e5',
};

describe('the race profile', () => {
  it('is the pre-change kart: same meshes, geometries, mat() instances and userData, for every candidate and Garage style', () => {
    expect(raceFingerprints((c, s) => buildKart(c, s))).toEqual(RACE_GOLDEN);
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
