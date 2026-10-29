// The local kart of a team race, predicted and reconciled (DEC-052).
//
// A networked client used to draw its own kart from snapshots like every
// other one, so it answered the controls half a round trip plus the render
// delay late. Now it runs its own kart's physics ahead of the server, at the
// server's fixed step, from the same updateKart (physics.js) under the
// G.replaying guard: nothing is said, played, counted as a lap or drawn by a
// predicted tick, and the item roll is left to the server.
//
// Each tick it predicts gets a sequence number and goes into a short history
// with the controls it used; the controls go to the server with that number.
// The server echoes, in this player's snapshot, `ack` -- the newest number it
// has applied -- and `n`, how many ticks it has stood on those controls, so
// its kart is where ours was after tick ack + n - 1. reconcile() puts the
// server's kart in (its public motion and the private block `me`), drops the
// history up to that tick, replays the rest, and only then takes the
// server's word on items, laps and ranks (netstate.js applyKartDiscrete).
// Whatever separates the kart on screen from the corrected one becomes an
// error offset that blend() lets die out in about 100 ms; a correction past
// 3 m or 0.6 rad, a teleport, or the first one snaps instead.
//
// estimateDelay() sizes the render delay of the other karts from the
// measured lateness of snapshots (netrace.js moves its delay towards it by
// at most a tick a second).
//
// Module state, like the rest of the engine; resetPrediction() starts a race.
import { applyKartDiscrete, applyKartMotion, applyKartPrivate } from './netstate.js';
import { updateKart } from './physics.js';
import { G, STEP } from './state.js';

/** The longest history kept, in ticks: four seconds at 60 Hz, far more than any round trip a race survives. */
export const HISTORY = 240;
/** A correction past this distance (m) or this heading (rad) is shown at once rather than smoothed. */
export const SNAP_DIST = 3, SNAP_ANGLE = 0.6;
/** How fast the error offset dies out, per second: e^(-30 x 0.1) = 5 % left after 100 ms. */
export const BLEND_RATE = 30;

let history = [];                // [{ seq, c }], oldest first, consecutive numbers
let seq = 0;                     // the newest tick numbered
let clock = 0;                   // the race clock the predicted kart is at (the server's G.time at that tick)
let reconciled = false;          // has a snapshot corrected us yet?
let tpSeen = 0;                  // the kart's teleport count at the last correction
const off = { x: 0, z: 0, y: 0, h: 0 };

/** Forget everything: a new race. */
export function resetPrediction() {
  history = []; seq = 0; clock = 0; reconciled = false; tpSeen = 0;
  off.x = off.z = off.y = off.h = 0;
}

/** The newest tick numbered, and the history (read-only views, for the net race and tests). */
export const lastSeq = () => seq;
export const getHistory = () => history;
/** The error offset currently drawn on top of the predicted kart. */
export const errorOffset = () => ({ ...off });

/**
 * One fixed step of kart k's physics with controls `c`, as the server would
 * run it, and silently: k.ctrl answers `c` and G.replaying is up for the
 * step, then both are put back.
 */
export function simulateLocal(k, c) {
  const ctrl = k.ctrl, flag = G.replaying;
  k.ctrl = () => c; G.replaying = true;
  try { updateKart(k, STEP); } finally { k.ctrl = ctrl; G.replaying = flag; }
}

/** One tick at the predicted race clock, which runs only once the race is on (simStep's clock does not tick through the countdown). */
function tick(k, c) {
  if (G.state !== 'countdown') clock += STEP;
  const shown = G.time; G.time = clock;
  try { simulateLocal(k, c); } finally { G.time = shown; }
}

/** Number a tick of controls `c` and keep it, without simulating anything (the kart is not predicted yet). Returns its number. */
export function recordTick(c) {
  history.push({ seq: ++seq, c });
  if (history.length > HISTORY) history.splice(0, history.length - HISTORY);
  return seq;
}

/** Predict one tick of kart k with controls `c`: numbered, kept and simulated. Returns its number, which goes to the server with `c`. */
export function predictTick(k, c) {
  const n = recordTick(c);
  tick(k, c);
  return n;
}

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/**
 * Correct kart k from the server: `s` is its public state in the newest
 * snapshot, `me` its private block, `ack` and `n` the server's echo, `t` the
 * snapshot's race clock. Returns `{ replayed, lead }`: the ticks re-simulated
 * and how far ahead of the server the prediction now runs, in ticks.
 */
export function reconcile(k, s, me, ack, n, t = G.time) {
  const was = { x: k.pos.x + off.x, z: k.pos.z + off.z, y: k.y + off.y, h: k.heading + off.h };   // what is on screen
  const tp = s.tp ?? 0, jumped = reconciled && tp !== tpSeen;
  applyKartMotion(k, s); if (me) applyKartPrivate(k, me);
  // the server stands where we stood after tick ack + n - 1: drop the history up to there
  // (everything up to ack, then the n - 1 ticks it ran on ack's controls) and replay the rest
  const at = ack + Math.max(1, n) - 1;
  let drop = 0; while (drop < history.length && history[drop].seq <= at) drop++;
  if (drop) history.splice(0, drop);
  if (seq < at) seq = at;          // the server got ahead of us (a stalled tab): number on from its tick
  clock = t;
  for (const e of history) tick(k, e.c);
  if (me) applyKartDiscrete(k, s, me); else applyKartDiscrete(k, s);
  // the correction, as an offset that blend() lets go
  off.x = was.x - k.pos.x; off.z = was.z - k.pos.z; off.y = was.y - k.y; off.h = wrap(was.h - k.heading);
  if (!reconciled || jumped || Math.hypot(off.x, off.z, off.y) > SNAP_DIST || Math.abs(off.h) > SNAP_ANGLE) off.x = off.z = off.y = off.h = 0;
  reconciled = true; tpSeen = tp;
  return { replayed: history.length, lead: seq - at };
}

/** Let the error offset die out over `dt` seconds (about 95 % of it in 100 ms). */
export function blend(dt) {
  const f = Math.exp(-BLEND_RATE * dt);
  off.x *= f; off.z *= f; off.y *= f; off.h *= f;
  if (Math.abs(off.x) + Math.abs(off.z) + Math.abs(off.y) < 1e-4 && Math.abs(off.h) < 1e-5) off.x = off.z = off.y = off.h = 0;
}

/**
 * The render delay the other karts need, in ticks, from `devs`, the recent
 * snapshots' lateness against the estimated server clock (ticks, 0 for one
 * on time): two snapshot intervals (`interval` ticks each) plus the mean
 * lateness and 2.5 standard deviations of it, between 4 and 18 ticks
 * (67 to 300 ms).
 */
export function estimateDelay(devs, interval = 3) {
  let mean = 0, sd = 0;
  if (devs.length) {
    mean = devs.reduce((a, d) => a + d, 0) / devs.length;
    sd = Math.sqrt(devs.reduce((a, d) => a + (d - mean) ** 2, 0) / devs.length);
  }
  return Math.min(18, Math.max(4, 2 * interval + mean + 2.5 * sd));
}
