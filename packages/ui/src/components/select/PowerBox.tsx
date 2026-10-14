import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

export interface PowerBoxProps extends ComponentPropsWithRef<'div'> {
  /**
   * The heading, set in gold display type. The game writes
   * `Pouvoir : {power.name}`.
   *
   * Named `name` rather than `title` on purpose: `title` is a global HTML
   * attribute typed as a string, so a ReactNode prop of that name would shadow
   * it and surprise anyone expecting a tooltip.
   */
  name: ReactNode;
  /**
   * A muted aside appended to the body text, for the key that triggers the
   * power -- "(touche F)". Inline-styled with `--muted` rather than given a
   * class, which is how the game does it.
   */
  hint?: ReactNode;
}

/**
 * A callout for a character's signature power.
 *
 * A panel with a 4px gold left border: the one place in the system that uses an
 * accent edge, which is what makes a power read as special rather than as
 * another paragraph. Capped at a 46-character measure.
 *
 * ```tsx
 * <PowerBox name="Pouvoir : Grève générale" hint="(touche F)">
 *   Bloque le circuit : les adversaires ralentissent pendant 4 s.
 * </PowerBox>
 * ```
 */
export function PowerBox({ name, hint, className, children, ...rest }: PowerBoxProps) {
  return (
    <div className={cx('powerbox', className)} {...rest}>
      <b>{name}</b>
      <p>
        {children}
        {hint === undefined ? null : <span style={{ color: 'var(--muted)' }}> {hint}</span>}
      </p>
    </div>
  );
}
