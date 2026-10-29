// The decor builders' shared context (stage 0 split of track.js).
//
// Three things every builder reads or writes, kept here so the circuits'
// builders (engine/decor/<id>.js), the shared street props (street.js) and
// the track itself (track.js) can live in separate modules without a cycle:
//
// - still(): marks decor that never moves inside itself for the "légers"
//   fold (DEC-047); STILL is the list track.js folds and clears.
// - DS: the scale of the circuit being built; the themed decor is written in
//   scale-1 coordinates, so its clearance checks against the road multiply
//   by it (track.js sets it through setDecorScale).
// - nOf(): figure counts drop by half on 'low' detail (phones), big pieces stay.
import { getPoly, isClear } from '../state.js';

/** Decor marked still, in build order; track.js folds and empties it in place. */
export const STILL = [];
/** Mark decor that never moves inside itself (a group, or a mesh standing alone) for the "légers" fold; returns it. */
export const still = o => { STILL.push(o); return o; };

/** Scale of the circuit being built (a live binding: importers read the current value). */
export let DS = 1;
export function setDecorScale(s) { DS = s; }
/** Whether (x, z), in scale-1 coordinates, is at least `margin` metres (scale-1) clear of the road. */
export const clearAt = (x, z, margin) => isClear(x * DS, z * DS, margin * DS);

/** Figure counts drop by half on 'low' detail (phones), big pieces stay. */
export const nOf = n => (getPoly() === 'high' ? n : Math.ceil(n / 2));
