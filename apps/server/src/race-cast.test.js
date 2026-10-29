// The race runner hands the worker the cast as the main thread has it (the
// admin's names), with the clock-hold option untouched. The Worker is a fake
// here, so nothing is raced: race.test.js runs the real worker.
import { afterAll, describe, expect, it, vi } from 'vitest';

const started = vi.hoisted(() => []);
vi.mock('node:worker_threads', () => ({
  Worker: class {
    constructor(url, opts) { started.push({ url: String(url), workerData: opts.workerData }); }
    on() {}
    postMessage() {}
    terminate() {}
  },
}));

const { BASE, CHARACTERS } = await import('../../game/src/engine/data.js');
const { Room } = await import('./lobby.js');
const { runRace } = await import('./race.js');
const { applyRoster, emptyRoster } = await import('./roster.js');

afterAll(() => applyRoster(emptyRoster(), CHARACTERS, BASE));

describe('runRace', () => {
  it('takes a given seed and hands it to the worker and the players', () => {
    const room = new Room('SEED'); room.join('alice', 'Alice');
    const sent = [];
    runRace(room, room.roster(), { send: (id, m) => sent.push(m), broadcast() {}, done() {} }, { seed: 4242 });
    expect(started.at(-1).workerData.seed).toBe(4242);
    expect(sent.find(m => m.t === 'race').seed).toBe(4242);
  });

  it('passes the current cast and the hold to the worker', () => {
    applyRoster({ chars: { victor: { name: 'Manu', title: 'Le président', quote: '« Hop. »' } } }, CHARACTERS, BASE);
    const room = new Room('CAST'); room.join('alice', 'Alice');
    const sent = [];
    runRace(room, room.roster(), { send: (id, m) => sent.push(m), broadcast() {}, done() {} }, { hold: 1234 });
    const { url, workerData } = started.at(-1);
    expect(url).toMatch(/race-worker\.js$/);
    expect(workerData.hold).toBe(1234);
    // the seed (DEC-049): drawn here, the same in the worker's data and in the start message
    expect(Number.isInteger(workerData.seed)).toBe(true);
    expect(sent.find(m => m.t === 'race').seed).toBe(workerData.seed);
    expect(workerData.cast).toHaveLength(16);
    expect(workerData.cast[0]).toEqual({ id: 'victor', name: 'Manu', title: 'Le président', quote: '« Hop. »' });
    expect(workerData.cast[1]).toEqual({ id: 'gege', name: BASE[1].name, title: BASE[1].title, quote: BASE[1].quote });
    expect(() => structuredClone(workerData)).not.toThrow();      // it must cross the thread boundary
  });
});
