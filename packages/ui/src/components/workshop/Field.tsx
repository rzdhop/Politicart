import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

export interface FieldProps extends ComponentPropsWithRef<'label'> {
  /** The caption, rendered above the control in muted uppercase micro-type. */
  label: ReactNode;
}

/**
 * A labelled form control.
 *
 * Renders a real `<label>` wrapping its caption and control, so clicking the
 * caption focuses the input without needing matching `id` and `htmlFor`
 * attributes. The label is a 3px-gap grid, so the caption sits directly above
 * whatever control you pass as children.
 *
 * **Must be inside an `AdminGrid`** -- the style comes from `.admin label`.
 *
 * ```tsx
 * <Field label="Couleur du kart">
 *   <ColorSwatch defaultValue="#1f3a93" />
 * </Field>
 * ```
 */
export function Field({ label, className, children, ...rest }: FieldProps) {
  return (
    <label className={cx(className)} {...rest}>
      {label}
      {children}
    </label>
  );
}
