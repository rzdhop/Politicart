// The stage's procedural fabrics: deterministic pixels, blank and free
// headless (this file runs in Node, like the game server), cached by kind
// and size so pilots share every texture.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { CLOTHS, fabric, fabricPixels, fabricSize, FABRICS, fabricTextures, fbm, hemicycleFloor, roundel, stripes, SURFACES, surfaceSpec, TEX_TIERS, textureBytes, textureTier } from './fabric.js';
import { phys, stageMat, std } from './stagelook.js';

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

describe('fabric kinds', () => {
  it('cover the brief and stage 2\'s cloth vocabulary', () => {
    expect([...FABRICS].sort()).toEqual(['corduroy', 'fleece', 'hair', 'hivis', 'puffer', 'ripstop', 'satin', 'skin', 'tread', 'wool']);
    expect(CLOTHS).toEqual(['wool', 'corduroy', 'puffer', 'satin', 'hivis', 'fleece', 'cotton', 'velvet', 'ripstop']);
  });
});

describe('fabricPixels', () => {
  it.each(FABRICS)('%s is deterministic: same kind, size and seed, same bytes', kind => {
    const a = fabricPixels(kind, 64), b = fabricPixels(kind, 64);
    expect(a.albedo).toHaveLength(64 * 64 * 4);
    expect(a.normal).toHaveLength(64 * 64 * 4);
    expect(same(a.albedo, b.albedo)).toBe(true);
    expect(same(a.normal, b.normal)).toBe(true);
    expect(same(fabricPixels(kind, 64, { seed: 5 }).albedo, fabricPixels(kind, 64, { seed: 5 }).albedo)).toBe(true);
  });

  it.each(FABRICS.filter(k => k !== 'tread'))('%s changes with the seed', kind => {
    const a = fabricPixels(kind, 64), b = fabricPixels(kind, 64, { seed: 1 });
    expect(same(a.normal, b.normal)).toBe(false);
  });

  it('is opaque, and its normals point out of the surface', () => {
    for (const kind of FABRICS) {
      const { albedo, normal } = fabricPixels(kind, 32);
      for (let i = 3; i < albedo.length; i += 4) expect(albedo[i]).toBe(255);
      for (let i = 2; i < normal.length; i += 4) expect(normal[i]).toBeGreaterThan(127);
    }
  });

  it('bakes no normal map when asked not to', () => {
    expect(fabricPixels('wool', 32, { normals: false }).normal).toBeNull();
  });

  it('shows relief: the normal map is not flat', () => {
    for (const kind of FABRICS) {
      const { normal } = fabricPixels(kind, 64);
      let tilted = 0;
      for (let i = 0; i < normal.length; i += 4) if (Math.abs(normal[i] - 128) > 6 || Math.abs(normal[i + 1] - 128) > 6) tilted++;
      expect(tilted).toBeGreaterThan(64 * 64 * 0.05);
    }
  });

  it('greys every kind but hi-vis, which carries its yellow', () => {
    for (const kind of ['wool', 'corduroy', 'puffer', 'satin', 'fleece', 'hair', 'tread', 'ripstop']) {
      const { albedo } = fabricPixels(kind, 32);
      for (let i = 0; i < albedo.length; i += 4) { expect(albedo[i]).toBe(albedo[i + 1]); expect(albedo[i + 1]).toBe(albedo[i + 2]); }
    }
    const { albedo } = fabricPixels('hivis', 32);
    expect(albedo[1]).toBeGreaterThan(albedo[2] + 100);
  });

  it('rejects an unknown kind', () => {
    expect(() => fabricPixels('tweed', 32)).toThrow(/unknown kind/);
  });
});

describe('fbm', () => {
  it('tiles: period 1 in u and v', () => {
    for (const [u, v] of [[0.1, 0.2], [0.33, 0.9], [0.77, 0.05]]) {
      expect(fbm(u + 1, v, 8, 8, 3, 5)).toBeCloseTo(fbm(u, v, 8, 8, 3, 5), 9);
      expect(fbm(u, v + 1, 8, 4, 3, 5)).toBeCloseTo(fbm(u, v, 8, 4, 3, 5), 9);
    }
  });
});

describe('fabric sizes by tier', () => {
  it('maps a detail tier and a coarse pointer to a texture tier', () => {
    expect(textureTier('high')).toBe('high');
    expect(textureTier('high', true)).toBe('phone');
    expect(textureTier('low')).toBe('low');
    expect(textureTier('low', true)).toBe('low');
  });

  it('bakes weaves at 512 on high and 256 on phone and low; the floor at 1024 or 512', () => {
    for (const kind of ['wool', 'corduroy', 'puffer', 'hair']) {
      expect(fabricSize(kind, 'high').size).toBe(512);
      expect(fabricSize(kind, 'phone').size).toBe(256);
      expect(fabricSize(kind, 'low').size).toBe(256);
    }
    for (const kind of ['skin', 'tread', 'satin', 'hivis', 'fleece', 'ripstop']) {
      expect(fabricSize(kind, 'high').size).toBe(256);
      expect(fabricSize(kind, 'low').size).toBe(128);
    }
    expect(TEX_TIERS.high.floor).toBe(1024);
    expect(TEX_TIERS.low.floor).toBe(512);
    expect(TEX_TIERS.low.normals).toBe(false);
  });

  it('keeps a fine weave\'s size on screen when it bakes smaller', () => {
    expect(fabricSize('wool', 'high').repeat).toEqual([5, 5]);
    expect(fabricSize('wool', 'low').repeat).toEqual([10, 10]);
    expect(fabricSize('puffer', 'low').repeat).toEqual([1, 1]); // 8 baffles a tile stay 8: nothing to alias
  });
});

