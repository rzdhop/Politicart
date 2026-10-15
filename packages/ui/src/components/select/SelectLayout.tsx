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
 * Expects exactly two children, in roster-then-showcase order. The reordering
 * at narrow widths is done in CSS, so do not swap them in markup.
 *
 * ```tsx
 * <SelectLayout>
 *   <Roster>{tiles}</Roster>
 *   <Showcase name="Victor Lemarchand" title="Le jeune président" />
 * </SelectLayout>
 * ```
 */
export function SelectLayout({ className, ...rest }: SelectLayoutProps) {
  return <div className={cx('select-layout', className)} {...rest} />;
}
