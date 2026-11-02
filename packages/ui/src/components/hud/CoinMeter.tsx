import { useImperativeHandle, useRef, type ComponentPropsWithRef, type Ref } from 'react';

import { cx } from '../../cx';
import { replayClass } from './handles';

export interface CoinMeterHandle {
  /** Show `coins` carried out of `max` (bypassing React); a rise pops the meter once. */
  setCoins(coins: number, max?: number): void;
}

export interface CoinMeterProps extends Omit<ComponentPropsWithRef<'div'>, 'children' | 'ref'> {
  /** Coins carried. */
  coins?: number;
  /** The most a kart carries (the bar is full there). */
  max?: number;
  /** Imperative handle, driven from the game loop. */
  ref?: Ref<CoinMeterHandle>;
}

/**
 * The politicoins the kart carries: a gold coin, the count over the most it
 * can carry, and a thin bar that fills with them (each coin is a little top
 * speed in the game).
 *
 * The game writes it through the handle as coins are picked or dropped; a
 * rise pops the meter (`gain`, in `fx.css`, off under reduced motion), and
 * a full meter glows.
 *
 * ```tsx
 * const coins = useRef<CoinMeterHandle>(null);
 * <CoinMeter ref={coins} coins={0} max={10} />
 * coins.current?.setCoins(payload.coins, 10);
 * ```
 */
export function CoinMeter({ coins = 0, max = 10, className, ref, ...rest }: CoinMeterProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const count = useRef<HTMLSpanElement | null>(null);
  const fill = useRef<HTMLElement | null>(null);
  const last = useRef(coins);

  useImperativeHandle(
    ref,
    () => ({
      setCoins(next: number, nextMax = max) {
        const n = Math.max(0, Math.min(nextMax, Math.floor(next)));
        if (count.current !== null) count.current.textContent = n + '/' + nextMax;
        if (fill.current !== null) fill.current.style.width = (100 * n) / Math.max(1, nextMax) + '%';
        root.current?.classList.toggle('full', n >= nextMax);
        if (n > last.current) replayClass(root.current, 'gain');
        last.current = n;
      },
    }),
    [max],
  );

  const n = Math.max(0, Math.min(max, Math.floor(coins)));
  return (
    <div ref={root} className={cx('coin-meter', n >= max && 'full', className)} {...rest}>
      <span className="cm-coin" aria-hidden="true" />
      <span ref={count} className="cm-count">
        {n + '/' + max}
      </span>
      <span className="cm-bar">
        <i ref={fill} style={{ width: (100 * n) / Math.max(1, max) + '%' }} />
      </span>
    </div>
  );
}
