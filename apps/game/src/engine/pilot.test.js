// The pilots at every level of detail (DEC-044, PLAN 3.3): budgets, the
// userData contract kart.js and physics rely on, every look-spec value built,
// and nothing leaked. Headless, as the server builds them (DEC-014).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { countMeshes, countTriangles } from './geo.js';
import { CUTS, FABRICS, FACIAL_HAIR, GLASSES, HAIR_STYLES, LAYERS, LOOK3D, MOUTHS, POSES, PROPS } from './looks.js';
import {
  bodyOf, buildPilot, complement, darken, disposePilot, HAIR_SHINE, IMPLEMENTED, lighten, liveNames, LODS, MOUNT, PILOT_SCALE, pilotLayout, POSE_AT, SEATS, USERDATA_KEYS,
} from './pilot.js';
import { KART_MOUNTS } from './props.js';
import { linear } from './stagelook.js';

const victor = CHARACTERS.find(c => c.id === 'victor');
const LEVELS = [['stage', {}], ['stage', { tier: 'low' }], ['race-high', {}], ['race-low', {}], ['headless', {}]];
/** PLAN 3.3's budgets: [max triangles, min draws, max draws]. */
const BUDGET = { stage: [40000, 16, 26], 'stage-low': [12000, 16, 26], 'race-high': [6000, 1, 3], 'race-low': [2500, 1, 2] };
const names = o => { const out = new Set(); o.traverse(x => { if (x.name) out.add(x.name); }); return out; };
const meshes = o => { const out = []; o.traverse(x => { if (x.isMesh) out.push(x); }); return out; };
const withLook = (def, patch) => ({ look: { ...LOOK3D[def.id], ...patch } });
const faceWith = (def, patch) => withLook(def, { face: { ...LOOK3D[def.id].face, ...patch } });

describe('budgets per level of detail, for all 16', () => {
  it.each(CHARACTERS.map(c => [c.id, c]))('%s stays inside every level\'s triangle and draw budget', (_id, def) => {
    for (const [lod, opts] of LEVELS.slice(0, 4)) {
      const p = buildPilot(def, lod, opts), key = opts.tier === 'low' ? 'stage-low' : lod, [tris, d0, d1] = BUDGET[key];
      const t = countTriangles(p), d = countMeshes(p);
      expect(t, `${def.id} ${key} triangles`).toBeLessThanOrEqual(tris);
      expect(d, `${def.id} ${key} draws`).toBeGreaterThanOrEqual(d0);
      expect(d, `${def.id} ${key} draws`).toBeLessThanOrEqual(d1);
      disposePilot(p);
    }
  });

  it('spends the stage budget on detail: the stage is several times the race levels', () => {
    for (const def of CHARACTERS) {
      const t = lod => { const p = buildPilot(def, lod); const n = countTriangles(p); disposePilot(p); return n; };
      expect(t('stage')).toBeGreaterThan(3 * t('race-high'));
      expect(t('race-high')).toBeGreaterThan(t('race-low'));
    }
  });
});

