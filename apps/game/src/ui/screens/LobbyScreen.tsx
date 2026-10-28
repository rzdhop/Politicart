import { useState } from 'react';

import {
  AdminGrid,
  Button,
  Disclaimer,
  Field,
  GradeBadge,
  Heading,
  Panel,
  ResultsTable,
  Row,
  Screen,
  Subtitle,
  TextInput,
  type ResultsRow,
} from '@politikart/ui';

import { CHARACTERS, TRACKS } from '../../engine/data.js';
import { TEAM_NAMES } from '../../engine/teams.js';
import { charGrade, GRADE_LABELS, kartCardOf } from '../kartChoices';
import { actions, isAdmin, unlockedOf, type LobbyPlayer, type RoomView, type TeamId, type UiSnapshot } from '../store';
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

/** The next candidate after `from`, stepping by `dir`, that we have unlocked and nobody else drives. */
function nextFreeChar(room: RoomView, me: string, from: string, dir: 1 | -1, allowed: string[]): string {
  const taken = new Set(room.players.filter(p => p.id !== me).map(p => p.charId));
  const at = CHARS.findIndex(c => c.id === from);
  for (let n = 1; n <= CHARS.length; n++) {
    const c = CHARS[(at + dir * n + CHARS.length * 2) % CHARS.length];
    if (c && !taken.has(c.id) && allowed.includes(c.id)) return c.id;
  }
  return from;
}

/**
 * A player's second line: their candidate with its grade badge, and their
 * trail (DEC-036, A-032) as a named badge with its grade -- "—" for none --
 * under `#lobby-trail-<id>`, so every player sees who brings what.
 */
function PlayerDetail({ p, c }: { p: LobbyPlayer; c: Character | undefined }) {
  const trail = c ? kartCardOf(c, p.style ?? {}).trail : null;
  const grade = c ? charGrade(c.id) : 'common';
  return (
    <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        {c?.name}
        {c && <GradeBadge grade={grade} label={GRADE_LABELS[grade]} size="sm" />}
      </span>
      <span id={'lobby-trail-' + p.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} data-trail={p.style?.trail ?? 'none'}>
        {trail ? <>{trail.label}<GradeBadge grade={trail.grade} label={GRADE_LABELS[trail.grade]} size="sm" /></> : '—'}
      </span>
    </span>
  );
}

/** Name, then create a room or join one by its code. */
function JoinPanel({ ui }: { ui: UiSnapshot }) {
  const [code, setCode] = useState('');
  const open = ui.net.status === 'open';
  const acc = ui.account;
  return (
    <>
      <AdminGrid style={{ width: 'min(520px, 100%)' }}>
        <Field label={acc ? 'Votre compte' : 'Votre pseudo (invité·e)'}>
          {acc
            ? <TextInput id="lobby-name" value={acc.profile.name + ' · niveau ' + acc.profile.level} readOnly disabled />
            : <TextInput id="lobby-name" maxLength={16} value={ui.netName} placeholder="Député·e" onChange={e => actions.setNetName(e.target.value)} />}
        </Field>
        <Field label="Code de la salle">
          <TextInput id="lobby-code" maxLength={4} value={code} placeholder="ABCD" onChange={e => setCode(e.target.value.toUpperCase())} />
        </Field>
      </AdminGrid>
      {/* One primary: creating a room needs an account, so a guest's way forward is joining one. */}
      <Row>
        <Button id="b-mp-create" variant={acc ? 'primary' : 'ghost'} disabled={!open || !acc} title={acc ? undefined : 'Connectez-vous pour créer une salle'} onClick={actions.createRoom}>Créer une salle</Button>
        <Button id="b-mp-join" variant={acc ? 'ghost' : 'primary'} disabled={!open || code.trim().length !== 4} onClick={() => actions.joinRoom(code)}>Rejoindre</Button>
        <Button id="b-mp-back" variant="ghost" onClick={actions.lobbyBack}>Retour</Button>
      </Row>
      {!acc && (
        <>
          <Disclaimer id="lobby-guest">
            {'En invité·e, vous rejoignez une salle avec son code (ou sur invitation) et jouez les quatre candidat·es de départ.'}
          </Disclaimer>
          <Row>
            <Button variant="ghost" id="b-mp-account" onClick={() => { actions.lobbyBack(); actions.openAccount(); }}>Se connecter</Button>
          </Row>
        </>
      )}
    </>
  );
}

