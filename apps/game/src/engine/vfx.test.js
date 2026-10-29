// The effects module (DEC-053): a strict no-op headless, an event recorder
// behind a sink (the game server's worker), and in the browser eight pooled
// InstancedMesh layers that never grow past their tier's capacity. The
// browser path is forced on in node here (setVfxHeadless(false)): a mesh
// needs no renderer to exist.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { drain } from './events.js';
import { useItem } from './items.js';
import { fxAnchorsOf } from './kart.js';
import { resetMachine, transition } from './machine.js';
import { decodeVfx, encodeVfx } from './netstate.js';
import { framePayload } from './payload.js';
import { applyPower } from './powers.js';
import { simStep, startField, viewStep } from './race.js';
import { CFG, G, getPoly, togglePoly } from './state.js';
import {
  initVfx, LAYERS, playVfx, POOLS, receiveVfx, replayVfx, setVfxHeadless, setVfxSink, spawnVfx, updateVfx, VFX_KINDS, vfxEvent, vfxLive, vfxRoot, vfxStats,
} from './vfx.js';

const STEP = 1 / 60;
const ids = ['victor', 'gege', 'maurice', 'capucine', 'hubert', 'lulu'];
const def = id => CHARACTERS.find(c => c.id === id);

/** Six AI karts on Élysée, the race running, the last one followed. */
function race() {
  resetMachine('tracks'); G.trackIdx = 0;
  startField(ids.map((id, i) => ({ def: def(id), isAI: true, local: i === 5 })), { seed: 1 });
  transition('race'); G.countdown = 0; drain();
  return G.karts;
}
const place = (k, i, lat = 0, v = 30) => { const s = G.samples[i]; k.idx = i; k.pos.x = s.x + s.sx * lat; k.pos.z = s.z + s.sz * lat; k.heading = Math.atan2(s.tx, s.tz); k.speed = v; k.y = s.y; k.mesh.position.set(k.pos.x, k.y, k.pos.z); };
const layers = () => Object.fromEntries(vfxRoot().children.map(m => [m.name.slice(4), m]));
const drawn = () => vfxRoot().children.filter(m => m.visible && m.count > 0).length;
const withPoly = (level, fn) => { if (getPoly() !== level) togglePoly(); try { return fn(); } finally { if (getPoly() !== 'high') togglePoly(); } };

afterEach(() => { setVfxHeadless(true); setVfxSink(null); });

describe('headless (the game server)', () => {
  it('builds nothing, plays nothing, and leaves no HUD state', () => {
    expect(vfxLive()).toBe(false);
    const [k] = race();
    expect(vfxRoot()).toBeNull(); expect(G.fxHud).toBeNull();
    expect(G.scene.getObjectByName('vfx')).toBeUndefined();
    const before = G.scene.children.length;
    for (const ty of VFX_KINDS) spawnVfx(ty, { kart: k });
    updateVfx(STEP); playVfx({ ty: 'impact', x: 0, y: 0, z: 0 });
    expect(G.scene.children).toHaveLength(before);
    expect(framePayload(G, CFG)).toMatchObject({ hit: 0, shake: 0, lapFlash: 0, itemUsed: 0 });
  });

  it('races 20 s of items and powers without adding an effect object to the scene', () => {
    race();
    const count = () => { let n = 0; G.scene.traverse(o => { if ((o.isInstancedMesh && !o.name.startsWith('instanced:')) || o.name.startsWith('vfx')) n++; }); return n; };   // the decor's own batches (decor/instanced.js) are not effects
    for (let n = 0; n < 20 * 60; n++) { if (n % 120 === 0) for (const k of G.karts) { k.item = 'casserolade'; k.itemRolling = 0; useItem(k); k.powerCd = 0; applyPower(k, k.def.power.id); } simStep(STEP); }
    expect(count()).toBe(0);
  });
});

describe('the sink (what the worker records)', () => {
  it('records one plain event per effect, with the kart by grid slot, and builds nothing', () => {
    const [, b] = race(); const got = []; setVfxSink(e => got.push(e));
    spawnVfx('impact', { kart: b, color: 0xc8102e }); spawnVfx('shockwave', { x: 1.234, y: 2, z: -3.456, r: 22 }); spawnVfx('swath', { kart: b, dir: 1.23456, r: 60 });
    expect(got).toEqual([
      { ty: 'impact', x: Math.round(b.pos.x * 100) / 100, y: Math.round(b.y * 100) / 100, z: Math.round(b.pos.z * 100) / 100, k: 1, c: 0xc8102e },
      { ty: 'shockwave', x: 1.23, y: 2, z: -3.46, r: 22 },
      { ty: 'swath', x: expect.any(Number), y: expect.any(Number), z: expect.any(Number), k: 1, d: 1.23, r: 60 },
    ]);
    expect(vfxRoot()).toBeNull();
  });

  it('travels as a short array and comes back the same', () => {
    race();
    for (const e of [vfxEvent('puff', { x: 1, z: 2 }), vfxEvent('impact', { kart: G.karts[3], color: 0xffd34d }), vfxEvent('swath', { kart: G.karts[0], dir: -2.5, r: 60 }), vfxEvent('shockwave', { x: 0, y: 1, z: 0, r: 22 })]) {
      const a = encodeVfx(e);
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
      expect(decodeVfx(a)).toEqual(e);
    }
    expect(encodeVfx({ ty: 'puff', x: 1, y: 0, z: 2 })).toEqual(['puff', 1, 0, 2]);
    expect(encodeVfx({ ty: 'shockwave', x: 1, y: 0, z: 2, r: 22 })).toEqual(['shockwave', 1, 0, 2, -1, -1, null, 22]);
    for (const bad of [null, [], [3, 1, 2, 3], ['impact', 'x', 0, 0], 'impact']) expect(decodeVfx(bad)).toBeNull();
  });

  it('records nothing while the netcode replays a kart (G.replaying)', () => {
    const [k] = race(); const got = []; setVfxSink(e => got.push(e));
    G.replaying = true; try { spawnVfx('impact', { kart: k }); } finally { delete G.replaying; }
    expect(got).toHaveLength(0);
  });
});

