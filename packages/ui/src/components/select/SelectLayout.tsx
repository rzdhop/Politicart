import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type SelectLayoutProps = ComponentPropsWithRef<'div'>;

/**
 * The two-column character-select frame: a roster on the left, a showcase on
 * the right.
 *
 * `minmax(260px, 400px)` for the roster against `1fr` for the showcase, 24px
 * apart, stretched to equal height. Below 760px it collapses to one column and
 * the showcase moves above the roster, so the player sees who they have
 * selected without scrolling.
 *
 * A phone held sideways (`max-height: 520px` in landscape) is too short for
 * either of those: it keeps two columns, split 1.1 : 1 and 14px apart, and
 * pins the showcase -- `position: sticky; top: 0`, never taller than the
 * viewport (`100dvh`) -- while the roster scrolls past beside it. The scroll
 * container is whatever the layout sits in; inside a `Screen` that is the
 * screen itself. The candidate and the stage band above their name stay in
 * view however far down the roster the player goes.
 *
 * Expects exactly two children, in roster-then-showcase order. The reordering
 * at narrow widths is done in CSS, so do not swap them in markup.
 *
 * ```tsx
 * <SelectLayout>
 *   <Roster footer={buttons}>{tiles}</Roster>
 *   <Showcase
 *     name="Victor Lemarchand"
 *     title="Le jeune président"
 *     stage={<ShowcaseStage aria-label="Le podium : glissez pour le faire pivoter" />}
 *   />
 * </SelectLayout>
 * ```
 */
export function SelectLayout({ className, ...rest }: SelectLayoutProps) {
  return <div className={cx('select-layout', className)} {...rest} />;
}
