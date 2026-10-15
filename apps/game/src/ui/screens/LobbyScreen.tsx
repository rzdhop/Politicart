import { useState } from 'react';

import {
  AdminGrid,
  Button,
  Disclaimer,
  Field,
  Heading,
  Panel,
  ResultsTable,
  Row,
  Screen,
  Subtitle,
  TextInput,
  type ResultsRow,
} from '@kart-republique/ui';

import { CHARACTERS, TRACKS } from '../../engine/data.js';
import { TEAM_NAMES } from '../../engine/teams.js';
import { actions, type RoomView, type TeamId, type UiSnapshot } from '../store';
import type { Character, Track } from '../types';

const COLUMN = { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' } as const;
const CHARS = CHARACTERS as unknown as Character[];
const TRACK_LIST = TRACKS as unknown as Track[];
const TEAM_IDS: TeamId[] = ['bleu', 'rouge'];

const STATUS = {
  idle: 'Hors ligne',
  connecting: 'Connexion au serveur…',
  open: 'Connecté au serveur',
  closed: 'Déconnecté',
} as const;

/** The next candidate after `from`, stepping by `dir`, that nobody else drives. */
function nextFreeChar(room: RoomView, me: string, from: string, dir: 1 | -1): string {
  const taken = new Set(room.players.filter(p => p.id !== me).map(p => p.charId));
  const at = CHARS.findIndex(c => c.id === from);
  for (let n = 1; n <= CHARS.length; n++) {
    const c = CHARS[(at + dir * n + CHARS.length * 2) % CHARS.length];
    if (c && !taken.has(c.id)) return c.id;
  }
  return from;
}

/** Name, then create a room or join one by its code. */
function JoinPanel({ ui }: { ui: UiSnapshot }) {
  const [code, setCode] = useState('');
  const open = ui.net.status === 'open';
  return (
    <>
      <AdminGrid style={{ width: 'min(520px, 100%)' }}>
        <Field label="Votre nom">
          <TextInput id="lobby-name" maxLength={16} value={ui.netName} placeholder="Député·e" onChange={e => actions.setNetName(e.target.value)} />
        </Field>
        <Field label="Code de la salle">
          <TextInput id="lobby-code" maxLength={4} value={code} placeholder="ABCD" onChange={e => setCode(e.target.value.toUpperCase())} />
        </Field>
      </AdminGrid>
      <Row>
        <Button id="b-mp-create" disabled={!open} onClick={actions.createRoom}>Créer une salle</Button>
        <Button id="b-mp-join" disabled={!open || code.trim().length !== 4} onClick={() => actions.joinRoom(code)}>Rejoindre</Button>
        <Button id="b-mp-back" variant="ghost" onClick={actions.lobbyBack}>Retour</Button>
      </Row>
    </>
  );
}

/** Inside a room: the players, my team and candidate, the circuit, ready and start. */
function RoomPanel({ ui, room }: { ui: UiSnapshot; room: RoomView }) {
  const me = room.players.find(p => p.id === ui.net.id);
  const isHost = room.host === ui.net.id;
  const others = room.players.filter(p => p.id !== room.host);
  const canStart = isHost && others.every(p => p.ready);
  const rows: ResultsRow[] = room.players.map(p => {
    const c = CHARS.find(x => x.id === p.charId);
    return {
      id: p.id,
      rank: TEAM_NAMES[p.team],
      name: p.name + (p.id === room.host ? ' (hôte)' : ''),
      detail: c?.name,
      time: p.id === room.host ? 'hôte' : p.ready ? 'prêt·e' : '…',
      highlighted: p.id === ui.net.id,
    };
  });
  const myChar = me ? CHARS.find(c => c.id === me.charId) : undefined;
  return (
    <>
      <Subtitle id="lobby-room" style={{ fontSize: 18 }}>{'Salle ' + room.code + ' · donnez ce code à vos ami·es'}</Subtitle>
      <ResultsTable rows={rows} columns={['Équipe', 'Joueur·se', 'État']} bodyProps={{ id: 'lobby-players' }} />
      {me && (
        <Row>
          {TEAM_IDS.map(t => (
            <Button key={t} id={'b-mp-team-' + t} variant={me.team === t ? 'primary' : 'ghost'} aria-pressed={me.team === t} onClick={() => actions.setTeam(t)}>
              {'Équipe ' + TEAM_NAMES[t]}
            </Button>
          ))}
          <Button id="b-mp-char-prev" variant="ghost" aria-label="Candidat précédent" onClick={() => actions.setChar(nextFreeChar(room, me.id, me.charId, -1))}>◀</Button>
          <span id="lobby-char" style={{ minWidth: 160, textAlign: 'center' }}>{myChar?.name}</span>
          <Button id="b-mp-char-next" variant="ghost" aria-label="Candidat suivant" onClick={() => actions.setChar(nextFreeChar(room, me.id, me.charId, 1))}>▶</Button>
        </Row>
      )}
      <Row>
        {TRACK_LIST.map((t, i) => (
          <Button key={t.name} id={'b-mp-track-' + i} variant={room.trackIdx === i ? 'primary' : 'ghost'} aria-pressed={room.trackIdx === i} disabled={!isHost} onClick={() => actions.pickTrack(i)}>
            {t.name.split(' — ')[0]}
          </Button>
        ))}
      </Row>
      <Row>
        {isHost
          ? <Button id="b-mp-start" disabled={!canStart} onClick={actions.startNetRace}>{canStart ? 'Lancer la course' : 'En attente des joueur·ses…'}</Button>
          : <Button id="b-mp-ready" variant={me?.ready ? 'primary' : 'ghost'} aria-pressed={!!me?.ready} onClick={() => actions.setReady(!me?.ready)}>{me?.ready ? 'Prêt·e !' : 'Je suis prêt·e'}</Button>}
        <Button id="b-mp-leave" variant="ghost" onClick={actions.leaveRoom}>Quitter la salle</Button>
      </Row>
    </>
  );
}

/** The team race's waiting room. Shown only when the page is served by the game server. */
export function LobbyScreen({ ui }: { ui: UiSnapshot }) {
  const room = ui.net.room;
  return (
    <Screen id="s-lobby" hidden={ui.state !== 'lobby'}>
      <Panel style={COLUMN}>
        <Heading>Course en équipe</Heading>
        <Disclaimer id="lobby-status">{STATUS[ui.net.status]}</Disclaimer>
        {room ? <RoomPanel ui={ui} room={room} /> : <JoinPanel ui={ui} />}
        <Disclaimer id="lobby-error" role="status" style={{ color: 'var(--red)', minHeight: '1.2em' }}>{ui.net.error ?? ''}</Disclaimer>
        <Disclaimer>
          Bleu contre Rouge : chaque arrivée rapporte des points (10, 8, 6, 4, 2, 1) à son équipe. Vos objets épargnent vos coéquipier·es. L’IA complète la grille.
        </Disclaimer>
      </Panel>
    </Screen>
  );
}