describe('the userData contract', () => {
  it.each(CHARACTERS.map(c => [c.id, c]))('%s carries the same keys at every level, pointing at objects in the pilot', (_id, def) => {
    const live = liveNames(LOOK3D[def.id]).sort();
    for (const [lod, opts] of LEVELS) {
      const p = buildPilot(def, lod, opts), u = p.userData, at = `${def.id} ${lod}`;
      expect(Object.keys(u).sort(), at).toEqual([...USERDATA_KEYS]);
      expect(u.driver, at).toBe(p);
      expect(u.id).toBe(def.id); expect(u.lod).toBe(lod); expect(u.body).toBe(bodyOf(def));
      for (const k of ['head', 'arm', 'hand']) {
        expect(u[k].isObject3D, `${at} ${k}`).toBe(true);
        let o = u[k]; while (o.parent) o = o.parent;
        expect(o, `${at} ${k} is inside the pilot`).toBe(p);
      }
      expect(Object.keys(u.live).sort(), at).toEqual(live);
      for (const g of Object.values(u.live)) { let o = g; while (o.parent) o = o.parent; expect(o, at).toBe(p); }
      expect(Array.isArray(u.anim), at).toBe(true);
      for (const f of u.anim) { f(1 / 60, 0.5); f(1 / 60, 3.7); }
      for (const k of ['head', 'arm', 'hand']) expect(u.rest[k], `${at} rest ${k}`).toHaveLength(3);
      disposePilot(p);
    }
  });

  it('sits at the driver\'s rest position on every body, so physics\' bob and the lootbox work unchanged', () => {
    for (const def of CHARACTERS) for (const [lod] of LEVELS) {
      const p = buildPilot(def, lod);
      expect(p.position.toArray()).toEqual([...MOUNT]);
      expect(p.scale.toArray()).toEqual([1, 1, 1]);
      // physics.updateKartVisual: u.driver.position.y = 0.75 + bob; the lootbox: driver.visible = false
      const kart = new THREE.Group(); kart.add(p); kart.userData.driver = p.userData.driver;
      kart.userData.driver.position.y = 0.75; kart.userData.driver.visible = false;
      expect(p.position.toArray()).toEqual([...MOUNT]);
      disposePilot(p);
    }
  });

  it('keeps the head pivot above the seat and in front of the seat back on every body', () => {
    for (const def of CHARACTERS) {
      const p = buildPilot(def, 'stage'); p.updateMatrixWorld(true);
      const head = new THREE.Vector3().setFromMatrixPosition(p.userData.head.matrixWorld);
      const seat = SEATS[bodyOf(def)];
      expect(head.y, def.id).toBeCloseTo(seat[1] + pilotLayout(LOOK3D[def.id]).head[1] * PILOT_SCALE, 5);
      expect(head.z, def.id).toBeCloseTo(seat[2] - 0.27 * PILOT_SCALE, 5);
      disposePilot(p);
    }
  });

  it('animates the head, the wave and the live props from their rest poses', () => {
    const p = buildPilot(victor, 'stage'), h = p.userData.head;
    for (const f of p.userData.anim) f(0.016, 2);
    const a = h.rotation.y;
    for (const f of p.userData.anim) f(0.016, 4);
    expect(h.rotation.y).not.toBe(a);
    expect(Math.abs(h.rotation.y - p.userData.rest.head[1])).toBeLessThanOrEqual(0.14 + 1e-9);
    const vane = buildPilot(CHARACTERS.find(c => c.id === 'thierry'), 'race-high');
    const arrow = vane.getObjectByName('vane-arrow');
    for (const f of vane.userData.anim) f(0.016, 1); const r1 = arrow.rotation.y;
    for (const f of vane.userData.anim) f(0.016, 2.5);
    expect(arrow.rotation.y).not.toBe(r1);
    const lucie = buildPilot(CHARACTERS.find(c => c.id === 'lucie'), 'stage'), hand = lucie.userData.hand;
    for (const f of lucie.userData.anim) f(0.016, 0.125);
    expect(hand.rotation.z).toBeCloseTo(lucie.userData.rest.hand[2] + 0.35, 5);
    [p, vane, lucie].forEach(disposePilot);
  });
});

describe('headless (the game server)', () => {
  it('builds in under 1 ms and makes no geometry', () => {
    for (const def of CHARACTERS) buildPilot(def, 'headless');   // warm the code path
    const times = [];
    for (const def of CHARACTERS) {
      const t0 = performance.now(), p = buildPilot(def, 'headless'); times.push(performance.now() - t0);
      let geo = 0; p.traverse(o => { if (o.isMesh || o.geometry) geo++; });
      expect(geo, def.id).toBe(0);
    }
    times.sort((a, b) => a - b);
    expect(times[times.length >> 1]).toBeLessThan(1);
    expect(times.reduce((a, b) => a + b, 0) / times.length).toBeLessThan(1);
  });
});

