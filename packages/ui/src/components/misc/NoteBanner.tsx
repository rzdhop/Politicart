import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type NoteBannerProps = ComponentPropsWithRef<'div'>;

/**
 * A fixed note along the bottom of the viewport.
 *
 * 12px muted text, centred, clear of the device safe area, and
 * `pointer-events: none` so it never intercepts a click. The game uses it for
 * the standing caveat that this is a keyboard game and wants a computer.
 *
 * It is fixed rather than in flow, so it sits above whichever screen is
 * showing and does not need to be repeated per screen. Keep it to one short
 * line -- it has no background, so long text over a bright track becomes hard
 * to read.
 *
 * ```tsx
 * <NoteBanner>Jeu au clavier : ouvrez-le sur un ordinateur.</NoteBanner>
 * ```
 */
export function NoteBanner({ className, ...rest }: NoteBannerProps) {
  return <div className={cx('note', className)} {...rest} />;
}
