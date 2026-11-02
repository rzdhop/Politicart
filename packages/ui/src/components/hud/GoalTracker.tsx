import { useImperativeHandle, useRef, type ComponentPropsWithRef, type Ref } from 'react';

import { cx } from '../../cx';

/** One goal of the run: its sentence, how far it is, and whether it is reached. */
export interface Goal {
  text: string;
  have: number;
  target: number;
  done: boolean;
}

export interface GoalTrackerHandle {
  /** Show these goals (bypassing React); a goal that has just been reached flashes once. */
  setGoals(goals: readonly Goal[]): void;
}

export interface GoalTrackerProps extends Omit<ComponentPropsWithRef<'ul'>, 'children' | 'ref'> {
  /** The goals at first paint. */
  goals?: readonly Goal[];
  /** The caption over the list. Defaults to "Goals"; the game passes "Objectifs". */
  label?: string;
  /** Imperative handle, driven from the game loop. */
  ref?: Ref<GoalTrackerHandle>;
}

/** The progress text of a goal: a tick once reached, else have/target (a single-step goal shows nothing until it is judged). */
const progress = (g: Goal) => (g.done ? '✓' : g.target > 1 ? g.have + '/' + g.target : '');

/**
 * The run's goals, three short lines in the HUD's corner: a box that ticks,
 * the sentence, and how far along it is ("1/3"). A goal reached turns gold
 * and flashes once (`just`, in `fx.css`, off under reduced motion).
 *
 * The game rewrites it through the handle whenever a count moves; rows are
 * patched in place, never re-rendered by React mid-race.
 *
 * ```tsx
 * const goals = useRef<GoalTrackerHandle>(null);
 * <GoalTracker ref={goals} label="Objectifs" />
 * goals.current?.setGoals(payload.goals);
 * ```
 */
export function GoalTracker({ goals = [], label = 'Goals', className, ref, ...rest }: GoalTrackerProps) {
  const root = useRef<HTMLUListElement | null>(null);
  const shown = useRef<string>(JSON.stringify(goals));

  useImperativeHandle(
    ref,
    () => ({
      setGoals(next: readonly Goal[]) {
        const el = root.current; if (el === null) return;
        const key = JSON.stringify(next); if (key === shown.current) return;
        const before = JSON.parse(shown.current) as Goal[];
        shown.current = key;
        const rows = el.querySelectorAll<HTMLLIElement>('li.goal');
        next.forEach((g, i) => {
          let li = rows[i];
          if (li === undefined) { li = document.createElement('li'); li.className = 'goal'; li.innerHTML = '<span class="gl-box"></span><span class="gl-text"></span><span class="gl-prog"></span>'; el.appendChild(li); }
          (li.querySelector('.gl-text') as HTMLElement).textContent = g.text;
          (li.querySelector('.gl-prog') as HTMLElement).textContent = progress(g);
          li.classList.toggle('done', g.done);
          if (g.done && before[i] !== undefined && !before[i]?.done) { li.classList.remove('just'); void li.offsetWidth; li.classList.add('just'); }
        });
        for (let i = next.length; i < rows.length; i++) rows[i]?.remove();
        el.hidden = next.length === 0;
      },
    }),
    [],
  );

  return (
    <ul ref={root} className={cx('goal-tracker', className)} hidden={goals.length === 0} aria-label={label} data-label={label} {...rest}>
      {goals.map((g, i) => (
        <li key={i} className={cx('goal', g.done && 'done')}>
          <span className="gl-box" />
          <span className="gl-text">{g.text}</span>
          <span className="gl-prog">{progress(g)}</span>
        </li>
      ))}
    </ul>
  );
}
