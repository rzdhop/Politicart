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
  it('passes the current cast and the hold to the worker', () => {
    applyRoster({ chars: { victor: { name: 'Manu', title: 'Le président', quote: '« Hop. »' } } }, CHARACTERS, BASE);
    const room = new Room('CAST'); room.join('alice', 'Alice');
    runRace(room, room.roster(), { send() {}, broadcast() {}, done() {} }, { hold: 1234 });
    const { url, workerData } = started.at(-1);
    expect(url).toMatch(/race-worker\.js$/);
    expect(workerData.hold).toBe(1234);
    expect(workerData.cast).toHaveLength(16);
    expect(workerData.cast[0]).toEqual({ id: 'victor', name: 'Manu', title: 'Le président', quote: '« Hop. »' });
    expect(workerData.cast[1]).toEqual({ id: 'gege', name: BASE[1].name, title: BASE[1].title, quote: BASE[1].quote });
    expect(() => structuredClone(workerData)).not.toThrow();      // it must cross the thread boundary
  });
});
