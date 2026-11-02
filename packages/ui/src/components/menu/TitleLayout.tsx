import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

export interface TitleLayoutProps extends ComponentPropsWithRef<'div'> {
  /** The corner strip: settings and utilities (a `.settings-strip` of `SettingsChip`s). */
  corner?: ReactNode;
  /** The brand block: a `TitleLogo` and a `Tagline`. */
  brand: ReactNode;
  /**
   * The band the 3D scene frames the player's kart into (a `ShowcaseStage`).
   * The scene is drawn behind the page; this only reserves the room and takes
   * the drag.
   */
  stage?: ReactNode;
  /** A small plate under the stage: who is at the wheel. */
  stageCaption?: ReactNode;
  /** The calls to action: the `HeroButton`, then a `.menu-cards` row. */
  actions: ReactNode;
  /** The fine print at the bottom (a `Disclaimer`). */
  footer?: ReactNode;
}

/**
 * The title screen's composition, over a live 3D scene.
 *
 * Wide (from 900px, and a phone held sideways): the brand and the calls to
 * action in a left column over a night scrim, the stage band filling the
 * right column, the corner strip across the top right, the footer under
 * everything. Upright on a phone: the strip, the brand, the stage band (a
 * third of the screen), then the calls to action and the footer, in one
 * column inside the screens' 16px gutters, never wider than the screen.
 *
 * The scrim (a fixed layer behind the layout) darkens the scene where text
 * sits, so the gold and the tricolore read over any frame of it. Children
 * of the slots arrive in a staggered rise (fx.css), the brand first and the
 * cards last; nothing moves under `prefers-reduced-motion`.
 *
 * Render it as the `Screen`'s child; the screen keeps its own scrolling.
 *
 * ```tsx
 * <Screen id="s-title">
 *   <TitleLayout
 *     corner={<div className="settings-strip">…</div>}
 *     brand={<><TitleLogo title="POLITIKART" subtitle="Grand Prix de l’Hémicycle" /><Tagline lines={quips} /></>}
 *     stage={<ShowcaseStage aria-label="Votre kart sur le podium" />}
 *     stageCaption={<>Au volant : <b>Emmanuel Macaron</b></>}
 *     actions={<><HeroButton>Jouer</HeroButton><div className="menu-cards">…</div></>}
 *     footer={<Disclaimer>…</Disclaimer>}
 *   />
 * </Screen>
 * ```
 */
export function TitleLayout({ corner, brand, stage, stageCaption, actions, footer, className, ...rest }: TitleLayoutProps) {
  return (
    <div className={cx('title-layout', !stage && 'no-stage', className)} {...rest}>
      {corner ? <div className="tl-corner">{corner}</div> : null}
      <div className="tl-brand">{brand}</div>
      {stage ? (
        <div className="tl-stage">
          {stage}
          {stageCaption ? <div className="tl-caption">{stageCaption}</div> : null}
        </div>
      ) : null}
      <div className="tl-actions">{actions}</div>
      {footer ? <div className="tl-footer">{footer}</div> : null}
    </div>
  );
}
