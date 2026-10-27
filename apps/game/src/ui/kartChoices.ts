// The kart options as the forms offer them: [value, French label] pairs, in
// display order. Shared by the player's Garage, the admin's per-character
// kart defaults in the workshop and the shop, so all name every option the
// same way. The values are kartstyle.js's vocabulary; the grades and prices
// of each option live in engine/catalog.js.

import { GRADE_LABEL } from '../engine/catalog.js';

export const WHEELS = [['classic', 'Classiques'], ['chrome', 'Chromées'], ['offroad', 'Tout-terrain'], ['gold', 'Dorées']] as const;
export const SPOILERS = [['none', 'Aucun'], ['standard', 'Standard'], ['wing', 'Grand aileron']] as const;
export const STICKERS = [['none', 'Aucun'], ['tricolore', 'Tricolore'], ['rosette', 'Cocarde'], ['etoile', 'Étoile'], ['marianne', 'Marianne']] as const;
export const PODS = [['on', 'Oui'], ['off', 'Non']] as const;
export const EXHAUSTS = [['stock', 'Série'], ['double', 'Double'], ['side', 'Latéral'], ['quad', 'Quadruple'], ['turbine', 'Turbine']] as const;
export const UNDERGLOWS = [['none', 'Aucun'], ['blue', 'Bleu'], ['red', 'Rouge'], ['gold', 'Or'], ['rainbow', 'Arc-en-ciel']] as const;
export const MASTS = [['none', 'Aucun'], ['antenna', 'Antenne'], ['tricolore', 'Tricolore'], ['europe', 'Europe'], ['pirate', 'Pirate']] as const;
export const NOSES = [['stock', 'Série'], ['splitter', 'Splitter'], ['wedge', 'Coin'], ['bull', 'Pare-buffle'], ['ram', 'Bélier']] as const;
export const SKINS = [['flat', 'Uni'], ['stripes', 'Bandes'], ['carbon', 'Carbone'], ['camo', 'Camouflage'], ['flames', 'Flammes']] as const;
export const TRAILS = [['none', 'Aucune'], ['ribbon', 'Ruban tricolore'], ['smoke', 'Fumée'], ['sparkles', 'Paillettes'], ['confetti', 'Confettis'], ['laser', 'Laser']] as const;

/**
 * The catalogue's part categories (engine/catalog.js PART_CATEGORIES) as the
 * shop and the Politibox name them: the category's French name and its
 * options' [value, label] pairs.
 */
export const PART_CHOICES = {
  wheels: { label: 'Roues', options: WHEELS },
  spoiler: { label: 'Aileron', options: SPOILERS },
  sticker: { label: 'Autocollant', options: STICKERS },
  exhaust: { label: 'Échappement', options: EXHAUSTS },
  underglow: { label: 'Néon', options: UNDERGLOWS },
  mast: { label: 'Mât', options: MASTS },
  nose: { label: 'Avant', options: NOSES },
  skin: { label: 'Motif', options: SKINS },
} as const satisfies Record<string, { label: string; options: readonly (readonly [string, string])[] }>;
export type PartCategory = keyof typeof PART_CHOICES;

const labelIn = (pairs: readonly (readonly [string, string])[], value: string) => pairs.find(([v]) => v === value)?.[1] ?? value;

/** The French label of option `value` of part `category`: 'Dorées'. */
export function optionLabel(category: string, value: string): string {
  const c = (PART_CHOICES as Record<string, { options: readonly (readonly [string, string])[] }>)[category];
  return c ? labelIn(c.options, value) : value;
}

/** A part as one phrase: 'Roues dorées', 'Grand aileron' (when the option already names its category). */
export function partPhrase(category: string, value: string): string {
  const cat = (PART_CHOICES as Record<string, { label: string }>)[category]?.label ?? category;
  const opt = optionLabel(category, value);
  return opt.toLowerCase().includes(cat.toLowerCase()) ? opt : cat + ' ' + opt.toLowerCase();
}

/** The French label of a trail: 'Laser'. */
export const trailLabel = (id: string) => labelIn(TRAILS, id);

/** The French name of each grade, as the badges and the shop print it (engine/catalog.js). */
export const GRADE_LABELS: Readonly<Record<'common' | 'rare' | 'mythic' | 'incredible', string>> = GRADE_LABEL;

/** ChoiceGroup options from [value, label] pairs, each chip's id being the prefix plus its value. */
export const chips = <V extends string>(idPrefix: string, pairs: readonly (readonly [V, string])[]) =>
  pairs.map(([value, label]) => ({ value, label, id: idPrefix + value }));

/** A race number as typed: null for empty, the number for 0-99, undefined for anything else (ignored). */
export function parseRaceNumber(raw: string): number | null | undefined {
  const s = raw.trim();
  if (s === '') return null;
  return /^\d{1,2}$/.test(s) ? Number(s) : undefined;
}
