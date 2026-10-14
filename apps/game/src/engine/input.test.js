import { afterEach, describe, expect, it } from 'vitest';

import { readInput, setInputSource } from './input.js';

afterEach(() => { setInputSource(null); });

describe('input seam', () => {
  it('reads idle input when no source is registered', () => {
    expect(readInput()).toEqual({ throttle: false, brake: false, left: false, right: false, drift: false });
  });

  it('reads through the registered source on every call', () => {
    let n = 0;
    setInputSource(() => ({ throttle: true, brake: false, left: n++ > 0, right: false, drift: false }));
    expect(readInput().left).toBe(false);
    expect(readInput().left).toBe(true);
  });

  it('goes back to idle when the source is cleared', () => {
    setInputSource(() => ({ throttle: true, brake: false, left: false, right: false, drift: true }));
    expect(readInput().drift).toBe(true);
    setInputSource(null);
    expect(readInput().drift).toBe(false);
  });

  it('ignores a non-function source rather than throwing on the next frame', () => {
    setInputSource('not a function');
    expect(() => readInput()).not.toThrow();
    expect(readInput().throttle).toBe(false);
  });

  it('keeps the idle input immutable so one frame cannot poison the next', () => {
    const idle = readInput();
    expect(Object.isFrozen(idle)).toBe(true);
    expect(() => { idle.drift = true; }).toThrow();
    expect(readInput().drift).toBe(false);
  });
});
