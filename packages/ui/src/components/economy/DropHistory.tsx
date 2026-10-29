import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';
import type { Grade } from './GradeBadge';
import { type DropKind, KindGlyph } from './RevealCard';

/** One past drop: its kind, its grade and the short label the chip reads. */
export interface DropHistoryItem {
  /** A React key; the index is used without one. */
  key?: string | number;
  kind: DropKind;
  grade: Grade;
  /** What the chip reads: "Lucie Vasseur", "Roues dorées", "50 politicoins". */
  label: ReactNode;
}

export interface DropHistoryProps extends Omit<ComponentPropsWithRef<'div'>, 'children' | 'title'> {
  /** The drops, in the order to show them (the game passes the newest first), at most `max`. */
  drops: readonly DropHistoryItem[];
  /** A small heading above the chips ("Derniers tirages"). */
  title?: ReactNode;
  /** What to read when there is nothing yet; nothing when omitted. */
  emptyLabel?: ReactNode;
  /** How many chips at most. Defaults to 10, the ring the game's server keeps. */
  max?: number;
  /** Props for the list element, for a consumer that must address it (DEC-012). */
  listProps?: ComponentPropsWithRef<'ol'>;
}

/**
 * The last Politibox drops as a row of chips, each in its grade's colour
 * with the kind's glyph: what the account won lately, newest first.
 *
 * The chips carry `grade-<g>` for the colour alone -- fx.css keeps the
 * grade motion off them, as it does for the kart part dots, since ten
 * sweeping chips would be noise under a result card. The newest chips
 * slide in (fx.css), off under `prefers-reduced-motion`.
 *
 * ```tsx
 * <DropHistory title="Derniers tirages" drops={[
 *   { kind: 'coins', grade: 'common', label: '10 politicoins' },
 *   { kind: 'part', grade: 'mythic', label: 'Roues dorées' },
 * ]} />
 * ```
 */
export function DropHistory({ drops, title, emptyLabel, max = 10, listProps, className, ...rest }: DropHistoryProps) {
  const shown = drops.slice(0, max);
  return (
    <div className={cx('drop-history', className)} {...rest}>
      {title === undefined ? null : <p className="drop-history-title">{title}</p>}
      {shown.length ? (
        <ol className="drop-history-list" {...listProps}>
          {shown.map((d, i) => (
            <li key={d.key ?? i} className={cx('drop-chip', `grade-${d.grade}`)} data-kind={d.kind} data-grade={d.grade}>
              <KindGlyph kind={d.kind} />
              <span className="drop-chip-label">{d.label}</span>
            </li>
          ))}
        </ol>
      ) : emptyLabel === undefined ? null : (
        <p className="drop-history-empty">{emptyLabel}</p>
      )}
    </div>
  );
}
