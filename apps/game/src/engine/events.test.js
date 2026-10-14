import { beforeEach, describe, expect, it } from 'vitest';

import { drain, emit, pending, setHint, toast } from './events.js';

// The queue is module state, so every test starts from empty.
beforeEach(() => { drain(); });

describe('events queue', () => {
  it('starts empty', () => {
    expect(pending()).toBe(0);
    expect(drain()).toEqual([]);
  });

  it('returns events in emission order', () => {
    emit('toast', 'A');
    emit('hint', 'B');
    emit('toast', 'C');
    expect(drain()).toEqual([
      { type: 'toast', text: 'A' },
      { type: 'hint', text: 'B' },
      { type: 'toast', text: 'C' },
    ]);
  });

  it('empties the queue when drained, so nothing is replayed next frame', () => {
    emit('toast', 'once');
    expect(drain()).toHaveLength(1);
    expect(pending()).toBe(0);
    expect(drain()).toEqual([]);
  });

  it('keeps accepting events after a drain', () => {
    emit('toast', 'first frame');
    drain();
    emit('toast', 'second frame');
    expect(drain()).toEqual([{ type: 'toast', text: 'second frame' }]);
  });

  it('exposes toast() and setHint() with the shapes the engine code calls', () => {
    toast('FIGURE !');
    setHint('Ramassez une urne dorée pour obtenir un objet.');
    expect(drain()).toEqual([
      { type: 'toast', text: 'FIGURE !' },
      { type: 'hint', text: 'Ramassez une urne dorée pour obtenir un objet.' },
    ]);
  });

  it('passes an empty toast through for the consumer to ignore, as the original toast() did', () => {
    toast('');
    expect(drain()).toEqual([{ type: 'toast', text: '' }]);
  });

  it('hands back the array by value: mutating a drained batch does not touch the queue', () => {
    emit('toast', 'x');
    const batch = drain();
    batch.push({ type: 'toast', text: 'stray' });
    expect(pending()).toBe(0);
    expect(drain()).toEqual([]);
  });
});
