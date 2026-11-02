import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';
import type { Grade } from './GradeBadge';

export interface CollectionShare {
  /** The grade this share counts. */
  grade: Grade;
  /** How many of that grade are owned. */
  have: number;
  /** How many of that grade exist. */
  total: number;
  /** Its accessible name: « Mythique : 1 sur 6 ». */
  label?: string;
}

export interface CollectionMeterProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** What is counted: « Collection ». */
  label: ReactNode;
  /** How many are owned. */
  have: number;
  /** How many exist. */
  total: number;
  /** The count per grade, drawn as the bar's coloured segments, in this order. */
  shares?: CollectionShare[];
  /** The figure on the right; defaults to `have / total`. */
  figure?: ReactNode;
}

/**
 * How much of the catalogue a player owns: a label, a figure, and one bar
 * filled grade by grade in the grades' colours, so the rare finds read as
 * coloured progress and the empty part as what is left to unlock. A
 * meter with an accessible value.
 *
 * ```tsx
 * <CollectionMeter label="Collection" have={12} total={66}
 *   shares={[{ grade: 'rare', have: 8, total: 24 }, { grade: 'mythic', have: 3, total: 14 }]} />
 * ```
 */
export function CollectionMeter({ label, have, total, shares, figure, className, ...rest }: CollectionMeterProps) {
  const t = Math.max(1, total);
  const h = Math.max(0, Math.min(have, t));
  return (
    <div
      className={cx('collection-meter', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={h}
      aria-label={typeof label === 'string' ? label : undefined}
      {...rest}
    >
      <div className="cm-head">
        <span className="cm-label">{label}</span>
        <span className="cm-figure">{figure ?? `${h} / ${total}`}</span>
      </div>
      <div className="cm-bar">
        {shares && shares.length ? (
          shares.map((s) => (
            <span
              key={s.grade}
              className={cx('cm-seg', `cm-${s.grade}`)}
              data-grade={s.grade}
              title={s.label}
              style={{ width: `${(Math.max(0, Math.min(s.have, s.total)) / t) * 100}%` }}
            />
          ))
        ) : (
          <span className="cm-seg" style={{ width: `${(h / t) * 100}%` }} />
        )}
      </div>
    </div>
  );
}
