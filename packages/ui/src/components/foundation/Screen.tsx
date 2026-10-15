import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type ScreenProps = ComponentPropsWithRef<'section'>;

/**
 * A full-screen overlay: one of the game's menus, stacked above the WebGL
 * canvas.
 *
 * Fixed to all four edges, centred as a vertical flex column with an 18px gap,
 * scrollable when its content is taller than the viewport, and padded to clear
 * the device safe areas on both sides. Only one screen is ever visible at a
 * time -- use the standard `hidden` attribute to hide the others, which the
 * stylesheet enforces with `display: none !important`.
 *
 * ```tsx
 * <Screen>
 *   <GameTitle>KART RÉPUBLIQUE</GameTitle>
 *   <Panel>
 *     <Row>
 *       <Button>Jouer</Button>
 *     </Row>
 *   </Panel>
 * </Screen>
 * ```
 */
export function Screen({ className, ...rest }: ScreenProps) {
  return <section className={cx('screen', className)} {...rest} />;
}