describe('fabric textures, headless', () => {
  it('are blank textures: nothing is drawn without a document', () => {
    const { map, normalMap } = fabric('wool');
    expect(map).toBeInstanceOf(THREE.Texture);
    expect(map.image).toBeUndefined();
    expect(normalMap.image).toBeUndefined();
    expect(fabricTextures().bytes).toBe(0);
  });

  it('are dressed: sRGB albedo, linear normals, tiling with the kind\'s repeat', () => {
    const { map, normalMap } = fabric('corduroy');
    expect(map.encoding).toBe(THREE.sRGBEncoding);
    expect(normalMap.encoding).toBe(THREE.LinearEncoding);
    for (const t of [map, normalMap]) {
      expect(t.wrapS).toBe(THREE.RepeatWrapping);
      expect(t.wrapT).toBe(THREE.RepeatWrapping);
      expect(t.repeat.toArray()).toEqual([3, 2]);
    }
    expect(map.name).toBe('fabric:corduroy:512');
  });

  it('are cached by kind and size: pilots share them', () => {
    expect(fabric('wool').map).toBe(fabric('wool').map);
    expect(fabric('wool', 'high').map).not.toBe(fabric('wool', 'low').map);
    // phone and low both bake wool at 256: one texture, low just leaves the normal map out
    expect(fabric('wool', 'phone').map).toBe(fabric('wool', 'low').map);
    expect(fabric('wool', 'low').normalMap).toBeNull();
    expect(fabric('wool', 'phone').normalMap).toBeInstanceOf(THREE.Texture);
    expect(fabric('fleece', 'low').normalMap).toBeNull();
    expect(fabric('fleece', 'phone').normalMap).toBeInstanceOf(THREE.Texture); // baked later, on demand
  });

  it('include the stripes, the roundel and the floor, cached by what they draw', () => {
    expect(stripes()).toBe(stripes());
    expect(stripes('#000', '#fff', 6)).not.toBe(stripes());
    expect(roundel(7, 0x1f3a93)).toBe(roundel(7, '#1f3a93'));
    expect(roundel(7, 0x1f3a93)).not.toBe(roundel(8, 0x1f3a93));
    expect(roundel(7, 0x1f3a93, 'low')).not.toBe(roundel(7, 0x1f3a93));
    expect(hemicycleFloor()).toBe(hemicycleFloor('high'));
    expect(hemicycleFloor('low')).not.toBe(hemicycleFloor('high'));
    expect(hemicycleFloor('low', { contact: [0.5, 0.7] })).not.toBe(hemicycleFloor('low'));
    for (const t of [stripes(), roundel(3, 0xff0000), hemicycleFloor()]) { expect(t.image).toBeUndefined(); expect(t.encoding).toBe(THREE.sRGBEncoding); }
  });
});

describe('textureBytes', () => {
  it('counts RGBA8 and a third more for the mip chain', () => {
    const t = new THREE.Texture({ width: 512, height: 512 });
    expect(textureBytes(t)).toBe(Math.round(512 * 512 * 4 * 4 / 3));
    t.generateMipmaps = false;
    expect(textureBytes(t)).toBe(512 * 512 * 4);
    expect(textureBytes(new THREE.Texture())).toBe(0);
  });

  it('fits every texture tier\'s budget (PLAN 4.2) with all kinds, the floor and 16 roundels resident', () => {
    const MB = 1024 * 1024, budget = { high: 24 * MB, phone: 12 * MB, low: 5 * MB };
    for (const tier of ['high', 'phone', 'low']) {
      const t = TEX_TIERS[tier], tex = (w, mips = true) => { const x = new THREE.Texture({ width: w, height: w }); x.generateMipmaps = mips; return x; };
      let bytes = textureBytes(tex(t.floor)) + 16 * textureBytes(tex(t.roundel)) + textureBytes(new THREE.Texture({ width: 32, height: 256 }));
      for (const kind of FABRICS) bytes += textureBytes(tex(fabricSize(kind, tier).size)) * (t.normals ? 2 : 1);
      expect(bytes).toBeLessThanOrEqual(budget[tier]);
    }
  });
});

describe('surfaceSpec', () => {
  it.each(SURFACES)('%s is a valid stage material spec on both tiers', surface => {
    for (const tier of ['high', 'phone', 'low']) {
      const spec = surfaceSpec(surface, 0x336699, tier);
      expect(() => phys(spec)).not.toThrow();
      expect(() => std(spec)).not.toThrow();
    }
    expect(stageMat(surfaceSpec(surface, 0x336699), 'high').type).toBe('MeshPhysicalMaterial');
    expect(stageMat(surfaceSpec(surface, 0x336699, 'low'), 'low').type).toBe('MeshStandardMaterial');
  });

  it('textures the cloths that have a weave, and only colour differs between pilots', () => {
    const a = surfaceSpec('wool', 0x1a2a5e), b = surfaceSpec('wool', 0xc1121f);
    expect(a.map).toBe(b.map);
    expect(a.normalMap).toBe(b.normalMap);
    expect(phys(a)).not.toBe(phys(b));
    expect(surfaceSpec('ripstop', 0x2e8b57).map).toBe(fabric('ripstop').map);
    expect(surfaceSpec('velvet', 0x8e1426).map).toBe(fabric('wool').map);
    expect(surfaceSpec('cotton', 0xffffff).map).toBeUndefined();
    expect(surfaceSpec('hivis', 0xc1121f).color).toBe(0xffffff);
  });

  it('rejects an unknown surface', () => {
    expect(() => surfaceSpec('tweed', 0)).toThrow(/unknown surface/);
  });
});
