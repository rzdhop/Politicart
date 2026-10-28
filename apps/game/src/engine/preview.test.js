// The stage facade (preview.js), headless: the framing is plain arithmetic
// on a Three.js camera, and the rigs (the stage kart with its pilot seated)
// are built here but never drawn. The frames are the ShowcaseStage bands the
// select and Garage screens measured at the sizes the game is checked at:
// every candidate's rig and the podium must land inside them, clear of the
// name and everything under it, and stay large. The seat contract (one
// steering wheel, the pilot's, the hands on it, one scale) is pinned here
// too, on all three bodies.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { countTriangles } from './geo.js';
import { PODIUM } from './hemicycle.js';
import { buildKart, seatPilot } from './kart.js';
import { defaultStyle, mergeStyle } from './kartstyle.js';
import { buildPilot, disposePilot, MOUNT, PILOT_SCALE } from './pilot.js';
import { aimStage, buildRig, disposeRig, frameKart, initials, REF_TOP, rigProfile, showsTurntable, stillCamera } from './preview.js';

/** [what, W, H, the ShowcaseStage band], as the screens measured them. */
const BANDS = [
  ['desktop 1920x1080', 1920, 1080, { x: 794, y: 92, w: 756, h: 712 }],
  ['desktop 1440x900', 1440, 900, { x: 554, y: 92, w: 756, h: 532 }],
  ['desktop 1280x720', 1280, 720, { x: 474, y: 92, w: 756, h: 352 }],
  ['desktop 924x540', 924, 540, { x: 440, y: 92, w: 468, h: 320 }],
  ['phone 390x844', 390, 844, { x: 16, y: 96, w: 358, h: 253 }],
  ['phone 844x390', 844, 390, { x: 448, y: 50, w: 380, h: 201 }],
  ['Garage 1440x900, a column as tall as the form', 1440, 900, { x: 554, y: 82, w: 756, h: 1467 }],
];

const byId = id => CHARACTERS.find(c => c.id === id);
/** One rig per candidate, in their own default style with the tallest mast, built once. */
const RIGS = CHARACTERS.map(c => buildRig(c, mergeStyle(defaultStyle(c), { mast: 'pirate' }), 'high', { trail: false }));

/** Every 4th vertex of a rig as it turns, in world space, standing on the podium's top. */
function rigPoints(rig) {
  const pts = [], v = new THREE.Vector3(), root = new THREE.Group();
  root.position.y = PODIUM.top; root.add(rig);
  for (let turn = 0; turn < 6; turn++) {
    root.rotation.y = turn / 6 * Math.PI * 2; root.updateMatrixWorld(true);
    rig.traverse(o => {
      for (let p = o; p; p = p.parent) if (!p.visible) return;
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 4) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
    });
  }
  root.remove(rig);
  return pts;
}
/** The podium's foot all round, at the floor and at its top. */
const PODIUM_POINTS = [];
for (let i = 0; i < 64; i++) for (const y of [0, PODIUM.top]) { const a = i / 64 * Math.PI * 2; PODIUM_POINTS.push(new THREE.Vector3(Math.cos(a) * PODIUM.foot, y, Math.sin(a) * PODIUM.foot)); }

/** Where `p` lands on a W x H canvas seen through `cam`, in CSS pixels from the top left. */
function onScreen(p, cam, W, H) {
  const v = p.clone().project(cam);
  return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H };
}
function bounds(points, cam, W, H) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) { const s = onScreen(p, cam, W, H); x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
  return { x0, x1, y0, y1 };
}

