// The engine's view of the player's input.
//
// The physics step needs to know whether the player is accelerating, braking,
// steering or drifting. Who answers that is not the engine's business: today
// it is a keyboard listener in game.js, tomorrow it may be a touch overlay or
// a replay. So the engine reads through readInput() and whoever owns the
// controls registers a source once with setInputSource().
//
// Until a source is registered the input is idle, which is also what a kart
// with nobody at the wheel should do: nothing. The idle object is frozen so a
// physics step that mutates its copy of the input (updateKart does, when a
// jump cancels the drift) cannot leak that change into the next frame.

const IDLE = Object.freeze({ throttle: false, brake: false, left: false, right: false, drift: false });

let source = null;

/** Register the function the engine calls to read the player's controls. */
export function setInputSource(fn) {
  source = typeof fn === 'function' ? fn : null;
}

/** The player's current input: `{ throttle, brake, left, right, drift }`. */
export function readInput() {
  return source ? source() : IDLE;
}
