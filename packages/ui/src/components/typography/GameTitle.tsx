import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type GameTitleProps = ComponentPropsWithRef<'h1'>;

/**
 * The game's wordmark: display type with the tricolore painted through it.
 *
 * An `h1` in Lilita One at `clamp(44px, 9vw, 104px)`, filled with a hard-edged
 * blue / off-white / red gradient clipped to the glyphs and dropped onto a
 * black shadow. There is exactly one of these per screen, and in practice only
 * the title screen has one.
 *
 * Because the fill is clipped text, the colour comes from the gradient and not
 * from `--fg`: setting `color` on this element has no effect. Keep the text
 * short -- the gradient's 32%/68% stops are tuned for a two-word mark, and a
 * long string pushes the white band off centre.
 *
 * ```tsx
 * <GameTitle>POLITIKAR</GameTitle>
 * ```
 */
export function GameTitle({ className, ...rest }: GameTitleProps) {
  return <h1 className={cx(className)} {...rest} />;
}
