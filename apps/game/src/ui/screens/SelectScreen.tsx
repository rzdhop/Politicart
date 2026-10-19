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
import { actions, type UiSnapshot } from '../store';
import type { Character } from '../types';

const STATS = [
  ['speed', 'Vitesse'],
  ['accel', 'Accélération'],
  ['handling', 'Tenue de route'],
] as const;

/** Stats run from 0.6 to 1.2 in the data; the bar shows that span as 0 to 100 %. */
const fraction = (stat: number) => (stat - 0.6) / 0.6;

/** The roster of eleven candidates and the showcase of the chosen one. */
export function SelectScreen({ ui }: { ui: UiSnapshot }) {
  const characters = CHARACTERS as unknown as Character[];
  const chosen = characters[ui.charIdx] ?? characters[0]!;
  return (
    <Screen id="s-select" hidden={ui.state !== 'select'}>
      <Heading size="screen">Choisissez votre candidat·e</Heading>
      <SelectLayout>
        <Roster id="roster">
          {characters.map((c, i) => (
            <CharacterTile
              key={c.id}
              name={c.name}
              image={ui.thumbs[c.id]}
              selected={i === ui.charIdx}
              onClick={() => { initAudio(); actions.selectChar(i); }}
            />
          ))}
        </Roster>
        <Showcase id="showcase" name={chosen.name} title={chosen.title} quote={chosen.quote}>
          <StatGrid>
            {STATS.map(([key, label]) => (
              <StatBar key={key} label={label} value={fraction(chosen.stats[key])} />
            ))}
          </StatGrid>
          <PowerBox name={'Pouvoir : ' + chosen.power.name} hint="(touche F)">{chosen.power.desc}</PowerBox>
        </Showcase>
      </SelectLayout>
      <Row>
        <Button id="b-back1" variant="ghost" onClick={actions.toTitle}>Retour</Button>
        <Button id="b-garage" variant="ghost" onClick={actions.openGarage}>Garage</Button>
        <Button id="b-next1" onClick={actions.toTracks}>Choisir le circuit →</Button>
      </Row>
    </Screen>
  );
}
