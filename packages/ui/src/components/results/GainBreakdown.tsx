import type { ComponentPropsWithRef, CSSProperties, Key, ReactNode } from 'react';

import { cx } from '../../cx';

/** One amount the race earned. */
export interface GainLine {
  /** React key; the index is used without one. */
  key?: Key;
  /** What it is: "XP", "politicoins", "bonus du jour". */
  label: ReactNode;
  /** How much, a whole number; it counts up from 0. */
  value: number;
  /** `xp` blue-white, `coin` gold, `bonus` green: the amount's colour. */
  tone?: 'xp' | 'coin' | 'bonus';
}

export interface GainBreakdownProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** The amounts, in order. */
  lines: readonly GainLine[];
  /** Short notes after the amounts: "Niveau 2 atteint !", "Débloqué : …". */
  notes?: readonly ReactNode[];
  /** How an amount is written. Defaults to the number as is. */
  format?: (value: number) => string;
}

/**
 * What a race earned the account, line by line: experience, politicoins,
 * the bonuses, each amount after a "+" in display type, then the notes (a
 * level reached, a candidate unlocked) in gold.
 *
 * Each amount counts up from 0 (fx.css: a registered integer property
 * animated into a CSS counter, the lines one after the other); the real
 * figure stays in the DOM for assistive technology and is what shows under
 * reduced motion or where the browser cannot animate it.
 *
 * ```tsx
 * <GainBreakdown id="r-xp" lines={[
 *   { key: 'xp', label: 'XP', value: 40, tone: 'xp' },
 *   { key: 'coins', label: 'politicoins', value: 60, tone: 'coin' },
 *   { key: 'daily', label: 'bonus du jour', value: 50, tone: 'bonus' },
 * ]} notes={['Niveau 2 atteint !']} />
 * ```
 */
export function GainBreakdown({ lines, notes, format = (v) => String(v), className, ...rest }: GainBreakdownProps) {
  return (
    <div className={cx('gain-breakdown', className)} {...rest}>
      <ul className="gain-lines">
        {lines.map((l, i) => (
          <li key={l.key ?? i} className={cx('gain-line', `tone-${l.tone ?? 'xp'}`)}>
            <span className="gain-sign">+</span>
            <span className="gain-value kr-count" style={{ '--to': Math.max(0, Math.round(l.value)), '--i': i } as CSSProperties}>
              <span className="gain-num">{format(l.value)}</span>
            </span>{' '}
            <span className="gain-label">{l.label}</span>
          </li>
        ))}
      </ul>
      {notes && notes.length ? (
        <ul className="gain-notes">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
