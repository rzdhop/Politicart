import type { ComponentPropsWithRef, Ref } from 'react';

import { cx } from '../../cx';
import { useTextReadout, type TextReadoutHandle } from './handles';

export interface HudHintProps extends Omit<ComponentPropsWithRef<'div'>, 'ref'> {
  /** Imperative handle for updates driven from the game loop. */
  ref?: Ref<TextReadoutHandle>;
}

/**
 * A line of coaching beside the item slot.
 *
 * 12px muted text capped at 220px. **It is hidden entirely below 600px**, so
 * never put anything here that a player must read -- it is for teaching, not
 * for state. The game uses it to explain what the held item does.
 *
 * ```tsx
 * <HudHint>Ramassez une urne dorée pour obtenir un objet.</HudHint>
 * ```
 */
export function HudHint({ className, children, ref, ...rest }: HudHintProps) {
  const node = useTextReadout(ref);
  return (
    <div ref={node as Ref<HTMLDivElement>} className={cx('hint', className)} {...rest}>
      {children}
    </div>
  );
}
