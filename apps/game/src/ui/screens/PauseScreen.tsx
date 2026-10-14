import { Button, Heading, Panel, Row, Screen } from '@kart-republique/ui';

import { actions, type UiSnapshot } from '../store';

const COLUMN = { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' } as const;

/** The pause menu, over the frozen race. */
export function PauseScreen({ ui }: { ui: UiSnapshot }) {
  return (
    <Screen id="s-pause" hidden={ui.state !== 'paused'}>
      <Panel style={COLUMN}>
        <Heading>Suspension de séance</Heading>
        <Row>
          <Button id="b-resume" onClick={actions.resume}>Reprendre</Button>
          <Button id="b-quit" variant="ghost" onClick={actions.toTitle}>Quitter la course</Button>
        </Row>
      </Panel>
    </Screen>
  );
}
