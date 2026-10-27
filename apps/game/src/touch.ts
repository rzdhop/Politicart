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

/** The elements a finger may still select text in or open a menu on: the fields the player types into. */
const EDITABLE = 'input, textarea, [contenteditable]:not([contenteditable="false"])';

const editable = (target: EventTarget | null) => {
  const el = target as Element | null;
  return !!el && typeof el.closest === 'function' && !!el.closest(EDITABLE);
};

/**
 * Refuse the context menu a long press raises on a phone (and a right click
 * on a computer) everywhere but in an input, a textarea or an editable
 * element, so a thumb resting on a button is a tap and nothing else. In
 * touch mode the same goes for the selection older WebKit starts before the
 * stylesheet's user-select:none is consulted. Returns the uninstall function.
 */
export function installNoContextMenu(doc: Document = document) {
  const onMenu = (e: Event) => { if (!editable(e.target)) e.preventDefault(); };
  const onSelect = (e: Event) => { if (touchMode && !editable(e.target)) e.preventDefault(); };
  doc.addEventListener('contextmenu', onMenu);
  doc.addEventListener('selectstart', onSelect);
  return () => { doc.removeEventListener('contextmenu', onMenu); doc.removeEventListener('selectstart', onSelect); };
}
