// The props: one builder per PROPS entry, kart slots that land on kart.js's
// real bodies, hosted props on their host, live props that move.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { buildKart } from './kart.js';
import { KART_SLOTS, LOOK3D, PROPS } from './looks.js';
import { bodyOf, buildPilot, disposePilot, liveNames } from './pilot.js';
import { KART_MOUNTS, PROP_BUILDERS } from './props.js';

const BODIES = { standard: CHARACTERS.find(c => !c.tractor && !c.cargo), tractor: CHARACTERS.find(c => c.tractor), cargo: CHARACTERS.find(c => c.cargo) };

/** The first visible surface of a race kart straight below `from` (kart.js's own driver taken out). */
function surfaceBelow(def, from) {
  const k = buildKart(def); k.remove(k.userData.driver); k.updateMatrixWorld(true);
  const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const hits = new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(0, -1, 0)).intersectObject(k, true).filter(h => shown(h.object) && h.object.name !== 'underglow');
  return hits.length ? hits[0].distance : Infinity;
}

describe('the prop builders', () => {
  it('has exactly one builder per PROPS entry', () => {
    expect(Object.keys(PROP_BUILDERS).sort()).toEqual(Object.keys(PROPS).sort());
  });

  it('marks as live exactly the props looks.js calls live, and the ponytail', () => {
    for (const def of CHARACTERS) {
      const spec = LOOK3D[def.id], p = buildPilot(def, 'stage');
      const expected = spec.props.filter(n => PROPS[n].live).concat(spec.hair === 'ponytail' ? ['ponytail'] : []);
      expect(Object.keys(p.userData.live).sort(), def.id).toEqual(expected.sort());
      expect(liveNames(spec).sort()).toEqual(expected.sort());
      disposePilot(p);
    }
  });

  it('hangs the ring light and the hearts on the selfie stick\'s phone', () => {
    const kevin = CHARACTERS.find(c => LOOK3D[c.id].props.includes('selfie'));
    const p = buildPilot(kevin, 'stage', { merge: false });
    for (const name of ['ringlight', 'hearts']) {
      let o = p.getObjectByName(name), hosts = [];
      for (; o; o = o.parent) hosts.push(o.name);
      expect(hosts, name).toContain('selfie-phone');
      expect(hosts, name).toContain('hand');
    }
    disposePilot(p);
  });

  it('builds every kart prop on every body, at every level', () => {
    const kart = Object.keys(PROPS).filter(n => PROPS[n].at === 'kart');
    for (const [body, def] of Object.entries(BODIES)) {
      for (const prop of kart) {
        const look = { ...LOOK3D[def.id], pose: 'drive', props: [prop] };
        for (const lod of ['stage', 'race-high', 'race-low']) {
          const p = buildPilot(def, lod, { look });
          expect(p.userData.body).toBe(body);
          disposePilot(p);
        }
      }
    }
  });
});

describe('kart slots on kart.js\'s bodies', () => {
  it('mounts every slot on every body', () => {
    for (const body of ['standard', 'tractor', 'cargo']) {
      expect(Object.keys(KART_MOUNTS[body]).sort()).toEqual([...Object.keys(KART_SLOTS), 'roofMast'].sort());
      for (const slot of Object.keys(KART_SLOTS)) expect(KART_MOUNTS[body][slot]).toHaveLength(3);
    }
  });

  it.each(Object.keys(BODIES))('sits the dash, deck and side props on the %s\'s surfaces', body => {
    const def = BODIES[body];
    for (const slot of ['dash', 'deck', 'side']) {
      const [x, y, z] = KART_MOUNTS[body][slot];
      expect(surfaceBelow(def, [x, y + 0.03, z]), `${body} ${slot}`).toBeLessThan(0.06);
    }
  });

  it.each(Object.keys(BODIES))('stands the roof mast on something solid on the %s', body => {
    const [x, y, z] = KART_MOUNTS[body].roof;
    expect(surfaceBelow(BODIES[body], [x, y, z])).toBeLessThan(KART_MOUNTS[body].roofMast + 0.06);
  });

  it('gives each candidate\'s kart props a slot their own body has (the cargo bike none)', () => {
    for (const def of CHARACTERS) {
      for (const prop of LOOK3D[def.id].props.filter(n => PROPS[n].at === 'kart')) expect(KART_MOUNTS[bodyOf(def)][PROPS[prop].slot], `${def.id} ${prop}`).toBeDefined();
    }
  });
});
