import { useEffect } from 'react';
import { NoteBanner } from '@politikart/ui';

import { AccountScreen } from './screens/AccountScreen';
import { AdminScreen } from './screens/AdminScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { GarageScreen } from './screens/GarageScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { LootboxScreen } from './screens/LootboxScreen';
import { PauseScreen } from './screens/PauseScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SelectScreen } from './screens/SelectScreen';
import { ShopScreen } from './screens/ShopScreen';
import { TitleScreen } from './screens/TitleScreen';
import { TracksScreen } from './screens/TracksScreen';
import { Hud } from './Hud';
import { InviteBanner } from './InviteBanner';
import { actions, isAdmin, useUi } from './store';
import { useTouchMode } from './TouchControls';

/**
 * The screens and the note banner, in the order the single-file game laid
 * them out, then the team-race lobby, the account screen, the Boutique and
 * the Politibox, and a friend's invitation. Every screen but the admin's
 * (the Workshop, the dashboard) and the economy's (the Boutique, the
 * Politibox: game server only) is always mounted and hides itself when the
 * machine is elsewhere, exactly as the original sections did with `hidden`,
 * so the E2E suite's visibility checks mean the same thing they always did.
 * The HUD sits where the original markup put it, between the circuits and the
 * pause menu; it is rendered once and then written imperatively (see Hud).
 * The note's × closes it until the next load; the first race hides it anyway.
 */
export function App() {
  const ui = useUi();
  const touch = useTouchMode();
  useNoteRoom();
  return (
    <>
      <TitleScreen ui={ui} />
      {/* The Workshop and the dashboard exist only inside the admin's session; they go with a logout or an expired token. */}
      {isAdmin(ui) && <AdminScreen ui={ui} />}
      {isAdmin(ui) && <DashboardScreen ui={ui} />}
      <SelectScreen ui={ui} />
      <GarageScreen ui={ui} />
      <TracksScreen ui={ui} />
      <Hud />
      <PauseScreen ui={ui} />
      <ResultsScreen ui={ui} />
      <LobbyScreen ui={ui} />
      <AccountScreen ui={ui} />
      {/* The Boutique and the Politibox exist only where a game server runs the economy (DEC-035). */}
      {ui.netAvailable && <ShopScreen ui={ui} />}
      {ui.netAvailable && <LootboxScreen ui={ui} />}
      <InviteBanner ui={ui} />
      <NoteBanner id="note" hidden={ui.noteHidden}>
        <span>{touch ? 'Tactile : le kart accélère tout seul, ◀ ▶ pour tourner. Jouable en paysage comme en portrait.' : 'Au clavier sur ordinateur, au doigt sur téléphone.'}</span>
        {/* Enter and Space stay with the button: game.js reads Enter on the title and the roster as "Jouer" and "Choisir le circuit". */}
        <button type="button" id="note-close" className="note-close" aria-label="Masquer la note" onClick={actions.hideNote} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>×</button>
      </NoteBanner>
    </>
  );
}

/**
 * Keep the screens' reserve for the note (game.css, --note-room) at the
 * note's measured height: its copy wraps to one, two or three lines with the
 * width, the touch mode and the font. The stylesheet's values cover the first
 * paint, and jsdom, which has no ResizeObserver.
 */
function useNoteRoom() {
  useEffect(() => {
    const note = document.getElementById('note');
    if (!note || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (!note.hidden) document.body.style.setProperty('--note-h', note.getBoundingClientRect().height + 'px'); });
    ro.observe(note);
    return () => ro.disconnect();
  }, []);
}
