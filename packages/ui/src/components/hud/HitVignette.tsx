import { useImperativeHandle, useRef, type ComponentPropsWithRef, type CSSProperties, type Ref } from 'react';

import { cx } from '../../cx';

/** What the vignette is saying: a hit (red), a lap completed (gold), a boost (blue). */
export type HitVignetteTone = 'hit' | 'lap' | 'boost';

export interface HitVignetteHandle {
  /** Set how strongly the edges are tinted, 0 to 1, bypassing React. Unchanged values cost nothing. */
  setLevel(level: number): void;
  /** Switch the tint's colour. */
  setTone(tone: HitVignetteTone): void;
  /** Play one flash of the current tone over whatever level is set (off under reduced motion). */
  flash(): void;
}

export interface HitVignetteProps extends Omit<ComponentPropsWithRef<'div'>, 'children' | 'ref'> {
  /** How strongly the edges are tinted, 0 (nothing) to 1. */
  level?: number;
  /** The tint's colour. */
  tone?: HitVignetteTone;
  /** Imperative handle, driven from the game loop. */
  ref?: Ref<HitVignetteHandle>;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/**
 * The screen's edges, tinted: red when the player's kart is hit, gold for a
 * lap completed, a cool blue while it boosts.
 *
 * A full-screen layer that never takes a pointer. Its strength is a level
 * from 0 to 1 the game sets every frame (the engine's hit flash decays on its
 * own, so this component holds no timer); `flash()` adds one keyframed pulse
 * on top, which `prefers-reduced-motion` switches off -- the level itself is
 * a tint, not motion, and stays.
 *
 * ```tsx
 * const vignette = useRef<HitVignetteHandle>(null);
 * <HitVignette ref={vignette} />
 * // in the frame loop:
 * vignette.current?.setLevel(payload.hit);
 * ```
 */
export function HitVignette({ level = 0, tone = 'hit', className, style, ref, ...rest }: HitVignetteProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const shown = useRef(clamp01(level).toFixed(2));

  useImperativeHandle(
    ref,
    () => ({
      setLevel(next: number) {
        const text = clamp01(next).toFixed(2);
        if (text === shown.current || root.current === null) return;
        shown.current = text;
        root.current.style.setProperty('--hit', text);
      },
      setTone(next: HitVignetteTone) {
        if (root.current !== null && root.current.dataset.tone !== next) root.current.dataset.tone = next;
      },
      flash() {
        const element = root.current;
        if (element === null) return;
        element.classList.remove('flash');
        void element.offsetWidth;   // restart the keyframe
        element.classList.add('flash');
      },
    }),
    [],
  );

  return (
    <div
      ref={root}
      aria-hidden="true"
      data-tone={tone}
      className={cx('hit-vignette', className)}
      style={{ '--hit': clamp01(level).toFixed(2), ...style } as CSSProperties}
      {...rest}
    />
  );
}
