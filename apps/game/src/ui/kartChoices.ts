// The kart options as the forms offer them: [value, French label] pairs, in
// display order. Shared by the player's Garage, the admin's per-character
// kart defaults in the workshop and the shop, so all name every option the
// same way. The values are kartstyle.js's vocabulary; the grades and prices
// of each option live in engine/catalog.js.

import { CHAR_GRADE, GRADE_LABEL, PART_CATEGORIES, PART_GRADE, TRAIL_GRADE } from '../engine/catalog.js';
import { builtinStyle } from '../engine/kartstyle.js';
import type { Character, KartStyle } from './types';

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

export type Grade = 'common' | 'rare' | 'mythic' | 'incredible';
const PART_GRADES = PART_GRADE as Readonly<Record<string, Readonly<Record<string, Grade>>>>;
const TRAIL_GRADES = TRAIL_GRADE as Readonly<Record<string, Grade>>;

/** A candidate's grade (engine/catalog.js CHAR_GRADE); common for anyone the catalogue does not know. */
export const charGrade = (id: string): Grade => (CHAR_GRADE as Readonly<Record<string, Grade>>)[id] ?? 'common';

/** A part option's grade, common for anything the catalogue does not price. */
export const partGrade = (category: string, value: string): Grade => PART_GRADES[category]?.[value] ?? 'common';

/** A trail's grade. */
export const trailGrade = (id: string): Grade => TRAIL_GRADES[id] ?? 'common';

/**
 * What the kart card lists for a kart driven by `char` in `style`: every
 * catalogue part that is not the built-in look (nor 'none', which is a part
 * taken off, not fitted), as `{ id, label, value, grade }` in catalogue
 * order, and the trail (`null` for none). The body and accent colours, the
 * number and the pods are not catalogue parts, so they are not listed.
 */
export function kartCardOf(char: Character, style: Partial<KartStyle>) {
  const base = builtinStyle(char) as unknown as Record<string, unknown>;
  const s = style as Record<string, unknown>;
  const parts = (PART_CATEGORIES as readonly string[]).flatMap(category => {
    const value = s[category];
    if (typeof value !== 'string' || value === 'none' || value === base[category]) return [];
    return [{ id: category, label: PART_CHOICES[category as PartCategory]?.label ?? category, value: optionLabel(category, value), grade: partGrade(category, value) }];
  });
  const trail = typeof style.trail === 'string' && style.trail !== 'none' ? { label: trailLabel(style.trail), grade: trailGrade(style.trail) } : null;
  return { parts, trail };
}

/** The French name of each grade, as the badges and the shop print it (engine/catalog.js). */
export const GRADE_LABELS: Readonly<Record<Grade, string>> = GRADE_LABEL;

/** ChoiceGroup options from [value, label] pairs, each chip's id being the prefix plus its value. */
export const chips = <V extends string>(idPrefix: string, pairs: readonly (readonly [V, string])[]) =>
  pairs.map(([value, label]) => ({ value, label, id: idPrefix + value }));

/** A race number as typed: null for empty, the number for 0-99, undefined for anything else (ignored). */
export function parseRaceNumber(raw: string): number | null | undefined {
  const s = raw.trim();
  if (s === '') return null;
  return /^\d{1,2}$/.test(s) ? Number(s) : undefined;
}
