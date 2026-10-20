// The kart options as the forms offer them: [value, French label] pairs, in
// display order. Shared by the player's Garage and the admin's per-character
// kart defaults in the workshop, so both name every option the same way. The
// values are kartstyle.js's vocabulary.

export const WHEELS = [['classic', 'Classiques'], ['chrome', 'Chromées'], ['offroad', 'Tout-terrain'], ['gold', 'Dorées']] as const;
export const SPOILERS = [['none', 'Aucun'], ['standard', 'Standard'], ['wing', 'Grand aileron']] as const;
export const STICKERS = [['none', 'Aucun'], ['tricolore', 'Tricolore'], ['rosette', 'Cocarde'], ['etoile', 'Étoile'], ['marianne', 'Marianne']] as const;
export const PODS = [['on', 'Oui'], ['off', 'Non']] as const;

/** ChoiceGroup options from [value, label] pairs, each chip's id being the prefix plus its value. */
export const chips = <V extends string>(idPrefix: string, pairs: readonly (readonly [V, string])[]) =>
  pairs.map(([value, label]) => ({ value, label, id: idPrefix + value }));

/** A race number as typed: null for empty, the number for 0-99, undefined for anything else (ignored). */
export function parseRaceNumber(raw: string): number | null | undefined {
  const s = raw.trim();
  if (s === '') return null;
  return /^\d{1,2}$/.test(s) ? Number(s) : undefined;
}
