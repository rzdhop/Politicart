import {
  useImperativeHandle,
  useRef,
  type ComponentPropsWithRef,
  type ReactNode,
  type Ref,
} from 'react';

import { cx } from '../../cx';
import { replayClass, useFillWidth } from './handles';

export interface PowerGaugeHandle {
  /** Set how far the power has recharged, 0 to 1, bypassing React. */
  setCharge(charge: number): void;
  /** Toggle the ready state: green border and glow. */
  setReady(ready: boolean): void;
  /** Replace the power's name, which changes when the player changes character. */
  setName(name: string): void;
  /** Rewrite the key line under the bar, e.g. from "F · recharge" to "F · PRÊT !". */
  setKeyHint(text: string): void;
}

export interface PowerGaugeProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children' | 'ref'> {
  /** The power's name, in display type. */
  name: ReactNode;
  /** How far it has recharged, as a fraction from 0 to 1, clamped. */
  charge: number;
  /** The key that fires it, muted and uppercased under the bar. */
  keyHint?: ReactNode;
  /** Whether the power can be used now: green border and glow. */
  ready?: boolean;
  /**
   * Props for the name line, the fill `<i>` and the key line, for a consumer
   * that must address those parts -- the game gives them its contract ids
   * (DEC-012).
   */
  nameProps?: ComponentPropsWithRef<'div'>;
  fillProps?: ComponentPropsWithRef<'i'>;
  keyHintProps?: ComponentPropsWithRef<'div'>;
  /** Imperative handle for per-frame updates. */
  ref?: Ref<PowerGaugeHandle>;
}

/**
 * The special-power gauge, beside the item slot.
 *
 * A 150px panel holding the power's name, a cooldown bar and the key that
 * fires it. The bar is the shared `.bar` track recoloured green by the gauge's
 * own rule -- which is why this component must keep its `.power` wrapper, and
 * why the HUD stylesheet has to load after the foundation one.
 *
 * Ready state turns the border and glow green, and the glow breathes; the
 * moment it becomes ready through the handle the gauge pops once. It is the
 * counterpart to `ItemSlot`'s gold: green means a power, gold means an item.
 * Both motions are in `fx.css`, off under reduced motion.
 *
 * The cooldown advances every frame, so drive it through the handle.
 *
 * ```tsx
 * const power = useRef<PowerGaugeHandle>(null);
 * <PowerGauge ref={power} name="Grand débat" keyHint="F · recharge" charge={0} />
 * // in the frame loop:
 * power.current?.setCharge(1 - kart.powerCd / cooldown);
 * power.current?.setReady(kart.powerCd <= 0);
 * ```
 */
export function PowerGauge({
  name,
  charge,
  keyHint,
  ready = false,
  nameProps,
  fillProps,
  keyHintProps,
  className,
  ref,
  ...rest
}: PowerGaugeProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const nameNode = useRef<HTMLDivElement | null>(null);
  const keyNode = useRef<HTMLDivElement | null>(null);
  const { node, setFraction } = useFillWidth();

  useImperativeHandle(
    ref,
    () => ({
      setCharge: setFraction,
      setReady(next: boolean) {
        const element = root.current;
        if (element === null) return;
        const was = element.classList.contains('ready');
        element.classList.toggle('ready', next);
        if (next && !was) replayClass(element, 'charged');   // the moment it comes back: one pop, then the ready glow breathes
      },
      setName(next: string) {
        if (nameNode.current !== null && nameNode.current.textContent !== next) {
          nameNode.current.textContent = next;
        }
      },
      setKeyHint(next: string) {
        if (keyNode.current !== null && keyNode.current.textContent !== next) {
          keyNode.current.textContent = next;
        }
      },
    }),
    [setFraction],
  );

  const clamped = Math.min(1, Math.max(0, Number.isFinite(charge) ? charge : 0));

  return (
    <div ref={root} className={cx('power', ready && 'ready', className)} {...rest}>
      <div {...nameProps} ref={nameNode} className="pn">
        {name}
      </div>
      <div className="bar">
        <i {...fillProps} ref={node as Ref<HTMLElement>} style={{ width: `${Math.round(clamped * 100)}%` }} />
      </div>
      {keyHint === undefined ? null : <div {...keyHintProps} ref={keyNode} className="pk">{keyHint}</div>}
    </div>
  );
}
