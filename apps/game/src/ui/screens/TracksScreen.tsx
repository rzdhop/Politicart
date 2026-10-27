import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Button, CardGrid, Heading, Row, Screen, TrackCard } from '@kart-republique/ui';

import { TRACKS } from '../../engine/data.js';
import { actions, type UiSnapshot } from '../store';
import type { Track } from '../types';

/**
 * A circuit's outline, drawn once into the card's canvas from the same
 * spline the engine races on. Drawn in an effect because it is a canvas,
 * not markup; the card stays a plain button around it.
 */
function TrackPreview({ points }: { points: [number, number][] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (cv === null) return;
    const c = cv.getContext('2d');
    if (c === null) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    points.forEach(p => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); });
    const sc = Math.min(200 / (maxX - minX), 110 / (maxZ - minZ)); const ox = 120 - (minX + maxX) / 2 * sc, oz = 75 + (minZ + maxZ) / 2 * sc;
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], 0, p[1])), true, 'catmullrom', 0.5); const sp = curve.getPoints(200);
    c.clearRect(0, 0, cv.width, cv.height);
    c.beginPath(); sp.forEach((p, j) => { const x = p.x * sc + ox, y = oz - p.z * sc; j ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.lineJoin = 'round'; c.strokeStyle = '#f6f1e4'; c.lineWidth = 9; c.stroke(); c.strokeStyle = '#3a3b40'; c.lineWidth = 5; c.stroke();
    c.fillStyle = '#f2c14e'; c.beginPath(); c.arc(points[0]![0] * sc + ox, oz - points[0]![1] * sc, 5, 0, 7); c.fill();
  }, [points]);
  return <canvas ref={ref} width={240} height={150} />;
}

/** The five circuits as cards; the chosen one carries the gold ring. */
export function TracksScreen({ ui }: { ui: UiSnapshot }) {
  const tracks = TRACKS as unknown as Track[];
  return (
    <Screen id="s-tracks" hidden={ui.state !== 'tracks'}>
      <Heading size="screenWide">Choisissez le circuit</Heading>
      <CardGrid id="trackcards">
        {tracks.map((t, i) => (
          <TrackCard
            key={t.name}
            name={t.name}
            description={t.desc}
            preview={<TrackPreview points={t.points} />}
            selected={i === ui.trackIdx}
            onClick={() => actions.selectTrack(i)}
          />
        ))}
      </CardGrid>
      <Row>
        <Button id="b-back2" variant="ghost" onClick={actions.toSelect}>Retour</Button>
        <Button id="b-start" onClick={actions.start}>Lancer la course !</Button>
      </Row>
    </Screen>
  );
}
