import { useState, type FormEvent } from 'react';

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
  StatBar,
  Subtitle,
  TextInput,
  type ResultsRow,
} from '@kart-republique/ui';

import { CHARACTERS } from '../../engine/data.js';
import { UNLOCKS } from '../../engine/progress.js';
import { actions, type Friend, type Profile, type UiSnapshot } from '../store';
import type { Character } from '../types';

const COLUMN = { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' } as const;
const CHARS = CHARACTERS as unknown as Character[];
const nameOf = (id: string) => CHARS.find(c => c.id === id)?.name ?? id;

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

/** The account's level, its experience bar and what the next level unlocks. */
function Level({ profile }: { profile: Profile }) {
  const next = UNLOCKS[profile.level - 1];
  return (
    <Panel style={{ ...COLUMN, gap: 6, width: 'min(520px, 100%)' }}>
      <Heading id="acc-level" level={3} style={{ fontSize: 24 }}>{profile.name + ' · niveau ' + profile.level}</Heading>
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

const STATUS_TEXT = { incoming: 'vous demande en ami·e', outgoing: 'demande envoyée' } as const;

/** Friends and requests: add by pseudo, accept, remove. */
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
      <span style={{ display: 'inline-flex', gap: 6 }}>
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
    </Panel>
  );
}

/** The account screen: sign in, or the logged-in account's level and friends. */
export function AccountScreen({ ui }: { ui: UiSnapshot }) {
  const acc = ui.account;
  return (
    <Screen id="s-account" hidden={ui.state !== 'account'}>
      <Panel style={COLUMN}>
        <Heading>{acc ? 'Mon compte' : 'Compte'}</Heading>
        {!ui.netAvailable
          ? <Disclaimer id="acc-offline">Aucun serveur de jeu joignable : les comptes sont indisponibles. Vous jouez en invité·e avec les quatre candidat·es de départ.</Disclaimer>
          : acc
            ? <><Level profile={acc.profile} /><Friends ui={ui} /></>
            : <SignIn ui={ui} />}
        <Row>
          {acc && <Button id="b-acc-logout" variant="ghost" onClick={actions.logOut}>Se déconnecter</Button>}
          <Button id="b-acc-back" variant="ghost" onClick={actions.closeAccount}>Retour</Button>
        </Row>
      </Panel>
    </Screen>
  );
}
