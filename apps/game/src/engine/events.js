// The engine's outbound event queue.
//
// The physics step, the items and the special powers all want to tell the
// player something ("DERNIER TOUR !", "PLOUF !", the hint under the item
// slot). Before stage 10 they wrote that text straight into the HUD from
// inside the physics loop, which is what tied the engine to the DOM. Now they
// enqueue it here and the UI layer drains the queue once per frame, after the
// physics step, and does the writing.
//
// Deliberately tiny: a FIFO of plain objects. Two event types exist today,
// `toast` (a transient banner) and `hint` (the persistent line under the item
// slot), both carrying `text`. Draining returns the events in emission order
// and empties the queue, so a frame can never replay what an earlier frame
// already showed. An empty toast text is passed through rather than filtered
// here: the consumer owns the rule that an empty toast is a no-op, exactly as
// the original toast() did.

let queue = [];

/** Push one event. `type` names the kind, `text` is what the UI shows. */
export function emit(type, text) {
  queue.push({ type, text });
}

/** Transient banner over the HUD. Same call shape as the old DOM writer. */
export function toast(text) {
  emit('toast', text);
}

/** Persistent hint under the item slot. Same call shape as the old DOM writer. */
export function setHint(text) {
  emit('hint', text);
}

/** Return every pending event in emission order and empty the queue. */
export function drain() {
  const out = queue;
  queue = [];
  return out;
}

/** How many events are waiting. Exposed for tests and diagnostics only. */
export function pending() {
  return queue.length;
}
