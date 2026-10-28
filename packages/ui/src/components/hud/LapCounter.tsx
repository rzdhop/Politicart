import type { ComponentPropsWithRef, Ref } from 'react';

import { cx } from '../../cx';
import { useTextReadout, type TextReadoutHandle } from './handles';

export interface LapCounterProps extends Omit<ComponentPropsWithRef<'div'>, 'ref'> {
  /** Imperative handle for per-frame updates. See `TextReadoutHandle`. */
  ref?: Ref<TextReadoutHandle>;
}

/**
 * The lap line, under the position.
 *
 * 22px display type with a hard shadow so it holds up over a bright track.
 * Takes its text as children rather than lap numbers, since the wording is the
 * game's rather than the system's -- Politikar writes `TOUR 2/3` during
 * a race and `ARRIVÉE` once the player has finished.
 *
 * ```tsx
 * <LapCounter>TOUR 2/3</LapCounter>
 * ```
 */
export function LapCounter({ className, children, ref, ...rest }: LapCounterProps) {
  const node = useTextReadout(ref);
  return (
    <div ref={node as Ref<HTMLDivElement>} className={cx('lap', className)} {...rest}>
      {children}
    </div>
  );
}
