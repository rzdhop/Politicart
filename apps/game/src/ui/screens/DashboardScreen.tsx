import { useEffect, useState, type FormEvent } from 'react';

import {
  AdminCard,
  AdminGrid,
  Button,
  Disclaimer,
  Field,
  Heading,
  Panel,
  ResultsTable,
  Row,
  Screen,
  TextInput,
  type ResultsRow,
} from '@kart-republique/ui';

import { CHARACTERS, TRACKS } from '../../engine/data.js';
import { TEAM_NAMES } from '../../engine/teams.js';
import { Figure } from '../Figure';
import { GodConsole } from '../GodConsole';
import { actions, type DashConn, type DashRoom, type DashStats, type DashUser, type GodCmd, type UiSnapshot } from '../store';
import type { Character, Track } from '../types';

const COLUMN = { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' } as const;
const WIDE = { width: 'min(980px, 100%)' } as const;
const ACTIONS = { display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' } as const;
const REFRESH_MS = 5000;
const fr = (n: number) => n.toLocaleString('fr-FR');

const CHARS = CHARACTERS as unknown as Character[];
const TRACK_LIST = TRACKS as unknown as Track[];
const charName = (id: string) => CHARS.find(c => c.id === id)?.name ?? id;
const trackName = (i: number) => TRACK_LIST[i]?.name.split(' — ')[0] ?? 'Circuit ' + i;

/** A timestamp as the admin reads it: date and time in French, or a dash. */
function when(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Minutes since a moment, as "12 min". */
function since(ms: number | null): string {
  if (!ms) return '';
  return Math.max(0, Math.round((Date.now() - ms) / 60_000)) + ' min';
}

/** The headline figures: accounts, who is on, races played. */
function Stats({ stats }: { stats: DashStats | null }) {
  if (!stats) return <Disclaimer id="dash-stats">Chargement des statistiques…</Disclaimer>;
  const byTrack = Object.entries(stats.races.byTrack).map(([i, n]) => trackName(Number(i)) + ' ' + n).join(' · ');
  return (
    <>
      <AdminGrid id="dash-stats" style={WIDE}>
        <Figure id="dash-fig-accounts" value={stats.accounts.total} label={'comptes · ' + stats.accounts.new7d + ' cette semaine · ' + stats.accounts.banned + ' banni·es'} />
        <Figure id="dash-fig-online" value={stats.accounts.online} label={'comptes en ligne · ' + stats.live.connections + ' connexions dont ' + stats.live.guests + ' invité·es'} />
        <Figure id="dash-fig-rooms" value={stats.live.rooms} label={'salles ouvertes · ' + stats.live.races + ' en course'} />
        <Figure id="dash-fig-races" value={stats.races.races} label={'courses en équipe (' + stats.races.finished + ' terminées) · ' + stats.races.solo + ' courses solo'} />
      </AdminGrid>
      {byTrack && <Disclaimer id="dash-tracks">{'Par circuit : ' + byTrack}</Disclaimer>}
    </>
  );
}

/** The ten best accounts by experience. */
function Top({ stats }: { stats: DashStats | null }) {
  if (!stats || !stats.top.length) return null;
  const rows: ResultsRow[] = stats.top.map((u, i) => ({ id: u.id, rank: String(i + 1), name: u.name, detail: 'niveau ' + u.level, time: u.xp + ' XP' }));
  return (
    <Panel style={{ ...COLUMN, gap: 8, ...WIDE }}>
      <Heading level={3} style={{ fontSize: 20 }}>Meilleurs comptes</Heading>
      <ResultsTable rows={rows} columns={['', 'Compte', 'Expérience']} bodyProps={{ id: 'dash-top' }} />
    </Panel>
  );
}

/** Search, list and act on accounts: ban with a reason, lift a ban, close every session, credit politicoins. */
function Users({ ui }: { ui: UiSnapshot }) {
  const [q, setQ] = useState(ui.dashboard.query);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('100');
  const search = (e: FormEvent) => { e.preventDefault(); void actions.searchUsers(q); };
  const grant = (id: string) => { void actions.grantCoins(id, Number(amount.trim())); };
  const state = (u: DashUser) => (u.banned ? 'banni·e' + (u.banned.reason ? ' : ' + u.banned.reason : '') : u.online ? (u.room ? 'en ligne · salle ' + u.room : 'en ligne') : 'vu·e ' + when(u.seen));
  const rows: ResultsRow[] = ui.dashboard.users.map(u => ({
    id: u.id,
    rank: u.banned ? '⛔' : u.online ? '●' : '○',
    name: u.name + ' · niv. ' + u.level + ' · ' + fr(u.coins ?? 0) + ' politicoins',
    detail: state(u) + ' · inscrit·e ' + when(u.created),
    time: (
      <span style={ACTIONS}>
        <Button id={'b-grant-' + u.id} variant="ghost" onClick={() => grant(u.id)}>Créditer</Button>
        {u.banned
          ? <Button id={'b-dash-unban-' + u.id} variant="ghost" onClick={() => { void actions.unbanUser(u.id); }}>Débannir</Button>
          : <Button id={'b-dash-ban-' + u.id} variant="ghost" onClick={() => { void actions.banUser(u.id, reason); }}>Bannir</Button>}
        <Button id={'b-dash-logout-' + u.id} variant="ghost" onClick={() => { void actions.logoutUser(u.id); }}>Déconnecter</Button>
      </span>
    ),
  }));
  return (
    <Panel style={{ ...COLUMN, gap: 8, ...WIDE }}>
      <Heading level={3} style={{ fontSize: 20 }}>Comptes</Heading>
      <form onSubmit={search} style={{ width: '100%' }}>
        <Row style={{ alignItems: 'flex-end' }}>
          <AdminGrid style={{ width: 'min(560px, 100%)' }}>
            <Field label="Chercher un pseudo">
              <TextInput id="dash-user-q" maxLength={16} value={q} placeholder="tous les comptes" onChange={e => setQ(e.target.value)} />
            </Field>
            <Field label="Motif du prochain bannissement">
              <TextInput id="dash-ban-reason" maxLength={120} value={reason} placeholder="Banni par l’administrateur" onChange={e => setReason(e.target.value)} />
            </Field>
            <Field label="Politicoins à créditer">
              <input id="dash-grant-amount" type="number" inputMode="numeric" min={0} max={100_000} step={1} value={amount} onChange={e => setAmount(e.target.value)} />
            </Field>
          </AdminGrid>
          <Button id="b-dash-search" type="submit">Chercher</Button>
        </Row>
      </form>
      {rows.length
        ? <ResultsTable rows={rows} columns={['', 'Compte', '']} bodyProps={{ id: 'dash-users' }} />
        : <Disclaimer id="dash-users-empty">Aucun compte ne correspond.</Disclaimer>}
      <Disclaimer>Un compte banni est déconnecté sur-le-champ et ne peut plus se connecter. « Déconnecter » ferme ses sessions sans le bannir. « Créditer » verse au compte le nombre de politicoins saisi ci-dessus (100 000 au plus).</Disclaimer>
    </Panel>
  );
}

/**
 * Absolute power over one room (DEC-031). In the lobby: start it now, pick
 * its circuit, move a player to the other team, exclude anyone. In a race:
 * the whole god console, aimed at the race's karts.
 */
function RoomControl({ room, reply }: { room: DashRoom; reply: string | null }) {
  const send = (cmd: GodCmd) => { void actions.roomCommand(room.code, cmd); };
  const players = room.players.map(p => {
    const other = p.team === 'bleu' ? 'rouge' : 'bleu';
    return (
      <span key={p.id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginRight: 10 }}>
        <b>{p.name}</b>
        {!p.god && room.phase === 'lobby' && <Button id={'b-dash-move-' + p.id} variant="ghost" onClick={() => send({ cmd: 'team', id: p.id, team: other })}>{'→ ' + TEAM_NAMES[other]}</Button>}
        <Button id={'b-dash-exclude-' + p.id} variant="ghost" onClick={() => send({ cmd: 'kick', id: p.id })}>Exclure</Button>
      </span>
    );
  });
  return (
    <AdminCard id={'dash-control-' + room.code} style={{ width: '100%', textAlign: 'left' }}>
      <div className="name">{'Salle ' + room.code + (room.phase === 'race' ? ' · en course' : ' · salon')}</div>
      <Row style={{ justifyContent: 'flex-start' }}>{players.length ? players : <span>Personne.</span>}</Row>
      {room.phase === 'lobby' ? (
        <Row style={{ justifyContent: 'flex-start' }}>
          {TRACK_LIST.map((t, i) => (
            <Button key={t.name} id={'b-dash-track-' + room.code + '-' + i} variant={room.trackIdx === i ? 'primary' : 'ghost'} aria-pressed={room.trackIdx === i} onClick={() => send({ cmd: 'track', trackIdx: i })}>{trackName(i)}</Button>
          ))}
          <Button id={'b-dash-start-' + room.code} disabled={!room.players.length} onClick={() => send({ cmd: 'start' })}>Lancer maintenant</Button>
        </Row>
      ) : room.race ? (
        <GodConsole
          idPrefix={'dash-god-' + room.code}
          karts={room.race.map(k => ({ slot: k.slot, label: k.name + (k.isAI ? ' (IA)' : '') + (k.god ? ' ⚡' : '') }))}
          self={null}
          send={send}
          reply={reply}
        />
      ) : <Disclaimer>La course démarre…</Disclaimer>}
    </AdminCard>
  );
}

/** The rooms open right now: who is in, which phase; enter as a god at any moment, take control, or close. */
function Rooms({ rooms, reply }: { rooms: DashRoom[]; reply: string | null }) {
  const [managed, setManaged] = useState<string | null>(null);
  const rows: ResultsRow[] = rooms.map(r => ({
    id: r.code,
    rank: r.code,
    name: (r.phase === 'race' ? 'En course' + (r.since ? ' depuis ' + since(r.since) : '') : 'Salon') + ' · ' + trackName(r.trackIdx),
    detail: r.players.map(p => p.name + (p.god ? ' (dieu)' : p.team ? ' (' + TEAM_NAMES[p.team] + ')' : '') + ' · ' + charName(p.charId)).join(', ') || 'vide',
    time: (
      <span style={ACTIONS}>
        <Button id={'b-dash-god-' + r.code} onClick={() => actions.godJoin(r.code)}>{r.phase === 'race' ? 'Entrer dans la course' : 'Entrer en dieu'}</Button>
        <Button id={'b-dash-manage-' + r.code} variant={managed === r.code ? 'primary' : 'ghost'} aria-pressed={managed === r.code} onClick={() => setManaged(managed === r.code ? null : r.code)}>Contrôler</Button>
        <Button id={'b-dash-close-' + r.code} variant="ghost" onClick={() => { void actions.closeRoom(r.code); }}>Fermer</Button>
      </span>
    ),
  }));
  const room = rooms.find(r => r.code === managed);
  return (
    <Panel style={{ ...COLUMN, gap: 8, ...WIDE }}>
      <Heading level={3} style={{ fontSize: 20 }}>Salles</Heading>
      {rows.length
        ? <ResultsTable rows={rows} columns={['Code', 'Salle', '']} bodyProps={{ id: 'dash-rooms' }} />
        : <Disclaimer id="dash-rooms-empty">Aucune salle ouverte pour l’instant.</Disclaimer>}
      {room && <RoomControl room={room} reply={reply} />}
      <Disclaimer>En dieu, vous entrez dans la salle ou dans la course en cours, à tout moment, hors des six places et des équipes : pouvoir sans recharge, objets à volonté, intouchable, aucun point marqué. « Contrôler » change la salle à distance : départ forcé, circuit, équipes, exclusions, et en course tout ce que permet la console divine.</Disclaimer>
    </Panel>
  );
}

/** Every socket open on the server, account or guest, and where it is. */
function Connections({ connections }: { connections: DashConn[] }) {
  const rows: ResultsRow[] = connections.map(c => ({
    id: c.id,
    rank: c.admin ? '★' : c.guest ? '○' : '●',
    name: (c.name || '(sans nom)') + (c.admin ? ' (admin)' : c.guest ? ' (invité·e)' : ''),
    detail: c.room ? 'salle ' + c.room : 'dans les menus',
    time: <Button id={'b-dash-kick-' + c.id} variant="ghost" onClick={() => { void actions.kickConnection(c.id); }}>Éjecter</Button>,
  }));
  return (
    <Panel style={{ ...COLUMN, gap: 8, ...WIDE }}>
      <Heading level={3} style={{ fontSize: 20 }}>Connexions</Heading>
      {rows.length
        ? <ResultsTable rows={rows} columns={['', 'Joueur·se', '']} bodyProps={{ id: 'dash-conns' }} />
        : <Disclaimer id="dash-conns-empty">Personne n’est connecté.</Disclaimer>}
    </Panel>
  );
}

/** The last races the server ran. */
function Recent({ stats }: { stats: DashStats | null }) {
  if (!stats || !stats.races.recent.length) return null;
  const rows: ResultsRow[] = stats.races.recent.map((r, i) => ({
    id: r.at + '-' + i,
    rank: r.code,
    name: trackName(r.trackIdx) + ' · ' + r.humans + ' pilote' + (r.humans > 1 ? 's' : '') + (r.gods ? ' + ' + r.gods + ' dieu' : ''),
    detail: (r.winner ? 'vainqueur ' + r.winner : 'interrompue') + (r.teams.length ? ' · ' + r.teams.map(t => TEAM_NAMES[t.team] + ' ' + t.points).join(', ') : ''),
    time: when(r.at),
  }));
  return (
    <Panel style={{ ...COLUMN, gap: 8, ...WIDE }}>
      <Heading level={3} style={{ fontSize: 20 }}>Dernières courses</Heading>
      <ResultsTable rows={rows} columns={['Salle', 'Course', 'Quand']} bodyProps={{ id: 'dash-recent' }} />
    </Panel>
  );
}

/**
 * The admin's dashboard (DEC-030): statistics, accounts to ban or log out,
 * the rooms and connections open right now, with a seat as a god in any room.
 * Rendered only while the logged-in account is the admin's (App.tsx); every
 * figure comes from the game server's admin API and refreshes every few
 * seconds while the screen is up.
 */
export function DashboardScreen({ ui }: { ui: UiSnapshot }) {
  const open = ui.state === 'dashboard';
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => { void actions.refreshDashboard(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [open]);
  const d = ui.dashboard;
  return (
    <Screen id="s-dashboard" hidden={!open}>
      <Heading size="screen">Tableau de bord</Heading>
      <Disclaimer id="dash-status" role="status" style={{ minHeight: '1.2em', color: d.error ? 'var(--red)' : 'var(--gold)' }}>
        {d.error ?? d.notice ?? (d.updatedAt ? 'Actualisé à ' + new Date(d.updatedAt).toLocaleTimeString('fr-FR') : '')}
      </Disclaimer>
      <Stats stats={d.stats} />
      <Rooms rooms={d.rooms} reply={d.error ?? d.notice} />
      <Users ui={ui} />
      <Connections connections={d.connections} />
      <Top stats={d.stats} />
      <Recent stats={d.stats} />
      <Row>
        <Button id="b-dash-refresh" variant="ghost" disabled={d.busy} onClick={() => { void actions.refreshDashboard(); }}>Actualiser</Button>
        <Button id="b-dash-back" onClick={actions.closeDashboard}>Retour</Button>
      </Row>
    </Screen>
  );
}
