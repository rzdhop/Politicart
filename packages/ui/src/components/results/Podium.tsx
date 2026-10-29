import type { ComponentPropsWithRef, Key, ReactNode } from 'react';

import { cx } from '../../cx';

/** One of the three on the podium. */
export interface PodiumEntry {
  /** React key; the place is used without one. */
  key?: Key;
  /** Their name, in display type. */
  name: ReactNode;
  /** A muted line under the name: the candidate, the team. */
  detail?: ReactNode;
  /** Their portrait, as an image URL. */
  portrait?: string;
  /** What they did: their time, their points. */
  value?: ReactNode;
  /** The viewer: their step is ringed gold. */
  you?: boolean;
}

export interface PodiumProps extends Omit<ComponentPropsWithRef<'ol'>, 'children'> {
  /** The first three, in finishing order (one or two is fine). */
  entries: readonly PodiumEntry[];
  /** How a place is written on its step. Defaults to "1", "2", "3"; the game passes "1er", "2e". */
  placeLabel?: (place: number) => ReactNode;
}

/**
 * The race's top three on a podium: each with their portrait over their
 * step, the winner in the middle on the tallest one, second on the left,
 * third on the right; their name, a detail line and their time under it.
 *
 * An ordered list in finishing order, so a screen reader reads first,
 * second, third; the stylesheet puts them in podium order. The steps rise
 * in one after the other (fx.css), third first and the winner last; they
 * stand still under reduced motion.
 *
 * ```tsx
 * <Podium placeLabel={ordinal} entries={[
 *   { name: 'Emmanuel Macaron', detail: 'Le jeune président', portrait: thumbs.victor, value: '2:14.07', you: true },
 *   { name: 'Philippe Martini', portrait: thumbs.gege, value: '2:15.80' },
 *   { name: 'Sandrine Ruisseau', portrait: thumbs.capucine, value: '2:16.02' },
 * ]} />
 * ```
 */
export function Podium({ entries, placeLabel = (p) => String(p), className, ...rest }: PodiumProps) {
  return (
    <ol className={cx('podium', className)} {...rest}>
      {entries.slice(0, 3).map((e, i) => (
        <li key={e.key ?? i} className={cx('podium-place', e.you && 'you')} data-place={i + 1}>
          <span className="pd-portrait">{e.portrait ? <img alt="" src={e.portrait} /> : null}</span>
          <span className="pd-name">{e.name}</span>
          {e.detail === undefined ? null : <span className="pd-detail">{e.detail}</span>}
          {e.value === undefined ? null : <span className="pd-value">{e.value}</span>}
          <span className="pd-step">{placeLabel(i + 1)}</span>
        </li>
      ))}
    </ol>
  );
}
