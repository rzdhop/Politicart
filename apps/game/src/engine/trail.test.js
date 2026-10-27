// The trail (DEC-036): a preallocated pool of particles behind a moving kart,
// headless like everything the server steps (DEC-014).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { TRAILS } from './kartstyle.js';
import { buildTrail, MIN_SPEED, POOL, rearOf } from './trail.js';

const STEP = 1 / 60;
const kart = (speed, heading = 0) => ({ pos: { x: 10, z: -5 }, y: 0, heading, speed, boost: 0 });
const live = t => t.group.children.filter(o => o.visible);
const KINDS = TRAILS.filter(k => k !== 'none');

describe('rearOf', () => {
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 3, 2.4])('puts the spawn point 1.5 behind the kart at heading %s, at axle height', heading => {
    const k = kart(20, heading); const out = new THREE.Vector3();
    expect(rearOf(k, out)).toBe(out);
    const dx = out.x - k.pos.x, dz = out.z - k.pos.z;
    expect(Math.hypot(dx, dz)).toBeCloseTo(1.5);
    // behind: against the kart's forward vector (sin h, cos h), the way updateKartVisual and the camera read the heading
    expect(dx * Math.sin(heading) + dz * Math.cos(heading)).toBeCloseTo(-1.5);
    expect(out.y).toBeCloseTo(0.4);
  });

  it('follows the kart up a ramp', () => {
    expect(rearOf({ ...kart(5), y: 2 }, new THREE.Vector3()).y).toBeCloseTo(2.4);
  });
});

describe('buildTrail', () => {
  it('is null for none and for nonsense', () => {
    expect(buildTrail('none')).toBeNull();
    expect(buildTrail('plasma')).toBeNull();
    expect(buildTrail(undefined)).toBeNull();
  });

  it.each(KINDS)('%s has a pool of 24 hidden particles in one group', kind => {
    const t = buildTrail(kind);
    expect(t.group.children).toHaveLength(POOL);
    expect(live(t)).toHaveLength(0);
    expect(t.group.name).toBe('trail:' + kind);
  });

  it.each(KINDS)('%s spawns nothing below the minimum speed', kind => {
    const t = buildTrail(kind);
    for (const speed of [0, MIN_SPEED - 0.1, MIN_SPEED, -20]) {
      for (let n = 0; n < 60; n++) t.update(kart(speed), STEP);
      expect(live(t)).toHaveLength(0);
    }
  });

  it.each(KINDS)('%s uses every particle within 2 s at speed 20, none past its life, and recycles the oldest', kind => {
    const t = buildTrail(kind); const used = new Set(); let maxLive = 0;
    const k = kart(20);
    for (let n = 0; n < 2 * 60; n++) {
      k.pos.x += k.speed * STEP; t.update(k, STEP);
      for (const o of t.group.children) if (o.visible) { used.add(o); expect(o.userData.age).toBeLessThan(o.userData.life); }
      maxLive = Math.max(maxLive, live(t).length);
    }
    expect(used.size).toBe(POOL);
    expect(maxLive).toBeLessThanOrEqual(POOL);
    // the particles born last are the ones still alive; the first ones died or were recycled
    const ages = t.group.children.filter(o => o.visible).map(o => o.userData.age);
    expect(ages.length).toBeGreaterThan(0);
    expect(Math.max(...ages)).toBeLessThanOrEqual(t.group.children[0].userData.life);
  });

  it('spawns at the rear and every particle moves in world space, not with the kart', () => {
    const t = buildTrail('ribbon'); const k = kart(30, 1.0); const at = rearOf(k, new THREE.Vector3());
    t.update(k, 0.05);                                 // one spawn
    const born = live(t)[0];
    expect(born.position.distanceTo(at)).toBeLessThan(1e-6);
    k.pos.x += 10; t.update(k, 0.01);
    expect(born.position.distanceTo(at)).toBeLessThan(1e-6);      // a ribbon stays where it was laid
  });

  it('spawns faster at top speed than at a crawl', () => {
    const count = speed => { const t = buildTrail('smoke'); const k = kart(speed); for (let n = 0; n < 12; n++) t.update(k, STEP); return live(t).length; };
    expect(count(42)).toBeGreaterThan(count(5));
  });

  it('fades every particle as it ages', () => {
    const t = buildTrail('sparkles'); const k = kart(20);
    t.update(k, 0.05); const p = live(t)[0]; const a0 = p.material.opacity;
    for (let n = 0; n < 20; n++) t.update(kart(0), STEP);
    expect(p.material.opacity).toBeLessThan(a0);
    expect(p.material.transparent).toBe(true);
  });

  it('keeps the same 24 objects whatever happens: nothing is added or replaced per frame', () => {
    const t = buildTrail('confetti'); const k = kart(40); const objs = [...t.group.children];
    for (let n = 0; n < 240; n++) { k.pos.z += 0.5; t.update(k, STEP); }
    expect(t.group.children).toEqual(objs);
  });

  it.each(KINDS)('%s dispose empties the pool and releases its materials', kind => {
    const t = buildTrail(kind); const mats = []; t.group.traverse(o => { if (o.isMesh) mats.push(o.material); });
    expect(mats.length).toBeGreaterThanOrEqual(POOL);
    let disposed = 0; for (const m of mats) m.addEventListener('dispose', () => disposed++);
    t.dispose();
    expect(t.group.children).toHaveLength(0);
    expect(disposed).toBe(mats.length);
    t.update(kart(30), STEP);      // harmless afterwards
  });
});
