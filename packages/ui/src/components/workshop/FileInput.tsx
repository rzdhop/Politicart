import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type FileInputProps = Omit<ComponentPropsWithRef<'input'>, 'type'>;

/**
 * A file picker, styled only as 12px muted text.
 *
 * Deliberately plain: the browser's own button is left alone so the control
 * stays recognisable. The game uses it for kart liveries and campaign posters,
 * reading each file into a data URL.
 *
 * **Must be inside an `AdminGrid`.**
 *
 * ```tsx
 * <FileInput accept="image/*" multiple onChange={readPosters} />
 * ```
 */
export function FileInput({ className, ...rest }: FileInputProps) {
  return <input type="file" className={cx(className)} {...rest} />;
}
