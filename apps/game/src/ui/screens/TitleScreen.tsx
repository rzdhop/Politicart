import { useState } from 'react';
import {
  CoinCount,
  ControlsGrid,
  Disclaimer,
  HeroButton,
  KeyCap,
  MenuCard,
  MenuGlyph,
  Screen,
  SettingsChip,
  Sheet,
  ShowcaseStage,
  Tagline,
  TitleLayout,
  TitleLogo,
} from '@politikart/ui';

import { CHARACTERS } from '../../engine/data.js';
import { stageDrag } from '../../engine/stageinput.js';
import { actions, isAdmin, type UiSnapshot } from '../store';
import { useTouchMode } from '../TouchControls';

const ADMIN_LABEL = {
  idle: 'Atelier (admin)',
  saved: 'Atelier (admin) · enregistré',
} as const;

/** The quips under the logo, one every few seconds (Tagline). Invented, like the rest of the satire. */
export const TAGLINES = [
  'Un seul tour, cinq adversaires, aucune cohabitation.',
  'Le premier sur la ligne forme le gouvernement.',
  'Ici, on double par la gauche comme par la droite.',
  'Un dérapage contrôlé, pour une fois.',
  'Motion de censure ? Esquivez-la au mini-turbo.',
  'Promesse de campagne : un turbo à chaque virage.',
  'La seule course où le 49.3 ne vous sauvera pas.',
] as const;

const STAGE_LABEL = 'Votre kart sur le podium de l’Hémicycle : glissez pour le faire pivoter';

const fr = (n: number) => n.toLocaleString('fr-FR');

/** Pending friend requests. */
function incoming(ui: UiSnapshot) {
  return ui.net.friends.filter(f => f.status === 'incoming').length;
}

/**
 * The title screen (DEC-070): over the hemicycle at night, where the
 * player's candidate turns on the podium (the stage draws into this
 * screen's ShowcaseStage band, game.js / preview.js), the logo and a
 * rotating quip, one huge « Jouer », then the destinations as cards
 * (Multijoueur, Boutique, Compte: game server only), the settings as
 * pills in the corner (graphics, sound, the controls' help sheet, the
 * admin's entries), and the parody notice at the bottom. Enter starts,
 * as before (game.js); the ids are the E2E suite's (DEC-009).
 */
