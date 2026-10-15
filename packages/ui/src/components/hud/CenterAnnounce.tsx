import type { ComponentPropsWithRef, Ref } from 'react';

import { cx } from '../../cx';
import { useTextReadout, type TextReadoutHandle } from './handles';

export interface CenterAnnounceProps extends Omit<ComponentPropsWithRef<'div'>, 'ref'> {
  /** Imperative handle for the countdown, which ticks on a timer. */
  ref?: Ref<TextReadoutHandle>;
}

/**
 * The huge centred announcement: the countdown, and the word that starts the
 * race.
 *
 * `clamp(40px, 10vw, 120px)` in white display type, with a black shadow and a
 * gold outer glow, pinned across the upper third of the screen. This is the
 * loudest thing the system can say -- the game uses it for `3`, `2`, `1` and
 * `PARTEZ !` and nothing else.
 *
 * Leave it empty rather than unmounting it when there is nothing to announce;
 * it occupies no layout space of its own.
 *
 * ```tsx
 * const announce = useRef<TextReadoutHandle>(null);
 * <CenterAnnounce ref={announce} />
 * announce.current?.setText('PARTEZ !');
 * ```
 */
export function CenterAnnounce({ className, children, ref, ...rest }: CenterAnnounceProps) {
  const node = useTextReadout(ref);
  return (
    <div ref={node as Ref<HTMLDivElement>} className={cx('center', className)} {...rest}>
      {children}
    </div>
  );
}
