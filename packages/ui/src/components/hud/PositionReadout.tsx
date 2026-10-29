import { useImperativeHandle, useRef, type ComponentPropsWithRef, type Ref } from 'react';

import { cx } from '../../cx';
import { replayClass } from './handles';

export interface PositionReadoutHandle {
  /** Set the race position, bypassing React. 1-based, as displayed. */
  setPosition(position: number): void;
}

export interface PositionReadoutProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children' | 'ref'> {
  /** Race position, 1-based: 1 renders as "1er", 4 as "4e". */
  position: number;
  /** Imperative handle for per-frame updates. See `TextReadoutHandle`. */
  ref?: Ref<PositionReadoutHandle>;
}

/** French ordinal suffix: first is "er", everything after is "e". */
function suffix(position: number): string {
  return position === 1 ? 'er' : 'e';
}

/**
 * The biggest number on screen: the player's current position.
 *
 * `clamp(44px, 8vw, 86px)` of gold display type with the ordinal suffix set at
 * 45% size, so "3e" reads as one glyph pair rather than two numbers. This is
 * the HUD's anchor -- it should stay the largest thing in any corner.
 *
 * Position changes on overtakes, which can happen several times a second, so
 * this exposes an imperative handle alongside its prop. Each change through
 * the handle pops the number (`gain` when a place is won, `loss` when one is
 * lost; keyframes in `fx.css`, off under reduced motion).
 *
 * ```tsx
 * const pos = useRef<PositionReadoutHandle>(null);
 * <PositionReadout ref={pos} position={6} />
 * // in the frame loop:
 * pos.current?.setPosition(kart.rank + 1);
 * ```
 */
export function PositionReadout({ position, className, ref, ...rest }: PositionReadoutProps) {
  const value = useRef<HTMLSpanElement | null>(null);
  const ordinal = useRef<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setPosition(next: number) {
        const text = String(next);
        if (value.current !== null && value.current.textContent !== text) {
          // a place gained pops up, a place lost drops (fx.css)
          const before = Number(value.current.textContent);
          value.current.textContent = text;
          root.current?.classList.remove('gain', 'loss');
          replayClass(root.current, next < before ? 'gain' : 'loss');
        }
        const mark = suffix(next);
        if (ordinal.current !== null && ordinal.current.textContent !== mark) {
          ordinal.current.textContent = mark;
        }
      },
    }),
    [],
  );

  return (
    <div ref={root} className={cx('pos', className)} {...rest}>
      <span ref={value}>{position}</span>
      <small ref={ordinal}>{suffix(position)}</small>
    </div>
  );
}
