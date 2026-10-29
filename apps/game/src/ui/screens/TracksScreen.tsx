import { useEffect, useRef } from 'react';
import { Button, CardGrid, Heading, Row, Screen, TrackCard, TrackMeta, type TrackClimate, type TrackMetaItem } from '@politikart/ui';

import { CLIMATES } from '../../engine/climate.js';
import { TRACKS } from '../../engine/data.js';
import { THUMB_H, THUMB_W, thumbFrame, trackMeta } from '../../engine/thumbs.js';
import { fmtTime } from '../../engine/util.js';
import { actions, statsOf, type TrackThumb, type UiSnapshot } from '../store';
import type { Track } from '../types';

/** One glyph per climate (climate.js CLIMATES), named after the preset. */
const CLIMATE_ICONS: Record<string, string> = { dawn: '🌅', noon: '☀️', golden: '🌇', dusk: '🌆', night: '🌙', overcast: '🌧️' };
const fr1 = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/**
 * A circuit's preview: its rendered bird's-eye thumbnail once it is ready
 * (engine/thumbs.js), until then its outline -- the road at its width, the
 * start in gold -- drawn in the same frame the thumbnail's camera uses, so
 * the picture lands where the outline was. A canvas either way (the E2E
 * suite counts them), drawn in an effect.
 */
function TrackPreview({ track, thumb, live }: { track: Track & { id: string; ground?: number }; thumb: TrackThumb | undefined; live: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const canvas = thumb?.state === 'ready' ? thumb.canvas : null;
  useEffect(() => {
    const cv = ref.current;
    if (cv === null || !live) return;
    const c = cv.getContext('2d');
    if (c === null) return;
    c.clearRect(0, 0, cv.width, cv.height);
    if (canvas) { c.drawImage(canvas, 0, 0, cv.width, cv.height); return; }
    const f = thumbFrame(track) as { pts: [number, number][]; start: [number, number]; hw: number };
    c.beginPath(); f.pts.forEach(([x, y], j) => { if (j) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath();
    c.lineJoin = 'round';
    c.strokeStyle = '#f6f1e4'; c.lineWidth = Math.max(5, f.hw * 2 + 3); c.stroke();
    c.strokeStyle = '#3a3b40'; c.lineWidth = Math.max(3, f.hw * 2); c.stroke();
    c.fillStyle = '#f2c14e'; c.beginPath(); c.arc(f.start[0], f.start[1], 5, 0, 7); c.fill();
  }, [track, canvas, live]);
  return <canvas ref={ref} width={THUMB_W} height={THUMB_H} />;
}

/** A circuit's figures, its layouts and its climates, with the player's best lap there when the account has one. */
function figures(track: Track & { id: string }, best: number | undefined): { items: TrackMetaItem[]; climates: TrackClimate[]; layouts: readonly string[] } {
  const m = trackMeta(track) as { length: number; climb: number; width: number; laps: number; layouts: readonly string[]; climates: readonly string[] };
  const items: TrackMetaItem[] = [
    { key: 'length', label: 'Longueur', value: fr1(m.length / 1000) + ' km' },
    { key: 'climb', label: 'Dénivelé', value: m.climb < 0.5 ? 'plat' : Math.round(m.climb) + ' m' },
    { key: 'width', label: 'Largeur', value: Math.round(m.width) + ' m' },
    { key: 'laps', label: 'Tours', value: String(m.laps) },
  ];
  if (best !== undefined && Number.isFinite(best)) items.push({ key: 'best', label: 'Meilleur tour', value: fmtTime(best), tone: 'best' });
  const climates = m.climates.map(id => ({ id, icon: CLIMATE_ICONS[id] ?? '☀️', label: (CLIMATES as Record<string, { name: string }>)[id]?.name ?? id }));
  return { items, climates, layouts: m.layouts };
}

/**
 * The five circuits as cards; the chosen one carries the gold ring. Each
 * shows its thumbnail (outline first), its description and its figures.
 * Off screen the cards stay mounted but draw and measure nothing: the
 * figures are worked out while the roster shows (thumbs.js warmFigures).
 */
export function TracksScreen({ ui }: { ui: UiSnapshot }) {
  const tracks = TRACKS as unknown as (Track & { id: string })[];
  const live = ui.state === 'tracks';
  const best = live ? statsOf(ui.account?.profile.stats).bestLap : {};
  return (
    <Screen id="s-tracks" hidden={!live}>
      <Heading size="screenWide">Choisissez le circuit</Heading>
      <CardGrid id="trackcards">
        {tracks.map((t, i) => {
          const thumb = ui.trackThumbs[t.id];
          const f = live ? figures(t, best[t.id]) : null;
          return (
            <TrackCard
              key={t.name}
              id={'track-card-' + t.id}
              name={t.name}
              description={t.desc}
              preview={<TrackPreview track={t} thumb={thumb} live={live} />}
              thumb={thumb?.state ?? 'pending'}
              meta={f ? <TrackMeta items={f.items} layouts={f.layouts} layoutsLabel="Tracés" climates={f.climates} climatesLabel="Climats" /> : undefined}
              selected={i === ui.trackIdx}
              onClick={() => actions.selectTrack(i)}
            />
          );
        })}
      </CardGrid>
      <Row>
        <Button id="b-back2" variant="ghost" onClick={actions.toSelect}>Retour</Button>
        <Button id="b-start" onClick={actions.start}>Lancer la course !</Button>
      </Row>
    </Screen>
  );
}
