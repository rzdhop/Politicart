// The kart mesh renders a kart style (kartstyle.js), headless as the server
// builds it (DEC-014). The userData parts are a contract with physics, which
// spins every wheel and steers wheels 0 and 1, so every variant must keep them.
import { beforeEach, describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { buildKart } from './kart.js';
import { builtinStyle, defaultStyle, EXHAUSTS, MASTS, mergeStyle, NOSES, SKINS, SPOILERS, STICKERS, UNDERGLOWS, WHEELS } from './kartstyle.js';
import { resetMachine } from './machine.js';
import { framePayload } from './payload.js';
import { startField } from './race.js';
import { CFG, G } from './state.js';

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
