import { beforeEach, describe, expect, it } from 'vitest';

import { buildHazard, buildProjectileMesh, useItem } from './items.js';
import { resetMachine } from './machine.js';
import { applyKart, applyKartDiscrete, applyKartMotion, applyKartPrivate, bracket, encodeKart, encodeKartPrivate, encodeSnapshot, extrapolateKart, lerpKart, markTeleports, TELEPORT_D } from './netstate.js';
import { simStep, startRace } from './race.js';
import { G } from './state.js';

const blank = () => ({ pos: { x: 0, z: 0 }, drift: { active: false, dir: 0, charge: 0 } });
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

describe('snapshots of a live race', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; G.trackIdx = 1; startRace({ seed: 8 }); for (let n = 0; n < 8 * 60; n++) simStep(1 / 60); });

  it('survive JSON and rebuild every kart field the client draws or shows, to the quantum (DEC-052)', () => {
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(G, 480)));
    expect(snap.tk).toBe(480);
    expect(snap.st).toBe('race');
    expect(snap.k).toHaveLength(6);
    expect(snap.b).toMatch(/^[01]+$/);
    expect(snap.b).toHaveLength(G.itemBoxes.length);
    expect(snap.c).toHaveLength(G.crossings.length);
    G.karts.forEach((k, i) => {
      const me = JSON.parse(JSON.stringify(encodeKartPrivate(k)));
      const copy = blank(); applyKart(copy, snap.k[i], me);
      expect(Math.abs(copy.pos.x - k.pos.x)).toBeLessThanOrEqual(5e-4);          // millimetres
      expect(Math.abs(copy.pos.z - k.pos.z)).toBeLessThanOrEqual(5e-4);
      expect(Math.abs(copy.y - k.y)).toBeLessThanOrEqual(5e-4);
      expect(Math.abs(wrap(copy.heading - k.heading))).toBeLessThanOrEqual(5e-5);  // 1e-4 rad, the same a turn round
      expect(Math.abs(copy.speed - k.speed)).toBeLessThanOrEqual(5e-3);
      expect(Math.abs(copy.steer - k.steer)).toBeLessThanOrEqual(5e-5);
      expect(copy.idx).toBe(k.idx);
      expect(copy.rank).toBe(k.rank);
      expect(copy.lap).toBe(k.lap);
      expect(copy.item).toBe(k.item);
      expect(copy.drift.active).toBe(k.drift.active);
      expect(Math.abs(copy.drift.charge - k.drift.charge)).toBeLessThanOrEqual(5e-3);
      expect(Math.abs(copy.powerCd - k.powerCd)).toBeLessThanOrEqual(5e-3);
      expect(copy.bestLap).toBe(Number.isFinite(k.bestLap) ? Math.round(k.bestLap * 1000) / 1000 : Infinity);   // Infinity stayed home and came back
    });
  });

  it('send the HUD-only fields to their owner alone, and leave resting values out', () => {
    const k = G.karts[5]; k.item = 'turbo'; k.bestLap = 31.2;
    const pub = encodeKart(k);
    for (const key of ['it', 'ir', 'pc', 'bl', 'ft', 'lap', 'pr']) expect(pub, key).not.toHaveProperty(key);
    expect(encodeKartPrivate(k)).toMatchObject({ it: 'turbo', bl: 31.2, lap: k.lap });
    const still = encodeKart({ ...blank(), heading: 0, speed: 0, y: 0, idx: 3, rank: 1, bumpPower: 1, bumpSide: 1 });
    expect(Object.keys(still).sort()).toEqual(['h', 'idx', 'rk', 's', 'x', 'y', 'z']);
    const copy = { ...blank(), air: true, stun: 2, bumpPower: 3 }; applyKartMotion(copy, still);
    expect(copy).toMatchObject({ air: false, stun: 0, boost: 0, bumpPower: 1, bumpSide: 1, vy: 0, steer: 0, shield: 0 });
  });

  it('carry in the private block every hidden field a replay of the kart needs, and bring it back', () => {
    const k = G.karts[5];
    Object.assign(k, { pitGrace: 1.25, padGrace: 0.5, hazardGrace: 0.75, kx: 2.5, kz: -1.5, slowed: 1.1, confused: 0.4, slip: 0.3, rabot: 2, capped: 3, relance: 2, relanceTimer: 0.6, boostPower: 1.5, maxLap: 1, rampPrev: G.ramps[0] });
    const me = JSON.parse(JSON.stringify(encodeKartPrivate(k)));
    expect(me.rp).toBe(0);                                       // the ramp it is on travels as its index
    const copy = blank(); applyKartPrivate(copy, me);
    expect(copy).toMatchObject({ pitGrace: 1.25, padGrace: 0.5, hazardGrace: 0.75, kx: 2.5, kz: -1.5, slowed: 1.1, confused: 0.4, slip: 0.3, rabot: 2, capped: 3, relance: 2, relanceTimer: 0.6, boostPower: 1.5, maxLap: 1 });
    expect(copy.rampPrev).toBe(G.ramps[0]);
    k.rampPrev = null; expect(encodeKartPrivate(k)).not.toHaveProperty('rp');
  });

  it("split a kart's motion from the server's word on it: rank, finish, god, item, lap", () => {
    const k = G.karts[5]; k.item = 'helico'; k.itemRolling = 0; k.finished = false;
    const s = encodeKart(k), me = encodeKartPrivate(k);
    const copy = { ...blank(), rank: 9, item: null, lap: 7 };
    applyKartMotion(copy, s);
    expect(copy.rank).toBe(9); expect(copy.item).toBeNull();        // motion alone leaves the discrete state be
    applyKartDiscrete(copy, s, me);
    expect(copy.rank).toBe(k.rank); expect(copy.item).toBe('helico'); expect(copy.lap).toBe(k.lap);
  });

  it('weigh about a kilobyte and a half for a six-kart field, a third of what they were', () => {
    const sizes = [];
    for (let n = 0; n < 20 * 60; n++) { simStep(1 / 60); if (n % 3 === 0) sizes.push(JSON.stringify(encodeSnapshot(G, n)).length + JSON.stringify(encodeKartPrivate(G.player)).length); }
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    expect(mean).toBeLessThan(1700);                              // measured 1.40 to 1.65 kB with the owner's block on the five circuits (4.1 to 4.5 kB before)
  });

  it('carry the race’s lap count and which karts are gods (DEC-031)', () => {
    G.laps = 5; G.karts[2].god = true;
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(G, 480)));
    expect(snap.lp).toBe(5);
    const copy = blank(); applyKart(copy, snap.k[2]); expect(copy.god).toBe(true);
    applyKart(copy, snap.k[1]); expect(copy.god).toBe(false);
  });

  it('name hazards and projectiles by id, the circuit\'s static obstacles by their id alone (DEC-049), each other with its height', () => {
    const first = encodeSnapshot(G, 0);
    expect(first.hs.length).toBeGreaterThan(0);
    expect(first.hs).toEqual(G.hazards.filter(h => h.type === 'obstacle').map(h => h.id));
    expect(first.h.some(h => h.ty === 'obstacle')).toBe(false);
    const k = G.karts[0];
    k.item = 'greve'; k.itemRolling = 0; useItem(k);
    k.item = 'motion'; useItem(k);
    const snap = encodeSnapshot(G, 1);
    expect(snap.h.at(-1)).toMatchObject({ ty: 'barricade' });
    expect(snap.p.at(-1)).toMatchObject({ ty: 'motion' });
    expect(snap.h.at(-1).id).not.toBe(snap.p.at(-1).id);
    const ids = [...snap.hs, ...snap.h.map(h => h.id)];
    expect(ids.every(Number.isInteger)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const h of snap.h) expect(Number.isFinite(h.y ?? 0)).toBe(true);
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

  it('brackets a render tick, clamps before the buffer and runs at most 100 ms past it', () => {
    const buf = [{ tk: 3 }, { tk: 6 }, { tk: 9 }];
    expect(bracket(buf, 7.5)).toMatchObject({ a: buf[1], b: buf[2], f: 0.5, ex: 0 });
    expect(bracket(buf, 1)).toMatchObject({ a: buf[0], b: buf[0], f: 0, ex: 0 });
    expect(bracket(buf, 12)).toMatchObject({ a: buf[2], b: buf[2], f: 0 });
    expect(bracket(buf, 12).ex).toBeCloseTo(3 / 60, 9);
    expect(bracket(buf, 20).ex).toBeCloseTo(0.1, 9);              // six ticks, then the karts wait
    expect(bracket([], 1)).toBeNull();
  });

  it("carries a kart on at its speed and heading, its drift's slide included", () => {
    const k = { x: 0, z: 0, h: 0, s: 20 };
    expect(extrapolateKart(k, 0.1)).toMatchObject({ x: 0, z: 2 });
    const d = extrapolateKart({ ...k, h: Math.PI / 2, da: 1, dd: 1 }, 0.1);
    expect(d.x).toBeCloseTo(2 * Math.sin(Math.PI / 2 + 0.35), 9);
  });

  it('does not drag a teleported kart across the map: a changed tp takes the newer snapshot whole', () => {
    const m = lerpKart({ ...a, tp: 1 }, { ...b, tp: 2 }, 0.5);
    expect(m.x).toBe(10); expect(m.z).toBe(-4);
  });

  it('counts a teleport on a kart that moved farther in a tick than a kart can drive', () => {
    const karts = [{ pos: { x: 0, z: 0 } }, { pos: { x: 50, z: 0 } }]; const last = [];
    markTeleports(karts, last);                                    // first call: positions noted, nothing counted
    expect(karts.map(k => k.tp ?? 0)).toEqual([0, 0]);
    karts[0].pos.x += 2; karts[1].pos.x += TELEPORT_D + 1;          // a fast kart, and an Amendement swap
    markTeleports(karts, last);
    expect(karts.map(k => k.tp ?? 0)).toEqual([0, 1]);
    expect(encodeKart({ ...blank(), ...karts[1], heading: 0, speed: 0, y: 0, idx: 0, rank: 0 }).tp).toBe(1);
  });
});
