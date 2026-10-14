import type { ComponentPropsWithRef, ReactNode } from 'react';

import { Bar } from '../foundation/Bar';
import { cx } from '../../cx';

export interface StatBarProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** What the bar measures, shown above it in muted small caps. */
  label: ReactNode;
  /**
   * How full the bar is, as a fraction from 0 to 1, clamped.
   *
   * Normalising a raw stat into this range is the caller's job: the game maps
   * its 0.6-1.2 stat scale with `(stat - 0.6) / 0.6`, which is game balance,
   * not presentation, and does not belong in a component.
   */
  value: number;
}

/**
 * A labelled stat meter: muted caption over a gold bar.
 *
 * The caption carries the meaning, so the bar itself is left decorative rather
 * than announcing a second time.
 *
 * ```tsx
 * <StatBar label="Tenue de route" value={(stats.handling - 0.6) / 0.6} />
 * ```
 */
export function StatBar({ label, value, className, ...rest }: StatBarProps) {
  return (
    <div className={cx('stat', className)} {...rest}>
      <span>{label}</span>
      <Bar value={value} />
    </div>
  );
}
