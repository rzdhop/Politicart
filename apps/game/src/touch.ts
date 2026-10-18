// Touch play: what the on-screen buttons are holding, and whether the player
// is playing by touch at all.
//
// The race reads the controls through the engine's input seam
// (engine/input.js); game.js registers one source that merges the keyboard
// with the state kept here, so a kart can be driven by either, or both on a
// touch-screen laptop. The buttons themselves are React (ui/TouchControls.tsx)
// and write into `touchHeld` on pointer down and up.
//
// "Touch mode" decides whether those buttons are shown and whether the kart
// accelerates by itself (there is no accelerate button: the right thumb has
// enough to do). It starts on for devices whose main pointer is a finger, and
// follows the player after that: a touch turns it on, a driving key on the
// keyboard turns it off. document.body carries the class `kr-touch` while it
// is on, which the stylesheet uses to make room for the buttons.

/** The buttons held right now. Item and power are taps, not holds: see ui/store actions. */
export const touchHeld = { left: false, right: false, brake: false, drift: false };

const coarse = () => typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;

let touchMode = coarse();
const listeners = new Set<() => void>();

function apply() {
  if (typeof document !== 'undefined') document.body?.classList.toggle('kr-touch', touchMode);
  for (const fn of listeners) fn();
}

/** Whether the player is playing by touch. */
export const isTouchMode = () => touchMode;

/** Turn touch mode on or off; releasing every button when it goes off. */
export function setTouchMode(on: boolean) {
  if (on === touchMode) return;
  touchMode = on;
  if (!on) releaseAll();
  apply();
}

/** Subscribe to touch-mode changes (useSyncExternalStore). Returns the unsubscribe function. */
export function onTouchMode(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** Let go of every held button: the window lost focus, or the race ended under a finger. */
export function releaseAll() { touchHeld.left = false; touchHeld.right = false; touchHeld.brake = false; touchHeld.drift = false; }

/** Whether this device's main pointer is a finger (a phone or a tablet), as opposed to a mouse. */
export const isCoarsePointer = coarse;

/** Watch for the first touch and for the keyboard, and set the body class once at load. */
export function initTouch() {
  if (typeof window === 'undefined') return;
  window.addEventListener('touchstart', () => setTouchMode(true), { passive: true, capture: true });
  window.addEventListener('blur', releaseAll);
  apply();
}
