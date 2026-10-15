import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type StatGridProps = ComponentPropsWithRef<'div'>;

/**
 * The three-across row of stat bars inside a `Showcase`.
 *
 * `repeat(3, minmax(90px, 140px))` on wide screens, collapsing to three equal
 * columns below 760px. Three is the number the game shows -- speed,
 * acceleration, handling -- with weight left out of the UI.
 *
 * **Must be rendered inside a `Showcase`.** The grid comes from the descendant
 * rule `.showcase .stats`, so on its own this is an unstyled block and its
 * children fall into a single column.
 *
 * ```tsx
 * <StatGrid>
 *   <StatBar label="Vitesse" value={0.66} />
 *   <StatBar label="Accélération" value={0.66} />
 *   <StatBar label="Tenue de route" value={0.66} />
 * </StatGrid>
 * ```
 */
export function StatGrid({ className, ...rest }: StatGridProps) {
  return <div className={cx('stats', className)} {...rest} />;
}
