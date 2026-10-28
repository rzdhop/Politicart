// The "go" launch through the stage facade (preview.js), frame by frame:
// renderPreview and launch as game.js and the store call them, on a
// stand-in renderer that records what is drawn (the scene needs WebGL to
// be seen, not to be built), with the clock, the window and
// prefers-reduced-motion under the test's hand. Its own file, because the
// facade keeps its stage, its governor and its launch in module state.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => {
  const env = { calm: false, t: 1000 };
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  globalThis.matchMedia = q => ({ matches: env.calm && /prefers-reduced-motion/.test(q) });
  const drawn = [];
  const r = {
    info: { programs: [], render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, autoReset: true, reset() {} },
    autoClear: true,
    getContext: () => ({ getExtension: () => null, getParameter: () => 'Test GPU', RENDERER: 0x1f01 }),
    compile(scene) { scene.traverse(() => {}); }, render(scene) { drawn.push(scene.name === 'stage' ? 'stage' : 'fade'); },
    setRenderTarget() {}, setScissor() {}, setScissorTest() {}, setViewport() {}, clear() {}, readRenderTargetPixels() {},
  };
  return { env, r, drawn, clears: { n: 0 } };
});
vi.mock('./render.js', () => ({ getRenderer: () => H.r, clearCanvas: () => { H.clears.n++; } }));
vi.mock('./stagelook.js', async orig => ({ ...(await orig()), stageEnvironment: () => null }));

import { getState, transition } from './machine.js';
import { launch, launching, LAUNCH_S, renderPreview, setPreviewFrame, stageInfo } from './preview.js';
import { G } from './state.js';

/** The select screen's band at 1440x900 (SelectScreen stageBand); the circuit screen has none. */
const BAND = { x: 554, y: 92, w: 756, h: 532 };

/** One frame of game.js's loop, `ms` after the last: the stage where game.js draws it, the background elsewhere. */
function frame(ms = 16) {
  H.env.t += ms;
  const s = getState();
  if (s === 'select' || s === 'garage' || (s === 'tracks' && launching())) renderPreview(ms / 1000);
  else H.clears.n++;
}
const frames = (n, ms) => { for (let i = 0; i < n; i++) frame(ms); };
/** The rig on show: the kart's parent (G.previewKart is the stage kart). */
const rig = () => G.previewKart.parent;

beforeAll(() => { vi.spyOn(performance, 'now').mockImplementation(() => H.env.t); });
afterAll(() => { vi.restoreAllMocks(); });

describe('the "go" launch, frame by frame', () => {
  beforeAll(() => {
    setPreviewFrame(() => (getState() === 'select' ? BAND : null));
    transition('select');
    frames(60);   // the stage built, its programs compiled, the candidate popped in
  });

  it('draws the roster\'s podium, moving, before anything is launched', () => {
    const info = stageInfo();
    expect(info.ready).toBe(true);
    expect(info.still).toBe(false);
    expect(info.launch).toMatchObject({ on: false, count: 0 });
    expect(rig().parent.name).toBe('turntable');
  });

  it('opens the circuits at once and drives the kart off behind them, then clears the canvas to the background', () => {
    transition('tracks');
    const clicked = H.env.t;
    expect(launch()).toBe(true);
    expect(launching()).toBe(true);
    // the press's own frame paints the circuit screen alone: no stage work, no draw
    H.drawn.length = 0;
    frame();
    expect(H.drawn).toEqual([]);
    // then the tail: the stage frame by frame, the fade over it from LAUNCH_FADE_AT, the kart ever farther down the aisle
    const zs = [], clears = H.clears.n;
    let n = 0;
    while (launching() && n++ < 200) { frame(); if (launching()) zs.push(stageInfo().launch.z); }
    expect(n).toBeGreaterThan(LAUNCH_S * 60 - 3);
    expect(H.env.t - clicked).toBeLessThanOrEqual(1500);              // --bg 1.5 s after the click at the latest
    expect(H.drawn.filter(d => d === 'stage').length).toBeGreaterThan(LAUNCH_S * 60 - 5);
    expect(H.drawn.filter(d => d === 'fade').length).toBeGreaterThan(10);
    zs.forEach((z, i) => { if (i) expect(z).toBeLessThanOrEqual(zs[i - 1]); });
    expect(zs[zs.length - 1]).toBeLessThan(-8);
    expect(stageInfo().launch).toMatchObject({ on: false, count: 1 });
    // the canvas back to the background on the tail's last frame, and nothing drawn behind the circuits after it
    expect(H.clears.n).toBe(clears + 1);
    const after = H.drawn.length;
    frames(10);
    expect(H.drawn.length).toBe(after);
    expect(H.clears.n).toBe(clears + 11);
    // the kart is back on the podium, ready to pop in again
    expect(rig().parent.name).toBe('turntable');
    expect(rig().position.toArray()).toEqual([0, 0, 0]);
  });

  it('ignores a second launch while one is armed or playing', () => {
    transition('select'); frames(40);
    transition('tracks');
    expect(launch()).toBe(true);
    expect(launch()).toBe(false);
    frames(5);
    expect(launch()).toBe(false);
    expect(stageInfo().launch.count).toBe(2);
  });

  it('puts the kart back on the podium cleanly when the player comes back during the tail', () => {
    frames(20);
    expect(launching()).toBe(true);
    expect(rig().parent.name).not.toBe('turntable');
    transition('select');
    expect(launching()).toBe(false);
    expect(rig().parent.name).toBe('turntable');
    expect(rig().position.toArray()).toEqual([0, 0, 0]);
    expect(rig().rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    frames(40);
    const info = stageInfo();
    expect(info.ready).toBe(true);
    // the whole rig inside the band again
    expect(info.bbox.y).toBeGreaterThanOrEqual(BAND.y - 1); expect(info.bbox.y + info.bbox.h).toBeLessThanOrEqual(BAND.y + BAND.h + 1);
  });

  it('plays no launch and no confetti under prefers-reduced-motion: the circuits sit on the background at once', () => {
    H.env.calm = true;
    frames(10);
    transition('tracks');
    expect(launch()).toBe(false);
    expect(launching()).toBe(false);
    H.drawn.length = 0;
    const clears = H.clears.n;
    frames(5);
    expect(H.drawn).toEqual([]);
    expect(H.clears.n).toBe(clears + 5);
    expect(stageInfo().launch.count).toBe(2);
    transition('select');
    H.env.calm = false;
    frames(10);
  });

  it('plays no launch on a still stage (a GPU that cannot keep up), straight to the background', () => {
    // frames of a fifth of a second: the governor stands the stage still
    frames(8, 200);
    expect(stageInfo().still).toBe(true);
    transition('tracks');
    expect(launch()).toBe(false);
    H.drawn.length = 0;
    frames(3, 200);
    expect(H.drawn).toEqual([]);
    expect(stageInfo().launch.count).toBe(2);
  });
});
