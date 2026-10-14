import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type LiveryThumbProps = ComponentPropsWithRef<'img'>;

/**
 * A 64x40 preview of an uploaded kart livery.
 *
 * Covers its box with a hairline border over a dark backing, so a transparent
 * or very light image still reads as a thumbnail.
 *
 * **Must be inside an `AdminGrid`.** `alt` defaults to empty, which is right
 * for a preview sitting next to its own labelled file input; pass a real
 * description if it appears on its own.
 *
 * ```tsx
 * <LiveryThumb src={livery} alt="" />
 * ```
 */
export function LiveryThumb({ className, alt = '', ...rest }: LiveryThumbProps) {
  return <img className={cx('livery', className)} alt={alt} {...rest} />;
}
