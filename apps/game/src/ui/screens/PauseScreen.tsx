import { Button, Heading, KartCard, Panel, Row, Screen } from '@politikart/ui';

import { CHARACTERS } from '../../engine/data.js';
import { charGrade, GRADE_LABELS, kartCardOf } from '../kartChoices';
import { actions, type UiSnapshot } from '../store';
import type { Character } from '../types';

const COLUMN = { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' } as const;

/**
 * The card of the kart this screen drives: the candidate with their grade,
 * every catalogue part fitted and the trail (DEC-036), with the roster
 * portrait when it was rendered. Read from the snapshot's race kart, which
 * the store captures when a grid is built (solo or team); nothing before the
 * first race.
 */
export function RaceKartCard({ ui, id }: { ui: UiSnapshot; id: string }) {
  const kart = ui.raceKart;
  const char = kart ? (CHARACTERS as unknown as Character[]).find(c => c.id === kart.charId) : undefined;
  if (!kart || !char) return null;
  const { parts, trail } = kartCardOf(char, kart.style);
  const grade = charGrade(char.id);
  return <KartCard id={id} name={char.name} title={char.title} grade={grade} gradeLabel={GRADE_LABELS[grade]} parts={parts} trail={trail} image={ui.thumbs[char.id]} />;
}

/** The pause menu, over the frozen race, with the kart card. */
export function PauseScreen({ ui }: { ui: UiSnapshot }) {
  return (
    <Screen id="s-pause" hidden={ui.state !== 'paused'}>
      <Panel style={COLUMN}>
        <Heading>Suspension de séance</Heading>
        <RaceKartCard ui={ui} id="pause-kart" />
        <Row>
          <Button id="b-resume" onClick={actions.resume}>Reprendre</Button>
          <Button id="b-quit" variant="ghost" onClick={actions.toTitle}>Quitter la course</Button>
        </Row>
      </Panel>
    </Screen>
  );
}
