import { describe, expect, it } from 'vitest';

import { createBannerQueue } from './banner.js';

describe('the banner queue', () => {
  it('shows a pushed message on the next tick and hides it once its time is up', () => {
    const q = createBannerQueue({ hold: 1, show: 2, max: 2 });
    expect(q.tick(0.1)).toBeNull();
    q.push('DERNIER TOUR !');
    expect(q.tick(0)).toEqual({ show: 'DERNIER TOUR !' });
    expect(q.tick(1.9)).toBeNull();
    expect(q.tick(0.2)).toEqual({ hide: true });
    expect(q.current()).toBeNull();
  });

  it('holds the current banner before the next one takes over', () => {
    const q = createBannerQueue({ hold: 1, show: 2, max: 2 });
    q.push('A'); q.push('B');
    expect(q.tick(0)).toEqual({ show: 'A' });
    expect(q.tick(0.5)).toBeNull();                 // B waits: A has not been readable for long enough
    expect(q.tick(0.5)).toEqual({ show: 'B' });
    expect(q.tick(1.5)).toBeNull();
    expect(q.tick(0.6)).toEqual({ hide: true });
  });

  it('drops the oldest waiting message in a burst, never the one on screen', () => {
    const q = createBannerQueue({ hold: 1, show: 2, max: 2 });
    q.push('A'); expect(q.tick(0)).toEqual({ show: 'A' });
    q.push('B'); q.push('C'); q.push('D');
    expect(q.tick(1)).toEqual({ show: 'C' });
    expect(q.tick(1)).toEqual({ show: 'D' });
    expect(q.tick(2)).toEqual({ hide: true });
  });

  it('ignores an empty message and can be cleared', () => {
    const q = createBannerQueue();
    q.push(''); q.push(null);
    expect(q.tick(1)).toBeNull();
    q.push('X'); q.clear();
    expect(q.tick(1)).toBeNull();
  });
});
