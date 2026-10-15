import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type RosterProps = ComponentPropsWithRef<'div'>;

/**
 * The four-across grid of character tiles.
 *
 * Fixed at four columns with a 10px gap, packed to the top of its cell. Four
 * columns is deliberate rather than auto-fitting: the roster's shape is part of
 * the screen's composition, and the tiles are square, so an eleven-character
 * cast reads as three full rows and a short one.
 *
 * ```tsx
 * <Roster>
 *   {cast.map((c) => (
 *     <CharacterTile key={c.id} name={c.name} image={c.thumb} selected={c.id === chosen} />
 *   ))}
 * </Roster>
 * ```
 */
export function Roster({ className, ...rest }: RosterProps) {
  return <div className={cx('roster', className)} {...rest} />;
}
