// The hemicycle stage scene (PLAN stage 4): what each tier draws and costs,
// a light rig that never changes (so a candidate swap never recompiles), a
// time step that cannot go backwards (the template's blank-stage bug, PLAN
// 1.2 A.1), confetti that replays from its seed, and a dispose() that frees
// exactly what the module built. Headless, like the game server: no DOM, no
// renderer, the canvas textures blank.
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mat } from './primitives.js';
import { buildStageScene, MAX_DT, PODIUM, rng, seatPositions, SKY_RADIUS, STAGE_SCALE, STAGE_TIERS } from './hemicycle.js';
import { GOLD, linear, RIM } from './stagelook.js';

const TIERS = ['high', 'phone', 'low'];
/** The plan's static budgets (PLAN 6, stage 4): draws and triangles a frame, shadow pass included. */
const BUDGET = { high: { draws: 45, triangles: 25000 }, phone: { draws: 45, triangles: 25000 }, low: { draws: 30, triangles: 10000 } };

const stages = [];
/** Build a stage and remember it, so every test's stages are disposed afterwards. */
const build = (tier, opts) => { const s = buildStageScene(tier, opts); stages.push(s); return s; };
afterEach(() => { while (stages.length) stages.pop().dispose(); });

const byName = (s, name) => s.scene.getObjectByName(name);
const lightsOf = s => { const out = []; s.scene.traverse(o => { if (o.isLight) out.push(o); }); return out; };
const drawables = s => { const out = []; s.scene.traverse(o => { if (o.isMesh || o.isLine || o.isPoints) out.push(o); }); return out; };
const materialsOf = s => [...new Set(drawables(s).map(o => o.material))];
const texturesOf = m => Object.values(m).filter(v => v && v.isTexture);
const snapshot = s => Array.from(byName(s, 'confetti').instanceMatrix.array);
const close = (a, b, eps = 1e-6) => Math.abs(a.r - b.r) < eps && Math.abs(a.g - b.g) < eps && Math.abs(a.b - b.b) < eps;

describe('STAGE_TIERS and the podium', () => {
  it('builds 10 tiers on high and phone, 6 on low, with the plan\'s shadow and confetti', () => {
    expect(STAGE_TIERS.high).toMatchObject({ rows: 10, shadow: 2048, confetti: 240, cone: true, rays: true, ledLines: false });
    expect(STAGE_TIERS.phone).toMatchObject({ rows: 10, shadow: 1024, confetti: 240, cone: true, rays: true, ledLines: false });
    expect(STAGE_TIERS.low).toMatchObject({ rows: 6, shadow: 0, confetti: 80, cone: false, rays: false, ledLines: true, sky: [32, 16] });
    for (const t of TIERS) expect(Object.isFrozen(STAGE_TIERS[t])).toBe(true);
  });

  it('sizes the podium for the game kart (A-037: top radius about 2.8)', () => {
    expect(PODIUM.radius).toBeCloseTo(2.8, 5);
    expect(PODIUM.foot).toBeGreaterThan(PODIUM.radius);
    expect(PODIUM.top).toBeCloseTo(0.22 * STAGE_SCALE, 6);
    // a 4.1 x 2.6 kart turning on it stays on the top
    expect(Math.hypot(4.1 / 2, 2.6 / 2)).toBeLessThan(PODIUM.radius);
    expect(SKY_RADIUS).toBeCloseTo(90 * STAGE_SCALE, 6);
  });

  it('puts the turntable\'s origin on the podium top, with the drum below it', () => {
    const s = build('high');
    expect(s.turntable.position.y).toBeCloseTo(PODIUM.top, 6);
    const drum = byName(s, 'drum');
    expect(drum.parent).toBe(s.turntable);
    drum.geometry.computeBoundingBox();
    expect(drum.position.y + drum.geometry.boundingBox.max.y).toBeCloseTo(0, 6);
    expect(byName(s, 'podium-top').parent).toBe(s.turntable);
    expect(byName(s, 'ring').parent).toBe(s.turntable);
    expect(byName(s, 'strip').parent).not.toBe(s.turntable); // the tint strip stays put
    expect(s.turntable.children.every(c => c.isMesh)).toBe(true); // nothing else for the caller to trip over
  });

  it('falls back to high for an unknown tier', () => {
    expect(build('ultra').info().tier).toBe('high');
  });
});

