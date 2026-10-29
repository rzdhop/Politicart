import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type PlayerGridProps = ComponentPropsWithRef<'ul'>;

/**
 * The players of a room, as a responsive grid of `PlayerCard`s: as many
 * 260px columns as fit, capped at 720px, one column on a phone. A list, so
 * its cards read as one.
 *
 * ```tsx
 * <PlayerGrid id="lobby-players">{players.map(p => <PlayerCard key={p.id} name={p.name} />)}</PlayerGrid>
 * ```
 */
export function PlayerGrid({ className, ...rest }: PlayerGridProps) {
  return <ul className={cx('player-grid', className)} {...rest} />;
}