describe('every vocabulary value is implemented', () => {
  it('has a builder for every prop, a grip for every pose and a shine for every hair style', () => {
    expect([...IMPLEMENTED.props].sort()).toEqual(Object.keys(PROPS).sort());
    expect([...IMPLEMENTED.poses].sort()).toEqual(Object.keys(POSES).sort());
    expect([...IMPLEMENTED.hair].sort()).toEqual(Object.keys(HAIR_STYLES).sort());
  });

  it('places the right hand and elbow exactly where POSES says', () => {
    for (const [pose, { desc }] of Object.entries(POSES)) {
      const m = desc.match(/hand \[([^\]]+)\].*?elbow \[([^\]]+)\]/);
      expect(m, pose).not.toBeNull();
      expect(POSE_AT[pose].hand, pose).toEqual(m[1].split(',').map(Number));
      expect(POSE_AT[pose].elbow, pose).toEqual(m[2].split(',').map(Number));
    }
  });

  const parts = (def, opts) => { const p = buildPilot(def, 'stage', { ...opts, merge: false }); const n = names(p); disposePilot(p); return n; };
  const HAIR_PART = { slick: 'hair-quiff', quiff: 'hair-quiff', tousled: 'hair-lock', bob: 'hair-bob', wild: 'hair-tuft', sides: 'hair-fringe-ring', combover: 'combover-strand', white: 'hair-ridge', sidepart: 'parting', bun: 'hair-bun', ponytail: 'ponytail-lock', cap: 'cap-peak', strawhat: 'hat-brim', kepi: 'kepi-crown', bikehelmet: 'helmet-vent' };
  it.each(Object.keys(HAIR_STYLES))('builds the %s hair', hair => {
    expect(parts(victor, withLook(victor, { hair }))).toContain(HAIR_PART[hair]);
  });
  const CUT_PART = { suit: 'lapel', mao: 'band-collar', tailleur: 'braid', uniform: 'epaulette', turncoat: 'torso-lining', suithood: 'hood', blouson: 'zip', pullover: 'open-zip', robe: 'bell-sleeve', shirt: 'rolled-sleeve' };
  it.each(Object.keys(CUTS))('builds the %s cut', cut => {
    expect(parts(victor, withLook(victor, { outfit: { cut, fabric: 'wool', layers: [] } }))).toContain(CUT_PART[cut]);
  });
  it.each(Object.keys(LAYERS))('builds the %s layer', kind => {
    const n = parts(victor, withLook(victor, { outfit: { cut: 'shirt', fabric: 'cotton', layers: [{ kind, fabric: kind === 'gilet' ? 'puffer' : 'cotton' }] } }));
    expect(n).toContain({ hivis: 'hivis-vest', bib: 'bib', gilet: 'gilet' }[kind]);
  });
  it.each(Object.keys(FABRICS))('builds a %s jacket, from stage 1\'s surface specs', fabric => {
    const p = buildPilot(victor, 'stage', { ...withLook(victor, { outfit: { cut: 'suit', fabric, layers: [] } }), merge: false });
    const torso = p.getObjectByName('torso');
    expect(torso.material.isMeshPhysicalMaterial).toBe(true);
    expect(!!torso.material.map).toBe(fabric !== 'cotton');
    disposePilot(p);
  });
  const MOUTH_PART = { smile: 'mouth', smirk: 'mouth', grin: 'teeth', flat: 'mouth', shout: 'mouth-open', pursed: 'mouth-hole', rant: 'mouth-open' };
  it.each(Object.keys(MOUTHS))('builds the %s mouth', mouth => { expect(parts(victor, faceWith(victor, { mouth }))).toContain(MOUTH_PART[mouth]); });
  const GLASS_PART = { round: 'glasses-rim', rect: 'glasses-rim', peer: 'glasses-rim', shades: 'shades-lens', aviator: 'aviator-rim', monocle: 'monocle-rim' };
  it.each(Object.keys(GLASSES))('builds the %s glasses', glasses => { expect(parts(victor, faceWith(victor, { glasses }))).toContain(GLASS_PART[glasses]); });
  const FACIAL_PART = { brush: 'moustache', walrus: 'moustache-end', sideburns: 'sideburn' };
  it.each(Object.keys(FACIAL_HAIR))('builds the %s facial hair', facial => { expect(parts(victor, faceWith(victor, { facial }))).toContain(FACIAL_PART[facial]); });

  it('builds every candidate\'s every prop, named after it', () => {
    for (const def of CHARACTERS) {
      const n = parts(def, {});
      for (const prop of LOOK3D[def.id].props) expect(n, `${def.id} ${prop}`).toContain(prop === 'tractormirror' ? 'tractor-mirror' : prop);
    }
  });

  it('builds every pose\'s grip', () => {
    for (const pose of Object.keys(POSES)) {
      const hand = POSES[pose].hand ? ['megaphone'] : [];
      const look = { ...LOOK3D.victor, pose, props: ['tie', ...hand] };
      const p = buildPilot(victor, 'stage', { look });
      expect(p.userData.hand.isObject3D).toBe(true);
      disposePilot(p);
    }
  });
});

