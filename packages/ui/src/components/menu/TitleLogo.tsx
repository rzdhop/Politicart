import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';
import { Tricolore } from '../brand/Tricolore';

export interface TitleLogoProps extends Omit<ComponentPropsWithRef<'div'>, 'title'> {
  /** The game's name, set as the page's `<h1>`. */
  title: ReactNode;
  /** The gold line under it (« Grand Prix de l’Hémicycle »). */
  subtitle?: ReactNode;
}

/**
 * The title screen's logo: the tricolore rule, the game's name in the
 * tricolore display type at hero size, and the gold subtitle.
 *
 * It arrives: the rule wipes open from the middle, the name slams down from
 * above with a squash and a settle, the subtitle rises after it; then a
 * light sweeps across the letters every few seconds (a second gradient
 * clipped to the text with the tricolore, so it only lights the letters).
 * All of it is fx.css and none of it under `prefers-reduced-motion`, where
 * the logo is simply there.
 *
 * One per page: it renders the `<h1>`.
 *
 * ```tsx
 * <TitleLogo title="POLITIKART" subtitle="Grand Prix de l’Hémicycle" />
 * ```
 */
export function TitleLogo({ title, subtitle, className, ...rest }: TitleLogoProps) {
  return (
    <div className={cx('title-logo', className)} {...rest}>
      <Tricolore />
      <h1 className="title-logo-name">{title}</h1>
      {subtitle ? <div className="sub title-logo-sub">{subtitle}</div> : null}
    </div>
  );
}
