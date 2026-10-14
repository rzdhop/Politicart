import { useImperativeHandle, useRef, type ComponentPropsWithRef, type Ref } from 'react';

import { cx } from '../../cx';

export interface WrongWayHandle {
  /** Show or hide the warning, bypassing React. */
  setVisible(visible: boolean): void;
}

export interface WrongWayProps extends Omit<ComponentPropsWithRef<'div'>, 'ref'> {
  /** Imperative handle, since the engine recomputes this every frame. */
  ref?: Ref<WrongWayHandle>;
}

/**
 * The wrong-way warning: red display type across the middle of the screen.
 *
 * The only red text in the HUD, which is what makes it register instantly. Use
 * the `hidden` attribute to control it -- the stylesheet enforces
 * `display: none` -- and keep it mounted, since the engine re-evaluates the
 * condition on every frame.
 *
 * ```tsx
 * const wrongWay = useRef<WrongWayHandle>(null);
 * <WrongWay ref={wrongWay} hidden>SENS INTERDIT !</WrongWay>
 * // in the frame loop:
 * wrongWay.current?.setVisible(kart.wrongTimer > 0.5);
 * ```
 */
export function WrongWay({ className, children, ref, ...rest }: WrongWayProps) {
  const root = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setVisible(visible: boolean) {
        const element = root.current;
        if (element !== null && element.hidden === visible) {
          element.hidden = !visible;
        }
      },
    }),
    [],
  );

  return (
    <div ref={root} className={cx('wrong', className)} {...rest}>
      {children}
    </div>
  );
}
