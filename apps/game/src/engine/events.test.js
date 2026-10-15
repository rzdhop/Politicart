import { beforeEach, describe, expect, it } from 'vitest';

import { drain, emit, hintFor, pending, resolveFor, say, setHint, tell, toast } from './events.js';

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

describe('routing by kart', () => {
  const player = { isAI: false }, other = { isAI: false }, bot = { isAI: true };

  it('say() reaches only that driver, and never an AI kart', () => {
    say(player, 'TOUR 2');
    say(bot, 'ignored');
    const [e, ...rest] = drain();
    expect(rest).toEqual([]);
    expect(resolveFor(e, player)).toBe('TOUR 2');
    expect(resolveFor(e, other)).toBeNull();
  });

  it('tell() gives the actor one text and everyone else another', () => {
    tell(player, 'MOTION DE CENSURE !', 'MOTION DE CENSURE DÉPOSÉE !');
    const events = drain();
    expect(events.map(e => resolveFor(e, player)).filter(Boolean)).toEqual(['MOTION DE CENSURE !']);
    expect(events.map(e => resolveFor(e, other)).filter(Boolean)).toEqual(['MOTION DE CENSURE DÉPOSÉE !']);
  });

  it('tell() from an AI kart reaches every human with the others text', () => {
    tell(bot, 'never shown', 'CASSEROLADE !');
    const events = drain();
    expect(events).toHaveLength(1);
    expect(resolveFor(events[0], player)).toBe('CASSEROLADE !');
  });

  it('resolves text that depends on the reader', () => {
    tell(bot, 'x', o => (o === player ? 'VOUS ÊTES MIS·E EN EXAMEN !' : 'MISE EN EXAMEN SUR LE CIRCUIT'));
    const [e] = drain();
    expect(resolveFor(e, player)).toBe('VOUS ÊTES MIS·E EN EXAMEN !');
    expect(resolveFor(e, other)).toBe('MISE EN EXAMEN SUR LE CIRCUIT');
  });

  it('hintFor() is a hint for one driver; unrouted events reach everyone', () => {
    hintFor(other, 'Lancez-le !');
    toast('PARTEZ !');
    const [h, t] = drain();
    expect(h.type).toBe('hint');
    expect(resolveFor(h, player)).toBeNull();
    expect(resolveFor(h, other)).toBe('Lancez-le !');
    expect(resolveFor(t, player)).toBe('PARTEZ !');
  });
});
