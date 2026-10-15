import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type TextInputProps = Omit<ComponentPropsWithRef<'input'>, 'type'>;

/**
 * A single-line text input.
 *
 * Inherits the body font at 14px on a translucent white fill with a hairline
 * border. The `type` is fixed to `text`, since the style is bound to
 * `.admin input[type=text]` and another type would silently lose it.
 *
 * **Must be inside an `AdminGrid`.**
 *
 * ```tsx
 * <Field label="Nom"><TextInput defaultValue="Victor Lemarchand" /></Field>
 * ```
 */
export function TextInput({ className, ...rest }: TextInputProps) {
  return <input type="text" className={cx(className)} {...rest} />;
}
