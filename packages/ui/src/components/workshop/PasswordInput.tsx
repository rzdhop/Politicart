import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type PasswordInputProps = Omit<ComponentPropsWithRef<'input'>, 'type'>;

/**
 * A single-line password input: the `TextInput` look, with the characters
 * masked.
 *
 * Same body font at 14px on a translucent white fill with a hairline border.
 * The `type` is fixed to `password`, since the style is bound to
 * `.admin input[type=password]` and another type would silently lose it --
 * and would show the password in clear. Pass `autoComplete="current-password"`
 * so password managers fill it.
 *
 * **Must be inside an `AdminGrid`.**
 *
 * ```tsx
 * <Field label="Mot de passe"><PasswordInput autoComplete="current-password" /></Field>
 * ```
 */
export function PasswordInput({ className, ...rest }: PasswordInputProps) {
  // `type` goes last so nothing spread in at runtime can unmask the field.
  return <input className={cx(className)} {...rest} type="password" />;
}
