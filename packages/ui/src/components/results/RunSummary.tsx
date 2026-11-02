import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

/** One goal of the run as the results show it. */
export interface RunGoal {
  text: string;
  done: boolean;
}

export interface RunSummaryProps extends Omit<ComponentPropsWithRef<'section'>, 'children'> {
  /** The run's goals, reached or not. */
  goals: readonly RunGoal[];
  /** Politicoins picked on the road. */
  coins: number;
  /** Races in a row on the podium, this one included (0 or 1 shows nothing). */
  streak?: number;
  /** A line under the summary: what the run is worth, or an invitation to sign in to cash it. */
  footer?: ReactNode;
}

/**
 * What the run achieved, at a glance, on the results screen: the three goals
 * as stamps (a gold tick for each one reached, a count "2/3" in the
 * caption), the politicoins picked on the road, and the podium streak as a
 * flame when there is one. Pairs with `GainBreakdown`, which says what all
 * of it paid.
 *
 * Each stamp that was reached pops in one after the other (`kr-pop`, in
 * `fx.css`, off under reduced motion).
 *
 * ```tsx
 * <RunSummary goals={[{ text: 'Finir sur le podium', done: true }]} coins={12} streak={3} />
 * ```
 */
export function RunSummary({ goals, coins, streak = 0, footer, className, ...rest }: RunSummaryProps) {
  const done = goals.filter((g) => g.done).length;
  return (
    <section className={cx('run-summary', done === goals.length && goals.length > 0 && 'all', className)} {...rest}>
      <header className="rs-head">
        <span className="rs-title">Objectifs</span>
        <span className="rs-count">{done + '/' + goals.length}</span>
      </header>
      <ul className="rs-goals">
        {goals.map((g, i) => (
          <li key={i} className={cx('rs-goal', g.done && 'done', g.done && 'kr-pop')} style={{ animationDelay: i * 0.15 + 's' }}>
            <span className="rs-stamp" aria-hidden="true">{g.done ? '✓' : ''}</span>
            <span className="rs-text">{g.text}</span>
          </li>
        ))}
      </ul>
      <div className="rs-chips">
        <span className="rs-chip coins">
          <span className="rs-coin" aria-hidden="true" />
          {coins + ' politicoin' + (coins > 1 ? 's' : '') + ' ramassé' + (coins > 1 ? 's' : '')}
        </span>
        {streak >= 2 ? <span className="rs-chip streak">{'🔥 ' + streak + ' podiums d’affilée'}</span> : null}
      </div>
      {footer ? <p className="rs-foot">{footer}</p> : null}
    </section>
  );
}
