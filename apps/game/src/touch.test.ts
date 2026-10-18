// Touch mode and the held buttons, in node: no DOM, so no body class, but the
// state and its listeners behave the same.
import { describe, expect, it } from 'vitest';

import { isTouchMode, onTouchMode, releaseAll, setTouchMode, touchHeld } from './touch';

describe('touch mode', () => {
  it('starts off where there is no touch screen', () => {
    expect(isTouchMode()).toBe(false);
  });

  it('tells its listeners when it changes, and only then', () => {
    let calls = 0; const off = onTouchMode(() => { calls++; });
    setTouchMode(true); setTouchMode(true); setTouchMode(false);
    off(); setTouchMode(true); setTouchMode(false);
    expect(calls).toBe(2);
  });

  it('lets go of every button when the keyboard takes over', () => {
    setTouchMode(true);
    Object.assign(touchHeld, { left: true, brake: true, drift: true });
    setTouchMode(false);
    expect(touchHeld).toEqual({ left: false, right: false, brake: false, drift: false });
  });

  it('releases everything on demand', () => {
    Object.assign(touchHeld, { right: true, drift: true }); releaseAll();
    expect(Object.values(touchHeld).some(Boolean)).toBe(false);
  });
});