describe('draw objects and triangles per tier', () => {
  it.each(TIERS)('%s stays inside the static budget, shadow pass included', tier => {
    const s = build(tier), i = s.info();
    expect(i.draws).toBeLessThanOrEqual(BUDGET[tier].draws);
    expect(i.triangles).toBeLessThanOrEqual(BUDGET[tier].triangles);
    expect(i.lights).toBe(5);
  });

  it('draws exactly these objects on high and phone', () => {
    for (const tier of ['high', 'phone']) {
      const s = build(tier), names = drawables(s).map(o => o.name).sort();
      expect(names).toEqual(['cone', 'confetti', 'drum', 'ground', 'leds', 'podium-top', 'pool', 'ring', 'risers', 'seats', 'sky', 'strip', 'treads']);
      expect(s.info()).toMatchObject({ draws: 14, casters: 1, shadow: STAGE_TIERS[tier].shadow, rows: 10, confetti: 240 });
      expect(byName(s, 'leds').isMesh).toBe(true);
    }
  });

  it('draws exactly these objects on low: no cone, the LEDs one line mesh, no shadow pass', () => {
    const s = build('low'), names = drawables(s).map(o => o.name).sort();
    expect(names).toEqual(['confetti', 'drum', 'ground', 'leds', 'podium-top', 'pool', 'ring', 'risers', 'seats', 'sky', 'strip', 'treads']);
    expect(byName(s, 'leds').isLineSegments).toBe(true);
    expect(s.info()).toMatchObject({ draws: 12, casters: 0, shadow: 0, rows: 6, confetti: 80 });
  });

  it('seats every tier as instances of one mesh, about 430 on high and 210 on low', () => {
    const hi = build('high'), lo = build('low');
    for (const [s, rows] of [[hi, 10], [lo, 6]]) {
      const seats = byName(s, 'seats');
      expect(seats.isInstancedMesh).toBe(true);
      expect(seats.count).toBe(seatPositions(rows).length);
      expect(s.info().seats).toBe(seats.count);
    }
    expect(hi.info().seats).toBeGreaterThan(400);
    expect(lo.info().seats).toBeGreaterThan(200);
    expect(lo.info().seats).toBeLessThan(270);
  });

  it('stands every seat on its tread, facing the podium', () => {
    const s = build('high'), seats = byName(s, 'seats'), m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), fwd = new THREE.Vector3();
    for (let i = 0; i < seats.count; i++) {
      seats.getMatrixAt(i, m); m.decompose(p, q, sc);
      const r = Math.hypot(p.x, p.z), k = Math.round((p.y - 0.42) / 0.42), R = 7.4 + k * 0.95;
      expect(k).toBeGreaterThanOrEqual(0); expect(k).toBeLessThan(10);
      expect(r).toBeGreaterThan(R - 0.5); expect(r).toBeLessThan(R + 0.45);
      expect(p.z).toBeLessThan(0); // behind the podium, the camera is on +z
      fwd.set(0, 0, 1).applyQuaternion(q);
      expect(fwd.x * -p.x + fwd.z * -p.z).toBeGreaterThan(0.99 * r);
    }
  });

  it('faces every merged hemicycle surface the way its normals say (risers and strips to the podium, treads up)', () => {
    const s = build('high'), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (const [name, want] of [['risers', 'in'], ['treads', 'up'], ['leds', 'in']]) {
      const g = byName(s, name).geometry, pos = g.attributes.position, nrm = g.attributes.normal, idx = g.index;
      for (let t = 0; t < idx.count; t += 3) {
        a.fromBufferAttribute(pos, idx.getX(t)); b.fromBufferAttribute(pos, idx.getX(t + 1)); c.fromBufferAttribute(pos, idx.getX(t + 2));
        const face = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        n.fromBufferAttribute(nrm, idx.getX(t));
        expect(face.dot(n)).toBeGreaterThan(0.99);
        if (want === 'up') expect(face.y).toBeGreaterThan(0.99);
        else expect(face.x * -a.x + face.z * -a.z).toBeGreaterThan(0); // towards the centre
      }
    }
  });

  it('lights only what it means to: the key spot casts (not on low), the drum casts, the floor receives', () => {
    for (const tier of TIERS) {
      const s = build(tier), casters = lightsOf(s).filter(l => l.castShadow);
      expect(casters.map(l => l.name)).toEqual(tier === 'low' ? [] : ['key']);
      if (tier !== 'low') expect(casters[0].shadow.mapSize.x).toBe(STAGE_TIERS[tier].shadow);
      expect(drawables(s).filter(o => o.castShadow).map(o => o.name)).toEqual(['drum']);
      for (const name of ['ground', 'podium-top', 'drum']) expect(byName(s, name).receiveShadow).toBe(true);
    }
  });
});

