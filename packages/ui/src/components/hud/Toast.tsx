import { useImperativeHandle, useRef, type ComponentPropsWithRef, type Ref } from 'react';

import { cx } from '../../cx';

export interface ToastHandle {
  /** Show a message. Replaces whatever is showing. */
  show(message: string): void;
  /** Fade the current message out. */
  hide(): void;
}

export interface ToastProps extends Omit<ComponentPropsWithRef<'div'>, 'ref'> {
  /** Whether the message is showing. Fades over 200ms either way. */
  visible?: boolean;
  /** Imperative handle, for messages raised from the game loop. */
  ref?: Ref<ToastHandle>;
}

/**
 * The event ribbon: gold display type across the upper fifth of the screen.
 *
 * Fades in and out over 200ms rather than appearing, so a burst of events
 * during a race reads as a sequence instead of a flicker. The game raises one
 * for every item picked up, power used and hazard hit.
 *
 * Messages come from gameplay, which is why the handle exists: a toast is
 * raised from deep inside the physics step, and that must not trigger a React
 * render mid-frame. Hiding is driven by the caller's own timer -- the component
 * holds no timeout of its own, so a race that ends mid-toast leaves nothing
 * pending.
 *
 * ```tsx
 * const toast = useRef<ToastHandle>(null);
 * <Toast ref={toast} />
 * toast.current?.show('Mini-turbo !');
 * setTimeout(() => toast.current?.hide(), 1500);
 * ```
 */
export function Toast({ visible = false, className, children, ref, ...rest }: ToastProps) {
  const root = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      show(message: string) {
        const element = root.current;
        if (element === null) return;
        element.textContent = message;
        element.classList.add('on');
      },
      hide() {
        root.current?.classList.remove('on');
      },
    }),
    [],
  );

  return (
    <div ref={root} className={cx('toast', visible && 'on', className)} {...rest}>
      {children}
    </div>
  );
}
