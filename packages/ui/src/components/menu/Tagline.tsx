import { type ComponentPropsWithRef, useEffect, useState } from 'react';

import { cx } from '../../cx';

export interface TaglineProps extends Omit<ComponentPropsWithRef<'p'>, 'children'> {
  /** The lines, shown one at a time in this order, then from the top again. */
  lines: readonly string[];
  /** How long each line stays, ms. Defaults to 4200. */
  interval?: number;
  /** Hold the current line (the screen is hidden, say). */
  paused?: boolean;
}

const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A short line under a title that changes every few seconds: the game's
 * running joke, one quip at a time.
 *
 * Italic body type in the muted lavender, a gold rule each side. Each new
 * line drops in with a little bounce (fx.css). The paragraph is
 * `aria-live="off"`: the quips are flavour, a screen reader is not
 * interrupted by them. A player who asked for less motion
 * (`prefers-reduced-motion`) gets the first line alone, and so does a
 * single-line list.
 *
 * ```tsx
 * <Tagline lines={['Trois tours, cinq adversaires, aucune cohabitation.', 'Le premier sur la ligne forme le gouvernement.']} />
 * ```
 */
export function Tagline({ lines, interval = 4200, paused = false, className, ...rest }: TaglineProps) {
  const [i, setI] = useState(0);
  const n = lines.length;
  useEffect(() => {
    if (paused || n < 2 || calm()) return undefined;
    const id = setInterval(() => setI((k) => (k + 1) % n), interval);
    return () => clearInterval(id);
  }, [paused, n, interval]);
  if (!n) return null;
  return (
    <p className={cx('tagline', className)} aria-live="off" {...rest}>
      <span key={i % n} className="tagline-line">{lines[i % n]}</span>
    </p>
  );
}