describe('materials', () => {
  it('lights the hemicycle with stage materials only, never the race\'s, and no rim term', () => {
    const race = new Set(['#0b1030', '#3a2416', '#171c40'].map(c => mat(c)));
    for (const tier of TIERS) {
      const s = build(tier);
      for (const m of materialsOf(s)) {
        expect(race.has(m)).toBe(false);
        if (m.isMeshStandardMaterial) {
          expect(m.userData.stage).toBe(tier === 'low' ? 'std' : 'phys');
          expect(m.onBeforeCompile.toString()).not.toContain('uRimC'); // rim: false
        }
      }
      expect(!!byName(s, 'seats').material.isMeshPhysicalMaterial).toBe(tier !== 'low');
      expect(byName(s, 'sky').material.isShaderMaterial).toBe(true);
    }
  });

  it('gives the sky its rays on high and phone only', () => {
    expect(byName(build('high'), 'sky').material.defines.SKY_RAYS).toBe(1);
    expect(byName(build('phone'), 'sky').material.defines.SKY_RAYS).toBe(1);
    expect(byName(build('low'), 'sky').material.defines.SKY_RAYS).toBeUndefined();
    expect(byName(build('low'), 'sky').material.defines.SKY_LOW_GLOW).toBe('0.6');
    expect(byName(build('high'), 'sky').material.defines.SKY_LOW_GLOW).toBeUndefined();
    const low = byName(build('low'), 'sky').geometry.parameters;
    expect([low.widthSegments, low.heightSegments]).toEqual([32, 16]);
  });

  it('bakes a contact shadow into the podium floor on low only', () => {
    const hi = byName(build('high'), 'podium-top').material.map, lo = byName(build('low'), 'podium-top').material.map;
    expect(hi.name).toMatch(/^floor:1024$/);
    expect(lo.name).toMatch(/^floor:512:/);
  });

  it('uses the fog colour as authored (sRGB, converted to linear) and reaches the hemicycle', () => {
    const s = build('high');
    expect(close(s.scene.fog.color, linear(0x0c1230))).toBe(true);
    expect(s.scene.fog.far).toBeCloseTo(34 * STAGE_SCALE, 6);
  });
});