describe('the stage framing', () => {
  const POINTS = RIGS.map(rigPoints);

  it.each(BANDS)('draws every candidate and the podium inside the band on the %s', (_what, W, H, band) => {
    RIGS.forEach((rig, i) => {
      const cam = stillCamera();
      const box = aimStage(cam, band, W, H, rig.userData.profile);
      const b = bounds([...POINTS[i], ...PODIUM_POINTS], cam, W, H), id = rig.userData.id;
      // inside the box frameKart promised, and so inside the band: clear of the name under it and of the heading above
      expect(b.x0, id).toBeGreaterThanOrEqual(box.x - 0.5); expect(b.x1, id).toBeLessThanOrEqual(box.x + box.w + 0.5);
      expect(b.y0, id).toBeGreaterThanOrEqual(box.y - 0.5); expect(b.y1, id).toBeLessThanOrEqual(box.y + box.h + 0.5);
      expect(box.x, id).toBeGreaterThanOrEqual(band.x - 1e-6); expect(box.x + box.w, id).toBeLessThanOrEqual(band.x + band.w + 1e-6);
      expect(box.y, id).toBeGreaterThanOrEqual(band.y - 1e-6); expect(box.y + box.h, id).toBeLessThanOrEqual(band.y + band.h + 1e-6);
    });
  });

  it.each(BANDS)('keeps the kart large on the %s: the stage fills what binds, the width or the visible height', (_what, W, H, band) => {
    const victor = RIGS[0], cam = stillCamera(), box = frameKart(band, W, H, { camera: cam, profile: victor.userData.profile });
    expect(Math.max(box.w / band.w, box.h / Math.min(band.h, H))).toBeGreaterThan(0.9);
  });

  it('gives every candidate the same podium, except one who reaches higher than the reference (the weathervane), who alone is framed smaller', () => {
    const W = 1440, H = 900, band = BANDS[1][3], cam = stillCamera();
    const scale = rig => { const k = frameKart(band, W, H, { camera: cam, profile: rig.userData.profile }); return (k.right - k.left) / W; };   // tangent units per pixel
    const ref = frameKart(band, W, H, { camera: cam }), refScale = (ref.right - ref.left) / W;
    const tops = Object.fromEntries(RIGS.map(r => [r.userData.id, Math.max(...r.userData.profile.map(p => p[1]))]));
    for (const rig of RIGS) {
      if (tops[rig.userData.id] <= REF_TOP) expect(scale(rig), rig.userData.id).toBeCloseTo(refScale, 9);
      else expect(scale(rig), rig.userData.id).toBeGreaterThanOrEqual(refScale - 1e-12);
    }
    // the real tops (stage 5): about 3.45 on the standard kart, more for the quiff, the weathervane and the tractor
    expect(tops.victor).toBeGreaterThan(3.2); expect(tops.victor).toBeLessThan(REF_TOP);
    expect(tops.thierry).toBeGreaterThan(tops.victor + 0.4);
    expect(tops.jeanmi).toBeGreaterThan(tops.victor);
  });

  it('keeps the podium in the visible part of a band taller than the window, while the Garage form scrolls', () => {
    const W = 1440, H = 900;
    for (const scroll of [0, 300, 600]) {
      const band = { x: 554, y: 82 - scroll, w: 756, h: 1467 };
      const k = frameKart(band, W, H, { profile: RIGS[0].userData.profile });
      expect(k.y).toBeGreaterThanOrEqual(0); expect(k.y + k.h).toBeLessThanOrEqual(H);
    }
  });

  it('takes the podium off with a band that scrolls off the top, rather than shrinking it', () => {
    const W = 390, H = 844, band = { x: 16, y: 96, w: 358, h: 253 };
    const still = frameKart(band, W, H), gone = frameKart({ ...band, y: -200 }, W, H);
    expect(gone.h).toBeCloseTo(still.h, 5);
    expect(gone.y + gone.h).toBeLessThanOrEqual(-200 + band.h + 1e-6);
  });

  it('frames the same box for a band of the same size anywhere, so the podium keeps its size', () => {
    const a = frameKart({ x: 0, y: 0, w: 600, h: 400 }, 1440, 900), b = frameKart({ x: 700, y: 300, w: 600, h: 400 }, 1440, 900);
    expect(b.w).toBeCloseTo(a.w, 6); expect(b.h).toBeCloseTo(a.h, 6);
    expect(b.x - a.x).toBeCloseTo(700, 6); expect(b.y - a.y).toBeCloseTo(300, 6);
  });

  it('reads a rig\'s outline from its real vertices: the widest reach per slice, the top', () => {
    const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2));
    m.position.y = 0.5; g.add(m);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3)); pole.position.y = 1.5; g.add(pole);
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(9, 9, 9)); hidden.visible = false; g.add(hidden);
    const p = rigProfile(g);
    expect(Math.max(...p.map(r => r[1]))).toBeCloseTo(3, 5);
    expect(p[0][0]).toBeCloseTo(Math.SQRT2, 5);                    // the box's corners
    expect(p[p.length - 1][0]).toBeCloseTo(0.1, 2);                // the pole's top
  });
});

