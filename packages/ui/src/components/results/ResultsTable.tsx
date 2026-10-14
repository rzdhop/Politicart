import type { ComponentPropsWithRef, Key, ReactNode } from 'react';

import { cx } from '../../cx';

export interface ResultsRow {
  /** React key. Falls back to the row's index when omitted. */
  id?: Key;
  /**
   * The finishing position as displayed, in gold display type. The game
   * formats its own ordinals -- "1er", "2e" -- so this takes a node rather
   * than a number.
   */
  rank: ReactNode;
  /** The racer's name, in bold. */
  name: ReactNode;
  /** A muted second line under the name, for their epithet. */
  detail?: ReactNode;
  /** Their time, right-aligned in monospace. The game shows "en course…" if unfinished. */
  time: ReactNode;
  /** Highlights the row in translucent gold. Use it for the player's own row. */
  highlighted?: boolean;
}

export interface ResultsTableProps extends Omit<ComponentPropsWithRef<'table'>, 'children'> {
  /** The finishing order, top to bottom. */
  rows: ResultsRow[];
  /**
   * Props for the `<tbody>`, for a consumer that needs to address the body
   * itself -- the game gives it the id its test suite drives (`#r-body`),
   * since the ids on the original markup are a contract the port keeps.
   */
  bodyProps?: ComponentPropsWithRef<'tbody'>;
  /**
   * Column headers, as `[rank, name, time]`. The rank column is normally left
   * blank. Omit this and no header row is rendered at all -- the wording is
   * the game's, not the system's, so there is no default.
   */
  columns?: [ReactNode, ReactNode, ReactNode];
}

/**
 * The results table: who finished where, in what time.
 *
 * Full width up to 560px, with hairline row separators. The rank is gold
 * display type in a narrow fixed column, the time is monospace and
 * right-aligned so the digits line up down the column, and the player's row is
 * washed in translucent gold.
 *
 * Scoped to `.results-table`, so unlike the game's original CSS it cannot
 * restyle other tables on the page.
 *
 * ```tsx
 * <ResultsTable
 *   columns={['', 'Candidat·e', 'Temps']}
 *   rows={[
 *     { id: 'victor', rank: '1er', name: 'Victor Lemarchand', detail: 'Le jeune président', time: '2:14.07', highlighted: true },
 *     { id: 'gege', rank: '2e', name: 'Gégé Marteau', detail: 'Le syndicaliste', time: '2:15.80' },
 *   ]}
 * />
 * ```
 */
export function ResultsTable({ rows, columns, bodyProps, className, ...rest }: ResultsTableProps) {
  return (
    <table className={cx('results-table', className)} {...rest}>
      {columns === undefined ? null : (
        <thead>
          <tr>
            <th>{columns[0]}</th>
            <th>{columns[1]}</th>
            <th style={{ textAlign: 'right' }}>{columns[2]}</th>
          </tr>
        </thead>
      )}
      <tbody {...bodyProps}>
        {rows.map((row, index) => (
          <tr key={row.id ?? index} className={row.highlighted ? 'you' : undefined}>
            <td className="r">{row.rank}</td>
            <td>
              <b>{row.name}</b>
              {row.detail === undefined ? null : (
                <>
                  <br />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{row.detail}</span>
                </>
              )}
            </td>
            <td className="t">{row.time}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
