import type { ComponentPropsWithRef, Ref } from 'react';

import { cx } from '../../cx';
import { useTextReadout, type TextReadoutHandle } from './handles';

export interface RaceTimerProps extends Omit<ComponentPropsWithRef<'div'>, 'ref'> {
  /** Imperative handle for per-frame updates. See `TextReadoutHandle`. */
  ref?: Ref<TextReadoutHandle>;
}

/**
 * The race clock: monospace, muted, deliberately quiet.
 *
 * 15px in `--font-mono` so the digits hold their columns, and in `--muted` so
 * a number that changes every frame does not pull the eye away from the track.
 * The surrounding `HudLayer` sets tabular numerals too.
 *
 * Formatting is the caller's -- the game renders `0:00.00` and appends its best
 * lap. This changes every single frame, so drive it through the handle rather
 * than a prop.
 *
 * ```tsx
 * const clock = useRef<TextReadoutHandle>(null);
 * <RaceTimer ref={clock}>0:00.00</RaceTimer>
 * // in the frame loop:
 * clock.current?.setText(formatTime(elapsed));
 * ```
 */
export function RaceTimer({ className, children, ref, ...rest }: RaceTimerProps) {
  const node = useTextReadout(ref);
  return (
    <div ref={node as Ref<HTMLDivElement>} className={cx('timer', className)} {...rest}>
      {children}
    </div>
  );
}
