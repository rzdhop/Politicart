// The stage look (DEC-043): withLook isolates the renderer's look fields, and
// the stage material factory never hands the stage a material the race draws.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { mat } from './primitives.js';
import { ENV_INTENSITY, GOLD, injectRim, LOOK_FIELDS, linear, phys, RIM, setRimTint, STAGE_LOOK, stageMat, std, tintOf, withLook } from './stagelook.js';

/** A stand-in for the renderer: withLook only reads and writes the four look fields. */
const fakeRenderer = () => ({ toneMapping: THREE.NoToneMapping, toneMappingExposure: 1, outputEncoding: THREE.LinearEncoding, physicallyCorrectLights: false });
const snapshot = r => LOOK_FIELDS.map(k => r[k]);
const srgbToLinear = c => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));

describe('STAGE_LOOK', () => {
  it('is the template look in r128 terms', () => {
    expect(STAGE_LOOK).toEqual({ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08, outputEncoding: THREE.sRGBEncoding, physicallyCorrectLights: true });
    expect(Object.isFrozen(STAGE_LOOK)).toBe(true);
    expect([...LOOK_FIELDS].sort()).toEqual(Object.keys(STAGE_LOOK).sort());
  });
});

describe('withLook', () => {
  it('sets the four fields for the callback and returns its result', () => {
    const r = fakeRenderer();
    let seen = null;
    const out = withLook(r, STAGE_LOOK, () => { seen = snapshot(r); return 42; });
    expect(out).toBe(42);
    expect(seen).toEqual(LOOK_FIELDS.map(k => STAGE_LOOK[k]));
  });

  it('restores all four fields afterwards', () => {
    const r = fakeRenderer(), before = snapshot(r);
    withLook(r, STAGE_LOOK, () => {});
    expect(snapshot(r)).toEqual(before);
  });

  it('restores all four fields even when the callback throws', () => {
    const r = fakeRenderer(), before = snapshot(r);
    expect(() => withLook(r, STAGE_LOOK, () => { throw new Error('boom'); })).toThrow('boom');
    expect(snapshot(r)).toEqual(before);
  });

  it('restores fields the callback itself changed, and nests', () => {
    const r = fakeRenderer(), before = snapshot(r);
    withLook(r, STAGE_LOOK, () => {
      r.toneMappingExposure = 3;
      withLook(r, { toneMappingExposure: 0.5 }, () => { expect(r.toneMappingExposure).toBe(0.5); expect(r.toneMapping).toBe(THREE.ACESFilmicToneMapping); });
      expect(r.toneMappingExposure).toBe(3);
    });
    expect(snapshot(r)).toEqual(before);
  });
});

describe('linear', () => {
  it('converts authored sRGB to linear, whatever the notation', () => {
    const c = linear(0x808080);
    expect(c.r).toBeCloseTo(srgbToLinear(0x80 / 255), 6);
    expect(linear('#808080').equals(c)).toBe(true);
    expect(linear(new THREE.Color(0x808080)).equals(c)).toBe(true);
    expect(linear(0xffffff).r).toBe(1);
  });
});