describe('the light rig', () => {
  it('is the same five lights on every tier: hemisphere, key and top spots, rim and fill', () => {
    for (const tier of TIERS) {
      const ls = lightsOf(build(tier));
      expect(ls.map(l => l.type).sort()).toEqual(['DirectionalLight', 'DirectionalLight', 'HemisphereLight', 'SpotLight', 'SpotLight']);
    }
  });

  it('never gains or loses a light, or a material version, whatever is called', () => {
    const s = build('high'), before = lightsOf(s).map(l => l.uuid), mats = materialsOf(s), versions = mats.map(m => m.version);
    s.setTint(0xff4a5e); for (let i = 0; i < 30; i++) s.update(1 / 60);
    s.burst(); s.update(0.05);
    s.setTint(0x7ee0a0, true); s.update(-5); s.update(NaN);
    expect(lightsOf(s).map(l => l.uuid)).toEqual(before);
    expect(s.info().lights).toBe(5);
    expect(mats.map(m => m.version)).toEqual(versions); // no needsUpdate: nothing recompiles
    expect(materialsOf(s)).toEqual(mats);
  });
});

describe('setTint', () => {
  it('jumps on request: the rim term, rim light, sky, strip and pool all take the tint', () => {
    const s = build('high'), t = linear(0xff4a5e);
    s.setTint(0xff4a5e, true);
    expect(close(RIM.color.value, t)).toBe(true);
    expect(close(byName(s, 'rim').color, t)).toBe(true);
    expect(close(byName(s, 'sky').material.uniforms.uTint.value, t)).toBe(true);
    expect(close(byName(s, 'strip').material.color, t.clone().multiplyScalar(2.2))).toBe(true);
    expect(close(byName(s, 'pool').material.color, t.clone().lerp(linear(0xffd9a0), 0.6))).toBe(true);
  });

  it('eases otherwise, and gets there', () => {
    const s = build('high', { tint: GOLD }), from = linear(GOLD), to = linear(0x5d7bff);
    s.setTint(0x5d7bff);
    expect(close(RIM.color.value, from)).toBe(true); // nothing moves before a step
    s.update(1 / 60);
    const d0 = Math.abs(RIM.color.value.b - to.b);
    expect(d0).toBeLessThan(Math.abs(from.b - to.b));
    expect(d0).toBeGreaterThan(0.01);
    for (let i = 0; i < 240; i++) s.update(1 / 60);
    expect(close(RIM.color.value, to, 1e-3)).toBe(true);
  });

  it('starts at the tint it was built with', () => {
    build('low', { tint: 0x7ee0a0 });
    expect(close(RIM.color.value, linear(0x7ee0a0))).toBe(true);
  });
});

describe('the time step', () => {
  it('clamps to [0, MAX_DT]: a negative or NaN step is a still frame (PLAN 1.2 A.1)', () => {
    const s = build('high', { seed: 3 });
    s.setTint(0xff4a5e);
    const rim = RIM.color.value.clone(), conf = snapshot(s), time = byName(s, 'sky').material.uniforms.uTime.value;
    s.update(-23.7); s.update(NaN); s.update(-Infinity); s.update(0);
    expect(RIM.color.value.equals(rim)).toBe(true);
    expect(snapshot(s)).toEqual(conf);
    expect(byName(s, 'sky').material.uniforms.uTime.value).toBe(time);
    expect([RIM.color.value.r, RIM.color.value.g, RIM.color.value.b].every(Number.isFinite)).toBe(true);
  });

  it('takes a long step as one MAX_DT step, never extrapolating', () => {
    const a = build('high', { seed: 3 }), b = build('high', { seed: 3 });
    a.setTint(0xff4a5e); b.setTint(0xff4a5e);
    a.update(1e9); const rimA = RIM.color.value.clone();
    b.update(MAX_DT); const rimB = RIM.color.value.clone();
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(close(rimA, rimB)).toBe(true);
    expect(MAX_DT).toBe(0.05);
    for (const v of snapshot(a)) expect(Number.isFinite(v)).toBe(true);
  });

  it('drives the sky from the caller\'s clock when given, its own clamped clock otherwise', () => {
    const s = build('high'), u = byName(s, 'sky').material.uniforms.uTime;
    s.update(0.02); s.update(0.02);
    expect(u.value).toBeCloseTo(0.04, 9);
    s.update(0.02, 12.5);
    expect(u.value).toBe(12.5);
  });
});

