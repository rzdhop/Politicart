import { NoteBanner } from '@kart-republique/ui';

import { AccountScreen } from './screens/AccountScreen';
import { AdminScreen } from './screens/AdminScreen';
import { GarageScreen } from './screens/GarageScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { PauseScreen } from './screens/PauseScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SelectScreen } from './screens/SelectScreen';
import { TitleScreen } from './screens/TitleScreen';
import { TracksScreen } from './screens/TracksScreen';
import { Hud } from './Hud';
import { InviteBanner } from './InviteBanner';
import { isAdmin, useUi } from './store';
import { useTouchMode } from './TouchControls';

/**
 * The screens and the note banner, in the order the single-file game laid
 * them out, then the team-race lobby, the account screen and a friend's
 * invitation. Every screen but the admin's Workshop is always mounted and hides itself when the
 * machine is elsewhere, exactly as the original sections did with `hidden`,
 * so the E2E suite's visibility checks mean the same thing they always did.
 * The HUD sits where the original markup put it, between the circuits and the
 * pause menu; it is rendered once and then written imperatively (see Hud).
 */
export function App() {
  const ui = useUi();
  const touch = useTouchMode();
  return (
    <>
      <TitleScreen ui={ui} />
      {/* The Workshop exists only inside the admin's session; it goes with a logout or an expired token. */}
      {isAdmin(ui) && <AdminScreen ui={ui} />}
      <SelectScreen ui={ui} />
      <GarageScreen ui={ui} />
      <TracksScreen ui={ui} />
      <Hud />
      <PauseScreen ui={ui} />
      <ResultsScreen ui={ui} />
      <LobbyScreen ui={ui} />
      <AccountScreen ui={ui} />
      <InviteBanner ui={ui} />
      <NoteBanner id="note" hidden={ui.noteHidden}>
        {touch ? 'Tactile : le kart accélère tout seul, ◀ ▶ pour tourner. Jouable en paysage comme en portrait.' : 'Au clavier sur ordinateur, au doigt sur téléphone.'}
      </NoteBanner>
    </>
  );
}