export function TitleScreen({ ui }: { ui: UiSnapshot }) {
  const touch = useTouchMode();
  const [help, setHelp] = useState(false);
  const hidden = ui.state !== 'title';
  const chosen = (CHARACTERS as { name: string }[])[ui.charIdx] ?? CHARACTERS[0];
  const requests = incoming(ui);
  const low = ui.poly === 'low';
  const corner = (
    <div className="settings-strip" role="group" aria-label="Réglages">
      <SettingsChip id="b-poly" icon={<MenuGlyph name="graphics" />} active={!low} onClick={actions.togglePoly}>
        <span className="chip-key">Graphismes : </span>{low ? 'légers (low-poly)' : 'détaillés (ombres)'}
      </SettingsChip>
      <SettingsChip id="b-mute" icon={<MenuGlyph name={ui.muted ? 'mute' : 'sound'} />} active={!ui.muted} onClick={() => actions.toggleMute(true)}>
        {'Son : ' + (ui.muted ? 'coupé' : 'activé')}
      </SettingsChip>
      <SettingsChip id="b-help" compact icon={<MenuGlyph name="help" />} aria-haspopup="dialog" onClick={() => setHelp(true)}>Commandes</SettingsChip>
      {/* The Workshop and the dashboard are the admin's: only an account the server flags as admin sees them. */}
      {isAdmin(ui) && <SettingsChip id="b-admin" icon={<MenuGlyph name="admin" />} onClick={actions.openAdmin}>{ADMIN_LABEL[ui.adminStatus]}</SettingsChip>}
      {isAdmin(ui) && <SettingsChip id="b-dashboard" icon={<MenuGlyph name="dashboard" />} onClick={actions.openDashboard}>Tableau de bord (admin)</SettingsChip>}
    </div>
  );
  const brand = (
    <>
      <TitleLogo title="POLITIKART" subtitle="Grand Prix de l’Hémicycle" />
      <Tagline lines={TAGLINES} paused={hidden} />
    </>
  );
  const cards = ui.netAvailable && (
    <div className="menu-cards">
      <MenuCard id="b-multi" icon={<MenuGlyph name="multi" />} label="Multijoueur" sub="Entre amis" onClick={actions.multiplayer} />
      {/* The Boutique exists only where a game server runs the economy (DEC-035). */}
      <MenuCard
        id="b-shop"
        tone="gold"
        icon={<MenuGlyph name="shop" />}
        label="Boutique"
        sub={<CoinCount size="sm" value={ui.account?.profile.coins ?? 0} format={fr} />}
        onClick={() => actions.openShop('title')}
      />
      <MenuCard
        id="b-account"
        tone="red"
        icon={<MenuGlyph name="account" />}
        label="Compte"
        sub={ui.account ? ui.account.profile.name + ' · niv. ' + ui.account.profile.level : 'se connecter'}
        badge={requests ? '✉ ' + requests : undefined}
        badgeLabel={requests ? requests + (requests > 1 ? ' demandes d’ami' : ' demande d’ami') : undefined}
        onClick={actions.openAccount}
      />
    </div>
  );
  const actionsSlot = (
    <>
      <HeroButton
        id="b-play"
        icon={<MenuGlyph name="play" />}
        hint={touch ? undefined : <>ou appuyez sur <KeyCap>Entrée</KeyCap></>}
        onClick={actions.play}
      >
        Jouer
      </HeroButton>
      {cards}
    </>
  );
  return (
    <Screen id="s-title" className="title-screen" hidden={hidden}>
      <TitleLayout
        corner={corner}
        brand={brand}
        stage={<ShowcaseStage id="title-stage" aria-label={STAGE_LABEL} {...stageDrag()} />}
        stageCaption={<>Au volant : <b>{chosen?.name}</b></>}
        actions={actionsSlot}
        footer={
          <Disclaimer>
            Parodie : les candidat·es sont des caricatures, à un jeu de mots près, de personnalités politiques bien réelles. Pouvoirs, répliques et scandales sont inventés. Un seul tour, cinq adversaires, aucune cohabitation.
          </Disclaimer>
        }
      />
      <Sheet id="help-sheet" open={help && !hidden} onClose={() => setHelp(false)} title="Commandes">
        {touch ? (
          <ControlsGrid id="touch-legend">
            <div>Le kart <strong>accélère tout seul</strong></div>
            <div><KeyCap>◀</KeyCap> <KeyCap>▶</KeyCap> tourner (glissez d’un côté à l’autre)</div>
            <div><KeyCap>▼</KeyCap> freiner, reculer</div>
            <div><KeyCap>↯</KeyCap> dérapage (mini-turbo)</div>
            <div><KeyCap>Objet</KeyCap> utiliser l’objet</div>
            <div><KeyCap>★</KeyCap> pouvoir spécial · <KeyCap>❚❚</KeyCap> pause</div>
          </ControlsGrid>
        ) : (
          <ControlsGrid>
            <div><KeyCap>↑</KeyCap> / <KeyCap>Z</KeyCap> accélérer</div>
            <div><KeyCap>↓</KeyCap> / <KeyCap>S</KeyCap> freiner, reculer</div>
            <div><KeyCap>←</KeyCap> <KeyCap>→</KeyCap> / <KeyCap>Q</KeyCap> <KeyCap>D</KeyCap> tourner</div>
            <div><KeyCap>Espace</KeyCap> dérapage (mini-turbo)</div>
            <div><KeyCap>Ctrl</KeyCap> / <KeyCap>E</KeyCap> utiliser l’objet</div>
            <div><KeyCap>F</KeyCap> / <KeyCap>Maj</KeyCap> pouvoir spécial</div>
            <div><KeyCap>Échap</KeyCap> pause · <KeyCap>M</KeyCap> son</div>
          </ControlsGrid>
        )}
      </Sheet>
    </Screen>
  );
}
