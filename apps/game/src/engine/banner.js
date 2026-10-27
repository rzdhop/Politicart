// The banner queue: one message on screen at a time, each held long enough
// to be read.
//
// The engine can raise several toasts in one frame (a Cumul des mandats
// fires two items at once; a hit lands as a lap is counted) and a busy race
// raises them in bursts. Written straight to the ribbon, each one replaced
// the last before anyone could read it, which is what the human saw as "too
// much on the screen" (DEC-029). So the HUD writer pushes every message here
// and the queue decides what shows: the current banner stays at least `hold`
// seconds, then the next one waiting takes over; a banner nobody follows
// fades after `show` seconds. At most `max` messages wait, oldest dropped
// first, so a burst never plays back for ten seconds after the fact.
//
// Pure and clock-free: tick(dt) advances it and returns what the ribbon must
// do this frame, `{ show: text }`, `{ hide: true }` or null. Testable without
// a DOM, like the rest of the engine.

/** A queue with its own tunables: `hold` and `show` in seconds, `max` waiting messages. */
export function createBannerQueue({ hold = 1.1, show = 2.2, max = 2 } = {}) {
  let waiting = [];
  let current = null;
  let shown = 0;          // how long the current banner has been up

  const next = () => { current = waiting.shift(); shown = 0; return { show: current }; };

  return {
    /** Queue a message. An empty one is a no-op, as the original toast() treated it. */
    push(text) {
      if (!text) return;
      waiting.push(text);
      if (waiting.length > max) waiting.shift();
    },
    /** Advance `dt` seconds. Returns what to do with the ribbon, or null to leave it. */
    tick(dt) {
      if (current === null) return waiting.length ? next() : null;
      shown += dt;
      if (waiting.length && shown >= hold) return next();
      if (shown >= show) { current = null; shown = 0; return { hide: true }; }
      return null;
    },
    /** The banner on screen right now, or null. Exposed for tests and diagnostics. */
    current: () => current,
    /** Drop everything, on screen and waiting. */
    clear() { waiting = []; current = null; shown = 0; },
  };
}
