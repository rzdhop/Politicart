// The items' and powers' own sounds (DEC-053), synthesised like every other:
// played through a fake AudioContext, each name must start at least one
// voice. In its own file: initAudio keeps its context for the module's life.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { initAudio, ITEM_SOUNDS, setSfxSink, sfx } from './audio.js';

let started = 0;
const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
const node = extra => ({ connect() {}, ...extra });
class FakeContext {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.state = 'running'; }
  createGain() { return node({ gain: param() }); }
  createOscillator() { return node({ type: 'sine', frequency: param(), start() { started++; }, stop() {} }); }
  createBiquadFilter() { return node({ type: 'lowpass', frequency: param(), Q: param() }); }
  createBuffer(ch, n) { const d = new Float32Array(n); return { getChannelData: () => d }; }
  createBufferSource() { return node({ buffer: null, start() { started++; }, stop() {} }); }
  resume() {}
}

beforeAll(() => { vi.useFakeTimers(); globalThis.window = { AudioContext: FakeContext }; setSfxSink(null); initAudio(); });
afterAll(() => { vi.useRealTimers(); delete globalThis.window; });

describe('the items’ and powers’ sounds', () => {
  it('names the eleven the moves play', () => {
    expect(ITEM_SOUNDS).toEqual(['impact', 'swoosh', 'teleport', 'siren', 'gas', 'pans', 'gavel', 'stamp', 'mow', 'euro', 'rally']);
  });

  it.each(ITEM_SOUNDS)('%s starts voices of its own', name => {
    const before = started; sfx(name);
    expect(started - before).toBeGreaterThan(0);
  });

  it('an unknown name starts nothing', () => {
    const before = started; sfx('nope');
    expect(started).toBe(before);
  });
});
