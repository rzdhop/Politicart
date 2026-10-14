import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type TricoloreProps = Omit<ComponentPropsWithRef<'div'>, 'children'>;

/**
 * The flag, as a rule: three equal stripes in a 6px rounded bar.
 *
 * Blue `#2f55c7`, off-white `#fffaf0`, red `#e63946` -- a slightly softened
 * tricolore that belongs to the brand layer, not the token palette, which is
 * why these are literal values rather than `--blue` and `--red`. Width is
 * `min(420px, 80vw)`.
 *
 * It takes no children: the three stripes are its content.
 *
 * ```tsx
 * <Tricolore />
 * ```
 */
export function Tricolore({ className, ...rest }: TricoloreProps) {
  return (
    <div className={cx('tricolore', className)} aria-hidden="true" {...rest}>
      <i />
      <i />
      <i />
    </div>
  );
}