describe('the stage material factory', () => {
  it('caches by parameters, not by name or colour notation', () => {
    const a = phys({ name: 'a', color: 0x123456, roughness: 0.4 });
    expect(phys({ name: 'b', color: '#123456', roughness: 0.4 })).toBe(a);
    expect(phys({ roughness: 0.4, color: 0x123456 })).toBe(a);
    expect(phys({ color: 0x123456, roughness: 0.41 })).not.toBe(a);
    expect(phys({ color: 0x123457, roughness: 0.4 })).not.toBe(a);
    expect(phys({ color: 0x123456, roughness: 0.4, rim: false })).not.toBe(a);
  });

  it('keys textures by identity', () => {
    const t1 = new THREE.Texture(), t2 = new THREE.Texture();
    expect(phys({ map: t1 })).toBe(phys({ map: t1 }));
    expect(phys({ map: t1 })).not.toBe(phys({ map: t2 }));
  });

  it('never returns a primitives.mat() instance', () => {
    const specs = [[0x1f3a93, 0.85], [0xc1121f, 0.3], [0xffffff, 0.85], [0x222222, 0.5]];
    const race = new Set(specs.map(([c, r]) => mat(c, r)));
    for (const [c, r] of specs) {
      for (const m of [phys({ color: c, roughness: r }), std({ color: c, roughness: r }), std({ color: c, roughness: r, metalness: 0.05 }), stageMat({ color: c, roughness: r }, 'low')]) {
        expect(race.has(m)).toBe(false);
        expect(m.userData.stage).toBeTruthy();
      }
    }
    // and the race cache is untouched: mat() still gives its own, legacy-coloured material
    expect(mat(0x1f3a93, 0.85).color.getHex()).toBe(0x1f3a93);
    expect(mat(0x1f3a93, 0.85).userData.stage).toBeUndefined();
  });

  it('converts every colour to linear', () => {
    const m = phys({ color: 0x808080, emissive: 0x404040, sheen: 0.5, sheenColor: 0xff8f70 });
    const half = srgbToLinear(0x80 / 255);
    expect(m.color.r).toBeCloseTo(half, 6);
    expect(m.emissive.r).toBeCloseTo(srgbToLinear(0x40 / 255), 6);
    // r184 sheen (a weight) x sheenColor becomes r128's one sheen Color
    expect(m.sheen.r).toBeCloseTo(srgbToLinear(1) * 0.5, 6);
    expect(m.sheen.g).toBeCloseTo(srgbToLinear(0x8f / 255) * 0.5, 6);
    expect(std({ color: 0x808080 }).color.r).toBeCloseTo(half, 6);
  });

  it('sets envMapIntensity per tier, overridable', () => {
    expect(phys({ color: 1 }).envMapIntensity).toBe(ENV_INTENSITY.high);
    expect(std({ color: 1 }).envMapIntensity).toBe(ENV_INTENSITY.low);
    expect(phys({ color: 1, envMapIntensity: 1 }).envMapIntensity).toBe(1);
  });

  it('builds clearcoat, sheen and normal maps on Physical', () => {
    const n = new THREE.Texture();
    const m = phys({ color: 0x1f3a93, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 1, normalMap: n, normalScale: 0.75 });
    expect(m).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(m.clearcoat).toBe(1);
    expect(m.clearcoatRoughness).toBe(0.05);
    expect(m.sheen).toBeInstanceOf(THREE.Color);
    expect(m.normalMap).toBe(n);
    expect(m.normalScale.toArray()).toEqual([0.75, 0.75]);
    expect(phys({ normalMap: n, normalScale: [1, -1] }).normalScale.toArray()).toEqual([1, -1]);
  });

  it('throws on an unknown parameter instead of ignoring a typo', () => {
    expect(() => phys({ colour: 0xff0000 })).toThrow(/unknown material parameter "colour"/);
    expect(() => std({ sheenRoughness: 0.4 })).toThrow(/sheenRoughness/);
  });
});

describe('the tier switch', () => {
  const spec = { color: 0x8e1426, roughness: 0.8, sheen: 1, sheenColor: 0xff6a78, clearcoat: 0.3, map: new THREE.Texture(), normalMap: new THREE.Texture(), normalScale: 1.1 };

  it('gives Physical on high', () => {
    const m = stageMat(spec, 'high');
    expect(m.type).toBe('MeshPhysicalMaterial');
    expect(stageMat(spec)).toBe(m);
  });

  it('gives Standard on low, without clearcoat, sheen or normal map but with its albedo map and rim', () => {
    const m = stageMat(spec, 'low');
    expect(m.type).toBe('MeshStandardMaterial');
    expect(m.isMeshPhysicalMaterial).toBeUndefined();
    expect(m.normalMap).toBeNull();
    expect(m.map).toBe(spec.map);
    expect(m.onBeforeCompile).toBe(injectRim);
    expect(m.envMapIntensity).toBe(ENV_INTENSITY.low);
  });

  it('shares one low material between specs that differ only in what low drops', () => {
    expect(stageMat({ ...spec, clearcoat: 0.9, sheen: 0.2 }, 'low')).toBe(stageMat(spec, 'low'));
    expect(stageMat({ ...spec, clearcoat: 0.9 }, 'high')).not.toBe(stageMat(spec, 'high'));
  });
});

