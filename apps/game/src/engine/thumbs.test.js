// The circuits screen's thumbnails (thumbs.js): the figures, the frame shared
// with the placeholder, the light scene's steps and their cost, the queue.
import { afterEach, describe, expect, it } from 'vitest';

import { TRACKS } from './data.js';
import { CFG } from './state.js';
import { BUDGET_MS, disposeThumbScene, onThumbs, requestThumbs, resetThumbs, THUMB_H, THUMB_W, thumbFrame, thumbsFrame, thumbStatus, thumbSteps, trackMeta } from './thumbs.js';

afterEach(() => { resetThumbs(); onThumbs(null); });

describe('trackMeta', () => {
  it('gives every circuit a length, a climb from its profile, its width, the laps and its three layouts', () => {
    for (const t of TRACKS) {
      const m = trackMeta(t);
      expect(m.length).toBeGreaterThan(500);
      expect(m.width).toBe(2 * (t.roadHalfWidth ?? CFG.roadHalfWidth));
      expect(m.laps).toBe(CFG.laps);
      expect(m.layouts).toEqual(t.variants.map(v => v.name));
      expect(m.climates).toEqual(t.climates);
      expect(trackMeta(t)).toBe(m);   // cached
    }
  });

  it('measures the climb a lap goes up: none on a flat circuit, the butte’s 22 m on Montmartre', () => {
    const by = id => trackMeta(TRACKS.find(t => t.id === id));
    expect(by('elysee').climb).toBe(0);
    expect(by('montmartre').climb).toBeCloseTo(22, 0);
    expect(by('bourbon').climb).toBeCloseTo(12, 0);   // two 6 m bridges
  });
});

describe('thumbFrame', () => {
  it('fits the whole road inside the picture, with the start line on it', () => {
    for (const t of TRACKS) {
      const f = thumbFrame(t);
      expect(f.pts).toHaveLength(200);
      for (const [x, y] of f.pts) {
        expect(x - f.hw).toBeGreaterThanOrEqual(-0.5); expect(x + f.hw).toBeLessThanOrEqual(THUMB_W + 0.5);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(THUMB_H);
      }
      expect(f.start).toEqual(f.pts[0]);
    }
  });
});

describe('thumbSteps', () => {
  it('builds each circuit in a few small steps, into one shared material, and ends with a fitted camera', () => {
    for (const poly of ['high', 'low']) for (const t of TRACKS) {
      const gen = thumbSteps(t, { poly }), names = [];
      let r;
      while (!(r = gen.next()).done) names.push(r.value);
      expect([...new Set(names)]).toEqual(poly === 'low' ? ['shape', 'terrain', 'road'] : ['shape', 'terrain', 'road', 'blocks']);
      const { scene, camera } = r.value, mats = new Set();
      let tris = 0;
      scene.traverse(o => { if (o.isMesh) { mats.add(o.material); tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; expect(o.geometry.attributes.color).toBeDefined(); } });
      expect(mats.size).toBe(1);                         // one program for every thumbnail
      expect(tris).toBeGreaterThan(1000);
      expect(tris).toBeLessThan(40000);
      expect(camera.isOrthographicCamera).toBe(true);
      expect((camera.right - camera.left) / (camera.top - camera.bottom)).toBeCloseTo(THUMB_W / THUMB_H, 5);
      disposeThumbScene(scene);
    }
  });

  it('keeps every build step well inside a frame’s budget (measured here in Node)', () => {
    const steps = {};
    for (const t of TRACKS) {
      const gen = thumbSteps(t, { poly: 'high' });
      for (;;) {
        const t0 = performance.now(), r = gen.next(), dt = performance.now() - t0;
        const name = r.done ? 'camera' : r.value;
        steps[name] = Math.max(steps[name] ?? 0, dt);
        if (r.done) { disposeThumbScene(r.value.scene); break; }
      }
    }
    // the first build pays for the module's warm-up: a generous bound, the point being "milliseconds, not a phase"
    for (const [name, ms] of Object.entries(steps)) expect(ms, name).toBeLessThan(BUDGET_MS * 4);
  });
});

describe('the queue', () => {
  it('marks every circuit static at once without a renderer (headless), the selected one first, and tells the listener', () => {
    const seen = [];
    onThumbs(v => seen.push(Object.values(v).filter(x => x.state !== 'pending').length));
    expect(requestThumbs(2)).toBe(TRACKS.length);
    expect(thumbsFrame({ renderer: null })).toBe(false);
    expect(thumbStatus()).toMatchObject({ ready: 0, static: TRACKS.length, total: TRACKS.length });
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(TRACKS.length);
    expect(requestThumbs(0)).toBe(0);   // nothing left to do at this detail level
  });

  it('does nothing on a zero budget', () => {
    requestThumbs(0);
    expect(thumbsFrame({ renderer: null, budget: 0 })).toBe(true);
    expect(thumbStatus().static).toBe(0);
  });
});