describe('the pools (the browser)', () => {
  beforeEach(() => setVfxHeadless(false));

  it.each(['high', 'low'])('builds eight instanced layers at the %s tier, hidden and empty, with their colours from the start', level => withPoly(level, () => {
    race();
    const L = layers();
    expect(Object.keys(L)).toEqual([...LAYERS]);
    for (const name of LAYERS) {
      const m = L[name];
      expect(m.isInstancedMesh, name).toBe(true);
      expect(m.instanceMatrix.count, name).toBe(POOLS[level][name]);
      expect(m.instanceColor?.count, name).toBe(POOLS[level][name]);   // a colour for every instance, from the start
      expect(m.visible, name).toBe(false); expect(m.count, name).toBe(0);
      expect(m.frustumCulled, name).toBe(false); expect(m.castShadow, name).toBe(false);
    }
    // the low tier holds less of everything
    if (level === 'low') for (const name of LAYERS) expect(POOLS.low[name]).toBeLessThan(POOLS.high[name]);
  }));

  it('never draws more instances than a layer holds, however many effects are thrown', () => {
    const [k] = race();
    for (let n = 0; n < 400; n++) for (const ty of VFX_KINDS) spawnVfx(ty, { kart: k, x: k.pos.x, z: k.pos.z, y: k.y, dir: 0.4, r: 22 });
    updateVfx(STEP);
    const st = vfxStats();
    for (const name of LAYERS) { expect(st[name].drawn, name).toBeLessThanOrEqual(st[name].cap); expect(st[name].live, name).toBeLessThanOrEqual(st[name].cap); }
    expect(st.debris.drawn).toBe(st.debris.cap);       // full: the oldest particles are recycled
    expect(drawn()).toBeLessThanOrEqual(LAYERS.length);
  });

  it('plays every kind, with a kart and without, and empties again once their lives are over', () => {
    const ks = race();
    for (const k of ks) { k.speed = 0; k.drift.active = false; }
    for (const ty of VFX_KINDS) { spawnVfx(ty, { kart: ks[1] }); spawnVfx(ty, { x: ks[2].pos.x, y: ks[2].y, z: ks[2].pos.z, dir: 1, r: 12 }); }
    updateVfx(STEP);
    expect(drawn()).toBeGreaterThan(5);
    for (const m of vfxRoot().children) for (let i = 0; i < m.count; i++) { const e = new THREE.Matrix4(); m.getMatrixAt(i, e); expect(e.elements.every(Number.isFinite), m.name).toBe(true); }
    for (let n = 0; n < 4 * 60; n++) updateVfx(STEP);
    expect(drawn()).toBe(0);
    expect(Object.values(vfxStats()).every(s => s.live === 0)).toBe(true);
  });

  it('skips an unknown kind and a kart slot that does not exist', () => {
    race();
    expect(() => { playVfx({ ty: 'nope', x: 0, y: 0, z: 0 }); playVfx({ ty: 'stars', x: 0, y: 0, z: 0, k: 99 }); updateVfx(STEP); }).not.toThrow();
  });
});

