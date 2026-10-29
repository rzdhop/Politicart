import { beforeEach, describe, expect, it } from 'vitest';

import { buildHazard, buildProjectileMesh, useItem } from './items.js';
import { resetMachine } from './machine.js';
import { applyKart, applyKartStatus, bracket, decodeVfx, encodeKart, encodeSnapshot, encodeStatus, encodeVfx, lerpKart } from './netstate.js';
import { simStep, startRace } from './race.js';
import { G } from './state.js';

const blank = () => ({ pos: { x: 0, z: 0 }, drift: { active: false, dir: 0, charge: 0 } });

describe('snapshots of a live race', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; G.trackIdx = 1; startRace({ seed: 8 }); for (let n = 0; n < 8 * 60; n++) simStep(1 / 60); });

  it('survive JSON and rebuild every kart field the client draws or shows', () => {
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(G, 480)));
    expect(snap.tk).toBe(480);
    expect(snap.st).toBe('race');
    expect(snap.k).toHaveLength(6);
    expect(snap.b).toMatch(/^[01]+$/);
    expect(snap.b).toHaveLength(G.itemBoxes.length);
    expect(snap.c).toHaveLength(G.crossings.length);
    G.karts.forEach((k, i) => {
      const copy = blank(); applyKart(copy, snap.k[i]);
      expect(copy.pos).toEqual(k.pos);
      expect(copy.heading).toBe(k.heading);
      expect(copy.rank).toBe(k.rank);
      expect(copy.lap).toBe(k.lap);
      expect(copy.drift).toEqual(k.drift);
      expect(copy.bestLap).toBe(k.bestLap);             // Infinity travelled as null and came back
    });
  });

  it('carry the race’s lap count and which karts are gods (DEC-031)', () => {
    G.laps = 5; G.karts[2].god = true;
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(G, 480)));
    expect(snap.lp).toBe(5);
    const copy = blank(); applyKart(copy, snap.k[2]); expect(copy.god).toBe(true);
    applyKart(copy, snap.k[1]); expect(copy.god).toBe(false);
  });

  it('name hazards and projectiles by id, the circuit\'s static obstacles first (DEC-049), each with its height', () => {
    const statics = encodeSnapshot(G, 0).h;
    expect(statics.length).toBeGreaterThan(0);
    expect(statics.every(h => h.ty === 'obstacle')).toBe(true);
    const k = G.karts[0];
    k.item = 'greve'; k.itemRolling = 0; useItem(k);
    k.item = 'motion'; useItem(k);
    const snap = encodeSnapshot(G, 1);
    expect(snap.h.at(-1)).toMatchObject({ ty: 'barricade' });
    expect(snap.p.at(-1)).toMatchObject({ ty: 'motion' });
    expect(snap.h.at(-1).id).not.toBe(snap.p.at(-1).id);
    const ids = snap.h.map(h => h.id);
    expect(ids.every(Number.isInteger)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const h of snap.h) expect(Number.isFinite(h.y)).toBe(true);
    expect(JSON.parse(JSON.stringify(snap)).h).toEqual(snap.h);
  });
});

describe('mesh builders', () => {
  it('build every hazard and projectile type without placing it', () => {
    for (const t of ['barricade', 'fakebox', 'lisier', 'lacrymo', 'rondpoint', 'chatons', 'obstacle']) {
      const h = buildHazard(t);
      expect(h.g.children.length).toBeGreaterThan(0);
      expect(h.r).toBeGreaterThan(0);
    }
    for (const t of ['dossier', 'bravm', 'motion']) expect(buildProjectileMesh(t).children.length).toBeGreaterThan(0);
  });
});

