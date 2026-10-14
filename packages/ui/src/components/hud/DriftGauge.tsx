import { useImperativeHandle, type ComponentPropsWithRef, type Ref } from 'react';

import { cx } from '../../cx';
import { useFillWidth } from './handles';

export interface DriftGaugeHandle {
  /** Set how charged the drift is, 0 to 1, bypassing React. */
  setValue(value: number): void;
  /**
   * Recolour the fill -- the game flashes it as a mini-turbo becomes
   * available. Any CSS colour; pass `null` to return to the default blue.
   */
  setColor(color: string | null): void;
}

export interface DriftGaugeProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children' | 'ref'> {
  /** How charged the drift is, as a fraction from 0 to 1, clamped. */
  value: number;
  /** Fill colour. Defaults to the stylesheet's blue (`#7cc4ff`). */
  color?: string;
  /**
   * Props for the fill `<i>` itself, for a consumer that must address the fill
   * apart from its track -- the game gives it its contract id (DEC-012).
   */
  fillProps?: ComponentPropsWithRef<'i'>;
  /** Imperative handle for per-frame updates. */
  ref?: Ref<DriftGaugeHandle>;
}

/**
 * The drift charge meter, under the speedometer.
 *
 * A 160px blue bar, right-aligned in its corner, that fills as the player
 * holds a drift and empties when they release it into a mini-turbo. Distinct
 * from `Bar`: it is its own 8px track so the HUD can keep its own colour and
 * sizing, and it carries no label -- the player learns it by feel.
 *
 * This fills continuously while drifting, so drive it through the handle.
 *
 * ```tsx
 * const drift = useRef<DriftGaugeHandle>(null);
 * <DriftGauge ref={drift} value={0} />
 * // in the frame loop:
 * drift.current?.setValue(kart.drift.charge / maxCharge);
 * ```
 */
export function DriftGauge({ value, color, fillProps, className, ref, ...rest }: DriftGaugeProps) {
  const { node, setFraction } = useFillWidth();

  useImperativeHandle(
    ref,
    () => ({
      setValue: setFraction,
      setColor(next: string | null) {
        const element = node.current;
        if (element !== null) {
          element.style.background = next ?? '';
        }
      },
    }),
    [node, setFraction],
  );

  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <div className={cx('drift', className)} {...rest}>
      <i
        {...fillProps}
        ref={node as Ref<HTMLElement>}
        style={{
          width: `${Math.round(clamped * 100)}%`,
          ...(color === undefined ? {} : { background: color }),
        }}
      />
    </div>
  );
}