describe('what follows from a kart’s state', () => {
  beforeEach(() => setVfxHeadless(false));
  const frame = () => updateVfx(STEP);

  it('draws each status around its kart for as long as it runs', () => {
    const ks = race(); const k = ks[0]; place(k, 300); G.player.pos.x = k.pos.x; G.player.pos.z = k.pos.z;
    for (const o of ks) { o.speed = 0; }
    const counts = () => { frame(); const s = vfxStats(); return Object.fromEntries(LAYERS.map(n => [n, s[n].drawn])); };
    const base = counts();
    const cases = [['slowed', 2, 'ring'], ['confused', 2, 'glow'], ['capped', 2, 'glow'], ['rabot', 2, 'debris'], ['slip', 2, 'ring'], ['relance', 3, 'coin'], ['phantom', 2, 'glow'], ['stun', 2, 'glow']];
    for (const [field, v, layer] of cases) {
      k[field] = v; const on = counts();
      expect(on[layer], field).toBeGreaterThan(base[layer]);
      k[field] = 0; for (let n = 0; n < 120; n++) frame();
    }
    k.capped = 2; expect(counts().glow).toBeGreaterThanOrEqual(12);   // the twelve stars of the directive
  });

  it('puts the boost’s flames at the exhaust mouths, two per mouth', () => {
    const ks = race(); const k = ks[5]; place(k, 300); for (const o of ks) o.speed = 0;
    k.boost = 1; frame();
    expect(vfxStats().flame.drawn).toBe(2 * fxAnchorsOf(k.mesh).exhaust.length);
    k.boost = 0; frame(); expect(vfxStats().flame.drawn).toBe(0);
  });

  it('throws the drift’s sparks in the tier’s colour', () => {
    const ks = race(); const k = ks[5]; place(k, 300); for (const o of ks) o.speed = 0;
    k.drift.active = true; k.drift.charge = 2.5;
    for (let n = 0; n < 10; n++) frame();
    const glow = layers().glow, c = new THREE.Color(); glow.getColorAt(0, c);
    expect(vfxStats().glow.drawn).toBeGreaterThan(4);
    expect(c.r).toBeGreaterThan(c.b);            // orange, the third tier
  });

  it('flashes and shakes the HUD when the local kart is hit, dips the camera on a landing, and fades both', () => {
    const ks = race(); const me = G.player; place(me, 300); for (const o of ks) o.speed = 0;
    frame(); me.stun = 1; frame();
    expect(G.fxHud.hit).toBeGreaterThan(0.9); expect(G.fxHud.shake).toBeGreaterThan(0.8);
    expect(framePayload(G, CFG).hit).toBe(G.fxHud.hit);
    me.stun = 0; me.air = true; frame(); me.air = false; frame();
    expect(G.fxHud.dip).toBeGreaterThan(0.3);
    for (let n = 0; n < 60; n++) frame();
    expect(G.fxHud).toMatchObject({ hit: 0, shake: 0, dip: 0 });
  });

  it('counts the item leaving the slot, and flashes gold on a lap completed', () => {
    race(); const me = G.player; place(me, 300);
    me.item = 'turbo'; frame(); me.item = null; frame();
    expect(framePayload(G, CFG).itemUsed).toBe(1);
    me.lap = 1; frame(); expect(G.fxHud.lap).toBeGreaterThan(0.9);
  });

  it('bursts a ballot box taken and pops it back, scaled in', () => {
    race(); const b = G.itemBoxes[0]; G.player.pos.x = b.x; G.player.pos.z = b.z;
    frame(); b.mesh.visible = false; frame();
    expect(vfxStats().flake.live).toBeGreaterThan(0);
    b.mesh.visible = true; frame();
    expect(b.mesh.scale.x).toBeLessThan(1);
    for (let n = 0; n < 40; n++) frame();
    expect(b.mesh.scale.x).toBe(1);
  });

  it('confetti at the finish line when a kart finishes', () => {
    race(); frame(); G.player.finished = true; frame();
    expect(vfxStats().flake.live).toBeGreaterThan(40);
  });

  it('runs a whole race view without a NaN, within its eight draws', () => {
    race();
    let most = 0;
    for (let n = 0; n < 40 * 60; n++) {
      if (n % 90 === 0) for (const k of G.karts) { k.item = ['casserolade', 'turbo', 'lacrymo', 'dossier', 'relance', 'bravm'][n / 90 % 6]; k.itemRolling = 0; }
      simStep(STEP); viewStep(STEP); most = Math.max(most, drawn());
    }
    expect(most).toBeGreaterThan(0); expect(most).toBeLessThanOrEqual(LAYERS.length);
    for (const m of vfxRoot().children) for (let i = 0; i < m.count; i++) { const e = new THREE.Matrix4(); m.getMatrixAt(i, e); expect(e.elements.every(Number.isFinite), m.name).toBe(true); }
  });
});

describe('team races: effects off the wire', () => {
  beforeEach(() => setVfxHeadless(false));

  it('plays an effect when the render clock reaches the snapshot that brought it, not before', () => {
    race();
    receiveVfx([decodeVfx(['impact', 1, 0, 2]), decodeVfx(['shockwave', 1, 0, 2, -1, -1, null, 22])], 120);
    replayVfx(110); updateVfx(STEP); expect(drawn()).toBe(0);
    replayVfx(120); updateVfx(STEP); expect(drawn()).toBeGreaterThan(0);
    replayVfx(130); expect(() => updateVfx(STEP)).not.toThrow();
  });

  it('starts every race with empty pools and an empty queue', () => {
    race(); receiveVfx([decodeVfx(['impact', 1, 0, 2])], 500);
    initVfx(G.scene); replayVfx(1e9); updateVfx(STEP);
    expect(drawn()).toBe(0);
  });
});