describe('interpolation', () => {
  const a = { ...encodeKart({ ...blank(), heading: 3.1, speed: 10, steer: 0, y: 0, vy: 0, item: null, itemRolling: 0, powerCd: 4, lap: 0, idx: 0, progress: 0, rank: 2, finished: false, finishTime: 0, bestLap: Infinity, fly: 0, invincible: 0, stun: 0, phantom: 0, boost: 0 }) };
  const b = { ...a, x: 10, z: -4, h: -3.1, s: 20, rk: 1, it: 'turbo' };

  it('blends positions and takes discrete fields from the newer snapshot', () => {
    const m = lerpKart(a, b, 0.5);
    expect(m.x).toBe(5);
    expect(m.z).toBe(-2);
    expect(m.s).toBe(15);
    expect(m.rk).toBe(1);
    expect(m.it).toBe('turbo');
  });

  it('turns the short way round across the -pi/pi seam', () => {
    const m = lerpKart(a, b, 0.5);
    expect(Math.abs(Math.abs(m.h) - Math.PI)).toBeLessThan(0.05);
  });

  it('brackets a render tick and clamps outside the buffer', () => {
    const buf = [{ tk: 3 }, { tk: 6 }, { tk: 9 }];
    expect(bracket(buf, 7.5)).toMatchObject({ a: buf[1], b: buf[2], f: 0.5 });
    expect(bracket(buf, 1)).toMatchObject({ a: buf[0], b: buf[0], f: 0 });
    expect(bracket(buf, 20)).toMatchObject({ a: buf[2], b: buf[2], f: 0 });
    expect(bracket([], 1)).toBeNull();
  });
});

// The statuses every screen draws an aura for (DEC-053): they travel with the kart, only while they run.
describe('statuses and effects on the wire (DEC-053)', () => {
  const kart = over => ({ ...blank(), heading: 0, speed: 0, steer: 0, vy: 0, y: 0, air: false, trick: false, fly: 0, invincible: 0, stun: 0, phantom: 0, boost: 0, item: null, itemRolling: 0, powerCd: 0, lap: 0, idx: 0, progress: 0, rank: 0, finished: false, finishTime: 0, bestLap: Infinity, ...over });

  it('carry slowed, confused, capped, rabot, slip and the relance under their short keys, and nothing when off', () => {
    expect(encodeStatus(kart({}))).toEqual({});
    const on = kart({ slowed: 1.2345, confused: 0.5, capped: 3, rabot: 4, slip: 0.4, relance: 2 });
    expect(encodeStatus(on)).toEqual({ sl: 1.23, co: 0.5, ca: 3, ra: 4, sp: 0.4, rl: 2 });
    const snap = JSON.parse(JSON.stringify(encodeKart(on)));
    expect(snap).toMatchObject({ sl: 1.23, co: 0.5, ca: 3, ra: 4, sp: 0.4, rl: 2 });
    const copy = blank(); applyKart(copy, snap);
    expect(copy).toMatchObject({ slowed: 1.23, confused: 0.5, capped: 3, rabot: 4, slip: 0.4, relance: 2 });
  });

  it('turn a status off on the client when it stops travelling', () => {
    const copy = { ...blank(), slowed: 2, capped: 1, relance: 3 };
    applyKartStatus(copy, {});
    expect(copy).toMatchObject({ slowed: 0, confused: 0, capped: 0, rabot: 0, slip: 0, relance: 0 });
  });

  it('come from the newer snapshot when blended', () => {
    const a = encodeKart(kart({ slowed: 2 })), b = encodeKart(kart({ capped: 1 }));
    const mid = lerpKart(a, b, 0.5);
    expect(mid.ca).toBe(1); expect(mid.sl).toBeUndefined();
  });

  it('encode an effect event as a short array that decodes back', () => {
    const e = { ty: 'impact', x: 1.5, y: 0.2, z: -3, k: 2, c: 0xc8102e };
    expect(encodeVfx(e)).toEqual(['impact', 1.5, 0.2, -3, 2, 0xc8102e]);
    expect(decodeVfx(JSON.parse(JSON.stringify(encodeVfx(e))))).toEqual(e);
    expect(decodeVfx(encodeVfx({ ty: 'swath', x: 0, y: 0, z: 0, k: 0, d: 1.5, r: 60 }))).toEqual({ ty: 'swath', x: 0, y: 0, z: 0, k: 0, d: 1.5, r: 60 });
  });

  it('keep a live race\'s snapshot small: the statuses add bytes only to the karts that carry one', () => {
    resetMachine('tracks'); G.trackIdx = 0; startRace({ seed: 3 }); for (let n = 0; n < 60; n++) simStep(1 / 60);
    for (const k of G.karts) { k.slowed = 0; k.confused = 0; k.capped = 0; k.rabot = 0; k.slip = 0; k.relance = 0; }
    const plain = JSON.stringify(encodeSnapshot(G, 60)).length;
    G.karts[1].slowed = 2.5;
    expect(JSON.stringify(encodeSnapshot(G, 60)).length - plain).toBeLessThanOrEqual(10);
  });
});
