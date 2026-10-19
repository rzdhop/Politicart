// The game's state machine: the single source of truth for "where are we".
//
// Before stage 11 the game kept two parallel records of this. `G.state` was a
// string assigned by hand at every transition, and showScreen() toggled the
// `hidden` attribute on six sections -- two writes per transition, in either
// order, with nothing checking that they agreed. This module replaces both:
// the engine and the UI read one `current` state, and every change goes
// through transition(), which refuses moves the game has no path for and
// tells every listener about the ones it accepts. The UI shows screens by
// listening; nothing else toggles a section.
//
// `G.state` still exists for the engine code that reads it, as a read-only
// getter over this module (see state.js). Assigning to it throws.
//
// The transition table is the game's real flow, nothing more: title to the
// roster or the workshop, roster to the circuits, circuits into a countdown,
// countdown into the race, race to the results, pause from either phase of
// the race and back, and quit or menu back to the title. A move not listed
// here is a bug, so transition() throws rather than silently desyncing.
//
// `lobby` is the team race's waiting room (DEC-014): reached from the title,
// left for the title or -- when the server starts the race -- straight into
// the countdown. A networked race returns to it from the countdown, the
// race or the results, because the room outlives each race. There is no
// pause in a networked race: the world does not stop for one player.
//
// `account` is the player's account screen: log in or sign up, the level and
// the friend list. Reached from the title, it leads back there or -- when an
// invitation is accepted -- straight into the lobby.

export const STATES = Object.freeze(['title', 'select', 'tracks', 'admin', 'countdown', 'race', 'paused', 'results', 'lobby', 'account']);

const NEXT = Object.freeze({
  title: Object.freeze(['select', 'admin', 'lobby', 'account']),
  select: Object.freeze(['title', 'tracks']),
  tracks: Object.freeze(['select', 'countdown']),
  admin: Object.freeze(['title']),
  countdown: Object.freeze(['race', 'paused', 'lobby']),
  race: Object.freeze(['paused', 'results', 'lobby']),
  paused: Object.freeze(['race', 'countdown', 'title']),
  results: Object.freeze(['countdown', 'title', 'lobby']),
  lobby: Object.freeze(['title', 'countdown']),
  account: Object.freeze(['title', 'lobby']),
});

let current = 'title';
const listeners = new Set();

/** The current state name. */
export const getState = () => current;

/** Whether the game has a path from the current state to `to`. */
export function canTransition(to) {
  return NEXT[current].includes(to);
}

/**
 * Move to `to`. Throws on a move the game has no path for, so a desync is a
 * loud error at the call site rather than a wrong screen later. Listeners
 * run synchronously, in registration order, after the state has changed, and
 * receive (to, from).
 */
export function transition(to) {
  if (!canTransition(to)) throw new Error('Illegal game state transition: ' + current + ' -> ' + to);
  const from = current;
  current = to;
  for (const fn of listeners) fn(to, from);
  return to;
}

/** Subscribe to accepted transitions. Returns the unsubscribe function. */
export function onTransition(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Force a state without notifying anyone. For tests only. */
export function resetMachine(state = 'title') {
  if (!STATES.includes(state)) throw new Error('Unknown game state: ' + state);
  current = state;
  listeners.clear();
}
