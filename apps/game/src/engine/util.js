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
