import type { DropHistoryItem } from '@politikart/ui';

import { CHARACTERS } from '../engine/data.js';
import { dropGrade } from '../engine/boxgate.js';
import { GRADE_LABELS, partPhrase, trailLabel } from './kartChoices';
import type { Drop, Grade, RecentDrop } from './store';
import type { Character } from './types';

const CHARS = CHARACTERS as unknown as Character[];
const fr = (n: number) => n.toLocaleString('fr-FR');

/** A candidate's name by id, the id itself for one the roster no longer has. */
const charName = (id: string) => CHARS.find(c => c.id === id)?.name ?? id;

/** A part key as one phrase: 'wheels:gold' reads 'Roues dorées'. */
function partName(key: string): string {
  const i = key.indexOf(':');
  return i < 0 ? key : partPhrase(key.slice(0, i), key.slice(i + 1));
}

/** What the Politibox held, in one French line (the result the E2E reads: "Candidat : …", "Pièce : …", "Traînée : …", "50 politicoins"). */
export function dropText(drop: Drop): string {
  if (drop.kind === 'coins') return fr(drop.amount) + ' politicoins';
  if (drop.kind === 'char') return 'Candidat : ' + charName(drop.id);
  if (drop.kind === 'trail') return 'Traînée : ' + trailLabel(drop.id);
  return 'Pièce : ' + partName(drop.id);
}

/** A past drop's short label for a history chip: the name alone. */
export function dropLabel(d: RecentDrop): string {
  if (d.kind === 'coins') return fr(d.amount ?? 0) + ' politicoins';
  if (d.kind === 'char') return charName(d.id ?? '');
  if (d.kind === 'trail') return trailLabel(d.id ?? '');
  return partName(d.id ?? '');
}

/** The grade a past drop shows in: the stored one, or for coins one by the amount (as the opening does). */
export const recentGrade = (d: RecentDrop): Grade => (d.kind === 'coins' ? (dropGrade({ kind: 'coins', amount: d.amount ?? 0 }) as Grade) : d.grade ?? 'common');

/** The account's recent drops as the library's history chips, in the order the server keeps them (newest first). */
export function historyItems(recent: readonly RecentDrop[] | undefined): DropHistoryItem[] {
  return (recent ?? []).map((d, i) => ({ key: d.at + ':' + i, kind: d.kind, grade: recentGrade(d), label: dropLabel(d) }));
}

export { GRADE_LABELS };
