// The themed sections of a circuit's one long lap (DEC-062).
//
// A race is one long lap (DEC-061). So that it still reads as a sequence of
// places rather than one long stretch, every circuit is cut into four
// sections, named after what lines them. A human driver entering a section
// is told its name and the split since the last one (events.js say: a
// toast), and the HUD's lap counter shows "SECTION 2/4". Sections are
// fractions of the lap, like features and box rows, so they follow the
// circuit at any scale.
//
// Pure apart from the kart fields it keeps (k.section, k.sectionAt) and the
// messages it queues: the simulation calls updateSection after
// updateProgress, the payload reads sectionOf.
import { say } from './events.js';
import { G } from './state.js';
import { fmtTime } from './util.js';

/** Each circuit's sections, by track id: where each starts (fraction of the lap) and its name. The first starts at the line. */
export const SECTIONS = Object.freeze({
  elysee: [[0, 'Cour d’honneur'], [0.25, 'Faubourg Saint-Honoré'], [0.5, 'Place Beauvau'], [0.75, 'Les jardins du Palais']],
  bourbon: [[0, 'Quai d’Orsay'], [0.25, 'Pont de la Concorde'], [0.5, 'Les bouquinistes'], [0.75, 'Pont Alexandre-III']],
  versailles: [[0, 'Cour de Marbre'], [0.25, 'Bassin de Latone'], [0.5, 'Le Labyrinthe'], [0.75, 'Le Grand Canal']],
  montmartre: [[0, 'Pigalle'], [0.25, 'La montée de la Butte'], [0.5, 'Place du Tertre'], [0.75, 'La descente des escaliers']],
  marseille: [[0, 'Le Vieux-Port'], [0.25, 'Le Panier'], [0.5, 'La Corniche'], [0.75, 'Retour sur les quais']],
});
/** The sections of a circuit with no list of its own. */
const FALLBACK = [[0, 'Départ'], [0.25, 'Premier secteur'], [0.5, 'Mi-parcours'], [0.75, 'Dernière ligne droite']];

/** The sections of track `t` (a TRACKS entry), as `[from, name]` pairs. */
export const sectionsOf = t => SECTIONS[t?.id] ?? FALLBACK;

/** The index of the section a lap fraction `f` (0..1) falls in, for `list`. */
export function sectionAt(f, list) {
  let i = 0; for (let j = 0; j < list.length; j++) if (f >= list[j][0]) i = j;
  return i;
}

/**
 * Kart k's section after its progress moved: a human entering the next
 * section of the lap it is on hears its name and the split since the
 * previous one. Only forward moves count (a kart backing over a border is
 * not told twice), and the start line is the finish's business.
 */
export function updateSection(k) {
  if (!G.N || k.finished) return;
  const list = sectionsOf(G.track), i = sectionAt(k.idx / G.N, list), was = k.section ?? 0;
  if (i === was) return;
  const forward = i === was + 1;
  k.section = i;
  if (!forward || G.replaying) return;
  const split = G.time - (k.sectionAt ?? 0); k.sectionAt = G.time;
  if (!k.isAI) say(k, (i === list.length - 1 ? 'DERNIER SECTEUR · ' : 'SECTEUR ' + (i + 1) + ' · ') + list[i][1].toUpperCase() + '  ' + fmtTime(split));
}

/** What the HUD shows of kart k's section: `{ i, n, name }`. */
export function sectionOf(k, track = G.track) {
  const list = sectionsOf(track), i = Math.min(list.length - 1, Math.max(0, k.section ?? 0));
  return { i, n: list.length, name: list[i][1] };
}
