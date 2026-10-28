import { Button, Panel } from '@politikart/ui';

import { actions, type GameState, type UiSnapshot } from './store';

/** The menus a friend's invitation may interrupt; never a race in progress. */
const MENUS: GameState[] = ['title', 'select', 'tracks', 'admin', 'account', 'lobby', 'results', 'dashboard'];

/**
 * A friend invites us into their room: who, which room, join or ignore.
 * Pinned to the top of the screen over whichever menu is showing; held back
 * while a race runs, and shown once it is over.
 */
export function InviteBanner({ ui }: { ui: UiSnapshot }) {
  const inv = ui.net.invite;
  if (!inv || !MENUS.includes(ui.state) || ui.net.room?.code === inv.code) return null;
  return (
    <Panel id="invite" className="invite-banner" role="alertdialog" aria-label="Invitation">
      <span id="invite-text"><strong>{inv.from.name}</strong>{' vous invite dans sa salle ' + inv.code}</span>
      <Button id="b-invite-join" onClick={actions.acceptInvite}>Rejoindre</Button>
      <Button id="b-invite-dismiss" variant="ghost" onClick={actions.dismissInvite}>Ignorer</Button>
    </Panel>
  );
}
