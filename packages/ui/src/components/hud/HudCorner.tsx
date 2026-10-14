import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

/** Which corner of the HUD this group pins itself to. */
export type HudCornerPosition = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export interface HudCornerProps extends ComponentPropsWithRef<'div'> {
  /** The corner to pin to. */
  corner: HudCornerPosition;
}

const CLASS: Record<HudCornerPosition, string> = {
  topLeft: 'hud-tl',
  topRight: 'hud-tr',
  bottomLeft: 'hud-bl',
  bottomRight: 'hud-br',
};

/**
 * One of the HUD's four corner groups.
 *
 * Each corner is absolutely positioned, inset from the viewport edge and
 * padded past the device safe areas, and stacks its children in the direction
 * that reads outward from that corner: the left corners stack as columns, the
 * top-right aligns to its right edge, the bottom-left lays its children out as
 * a row aligned to their bottoms.
 *
 * The game's assignment, worth following so a player's eye learns one layout:
 * top-left position, lap and clock; top-right the minimap; bottom-left the
 * item slot, power gauge and hint; bottom-right speed and the drift gauge.
 *
 * ```tsx
 * <HudCorner corner="bottomRight">
 *   <SpeedReadout value={142} />
 *   <DriftGauge value={0.4} />
 * </HudCorner>
 * ```
 */
export function HudCorner({ corner, className, ...rest }: HudCornerProps) {
  return <div className={cx(CLASS[corner], className)} {...rest} />;
}
