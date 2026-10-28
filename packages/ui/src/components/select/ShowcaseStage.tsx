import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

/**
 * `aria-label` is required rather than optional: the band is announced as an
 * image (`role="img"`), and an image with no name is read as nothing at all,
 * or as "image", which tells a screen-reader user neither what is drawn there
 * nor that it can be turned.
 */
export interface ShowcaseStageProps extends ComponentPropsWithRef<'div'> {
  /**
   * What the band shows and what it does, for assistive technology -- the
   * game writes « Le podium : glissez pour le faire pivoter ». Describe the
   * scene, not the candidate: their name is already the showcase's heading.
   */
  'aria-label': string;
}

/**
 * The band of a `Showcase` that the 3D scene draws into, and the surface the
 * player drags to turn the podium.
 *
 * An empty, flexible block: `flex: 1` with a 140px floor, so it takes every
 * pixel the showcase has free above the candidate's name and its rect is
 * exactly the region the scene should frame its model into. Measure the rect
 * (`getBoundingClientRect()`) rather than inferring the band from the text
 * below it. The scene itself is drawn behind the screen, on the game's one
 * canvas; nothing renders inside this element.
 *
 * It is the one part of a showcase that takes pointer input: the `Showcase`
 * stays `pointer-events: none`, this re-enables it. `touch-action: pan-y`
 * leaves vertical swipes to the page, so a phone still scrolls over it, while
 * horizontal drags reach your pointer handlers to set the yaw. The cursor is
 * `grab`, and `grabbing` while a button is held. Text selection is off so a
 * drag does not highlight the name below it.
 *
 * Announced as an image with the label you pass. It is not focusable: the
 * scene turns by itself when idle, so a keyboard player loses nothing by not
 * reaching it, and a tab stop with no keyboard action would be a dead end.
 * Children, if any, are presentational -- a static picture for a device with
 * no WebGL, say. The band is positioned, so give such a picture
 * `position: absolute; inset: 0` and it fills the band without changing its
 * size.
 *
 * Native props are spread onto the element, so the consumer gives it its own
 * id and pointer handlers. Place it through the showcase's `stage` slot, which
 * renders it first, above the name.
 *
 * ```tsx
 * <Showcase
 *   name="Victor Lemarchand"
 *   stage={
 *     <ShowcaseStage
 *       aria-label="Le podium : glissez pour le faire pivoter"
 *       onPointerDown={startDrag}
 *     />
 *   }
 * >
 *   <StatGrid>{bars}</StatGrid>
 * </Showcase>
 * ```
 */
export function ShowcaseStage({ className, ...rest }: ShowcaseStageProps) {
  return <div role="img" className={cx('showcase-stage', className)} {...rest} />;
}
