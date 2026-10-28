// Small helpers with no game state of their own.
//
// `$` lives here rather than in a UI module because it is a one-line document
// lookup used from everywhere; which elements it is asked for is the UI's
// business, not its own.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const $ = id => document.getElementById(id);
export const fmtTime = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); };
export const ordinal = r => r + (r === 1 ? 'er' : 'e');
export const hex = c => '#' + c.toString(16).padStart(6, '0');

// Easings for the menus' 3D motion (the Politibox opening, lootbox.js): t in
// [0, 1] to a progress that starts at 0 and lands on 1. No tween library
// (DEC-007 keeps the runtime to Three.js r128).
/** A ball dropped on the floor: three shrinking bounces before it settles. */
export function easeOutBounce(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
  if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
  t -= 2.625 / d; return n * t * t + 0.984375;
}
/** Overshoots a little past 1, then settles back: a pop. */
export function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}
/** Slow in, fast through the middle, slow out. */
export const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