describe('kart props land on every body', () => {
  it('puts each slot prop at its mount on the candidate\'s own body', () => {
    for (const def of CHARACTERS) {
      const p = buildPilot(def, 'stage', { merge: false });
      for (const prop of LOOK3D[def.id].props.filter(n => PROPS[n].at === 'kart')) {
        const slot = p.getObjectByName('slot-' + PROPS[prop].slot), at = KART_MOUNTS[bodyOf(def)][PROPS[prop].slot];
        expect(slot, `${def.id} ${prop}`).toBeDefined();
        const kartPos = slot.position.clone().add(p.position);
        expect(kartPos.distanceTo(new THREE.Vector3(...at)), `${def.id} ${prop}`).toBeLessThan(1e-6);
      }
      disposePilot(p);
    }
  });

  it('lands the tractor mirror on the tractor and the hold pose on the cargo bike\'s handlebar', () => {
    const patrick = CHARACTERS.find(c => c.tractor), capucine = CHARACTERS.find(c => c.cargo);
    expect(LOOK3D[patrick.id].props).toContain('tractormirror');
    const p = buildPilot(patrick, 'stage'); p.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(p);
    expect(box.max.x).toBeGreaterThan(KART_MOUNTS.tractor.side[0]);          // the mirror reaches out past the body's right edge
    disposePilot(p);
    const q = buildPilot(capucine, 'stage', { merge: false }); q.updateMatrixWorld(true);
    expect(LOOK3D[capucine.id].pose).toBe('hold');
    const grip = q.getObjectByName('grip'), hands = [];
    q.traverse(o => { if (o.name === 'hand') hands.push(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)); });
    const bar = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld);
    expect(Math.min(...hands.map(h => h.distanceTo(bar)))).toBeLessThan(0.25);   // the left hand on the handlebar's grip
    disposePilot(q);
  });
});

