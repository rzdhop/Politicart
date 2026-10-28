import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

export interface RosterProps extends ComponentPropsWithRef<'div'> {
  /**
   * What sits under the tiles, across the full width of the grid: on wide
   * screens, the screen's button row and its keyboard legend, so the roster
   * column reads tiles, then actions, then the small print. Rendered in a
   * `.roster-foot` block that left-aligns a `Row` (rows centre by default),
   * sets loose text in the muted 13px of a legend line, and spaces its lines
   * 10px apart. Omit it and nothing is rendered.
   *
   * On a phone the same buttons usually belong at the bottom of the screen
   * instead, after the showcase; leave the footer out there rather than
   * styling it away. `null`, `false` and `undefined` all render nothing, so
   * `footer={wide && row}` is safe.
   */
  footer?: ReactNode;
}

/**
 * The four-across grid of character tiles.
 *
 * Fixed at four columns with a 10px gap, packed to the top of its cell. Four
 * columns is deliberate rather than auto-fitting: the roster's shape is part of
 * the screen's composition, and the tiles are square, so an eleven-character
 * cast reads as three full rows and a short one.
 *
 * The optional `footer` spans every column below the last row, a little
 * further from the tiles than they are from each other. A `KeyCap` needs a
 * `ControlsGrid` around it to be drawn as a chip, in the footer as anywhere.
 *
 * ```tsx
 * <Roster
 *   footer={
 *     <>
 *       <Row>
 *         <Button variant="ghost">Retour</Button>
 *         <Button>Choisir le circuit →</Button>
 *       </Row>
 *       <ControlsGrid>
 *         <div><KeyCap>←</KeyCap> <KeyCap>→</KeyCap> choisir · <KeyCap>Entrée</KeyCap> valider</div>
 *       </ControlsGrid>
 *     </>
 *   }
 * >
 *   {cast.map((c) => (
 *     <CharacterTile key={c.id} name={c.name} image={c.thumb} selected={c.id === chosen} />
 *   ))}
 * </Roster>
 * ```
 */
export function Roster({ footer, className, children, ...rest }: RosterProps) {
  return (
    <div className={cx('roster', className)} {...rest}>
      {children}
      {footer == null || footer === false ? null : <div className="roster-foot">{footer}</div>}
    </div>
  );
}