describe('the rim light', () => {
  const compile = m => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    m.onBeforeCompile(shader);
    return shader;
  };

  it('finds its anchor in r128\'s physical/standard fragment shader', () => {
    expect(THREE.ShaderLib.physical.fragmentShader).toContain('gl_FragColor = vec4( outgoingLight, diffuseColor.a );');
    expect(THREE.ShaderLib.standard.fragmentShader).toBe(THREE.ShaderLib.physical.fragmentShader);
  });

  it('adds the rim term before the colour is written, on Physical and Standard', () => {
    for (const m of [phys({ color: 0x334455 }), std({ color: 0x334455 })]) {
      const s = compile(m);
      expect(s.fragmentShader.startsWith('uniform vec3 uRimC;\nuniform float uRimS;\n')).toBe(true);
      expect(s.fragmentShader).toMatch(/outgoingLight \+= uRimC \* rimF \* uRimS;\s*gl_FragColor = vec4\( outgoingLight, diffuseColor\.a \);/);
      expect(m.customProgramCacheKey()).toBe('stage-rim');
    }
  });

  it('shares one tint uniform across every program, so retinting never recompiles', () => {
    const a = compile(phys({ color: 0x111111 })), b = compile(std({ color: 0x222222 }));
    expect(a.uniforms.uRimC).toBe(RIM.color);
    expect(b.uniforms.uRimC).toBe(RIM.color);
    expect(a.uniforms.uRimS).toBe(RIM.strength);
    const value = RIM.color.value, key = phys({ color: 0x111111 }).customProgramCacheKey();
    setRimTint(0x808080, 0.7);
    expect(RIM.color.value).toBe(value);
    expect(RIM.color.value.r).toBeCloseTo(srgbToLinear(0x80 / 255), 6);
    expect(RIM.strength.value).toBe(0.7);
    expect(phys({ color: 0x111111 }).customProgramCacheKey()).toBe(key);
    setRimTint(GOLD, 0.55);
  });

  it('can be left out', () => {
    const m = phys({ color: 0x334455, rim: false });
    expect(m.onBeforeCompile).not.toBe(injectRim);
  });
});

describe('tintOf', () => {
  const hsl = hex => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 });

  it('keeps the kart hue and lifts lightness to 0.55 and saturation to 0.6', () => {
    const k = 0x1f3a93, t = hsl(tintOf({ kart: k }));
    expect(t.h).toBeCloseTo(hsl(k).h, 2);
    expect(t.s).toBeGreaterThanOrEqual(0.6 - 0.01);
    expect(t.l).toBeGreaterThanOrEqual(0.55 - 0.01);
  });

  it('leaves a kart that is already bright and saturated alone', () => {
    expect(tintOf({ kart: 0xf2c14e })).toBe(0xf2c14e);
    expect(tintOf({ kart: 0xe85d9a })).toBe(0xe85d9a);
  });

  it('falls back to gold for a kart with no hue', () => {
    expect(tintOf({ kart: 0x2b2b2b })).toBe(GOLD);
    expect(tintOf({ kart: 0x000000 })).toBe(GOLD);
    expect(tintOf({})).toBe(GOLD);
  });

  it('takes the per-candidate override first', () => {
    expect(tintOf({ kart: 0x1f3a93 }, 0xff0000)).toBe(0xff0000);
    expect(tintOf({ kart: 0x1f3a93 }, '#00ff00')).toBe(0x00ff00);
  });

  it('follows an admin kart recolour', () => {
    expect(tintOf({ kart: 0xc1121f })).not.toBe(tintOf({ kart: 0x2e8b57 }));
  });

  it.each(CHARACTERS.map(c => [c.id, c]))('gives %s a bright, saturated tint', (_id, c) => {
    const t = hsl(tintOf(c));
    expect(t.l).toBeGreaterThanOrEqual(0.54);
    expect(t.s).toBeGreaterThanOrEqual(0.59);
  });
});
