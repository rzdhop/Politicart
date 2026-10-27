import { afterEach, describe, expect, it } from 'vitest';

import { boxPhase, dropGrade, makeTimeline, PHASE_TIME, PHASES, playOpening, REVEAL_TIME, skipOpening, stepOpening, stopOpening } from './lootbox.js';

// The Politibox opening runs headless here: the timeline is pure, and the
// scene is plain Three.js objects that are posed but never drawn.

const DROPS = {
  char: { kind: 'char', id: 'lucie', grade: 'common', duplicate: false, refund: 0 },
  part: { kind: 'part', id: 'wheels:gold', grade: 'mythic', duplicate: true, refund: 400 },
  trail: { kind: 'trail', id: 'laser', grade: 'incredible', duplicate: false, refund: 0 },
  coins: { kind: 'coins', amount: 50 },
};

afterEach(() => { stopOpening(); });

/** Run an opening with a fake clock of `dt` steps for `seconds`, and say which phases were reported. */
function runFor(drop, seconds, dt = 1 / 60) {
  const seen = [];
  playOpening(drop, { onPhase: p => seen.push(p) });
  for (let t = 0; t < seconds; t += dt) stepOpening(dt);
  return seen;
}

describe('the Politibox timeline', () => {
  it.each(Object.entries(DROPS))('plays drop, spin, shake, burst, reveal, hold in order for a %s, with the set durations', (kind, drop) => {
    const tl = makeTimeline(drop);
    expect(tl.durations).toMatchObject({ drop: 0.6, spin: 1.2, shake: 1.6, burst: 0.5, reveal: REVEAL_TIME[kind] });
    expect(tl.starts).toEqual({ drop: 0, spin: 0.6, shake: 1.8, burst: 3.4, reveal: 3.9 });
    expect(tl.duration).toBeCloseTo(3.9 + REVEAL_TIME[kind], 10);
    const names = [];
    for (let t = 0; t < tl.duration + 2; t += 0.05) { const n = tl.phase(t).name; if (names.at(-1) !== n) names.push(n); }
    expect(names).toEqual([...PHASES]);
    for (const name of PHASES.slice(0, -1)) {
      expect(tl.phase(tl.starts[name]).name, name + ' starts').toBe(name);
      expect(tl.phase(tl.starts[name]).k).toBe(0);
      expect(tl.phase(tl.starts[name] + tl.durations[name] * 0.5).k).toBeCloseTo(0.5, 10);
    }
    expect(tl.phase(tl.duration + 10)).toMatchObject({ name: 'hold', k: 1 });
  });

  it('keeps the timed phases the same for every prize; only the reveal changes', () => {
    expect(PHASE_TIME).toEqual({ drop: 0.6, spin: 1.2, shake: 1.6, burst: 0.5 });
    expect(new Set(Object.values(DROPS).map(d => makeTimeline(d).starts.reveal))).toEqual(new Set([3.9]));
  });

  it('skips to the burst before it, to the reveal from it, and nowhere after', () => {
    const tl = makeTimeline(DROPS.char);
    for (const t of [0, 0.3, 1.0, 2.5, 3.39]) expect(tl.skip(t)).toBe(tl.starts.burst);
    for (const t of [3.4, 3.6, 3.89]) expect(tl.skip(t)).toBe(tl.starts.reveal);
    for (const t of [3.9, 4.5, 20]) expect(tl.skip(t)).toBe(t);
  });

  it('gives a coin win a grade by its size, and an item the catalogue\'s', () => {
    expect(dropGrade(DROPS.part)).toBe('mythic');
    expect(dropGrade({ kind: 'coins', amount: 5 })).toBe('common');
    expect(dropGrade({ kind: 'coins', amount: 100 })).toBe('rare');
    expect(dropGrade({ kind: 'coins', amount: 500 })).toBe('mythic');
    expect(dropGrade({ kind: 'char', id: 'x', grade: 'bogus' })).toBe('common');
    expect(dropGrade(null)).toBe('common');
  });
});

describe('an opening', () => {
  it('is idle until one starts, and again once stopped', () => {
    expect(boxPhase()).toBe('idle');
    playOpening(DROPS.coins);
    expect(boxPhase()).toBe('drop');
    stopOpening();
    expect(boxPhase()).toBe('idle');
    expect(() => skipOpening()).not.toThrow();
    expect(stepOpening(0.1)).toBeNull();
  });

  it.each(Object.entries(DROPS))('reports every phase once, in order, under a fake clock (%s)', (_kind, drop) => {
    expect(runFor(drop, 8)).toEqual([...PHASES]);
    expect(boxPhase()).toBe('hold');
  });

  it('reports every phase it passes even when one frame jumps over several', () => {
    const seen = [];
    playOpening(DROPS.part, { onPhase: p => seen.push(p) });
    stepOpening(4.0);
    expect(seen).toEqual(['drop', 'spin', 'shake', 'burst', 'reveal']);
  });

  it('jumps to the burst on a tap before it, then to the reveal on the next, reporting each at once', () => {
    const seen = [];
    playOpening(DROPS.char, { onPhase: p => seen.push(p) });
    stepOpening(0.2);
    skipOpening();
    expect(boxPhase()).toBe('burst');
    expect(seen).toEqual(['drop', 'spin', 'shake', 'burst']);
    stepOpening(0.1);
    skipOpening();
    expect(boxPhase()).toBe('reveal');
    expect(seen.at(-1)).toBe('reveal');
    skipOpening();                                   // nothing left to skip
    expect(boxPhase()).toBe('reveal');
    for (let i = 0; i < 120; i++) stepOpening(1 / 30);
    expect(boxPhase()).toBe('hold');
    expect(seen).toEqual([...PHASES]);
  });

  it('starts over from the drop when a new opening replaces one in progress', () => {
    runFor(DROPS.trail, 2);
    const seen = runFor(DROPS.coins, 0.1);
    expect(seen).toEqual(['drop']);
    expect(boxPhase()).toBe('drop');
  });
});
