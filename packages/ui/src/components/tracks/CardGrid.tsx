import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type CardGridProps = ComponentPropsWithRef<'div'>;

/**
 * A responsive grid of cards: as many 230px columns as fit.
 *
 * `repeat(auto-fit, minmax(230px, 1fr))` with a 12px gap, capped at 980px. The
 * game uses it for the three circuits, so they sit in one row on a desktop and
 * stack on a phone without a media query.
 *
 * ```tsx
 * <CardGrid>
 *   {tracks.map((t) => <TrackCard key={t.id} name={t.name} description={t.desc} />)}
 * </CardGrid>
 * ```
 */
export function CardGrid({ className, ...rest }: CardGridProps) {
  return <div className={cx('cards', className)} {...rest} />;
}
