import type { ComponentPropsWithRef, Key, ReactNode } from 'react';

import { cx } from '../../cx';
import { type Grade, GradeBadge } from './GradeBadge';

export interface KartPart {
  /** React key. Falls back to the part's index when omitted. */
  id?: Key;
  /** The part's category, muted: "Roues". */
  label: ReactNode;
  /** The option fitted, bold: "Dorées". */
  value: ReactNode;
  /** The option's grade, shown as a small coloured dot. */
  grade: Grade;
}

export interface KartTrail {
  /** The trail's name. */
  label: ReactNode;
  /** The trail's grade, shown as a small coloured dot. */
  grade: Grade;
}

export interface KartCardProps extends Omit<ComponentPropsWithRef<'div'>, 'title'> {
  /** The candidate driving the kart. */
  name: ReactNode;
  /** A gold uppercase line under the name: the candidate's epithet. */
  title?: ReactNode;
  /** The candidate's own grade, as the badge beside the name and the card's `grade-<g>` treatment. */
  grade: Grade;
  /** The grade badge's text; defaults to the grade id capitalised. */
  gradeLabel?: ReactNode;
  /** The parts fitted, in display order, each with its grade. */
  parts: readonly KartPart[];
  /** The trail behind the kart. `null` or omitted draws no trail line. */
  trail?: KartTrail | null;
  /** A thumbnail of the kart, as an image URL. */
  image?: string;
  /** Anything else to show under the trail line. */
  children?: ReactNode;
}

/**
 * A compact card describing one kart: who drives it, what is fitted, what
 * trails behind it.
 *
 * The name sits beside the candidate's grade badge; the parts are chips with
 * a grade dot each, so a glance tells which part is the rare one; the trail
 * gets its own line under a hairline. The game shows it on the pause and
 * results screens, and the lobby could.
 *
 * ```tsx
 * <KartCard
 *   name="Gégé Marteau"
 *   title="Le syndicaliste"
 *   grade="common"
 *   parts={[
 *     { label: 'Roues', value: 'Dorées', grade: 'mythic' },
 *     { label: 'Aileron', value: 'Grand aileron', grade: 'rare' },
 *   ]}
 *   trail={{ label: 'Ruban tricolore', grade: 'rare' }}
 * />
 * ```
 */
export function KartCard({
  name,
  title,
  grade,
  gradeLabel,
  parts,
  trail,
  image,
  children,
  className,
  ...rest
}: KartCardProps) {
  return (
    <div className={cx('card', 'kart-card', `grade-${grade}`, className)} data-grade={grade} {...rest}>
      <div className="kart-head">
        <div className="name">{name}</div>
        <GradeBadge grade={grade} label={gradeLabel} size="sm" />
      </div>
      {title === undefined ? null : <div className="kart-title">{title}</div>}
      {image === undefined ? null : (
        <div className="kart-image">
          <img alt="" src={image} />
        </div>
      )}
      <ul className="kart-parts">
        {parts.map((part, index) => (
          <li key={part.id ?? index} className="kart-part" data-grade={part.grade}>
            <i className={`grade-dot grade-${part.grade}`} aria-hidden="true" />
            <span className="kart-part-label">{part.label}</span>
            <span className="kart-part-value">{part.value}</span>
          </li>
        ))}
      </ul>
      {trail === undefined || trail === null ? null : (
        <div className="kart-trail" data-grade={trail.grade}>
          <i className={`grade-dot grade-${trail.grade}`} aria-hidden="true" />
          <span className="kart-trail-label">{trail.label}</span>
        </div>
      )}
      {children}
    </div>
  );
}
