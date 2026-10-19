import { useRef, type KeyboardEvent } from 'react';
import {
  AdminGrid,
  Button,
  Disclaimer,
  Field,
  Heading,
  Panel,
  PasswordInput,
  Row,
  Screen,
  TextInput,
} from '@kart-republique/ui';

import { actions, type UiSnapshot } from '../store';

const PANEL = { width: 'min(360px,100%)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 } as const;
const ONE_COLUMN = { gridTemplateColumns: '1fr', width: '100%' } as const;
const ERROR = { color: 'var(--red)', minHeight: '1.2em' } as const;

/**
 * The admin's sign-in, on the game server only. The password is read from its
 * field at the moment of submitting, handed to the request, and the field is
 * cleared right away, whatever the answer: it is never kept in the store,
 * logged, or left on screen.
 */
export function LoginScreen({ ui }: { ui: UiSnapshot }) {
  const user = useRef<HTMLInputElement>(null);
  const pass = useRef<HTMLInputElement>(null);
  const submit = () => {
    if (ui.adminBusy || !user.current || !pass.current) return;
    const password = pass.current.value;
    pass.current.value = '';
    void actions.login(user.current.value.trim(), password);
  };
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  return (
    <Screen id="s-login" hidden={ui.state !== 'login'}>
      <Heading size="screen">Administration</Heading>
      <Panel style={PANEL}>
        <AdminGrid style={ONE_COLUMN}>
          <Field label="Identifiant">
            <TextInput id="adm-user" ref={user} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} onKeyDown={onEnter} />
          </Field>
          <Field label="Mot de passe">
            <PasswordInput id="adm-pass" ref={pass} autoComplete="current-password" maxLength={256} onKeyDown={onEnter} />
          </Field>
        </AdminGrid>
        <Disclaimer id="login-error" role="alert" style={ERROR}>{ui.loginError ?? ''}</Disclaimer>
        <Disclaimer>
          Réservé à l’administrateur du serveur : l’atelier change la distribution pour tous les joueurs.
        </Disclaimer>
      </Panel>
      <Row>
        <Button id="b-login-back" variant="ghost" onClick={actions.loginBack}>Retour</Button>
        <Button id="b-login-go" onClick={submit} disabled={ui.adminBusy}>Se connecter</Button>
      </Row>
    </Screen>
  );
}
