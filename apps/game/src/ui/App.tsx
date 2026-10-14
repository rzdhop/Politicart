import { NoteBanner } from '@kart-republique/ui';

import { AdminScreen } from './screens/AdminScreen';
import { PauseScreen } from './screens/PauseScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SelectScreen } from './screens/SelectScreen';
import { TitleScreen } from './screens/TitleScreen';
import { TracksScreen } from './screens/TracksScreen';
import { useUi } from './store';

/**
 * The six screens and the note banner, in the order the single-file game
 * laid them out. Every screen is always mounted and hides itself when the
 * machine is elsewhere, exactly as the original sections did with `hidden`,
 * so the E2E suite's visibility checks mean the same thing they always did.
 * The HUD is not here: it is driven imperatively from game.js (stage 13).
 */
export function App() {
  const ui = useUi();
  return (
    <>
      <TitleScreen ui={ui} />
      <AdminScreen ui={ui} />
      <SelectScreen ui={ui} />
      <TracksScreen ui={ui} />
      <PauseScreen ui={ui} />
      <ResultsScreen ui={ui} />
      <NoteBanner id="note" hidden={ui.noteHidden}>Jeu au clavier : ouvrez-le sur un ordinateur.</NoteBanner>
    </>
  );
}
