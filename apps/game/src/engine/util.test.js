import { describe, expect, it } from 'vitest';

import { easeInOutCubic, easeOutBack, easeOutBounce } from './util.js';

describe('easings', () => {
  it.each([['easeOutBounce', easeOutBounce], ['easeOutBack', easeOutBack], ['easeInOutCubic', easeInOutCubic]])('%s starts at 0 and lands on 1', (_name, ease) => {
    expect(ease(0)).toBeCloseTo(0, 10);
    expect(ease(1)).toBeCloseTo(1, 10);
  });

  it('bounce stays inside [0, 1] and touches the floor at each bounce', () => {
    for (let i = 0; i <= 100; i++) { const v = easeOutBounce(i / 100); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1 + 1e-12); }
    expect(easeOutBounce(1 / 2.75)).toBeCloseTo(1, 10);
    expect(easeOutBounce(2 / 2.75)).toBeCloseTo(1, 10);
  });

  it('back overshoots past 1 before settling', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100)));
    expect(peak).toBeGreaterThan(1.05);
  });

  it('in-out cubic is symmetric about the middle', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 10);
  });
});
