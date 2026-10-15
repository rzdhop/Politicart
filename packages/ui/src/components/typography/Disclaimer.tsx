import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type DisclaimerProps = ComponentPropsWithRef<'p'>;

/**
 * Small muted print, measured for reading.
 *
 * 12px in `--muted`, capped at a 60-character measure with 1.4 leading. This is
 * where the game puts the fiction notice and the workshop's explanatory copy --
 * the text that has to be present but must not compete with the controls.
 *
 * ```tsx
 * <Disclaimer>
 *   Toute ressemblance avec des personnalités existantes serait purement
 *   électorale.
 * </Disclaimer>
 * ```
 */
export function Disclaimer({ className, ...rest }: DisclaimerProps) {
  return <p className={cx('disclaimer', className)} {...rest} />;
}