/** Online friends who are not in the room yet, each with an invite button. */
function InvitePanel({ ui, room }: { ui: UiSnapshot; room: RoomView }) {
  const inRoom = new Set(room.players.map(p => p.userId).filter(Boolean));
  const friends = ui.net.friends.filter(f => f.status === 'friend' && f.online && !inRoom.has(f.id));
  if (!ui.account) return null;
  return (
    <Row id="lobby-invite">
      {friends.length
        ? friends.map(f => <Button key={f.id} id={'b-mp-invite-' + f.id} variant="ghost" onClick={() => actions.inviteFriend(f.id)}>{'Inviter ' + f.name}</Button>)
        : <Disclaimer>Aucun·e ami·e en ligne à inviter. Donnez-leur le code, ou ajoutez des ami·es depuis votre compte.</Disclaimer>}
    </Row>
  );
}

/** Inside a room: the players, my team and candidate, the circuit, ready and start. */
function RoomPanel({ ui, room }: { ui: UiSnapshot; room: RoomView }) {
  const me = room.players.find(p => p.id === ui.net.id);
  const isHost = room.host === ui.net.id;
  const others = room.players.filter(p => p.id !== room.host);
  // The admin has absolute power over the room (DEC-031): starts it ready or not, picks the circuit, moves or excludes anyone.
  const admin = isAdmin(ui);
  const canStart = (isHost && others.every(p => p.ready)) || admin;
  // A god (the admin, DEC-030) drives any candidate and belongs to no team.
  const allowed = me?.god || admin ? CHARS.map(c => c.id) : unlockedOf(ui);
  const state = (id: string, ready: boolean) => (id === room.host ? 'hôte' : ready ? 'prêt·e' : '…');
  const rows: ResultsRow[] = room.players.map(p => {
    const c = CHARS.find(x => x.id === p.charId);
    const other = p.team === 'bleu' ? 'rouge' : 'bleu';
    return {
      id: p.id,
      rank: p.god ? 'Dieu' : p.team ? TEAM_NAMES[p.team] : '—',
      name: p.name + (p.god ? ' (dieu)' : p.guest ? ' (invité·e)' : p.level ? ' · niv. ' + p.level : '') + (p.id === room.host ? ' (hôte)' : ''),
      detail: <PlayerDetail p={p} c={c} />,
      time: admin && p.id !== ui.net.id ? (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {state(p.id, p.ready)}
          {!p.god && room.phase === 'lobby' && <Button id={'b-mp-move-' + p.id} variant="ghost" onClick={() => actions.godCommand({ cmd: 'team', id: p.id, team: other })}>{'→ ' + TEAM_NAMES[other]}</Button>}
          <Button id={'b-mp-kick-' + p.id} variant="ghost" onClick={() => actions.godCommand({ cmd: 'kick', id: p.id })}>Exclure</Button>
        </span>
      ) : state(p.id, p.ready),
      highlighted: p.id === ui.net.id,
    };
  });
  const myChar = me ? CHARS.find(c => c.id === me.charId) : undefined;
  return (
    <>
      <Subtitle id="lobby-room" style={{ fontSize: 18 }}>{'Salle ' + room.code + ' · donnez ce code à vos ami·es'}</Subtitle>
      <ResultsTable rows={rows} columns={['Équipe', 'Joueur·se', 'État']} bodyProps={{ id: 'lobby-players' }} />
      {admin && room.phase === 'race' && (
        <Row id="lobby-race-running">
          <Disclaimer>Course en cours dans cette salle.</Disclaimer>
          <Button id="b-mp-god-enter" onClick={() => actions.godJoin(room.code)}>Entrer dans la course en dieu</Button>
          <Button id="b-mp-god-finish" variant="ghost" onClick={() => actions.godCommand({ cmd: 'finish' })}>Terminer la course</Button>
        </Row>
      )}
      {me && (
        <Row>
          {!me.god && TEAM_IDS.map(t => (
            <Button key={t} id={'b-mp-team-' + t} variant={me.team === t ? 'primary' : 'ghost'} aria-pressed={me.team === t} onClick={() => actions.setTeam(t)}>
              {'Équipe ' + TEAM_NAMES[t]}
            </Button>
          ))}
          {me.god && <span id="lobby-god" style={{ color: 'var(--gold)' }}>Mode dieu : sans équipe, sans recharge, intouchable, hors classement.</span>}
          <Button id="b-mp-char-prev" variant="ghost" aria-label="Candidat précédent" onClick={() => actions.setChar(nextFreeChar(room, me.id, me.charId, -1, allowed))}>◀</Button>
          <span id="lobby-char" style={{ minWidth: 160, textAlign: 'center' }}>{myChar?.name}</span>
          <Button id="b-mp-char-next" variant="ghost" aria-label="Candidat suivant" onClick={() => actions.setChar(nextFreeChar(room, me.id, me.charId, 1, allowed))}>▶</Button>
        </Row>
      )}
      <Row>
        {TRACK_LIST.map((t, i) => (
          <Button key={t.name} id={'b-mp-track-' + i} variant={room.trackIdx === i ? 'primary' : 'ghost'} aria-pressed={room.trackIdx === i} disabled={!isHost && !admin} onClick={() => actions.pickTrack(i)}>
            {t.name.split(' — ')[0]}
          </Button>
        ))}
      </Row>
      <Row>
        {isHost
          ? <Button id="b-mp-start" disabled={!canStart} onClick={actions.startNetRace}>{canStart ? 'Lancer la course' : 'En attente des joueur·ses…'}</Button>
          : <Button id="b-mp-ready" variant={me?.ready ? 'primary' : 'ghost'} aria-pressed={!!me?.ready} onClick={() => actions.setReady(!me?.ready)}>{me?.ready ? 'Prêt·e !' : 'Je suis prêt·e'}</Button>}
        {/* A ghost: the ready toggle beside it already holds the row's one primary. */}
        {admin && !isHost && room.phase === 'lobby' && <Button id="b-mp-force" variant="ghost" onClick={actions.startNetRace}>Lancer maintenant (admin)</Button>}
        <Button id="b-mp-leave" variant="ghost" onClick={actions.leaveRoom}>Quitter la salle</Button>
      </Row>
      <InvitePanel ui={ui} room={room} />
    </>
  );
}

/** The team race's waiting room. Shown only when the page is served by the game server. */
export function LobbyScreen({ ui }: { ui: UiSnapshot }) {
  const room = ui.net.room;
  const message = ui.net.error ?? ui.net.notice ?? '';
  return (
    <Screen id="s-lobby" hidden={ui.state !== 'lobby'}>
      <Panel style={COLUMN}>
        <Heading>Course en équipe</Heading>
        <Disclaimer id="lobby-status">{STATUS[ui.net.status]}</Disclaimer>
        {room ? <RoomPanel ui={ui} room={room} /> : <JoinPanel ui={ui} />}
        {/* Hidden while empty: a blank line kept in reserve here, with its margins and the column's gaps, left a hole in the panel. */}
        <Disclaimer id="lobby-error" role="status" hidden={!message} style={{ color: ui.net.error ? 'var(--red)' : 'var(--gold)' }}>{message}</Disclaimer>
        <Disclaimer>
          Bleu contre Rouge : chaque arrivée rapporte des points (10, 8, 6, 4, 2, 1) à son équipe. Vos objets épargnent vos coéquipier·es. L’IA complète la grille.
        </Disclaimer>
      </Panel>
    </Screen>
  );
}