describe('confetti', () => {
  it('replays exactly from its seed, burst included', () => {
    const run = seed => {
      const s = build('high', { seed });
      for (let i = 0; i < 90; i++) s.update(1 / 60);
      s.burst();
      for (let i = 0; i < 60; i++) s.update(1 / 60);
      return snapshot(s);
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('carries 240 pieces on high and 80 on low, in the four stage colours', () => {
    for (const [tier, n] of [['high', 240], ['low', 80]]) {
      const c = byName(build(tier), 'confetti');
      expect(c.count).toBe(n);
      expect(c.instanceColor.count).toBe(n);
      const col = new THREE.Color(); c.getColorAt(1, col);
      expect(close(col, linear(0xfffaf0))).toBe(true);
    }
  });

  it('throws every other piece up from the podium on burst, and they come back down', () => {
    const s = build('high'), c = byName(s, 'confetti'), m = new THREE.Matrix4(), p = new THREE.Vector3();
    s.burst(); s.update(1 / 60);
    c.getMatrixAt(0, m); p.setFromMatrixPosition(m);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(1.2);
    expect(p.y).toBeGreaterThan(1.2);
    for (let i = 0; i < 60 * 20; i++) s.update(1 / 60);
    for (let i = 0; i < c.count; i++) { c.getMatrixAt(i, m); p.setFromMatrixPosition(m); expect(p.y).toBeGreaterThanOrEqual(-0.1); expect(p.y).toBeLessThan(12); }
  });

  it('rng is deterministic and in [0, 1)', () => {
    const a = rng(42), b = rng(42), xs = Array.from({ length: 1000 }, a);
    expect(Array.from({ length: 1000 }, b)).toEqual(xs);
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true);
  });
});

describe('dispose', () => {
  it('frees every geometry, every material and texture it built, and the shadow map; never the shared ones', () => {
    const s = buildStageScene('high'), disposed = new Set();
    const watch = o => o.addEventListener('dispose', () => disposed.add(o));
    const geos = drawables(s).map(o => o.geometry), mats = materialsOf(s), texs = [...new Set(mats.flatMap(texturesOf))];
    [...geos, ...mats, ...texs].forEach(watch);
    const shadow = vi.spyOn(byName(s, 'key').shadow, 'dispose');
    const own = mats.filter(m => !m.userData.stage), shared = mats.filter(m => m.userData.stage);
    expect(own.length).toBe(s.info().ownMaterials);
    expect(shared.length).toBeGreaterThan(5);
    s.dispose();
    for (const g of geos) expect(disposed.has(g)).toBe(true);
    for (const m of own) expect(disposed.has(m)).toBe(true);
    for (const m of shared) expect(disposed.has(m)).toBe(false); // stagelook's cache: other stages and pilots share them
    for (const t of texs) expect(disposed.has(t)).toBe(/^stage:/.test(t.name)); // the gradients are ours; the floor and the wool are fabric.js's
    expect(texs.filter(t => /^stage:/.test(t.name)).map(t => t.name).sort()).toEqual(['stage:cone', 'stage:pool']);
    expect(shadow).toHaveBeenCalled();
    expect(s.scene.children).toHaveLength(0);
  });

  it('is safe to call twice, and update() does nothing afterwards', () => {
    const s = buildStageScene('low');
    s.dispose();
    expect(() => s.dispose()).not.toThrow();
    expect(() => { s.update(0.016); s.burst(); s.setTint(0xffffff); }).not.toThrow();
  });

  it('leaves a second stage built from the same caches intact', () => {
    const a = buildStageScene('high'), b = build('high');
    a.dispose();
    const seats = byName(b, 'seats');
    expect(seats.material.map).toBeTruthy();
    expect(seats.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(() => b.update(0.016)).not.toThrow();
  });
});
