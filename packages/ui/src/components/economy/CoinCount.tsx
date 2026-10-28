import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

export interface CoinCountProps extends Omit<ComponentPropsWithRef<'span'>, 'children'> {
  /** How many politicoins. */
  value: number;
  /** An optional unit or caption after the number, in muted body type. */
  label?: ReactNode;
  /** `sm` beside a price, `md` (default) in a title bar, `lg` on a result. */
  size?: 'sm' | 'md' | 'lg';
  /**
   * How the number is printed. Defaults to `value.toLocaleString()`, which
   * follows the browser's locale; the game passes an `fr-FR` formatter so
   * 12 000 reads as it should in French. Pure: it must not depend on render
   * order.
   */
  format?: (value: number) => string;
  /**
   * Props for the number element, for a consumer that must address it -- the
   * game gives it the id its test suite drives (`#coins`), as DEC-012 asks.
   */
  valueProps?: ComponentPropsWithRef<'span'>;
}

/**
 * The politicoin: a gold disc with a darker rim and a "P" struck in it.
 * Decorative; the number beside it carries the meaning.
 */
function CoinGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="11" fill="#a8801c" />
      <circle cx="12" cy="12" r="9" fill="var(--coin, #f2c14e)" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#a8801c" strokeWidth="1" />
      <path
        d="M9.2 7.2h3.6c2 0 3.3 1.1 3.3 2.9s-1.3 2.9-3.3 2.9h-1.6v3.8H9.2zm2 1.7v2.4h1.5c.9 0 1.4-.45 1.4-1.2s-.5-1.2-1.4-1.2z"
        fill="#5a4210"
      />
    </svg>
  );
}

/**
 * A politicoin total: the coin glyph and the number, in gold display type.
 *
 * Tabular digits, so a count that ticks up in a title bar does not jitter.
 * The number is its own element (see `valueProps`), which is also what a
 * consumer should update when the total changes.
 *
 * ```tsx
 * <CoinCount value={1250} label="politicoins" valueProps={{ id: 'coins' }} />
 * <CoinCount value={800} size="sm" format={(n) => n.toLocaleString('fr-FR')} />
 * ```
 */
export function CoinCount({
  value,
  label,
  size = 'md',
  format = (n) => n.toLocaleString(),
  valueProps,
  className,
  ...rest
}: CoinCountProps) {
  return (
    <span className={cx('coin-count', size !== 'md' && `coin-count-${size}`, className)} {...rest}>
      <CoinGlyph />
      <span className="coin-value" {...valueProps}>
        {format(value)}
      </span>
      {label === undefined ? null : <span className="coin-label">{label}</span>}
    </span>
  );
}
