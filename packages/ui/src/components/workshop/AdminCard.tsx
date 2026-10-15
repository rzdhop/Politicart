import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type AdminCardProps = ComponentPropsWithRef<'div'>;

/**
 * One editable entry in the workshop: the `TrackCard` surface, made static.
 *
 * Reuses the card look but as a plain `div` rather than a button, with the
 * pointer cursor and hover lift removed -- it holds form controls, so it must
 * not behave like something you click.
 *
 * **Must be inside an `AdminGrid`**: the static treatment comes from
 * `.admin .card`, so on its own this renders as an interactive-looking card.
 *
 * ```tsx
 * <AdminGrid>
 *   <AdminCard>
 *     <div className="name">Victor Lemarchand</div>
 *     <Field label="Nom"><TextInput defaultValue="Victor Lemarchand" /></Field>
 *   </AdminCard>
 * </AdminGrid>
 * ```
 */
export function AdminCard({ className, ...rest }: AdminCardProps) {
  return <div className={cx('card', className)} {...rest} />;
}
