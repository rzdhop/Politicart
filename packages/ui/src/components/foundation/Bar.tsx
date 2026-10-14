import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export interface BarProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /**
   * How full the bar is, as a fraction from 0 to 1. Values outside that range
   * are clamped, so a caller can hand over a raw ratio without guarding it.
   */
  value: number;
  /**
   * Accessible label. When set, the bar reports itself as a progressbar with
   * its current percentage; without it the bar stays decorative, which is the
   * right choice when an adjacent label already carries the meaning (as in
   * `StatBar`).
   */
  label?: string;
}

/**
 * The 8px track-and-fill meter used throughout the system.
 *
 * Gold fill on a translucent white track. Two component groups build on it:
 * `StatBar` on the character select screen, and `PowerGauge` in the HUD, which
 * recolours the fill green by nesting the bar inside `.power`.
 *
 * The fill is an inline width, which is deliberate: the HUD drives this value
 * every frame, and an inline style is the cheapest thing to write at 60fps.
 *
 * ```tsx
 * <Bar value={0.72} label="Vitesse" />
 * ```
 */
export function Bar({ value, label, className, ...rest }: BarProps) {
  const fraction = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const percent = Math.round(fraction * 100);
  return (
    <div
      className={cx('bar', className)}
      {...(label
        ? {
            role: 'progressbar',
            'aria-label': label,
            'aria-valuenow': percent,
            'aria-valuemin': 0,
            'aria-valuemax': 100,
          }
        : {})}
      {...rest}
    >
      <i style={{ width: `${percent}%` }} />
    </div>
  );
}
