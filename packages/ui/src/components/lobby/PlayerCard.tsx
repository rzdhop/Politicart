import type { ComponentPropsWithRef, CSSProperties, ReactNode } from 'react';

import { cx } from '../../cx';

export interface PlayerCardProps extends Omit<ComponentPropsWithRef<'li'>, 'children'> {
  /** The player's name, in display type. */
  name: ReactNode;
  /** A muted tag after the name: "(invité·e)", "(hôte)", "(dieu)". */
  tag?: ReactNode;
  /** Their candidate's portrait, as an image URL; a placeholder from the game is fine. */
  portrait?: string;
  /** Their level, as shown: "niv. 3". */
  level?: ReactNode;
  /** Their team's name, on the team's colour. Omit (or null) for no team. */
  team?: ReactNode;
  /** The team's colour, any CSS colour: the card's left edge and the team pill. */
  teamColor?: string;
  /** The state line on the right: "prêt·e", "hôte", "…". */
  status?: ReactNode;
  /** Ready to race: the status pill turns green. */
  ready?: boolean;
  /** This is the viewer's own card: washed gold. */
  you?: boolean;
  /** Their kart, under the name: the candidate with its grade, the trail. */
  kart?: ReactNode;
  /** Buttons for whoever runs the room (move, exclude), at the card's foot. */
  actions?: ReactNode;
}

/**
 * One player in a team-race room: their candidate's portrait, their name
 * and level, their team as a coloured edge and pill, whether they are
 * ready, and their kart.
 *
 * A list item, so a `PlayerGrid` of them reads as a list of players. The
 * team colour comes in as a CSS colour (`teamColor`), so the library does
 * not need to know the teams. `you` washes the viewer's own card gold, as
 * the results table marks the player's row.
 *
 * ```tsx
 * <PlayerGrid id="lobby-players">
 *   <PlayerCard name="Alice" level="niv. 3" team="Bleu" teamColor="var(--blue)" status="hôte" portrait={thumbs.victor} you />
 *   <PlayerCard name="Bob" tag="(invité·e)" team="Rouge" teamColor="var(--red)" status="prêt·e" ready />
 * </PlayerGrid>
 * ```
 */
export function PlayerCard({
  name,
  tag,
  portrait,
  level,
  team,
  teamColor,
  status,
  ready = false,
  you = false,
  kart,
  actions,
  className,
  style,
  ...rest
}: PlayerCardProps) {
  const vars = teamColor ? ({ '--team': teamColor, ...style } as CSSProperties) : style;
  return (
    <li
      className={cx('player-card', ready && 'ready', you && 'you', className)}
      data-ready={ready ? 'true' : 'false'}
      style={vars}
      {...rest}
    >
      <span className="pc-portrait">{portrait ? <img alt="" src={portrait} /> : null}</span>
      <span className="pc-body">
        <span className="pc-name">
          {name}
          {tag === undefined ? null : <span className="pc-tag"> {tag}</span>}
        </span>
        <span className="pc-line">
          {team === undefined || team === null ? null : <span className="pc-team">{team}</span>}
          {level === undefined || level === null ? null : <span className="pc-level">{level}</span>}
        </span>
        {kart === undefined ? null : <span className="pc-kart">{kart}</span>}
      </span>
      {status === undefined ? null : <span className="pc-status">{status}</span>}
      {actions === undefined ? null : <span className="pc-actions">{actions}</span>}
    </li>
  );
}
