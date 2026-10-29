import type { ComponentPropsWithRef, Key, ReactNode } from 'react';

import { cx } from '../../cx';

/** One figure about a circuit: "Longueur · 2,9 km". */
export interface TrackMetaItem {
  /** React key; the index is used without one. */
  key?: Key;
  /** What the figure is, in small muted capitals. */
  label: ReactNode;
  /** The figure itself, in display type. */
  value: ReactNode;
  /** `best` draws the chip gold: the player's own record on this circuit. */
  tone?: 'best';
}

/** One climate the circuit can be raced in: its glyph and its name. */
export interface TrackClimate {
  id: string;
  /** One emoji. */
  icon: string;
  /** The climate's name, the glyph's accessible name and tooltip. */
  label: string;
}

export interface TrackMetaProps extends Omit<ComponentPropsWithRef<'span'>, 'children'> {
  /** The figures, in display order: length, climb, width, laps, best lap. */
  items: readonly TrackMetaItem[];
  /** The circuit's layout variants, by name; one is drawn per race. */
  layouts?: readonly ReactNode[];
  /** The caption before the layouts. Defaults to "Layouts"; the game passes its own. */
  layoutsLabel?: ReactNode;
  /** The climates the circuit allows, as glyphs. */
  climates?: readonly TrackClimate[];
  /** The climates' group name for assistive technology. Defaults to "Climates". */
  climatesLabel?: string;
}

/**
 * What a circuit is like, at a glance, under its card's preview: a row of
 * figure chips (length, climb, width, laps, the player's best lap in gold),
 * the names of its layout variants, and the glyphs of the climates it can
 * be raced in.
 *
 * Built from spans, with list roles, so it can sit inside a `TrackCard`,
 * which is a button. Static: nothing here moves.
 *
 * ```tsx
 * <TrackMeta
 *   items={[{ label: 'Longueur', value: '2,9 km' }, { label: 'Meilleur tour', value: '0:58.50', tone: 'best' }]}
 *   layouts={['Visite officielle', 'Jour de manif', 'Travaux du Faubourg']}
 *   layoutsLabel="Tracés"
 *   climates={[{ id: 'night', icon: '🌙', label: 'Nuit' }]}
 *   climatesLabel="Climats"
 * />
 * ```
 */
export function TrackMeta({
  items,
  layouts,
  layoutsLabel = 'Layouts',
  climates,
  climatesLabel = 'Climates',
  className,
  ...rest
}: TrackMetaProps) {
  return (
    <span className={cx('track-meta', className)} {...rest}>
      <span className="track-chips" role="list">
        {items.map((item, i) => (
          <span key={item.key ?? i} role="listitem" className={cx('track-chip', item.tone === 'best' && 'best')}>
            <span className="tc-label">{item.label}</span>
            <span className="tc-value">{item.value}</span>
          </span>
        ))}
      </span>
      {layouts && layouts.length ? (
        <span className="track-layouts">
          <span className="tl-label">{layoutsLabel}</span>
          <span className="tl-names" role="list">
            {layouts.map((name, i) => (
              <span key={i} role="listitem" className="tl-name">
                {name}
              </span>
            ))}
          </span>
        </span>
      ) : null}
      {climates && climates.length ? (
        <span className="track-climates" role="list" aria-label={climatesLabel}>
          {climates.map((c) => (
            <span key={c.id} role="listitem" className="track-climate" data-climate={c.id} title={c.label} aria-label={c.label}>
              {c.icon}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
