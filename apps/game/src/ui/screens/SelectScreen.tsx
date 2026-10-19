import { useEffect } from 'react';
import {
  Button,
  CharacterTile,
  Heading,
  PowerBox,
  Roster,
  Row,
  Screen,
  SelectLayout,
  Showcase,
  StatBar,
  StatGrid,
} from '@kart-republique/ui';

import { initAudio } from '../../engine/audio.js';
import { CHARACTERS } from '../../engine/data.js';
import { unlockLevel } from '../../engine/progress.js';
import { setPreviewFrame } from '../../engine/preview.js';
import { actions, unlockedOf, type UiSnapshot } from '../store';
import { useTouchMode } from '../TouchControls';
import type { Character } from '../types';

const STATS = [
  ['speed', 'Vitesse'],
  ['accel', 'Accélération'],
  ['handling', 'Tenue de route'],
] as const;

/** Stats run from 0.6 to 1.2 in the data; the bar shows that span as 0 to 100 %. */
const fraction = (stat: number) => (stat - 0.6) / 0.6;

/** The roster of candidates and the showcase of the chosen one. */
/**
 * Where the turntable kart goes on a small screen: the showcase's free band
 * above the candidate's name (engine/preview.js draws it there).
 */
function showcaseBand() {
  const sc = document.getElementById('showcase'); const big = sc?.querySelector('.big');
  if (!sc || !big) return null;
  const a = sc.getBoundingClientRect(), b = big.getBoundingClientRect();
  return { x: a.left, y: a.top, w: a.width, h: b.top - a.top - 6 };
}

export function SelectScreen({ ui }: { ui: UiSnapshot }) {
  const touch = useTouchMode();
  useEffect(() => { setPreviewFrame(showcaseBand); return () => setPreviewFrame(null); }, []);
  const characters = CHARACTERS as unknown as Character[];
  const chosen = characters[ui.charIdx] ?? characters[0]!;
  const unlocked = unlockedOf(ui);
  return (
    <Screen id="s-select" hidden={ui.state !== 'select'}>
      <Heading size="screen">Choisissez votre candidat·e</Heading>
      <SelectLayout>
        <Roster id="roster">
          {characters.map((c, i) => {
            const locked = !unlocked.includes(c.id);
            const lock = ui.account ? 'Niveau ' + unlockLevel(c.id) : 'Compte requis';
            return (
              <CharacterTile
                key={c.id}
                name={c.name}
                image={ui.thumbs[c.id]}
                selected={i === ui.charIdx}
                className={locked ? 'locked' : undefined}
                disabled={locked}
                data-lock={locked ? '🔒 ' + lock : undefined}
                title={locked ? (ui.account ? 'Débloqué au niveau ' + unlockLevel(c.id) : 'Créez un compte et montez de niveau pour le débloquer') : undefined}
                onClick={() => { initAudio(); actions.selectChar(i); }}
              />
            );
          })}
        </Roster>
        <Showcase id="showcase" name={chosen.name} title={chosen.title} quote={chosen.quote}>
          <StatGrid>
            {STATS.map(([key, label]) => (
              <StatBar key={key} label={label} value={fraction(chosen.stats[key])} />
            ))}
          </StatGrid>
          <PowerBox name={'Pouvoir : ' + chosen.power.name} hint={touch ? '(bouton ★)' : '(touche F)'}>{chosen.power.desc}</PowerBox>
        </Showcase>
      </SelectLayout>
      <Row>
        <Button id="b-back1" variant="ghost" onClick={actions.toTitle}>Retour</Button>
        <Button id="b-next1" onClick={actions.toTracks}>Choisir le circuit →</Button>
      </Row>
    </Screen>
  );
}
