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

const COLUMN = { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' } as const;

const ADMIN_LABEL = {
  idle: 'Atelier (admin)',
  saved: 'Atelier (admin) · enregistré',
  full: 'Atelier (admin) · non sauvegardé (stockage plein)',
} as const;

/** The title screen: brand, the four buttons, the controls legend, the disclaimer. */
export function TitleScreen({ ui }: { ui: UiSnapshot }) {
  return (
    <Screen id="s-title" hidden={ui.state !== 'title'}>
      <Tricolore />
      <GameTitle>KART RÉPUBLIQUE</GameTitle>
      <Subtitle>Grand Prix de l’Hémicycle</Subtitle>
      <Panel style={COLUMN}>
        <Row>
          <Button id="b-play" onClick={actions.play}>Jouer</Button>
          {ui.netAvailable && <Button id="b-multi" onClick={actions.multiplayer}>Multijoueur</Button>}
          <Button id="b-poly" variant="ghost" onClick={actions.togglePoly}>
            {ui.poly === 'low' ? 'Graphismes : légers (low-poly)' : 'Graphismes : détaillés (ombres)'}
          </Button>
          <Button id="b-mute" variant="ghost" onClick={() => actions.toggleMute(true)}>
            {'Son : ' + (ui.muted ? 'coupé' : 'activé')}
          </Button>
          <Button id="b-admin" variant="ghost" onClick={actions.openAdmin}>{ADMIN_LABEL[ui.adminStatus]}</Button>
        </Row>
        <ControlsGrid>
          <div><KeyCap>↑</KeyCap> / <KeyCap>Z</KeyCap> accélérer</div>
          <div><KeyCap>↓</KeyCap> / <KeyCap>S</KeyCap> freiner, reculer</div>
          <div><KeyCap>←</KeyCap> <KeyCap>→</KeyCap> / <KeyCap>Q</KeyCap> <KeyCap>D</KeyCap> tourner</div>
          <div><KeyCap>Espace</KeyCap> dérapage (mini-turbo)</div>
          <div><KeyCap>Ctrl</KeyCap> / <KeyCap>E</KeyCap> utiliser l’objet</div>
          <div><KeyCap>F</KeyCap> / <KeyCap>Maj</KeyCap> pouvoir spécial</div>
          <div><KeyCap>Échap</KeyCap> pause · <KeyCap>M</KeyCap> son</div>
        </ControlsGrid>
        <Disclaimer>
          Parodie : les candidat·es sont des caricatures, à un jeu de mots près, de personnalités politiques bien réelles. Pouvoirs, répliques et scandales sont inventés. Trois tours, cinq adversaires, aucune cohabitation.
        </Disclaimer>
      </Panel>
    </Screen>
  );
}
