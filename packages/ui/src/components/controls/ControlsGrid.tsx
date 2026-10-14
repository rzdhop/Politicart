import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type ControlsGridProps = ComponentPropsWithRef<'div'>;

/**
 * The keyboard-legend grid: one line per control, in columns that reflow.
 *
 * `repeat(auto-fit, minmax(150px, 1fr))`, left-aligned, 14px muted text, capped
 * at 760px. Each child should be one short line pairing a `KeyCap` with what
 * the key does.
 *
 * **This component is required for `KeyCap` to be styled.** The keycap chip is
 * defined as a descendant rule (`.controls b`), so a `KeyCap` outside a
 * `ControlsGrid` renders as plain bold text. That is how the game defines it,
 * and the pairing is deliberate: keycaps only ever appear in a legend.
 *
 * ```tsx
 * <ControlsGrid>
 *   <div><KeyCap>↑</KeyCap> / <KeyCap>Z</KeyCap> accélérer</div>
 *   <div><KeyCap>Espace</KeyCap> dérapage (mini-turbo)</div>
 * </ControlsGrid>
 * ```
 */
export function ControlsGrid({ className, ...rest }: ControlsGridProps) {
  return <div className={cx('controls', className)} {...rest} />;
}
