import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

/**
 * The DOM `title` attribute is omitted so that `title` can carry the
 * character's epithet instead, mirroring the game's own `character.title`
 * field and the `.title` class it renders into. A tooltip on a
 * `pointer-events: none` panel would be unreachable anyway.
 */
export interface ShowcaseProps extends Omit<ComponentPropsWithRef<'div'>, 'title'> {
  /** The character's name, set large in the display face. */
  name: ReactNode;
  /** Their epithet -- "Le jeune président" -- in gold small caps. */
  title?: ReactNode;
  /** Their catchphrase, rendered in muted italics. */
  quote?: ReactNode;
}

/**
 * The panel beside the roster that presents whoever is currently selected.
 *
 * Bottom-aligned and left-aligned so the name sits just above the stats, over
 * the live 3D model behind it. Below 760px it moves above the roster and
 * centres itself.
 *
 * It is `pointer-events: none`: the showcase is a label for the scene behind
 * it, never something to click. Do not put controls inside it -- they will not
 * be clickable. Stats and the power box go in as children.
 *
 * ```tsx
 * <Showcase name="Victor Lemarchand" title="Le jeune président" quote="« Disruptons ce virage. »">
 *   <StatGrid>
 *     <StatBar label="Vitesse" value={0.66} />
 *   </StatGrid>
 *   <PowerBox name="Pouvoir : Grand débat" hint="(touche F)">
 *     Prend la parole pendant 3 s.
 *   </PowerBox>
 * </Showcase>
 * ```
 */
export function Showcase({ name, title, quote, className, children, ...rest }: ShowcaseProps) {
  return (
    <div className={cx('showcase', className)} {...rest}>
      <div className="big">{name}</div>
      {title === undefined ? null : <div className="title">{title}</div>}
      {quote === undefined ? null : <div className="quote">{quote}</div>}
      {children}
    </div>
  );
}
