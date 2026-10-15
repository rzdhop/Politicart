import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

/**
 * `name` and `children` are omitted from the underlying button props: `name` is
 * a form-field attribute with no meaning for a selection card, and this
 * component composes its own children from `name`, `preview` and
 * `description`.
 */
export interface TrackCardProps
  extends Omit<ComponentPropsWithRef<'button'>, 'children' | 'name'> {
  /** The circuit's name, in display type. */
  name: ReactNode;
  /** A sentence or two on what the circuit is like, in muted 12.5px text. */
  description?: ReactNode;
  /**
   * A preview of the circuit, between the name and the description. Any node:
   * the game passes a `<canvas>` it draws the track spline onto, and the
   * stylesheet sizes a canvas child to full width with a dark backing.
   */
  preview?: ReactNode;
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
 * Reports `aria-pressed` so the current choice is announced, which the original
 * markup did not do.
 *
 * ```tsx
 * <TrackCard
 *   name="L’Élysée — Faubourg Saint-Honoré"
 *   description="Tour du palais et des boutiques du Faubourg."
 *   preview={<canvas ref={drawMinimap} width={240} height={150} />}
 *   selected={chosen === 'elysee'}
 *   onClick={() => choose('elysee')}
 * />
 * ```
 */
export function TrackCard({
  name,
  description,
  preview,
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
      <div className="name">{name}</div>
      {preview}
      {description === undefined ? null : <div className="desc">{description}</div>}
    </button>
  );
}
