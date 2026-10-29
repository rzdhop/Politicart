import { useImperativeHandle, useRef, type ComponentPropsWithRef, type Ref } from 'react';

import { cx } from '../../cx';
import { replayClass, type TextReadoutHandle } from './handles';

export interface CenterAnnounceProps extends Omit<ComponentPropsWithRef<'div'>, 'ref'> {
  /** Imperative handle for the countdown, which ticks on a timer. */
  ref?: Ref<TextReadoutHandle>;
}

/**
 * The huge centred announcement: the countdown, and the word that starts the
 * race.
 *
 * `clamp(40px, 10vw, 120px)` in white display type, with a black shadow and a
 * gold outer glow, pinned across the upper third of the screen. This is the
 * loudest thing the system can say -- the game uses it for `3`, `2`, `1` and
 * `PARTEZ !` and nothing else.
 *
 * Leave it empty rather than unmounting it when there is nothing to announce;
 * it occupies no layout space of its own. Each new text set through the
 * handle pops in (the countdown's beats; `fx.css`, off under reduced motion).
 *
 * ```tsx
 * const announce = useRef<TextReadoutHandle>(null);
 * <CenterAnnounce ref={announce} />
 * announce.current?.setText('PARTEZ !');
 * ```
 */
export function CenterAnnounce({ className, children, ref, ...rest }: CenterAnnounceProps) {
  const node = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      setText(text: string) {
        const element = node.current;
        if (element === null || element.textContent === text) return;
        element.textContent = text;
        if (text !== '') replayClass(element, 'beat');
      },
    }),
    [],
  );
  return (
    <div ref={node} className={cx('center', className)} {...rest}>
      {children}
    </div>
  );
}
