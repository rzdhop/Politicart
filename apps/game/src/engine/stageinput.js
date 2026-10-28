// The podium's pointer input: the drag on the showcase band, the mouse for parallax.
//
// The select and Garage screens give their ShowcaseStage band the handlers
// stageDrag() returns; the stage facade (preview.js) reads what they leave
// here once a frame and turns the podium with it: inertia, the idle spin and
// the camera's parallax are the facade's. Kept apart from preview.js, which
// the UI tests stub out wholesale (its scene needs WebGL), so the screens can
// wire the band without reaching into the scene, and so this stays plain
// arithmetic on numbers, DOM-free but for the pointer events it is handed.
//
// The band is `touch-action: pan-y` (packages/ui ShowcaseStage): a vertical
// swipe on a phone scrolls the page and the browser cancels the pointer,
// which ends the drag; a horizontal one arrives here and turns the podium.
// The pointer is captured on the band, so a drag that leaves it keeps
// turning until the button or the finger comes up.

/**
 * What the facade consumes each frame: `dx`, the horizontal pixels dragged
 * since its last read; `dragging`; `touched`, a count bumped by every drag
 * event (the idle spin waits until it has stopped changing); and the
 * mouse's position over the window as fractions from its centre (mx, my in
 * [-0.5, 0.5]), for the parallax; and `lastInput`, when the player last
 * pressed a key or a button anywhere (performance.now()), so the portraits
 * wait for a quiet moment.
 */
export const stageInput = { dx: 0, dragging: false, touched: 0, mx: 0, my: 0, lastInput: -Infinity };

let drag = null;

function end(e) {
  if (!drag || (e && e.pointerId !== undefined && e.pointerId !== drag.id)) return;
  drag = null; stageInput.dragging = false; stageInput.touched++;
}

const HANDLERS = Object.freeze({
  onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return; // the main button, a finger or a pen
    drag = { id: e.pointerId, x: e.clientX };
    stageInput.dragging = true; stageInput.touched++;
    try { e.currentTarget && e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a synthetic event: no capture, the drag still works */ }
  },
  onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    stageInput.dx += e.clientX - drag.x; drag.x = e.clientX; stageInput.touched++;
  },
  onPointerUp: end,
  onPointerCancel: end,
  onLostPointerCapture: end,
});

/**
 * The pointer handlers for the band the podium is drawn into (React's
 * onPointer* props; plain functions of a PointerEvent): spread them on the
 * ShowcaseStage. The same object every call.
 */
export function stageDrag() { return HANDLERS; }

/** Take the pixels dragged since the last call. */
export function takeDrag() { const dx = stageInput.dx; stageInput.dx = 0; return dx; }

let watching = false;
/**
 * Follow the mouse over the window for the parallax (once; mice only, so a
 * phone's finger never moves the camera), and every key and button press
 * for `lastInput`.
 */
export function watchMouse() {
  if (watching || typeof window === 'undefined' || !window.addEventListener) return;
  watching = true;
  const pressed = () => { stageInput.lastInput = performance.now(); };
  for (const ev of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(ev, pressed, { passive: true, capture: true });
  window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    stageInput.mx = e.clientX / Math.max(1, window.innerWidth) - 0.5;
    stageInput.my = e.clientY / Math.max(1, window.innerHeight) - 0.5;
  }, { passive: true });
}
