import { useState, type FormEvent } from 'react';

import {
  AdminGrid,
  Button,
  CoinCount,
  Disclaimer,
  Field,
  Heading,
  Panel,
  ResultsTable,
  Row,
  Screen,
  StatBar,
  Subtitle,
  TextInput,
  type ResultsRow,
} from '@politikart/ui';

import { collection } from '../../engine/catalog.js';
import { CHARACTERS, TRACKS } from '../../engine/data.js';
import { UNLOCKS } from '../../engine/progress.js';
import { fmtTime } from '../../engine/util.js';
import { Figure } from '../Figure';
import { actions, statsOf, type Collection, type Friend, type Profile, type Stats, type UiSnapshot } from '../store';
import type { Character, Track } from '../types';

const COLUMN = { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' } as const;
const WIDE = { width: 'min(980px, 100%)' } as const;
const CHARS = CHARACTERS as unknown as Character[];
const TRACK_LIST = TRACKS as unknown as (Track & { id: string })[];
const nameOf = (id: string) => CHARS.find(c => c.id === id)?.name ?? id;
const trackName = (t: Track) => t.name.split(' — ')[0] ?? t.name;
const fr = (n: number) => n.toLocaleString('fr-FR');
/** A best lap or time as the tables print it: m:ss.cc, or a dash when none was set. */
const time = (s: number | undefined) => (typeof s === 'number' && Number.isFinite(s) ? fmtTime(s) : '—');
/** How much of the catalogue is held: "3 / 52 · 6 %". */
const collectionText = (c: Collection) => c.have + ' / ' + c.total + ' · ' + c.pct + ' %';

/** Log in or sign up, or stay a guest under a pseudo. */
function SignIn({ ui }: { ui: UiSnapshot }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const ready = name.trim().length >= 3 && password.length >= 6 && !ui.accountBusy;
  const submit = (e: FormEvent) => { e.preventDefault(); if (ready) actions.logIn(name, password); };
  return (
    <>
      <Subtitle style={{ fontSize: 16 }}>Un compte garde votre niveau, débloque les candidat·es et retrouve vos ami·es.</Subtitle>
      <form onSubmit={submit} style={COLUMN}>
        <AdminGrid style={{ width: 'min(520px, 100%)' }}>
          <Field label="Pseudo">
            <TextInput id="acc-name" maxLength={16} autoComplete="username" value={name} placeholder="Marianne" onChange={e => setName(e.target.value)} />
          </Field>
          <Field label="Mot de passe">
            <input id="acc-pass" type="password" maxLength={128} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
          </Field>
        </AdminGrid>
        <Row>
          <Button id="b-acc-login" type="submit" disabled={!ready}>Se connecter</Button>
          <Button id="b-acc-register" variant="ghost" disabled={!ready} onClick={() => actions.signUp(name, password)}>Créer un compte</Button>
        </Row>
      </form>
      <Disclaimer id="acc-error" role="status" style={{ color: 'var(--red)', minHeight: '1.2em' }}>{ui.accountError ?? ''}</Disclaimer>
      <Panel style={{ ...COLUMN, gap: 8 }}>
        <Heading level={3} style={{ fontSize: 20 }}>Jouer en invité·e</Heading>
        <AdminGrid style={{ width: 'min(520px, 100%)' }}>
          <Field label="Pseudo d’invité·e">
            <TextInput id="acc-guest" maxLength={16} value={ui.netName} placeholder="Député·e" onChange={e => actions.setNetName(e.target.value)} />
          </Field>
        </AdminGrid>
        <Disclaimer>Sans compte : les quatre candidat·es de départ, pas de niveau, et en multijoueur on rejoint une salle sans pouvoir en créer.</Disclaimer>
      </Panel>
    </>
  );
}

/** The account's level, its experience bar, its politicoins and what the next level unlocks. */
function Level({ profile }: { profile: Profile }) {
  const next = UNLOCKS[profile.level - 1];
  return (
    <Panel style={{ ...COLUMN, gap: 6, width: 'min(520px, 100%)' }}>
      <Heading id="acc-level" level={3} style={{ fontSize: 24 }}>{profile.name + ' · niveau ' + profile.level}</Heading>
      <CoinCount value={profile.coins ?? 0} label="politicoins" format={fr} valueProps={{ id: 'acc-coins' }} />
      <div style={{ width: '100%' }}>
        <StatBar label={profile.xpInto + ' / ' + profile.xpNext + ' XP'} value={profile.xpNext ? profile.xpInto / profile.xpNext : 1} />
      </div>
      <Disclaimer id="acc-next">
        {next ? 'Niveau ' + (profile.level + 1) + ' : ' + nameOf(next) + ' rejoint votre écurie.' : 'Toute la distribution est débloquée.'}
        {'  ·  ' + profile.unlocked.length + ' / ' + CHARS.length + ' candidat·es'}
      </Disclaimer>
    </Panel>
  );
}

/** The best lap and the best time on every circuit. */
function BestLaps({ stats, id }: { stats: Stats; id: string }) {
  const rows: ResultsRow[] = TRACK_LIST.map(t => ({
    id: t.id,
    rank: '',
    name: trackName(t),
    detail: 'meilleur tour ' + time(stats.bestLap[t.id]),
    time: time(stats.bestTime[t.id]),
  }));
  return <ResultsTable rows={rows} columns={['', 'Circuit', 'Meilleur temps']} bodyProps={{ id }} />;
}

/** The account's own figures: races and results, the Politibox, the politicoins, the collection, the best laps. */
function OwnStats({ profile }: { profile: Profile }) {
  const s = statsOf(profile.stats);
  const c = collection(profile.owned) as Collection;
  return (
    <Panel style={{ ...COLUMN, gap: 10, ...WIDE }}>
      <Heading level={3} style={{ fontSize: 20 }}>Stats</Heading>
      <AdminGrid id="acc-stats" style={{ width: '100%' }}>
        <Figure id="acc-fig-races" value={fr(s.races)} label={'courses · ' + fr(s.solo) + ' solo · ' + fr(s.team) + ' en équipe'} />
        <Figure id="acc-fig-wins" value={fr(s.wins)} label={'victoires · ' + fr(s.teamWins) + ' avec son équipe'} />
        <Figure id="acc-fig-podiums" value={fr(s.podiums)} label="podiums" />
        <Figure id="acc-fig-dnf" value={fr(s.dnf)} label={'abandons · ' + fr(s.finished) + ' courses terminées'} />
        <Figure id="acc-fig-boxes" value={fr(s.boxes)} label="Politibox ouvertes" />
        <Figure id="acc-fig-coins" value={fr(s.coinsEarned)} label={'politicoins gagnés · ' + fr(s.coinsSpent) + ' dépensés'} />
        <Figure id="acc-fig-collection" value={c.pct + ' %'} label={'collection · ' + c.have + ' / ' + c.total + ' pièces, traînées et candidat·es'} />
      </AdminGrid>
      <BestLaps stats={s} id="acc-bestlaps" />
    </Panel>
  );
}

/** One friend's figures, as the server lists them, under the friend list. */
function FriendPanel({ ui }: { ui: UiSnapshot }) {
  const f = ui.friendStats?.find(x => x.id === ui.friendShown);
  if (!ui.friendShown && !ui.friendStatsError) return null;
  const s = statsOf(f?.stats);
  return (
    <Panel id="acc-friend-stats" style={{ ...COLUMN, gap: 10, ...WIDE }}>
      <Heading level={3} style={{ fontSize: 20 }}>{f ? f.name + ' · niveau ' + f.level : 'Stats'}</Heading>
      {ui.friendStatsError
        ? <Disclaimer role="status" style={{ color: 'var(--red)' }}>{ui.friendStatsError}</Disclaimer>
        : !f ? <Disclaimer role="status">Chargement…</Disclaimer>
          : (
            <>
              <AdminGrid style={{ width: '100%' }}>
                <Figure value={fr(s.races)} label="courses" />
                <Figure value={fr(s.wins)} label="victoires" />
                <Figure value={fr(s.podiums)} label="podiums" />
                <Figure value={f.collection.pct + ' %'} label={'collection · ' + collectionText(f.collection)} />
              </AdminGrid>
              <BestLaps stats={s} id={'acc-friend-bestlaps'} />
            </>
          )}
      <Button id="b-friend-stats-close" variant="ghost" onClick={actions.hideFriendStats}>Fermer</Button>
    </Panel>
  );
}

const STATUS_TEXT = { incoming: 'vous demande en ami·e', outgoing: 'demande envoyée' } as const;

/** Friends and requests: add by pseudo, accept, remove, see a friend's figures. */
function Friends({ ui }: { ui: UiSnapshot }) {
  const [name, setName] = useState('');
  const order = { incoming: 0, friend: 1, outgoing: 2 } as const;
  const list = [...ui.net.friends].sort((a, b) => order[a.status] - order[b.status] || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  const where = (f: Friend) => (f.status !== 'friend' ? STATUS_TEXT[f.status] : !f.online ? 'hors ligne' : f.room ? 'en ligne · salle ' + f.room : 'en ligne');
  const rows: ResultsRow[] = list.map(f => ({
    id: f.id,
    rank: f.status === 'friend' ? (f.online ? '●' : '○') : '✉',
    name: f.name,
    detail: 'niv. ' + f.level + ' · ' + where(f),
    time: (
      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {f.status === 'friend' && <Button id={'b-friend-stats-' + f.id} variant="ghost" aria-pressed={ui.friendShown === f.id} onClick={() => { void actions.showFriendStats(f.id); }}>Stats</Button>}
        {f.status === 'incoming' && <Button id={'b-friend-accept-' + f.id} onClick={() => actions.acceptFriend(f.id)}>Accepter</Button>}
        <Button id={'b-friend-remove-' + f.id} variant="ghost" onClick={() => actions.removeFriend(f.id)}>{f.status === 'friend' ? 'Retirer' : f.status === 'incoming' ? 'Refuser' : 'Annuler'}</Button>
      </span>
    ),
  }));
  const add = (e: FormEvent) => { e.preventDefault(); actions.addFriend(name); setName(''); };
  return (
    <Panel style={{ ...COLUMN, gap: 8, width: 'min(620px, 100%)' }}>
      <Heading level={3} style={{ fontSize: 20 }}>Ami·es</Heading>
      <form onSubmit={add}>
        <Row style={{ alignItems: 'flex-end' }}>
          <AdminGrid style={{ width: 260 }}>
            <Field label="Ajouter par pseudo">
              <TextInput id="acc-friend" maxLength={16} value={name} placeholder="Pseudo" onChange={e => setName(e.target.value)} />
            </Field>
          </AdminGrid>
          <Button id="b-friend-add" type="submit" disabled={name.trim().length < 3 || ui.net.status !== 'open'}>Ajouter</Button>
        </Row>
      </form>
      <Disclaimer id="acc-notice" role="status" style={{ minHeight: '1.2em', color: ui.net.error ? 'var(--red)' : 'var(--gold)' }}>{ui.net.error ?? ui.net.notice ?? ''}</Disclaimer>
      {rows.length
        ? <ResultsTable rows={rows} columns={['', 'Ami·e', '']} bodyProps={{ id: 'acc-friends' }} />
        : <Disclaimer id="acc-friends-empty">Personne pour l’instant. Ajoutez un·e ami·e par son pseudo, puis invitez-le·la depuis votre salle multijoueur.</Disclaimer>}
      <FriendPanel ui={ui} />
    </Panel>
  );
}

/** The account screen: sign in, or the logged-in account's level, politicoins, stats and friends. */
export function AccountScreen({ ui }: { ui: UiSnapshot }) {
  const acc = ui.account;
  return (
    <Screen id="s-account" hidden={ui.state !== 'account'} className={ui.noteHidden ? undefined : 'noted'}>
      <Panel style={COLUMN}>
        <Heading>{acc ? 'Mon compte' : 'Compte'}</Heading>
        {!ui.netAvailable
          ? <Disclaimer id="acc-offline">Aucun serveur de jeu joignable : les comptes sont indisponibles. Vous jouez en invité·e avec les quatre candidat·es de départ.</Disclaimer>
          : acc
            ? <><Level profile={acc.profile} /><OwnStats profile={acc.profile} /><Friends ui={ui} /></>
            : <SignIn ui={ui} />}
        <Row>
          {acc && <Button id="b-acc-logout" variant="ghost" onClick={actions.logOut}>Se déconnecter</Button>}
          <Button id="b-acc-back" variant="ghost" onClick={actions.closeAccount}>Retour</Button>
        </Row>
      </Panel>
    </Screen>
  );
}
