import { Button, Heading, Panel, ResultsTable, Row, Screen, Subtitle, type ResultsRow } from '@kart-republique/ui';

import { G } from '../../engine/state.js';
import { fmtTime, ordinal } from '../../engine/util.js';
import { actions, type UiSnapshot } from '../store';
import type { Racer } from '../types';

const COLUMN = { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' } as const;

const VERDICTS = [
  'Majorité absolue ! Vous gouvernez seul·e.',
  'Second tour obligatoire, mais c’est bien parti.',
  'Sur le podium : un poste de ministre vous attend.',
  'Coalition nécessaire. Négociations en cours.',
  'Score en demi-teinte. Les sondages pardonnent peu.',
  'Dernière place : retour à la base, pour écouter le pays.',
];

function summary(player: Racer, field: number) {
  return ordinal(player.rank + 1) + ' sur ' + field + ' — ' + VERDICTS[player.rank]
    + (player.bestLap < Infinity ? '  ·  Meilleur tour : ' + fmtTime(player.bestLap) : '')
    + '  ·  Pouvoir utilisé ' + player.powerUses + '×';
}

/**
 * The results screen. Read from the engine's kart list at render time: the
 * list is stable once the machine is in 'results', and the screen renders
 * its table only then.
 */
export function ResultsScreen({ ui }: { ui: UiSnapshot }) {
  const live = ui.state === 'results';
  const karts = (live ? (G.karts as unknown as Racer[]) : []);
  const player = live ? (G.player as unknown as Racer) : null;
  const order = [...karts].sort((a, b) => a.rank - b.rank);
  const rows: ResultsRow[] = order.map((k) => ({
    id: k.def.id,
    rank: ordinal(k.rank + 1),
    name: k.def.name,
    detail: k.def.title,
    time: k.finished ? fmtTime(k.finishTime) : 'en course…',
    highlighted: k === player,
  }));
  return (
    <Screen id="s-results" hidden={!live}>
      <Panel style={COLUMN}>
        <Heading id="r-title">Résultats du scrutin</Heading>
        <Subtitle id="r-sub" style={{ fontSize: 16 }}>{player ? summary(player, karts.length) : ''}</Subtitle>
        <ResultsTable rows={rows} columns={['', 'Candidat·e', 'Temps']} bodyProps={{ id: 'r-body' }} />
        <Row>
          <Button id="b-again" onClick={actions.start}>Rejouer</Button>
          <Button id="b-menu" variant="ghost" onClick={actions.toTitle}>Menu</Button>
        </Row>
      </Panel>
    </Screen>
  );
}
