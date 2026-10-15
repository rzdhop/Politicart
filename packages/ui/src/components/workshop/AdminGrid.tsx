import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type AdminGridProps = ComponentPropsWithRef<'div'>;

/**
 * The workshop's form grid: as many 280px columns as fit.
 *
 * **Every other workshop component depends on this wrapper.** `AdminCard`,
 * `Field`, `TextInput`, `ColorSwatch`, `FileInput`, `ColorsRow` and
 * `LiveryThumb` are all defined as descendants of `.admin` in the stylesheet,
 * so outside an `AdminGrid` they render unstyled. That is how the game scopes
 * its one form, and keeping the scope means the workshop's inputs never leak
 * their look onto the rest of the system.
 *
 * ```tsx
 * <AdminGrid>
 *   {cast.map((c) => (
 *     <AdminCard key={c.id}>
 *       <Field label="Nom"><TextInput defaultValue={c.name} /></Field>
 *     </AdminCard>
 *   ))}
 * </AdminGrid>
 * ```
 */
export function AdminGrid({ className, ...rest }: AdminGridProps) {
  return <div className={cx('admin', className)} {...rest} />;
}
