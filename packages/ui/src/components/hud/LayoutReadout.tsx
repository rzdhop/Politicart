import { useImperativeHandle, useRef, type ComponentPropsWithRef, type ReactNode, type Ref } from 'react';

import { cx } from '../../cx';

export interface LayoutReadoutHandle {
  /** Show this layout's name (bypassing React); an empty name empties it. */
  setName(name: string): void;
  /** Show or hide the readout. */
  setVisible(visible: boolean): void;
}

export interface LayoutReadoutProps extends Omit<ComponentPropsWithRef<'div'>, 'children' | 'ref'> {
  /** The caption before the name. Defaults to "Layout"; the game passes "Tracé du jour". */
  label?: ReactNode;
  /** The layout's name. */
  name?: string;
  /** Imperative handle, driven from the game loop. */
  ref?: Ref<LayoutReadoutHandle>;
}

/**
 * The layout the race's seed drew for this circuit: a gold display caption
 * over the variant's name, in a pill centred under the countdown.
 *
 * The game shows it during the countdown and while the race is paused, and
 * hides it at the green light; it stays on every screen size (the hint line
 * it replaces is hidden on phones). The name is written through the handle
 * (`setName`), which leaves the caption alone.
 *
 * ```tsx
 * const layout = useRef<LayoutReadoutHandle>(null);
 * <LayoutReadout ref={layout} label="Tracé du jour" hidden />
 * layout.current?.setName(payload.layoutName); layout.current?.setVisible(state === 'countdown');
 * ```
 */
export function LayoutReadout({ label = 'Layout', name = '', className, ref, ...rest }: LayoutReadoutProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const value = useRef<HTMLSpanElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setName(next: string) {
        const el = value.current;
        if (el !== null && el.textContent !== next) el.textContent = next;
      },
      setVisible(visible: boolean) {
        const el = root.current;
        if (el !== null && el.hidden === visible) el.hidden = !visible;
      },
    }),
    [],
  );

  return (
    <div ref={root} className={cx('layout-readout', className)} {...rest}>
      <span className="lr-label">{label}</span>
      <span ref={value} className="lr-name">
        {name}
      </span>
    </div>
  );
}
