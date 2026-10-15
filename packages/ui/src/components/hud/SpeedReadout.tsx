import {
  useImperativeHandle,
  useRef,
  type ComponentPropsWithRef,
  type ReactNode,
  type Ref,
} from 'react';

import { cx } from '../../cx';

export interface SpeedReadoutHandle {
  /** Set the speed, bypassing React. */
  setValue(value: number): void;
}

export interface SpeedReadoutProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children' | 'ref'> {
  /** The speed to show. Rounded for display; the unit is separate. */
  value: number;
  /** The unit, set small and muted beside the number. Defaults to `km/h`. */
  unit?: ReactNode;
  /**
   * Props for the number `<span>` itself, for a consumer that must address it
   * apart from the unit -- the game gives it its contract id (DEC-012).
   */
  valueProps?: ComponentPropsWithRef<'span'>;
  /** Imperative handle for per-frame updates. */
  ref?: Ref<SpeedReadoutHandle>;
}

/**
 * The speedometer, bottom-right.
 *
 * 46px display type with the unit at 16px in `--muted`, so the number carries
 * and the unit stays out of the way. Only the number changes, which is why the
 * handle sets it alone and leaves the unit untouched.
 *
 * ```tsx
 * const speed = useRef<SpeedReadoutHandle>(null);
 * <SpeedReadout ref={speed} value={0} />
 * // in the frame loop:
 * speed.current?.setValue(kart.speed * 3.6);
 * ```
 */
export function SpeedReadout({
  value,
  unit = 'km/h',
  valueProps,
  className,
  ref,
  ...rest
}: SpeedReadoutProps) {
  const number = useRef<HTMLSpanElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setValue(next: number) {
        const text = String(Math.round(Number.isFinite(next) ? next : 0));
        if (number.current !== null && number.current.textContent !== text) {
          number.current.textContent = text;
        }
      },
    }),
    [],
  );

  return (
    <div className={cx('speed', className)} {...rest}>
      <span {...valueProps} ref={number}>{Math.round(Number.isFinite(value) ? value : 0)}</span>{' '}
      <small>{unit}</small>
    </div>
  );
}
