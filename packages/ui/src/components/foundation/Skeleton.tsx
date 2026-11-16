import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export interface SkeletonProps extends ComponentPropsWithRef<'div'> {
  /**
   * What is on its way, for assistive technology. When set, the placeholder
   * announces itself as a busy status under this label; without it the
   * placeholder is hidden from the accessibility tree, which is the right
   * choice when a neighbour already says the region is loading.
   */
  label?: string;
  /**
   * `block` (default) fills the box its caller sizes; `line` is one line of
   * text tall, for stacking in place of a paragraph; `circle` is round, for a
   * portrait or an icon.
   */
  shape?: 'block' | 'line' | 'circle';
}

/**
 * A placeholder in the shape of what is loading.
 *
 * A dim block crossed by the same light sweep the roster's pending tiles and
 * the circuits' pending thumbnails use (`kr-shimmer`), so every wait in the
 * game reads the same way. The sweep stops under `prefers-reduced-motion`;
 * the block stays.
 *
 * The caller gives it its size, through `className` or `style`, so the layout
 * is already the final one when the content arrives and nothing shifts.
 * Children are rendered inside, for a placeholder that keeps a real element's
 * footprint.
 *
 * ```tsx
 * <Skeleton label="Chargement des statistiques" style={{ height: 120 }} />
 * <Skeleton shape="line" style={{ width: '60%' }} />
 * ```
 */
export function Skeleton({ label, shape = 'block', className, children, ...rest }: SkeletonProps) {
  return (
    <div
      className={cx('skeleton', shape !== 'block' && shape, className)}
      {...(label ? { role: 'status', 'aria-busy': true, 'aria-label': label } : { 'aria-hidden': true })}
      {...rest}
    >
      {children}
    </div>
  );
}