describe('the seat contract: one steering wheel, the pilot\'s, the hands on it, scaled once', () => {
  const BODIES = [['standard', 'victor'], ['tractor', 'patrick'], ['cargo bike', 'capucine']];

  it.each(BODIES)('on the %s (%s)', (_body, id) => {
    const def = byId(id), style = defaultStyle(def);
    const kart = buildKart(def, style, { profile: 'stage', pilot: false, steering: false });
    const pilot = buildPilot(def, 'stage', { merge: false });
    expect(seatPilot(kart, pilot)).toBe(pilot);
    kart.updateMatrixWorld(true);
    // the pilot is the driver, as built: at MOUNT, unscaled, and its seat carries the one 1.45
    expect(kart.userData.driver).toBe(pilot);
    expect(pilot.parent).toBe(kart);
    expect(pilot.position.toArray()).toEqual([...MOUNT]);
    expect(pilot.scale.toArray()).toEqual([1, 1, 1]);
    expect(kart.getObjectByName('seat')).toBe(pilot.getObjectByName('seat'));   // the kart's empty anchor is gone
    expect(pilot.getObjectByName('seat').getWorldScale(new THREE.Vector3()).x).toBeCloseTo(PILOT_SCALE, 9);
    // exactly one steering: the pilot's wheel, or the cargo bike's handlebar
    const named = n => { const out = []; kart.traverse(o => { if (o.name === n) out.push(o); }); return out; };
    const wheel = def.cargo ? named('handlebar') : named('steering-wheel');
    expect(wheel).toHaveLength(1);
    expect(named(def.cargo ? 'steering-wheel' : 'handlebar')).toHaveLength(0);
    const withOwn = buildKart(def, style, { profile: 'stage', pilot: false });
    const without = buildKart(def, style, { profile: 'stage', pilot: false, steering: false });
    expect(countTriangles(withOwn)).toBeGreaterThan(countTriangles(without));    // the kart's own steering is really left out
    expect(() => seatPilot(withOwn, buildPilot(def, 'stage'))).toThrow(/steering/);
    // the left hand (it always drives) on the wheel's rim or the handlebar's grip
    const hands = []; kart.traverse(o => { if (o.name === 'hand' && o.isMesh) hands.push(o.getWorldPosition(new THREE.Vector3())); });
    const at = (def.cargo ? named('grip')[0] : wheel[0]).getWorldPosition(new THREE.Vector3());
    const reach = Math.min(...hands.map(h => h.distanceTo(at)));
    if (def.cargo) expect(reach).toBeLessThan(0.25);
    else { expect(reach).toBeGreaterThan(0.16 * PILOT_SCALE - 0.1); expect(reach).toBeLessThan(0.16 * PILOT_SCALE + 0.1); }
    // the tractor: the hands stay in front of the hood block (its front face at z 0.2)
    if (def.tractor) for (const h of hands) expect(h.z).toBeLessThan(0.2);
    disposePilot(pilot);
  });

  it('rebuilds the kart alone after a Garage edit: the same pilot and trail moved over, framed as a whole new measure would', () => {
    const def = byId('victor'), before = buildRig(def, mergeStyle(defaultStyle(def), { trail: 'laser' }), 'high');
    const { pilot, trail } = before.userData;
    pilot.parent.remove(pilot); trail.trail.group.parent.remove(trail.trail.group);
    before.userData.pilot = null; before.userData.trail = null;
    disposeRig(before);
    const after = buildRig(def, mergeStyle(defaultStyle(def), { trail: 'laser', mast: 'pirate', wheels: 'offroad' }), 'high', { pilot, trail });
    expect(after.userData.pilot).toBe(pilot);
    expect(after.userData.trail).toBe(trail);
    expect(trail.trail.group.parent).toBe(after);
    expect(after.userData.kart.userData.driver).toBe(pilot);
    // the outline from the pilot's measure, kept, plus the new kart's: the same as walking the whole rig
    const whole = rigProfile(after);
    expect(after.userData.profile).toHaveLength(whole.length);
    after.userData.profile.forEach(([r, y], i) => { expect(r).toBeCloseTo(whole[i][0], 6); expect(y).toBeCloseTo(whole[i][1], 6); });
    // a new stage trail starts streaming, as if the kart had been driving
    const fresh = buildRig(def, mergeStyle(defaultStyle(def), { trail: 'laser' }), 'high');
    expect(fresh.userData.trail.run).toBeGreaterThan(0);
    disposeRig(after); disposeRig(fresh);
  });

  it('waves the mast\'s flag at the pole top on the podium, as in a race (the stage merge must not send it into the cockpit)', () => {
    const def = byId('victor'), style = mergeStyle(defaultStyle(def), { mast: 'tricolore' });
    const flags = profile => {
      const k = buildKart(def, style, { profile, pilot: false, steering: false }), out = [];
      k.traverse(o => { if (o.isMesh && o.geometry.parameters && o.geometry.parameters.depth === 0.02 && o.geometry.parameters.height === 0.42) out.push(o); });
      return { k, out };
    };
    const stage = flags('stage'), race = flags('race');
    expect(stage.out).toHaveLength(3);
    for (const t of [0.4, 1.3, 2.1]) {
      for (const { k } of [stage, race]) { for (const f of k.userData.anim) f(0.016, t); k.updateMatrixWorld(true); }
      stage.out.forEach((s, i) => {
        const a = s.getWorldPosition(new THREE.Vector3()), b = race.out[i].getWorldPosition(new THREE.Vector3());
        expect(a.distanceTo(b)).toBeLessThan(1e-6);
        expect(a.z).toBeLessThan(-1.1);   // behind the pole (z -1.1), flying back
      });
    }
  });

  it('builds every candidate\'s rig with the pilot as the driver and no second wheel, then frees it', () => {
    for (const rig of RIGS) {
      const { kart, pilot } = rig.userData;
      expect(kart.userData.driver).toBe(pilot);
      expect(pilot.scale.x).toBe(1);
    }
    const r = buildRig(byId('lulu'), defaultStyle(byId('lulu')), 'low');
    let freed = 0; r.traverse(o => { if (o.isMesh) o.geometry.addEventListener('dispose', () => freed++); });
    disposeRig(r);
    expect(freed).toBeGreaterThan(10);
    expect(r.parent).toBeNull();
  });
});

describe('the portraits\' placeholders', () => {
  it('carry the candidate\'s initials: the first letters of the first and the last word', () => {
    expect(initials('Emmanuel Macaron')).toBe('EM');
    expect(initials('Jean-Luc Mélèche')).toBe('JM');
    expect(initials('Gérard L’Archiduc')).toBe('GL');
    expect(initials('Jean Lassalle-des-Fêtes')).toBe('JL');
    expect(initials('Éric Zemmoule')).toBe('ÉZ');
    expect(initials('Zoé')).toBe('Z');
    expect(initials('')).toBe('?');
  });
});

describe('showsTurntable', () => {
  it('is the roster and the Garage alone: the other menus show the plain night background', () => {
    expect(showsTurntable('select')).toBe(true);
    expect(showsTurntable('garage')).toBe(true);
    for (const s of ['title', 'tracks', 'shop', 'admin', 'lobby', 'account', 'dashboard', 'lootbox', 'race', 'paused', 'results']) expect(showsTurntable(s), s).toBe(false);
  });
});
