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

// ---------- Routing by kart (DEC-014) ----------
// With several humans in one race, "tell the player" has to say which
// player. These emitters carry the kart instead of deciding locally:
//
//   say(k, text)            only k's driver sees it (dropped for AI karts)
//   tell(k, mine, others, to)
//                           k's driver sees `mine`; the drivers of the karts
//                           in `to` -- the ones the move actually hit --
//                           see `others`, a string or a function of the
//                           receiving kart. Nobody else sees anything: a
//                           driver only reads what concerns them.
//   hintFor(k, text)        the persistent hint, for k's driver only
//
// The consumer resolves them with resolveFor(event, kart): in solo play that
// kart is G.player, which reproduces the old `k === G.player` checks
// exactly; on the server it is each human in turn, one socket each.

/** Toast for kart k's driver only. */
export function say(k, text) {
  if (!k || k.isAI) return;
  queue.push({ type: 'toast', text, to: k });
}

/**
 * k's driver reads `mine`; the drivers of the karts in `to` (those the move
 * affected) read `others`. Without `to`, only k's driver is told.
 */
export function tell(k, mine, others, to) {
  say(k, mine);
  if (!others || !to) return;
  for (const o of to) {
    if (!o || o === k || o.isAI || o.finished) continue;     // a finished driver is out of the race: nothing concerns them any more
    queue.push({ type: 'toast', text: others, to: o });
  }
}

/** Persistent hint for kart k's driver only. */
export function hintFor(k, text) {
  if (!k || k.isAI) return;
  queue.push({ type: 'hint', text, to: k });
}

/**
 * The text event `e` shows to the driver of `kart`, or null if it is not
 * addressed to them. Unrouted events reach everyone.
 */
export function resolveFor(e, kart) {
  if (e.to && e.to !== kart) return null;
  if (e.except && e.except === kart) return null;
  return typeof e.text === 'function' ? e.text(kart) : e.text;
}
