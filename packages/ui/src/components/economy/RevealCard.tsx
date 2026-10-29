import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';
import { type Grade, GradeBadge, type GradeBadgeProps } from './GradeBadge';

/** What a Politibox can hold: a candidate, a kart part, a trail, or politicoins. */
export type DropKind = 'char' | 'part' | 'trail' | 'coins';

/**
 * The glyph of a drop kind, in `currentColor`: a rosette for a candidate, a
 * wheel for a part, a comet for a trail, a stack of coins for politicoins.
 * Decorative: the text beside it carries the meaning.
 */
export function KindGlyph({ kind, className }: { kind: DropKind; className?: string }) {
  const shapes: Record<DropKind, ReactNode> = {
    char: (
      <>
        <circle cx="32" cy="24" r="14" fill="none" stroke="currentColor" strokeWidth="5" />
        <circle cx="32" cy="24" r="5" fill="currentColor" />
        <path d="M22 36l-6 22 16-9 16 9-6-22" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      </>
    ),
    part: (
      <>
        <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="8" />
        <circle cx="32" cy="32" r="6" fill="currentColor" />
        <path d="M32 14v10M32 40v10M14 32h10M40 32h10" stroke="currentColor" strokeWidth="5" />
      </>
    ),
    trail: (
      <>
        <circle cx="46" cy="18" r="9" fill="currentColor" />
        <path d="M40 24C30 30 22 40 8 56" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M32 18c-8 2-14 8-20 16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".55" />
      </>
    ),
    coins: (
      <>
        <ellipse cx="32" cy="46" rx="20" ry="7" fill="none" stroke="currentColor" strokeWidth="5" />
        <ellipse cx="32" cy="36" rx="20" ry="7" fill="none" stroke="currentColor" strokeWidth="5" />
        <ellipse cx="32" cy="26" rx="20" ry="7" fill="currentColor" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={cx('kind-glyph', `kind-glyph-${kind}`, className)}>
      {shapes[kind]}
    </svg>
  );
}

export interface RevealCardProps extends ComponentPropsWithRef<'div'> {
  /** What was won: picks the glyph. */
  kind: DropKind;
  /** The one line that names the prize ("Candidat : Lucie Vasseur", "50 politicoins"). */
  name: ReactNode;
  /** The prize's grade: the badge and the card's `grade-<g>` treatment. */
  grade: Grade;
  /** The badge's text; defaults to the grade id capitalised. */
  gradeLabel?: ReactNode;
  /** A muted caption above the name ("La Politibox vous offre"). */
  caption?: ReactNode;
  /** The refund line of a duplicate, under the name; nothing when omitted. */
  refund?: ReactNode;
  /**
   * Props for the result block (the name and the refund line together), for
   * a consumer that must address it -- the game gives it the id its test
   * suite reads the prize from, as DEC-012 asks.
   */
  resultProps?: ComponentPropsWithRef<'div'>;
  /** Props for the grade badge, the same way. */
  badgeProps?: Omit<GradeBadgeProps, 'grade' | 'label'>;
  /** Props for the refund line, the same way. */
  refundProps?: ComponentPropsWithRef<'p'>;
  /** Below the badge: a coin total, the buttons, a history. */
  children?: ReactNode;
}

/**
 * The result card of a Politibox opening: the kind's glyph, a caption, the
 * prize's name (with a duplicate's refund line under it), its grade badge,
 * then whatever the consumer adds (the balance, the buttons).
 *
 * The card carries `grade-<g>` like a `ShopCard`, so from `rare` up it gets
 * the grade's motion (fx.css); the badge inside it pops in after the card
 * rises when shown inside a `RevealStage`. The glyph sits outside the
 * result block, so the block's text is exactly the name and the refund.
 *
 * ```tsx
 * <RevealCard kind="part" name="Pièce : Roues dorées" grade="mythic" gradeLabel="Mythique"
 *   caption="La Politibox vous offre" refund="Doublon : +400 politicoins remboursés">
 *   <Button>Encore une !</Button>
 * </RevealCard>
 * ```
 */
export function RevealCard({
  kind,
  name,
  grade,
  gradeLabel,
  caption,
  refund,
  resultProps,
  badgeProps,
  refundProps,
  children,
  className,
  ...rest
}: RevealCardProps) {
  return (
    <div
      className={cx('card', 'reveal-card', `reveal-card-${kind}`, `grade-${grade}`, className)}
      data-kind={kind}
      data-grade={grade}
      {...rest}
    >
      <span className="reveal-glyph" aria-hidden="true">
        <KindGlyph kind={kind} />
      </span>
      {caption === undefined ? null : <p className="reveal-caption">{caption}</p>}
      <div className="reveal-result" {...resultProps}>
        <h3 className="reveal-name">{name}</h3>
        {refund === undefined || refund === null ? null : (
          <p className="reveal-refund" {...refundProps}>
            {refund}
          </p>
        )}
      </div>
      <GradeBadge grade={grade} label={gradeLabel} {...badgeProps} />
      {children}
    </div>
  );
}
