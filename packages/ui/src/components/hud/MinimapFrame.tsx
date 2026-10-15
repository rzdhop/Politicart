import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type MinimapFrameProps = ComponentPropsWithRef<'canvas'>;

/**
 * The minimap: a framed canvas for the engine to draw into.
 *
 * 150px square on screen (100px on phones), with a dark translucent backing, a
 * hairline border and a 12px radius. The canvas's own resolution defaults to
 * 300x300 -- twice its displayed size, so the track line and kart dots stay
 * crisp on a high-density screen.
 *
 * This component only owns the frame. Drawing is the engine's job: take the
 * ref, get a 2D context, and redraw it in the frame loop. Nothing about the
 * minimap goes through React.
 *
 * ```tsx
 * const minimap = useRef<HTMLCanvasElement>(null);
 * <MinimapFrame ref={minimap} />
 * // in the frame loop:
 * drawMinimap(minimap.current!.getContext('2d')!, karts);
 * ```
 */
export function MinimapFrame({
  className,
  width = 300,
  height = 300,
  ...rest
}: MinimapFrameProps) {
  return <canvas className={cx('minimap', className)} width={width} height={height} {...rest} />;
}
