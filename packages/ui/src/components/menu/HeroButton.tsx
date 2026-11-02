import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

export interface HeroButtonProps extends ComponentPropsWithRef<'button'> {
  /** A glyph before the label (a `MenuGlyph`, say); decorative. */
  icon?: ReactNode;
  /**
   * A short line under the label, in small body type: the keyboard shortcut
   * (« ou appuyez sur Entrée »). Leave it out where there is no keyboard.
   */
  hint?: ReactNode;
}

/**
 * The one call to action a screen is built around: the title's « Jouer ».
 *
 * The gold arcade button grown to hero size -- display type at up to 64px,
 * a 7px hard shadow it presses into, full width of its column up to 560px --
 * with a halo that breathes behind it and a light sweep across its face
 * every few seconds (fx.css), so the eye lands on it first. Both stop under
 * `prefers-reduced-motion`, leaving the static gold and its shadow.
 *
 * At most one per screen; everything else around it is a `MenuCard` or a
 * ghost `Button`. Keyboard focus draws the system's 3px white ring.
 * Defaults to `type="button"`.
 *
 * ```tsx
 * <HeroButton id="b-play" icon={<MenuGlyph name="play" />} hint="ou appuyez sur Entrée" onClick={play}>
 *   Jouer
 * </HeroButton>
 * ```
 */
export function HeroButton({ icon, hint, className, children, type = 'button', ...rest }: HeroButtonProps) {
  return (
    <button type={type} className={cx('hero-btn', className)} {...rest}>
      <span className="hero-btn-main">
        {icon ? <span className="hero-btn-icon">{icon}</span> : null}
        <span className="hero-btn-label">{children}</span>
      </span>
      {hint ? <span className="hero-btn-hint">{hint}</span> : null}
    </button>
  );
}
