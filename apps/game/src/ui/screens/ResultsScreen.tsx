import {
  Button, Disclaimer, GainBreakdown, Heading, Panel, Podium, ResultsTable, Row, Screen, Subtitle, TeamStandings,
  type GainLine, type PodiumEntry, type ResultsRow,
} from '@politikart/ui';

import { DAILY_COINS } from '../../engine/catalog.js';
import { CHARACTERS } from '../../engine/data.js';
import { G } from '../../engine/state.js';
import { TEAM_NAMES } from '../../engine/teams.js';
import { fmtTime, ordinal } from '../../engine/util.js';
import { actions, type Gain, type NetResults, type UiSnapshot } from '../store';
import type { Character, Racer } from '../types';
import { RaceKartCard } from './PauseScreen';

const COLUMN = { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' } as const;

const VERDICTS = [
  'Majorité absolue ! Vous gouvernez seul·e.',
  'Second tour obligatoire, mais c’est bien parti.',
  'Sur le podium : un poste de ministre vous attend.',
  'Coalition nécessaire. Négociations en cours.',
  'Score en demi-teinte. Les sondages pardonnent peu.',
  'Dernière place : retour à la base, pour écouter le pays.',
];

const fr = (n: number) => n.toLocaleString('fr-FR');
const TEAM_COLOR: Record<string, string> = { bleu: 'var(--blue)', rouge: 'var(--red)' };

/**
 * What the race earned the account, as a breakdown that counts up:
 * experience, politicoins, the daily and level-up bonuses (economy.js
 * settleRace), then a new level and new candidates as notes. Guests see an
 * invitation to sign up, and nothing about coins.
 */
export function XpLine({ ui }: { ui: UiSnapshot }) {
  const g: Gain | null = ui.lastGain;
  if (!ui.account) return ui.netAvailable ? <Disclaimer id="r-xp">Créez un compte pour gagner de l’expérience et débloquer des candidat·es.</Disclaimer> : null;
  if (!g) return <Disclaimer id="r-xp">{'Niveau ' + ui.account.profile.level}</Disclaimer>;
  const chars = CHARACTERS as unknown as Character[];
  const names = g.unlockedNow.map(id => chars.find(c => c.id === id)?.name ?? id);
  const lines: GainLine[] = [{ key: 'xp', label: 'XP', value: g.gained, tone: 'xp' }];
  if (g.coins > 0) lines.push({ key: 'coins', label: 'politicoins', value: g.coins, tone: 'coin' });
  if (g.daily) lines.push({ key: 'daily', label: 'bonus du jour', value: DAILY_COINS, tone: 'bonus' });
  if (g.levelUpCoins > 0) lines.push({ key: 'level', label: 'politicoins (niveau ' + g.level + ')', value: g.levelUpCoins, tone: 'bonus' });
  const notes = [...(g.levelUp ? ['Niveau ' + g.level + ' atteint !'] : []), ...(names.length ? ['Débloqué : ' + names.join(', ')] : [])];
  return <GainBreakdown id="r-xp" lines={lines} notes={notes} format={fr} />;
}

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
  if (ui.netResults) return <TeamResults ui={ui} results={ui.netResults} />;
  const live = ui.state === 'results';
  const karts = (live ? (G.karts as unknown as Racer[]) : []);
  const player = live ? (G.player as unknown as Racer) : null;
  const order = [...karts].sort((a, b) => a.rank - b.rank);
  const podium: PodiumEntry[] = order.slice(0, 3).map(k => ({
    key: k.def.id, name: k.def.name, detail: k.def.title, portrait: ui.thumbs[k.def.id], value: k.finished ? fmtTime(k.finishTime) : 'en course…', you: k === player,
  }));
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
        {podium.length ? <Podium id="r-podium" entries={podium} placeLabel={ordinal} /> : null}
        <XpLine ui={ui} />
        <RaceKartCard ui={ui} id="r-kart" />
        <ResultsTable rows={rows} columns={['', 'Candidat·e', 'Temps']} bodyProps={{ id: 'r-body' }} />
        <Row>
          <Button id="b-again" onClick={actions.start}>Rejouer</Button>
          <Button id="b-menu" variant="ghost" onClick={actions.toTitle}>Menu</Button>
        </Row>
      </Panel>
    </Screen>
  );
}

/** A team race's results, as the server scored them: places, points, and the teams' totals. */
function TeamResults({ ui, results }: { ui: UiSnapshot; results: NetResults }) {
  const live = ui.state === 'results';
  const chars = CHARACTERS as unknown as Character[];
  const rows: ResultsRow[] = results.ranking.map(r => {
    const c = chars.find(x => x.id === r.charId);
    return {
      id: r.slot,
      rank: ordinal(r.rank + 1),
      name: r.isAI ? (c?.name ?? r.name) : r.name + (r.god ? ' (dieu)' : ''),
      detail: r.isAI ? 'IA' : (c?.name ?? '') + (r.team ? ' · ' + TEAM_NAMES[r.team] : r.god ? ' · hors classement' : ''),
      time: (r.time !== null ? fmtTime(r.time) : 'en course…') + (r.points ? '  +' + r.points : ''),
      highlighted: r.slot === results.you,
    };
  });
  const mine = results.ranking.find(r => r.slot === results.you)?.team ?? null;
  const podium: PodiumEntry[] = results.ranking.slice(0, 3).map(r => {
    const c = chars.find(x => x.id === r.charId);
    return {
      key: r.slot, name: r.isAI ? (c?.name ?? r.name) : r.name, portrait: ui.thumbs[r.charId],
      detail: r.isAI ? 'IA' : (c?.name ?? '') + (r.team ? ' · ' + TEAM_NAMES[r.team] : ''), value: r.time !== null ? fmtTime(r.time) : 'en course…', you: r.slot === results.you,
    };
  });
  const [first, second] = results.teams;
  const verdict = results.error ? 'La course a été interrompue.'
    : !first ? 'Aucune équipe classée.'
    : second && first.points === second.points && first.drivers.length && second.drivers.length ? 'Égalité aux points : départagée au meilleur classement. Victoire ' + first.name + ' !'
    : 'Victoire de l’équipe ' + first.name + ' !';
  return (
    <Screen id="s-results" hidden={!live}>
      <Panel style={COLUMN}>
        <Heading id="r-title">Résultats du scrutin</Heading>
        <Subtitle id="r-sub" style={{ fontSize: 16 }}>{verdict}</Subtitle>
        {podium.length ? <Podium id="r-podium" entries={podium} placeLabel={ordinal} /> : null}
        <TeamStandings
          bodyProps={{ id: 'r-teams' }}
          rankLabel={ordinal}
          pointsLabel={p => p + ' pts'}
          teams={results.teams.map(t => ({ key: t.team, name: 'Équipe ' + t.name, points: t.points, detail: t.drivers.length + ' pilote' + (t.drivers.length > 1 ? 's' : ''), color: TEAM_COLOR[t.team], you: t.team === mine }))}
        />
        <XpLine ui={ui} />
        <RaceKartCard ui={ui} id="r-kart" />
        <ResultsTable rows={rows} columns={['', 'Pilote', 'Temps · points']} bodyProps={{ id: 'r-body' }} />
        <Row>
          <Button id="b-again" onClick={actions.backToLobby}>Retour au salon</Button>
          <Button id="b-menu" variant="ghost" onClick={actions.lobbyBack}>Menu</Button>
        </Row>
      </Panel>
    </Screen>
  );
}
