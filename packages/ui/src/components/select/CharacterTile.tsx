import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

/**
 * `name` and `children` are omitted from the underlying button props: `name` is
 * a form-field attribute with no meaning for a roster tile, and this component
 * composes its own children from `name` and `image`.
 */
export interface CharacterTileProps
  extends Omit<ComponentPropsWithRef<'button'>, 'children' | 'name'> {
  /** The character's name. Shown on the strip and used as the image's alt text. */
  name: string;
  /**
   * Portrait to fill the tile, as any image URL -- the game passes a data URL
   * it renders off-screen from the character's 3D model. Omit it for a tile
   * that is only a name, which is what an unloaded roster looks like.
   */
  image?: string;
  /** Marks this tile as the current choice: gold border, ring and a slight scale-up. */
  selected?: boolean;
  /**
   * Something small pinned to the tile's top-right corner, over the portrait:
   * a `GradeBadge`, a price. Top-right on purpose -- the game's own lock pill
   * sits top-centre, and the two must not collide.
   */
  badge?: ReactNode;
  /**
   * The portrait is still being rendered: a light sweeps across the tile and
   * the button reports `aria-busy`. Pass it while `image` is a placeholder --
   * the game shows each candidate's colour and initials at once and swaps in
   * the real portrait a frame at a time -- and drop it when the final image
   * lands. The tile stays fully usable while pending; this is a promise of a
   * better picture, not a disabled state.
   *
   * The sweep is CSS only (`.tile.pending::before`), drawn under the name
   * strip and the badge, and switched off under `prefers-reduced-motion`,
   * where the placeholder itself is the cue.
   */
  pending?: boolean;
}

/**
 * One square portrait in the roster, as a button.
 *
 * The image covers the tile and the name sits in a dark strip across the
 * bottom. Selection is a gold border, a 3px gold ring and a 1.04 scale, which
 * lifts the tile above its neighbours.
 *
 * Reports `aria-pressed` so the current choice is announced, which the original
 * markup did not do, and `aria-busy` while its portrait is `pending`. The tile
 * is keyboard-focusable as a button and draws a white focus ring -- the game is
 * played from the keyboard, so do not suppress it.
 *
 * ```tsx
 * <CharacterTile
 *   name="Gégé Marteau"
 *   image={thumbs.gege}
 *   pending={!portraitDone.gege}
 *   selected={chosen === 'gege'}
 *   onClick={() => choose('gege')}
 * />
 * ```
 */
export function CharacterTile({
  name,
  image,
  selected = false,
  badge,
  pending = false,
  className,
  type = 'button',
  ...rest
}: CharacterTileProps) {
  return (
    <button
      type={type}
      className={cx('tile', selected && 'sel', pending && 'pending', className)}
      aria-pressed={selected}
      aria-busy={pending || undefined}
      {...rest}
    >
      {image ? <img alt={name} src={image} /> : null}
      {badge === undefined ? null : <span className="tile-badge">{badge}</span>}
      <div className="tname">{name}</div>
    </button>
  );
}
