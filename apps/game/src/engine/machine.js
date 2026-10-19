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
// roster, the workshop or its login, roster to the circuits, circuits into a countdown,
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
// `garage` is where the player styles their own kart, reached from and
// returning to the roster, so the turntable stays on screen throughout.
//
// `login` is the admin's sign-in on the game server. It is left for the
// title, or straight for the workshop on success; the workshop comes back to
// it when the session has expired mid-edit, so the draft survives the new
// login.

export const STATES = Object.freeze(['title', 'select', 'tracks', 'admin', 'countdown', 'race', 'paused', 'results', 'lobby', 'garage', 'login']);

const NEXT = Object.freeze({
  title: Object.freeze(['select', 'admin', 'lobby', 'login']),
  select: Object.freeze(['title', 'tracks', 'garage']),
  tracks: Object.freeze(['select', 'countdown']),
  admin: Object.freeze(['title', 'login']),
  countdown: Object.freeze(['race', 'paused', 'lobby']),
  race: Object.freeze(['paused', 'results', 'lobby']),
  paused: Object.freeze(['race', 'countdown', 'title']),
  results: Object.freeze(['countdown', 'title', 'lobby']),
  lobby: Object.freeze(['title', 'countdown']),
  garage: Object.freeze(['select']),
  login: Object.freeze(['title', 'admin']),
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
