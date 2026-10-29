// The circuits' climates (DEC-051): every preset builds headless with the
// same three lights (no program recompiles between races, PLAN A.4), sets
// the scene's fog and background, lights the lamps and the karts only at
// dusk and at night, rains only under an overcast sky, and noon is the race
// as it was lit before climates existed.
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';

import { CLIMATE_IDS, CLIMATES, applyClimate, headlightCone, pickClimate, sunOffset } from './climate.js';
import { resetMachine } from './machine.js';
import { simStep, startRace } from './race.js';
import { G } from './state.js';

const lightsOf = scene => scene.children.filter(o => o.isLight).map(o => o.type);
const named = (scene, name) => { const out = []; scene.traverse(o => { if (o.name === name) out.push(o); }); return out; };
/** A fresh scene with the race's per-scene lists reset, and `heads` lamp heads registered at world positions. */
function fresh(heads = []) {
  const scene = new THREE.Scene();
  G.lamps = heads.map(([x, y, z]) => { const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5)); head.position.set(x, y, z); scene.add(head); return { head, rise: 6.4 }; });
  G.animated = []; G.disposables = []; G.layout = null;
  return scene;
}

describe('the climate presets', () => {
  it('are the six of the plan, each complete', () => {
    expect(CLIMATE_IDS).toEqual(['dawn', 'noon', 'golden', 'dusk', 'night', 'overcast']);
    for (const c of Object.values(CLIMATES)) {
      expect(c.sky).toHaveLength(3);
      expect(c.sun).toMatchObject({ color: expect.any(Number), intensity: expect.any(Number), elevation: expect.any(Number), azimuth: expect.any(Number) });
      expect(c.hemi).toHaveLength(3); expect(c.ambient).toHaveLength(2);
      expect(c.fog.near).toBeLessThan(c.fog.far);
      expect(c.clouds.count).toBeGreaterThan(0);
      expect(typeof c.lampsOn).toBe('boolean'); expect(typeof c.rain).toBe('boolean');
    }
  });

  it('light the lamps at dusk and at night only, and rain only under an overcast sky', () => {
    for (const id of CLIMATE_IDS) {
      expect(CLIMATES[id].lampsOn).toBe(id === 'dusk' || id === 'night');
      expect(CLIMATES[id].rain).toBe(id === 'overcast');
    }
  });

  it('keep the sun at the legacy distance from the kart, and noon is the legacy light', () => {
    for (const id of CLIMATE_IDS) { const o = sunOffset(CLIMATES[id].sun); expect(Math.hypot(o.x, o.y, o.z)).toBeCloseTo(246.6, 0); expect(o.y).toBeGreaterThan(40); }
    const noon = sunOffset(CLIMATES.noon.sun);
    expect(Math.abs(noon.x - 120)).toBeLessThan(0.5); expect(Math.abs(noon.y - 200)).toBeLessThan(0.5); expect(Math.abs(noon.z - 80)).toBeLessThan(0.5);
    expect(CLIMATES.noon.fog).toEqual({ color: 0xc9dff2, near: 220, far: 700 });
    expect(CLIMATES.noon.hemi).toEqual([0xdfefff, 0x55663a, 0.55]);
    expect(CLIMATES.noon.sun).toMatchObject({ color: 0xfff4d6, intensity: 1.15 });
  });
});

