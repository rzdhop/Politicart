import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type HudLayerProps = ComponentPropsWithRef<'div'>;

/**
 * The in-race overlay: everything drawn on top of the track.
 *
 * Fixed to all four edges with `pointer-events: none`, so clicks fall through
 * to the game, and `font-variant-numeric: tabular-nums`, so a counting clock
 * and a changing speed do not jitter as digits change width.
 *
 * Holds `HudCorner`s and the full-width overlays (`CenterAnnounce`, `Toast`,
 * `WrongWay`). Hide it between races with the `hidden` attribute.
 *
 * Anything interactive placed inside has to re-enable `pointer-events`
 * itself -- but in this game nothing in the HUD is clickable, by design: the
 * race is played entirely from the keyboard.
 *
 * ```tsx
 * <HudLayer hidden={!racing}>
 *   <HudCorner corner="topLeft">
 *     <PositionReadout position={1} />
 *   </HudCorner>
 * </HudLayer>
 * ```
 */
export function HudLayer({ className, ...rest }: HudLayerProps) {
  return <div className={cx('hud', className)} {...rest} />;
}
