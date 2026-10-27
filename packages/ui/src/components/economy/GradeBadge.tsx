import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

/**
 * The four grades of the politicoins economy, in ascending order. The ids are
 * the catalogue's; the colours are the `--grade-<g>` tokens.
 */
export type Grade = 'common' | 'rare' | 'mythic' | 'incredible';

/** The grades in ascending order, for a consumer that iterates them. */
export const GRADES: readonly Grade[] = ['common', 'rare', 'mythic', 'incredible'];

export interface GradeBadgeProps extends Omit<ComponentPropsWithRef<'span'>, 'children'> {
  /** Which grade: picks the colour and, from `rare` up, the motion. */
  grade: Grade;
  /**
   * The badge's text. Defaults to the grade id capitalised ("Rare"); the game
   * passes its own French label. Used as the accessible name too, so pass a
   * string or something that reads as one.
   */
  label?: ReactNode;
  /** `sm` for a badge inside a chip or a tile; `md` (default) everywhere else. */
  size?: 'sm' | 'md';
}

function capitalise(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * A pill naming an item's grade, in that grade's colour.
 *
 * Common is a quiet muted pill; rare carries a light sweep, mythic a
 * breathing glow over sparkles, incredible a rotating rainbow ring. The
 * motion is `fx.css`'s business and switches off under
 * `prefers-reduced-motion`; this component only sets the `grade-<g>` hook.
 *
 * Carries `data-grade` so a consumer or a test can read the grade back
 * without parsing classes, and `aria-label` from the label so the colour is
 * never the only carrier of the information.
 *
 * ```tsx
 * <GradeBadge grade="mythic" label="Mythique" />
 * <GradeBadge grade="rare" label="Rare" size="sm" />
 * ```
 */
export function GradeBadge({ grade, label, size = 'md', className, ...rest }: GradeBadgeProps) {
  const text = label ?? capitalise(grade);
  return (
    <span
      className={cx('grade', `grade-${grade}`, size === 'sm' && 'grade-sm', className)}
      data-grade={grade}
      aria-label={typeof text === 'string' ? text : undefined}
      {...rest}
    >
      {text}
    </span>
  );
}
