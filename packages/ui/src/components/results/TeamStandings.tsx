import type { ComponentPropsWithRef, CSSProperties, Key, ReactNode } from 'react';

import { cx } from '../../cx';

/** One team's line. */
export interface TeamStanding {
  /** React key; the index is used without one. */
  key?: Key;
  /** The team's name. */
  name: ReactNode;
  /** Its points. */
  points: number;
  /** A muted line under the name: how many drivers. */
  detail?: ReactNode;
  /** Any CSS colour: the bar's and the swatch's. */
  color?: string;
  /** The viewer's team: washed gold. */
  you?: boolean;
}

export interface TeamStandingsProps extends Omit<ComponentPropsWithRef<'table'>, 'children'> {
  /** The teams, best first. */
  teams: readonly TeamStanding[];
  /** How a rank is written. Defaults to "1", "2"; the game passes "1er", "2e". */
  rankLabel?: (rank: number) => ReactNode;
  /** How the points are written. Defaults to "<n> pts". */
  pointsLabel?: (points: number) => ReactNode;
  /** Props for the `<tbody>`, for a consumer that must address it. */
  bodyProps?: ComponentPropsWithRef<'tbody'>;
}

/**
 * The teams' totals after a team race: rank, the team's colour swatch and
 * name over a bar as long as its share of the best score, and its points.
 * A table like `ResultsTable` (rank in gold display type, points in
 * monospace on the right), so the two read as one page.
 *
 * ```tsx
 * <TeamStandings bodyProps={{ id: 'r-teams' }} rankLabel={ordinal} teams={[
 *   { name: 'Équipe Bleu', points: 24, detail: '3 pilotes', color: 'var(--blue)', you: true },
 *   { name: 'Équipe Rouge', points: 18, detail: '3 pilotes', color: 'var(--red)' },
 * ]} />
 * ```
 */
export function TeamStandings({
  teams,
  rankLabel = (r) => String(r),
  pointsLabel = (p) => `${p} pts`,
  bodyProps,
  className,
  ...rest
}: TeamStandingsProps) {
  const best = Math.max(1, ...teams.map((t) => t.points));
  return (
    <table className={cx('results-table', 'team-standings', className)} {...rest}>
      <tbody {...bodyProps}>
        {teams.map((t, i) => (
          <tr key={t.key ?? i} className={t.you ? 'you' : undefined} style={t.color ? ({ '--team': t.color } as CSSProperties) : undefined}>
            <td className="r">{rankLabel(i + 1)}</td>
            <td>
              <span className="ts-name">
                <i className="ts-swatch" aria-hidden="true" />
                <b>{t.name}</b>
              </span>
              {t.detail === undefined ? null : <span className="ts-detail">{t.detail}</span>}
              <span className="ts-bar" aria-hidden="true">
                <i style={{ width: `${Math.round((Math.max(0, t.points) / best) * 100)}%` }} />
              </span>
            </td>
            <td className="t">{pointsLabel(t.points)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
