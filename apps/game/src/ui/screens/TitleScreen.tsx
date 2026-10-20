import {
  Button,
  ControlsGrid,
  Disclaimer,
  GameTitle,
  KeyCap,
  Panel,
  Row,
  Screen,
  Subtitle,
  Tricolore,
} from '@kart-republique/ui';

import { actions, type UiSnapshot } from '../store';
import { useTouchMode } from '../TouchControls';

const COLUMN = { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' } as const;

const ADMIN_LABEL = {
  idle: 'Atelier (admin)',
  saved: 'Atelier (admin) · enregistré',
  full: 'Atelier (admin) · non sauvegardé (stockage plein)',
} as const;

/** Pending friend requests, as a count after the account's name. */
function friendBadge(ui: UiSnapshot) {
  const n = ui.net.friends.filter(f => f.status === 'incoming').length;
  return n ? ' · ✉ ' + n : '';
}

/** The title screen: brand, the buttons, the controls legend, the disclaimer. */
export function TitleScreen({ ui }: { ui: UiSnapshot }) {
  const touch = useTouchMode();
  return (
    <Screen id="s-title" hidden={ui.state !== 'title'}>
      <Tricolore />
      <GameTitle>KART RÉPUBLIQUE</GameTitle>
      <Subtitle>Grand Prix de l’Hémicycle</Subtitle>
      <Panel style={COLUMN}>
        <Row>
          <Button id="b-play" onClick={actions.play}>Jouer</Button>
          {ui.netAvailable && <Button id="b-multi" onClick={actions.multiplayer}>Multijoueur</Button>}
          {ui.netAvailable && (
            <Button id="b-account" variant={ui.account ? 'primary' : 'ghost'} onClick={actions.openAccount}>
              {ui.account ? ui.account.profile.name + ' · niv. ' + ui.account.profile.level + friendBadge(ui) : 'Compte · se connecter'}
            </Button>
          )}
          <Button id="b-poly" variant="ghost" onClick={actions.togglePoly}>
            {ui.poly === 'low' ? 'Graphismes : légers (low-poly)' : 'Graphismes : détaillés (ombres)'}
          </Button>
          <Button id="b-mute" variant="ghost" onClick={() => actions.toggleMute(true)}>
            {'Son : ' + (ui.muted ? 'coupé' : 'activé')}
          </Button>
          <Button id="b-admin" variant="ghost" onClick={actions.openAdmin}>{ADMIN_LABEL[ui.adminStatus]}</Button>
        </Row>
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
        <Disclaimer>
          Parodie : les candidat·es sont des caricatures, à un jeu de mots près, de personnalités politiques bien réelles. Pouvoirs, répliques et scandales sont inventés. Trois tours, cinq adversaires, aucune cohabitation.
        </Disclaimer>
      </Panel>
    </Screen>
  );
}
