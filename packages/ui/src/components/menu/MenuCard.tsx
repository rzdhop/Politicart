import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

/** The accent a card wears on its glyph tile and its hover glow. */
export type MenuCardTone = 'blue' | 'red' | 'gold';

export interface MenuCardProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  /** The glyph on the card's coloured tile (a `MenuGlyph`); decorative. */
  icon: ReactNode;
  /** The entry's name, in display type. */
  label: ReactNode;
  /** One line under it: what waits there, a balance, who is signed in. */
  sub?: ReactNode;
  /**
   * A count in a red bubble on the card's corner (pending friend requests).
   * Give it its own words with `badgeLabel`; nothing renders when it is 0
   * or left out.
   */
  badge?: ReactNode;
  /** The badge's accessible name (« 2 demandes d’ami »). */
  badgeLabel?: string;
  /** The accent: Marianne blue (default), republican red or parliament gold. */
  tone?: MenuCardTone;
}

/**
 * A secondary menu entry, big enough to be a destination rather than a
 * toggle: a glass card with a coloured glyph tile, the entry's name and a
 * line of context under it.
 *
 * Side by side in a `.menu-cards` row (three to a row from a phone up; the
 * card lays its glyph above the text when the row is narrow, beside it once
 * the row is 420px wide, and on a phone held sideways). It lifts and glows in its tone on hover and focus, its glyph
 * wiggles (fx.css; still under `prefers-reduced-motion`), and it presses
 * down like the gold button. At least 44px tall at every size.
 *
 * A button, `type="button"` by default; every native prop is spread onto it,
 * so the consumer gives it its id and its click.
 *
 * ```tsx
 * <div className="menu-cards">
 *   <MenuCard id="b-multi" icon={<MenuGlyph name="multi" />} label="Multijoueur" sub="Bleu contre Rouge" />
 *   <MenuCard id="b-shop" tone="gold" icon={<MenuGlyph name="shop" />} label="Boutique" sub={<CoinCount size="sm" value={1250} />} />
 *   <MenuCard id="b-account" tone="red" icon={<MenuGlyph name="account" />} label="Compte" sub="Marianne · niv. 4" badge={2} badgeLabel="2 demandes d’ami" />
 * </div>
 * ```
 */
export function MenuCard({
  icon,
  label,
  sub,
  badge,
  badgeLabel,
  tone = 'blue',
  className,
  type = 'button',
  ...rest
}: MenuCardProps) {
  const showBadge = badge !== undefined && badge !== null && badge !== false && badge !== 0;
  return (
    <button type={type} className={cx('menu-card', className)} data-tone={tone} {...rest}>
      <span className="mc-icon">{icon}</span>
      <span className="mc-text">
        <span className="mc-label">{label}</span>
        {sub === undefined || sub === null ? null : <span className="mc-sub">{sub}</span>}
      </span>
      {showBadge ? (
        <span className="mc-badge" aria-label={badgeLabel} role={badgeLabel ? 'img' : undefined}>
          {badge}
        </span>
      ) : null}
    </button>
  );
}
