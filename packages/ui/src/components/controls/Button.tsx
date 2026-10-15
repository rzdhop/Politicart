import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

/**
 * - `primary` -- the gold arcade button. Sits on a 5px hard shadow, lifts 1px
 *   on hover and presses 3px into its shadow when active.
 * - `ghost` -- transparent with a 2px hairline border and smaller type, for
 *   the secondary action in a row (Back, Cancel, a toggle).
 */
export type ButtonVariant = 'primary' | 'ghost';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** Which of the two looks to render. Defaults to `primary`. */
  variant?: ButtonVariant;
}

/**
 * The system's button.
 *
 * Display type, generous padding, and no transition under
 * `prefers-reduced-motion`. Keyboard focus draws a 3px white ring offset from
 * the button, which is the only focus treatment in the system -- do not remove
 * it, since the game is played entirely from the keyboard.
 *
 * Defaults to `type="button"`: these buttons drive screen transitions, and a
 * stray form submit inside a menu would reload the game.
 *
 * Put at most one `primary` in a `Row` -- it marks the action that moves the
 * player forward -- and use `ghost` for everything else.
 *
 * ```tsx
 * <Row>
 *   <Button onClick={start}>Lancer la course !</Button>
 *   <Button variant="ghost" onClick={back}>Retour</Button>
 * </Row>
 * ```
 */
export function Button({ variant = 'primary', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', variant === 'ghost' && 'ghost', className)}
      {...rest}
    />
  );
}
