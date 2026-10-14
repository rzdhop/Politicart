import { useCallback, useImperativeHandle, useRef, type Ref } from 'react';

/**
 * Imperative handle for a readout whose value changes every frame.
 *
 * The HUD is the one place in this system where React state is the wrong tool:
 * during a race the position, lap, clock, speed, drift charge and power
 * cooldown all change on every animation frame, and routing six values per
 * frame through a React render would cost far more than writing to the DOM.
 *
 * So every live readout takes a value as a normal prop -- which is what you
 * want in a design, in a story, or on a paused screen -- and *also* exposes a
 * handle that writes straight to its text node. Pass a ref, keep it, and call
 * it from your animation loop:
 *
 * ```tsx
 * const speed = useRef<TextReadoutHandle>(null);
 * // ...
 * <SpeedReadout ref={speed} value={0} />
 * // inside the frame loop, no re-render:
 * speed.current?.setText(String(Math.round(kart.speed * 3.6)));
 * ```
 *
 * A component updated imperatively will show its `value` prop again on the
 * next React render, so treat the prop as the initial and paused state.
 */
export interface TextReadoutHandle {
  /** Replace the readout's text, bypassing React entirely. */
  setText(text: string): void;
}

/**
 * Wire a `TextReadoutHandle` to a text node.
 *
 * Returns the ref to put on the element whose `textContent` should change.
 */
export function useTextReadout(ref: Ref<TextReadoutHandle> | undefined) {
  const node = useRef<HTMLElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setText(text: string) {
        const element = node.current;
        if (element !== null && element.textContent !== text) {
          element.textContent = text;
        }
      },
    }),
    [],
  );

  return node;
}

/**
 * Set an element's inline width as a percentage, skipping the write when it
 * would not change anything.
 *
 * Shared by the two gauges the engine drives per frame. The guard matters: at
 * 60fps an unconditional style write on an unchanged value is pure layout
 * churn.
 */
export function useFillWidth() {
  const node = useRef<HTMLElement | null>(null);

  const setFraction = useCallback((fraction: number) => {
    const element = node.current;
    if (element === null) return;
    const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
    const width = `${Math.round(clamped * 100)}%`;
    if (element.style.width !== width) {
      element.style.width = width;
    }
  }, []);

  return { node, setFraction };
}
