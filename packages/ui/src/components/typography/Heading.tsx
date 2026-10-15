import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

/**
 * How large the heading renders.
 *
 * - `panel` -- the stylesheet's own size, for a heading inside a `Panel`
 *   (the pause and results screens).
 * - `screen` -- `clamp(24px, 4.5vw, 40px)`, for a heading that titles a whole
 *   screen (character select, the workshop).
 * - `screenWide` -- `clamp(26px, 5vw, 44px)`, a touch larger, used by the
 *   track select screen.
 *
 * The two screen sizes are inline clamps rather than classes because that is
 * exactly how the game declares them; no new CSS was invented for this system.
 */
export type HeadingSize = 'panel' | 'screen' | 'screenWide';

export interface HeadingProps extends ComponentPropsWithRef<'h2'> {
  /** Heading rank. Renders `h2` (default) or `h3`; the look is identical. */
  level?: 2 | 3;
  /** Which of the three sizes the game uses. Defaults to `panel`. */
  size?: HeadingSize;
}

const SIZES: Record<HeadingSize, string | undefined> = {
  panel: undefined,
  screen: 'clamp(24px,4.5vw,40px)',
  screenWide: 'clamp(26px,5vw,44px)',
};

/**
 * A section heading in the display face.
 *
 * Lilita One at weight 400, tight leading, balanced wrapping, no margin -- the
 * surrounding `Screen` or `Panel` owns the spacing.
 *
 * ```tsx
 * <Heading size="screen">Choisissez votre candidat·e</Heading>
 * ```
 */
export function Heading({ level = 2, size = 'panel', className, style, ...rest }: HeadingProps) {
  const Tag = level === 3 ? 'h3' : 'h2';
  const fontSize = SIZES[size];
  return (
    <Tag
      className={cx(className)}
      style={fontSize ? { fontSize, ...style } : style}
      {...rest}
    />
  );
}
