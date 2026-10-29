// @vitest-environment jsdom
// The thumbnails' queue against a stand-in renderer (thumbs.js thumbsFrame):
// the slices, the order, the one compile, the slow-GPU fallback. jsdom has
// no WebGL and no 2D canvas, so both are faked at their surface.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TRACKS } from './data.js';
import { onThumbs, requestThumbs, resetThumbs, setStillProbe, thumbsFrame, thumbStatus } from './thumbs.js';

const ctx2d = () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage() {}, imageSmoothingEnabled: false, imageSmoothingQuality: 'low' });
function fakeRenderer(renderMs = 0) {
  const busy = ms => { const t = performance.now(); while (performance.now() - t < ms) { /* a slow GPU */ } };
  return {
    compile: vi.fn(), render: vi.fn(() => busy(renderMs)), clear() {}, setRenderTarget() {}, setClearColor() {}, getClearColor: c => c, getClearAlpha: () => 1,
    getScissorTest: () => false, setScissorTest() {}, readRenderTargetPixels: vi.fn(),
  };
}

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx2d()); });
afterEach(() => { vi.restoreAllMocks(); resetThumbs(); onThumbs(null); setStillProbe(null); });

/** Run frames until the queue is empty; how many it took. */
function drain(r, budget = 6) { let n = 0; while (thumbsFrame({ renderer: r, budget }) && n < 500) n++; return n + 1; }

describe('thumbsFrame with a renderer', () => {
  it('renders every circuit over several frames, the selected one first, compiling the shared program once', () => {
    const r = fakeRenderer(), order = [];
    onThumbs(v => { for (const [id, t] of Object.entries(v)) if (t.state === 'ready' && !order.includes(id)) order.push(id); });
    requestThumbs(3);
    const frames = drain(r);
    expect(frames).toBeGreaterThan(TRACKS.length);           // sliced, not all at once
    expect(order[0]).toBe(TRACKS[3].id);
    expect(order).toHaveLength(TRACKS.length);
    expect(r.compile).toHaveBeenCalledTimes(1);
    expect(r.render).toHaveBeenCalledTimes(TRACKS.length);
    expect(thumbStatus()).toMatchObject({ ready: TRACKS.length, static: 0, still: false });
  });

  it('stands aside on a slow GPU: after two slow renders the rest keep their placeholders', () => {
    const r = fakeRenderer(45);
    requestThumbs(0);
    drain(r);
    expect(r.render).toHaveBeenCalledTimes(2);
    expect(thumbStatus()).toMatchObject({ ready: 2, static: TRACKS.length - 2, still: true });
  });

  it('renders nothing when the stage’s governor stood the stage still', () => {
    const r = fakeRenderer();
    setStillProbe(() => true);
    requestThumbs(0);
    drain(r);
    expect(r.render).not.toHaveBeenCalled();
    expect(thumbStatus().static).toBe(TRACKS.length);
  });
});