describe('applyClimate, headless', () => {
  beforeEach(() => { fresh(); });

  it.each(CLIMATE_IDS)('%s builds the same three lights, in the same order, and never a point light', id => {
    const scene = fresh([[10, 6.4, 0]]);
    const { sun, preset } = applyClimate(scene, {}, id);
    expect(preset).toBe(CLIMATES[id]);
    expect(lightsOf(scene)).toEqual(['HemisphereLight', 'AmbientLight', 'DirectionalLight']);
    let lights = 0; scene.traverse(o => { if (o.isLight) lights++; expect(o.isPointLight).toBeFalsy(); expect(o.isSpotLight).toBeFalsy(); });
    expect(lights).toBe(3);
    expect(sun.isDirectionalLight).toBe(true); expect(G.sun).toBe(sun);
    expect(sun.shadow.mapSize.x).toBe(2048); expect(sun.shadow.camera.left).toBe(-110);
    expect(G.climate.id).toBe(id);
  });

  it.each(CLIMATE_IDS)('%s sets the fog, the background and the sun from its preset', id => {
    const scene = fresh(), c = CLIMATES[id];
    applyClimate(scene, {}, id);
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect(scene.fog.color.getHex()).toBe(c.fog.color); expect(scene.fog.near).toBe(c.fog.near); expect(scene.fog.far).toBe(c.fog.far);
    expect(scene.background.getHex()).toBe(c.fog.color);
    const o = sunOffset(c.sun); expect(G.sunOffset).toEqual(o);
    expect(G.sun.position.toArray()).toEqual([o.x, o.y, o.z]);
    expect(G.sun.color.getHex()).toBe(c.sun.color); expect(G.sun.intensity).toBe(c.sun.intensity);
    expect(named(scene, 'sky')).toHaveLength(1);
    expect(named(scene, 'disc')).toHaveLength(c.disc ? 1 : 0);
    expect(named(scene, 'cloud')).toHaveLength(c.clouds.count);
  });

  it('folds each cloud into one mesh that drifts east and wraps', () => {
    const scene = fresh();
    applyClimate(scene, {}, 'noon');
    const clouds = named(scene, 'cloud');
    for (const g of clouds) { const meshes = []; g.traverse(o => { if (o.isMesh) meshes.push(o); }); expect(meshes).toHaveLength(1); }
    expect(G.animated).toHaveLength(clouds.length);
    const x0 = clouds[0].position.x; G.animated[0](1); expect(clouds[0].position.x).toBeCloseTo(x0 + 2.5, 5);
    clouds[0].position.x = 800; G.animated[0](0.01); expect(clouds[0].position.x).toBe(-760);
  });

  it('lights the registered lamp heads at night, in two draws, and leaves them dark at noon', () => {
    const heads = [[10, 6.4, 0], [-30, 6.4, 50], [120, 6.4, -80]];
    const night = fresh(heads); applyClimate(night, {}, 'night');
    const glow = named(night, 'lampGlow'), pool = named(night, 'lampPool');
    expect(glow).toHaveLength(1); expect(pool).toHaveLength(1);
    expect(glow[0].geometry.index.count).toBe(heads.length * 2 * 6);     // two crossed quads per head
    expect(pool[0].geometry.index.count).toBe(heads.length * 6);
    for (const m of [glow[0], pool[0]]) { expect(m.material.blending).toBe(THREE.AdditiveBlending); expect(m.material.depthWrite).toBe(false); expect(m.isLight).toBeFalsy(); }
    // the pool sits at the lamp's foot, under its head
    const p = pool[0].geometry.attributes.position; expect(p.getY(0)).toBeCloseTo(6.4 - 6.4 + 0.42, 5);
    const noon = fresh(heads); applyClimate(noon, {}, 'noon');
    expect(named(noon, 'lampGlow')).toHaveLength(0); expect(named(noon, 'lampPool')).toHaveLength(0);
    const none = fresh(); applyClimate(none, {}, 'night');
    expect(named(none, 'lampGlow')).toHaveLength(0);
  });

  it('rains only under an overcast sky: a streak cylinder that follows the player', () => {
    const overcast = fresh(); applyClimate(overcast, {}, 'overcast');
    const rain = named(overcast, 'rain'); expect(rain).toHaveLength(1);
    G.player = { pos: { x: 40, z: -20 } };
    const follow = G.animated[G.animated.length - 1]; follow(0.5);
    expect(rain[0].position.x).toBe(40); expect(rain[0].position.z).toBe(-20);
    expect(rain[0].material.map.offset.y).toBeLessThan(0);
    const noon = fresh(); applyClimate(noon, {}, 'noon'); expect(named(noon, 'rain')).toHaveLength(0);
  });

  it('falls back to noon on an unknown id and registers what it allocates for disposal', () => {
    const scene = fresh();
    expect(applyClimate(scene, {}, 'monsoon').id).toBe('noon');
    expect(G.climate.id).toBe('noon');
    expect(G.disposables.length).toBeGreaterThan(3);
    for (const d of G.disposables) expect(typeof d.dispose).toBe('function');
  });

  it('picks the layout\'s climate, else the track\'s first, else noon', () => {
    G.layout = null;
    expect(pickClimate({})).toBe('noon');
    expect(pickClimate({ climates: ['dusk', 'noon'] })).toBe('dusk');
    G.layout = { climate: 'night' }; expect(pickClimate({ climates: ['dusk'] })).toBe('night');
    expect(applyClimate(fresh(), { climates: ['golden'] }).id).toBe('golden');
    G.layout = null;
  });

  it('makes the headlight cone an unlit additive quad in the kart\'s frame, not a light', () => {
    const cone = headlightCone();
    expect(cone.isMesh).toBe(true); expect(cone.isLight).toBeFalsy(); expect(cone.children).toHaveLength(0);
    expect(cone.material.blending).toBe(THREE.AdditiveBlending); expect(cone.material.transparent).toBe(true);
    const p = cone.geometry.attributes.position;
    expect(p.getZ(0)).toBeCloseTo(1.9, 5); expect(p.getZ(2)).toBeCloseTo(11, 5);   // from just ahead of the nose to 11 m out
    expect(Math.abs(p.getX(2))).toBeGreaterThan(Math.abs(p.getX(0)));             // widening
  });
});

describe('a race under a climate', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; G.trackIdx = 0; G.layout = null; });

  it('is lit by the climate\'s three lights and nothing else, lamps registered by the decor', () => {
    startRace();
    expect(lightsOf(G.scene)).toEqual(['HemisphereLight', 'AmbientLight', 'DirectionalLight']);
    expect(G.climate.id).toBe('noon');
    expect(G.lamps.length).toBeGreaterThan(20);
    expect(named(G.scene, 'sky')).toHaveLength(1);
    expect(named(G.scene, 'lampGlow')).toHaveLength(0);
    expect(G.karts.every(k => !k.mesh.userData.headlights)).toBe(true);
  });

  it('at night lights the lamps and gives every kart a headlight cone that follows it', () => {
    G.layout = { climate: 'night' };
    startRace();
    G.layout = null;
    expect(G.climate.id).toBe('night');
    expect(lightsOf(G.scene)).toEqual(['HemisphereLight', 'AmbientLight', 'DirectionalLight']);
    expect(named(G.scene, 'lampGlow')).toHaveLength(1);
    expect(named(G.scene, 'headlights')).toHaveLength(G.karts.length);
    for (const k of G.karts) { expect(k.mesh.userData.headlights.parent).toBe(G.scene); expect(k.mesh.children).not.toContain(k.mesh.userData.headlights); }
    for (let n = 0; n < 5 * 60; n++) simStep(1 / 60);
    for (const k of G.karts) { const c = k.mesh.userData.headlights; expect(c.position.x).toBeCloseTo(k.mesh.position.x, 5); expect(c.rotation.y).toBeCloseTo(k.mesh.rotation.y, 5); }
  });
});
