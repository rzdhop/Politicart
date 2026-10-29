import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

/** The trails the game draws behind a kart (engine/trail.js), and none. */
export type TrailKind = 'none' | 'ribbon' | 'smoke' | 'sparkles' | 'confetti' | 'laser';

export interface TrailStripProps extends Omit<ComponentPropsWithRef<'span'>, 'children'> {
  /** Which trail to preview. */
  trail: TrailKind;
  /** The accessible name of the picture: the trail's name. Without one it is decorative. */
  label?: string;
}

/**
 * A preview of a kart's trail, in CSS alone: a little kart at the strip's
 * right end and its trail streaming out behind it -- the tricolour ribbon,
 * grey smoke puffs, gold sparkles, confetti, a laser line. The stream
 * scrolls through `fx.css` and stands still under reduced motion; it is a
 * background layer, so nothing moves the layout.
 *
 * The shop passes it as a trail's `ShopCard` picture.
 *
 * ```tsx
 * <ShopCard title="Confettis" grade="mythic" image={<TrailStrip trail="confetti" label="Confettis" />} ... />
 * ```
 */
export function TrailStrip({ trail, label, className, ...rest }: TrailStripProps) {
  return (
    <span
      className={cx('trail-strip', className)}
      data-trail={trail}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      <span className="ts-stream" />
      <span className="ts-kart" />
    </span>
  );
}
