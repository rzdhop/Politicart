import { beforeEach, describe, expect, it } from 'vitest';

import { buildHazard, buildProjectileMesh, useItem } from './items.js';
import { resetMachine } from './machine.js';
import { applyKart, bracket, encodeKart, encodeSnapshot, lerpKart } from './netstate.js';
import { simStep, startRace } from './race.js';
import { G } from './state.js';

const blank = () => ({ pos: { x: 0, z: 0 }, drift: { active: false, dir: 0, charge: 0 } });

describe('snapshots of a live race', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; G.trackIdx = 1; startRace(); for (let n = 0; n < 8 * 60; n++) simStep(1 / 60); });

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

  it('name hazards and projectiles by id', () => {
    const k = G.karts[0];
    k.item = 'greve'; k.itemRolling = 0; useItem(k);
    k.item = 'motion'; useItem(k);
    const snap = encodeSnapshot(G, 1);
    expect(snap.h.at(-1)).toMatchObject({ ty: 'barricade' });
    expect(snap.p.at(-1)).toMatchObject({ ty: 'motion' });
    expect(snap.h.at(-1).id).not.toBe(snap.p.at(-1).id);
  });
});

describe('mesh builders', () => {
  it('build every hazard and projectile type without placing it', () => {
    for (const t of ['barricade', 'fakebox', 'lisier', 'lacrymo', 'rondpoint', 'chatons']) {
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
