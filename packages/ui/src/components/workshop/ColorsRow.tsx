import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type ColorsRowProps = ComponentPropsWithRef<'div'>;

/**
 * A row of colour swatches, 14px apart.
 *
 * **Must be inside an `AdminGrid`.**
 *
 * ```tsx
 * <ColorsRow>
 *   <Field label="Costume"><ColorSwatch defaultValue="#1a2a5e" /></Field>
 *   <Field label="Kart"><ColorSwatch defaultValue="#1f3a93" /></Field>
 * </ColorsRow>
 * ```
 */
export function ColorsRow({ className, ...rest }: ColorsRowProps) {
  return <div className={cx('colors', className)} {...rest} />;
}
