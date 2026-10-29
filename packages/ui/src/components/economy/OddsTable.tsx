import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

/** One line of odds: what, and its share of every opening in [0, 1]; `sub` indents it under the line above (a coin tier under "Politicoins"). */
export interface OddsRow {
  /** A React key; the index is used without one. */
  key?: string | number;
  label: ReactNode;
  odds: number;
  sub?: boolean;
}

export interface OddsTableProps extends Omit<ComponentPropsWithRef<'table'>, 'children'> {
  /** The lines, in order. */
  rows: readonly OddsRow[];
  /** The two column headings; without them the table has no header row. */
  headers?: readonly [ReactNode, ReactNode];
  /** A caption above the table: what the box costs and holds, in a sentence or two. */
  caption?: ReactNode;
  /** How a share is printed. Defaults to a percentage with one decimal at most ("2 %", "0,5 %" follows the browser's locale). */
  format?: (odds: number) => string;
}

const percent = (odds: number) => `${(Math.round(odds * 1000) / 10).toLocaleString()} %`;

/**
 * The Politibox odds as a real table: each kind of prize and its share of
 * every opening, the coin tiers indented under their line, an optional
 * caption with the price and the rules. Row headers carry the labels, so
 * a screen reader reads "Candidat·e, 2 %".
 *
 * ```tsx
 * <OddsTable caption="Une urne dorée à 120 politicoins." rows={[
 *   { label: 'Candidat·e', odds: 0.02 },
 *   { label: 'Politicoins', odds: 0.94 },
 *   { label: '5 politicoins', odds: 0.4, sub: true },
 * ]} />
 * ```
 */
export function OddsTable({ rows, headers, caption, format = percent, className, ...rest }: OddsTableProps) {
  return (
    <table className={cx('odds-table', className)} {...rest}>
      {caption === undefined ? null : <caption>{caption}</caption>}
      {headers ? (
        <thead>
          <tr>
            <th scope="col">{headers[0]}</th>
            <th scope="col">{headers[1]}</th>
          </tr>
        </thead>
      ) : null}
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key ?? i} className={r.sub ? 'odds-sub' : undefined}>
            <th scope="row">{r.label}</th>
            <td>{format(r.odds)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
