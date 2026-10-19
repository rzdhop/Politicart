// The kart mesh renders a kart style (kartstyle.js), headless as the server
// builds it (DEC-014). The userData parts are a contract with physics, which
// spins every wheel and steers wheels 0 and 1, so every variant must keep them.
import { beforeEach, describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { buildKart } from './kart.js';
import { builtinStyle, defaultStyle, mergeStyle, SPOILERS, STICKERS, WHEELS } from './kartstyle.js';
import { resetMachine } from './machine.js';
import { framePayload } from './payload.js';
import { startField } from './race.js';
import { CFG, G } from './state.js';

const victor = CHARACTERS.find(c => c.id === 'victor');
const style = partial => mergeStyle(builtinStyle(victor), partial);
const meshes = k => { const out = []; k.traverse(o => { if (o.isMesh) out.push(o); }); return out; };
const colours = k => new Set(meshes(k).map(m => m.material.color?.getHex()));
const named = (k, name) => k.children.filter(o => o.name === name);

describe('buildKart', () => {
  it.each(CHARACTERS.map(c => [c.id, c]))('%s keeps the userData contract with its default style', (_id, c) => {
    const k = buildKart(c);
    expect(Object.keys(k.userData).sort()).toEqual(['blades', 'driver', 'ring', 'rotor', 'sparks', 'wheels']);
    expect(k.userData.wheels).toHaveLength(c.cargo ? 3 : 4);
    expect(named(k, 'plate')).toHaveLength(1);
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

  it('builds with a race number without breaking the plate', () => {
    for (const number of [0, 7, 99]) expect(named(buildKart(victor, style({ number })), 'plate')).toHaveLength(1);
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