describe('looks and materials', () => {
  it('takes its colours from def.look, so the admin\'s suit reaches the pilot', () => {
    const def = { ...victor, look: { ...victor.look, suit: 0x00ff00 } };
    const p = buildPilot(def, 'stage');
    expect(meshes(p).some(m => m.material.color && m.material.color.equals(linear(0x00ff00)))).toBe(true);
    disposePilot(p);
    const r = buildPilot(def, 'race-high'), green = new THREE.Color(0x00ff00);
    const col = meshes(r).flatMap(m => { const a = m.geometry.attributes.color; return a ? [a] : []; });
    expect(col.some(a => { for (let i = 0; i < a.count; i++) if (a.getX(i) === green.r && a.getY(i) === green.g && a.getZ(i) === green.b) return true; return false; })).toBe(true);
    disposePilot(r);
  });

  it('derives the cap, the helmet, the gilet and the lining from the game\'s colours', () => {
    const tone = (def, name) => { const p = buildPilot(def, 'stage', { merge: false }); const c = p.getObjectByName(name).material.color.clone(); disposePilot(p); return c; };
    const by = id => CHARACTERS.find(c => c.id === id);
    expect(tone(by('gege'), 'cap-crown').equals(linear(darken(by('gege').look.suit, 0.4)))).toBe(true);
    expect(tone(by('capucine'), 'helmet-shell').equals(linear(lighten(by('capucine').kart, 0.3)))).toBe(true);
    expect(tone(by('patrick'), 'gilet').equals(linear(by('patrick').kart))).toBe(true);
    expect(tone(by('thierry'), 'torso-lining').equals(linear(complement(by('thierry').look.suit)))).toBe(true);
  });

  it('sets the hair shine per style: the slick is glossy, the mane matte', () => {
    const hairOf = (def, hair) => { const p = buildPilot(def, 'stage', { ...withLook(def, { hair }), merge: false }); const m = p.getObjectByName('hair-cap').material; disposePilot(p); return m; };
    const slick = hairOf(victor, 'slick');
    expect(slick.roughness).toBe(0.28); expect(slick.clearcoat).toBe(0.8);
    const wild = hairOf(victor, 'wild');
    expect(wild.roughness).toBe(HAIR_SHINE.wild.roughness); expect(wild.clearcoat).toBe(0);
  });

  it('draws the stage with stage materials only, "légers" with Standard ones and no normal maps, races with one vertex-coloured material', () => {
    for (const def of CHARACTERS) {
      const hi = buildPilot(def, 'stage'), lo = buildPilot(def, 'stage', { tier: 'low' }), rh = buildPilot(def, 'race-high'), rl = buildPilot(def, 'race-low');
      for (const m of meshes(hi)) expect(m.material.userData.stage || m.material.isShaderMaterial || m.material.name === 'own-glow', `${def.id} ${m.name}`).toBeTruthy();
      for (const m of meshes(lo)) {
        if (m.material.userData.stage) { expect(!!m.material.isMeshPhysicalMaterial, `${def.id} ${m.name}`).toBe(false); expect(m.material.normalMap).toBeFalsy(); }
      }
      const raceMats = new Set([...meshes(rh), ...meshes(rl)].map(m => m.material));
      expect(raceMats.size, def.id).toBe(2);
      for (const m of raceMats) { expect(m.vertexColors).toBe(true); expect(m.userData.stage).toBeUndefined(); }
      [hi, lo, rh, rl].forEach(disposePilot);
    }
  });

  it('rejects an unknown level of detail', () => {
    expect(() => buildPilot(victor, 'ultra')).toThrow(/level of detail/);
    expect(LODS).toEqual(['stage', 'race-high', 'race-low', 'headless']);
  });
});

describe('lifecycle', () => {
  /** Run fn while recording every geometry and material disposed. */
  function recording(fn) {
    const disposed = new Set(), g = THREE.BufferGeometry.prototype.dispose, m = THREE.Material.prototype.dispose;
    THREE.BufferGeometry.prototype.dispose = function () { disposed.add(this); return g.call(this); };
    THREE.Material.prototype.dispose = function () { disposed.add(this); return m.call(this); };
    try { fn(); } finally { THREE.BufferGeometry.prototype.dispose = g; THREE.Material.prototype.dispose = m; }
    return disposed;
  }

  it('building and disposing all 16 at every level leaks no geometry and no material', () => {
    const traced = [];
    const disposed = recording(() => {
      for (const def of CHARACTERS) for (const [lod, opts] of LEVELS) {
        const trace = [], p = buildPilot(def, lod, { ...opts, trace });
        p.traverse(o => { if (o.isMesh) expect(trace, `${def.id} ${lod}: a geometry the trace missed`).toContain(o.geometry); });
        disposePilot(p);
        traced.push(...trace.map(r => [r, `${def.id} ${lod}`]));
      }
    });
    expect(traced.length).toBeGreaterThan(1000);
    for (const [r, at] of traced) expect(disposed.has(r), `${at}: ${r.type} ${r.name || ''} not disposed`).toBe(true);
  });

  it('frees the merge\'s source geometries during the build, before any dispose', () => {
    const trace = [];
    let p;
    const disposed = recording(() => { p = buildPilot(victor, 'stage', { trace }); });
    const live = new Set(); p.traverse(o => { if (o.isMesh) live.add(o.geometry); });
    const sources = trace.filter(g => g.isBufferGeometry && !live.has(g));
    expect(sources.length).toBeGreaterThan(50);
    for (const g of sources) expect(disposed.has(g)).toBe(true);
    for (const g of live) expect(disposed.has(g)).toBe(false);
    disposePilot(p);
  });
});
