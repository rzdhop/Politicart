import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type KeyCapProps = ComponentPropsWithRef<'b'>;

/**
 * A single key, drawn as a chip.
 *
 * Monospace 13px in `--fg` on a translucent white fill with a 5px radius.
 *
 * **Must be rendered inside a `ControlsGrid`.** The chip comes from the
 * descendant rule `.controls b`, so on its own this renders as unstyled bold
 * text. If you need a keycap outside a legend, wrap it in a `ControlsGrid`.
 *
 * ```tsx
 * <ControlsGrid>
 *   <div><KeyCap>Échap</KeyCap> pause · <KeyCap>M</KeyCap> son</div>
 * </ControlsGrid>
 * ```
 */
export function KeyCap({ className, ...rest }: KeyCapProps) {
  return <b className={cx(className)} {...rest} />;
}
