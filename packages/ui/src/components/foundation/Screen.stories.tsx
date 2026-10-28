import type { Meta, StoryObj } from '@storybook/react-vite';

import { Tricolore } from '../brand/Tricolore';
import { Button } from '../controls/Button';
import { ControlsGrid } from '../controls/ControlsGrid';
import { KeyCap } from '../controls/KeyCap';
import { Disclaimer } from '../typography/Disclaimer';
import { GameTitle } from '../typography/GameTitle';
import { Subtitle } from '../typography/Subtitle';
import { CONTROLS } from '../../stories/fixtures';
import { Panel } from './Panel';
import { Row } from './Row';
import { Screen } from './Screen';

const meta = {
  title: 'Foundation/Screen',
  component: Screen,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A full-screen overlay: one of the game’s menus, stacked above the WebGL canvas. Fixed to all four edges, centred, scrollable when its content is taller than the viewport, and padded clear of the device safe areas.',
      },
    },
  },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The title screen, which is the system's fullest composition. */
export const TitleScreen: Story = {
  args: {
    children: (
      <>
        <Tricolore />
        <GameTitle>POLITIKAR</GameTitle>
        <Subtitle>Grand Prix de l’Hémicycle</Subtitle>
        <Panel style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          <Row>
            <Button>Jouer</Button>
            <Button variant="ghost">Atelier (admin)</Button>
          </Row>
          <ControlsGrid>
            {CONTROLS.map(([keys, action]) => (
              <div key={action}>
                {keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 ? ' / ' : null}
                    <KeyCap>{k}</KeyCap>
                  </span>
                ))}{' '}
                {action}
              </div>
            ))}
          </ControlsGrid>
          <Disclaimer>
            Toute ressemblance avec des personnalités existantes serait purement électorale.
            Personnages, partis et scandales sont fictifs.
          </Disclaimer>
        </Panel>
      </>
    ),
  },
};
