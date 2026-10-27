import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';
import { Button, type ButtonProps } from '../controls/Button';
import { CoinCount } from './CoinCount';
import { type Grade, GradeBadge } from './GradeBadge';

export interface ShopCardProps extends Omit<ComponentPropsWithRef<'article'>, 'title'> {
  /** The item's name, in display type. */
  title: ReactNode;
  /** A muted line under the name: the candidate's epithet, the part's category. */
  subtitle?: ReactNode;
  /** The item's grade: sets the badge and the card's `grade-<g>` treatment. */
  grade: Grade;
  /** The price in politicoins, shown as a `CoinCount` in the footer. Omit for an item with no price line. */
  price?: number;
  /** Already in the player's inventory: the button reads `ownedLabel`, disabled, and a tick ribbon appears. */
  owned?: boolean;
  /**
   * Why the item cannot be bought right now, as the text the disabled button
   * shows -- "Niveau 5 requis", "Pas assez de politicoins". Anything truthy
   * locks the card; `owned` wins over it.
   */
  locked?: ReactNode;
  /** A picture of the item: an image URL, or any node (an SVG, a canvas) for the image area. */
  image?: string | ReactNode;
  /** The grade badge's text; defaults to the grade id capitalised. */
  gradeLabel?: ReactNode;
  /** Called when the buy button is pressed. */
  onBuy?: () => void;
  /** The buy button's text. Defaults to "Buy"; the game passes its own. */
  buyLabel?: ReactNode;
  /** The disabled button's text once owned. Defaults to "Owned"; the game passes its own. */
  ownedLabel?: ReactNode;
  /**
   * Props for the buy button, whatever its state, for a consumer that must
   * address it -- the game gives it the id its test suite drives
   * (`#b-buy-char-lucie`), as DEC-012 asks.
   */
  buyProps?: ButtonProps;
  /** Anything else to show between the subtitle and the footer. */
  children?: ReactNode;
}

/**
 * One item for sale: a `TrackCard`-style card with the grade badge, a
 * picture, the name, and a footer with the price and one button.
 *
 * The button is the card's single action and takes one of three states:
 * primary and live when the item can be bought; disabled and reading the
 * `locked` reason when it cannot; disabled and reading `ownedLabel`, with a
 * gold tick ribbon on the card, once it is owned. The reason text lives on
 * the button rather than beside it so the card keeps one height whatever
 * its state.
 *
 * The card carries `grade-<g>`, so from `rare` up it gets the grade's motion
 * (fx.css) exactly like the badge inside it.
 *
 * ```tsx
 * <ShopCard
 *   title="Lucie Vasseur"
 *   subtitle="L'outsider"
 *   grade="common"
 *   gradeLabel="Commun"
 *   price={300}
 *   image={thumbs.lucie}
 *   onBuy={() => buy('lucie')}
 *   buyLabel="Acheter"
 *   buyProps={{ id: 'b-buy-char-lucie' }}
 * />
 * ```
 */
export function ShopCard({
  title,
  subtitle,
  grade,
  price,
  owned = false,
  locked,
  image,
  gradeLabel,
  onBuy,
  buyLabel = 'Buy',
  ownedLabel = 'Owned',
  buyProps,
  children,
  className,
  ...rest
}: ShopCardProps) {
  const isLocked = !owned && Boolean(locked);
  return (
    <article
      className={cx('card', 'shop-card', `grade-${grade}`, owned && 'owned', isLocked && 'locked', className)}
      data-grade={grade}
      {...rest}
    >
      {owned ? (
        <span className="shop-ribbon" aria-hidden="true">
          ✓
        </span>
      ) : null}
      <div className="shop-head">
        <GradeBadge grade={grade} label={gradeLabel} size="sm" />
      </div>
      <div className="shop-image">
        {typeof image === 'string' ? <img alt="" src={image} /> : image}
      </div>
      <div className="shop-title">{title}</div>
      {subtitle === undefined ? null : <div className="shop-subtitle">{subtitle}</div>}
      {children}
      <div className="shop-foot">
        {price === undefined ? null : <CoinCount value={price} size="sm" className="shop-price" />}
        {owned ? (
          <Button variant="ghost" disabled {...buyProps}>
            {ownedLabel}
          </Button>
        ) : isLocked ? (
          <Button disabled {...buyProps}>
            {locked}
          </Button>
        ) : (
          <Button onClick={onBuy} {...buyProps}>
            {buyLabel}
          </Button>
        )}
      </div>
    </article>
  );
}
