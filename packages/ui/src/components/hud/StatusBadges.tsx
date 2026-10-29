import { useImperativeHandle, useRef, type ComponentPropsWithRef, type Ref } from 'react';

import { cx } from '../../cx';

/** One status on the player's kart. */
export interface StatusBadge {
  /** A stable key: the same status keeps its badge while it runs. */
  id: string;
  /** Its glyph; the game uses one emoji per status. */
  icon: string;
  /** Its name, short. */
  label: string;
  /** Seconds left, shown to the tenth. */
  time?: number;
  /** A count instead of a timer (boosts left). */
  count?: number;
  /** `good` for what helps (shield, immunity), `bad` for what hinders; colours the badge. */
  tone?: 'good' | 'bad';
}

export interface StatusBadgesHandle {
  /** Replace the list, bypassing React: badges are kept, added and removed by id, timers rewritten only when they change. */
  setStatuses(statuses: readonly StatusBadge[]): void;
}

export interface StatusBadgesProps extends Omit<ComponentPropsWithRef<'ul'>, 'children' | 'ref'> {
  /** The statuses to show, in order. */
  statuses?: readonly StatusBadge[];
  /** Imperative handle, driven from the game loop. */
  ref?: Ref<StatusBadgesHandle>;
}

/** "2,4 s", or "×3" for a count; empty when neither is given. */
export function badgeValue(status: Pick<StatusBadge, 'time' | 'count'>): string {
  if (status.count !== undefined) return `×${status.count}`;
  if (status.time === undefined || !Number.isFinite(status.time)) return '';
  return `${Math.max(0, status.time).toFixed(1).replace('.', ',')} s`;
}

function badgeElement(status: StatusBadge): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.status = status.id;
  li.className = cx('status-badge', `tone-${status.tone ?? 'bad'}`, 'kr-badge-in');
  for (const [cls, text] of [['sb-ico', status.icon], ['sb-label', status.label], ['sb-time', badgeValue(status)]] as const) {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    li.append(span);
  }
  return li;
}

/**
 * What is happening to the player's kart: one badge per status, its glyph,
 * its name and the time it has left.
 *
 * A column under the lap counter, top-left. Hindrances (slowed, confused,
 * capped at 110, planed, slipping) read red, help (a shield, immunity, a
 * loophole, a relance, the helicopter) green; a new badge slides in through
 * `fx.css`, off under reduced motion. Timers change every frame, so the game
 * drives the list through the handle, which keeps each badge by id and only
 * rewrites a timer when its tenth changes.
 *
 * ```tsx
 * const badges = useRef<StatusBadgesHandle>(null);
 * <StatusBadges ref={badges} />
 * badges.current?.setStatuses([{ id: 'slowed', icon: '🐌', label: 'Ralenti', time: 2.4 }]);
 * ```
 */
export function StatusBadges({ statuses = [], className, ref, ...rest }: StatusBadgesProps) {
  const root = useRef<HTMLUListElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setStatuses(next: readonly StatusBadge[]) {
        const list = root.current;
        if (list === null) return;
        const wanted = new Set(next.map((s) => s.id));
        for (const child of [...list.children] as HTMLElement[]) if (!wanted.has(child.dataset.status ?? '')) child.remove();
        next.forEach((status, i) => {
          let li = [...list.children].find((c) => (c as HTMLElement).dataset.status === status.id) as HTMLLIElement | undefined;
          if (li === undefined) li = badgeElement(status);
          if (list.children[i] !== li) list.insertBefore(li, list.children[i] ?? null);
          const time = li.querySelector('.sb-time');
          const value = badgeValue(status);
          if (time !== null && time.textContent !== value) time.textContent = value;
        });
      },
    }),
    [],
  );

  return (
    <ul ref={root} className={cx('status-badges', className)} aria-label="États du kart" {...rest}>
      {statuses.map((s) => (
        <li key={s.id} data-status={s.id} className={cx('status-badge', `tone-${s.tone ?? 'bad'}`)}>
          <span className="sb-ico">{s.icon}</span>
          <span className="sb-label">{s.label}</span>
          <span className="sb-time">{badgeValue(s)}</span>
        </li>
      ))}
    </ul>
  );
}
