import { useEffect, useSyncExternalStore } from 'react';
import {
  Button,
  CharacterTile,
  ControlsGrid,
  Disclaimer,
  Heading,
  KeyCap,
  PowerBox,
  Roster,
  Row,
  Screen,
  SelectLayout,
  Showcase,
  ShowcaseStage,
  StatBar,
  StatGrid,
  Tricolore,
} from '@politikart/ui';

import { initAudio } from '../../engine/audio.js';
import { CHARACTERS } from '../../engine/data.js';
import { unlockLevel } from '../../engine/progress.js';
import { setPreviewFrame } from '../../engine/preview.js';
import { stageDrag } from '../../engine/stageinput.js';
import { actions, unlockedOf, type UiSnapshot } from '../store';
import { useTouchMode } from '../TouchControls';
import type { Character } from '../types';

const STATS = [
  ['speed', 'Vitesse'],
  ['accel', 'Accélération'],
  ['handling', 'Tenue de route'],
] as const;

/** Stats run from 0.6 to 1.2 in the data; the bar shows that span as 0 to 100 %. */
const fraction = (stat: number) => (stat - 0.6) / 0.6;

/** What the podium band says to assistive technology (it is announced as an image). */
export const STAGE_LABEL = 'Le podium : glissez pour le faire pivoter';

/**
 * Where the stage draws the podium, on every layout: the rect of the visible
 * screen's ShowcaseStage band, above the candidate's name (engine/preview.js
 * fits the podium and the pilot into it, so they never cover the showcase
 * text). The roster and the Garage share the stage, and both screens stay
 * mounted, so this one frame function serves whichever is shown.
 */
export function stageBand() {
  const el = document.querySelector('section.screen:not([hidden]) .showcase-stage');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/**
 * Wide enough for the design's layout (Q9): the button row under the roster,
 * in the left column. Phones, upright or sideways, keep it at the bottom of
 * the screen. Without matchMedia (the tests), wide.
 */
const WIDE = '(min-width: 761px) and (min-height: 521px)';
const wideQuery = () => (typeof matchMedia === 'function' ? matchMedia(WIDE) : null);
const onWide = (cb: () => void) => {
  const q = wideQuery();
  q?.addEventListener?.('change', cb);
  return () => q?.removeEventListener?.('change', cb);
};
const isWide = () => wideQuery()?.matches ?? true;
const useWide = () => useSyncExternalStore(onWide, isWide, isWide);

/**
 * The roster of candidates and the showcase of the chosen one, on the stage:
 * the tricolore over the heading, the podium in the showcase's band (dragged
 * to turn it), and on wide screens the button row and the key legend under
 * the tiles. Each tile shows a placeholder until its portrait is rendered
 * (`pending`, `data-portrait`).
 */
export function SelectScreen({ ui }: { ui: UiSnapshot }) {
  const touch = useTouchMode();
  const wide = useWide();
  useEffect(() => { setPreviewFrame(stageBand); return () => setPreviewFrame(null); }, []);
  const characters = CHARACTERS as unknown as Character[];
  const chosen = characters[ui.charIdx] ?? characters[0]!;
  const unlocked = unlockedOf(ui);
  const buttons = (
    <Row>
      <Button id="b-back1" variant="ghost" onClick={actions.toTitle}>Retour</Button>
      <Button id="b-garage" variant="ghost" onClick={actions.openGarage}>Garage</Button>
      <Button id="b-next1" onClick={actions.toTracks}>Choisir le circuit →</Button>
    </Row>
  );
  const hint = <Disclaimer className="stage-hint">Glissez sur la scène pour faire pivoter le podium.</Disclaimer>;
  return (
    <Screen id="s-select" hidden={ui.state !== 'select'}>
      <div className="select-head">
        <Tricolore />
        <Heading size="screen">Choisissez votre candidat·e</Heading>
      </div>
      <SelectLayout>
        <Roster
          id="roster"
          footer={wide && (
            <>
              {buttons}
              {touch ? null : (
                <ControlsGrid className="key-legend">
                  <div><KeyCap>←</KeyCap> <KeyCap>→</KeyCap> <KeyCap>↑</KeyCap> <KeyCap>↓</KeyCap> choisir · <KeyCap>Entrée</KeyCap> valider</div>
                </ControlsGrid>
              )}
              {hint}
            </>
          )}
        >
          {characters.map((c, i) => {
            const locked = !unlocked.includes(c.id);
            // On a game server a locked tile opens the Boutique on the candidates; elsewhere it does nothing.
            const shop = locked && ui.netAvailable;
            const reachable = !!ui.account?.profile.reachable?.includes(c.id);
            const lock = !ui.account ? 'Compte requis' : reachable ? 'Boutique' : 'Niveau ' + unlockLevel(c.id);
            const why = !ui.account ? 'Créez un compte et montez de niveau pour le débloquer'
              : reachable ? 'À acheter dans la Boutique' : 'En vente dans la Boutique dès le niveau ' + unlockLevel(c.id);
            const ready = !!ui.thumbsReady[c.id];
            return (
              <CharacterTile
                key={c.id}
                name={c.name}
                image={ui.thumbs[c.id]}
                pending={!ready}
                data-portrait={ready ? 'ready' : 'pending'}
                selected={i === ui.charIdx}
                className={locked ? (shop ? 'locked to-shop' : 'locked') : undefined}
                aria-disabled={locked && !shop ? true : undefined}
                data-lock={locked ? '🔒 ' + lock : undefined}
                title={locked ? why : undefined}
                onClick={() => {
                  initAudio();
                  if (!locked) actions.selectChar(i);
                  else if (shop) actions.openShop('select', 'chars');
                }}
              />
            );
          })}
        </Roster>
        <Showcase
          id="showcase"
          name={chosen.name}
          title={chosen.title}
          quote={chosen.quote}
          stage={<ShowcaseStage id="showcase-stage" aria-label={STAGE_LABEL} {...stageDrag()} />}
        >
          <StatGrid>
            {STATS.map(([key, label]) => (
              <StatBar key={key} label={label} value={fraction(chosen.stats[key])} />
            ))}
          </StatGrid>
          <PowerBox name={'Pouvoir : ' + chosen.power.name} hint={touch ? '(bouton ★)' : '(touche F)'}>{chosen.power.desc}</PowerBox>
        </Showcase>
      </SelectLayout>
      {wide ? null : <>{buttons}{hint}</>}
    </Screen>
  );
}
