// The circuits' procedural surfaces: deterministic pixels with a normal map
// companion, blank and free headless (this file runs in Node, like the game
// server), sized by texture tier and baked once per tier.
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';

import { SURFACES, TEX, TEX_SIZES, bakedSurfaces, raceTextureTier, surface, texturePixels, textures } from './textures.js';
import { getPoly, togglePoly } from './state.js';

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const ROUGH = ['asphalt', 'cobble', 'cobbleGrid', 'zinc', 'rust'];
const high = () => { if (getPoly() !== 'high') togglePoly(); };

describe('the surface kinds', () => {
  it('cover the plan: road, ground, water, five facades, roofs, awning, metal, hedge', () => {
    expect([...SURFACES].sort()).toEqual(['asphalt', 'awning', 'brick', 'cobble', 'cobbleGrid', 'facade', 'grass', 'gravel', 'hedge', 'lawn', 'marseille', 'meadow', 'palace', 'plaster', 'rust', 'tiles', 'water', 'zinc']);
    expect(TEX_SIZES).toEqual({ high: 512, phone: 256, low: 256 });
  });
});

describe('texturePixels', () => {
  it.each(SURFACES)('%s is deterministic, opaque, with normals pointing out of the surface', kind => {
    const a = texturePixels(kind, 32), b = texturePixels(kind, 32);
    expect(a.albedo).toHaveLength(32 * 32 * 4); expect(a.normal).toHaveLength(32 * 32 * 4);
    expect(same(a.albedo, b.albedo)).toBe(true); expect(same(a.normal, b.normal)).toBe(true);
    for (let i = 3; i < a.albedo.length; i += 4) expect(a.albedo[i]).toBe(255);
    for (let i = 2; i < a.normal.length; i += 4) expect(a.normal[i]).toBeGreaterThan(127);
    expect(a.rough === null).toBe(!ROUGH.includes(kind));
    if (a.rough) { expect(a.rough).toHaveLength(32 * 32 * 4); expect(same(a.rough, b.rough)).toBe(true); }
  });

  it.each(SURFACES)('%s tiles: its height wraps, so the normals average to flat', kind => {
    const { normal } = texturePixels(kind, 48); let sx = 0, sy = 0; const n = 48 * 48;
    for (let i = 0; i < normal.length; i += 4) { sx += normal[i]; sy += normal[i + 1]; }
    expect(Math.abs(sx / n - 127.5)).toBeLessThan(6); expect(Math.abs(sy / n - 127.5)).toBeLessThan(6);
  });

  it('changes with the seed, and drops the normal map on request', () => {
    expect(same(texturePixels('grass', 32).albedo, texturePixels('grass', 32, { seed: 3 }).albedo)).toBe(false);
    expect(texturePixels('grass', 16, { normals: false }).normal).toBeNull();
    expect(() => texturePixels('marble', 16)).toThrow(/unknown kind/);
  });

  it('is not grey: each kind has its own colour', () => {
    const mean = kind => { const { albedo } = texturePixels(kind, 24); const c = [0, 0, 0]; for (let i = 0; i < albedo.length; i += 4) { c[0] += albedo[i]; c[1] += albedo[i + 1]; c[2] += albedo[i + 2]; } return c.map(x => x / (24 * 24)); };
    const grass = mean('grass'), water = mean('water'), brick = mean('brick'), asphalt = mean('asphalt');
    expect(grass[1]).toBeGreaterThan(grass[0]); expect(grass[1]).toBeGreaterThan(grass[2]);
    expect(water[2]).toBeGreaterThan(water[0]);
    expect(brick[0]).toBeGreaterThan(brick[2]);
    expect(asphalt[0]).toBeLessThan(90);
  });

  it('bakes every kind at the low tier in a bounded time (the race bakes 6 to 8 of them lazily)', () => {
    const t0 = performance.now(); const times = {};
    for (const kind of SURFACES) { const t = performance.now(); texturePixels(kind, 256); times[kind] = Math.round(performance.now() - t); }
    const total = performance.now() - t0;
    console.info('textures: ' + SURFACES.length + ' kinds at 256 px in ' + Math.round(total) + ' ms', times);
    expect(total).toBeLessThan(15000);
  }, 30000);
});

describe('textures(), headless', () => {
  afterEach(() => { high(); textures(); });

  it('makes blank textures without a document, one per kind, with a normal map and a roughness map where the kind has one', () => {
    high(); textures();
    expect(TEX.ready).toBe(true); expect(TEX.tier).toBe('high'); expect(raceTextureTier()).toBe('high');
    for (const kind of SURFACES) {
      const s = surface(kind);
      expect(s.map).toBeInstanceOf(THREE.Texture); expect(s.map.image).toBeUndefined();   // a stub: nothing drawn
      expect(s.map.name).toBe('tex:' + kind); expect(s.map.wrapS).toBe(THREE.RepeatWrapping);
      expect(s.normalMap).toBeInstanceOf(THREE.Texture); expect(s.normalMap.name).toBe('tex:' + kind + ':normal');
      expect(s.roughnessMap === null).toBe(!ROUGH.includes(kind));
      expect(TEX[kind]).toBe(s.map);
    }
    expect(TEX.cobble.repeat.x).toBe(3); expect(TEX.gravel.repeat.x).toBe(3); expect(TEX.asphalt.repeat.x).toBe(1);
  });

  it('is idempotent: the same tier gives the same textures, bakes nothing twice', () => {
    high(); textures();
    const a = surface('facade'); textures();
    expect(surface('facade')).toBe(a); expect(TEX.facade).toBe(a.map);
    expect(Object.keys(bakedSurfaces())).toContain('facade');
  });

  it('on the low tier bakes at 256 and drops the normal maps of the ground and the facades, not the road\'s or the water\'s', () => {
    high(); textures(); const old = surface('grass');
    togglePoly(); textures();
    expect(TEX.tier).toBe('low'); expect(TEX_SIZES[TEX.tier]).toBe(256);
    expect(surface('grass')).not.toBe(old);
    for (const k of ['grass', 'meadow', 'lawn', 'gravel', 'facade', 'brick', 'marseille', 'plaster', 'palace']) expect(surface(k).normalMap).toBeNull();
    for (const k of ['asphalt', 'cobble', 'cobbleGrid', 'water', 'zinc', 'tiles', 'awning', 'rust', 'hedge']) expect(surface(k).normalMap).toBeInstanceOf(THREE.Texture);
  });

  it('frees the old tier\'s bakes when the tier changes', () => {
    high(); textures();
    const s = surface('water'); let freed = 0; s.map.addEventListener('dispose', () => freed++); s.normalMap.addEventListener('dispose', () => freed++);
    togglePoly(); textures();
    expect(freed).toBe(2);
    expect(bakedSurfaces()).toEqual({});
  });
});
