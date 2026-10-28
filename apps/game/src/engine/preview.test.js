// The turntable's framing (preview.js), headless: frameKart and aimTurntable
// are plain arithmetic on a Three.js camera, so the karts are built and
// projected here but never drawn. The frames are the showcase bands the UI
// measured above the candidate's name (SelectScreen showcaseBand) at the
// sizes the game is checked at: the kart must land inside them, clear of the
// name and everything under it, and stay large.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { buildKart } from './kart.js';
import { builtinStyle, MASTS, mergeStyle } from './kartstyle.js';
import { aimTurntable, frameKart, showsTurntable } from './preview.js';

/** [what, W, H, the band above the name], as the select and Garage screens measured them. */
const BANDS = [
  ['desktop 1920x1080', 1920, 1080, { x: 794, y: 76, w: 756, h: 679 }],
  ['desktop 1440x900', 1440, 900, { x: 554, y: 76, w: 756, h: 499 }],
  ['desktop 1280x720', 1280, 720, { x: 474, y: 76, w: 756, h: 319 }],
  ['desktop 1024x768', 1024, 768, { x: 440, y: 76, w: 568, h: 374 }],
  ['phone 390x844', 390, 844, { x: 16, y: 60, w: 358, h: 244 }],
  ['phone 844x390', 844, 390, { x: 448, y: 38, w: 380, h: 153 }],
  ['Garage 1440x900, a column as tall as the form', 1440, 900, { x: 554, y: 82, w: 756, h: 1467 }],
];

/**
 * Every point the turntable can show, in world space: the corners of each
 * visible part of every candidate's kart (default style and each mast, the
 * tallest options) as it turns, and the outside of the gold ring.
 */
function turntablePoints() {
  const pts = [];
  // the ring: a torus of radius 3.4 and tube 0.08, raised 0.02 (preview.js ensurePreviewScene)
  for (let i = 0; i < 64; i++) for (let j = 0; j < 8; j++) {
    const a = i / 64 * Math.PI * 2, t = j / 8 * Math.PI * 2, r = 3.4 + 0.08 * Math.cos(t);
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.02 + 0.08 * Math.sin(t), Math.sin(a) * r));
  }
  const corner = new THREE.Vector3();
  for (const c of CHARACTERS) for (const mast of MASTS) {
    const k = buildKart(c, mergeStyle(builtinStyle(c), { mast, spoiler: 'big' }));
    for (let turn = 0; turn < 8; turn++) {
      k.rotation.y = turn / 8 * Math.PI * 2; k.updateMatrixWorld(true);
      k.traverse(o => {
        for (let p = o; p; p = p.parent) if (!p.visible) return;
        if (!o.isMesh) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const { min, max } = o.geometry.boundingBox;
        for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) pts.push(corner.set(x, y, z).applyMatrix4(o.matrixWorld).clone());
      });
    }
  }
  return pts;
}
const POINTS = turntablePoints();

/** Where `p` lands on a W x H canvas seen through `cam`, in CSS pixels from the top left. */
function onScreen(p, cam, W, H) {
  const v = p.clone().project(cam);
  return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H };
}

describe('the turntable framing', () => {
  it.each(BANDS)('draws every kart inside the band on the %s', (_what, W, H, band) => {
    const cam = new THREE.PerspectiveCamera(65, W / H, 0.5, 2000);
    const box = aimTurntable(cam, band, W, H);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of POINTS) { const s = onScreen(p, cam, W, H); x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
    // inside the box frameKart promised, and so inside the band: clear of the name under it and of the screen's heading above
    expect(x0).toBeGreaterThanOrEqual(box.x - 0.5); expect(x1).toBeLessThanOrEqual(box.x + box.w + 0.5);
    expect(y0).toBeGreaterThanOrEqual(box.y - 0.5); expect(y1).toBeLessThanOrEqual(box.y + box.h + 0.5);
    expect(box.x).toBeGreaterThanOrEqual(band.x); expect(box.x + box.w).toBeLessThanOrEqual(band.x + band.w + 1e-6);
    expect(box.y).toBeGreaterThanOrEqual(band.y); expect(box.y + box.h).toBeLessThanOrEqual(band.y + band.h + 1e-6);
    // and it fills what binds: the band's width, or the height of the band a window shows
    expect(Math.max(box.w / band.w, box.h / Math.min(band.h, H))).toBeCloseTo(0.92, 5);
    // the turntable itself reaches the box, so the box is no looser than the kart
    expect(x1 - x0).toBeGreaterThan(box.w * 0.97);
  });

  it('keeps the kart in the visible part of a band taller than the window, while the Garage form scrolls', () => {
    const W = 1440, H = 900;
    for (const scroll of [0, 300, 600]) {
      const band = { x: 554, y: 82 - scroll, w: 756, h: 1467 };
      const k = frameKart(band, W, H);
      expect(k.y).toBeGreaterThanOrEqual(0); expect(k.y + k.h).toBeLessThanOrEqual(H);
    }
  });

  it('takes the kart off with a band that scrolls off the top, rather than shrinking it', () => {
    const W = 390, H = 844, band = { x: 16, y: 60, w: 358, h: 244 };
    const still = frameKart(band, W, H), gone = frameKart({ ...band, y: -200 }, W, H);
    expect(gone.h).toBeCloseTo(still.h, 5);
    expect(gone.y + gone.h).toBeLessThanOrEqual(-200 + band.h + 1e-6);
  });

  it('frames the same box for a band of the same size anywhere, so the disc keeps its size', () => {
    const a = frameKart({ x: 0, y: 0, w: 600, h: 400 }, 1440, 900), b = frameKart({ x: 700, y: 300, w: 600, h: 400 }, 1440, 900);
    expect(b.w).toBeCloseTo(a.w, 6); expect(b.h).toBeCloseTo(a.h, 6);
    expect(b.x - a.x).toBeCloseTo(700, 6); expect(b.y - a.y).toBeCloseTo(300, 6);
  });
});

describe('showsTurntable', () => {
  it('is the roster and the Garage alone: the other menus show the plain night background', () => {
    expect(showsTurntable('select')).toBe(true);
    expect(showsTurntable('garage')).toBe(true);
    for (const s of ['title', 'tracks', 'shop', 'admin', 'lobby', 'account', 'dashboard', 'lootbox', 'race', 'paused', 'results']) expect(showsTurntable(s), s).toBe(false);
  });
});
