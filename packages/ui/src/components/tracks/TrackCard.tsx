import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

/**
 * Where the preview's picture is: `pending` while a rendered thumbnail is on
 * its way (the placeholder shows, with a light sweep), `ready` once it is
 * final, `static` when the placeholder is all there will be (a GPU that
 * cannot spare the frames, the light graphics).
 */
export type TrackThumbState = 'pending' | 'ready' | 'static';

/**
 * `name` and `children` are omitted from the underlying button props: `name` is
 * a form-field attribute with no meaning for a selection card, and this
 * component composes its own children from `name`, `preview`, `description`
 * and `meta`.
 */
export interface TrackCardProps
  extends Omit<ComponentPropsWithRef<'button'>, 'children' | 'name'> {
  /** The circuit's name, in display type. */
  name: ReactNode;
  /** A sentence or two on what the circuit is like, in muted 12.5px text. */
  description?: ReactNode;
  /**
   * A preview of the circuit, between the name and the description. Any node:
   * the game passes a `<canvas>` it draws the circuit's outline onto, then its
   * rendered bird's-eye thumbnail; the stylesheet sizes a canvas child to full
   * width with a dark backing.
   */
  preview?: ReactNode;
  /**
   * The preview's progress (see `TrackThumbState`), set on the preview's
   * frame as `data-thumb`. Omit it for a preview that is final from the start.
   */
  thumb?: TrackThumbState;
  /** The circuit's figures under the description: a `TrackMeta`. */
  meta?: ReactNode;
  /** Marks this card as the current choice: gold border and ring. */
  selected?: boolean;
}

/**
 * A selectable card for one circuit.
 *
 * A `--panel-2` surface with a 2px border that turns gold when selected, and a
 * 2px lift on hover. It is a button, so the whole card is the hit target rather
 * than a link buried in it.
 *
 * The preview sits in a 16:9 frame. With `thumb="pending"` the frame carries
 * a slow light sweep (fx.css, off under reduced motion) while the real
 * thumbnail renders, the way the roster's portraits fill in (DEC-045).
 *
 * Reports `aria-pressed` so the current choice is announced, which the original
 * markup did not do.
 *
 * ```tsx
 * <TrackCard
 *   name="L’Élysée — Faubourg Saint-Honoré"
 *   description="Tour du palais et des boutiques du Faubourg."
 *   preview={<canvas ref={draw} width={320} height={180} />}
 *   thumb={ready ? 'ready' : 'pending'}
 *   meta={<TrackMeta items={figures} layouts={names} />}
 *   selected={chosen === 'elysee'}
 *   onClick={() => choose('elysee')}
 * />
 * ```
 */
export function TrackCard({
  name,
  description,
  preview,
  thumb,
  meta,
  selected = false,
  className,
  type = 'button',
  ...rest
}: TrackCardProps) {
  return (
    <button
      type={type}
      className={cx('card', selected && 'sel', className)}
      aria-pressed={selected}
      {...rest}
    >
      <span className="name">{name}</span>
      {preview === undefined ? null : (
        <span className="track-thumb" data-thumb={thumb}>
          {preview}
        </span>
      )}
      {description === undefined ? null : <span className="desc">{description}</span>}
      {meta}
    </button>
  );
}
