import { beforeEach, describe, expect, it } from 'vitest';

import { STATES, canTransition, getState, onTransition, resetMachine, transition } from './machine.js';
import { G } from './state.js';

beforeEach(() => { resetMachine('title'); });

/** Every path the game's buttons and keys actually take. */
const FLOWS = [
  ['title', 'select', 'tracks', 'countdown', 'race', 'results', 'title'],          // a full race, then back to the menu
  ['title', 'select', 'tracks', 'countdown', 'race', 'results', 'countdown'],      // "rejouer" from the results
  ['title', 'admin', 'title'],                                                      // the workshop
  ['title', 'select', 'title'],                                                     // back from the roster
  ['title', 'select', 'tracks', 'select'],                                          // back from the circuits
  ['title', 'select', 'tracks', 'countdown', 'paused', 'countdown', 'race'],        // pause during the countdown
  ['title', 'select', 'tracks', 'countdown', 'race', 'paused', 'race'],             // pause during the race
  ['title', 'select', 'tracks', 'countdown', 'race', 'paused', 'title'],            // quit from the pause menu
  ['title', 'lobby', 'countdown', 'race', 'results', 'lobby', 'title'],               // a team race, back to the room, then home
  ['title', 'lobby', 'countdown', 'lobby'],                                         // left the room during the countdown
  ['title', 'lobby', 'countdown', 'race', 'lobby'],                                 // left mid-race
  ['title', 'account', 'title'],                                                    // the account screen and back
  ['title', 'account', 'lobby', 'title'],                                           // accepted an invitation from it
];

describe('game state machine', () => {
  it('starts on the title screen', () => {
    expect(getState()).toBe('title');
  });

  it('lists exactly the nine states the game has', () => {
    expect([...STATES]).toEqual(['title', 'select', 'tracks', 'admin', 'countdown', 'race', 'paused', 'results', 'lobby', 'account']);
  });

  it.each(FLOWS)('accepts the flow %s -> %s -> %s ...', (...flow) => {
    resetMachine(flow[0]);
    for (const to of flow.slice(1)) {
      expect(canTransition(to)).toBe(true);
      expect(transition(to)).toBe(to);
      expect(getState()).toBe(to);
    }
  });

  it('refuses moves the game has no path for, and stays put', () => {
    for (const [from, to] of [['title', 'race'], ['title', 'results'], ['select', 'countdown'], ['race', 'title'], ['race', 'select'], ['admin', 'select'], ['results', 'race'], ['countdown', 'results'], ['lobby', 'race'], ['lobby', 'select'], ['lobby', 'paused'], ['select', 'lobby'], ['account', 'select'], ['race', 'account']]) {
      resetMachine(from);
      expect(canTransition(to)).toBe(false);
      expect(() => transition(to)).toThrow(/Illegal game state transition: /);
      expect(getState()).toBe(from);
    }
  });

  it('refuses a move to the same state, so a double start is a loud error rather than a silent restart', () => {
    resetMachine('countdown');
    expect(() => transition('countdown')).toThrow();
  });

  it('notifies listeners after the change, with (to, from), in registration order', () => {
    const seen = [];
    onTransition((to, from) => seen.push(['a', to, from, getState()]));
    onTransition((to, from) => seen.push(['b', to, from, getState()]));
    transition('select');
    expect(seen).toEqual([['a', 'select', 'title', 'select'], ['b', 'select', 'title', 'select']]);
  });

  it('does not notify listeners about a refused move', () => {
    let calls = 0;
    onTransition(() => { calls++; });
    expect(() => transition('race')).toThrow();
    expect(calls).toBe(0);
  });

  it('lets a listener unsubscribe', () => {
    let calls = 0;
    const off = onTransition(() => { calls++; });
    transition('select');
    off();
    transition('tracks');
    expect(calls).toBe(1);
  });

  it('is what G.state reads, and G.state cannot be assigned', () => {
    expect(G.state).toBe('title');
    transition('admin');
    expect(G.state).toBe('admin');
    expect(() => { G.state = 'race'; }).toThrow();
    expect(G.state).toBe('admin');
  });
});
