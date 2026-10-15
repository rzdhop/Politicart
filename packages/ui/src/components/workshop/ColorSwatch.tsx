import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type ColorSwatchProps = Omit<ComponentPropsWithRef<'input'>, 'type'>;

/**
 * A colour picker, drawn as a bare 44x30 swatch.
 *
 * No border, no padding: the swatch is the control. The game uses these for a
 * candidate's suit and kart colours, which is why they sit in a `ColorsRow`.
 *
 * Note the value format: this is a native colour input, so it reads and writes
 * `#rrggbb` strings. The game stores colours as numbers and converts at this
 * boundary.
 *
 * **Must be inside an `AdminGrid`.**
 *
 * ```tsx
 * <Field label="Kart"><ColorSwatch defaultValue="#1f3a93" /></Field>
 * ```
 */
export function ColorSwatch({ className, ...rest }: ColorSwatchProps) {
  return <input type="color" className={cx(className)} {...rest} />;
}
